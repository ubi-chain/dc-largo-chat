import { createServerFn } from "@tanstack/react-start";

const KEY_RE = /^[a-f0-9]{32}$/;
const ROOM_RE = /^(street|link:[a-f0-9]{12}|code:[a-f0-9]{16})$/;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

type RoomKind = "street" | "link" | "code";

export type RoomInfo = {
  id: string;
  kind: RoomKind;
  label: string;
  code: string | null;
};

export type ChatLine = {
  id: number;
  nick: string;
  body: string;
  at: string;
  mine: boolean;
  system: boolean;
};

export type Person = { nick: string; mine: boolean };

export type QuestionCard = {
  id: number;
  title: string;
  tag: string;
  nick: string;
  preview: string;
  replies: number;
  at: string;
  mine: boolean;
};

export type AnswerLine = {
  id: number;
  nick: string;
  body: string;
  at: string;
  mine: boolean;
};

type Sql = Awaited<ReturnType<typeof import("@/lib/db").getSql>>;

async function db(): Promise<Sql> {
  const { getSql } = await import("@/lib/db");
  return getSql();
}

async function sha(text: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(text).digest("hex");
}

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function assertKey(authorKey: string) {
  if (!KEY_RE.test(authorKey)) throw new Error("端末の鍵が壊れている。読み込み直して。");
}

function cleanNick(raw: string): string {
  const nick = raw.trim().toLowerCase();
  if (!/^largo-\d{1,6}$/.test(nick)) throw new Error("名前は largo-番号。");
  return nick;
}

function assertRoom(roomId: string) {
  if (!ROOM_RE.test(roomId)) throw new Error("部屋が見つからない。");
}

function publicCodeFromHex(hex: string): string {
  let n = Number.parseInt(hex.slice(0, 8), 16);
  let out = "";
  for (let i = 0; i < 4; i += 1) {
    out += CODE_ALPHABET[n % CODE_ALPHABET.length] ?? "A";
    n = Math.floor(n / CODE_ALPHABET.length);
  }
  return `${out.slice(0, 2)}-${out.slice(2)}`;
}

function asObject(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object") throw new Error("入力が足りない。");
  return input as Record<string, unknown>;
}

function readString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string") throw new Error("入力が足りない。");
  return value;
}

async function callerIp(): Promise<string> {
  const { getRequestIP } = await import("@tanstack/react-start/server");
  const ip = getRequestIP({ xForwardedFor: true });
  return ip && ip.trim() ? ip.trim() : "local";
}

async function requireRoom(sql: Sql, roomId: string): Promise<RoomInfo> {
  assertRoom(roomId);
  const rows = await sql<{ id: string; kind: string; label: string; public_code: string | null }>`
    select id, kind, label, public_code from rooms where id = ${roomId} limit 1
  `;
  const row = rows[0];
  if (!row) throw new Error("その部屋はまだ開いていない。");
  const kind: RoomKind = row.kind === "street" || row.kind === "link" || row.kind === "code" ? row.kind : "code";
  return { id: row.id, kind, label: row.label, code: row.public_code };
}

export const locateLink = createServerFn({ method: "POST" }).handler(async (): Promise<RoomInfo> => {
  const sql = await db();
  const ip = await callerIp();
  const hex = await sha(`comb-link-v1|${ip}`);
  const id = `link:${hex.slice(0, 12)}`;
  const code = publicCodeFromHex(hex);
  await sql`
    insert into rooms (id, kind, label, public_code)
    values (${id}, 'link', ${code}, ${code})
    on conflict (id) do update set label = excluded.label, public_code = excluded.public_code
  `;
  return { id, kind: "link", label: code, code };
});

