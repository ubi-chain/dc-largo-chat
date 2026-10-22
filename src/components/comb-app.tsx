import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Radio, ScrollText, Send, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getQuestion,
  joinPhrase,
  listQuestions,
  locateLink,
  postAnswer,
  postMessage,
  postQuestion,
  removeMessage,
  removeQuestion,
  streetRoom,
  syncRoom,
  type AnswerLine,
  type ChatLine,
  type Person,
  type QuestionCard,
  type RoomInfo,
} from "@/lib/hive.functions";
import { HoneyField } from "@/components/honey-load";
import { loadIdentity, NICK_CLASS, nickTone, normalizeNick, saveIdentity, type Identity } from "@/lib/identity";

const RULES = [
  {
    title: "名前",
    body: "アカウントは作らない。名前は largo-番号。この端末に残る。",
  },
  {
    title: "この回線",
    body: "ブラウザはWi-Fiの名前を読めない。外から見える住所が同じ人を、一つの部屋に入れる。家や会社のルーターの内側なら、だいたい同じ部屋になる。",
  },
  {
    title: "ずれ",
    body: "スマホのキャリア回線は、知らない人と住所を共有していることがある。合わなければ合い言葉。符号（AB-2K）を渡せば、別の回線からも入れる。",
  },
  {
    title: "大通り",
    body: "誰でも入れる公開のログ。部屋をまたがない。",
  },
  {
    title: "質問",
    body: "その部屋の中だけ。タイトル、タグ一つ、本文、返信。ストックもランキングもまだない。",
  },
  {
    title: "消す",
    body: "自分の行だけ。まとめて消すことはできない。",
  },
] as const;

function clock(at: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Tokyo",
    hourCycle: "h23",
  }).format(new Date(at));
}

function errText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "つながらなかった。もう一度。";
}

function mergeLines(prev: ChatLine[], next: ChatLine[]): ChatLine[] {
  if (next.length === 0) return prev;
  const seen = new Set(prev.map((line) => line.id));
  const extra = next.filter((line) => !seen.has(line.id));
  return extra.length ? [...prev, ...extra] : prev;
}

