export type Identity = {
  authorKey: string;
  nick: string;
};

const STORAGE_KEY = "largo.identity.v1";
const NICK_RE = /^largo-\d{1,6}$/;

function randomKey(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function freshNick(): string {
  const n = Math.floor(Math.random() * 9000) + 1000;
  return `largo-${n}`;
}

export function normalizeNick(raw: string): string {
  const compact = raw.trim().toLowerCase().replace(/\s+/g, "");
  const direct = compact.match(/^largo-(\d{1,6})$/);
  if (direct) return `largo-${direct[1]}`;
  const digits = compact.replace(/\D/g, "");
  if (digits.length >= 1 && digits.length <= 6) return `largo-${digits}`;
  return freshNick();
}

export function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("comb.identity.v1");
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Identity>;
      if (typeof parsed.authorKey === "string" && /^[a-f0-9]{32}$/.test(parsed.authorKey)) {
        const nick =
          typeof parsed.nick === "string" && NICK_RE.test(parsed.nick.trim().toLowerCase())
            ? parsed.nick.trim().toLowerCase()
            : freshNick();
        const identity = { authorKey: parsed.authorKey, nick };
        saveIdentity(identity);
        return identity;
      }
    }
  } catch {
    // ignore broken storage
  }
  const created = { authorKey: randomKey(), nick: freshNick() };
  saveIdentity(created);
  return created;
}

export function saveIdentity(identity: Identity) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
}

export function nickTone(nick: string): 0 | 1 | 2 | 3 | 4 | 5 {
  let h = 0;
  for (let i = 0; i < nick.length; i += 1) h = (h * 33 + nick.charCodeAt(i)) >>> 0;
  return (h % 6) as 0 | 1 | 2 | 3 | 4 | 5;
}

export const NICK_CLASS = [
  "text-nick0",
  "text-nick1",
  "text-nick2",
  "text-nick3",
  "text-nick4",
  "text-nick5",
] as const;