export const joinPhrase = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const phrase = readString(asObject(input), "phrase");
    return { phrase };
  })
  .handler(async ({ data }): Promise<RoomInfo> => {
    const sql = await db();
    const trimmed = data.phrase.trim();
    if (!trimmed) throw new Error("合い言葉が空。");
    const compact = trimmed.replace(/[-\s]/g, "").toUpperCase();
    if (new RegExp(`^[${CODE_ALPHABET}]{4}$`).test(compact)) {
      const code = `${compact.slice(0, 2)}-${compact.slice(2)}`;
      const rows = await sql<{ id: string; kind: string; label: string; public_code: string | null }>`
        select id, kind, label, public_code from rooms where public_code = ${code} limit 1
      `;
      const row = rows[0];
      if (!row) throw new Error("その符号の部屋はまだ開いていない。");
      const kind: RoomKind =
        row.kind === "street" || row.kind === "link" || row.kind === "code" ? row.kind : "code";
      return { id: row.id, kind, label: row.label, code: row.public_code };
    }
    const phrase = trimmed.normalize("NFKC").replace(/\s+/g, " ").trim();
    if (phrase.length < 2 || phrase.length > 16) throw new Error("合い言葉は2〜16字。");
    const hex = await sha(`comb-code-v1|${phrase.toLowerCase()}`);
    const id = `code:${hex.slice(0, 16)}`;
    await sql`
      insert into rooms (id, kind, label, public_code)
      values (${id}, 'code', ${phrase}, ${phrase})
      on conflict (id) do nothing
    `;
    return { id, kind: "code", label: phrase, code: phrase };
  });

export const syncRoom = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = asObject(input);
    const roomId = readString(obj, "roomId");
    const authorKey = readString(obj, "authorKey");
    const nick = readString(obj, "nick");
    const afterRaw = obj.afterId;
    const afterId = typeof afterRaw === "number" && Number.isFinite(afterRaw) ? Math.max(0, Math.floor(afterRaw)) : 0;
    return { roomId, authorKey, nick, afterId };
  })
  .handler(async ({ data }): Promise<{ messages: ChatLine[]; people: Person[]; room: RoomInfo }> => {
    assertKey(data.authorKey);
    const nick = cleanNick(data.nick);
    const sql = await db();
    const room = await requireRoom(sql, data.roomId);
    await sql`
      insert into presence (room_id, author_key, nick, seen_at)
      values (${room.id}, ${data.authorKey}, ${nick}, now())
      on conflict (room_id, author_key) do update set nick = excluded.nick, seen_at = now()
    `;
    const messageRows =
      data.afterId === 0
        ? await sql<{ id: number | string; nick: string; body: string; created_at: unknown; author_key: string }>`
            select id, nick, body, created_at, author_key from (
              select id, nick, body, created_at, author_key
              from messages
              where room_id = ${room.id}
              order by id desc
              limit 80
            ) recent
            order by id asc
          `
        : await sql<{ id: number | string; nick: string; body: string; created_at: unknown; author_key: string }>`
            select id, nick, body, created_at, author_key
            from messages
            where room_id = ${room.id} and id > ${data.afterId}
            order by id asc
            limit 100
          `;
    const peopleRows = await sql<{ nick: string; author_key: string }>`
      select nick, author_key
      from presence
      where room_id = ${room.id} and seen_at > now() - interval '20 seconds'
      order by seen_at desc
    `;
    return {
      room,
      messages: messageRows.map((row) => ({
        id: Number(row.id),
        nick: row.nick,
        body: row.body,
        at: iso(row.created_at),
        mine: row.author_key === data.authorKey,
        system: row.author_key === "system",
      })),
      people: peopleRows.map((row) => ({
        nick: row.nick,
        mine: row.author_key === data.authorKey,
      })),
    };
  });

async function recentCount(sql: Sql, table: "messages" | "questions" | "answers", authorKey: string) {
  const rows =
    table === "messages"
      ? await sql<{ n: number }>`
          select count(*)::int as n from messages
          where author_key = ${authorKey} and created_at > now() - interval '10 seconds'
        `
      : table === "questions"
        ? await sql<{ n: number }>`
            select count(*)::int as n from questions
            where author_key = ${authorKey} and created_at > now() - interval '30 seconds'
          `
        : await sql<{ n: number }>`
            select count(*)::int as n from answers
            where author_key = ${authorKey} and created_at > now() - interval '15 seconds'
          `;
  return Number(rows[0]?.n ?? 0);
}