export function CombApp() {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [linkRoom, setLinkRoom] = useState<RoomInfo | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [pane, setPane] = useState<"chat" | "ask">("chat");
  const [specOpen, setSpecOpen] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatLine[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [questions, setQuestions] = useState<QuestionCard[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [detail, setDetail] = useState<{
    id: number;
    title: string;
    tag: string;
    nick: string;
    body: string;
    at: string;
    mine: boolean;
    answers: AnswerLine[];
  } | null>(null);
  const [asking, setAsking] = useState(false);
  const [qTitle, setQTitle] = useState("");
  const [qTag, setQTag] = useState("");
  const [qBody, setQBody] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [nickDraft, setNickDraft] = useState("");
  const [editingNick, setEditingNick] = useState(false);

  const nickRef = useRef("");
  const keyRef = useRef("");
  const roomIdRef = useRef("");
  const cursorRef = useRef(0);
  const logRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);

  useEffect(() => {
    const idn = loadIdentity();
    setIdentity(idn);
    setNickDraft(idn.nick);
    nickRef.current = idn.nick;
    keyRef.current = idn.authorKey;
    let stop = false;
    locateLink()
      .then((found) => {
        if (stop) return;
        setLinkRoom(found);
        setRoom(found);
      })
      .catch((error: unknown) => setNotice(errText(error)));
    return () => {
      stop = true;
    };
  }, []);

  useEffect(() => {
    if (!room || !identity) return;
    roomIdRef.current = room.id;
    cursorRef.current = 0;
    setMessages([]);
    setOpenId(null);
    setDetail(null);
    let stop = false;
    let timer = 0;
    let ticks = 0;
    const tick = async () => {
      const full = ticks % 8 === 0;
      ticks += 1;
      try {
        const res = await syncRoom({
          data: {
            roomId: room.id,
            authorKey: keyRef.current,
            nick: nickRef.current,
            afterId: full ? 0 : cursorRef.current,
          },
        });
        if (stop || roomIdRef.current !== room.id) return;
        setPeople(res.people);
        if (full) {
          setMessages(res.messages);
          cursorRef.current = res.messages.at(-1)?.id ?? 0;
        } else if (res.messages.length) {
          setMessages((prev) => mergeLines(prev, res.messages));
          cursorRef.current = res.messages.at(-1)?.id ?? cursorRef.current;
        }
        setNotice("");
      } catch (error: unknown) {
        if (!stop) setNotice(errText(error));
      }
      if (!stop) timer = window.setTimeout(tick, 2200);
    };
    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [room?.id, identity?.authorKey]);

  useEffect(() => {
    if (!room || !identity || pane !== "ask") return;
    let stop = false;
    const load = async () => {
      try {
        const cards = await listQuestions({
          data: { roomId: room.id, authorKey: identity.authorKey },
        });
        if (!stop) setQuestions(cards);
      } catch (error: unknown) {
        if (!stop) setNotice(errText(error));
      }
    };
    void load();
    const timer = window.setInterval(load, 4000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [room, identity, pane]);

  useEffect(() => {
    const el = logRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, pane]);

  useEffect(() => {
    if (!room || !identity || openId === null) return;
    let stop = false;
    const load = async () => {
      try {
        const next = await getQuestion({
          data: { roomId: room.id, authorKey: identity.authorKey, id: openId },
        });
        if (!stop) setDetail(next);
      } catch (error: unknown) {
        if (!stop) setNotice(errText(error));
      }
    };
    void load();
    const timer = window.setInterval(load, 3000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [room, identity, openId]);

  function commitNick(nextRaw: string) {
    if (!identity) return;
    const next = normalizeNick(nextRaw);
    if (!next) {
      setNickDraft(identity.nick);
      setEditingNick(false);
      return;
    }
    const updated = { ...identity, nick: next };
    saveIdentity(updated);
    nickRef.current = next;
    setIdentity(updated);
    setNickDraft(next);
    setEditingNick(false);
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    if (!room || !identity || busy) return;
    const body = draft.trim();
    if (!body) return;
    setBusy(true);
    try {
      const line = await postMessage({
        data: { roomId: room.id, authorKey: identity.authorKey, nick: identity.nick, body },
      });
      setMessages((prev) => mergeLines(prev, [line]));
      cursorRef.current = Math.max(cursorRef.current, line.id);
      setDraft("");
      stickRef.current = true;
      setNotice("");
    } catch (error: unknown) {
      setNotice(errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteLine(id: number) {
    if (!room || !identity) return;
    try {
      await removeMessage({ data: { roomId: room.id, authorKey: identity.authorKey, id } });
      setMessages((prev) => prev.filter((line) => line.id !== id));
    } catch (error: unknown) {
      setNotice(errText(error));
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault();
    if (!phrase.trim()) return;
    setBusy(true);
    try {
      const next = await joinPhrase({ data: { phrase } });
      setRoom(next);
      setPhrase("");
      setNotice("");
      setPane("chat");
    } catch (error: unknown) {
      setNotice(errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function onAsk(event: FormEvent) {
    event.preventDefault();
    if (!room || !identity || busy) return;
    setBusy(true);
    try {
      const created = await postQuestion({
        data: {
          roomId: room.id,
          authorKey: identity.authorKey,
          nick: identity.nick,
          title: qTitle,
          tag: qTag,
          body: qBody,
        },
      });
      setQTitle("");
      setQTag("");
      setQBody("");
      setAsking(false);
      setOpenId(created.id);
      setNotice("");
    } catch (error: unknown) {
      setNotice(errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function onReply(event: FormEvent) {
    event.preventDefault();
    if (!room || !identity || openId === null || busy) return;
    const body = reply.trim();
    if (!body) return;
    setBusy(true);
    try {
      const line = await postAnswer({
        data: {
          roomId: room.id,
          authorKey: identity.authorKey,
          nick: identity.nick,
          questionId: openId,
          body,
        },
      });
      setDetail((prev) => (prev ? { ...prev, answers: [...prev.answers, line] } : prev));
      setReply("");
      setNotice("");
    } catch (error: unknown) {
      setNotice(errText(error));
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteQuestion() {
    if (!room || !identity || !detail) return;
    try {
      await removeQuestion({ data: { roomId: room.id, authorKey: identity.authorKey, id: detail.id } });
      setOpenId(null);
      setDetail(null);
      setQuestions((prev) => prev.filter((card) => card.id !== detail.id));
    } catch (error: unknown) {
      setNotice(errText(error));
    }
  }

  const roomName =
    room?.kind === "link" && room.id === linkRoom?.id ? "この回線" : room?.kind === "street" ? "大通り" : (room?.label ?? "部屋");

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg md:flex-row">
      <HoneyField />
      <aside className="relative z-10 shrink-0 border-b border-line bg-surface/90 md:flex md:w-64 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div>
            <p className="font-display text-xl leading-none tracking-wide">LARGO-CHAT</p>
            <p className="mt-2 text-sm text-muted">同じ回線は、同じ部屋。</p>
          </div>
          <button
            type="button"
            className="h-11 rounded-full border border-line px-3 text-sm text-muted lg:hidden"
            onClick={() => setSpecOpen(true)}
          >
            仕様
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 pb-3 no-scrollbar md:flex-col md:overflow-visible md:px-3">
          <RoomButton
            active={room?.id === linkRoom?.id}
            label="この回線"
            hint={linkRoom?.code ?? "見ている"}
            onClick={() => linkRoom && setRoom(linkRoom)}
          />
          <RoomButton
            active={room?.id === "street"}
            label="大通り"
            hint="誰でも"
            onClick={() => setRoom(streetRoom())}
          />
          {room && room.id !== linkRoom?.id && room.id !== "street" ? (
            <RoomButton active label={room.label} hint="合い言葉" onClick={() => undefined} />
          ) : null}
        </div>

        <form onSubmit={onJoin} className="flex gap-2 px-4 pb-4 md:flex-col md:px-3">
          <label className="sr-only" htmlFor="phrase">
            合い言葉
          </label>
          <input
            id="phrase"
            value={phrase}
            onChange={(event) => setPhrase(event.target.value)}
            maxLength={16}
            placeholder="合い言葉 / AB-2K"
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm text-fg outline-none placeholder:text-muted focus:border-honey"
          />
          <Button type="submit" variant="line" disabled={busy || phrase.trim().length < 2}>
            入る
          </Button>
        </form>

        <div className="hidden border-t border-line px-4 py-4 md:mt-auto md:block">
          <People people={people} />
          <NickEditor
            fieldId="nick-side"
            editing={editingNick}
            nick={identity?.nick ?? ""}
            draft={nickDraft}
            onDraft={setNickDraft}
            onEdit={() => setEditingNick(true)}
            onCommit={commitNick}
          />
        </div>
      </aside>

      <section className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted">{room?.kind === "link" ? "回線の部屋" : room?.kind === "code" ? "合い言葉" : "公開"}</p>
            <h1 className="truncate font-display text-xl leading-tight">{roomName}</h1>
          </div>
          {room?.code && room.kind !== "street" ? (
            <p className="shrink-0 rounded-full border border-line px-3 py-2 text-sm text-honey">{room.code}</p>
          ) : null}
          <div className="flex rounded-full border border-line p-1">
            <PaneButton active={pane === "chat"} onClick={() => setPane("chat")}>
              チャット
            </PaneButton>
            <PaneButton active={pane === "ask"} onClick={() => setPane("ask")}>
              質問
            </PaneButton>
          </div>
        </header>

        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2 md:hidden">
          <People people={people} compact />
          <NickEditor
            fieldId="nick-bar"
            editing={editingNick}
            nick={identity?.nick ?? ""}
            draft={nickDraft}
            onDraft={setNickDraft}
            onEdit={() => setEditingNick(true)}
            onCommit={commitNick}
          />
        </div>

        {notice ? <p className="border-b border-line px-4 py-2 text-sm text-honey">{notice}</p> : null}

        {pane === "chat" ? (
          <>
            <div
              ref={logRef}
              onScroll={(event) => {
                const el = event.currentTarget;
                stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
              }}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
            >
              {messages.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted">静かな部屋。最初の一行は残る。</p>
              ) : (
                <ol className="flex flex-col gap-1">
                  {messages.map((line) => (
                    <li key={line.id} className="group flex gap-3 py-1 text-sm leading-relaxed">
                      <time className="w-12 shrink-0 pt-0.5 text-muted tabular-nums">{clock(line.at)}</time>
                      <span className={`w-28 shrink-0 truncate font-semibold ${NICK_CLASS[nickTone(line.nick)]}`}>{line.nick}</span>
                      <p className="min-w-0 flex-1 break-words whitespace-pre-wrap text-fg">{line.body}</p>
                      {line.mine ? (
                        <button
                          type="button"
                          aria-label="この行を消す"
                          onClick={() => onDeleteLine(line.id)}
                          className="h-11 w-11 shrink-0 text-muted opacity-100 md:opacity-0 md:group-hover:opacity-100"
                        >
                          <Trash2 className="mx-auto size-4" />
                        </button>
                      ) : (
                        <span className="w-11 shrink-0" />
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <form onSubmit={onSend} className="flex gap-2 border-t border-line bg-surface/90 p-3">
              <label className="sr-only" htmlFor="line">
                メッセージ
              </label>
              <input
                id="line"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={500}
                placeholder="一行を置く"
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm outline-none placeholder:text-muted focus:border-honey"
              />
              <Button type="submit" disabled={busy || draft.trim().length < 1} aria-label="送る">
                <Send className="size-4" />
                送る
              </Button>
            </form>
          </>
        ) : openId !== null && detail ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <button type="button" onClick={() => { setOpenId(null); setDetail(null); }} className="mb-4 inline-flex h-11 items-center gap-2 text-sm text-muted">
                <ArrowLeft className="size-4" />
                質問の一覧
              </button>
              <p className="text-sm text-honey">#{detail.tag}</p>
              <h2 className="mt-1 font-display text-2xl leading-snug">{detail.title}</h2>
              <p className="mt-2 text-sm text-muted">
                <span className={NICK_CLASS[nickTone(detail.nick)]}>{detail.nick}</span>
                <span> · {clock(detail.at)}</span>
              </p>
              <p className="mt-4 break-words whitespace-pre-wrap text-sm leading-relaxed">{detail.body}</p>
              {detail.mine ? (
                <button type="button" onClick={onDeleteQuestion} className="mt-4 h-11 text-sm text-muted">
                  この質問を消す
                </button>
              ) : null}
              <h3 className="mt-8 text-sm text-muted">返信 {detail.answers.length}</h3>
              <ul className="mt-3 flex flex-col gap-4">
                {detail.answers.map((answer) => (
                  <li key={answer.id} className="border-t border-line pt-3">
                    <p className="text-sm">
                      <span className={`font-semibold ${NICK_CLASS[nickTone(answer.nick)]}`}>{answer.nick}</span>
                      <span className="text-muted"> · {clock(answer.at)}</span>
                    </p>
                    <p className="mt-1 break-words whitespace-pre-wrap text-sm leading-relaxed">{answer.body}</p>
                  </li>
                ))}
              </ul>
            </div>
            <form onSubmit={onReply} className="flex gap-2 border-t border-line bg-surface p-3">
              <label className="sr-only" htmlFor="reply">
                返信
              </label>
              <input
                id="reply"
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                maxLength={2000}
                placeholder="返信を書く"
                className="h-11 min-w-0 flex-1 rounded-full border border-line bg-bg px-4 text-sm outline-none placeholder:text-muted focus:border-honey"
              />
              <Button type="submit" disabled={busy || reply.trim().length < 1}>
                返信
              </Button>
            </form>
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted">この部屋の質問だけが並ぶ。</p>
              <Button variant={asking ? "ghost" : "line"} size="sm" onClick={() => setAsking((value) => !value)}>
                {asking ? "閉じる" : "質問する"}
              </Button>
            </div>
            {asking ? (
              <form onSubmit={onAsk} className="mb-6 flex flex-col gap-3 rounded-xl border border-line bg-surface p-4">
                <label className="text-sm text-muted" htmlFor="q-title">
                  タイトル
                </label>
                <input
                  id="q-title"
                  value={qTitle}
                  onChange={(event) => setQTitle(event.target.value)}
                  maxLength={80}
                  className="h-11 rounded-xl border border-line bg-bg px-3 text-sm outline-none focus:border-honey"
                />
                <label className="text-sm text-muted" htmlFor="q-tag">
                  タグ
                </label>
                <input
                  id="q-tag"
                  value={qTag}
                  onChange={(event) => setQTag(event.target.value)}
                  maxLength={16}
                  placeholder="react"
                  className="h-11 rounded-xl border border-line bg-bg px-3 text-sm outline-none placeholder:text-muted focus:border-honey"
                />
                <label className="text-sm text-muted" htmlFor="q-body">
                  本文
                </label>
                <textarea
                  id="q-body"
                  value={qBody}
                  onChange={(event) => setQBody(event.target.value)}
                  maxLength={4000}
                  rows={5}
                  className="rounded-xl border border-line bg-bg px-3 py-3 text-sm leading-relaxed outline-none focus:border-honey"
                />
                <Button type="submit" disabled={busy || qTitle.trim().length < 1 || qBody.trim().length < 1}>
                  置く
                </Button>
              </form>
            ) : null}
            {questions.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted">まだ質問はない。詰まったことを、タイトル一行で置ける。</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {questions.map((card) => (
                  <li key={card.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setDetail(null);
                        setOpenId(card.id);
                      }}
                      className="w-full rounded-xl border border-line bg-surface px-4 py-3 text-left"
                    >
                      <p className="text-sm text-honey">#{card.tag}</p>
                      <p className="mt-1 font-display text-lg leading-snug">{card.title}</p>
                      <p className="mt-2 line-clamp-2 text-sm text-muted">{card.preview}</p>
                      <p className="mt-2 text-sm text-muted">
                        <span className={NICK_CLASS[nickTone(card.nick)]}>{card.nick}</span>
                        <span> · 返信 {card.replies}</span>
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <aside className="relative z-10 hidden w-72 shrink-0 flex-col border-l border-line bg-surface/90 lg:flex">
        <Spec />
      </aside>

      {specOpen ? (
        <div className="fixed inset-0 z-20 flex items-end bg-bg/80 lg:hidden">
          <div className="max-h-[85dvh] w-full overflow-y-auto rounded-t-2xl border border-line bg-surface p-4">
            <div className="mb-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={() => setSpecOpen(false)}>
                閉じる
              </Button>
            </div>
            <Spec />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RoomButton({
  active,
  label,
  hint,
  onClick,
}: {
  active: boolean;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-14 min-w-36 shrink-0 flex-col items-start justify-center rounded-xl border px-3 text-left md:h-14 md:w-full ${
        active ? "border-honey bg-bg" : "border-line bg-bg"
      }`}
    >
      <span className="text-sm">{label}</span>
      <span className="text-xs text-muted">{hint}</span>
    </button>
  );
}

function PaneButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 rounded-full px-3 text-sm ${active ? "bg-honey text-bg" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

function People({ people, compact = false }: { people: Person[]; compact?: boolean }) {
  return (
    <div className={compact ? "min-w-0" : ""}>
      <p className="mb-2 flex items-center gap-2 text-sm text-muted">
        <Users className="size-4" />
        {people.length}人
      </p>
      {compact ? null : (
        <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {people.map((person, index) => (
            <li key={`${person.mine ? "me" : "peer"}-${index}`} className="flex items-center gap-2 text-sm">
              <Radio className={`size-3 ${person.mine ? "text-honey" : "text-muted"}`} />
              <span className={`truncate ${NICK_CLASS[nickTone(person.nick)]}`}>{person.nick}</span>
              {person.mine ? <span className="text-muted">自分</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NickEditor({
  editing,
  nick,
  draft,
  fieldId,
  onDraft,
  onEdit,
  onCommit,
}: {
  editing: boolean;
  nick: string;
  draft: string;
  fieldId: string;
  onDraft: (value: string) => void;
  onEdit: () => void;
  onCommit: (value: string) => void;
}) {
  if (editing) {
    return (
      <form
        className="mt-3"
        onSubmit={(event) => {
          event.preventDefault();
          onCommit(draft);
        }}
      >
        <label className="sr-only" htmlFor={fieldId}>
          ニック
        </label>
        <input
          id={fieldId}
          value={draft}
          maxLength={12}
          placeholder="largo-1042"
          onChange={(event) => onDraft(event.target.value)}
          onBlur={() => onCommit(draft)}
          className="h-11 w-full rounded-full border border-honey bg-bg px-3 text-sm outline-none"
        />
      </form>
    );
  }
  return (
    <button type="button" onClick={onEdit} className="mt-3 flex h-11 items-center gap-2 text-sm">
      <ScrollText className="size-4 text-honey" />
      <span className={nick ? NICK_CLASS[nickTone(nick)] : "text-muted"}>{nick || "largo-"}</span>
    </button>
  );
}

function Spec() {
  return (
    <div className="px-4 py-4">
      <h2 className="font-display text-xl">いまの仕様</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">仮の決まり。ずれたところは、このあと一緒に直す。</p>
      <ul className="mt-4 flex flex-col gap-4">
        {RULES.map((rule) => (
          <li key={rule.title}>
            <p className="text-sm text-honey">{rule.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg">{rule.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
