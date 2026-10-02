// The messages a presenter, a phone remote and an audience exchange. This file
// is pure: it only builds names and checks what arrives. Everything that comes
// off the network is untrusted, so every handler runs through a parse function
// that returns clean data or null.

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I to misread
const KEY_ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const LIMITS = {
  voters: 1000, // per prompt
  options: 8,
  text: 600,
  notes: 4000,
  cid: 40,
};

const COMMANDS = new Set(['next', 'prev', 'first', 'last']);

function randomString(alphabet, length, rand = defaultRandom) {
  let out = '';
  for (const n of rand(length)) out += alphabet[n % alphabet.length];
  return out;
}

function defaultRandom(length) {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}

// code: short, typed by the audience. key: long, secret, in the remote's link.
export function newRoom(rand) {
  return { code: randomString(CODE_ALPHABET, 6, rand), key: randomString(KEY_ALPHABET, 22, rand) };
}

export const audienceChannel = (code) => `is-a-${code}`;
export const remoteChannel = (key) => `is-r-${key}`;

export function normalizeCode(raw) {
  const code = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return code.length === 6 && [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

export function normalizeKey(raw) {
  const key = String(raw ?? '');
  return key.length === 22 && [...key].every((c) => KEY_ALPHABET.includes(c)) ? key : null;
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const cidOf = (v) => (typeof v === 'string' && v.length > 0 && v.length <= LIMITS.cid && /^[\w-]+$/.test(v) ? v : null);
const int = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : null);

// A prompt is something the audience can answer: a poll or a quiz question.
export function cleanPrompt(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || raw.id.length > 40) return null;
  const options = Array.isArray(raw.options) ? raw.options.slice(0, LIMITS.options).map((o) => text(o, LIMITS.text)) : [];
  if (options.length < 2) return null;
  return {
    id: raw.id,
    kind: raw.kind === 'quiz' ? 'quiz' : 'poll',
    question: text(raw.question, LIMITS.text),
    options,
    multi: raw.multi === true,
  };
}

// What the host tells the audience: the slide's prompts and the running totals.
export function cleanAudienceState(raw) {
  if (!isObj(raw) || raw.t !== 'state') return null;
  const prompts = (Array.isArray(raw.prompts) ? raw.prompts.slice(0, 8) : []).map(cleanPrompt).filter(Boolean);
  const counts = {};
  if (isObj(raw.counts)) {
    for (const p of prompts) {
      const row = raw.counts[p.id];
      if (Array.isArray(row)) counts[p.id] = p.options.map((_, i) => int(row[i], 0, 1_000_000) ?? 0);
    }
  }
  return { title: text(raw.title, 200), prompts, counts, ended: raw.ended === true };
}

// What the host tells the phone remote.
export function cleanRemoteState(raw) {
  if (!isObj(raw) || raw.t !== 'state') return null;
  const total = int(raw.total, 1, 10000);
  const slide = int(raw.slide, 0, 9999);
  if (total === null || slide === null) return null;
  return {
    slide,
    total,
    step: int(raw.step, 0, 1000) ?? 0,
    steps: int(raw.steps, 0, 1000) ?? 0,
    title: text(raw.title, 200),
    next: text(raw.next, 200),
    notes: text(raw.notes, LIMITS.notes),
  };
}

// Audience -> host. prompts is the host's own list for the current slide: a vote
// for anything else, or with an impossible pick, is dropped.
export function parseVote(raw, prompts) {
  if (!isObj(raw) || raw.t !== 'vote') return null;
  const cid = cidOf(raw.cid);
  if (!cid) return null;
  const prompt = prompts.find((p) => p.id === raw.id);
  if (!prompt || !Array.isArray(raw.picks)) return null;
  const picks = [...new Set(raw.picks.map((n) => int(n, 0, prompt.options.length - 1)))].filter((n) => n !== null).sort((a, b) => a - b);
  if (!picks.length || (!prompt.multi && picks.length > 1)) return null;
  return { cid, id: prompt.id, picks };
}

export function parseCommand(raw) {
  return isObj(raw) && raw.t === 'cmd' && COMMANDS.has(raw.op) ? { op: raw.op } : null;
}

export function parseHello(raw) {
  if (!isObj(raw) || raw.t !== 'hello') return null;
  const cid = cidOf(raw.cid);
  return cid ? { cid } : null;
}

// ---- tallies -----------------------------------------------------------------

// Who picked what, per prompt. One voter has one answer per prompt; voting again
// replaces it. Counts are always derived from the answers, never incremented.
export class Tally {
  #answers = new Map(); // prompt id -> Map(cid -> picks)

  vote({ cid, id, picks }, prompt) {
    let byVoter = this.#answers.get(id);
    if (!byVoter) this.#answers.set(id, (byVoter = new Map()));
    if (!byVoter.has(cid) && byVoter.size >= LIMITS.voters) return false;
    byVoter.set(cid, picks.filter((n) => n < prompt.options.length));
    return true;
  }

  counts(id, optionCount) {
    const out = new Array(optionCount).fill(0);
    for (const picks of this.#answers.get(id)?.values() ?? []) for (const n of picks) if (n < optionCount) out[n]++;
    return out;
  }

  voters(id) {
    return this.#answers.get(id)?.size ?? 0;
  }

  answerOf(id, cid) {
    return this.#answers.get(id)?.get(cid) ?? null;
  }

  reset(id) {
    if (id === undefined) this.#answers.clear();
    else this.#answers.delete(id);
  }
}

// ---- connection settings, carried in a link ---------------------------------------

const b64 = {
  enc: (s) => btoa(String.fromCharCode(...new TextEncoder().encode(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))),
};

// { kind: 'local' } | { kind: 'realtime', url, key }
export function cleanConfig(raw) {
  if (!isObj(raw)) return null;
  if (raw.kind === 'local') return { kind: 'local' };
  if (raw.kind !== 'realtime') return null;
  const url = text(raw.url, 300).trim().replace(/\/+$/, '');
  const key = text(raw.key, 2000).trim();
  if (!/^(https?|wss?):\/\/[^\s/]+/i.test(url) || !key) return null;
  return { kind: 'realtime', url, key };
}

export const encodeConfig = (cfg) => b64.enc(JSON.stringify(cfg));

export function decodeConfig(token) {
  try {
    return cleanConfig(JSON.parse(b64.dec(String(token))));
  } catch {
    return null;
  }
}