export const postMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = asObject(input);
    return {
      roomId: readString(obj, "roomId"),
      authorKey: readString(obj, "authorKey"),
      nick: readString(obj, "nick"),
      body: readString(obj, "body"),
    };
  })
  .handler(async ({ data }): Promise<ChatLine> => {
    assertKey(data.authorKey);
    const nick = cleanNick(data.nick);
    const body = data.body.replace(/\r\n/g, "\n").trim();
    if (body.length < 1 || body.length > 500) throw new Error("一行は1〜500字。");
    const sql = await db();
    const room = await requireRoom(sql, data.roomId);
    if ((await recentCount(sql, "messages", data.authorKey)) >= 6) {
      throw new Error("少し速い。息を吐いてから。");
    }
    const rows = await sql<{ id: number | string; created_at: unknown }>`
      insert into messages (room_id, author_key, nick, body)
      values (${room.id}, ${data.authorKey}, ${nick}, ${body})
      returning id, created_at
    `;
    const row = rows[0];
    if (!row) throw new Error("送れなかった。");
    return {
      id: Number(row.id),
      nick,
      body,
      at: iso(row.created_at),
      mine: true,
      system: false,
    };
  });

export const removeMessage = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = asObject(input);
    const id = obj.id;
    return {
      roomId: readString(obj, "roomId"),
      authorKey: readString(obj, "authorKey"),
      id: typeof id === "number" ? id : Number.NaN,
    };
  })
  .handler(async ({ data }): Promise<{ id: number }> => {
    assertKey(data.authorKey);
    if (!Number.isFinite(data.id)) throw new Error("消せなかった。");
    const sql = await db();
    const room = await requireRoom(sql, data.roomId);
    const rows = await sql<{ id: number | string }>`
      delete from messages
      where id = ${data.id} and room_id = ${room.id} and author_key = ${data.authorKey}
      returning id
    `;
    if (!rows[0]) throw new Error("自分の行だけ消せる。");
    return { id: Number(rows[0].id) };
  });

export const listQuestions = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = asObject(input);
    return { roomId: readString(obj, "roomId"), authorKey: readString(obj, "authorKey") };
  })
  .handler(async ({ data }): Promise<QuestionCard[]> => {
    assertKey(data.authorKey);
    const sql = await db();
    const room = await requireRoom(sql, data.roomId);
    const rows = await sql<{
      id: number | string;
      title: string;
      tag: string;
      nick: string;
      body: string;
      created_at: unknown;
      author_key: string;
      replies: number | string;
    }>`
      select q.id, q.title, q.tag, q.nick, q.body, q.created_at, q.author_key,
        (select count(*)::int from answers a where a.question_id = q.id) as replies
      from questions q
      where q.room_id = ${room.id}
      order by q.id desc
      limit 40
    `;
    return rows.map((row) => ({
      id: Number(row.id),
      title: row.title,
      tag: row.tag,
      nick: row.nick,
      preview: row.body.replace(/\s+/g, " ").slice(0, 96),
      replies: Number(row.replies),
      at: iso(row.created_at),
      mine: row.author_key === data.authorKey,
    }));
  });

export const getQuestion = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = asObject(input);
    const id = obj.id;
    return {
      roomId: readString(obj, "roomId"),
      authorKey: readString(obj, "authorKey"),
      id: typeof id === "number" ? id : Number.NaN,
    };
  })
  .handler(
    async ({
      data,
    }): Promise<{
      id: number;
      title: string;
      tag: string;
      nick: string;
      body: string;
      at: string;
      mine: boolean;
      answers: AnswerLine[];
    }> => {
      assertKey(data.authorKey);
      if (!Number.isFinite(data.id)) throw new Error("質問が見つからない。");
      const sql = await db();
      const room = await requireRoom(sql, data.roomId);
      const rows = await sql<{
        id: number | string;
        title: string;
        tag: string;
        nick: string;
        body: string;
        created_at: unknown;
        author_key: string;
      }>`
        select id, title, tag, nick, body, created_at, author_key
        from questions
        where id = ${data.id} and room_id = ${room.id}
        limit 1
      `;
      const row = rows[0];
      if (!row) throw new Error("質問が見つからない。");
      const answers = await sql<{
        id: number | string;
        nick: string;
        body: string;
        created_at: unknown;
        author_key: string;
      }>`
        select id, nick, body, created_at, author_key
        from answers
        where question_id = ${data.id}
        order by id asc
      `;
      return {
        id: Number(row.id),
        title: row.title,
        tag: row.tag,
        nick: row.nick,
        body: row.body,
        at: iso(row.created_at),
        mine: row.author_key === data.authorKey,
        answers: answers.map((answer) => ({
          id: Number(answer.id),
          nick: answer.nick,
          body: answer.body,
          at: iso(answer.created_at),
          mine: answer.author_key === data.authorKey,
        })),
      };
    },
  );

function cleanTag(raw: string): string {
  const tag = raw.trim().replace(/^#/, "").replace(/\s+/g, "");
  if (!tag) return "メモ";
  if (tag.length > 16) throw new Error("タグは16字まで。");
  return tag;
}

export const postQuestion = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = asObject(input);
    return {
      roomId: readString(obj, "roomId"),
      authorKey: readString(obj, "authorKey"),
      nick: readString(obj, "nick"),
      title: readString(obj, "title"),
      tag: readString(obj, "tag"),
      body: readString(obj, "body"),
    };
  })
  .handler(async ({ data }): Promise<{ id: number }> => {
    assertKey(data.authorKey);
    const nick = cleanNick(data.nick);
    const title = data.title.replace(/\s+/g, " ").trim();
    const body = data.body.replace(/\r\n/g, "\n").trim();
    const tag = cleanTag(data.tag);
    if (title.length < 1 || title.length > 80) throw new Error("タイトルは1〜80字。");
    if (body.length < 1 || body.length > 4000) throw new Error("本文は1〜4000字。");
    const sql = await db();
    const room = await requireRoom(sql, data.roomId);
    if ((await recentCount(sql, "questions", data.authorKey)) >= 3) {
      throw new Error("質問が続きすぎ。少し置いて。");
    }
    const rows = await sql<{ id: number | string }>`
      insert into questions (room_id, author_key, nick, title, tag, body)
      values (${room.id}, ${data.authorKey}, ${nick}, ${title}, ${tag}, ${body})
      returning id
    `;
    const row = rows[0];
    if (!row) throw new Error("置けなかった。");
    return { id: Number(row.id) };
  });

export const postAnswer = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = asObject(input);
    const id = obj.questionId;
    return {
      roomId: readString(obj, "roomId"),
      authorKey: readString(obj, "authorKey"),
      nick: readString(obj, "nick"),
      body: readString(obj, "body"),
      questionId: typeof id === "number" ? id : Number.NaN,
    };
  })
  .handler(async ({ data }): Promise<AnswerLine> => {
    assertKey(data.authorKey);
    const nick = cleanNick(data.nick);
    const body = data.body.replace(/\r\n/g, "\n").trim();
    if (!Number.isFinite(data.questionId)) throw new Error("質問が見つからない。");
    if (body.length < 1 || body.length > 2000) throw new Error("返信は1〜2000字。");
    const sql = await db();
    const room = await requireRoom(sql, data.roomId);
    const found = await sql<{ id: number | string }>`
      select id from questions where id = ${data.questionId} and room_id = ${room.id} limit 1
    `;
    if (!found[0]) throw new Error("質問が見つからない。");
    if ((await recentCount(sql, "answers", data.authorKey)) >= 6) {
      throw new Error("少し速い。息を吐いてから。");
    }
    const rows = await sql<{ id: number | string; created_at: unknown }>`
      insert into answers (question_id, author_key, nick, body)
      values (${data.questionId}, ${data.authorKey}, ${nick}, ${body})
      returning id, created_at
    `;
    const row = rows[0];
    if (!row) throw new Error("送れなかった。");
    return { id: Number(row.id), nick, body, at: iso(row.created_at), mine: true };
  });

export const removeQuestion = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const obj = asObject(input);
    const id = obj.id;
    return {
      roomId: readString(obj, "roomId"),
      authorKey: readString(obj, "authorKey"),
      id: typeof id === "number" ? id : Number.NaN,
    };
  })
  .handler(async ({ data }): Promise<{ id: number }> => {
    assertKey(data.authorKey);
    if (!Number.isFinite(data.id)) throw new Error("消せなかった。");
    const sql = await db();
    const room = await requireRoom(sql, data.roomId);
    const owned = await sql<{ id: number | string }>`
      select id from questions
      where id = ${data.id} and room_id = ${room.id} and author_key = ${data.authorKey}
      limit 1
    `;
    if (!owned[0]) throw new Error("自分の質問だけ消せる。");
    await sql`delete from answers where question_id = ${data.id}`;
    await sql`
      delete from questions
      where id = ${data.id} and room_id = ${room.id} and author_key = ${data.authorKey}
    `;
    return { id: data.id };
  });

export const streetRoom = (): RoomInfo => ({
  id: "street",
  kind: "street",
  label: "大通り",
  code: null,
});
