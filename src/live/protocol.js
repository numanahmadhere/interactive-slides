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

// What the audience can be asked. Choice kinds have options; the rest take typed answers.
export const PROMPT_KINDS = ['poll', 'quiz', 'rating', 'ranking', 'cloud', 'open', 'qna'];
export const CHOICE_KINDS = new Set(['poll', 'quiz', 'rating', 'ranking']);
export const TEXT_KINDS = new Set(['cloud', 'open']);

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

// A long unguessable token, for share links.
export const newToken = (rand) => randomString(KEY_ALPHABET, 22, rand);

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

// A prompt is something the audience can answer: a poll, quiz, rating, ranking, word
// cloud, open question or a Q&A.
export function cleanPrompt(raw) {
  if (!isObj(raw) || typeof raw.id !== 'string' || raw.id.length > 40) return null;
  const kind = PROMPT_KINDS.includes(raw.kind) ? raw.kind : 'poll';
  const options = CHOICE_KINDS.has(kind) && Array.isArray(raw.options) ? raw.options.slice(0, LIMITS.options).map((o) => text(o, LIMITS.text)) : [];
  if (CHOICE_KINDS.has(kind) && options.length < 2) return null;
  const prompt = { id: raw.id, kind, question: text(raw.question, LIMITS.text), options, multi: kind !== 'ranking' && raw.multi === true };
  if (kind === 'rating') {
    prompt.low = text(raw.low, 60);
    prompt.high = text(raw.high, 60);
  }
  if (TEXT_KINDS.has(kind)) prompt.limit = int(raw.limit, 1, 5) ?? (kind === 'cloud' ? 3 : 1);
  return prompt;
}

const cleanWords = (v) => (Array.isArray(v) ? v.slice(0, 80).flatMap((e) => (Array.isArray(e) && typeof e[0] === 'string' && int(e[1], 1, 1_000_000) ? [[e[0].slice(0, 40), e[1]]] : [])) : []);
const cleanResponses = (v) => (Array.isArray(v) ? v.slice(0, 60).filter((t) => typeof t === 'string').map((t) => t.slice(0, 280)) : []);
const cleanQuestions = (v) => (Array.isArray(v)
  ? v.slice(0, 100).flatMap((q) => (isObj(q) && typeof q.id === 'string' && q.id.length <= 20 && typeof q.text === 'string'
    ? [{ id: q.id, text: q.text.slice(0, 280), votes: int(q.votes, 0, 100000) ?? 0, answered: q.answered === true }] : []))
  : []);

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
  // Typed answers come back as aggregates: the cloud's words, the latest responses, the open questions.
  const data = {};
  if (isObj(raw.data)) {
    for (const p of prompts) {
      const row = raw.data[p.id];
      if (p.kind === 'cloud') data[p.id] = cleanWords(row);
      else if (p.kind === 'open') data[p.id] = cleanResponses(row);
      else if (p.kind === 'qna') data[p.id] = cleanQuestions(row);
    }
  }
  return { title: text(raw.title, 200), prompts, counts, data, ended: raw.ended === true, session: text(raw.session, 40) };
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
  if (!prompt || !CHOICE_KINDS.has(prompt.kind) || !Array.isArray(raw.picks)) return null;
  const n = prompt.options.length;
  if (prompt.kind === 'ranking') { // an order of every option, best first
    const order = raw.picks.map((v) => int(v, 0, n - 1));
    if (order.length !== n || order.includes(null) || new Set(order).size !== n) return null;
    return { cid, id: prompt.id, picks: order };
  }
  const picks = [...new Set(raw.picks.map((v) => int(v, 0, n - 1)))].filter((v) => v !== null).sort((a, b) => a - b);
  if (!picks.length || (!prompt.multi && picks.length > 1)) return null;
  return { cid, id: prompt.id, picks };
}

// A typed answer to a word cloud or an open question.
export function parseText(raw, prompts) {
  if (!isObj(raw) || raw.t !== 'text') return null;
  const cid = cidOf(raw.cid);
  const prompt = prompts.find((p) => p.id === raw.id);
  if (!cid || !prompt || !TEXT_KINDS.has(prompt.kind) || typeof raw.text !== 'string') return null;
  return { cid, id: prompt.id, kind: prompt.kind, text: raw.text.slice(0, 400), limit: prompt.limit ?? 1 };
}

// A new audience question, or an upvote on one.
export function parseAsk(raw, prompts) {
  if (!isObj(raw) || (raw.t !== 'ask' && raw.t !== 'up')) return null;
  const cid = cidOf(raw.cid);
  const prompt = prompts.find((p) => p.id === raw.id);
  if (!cid || !prompt || prompt.kind !== 'qna') return null;
  if (raw.t === 'ask') return typeof raw.text === 'string' ? { op: 'ask', cid, id: prompt.id, text: raw.text.slice(0, 400) } : null;
  return typeof raw.q === 'string' && raw.q.length <= 20 ? { op: 'up', cid, id: prompt.id, q: raw.q } : null;
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

  // Ranking: an answer is an order, best first. A first place among n options earns n-1 points,
  // the last earns 0, and the totals are what the presenter's screen sorts by.
  scores(id, optionCount) {
    const out = new Array(optionCount).fill(0);
    for (const order of this.#answers.get(id)?.values() ?? []) {
      order.forEach((option, place) => { if (option < optionCount) out[option] += optionCount - 1 - place; });
    }
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
  // People paste the Data API address (.../rest/v1/); only the project address is wanted.
  const url = text(raw.url, 300).trim().replace(/\/(rest|auth|realtime|storage)\/v1\/?.*$/i, '').replace(/\/+$/, '');
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

// ---- is the presenter still there? ----------------------------------------------------

// The host announces itself every 15 s; three missed announcements means it is gone
// (laptop asleep, Wi-Fi dropped, page reloaded).
export const STALE_AFTER_MS = 45_000;
export const isStale = (lastHeardAt, now, limit = STALE_AFTER_MS) => lastHeardAt !== null && now - lastHeardAt > limit;

// A session saved by the presenter's page so a reload can pick it up again.
export function cleanSavedSession(raw) {
  if (!isObj(raw)) return null;
  const code = normalizeCode(raw.room?.code);
  const key = normalizeKey(raw.room?.key);
  const config = cleanConfig(raw.config);
  if (!code || !key || !config) return null;
  return { room: { code, key }, config, base: text(raw.base, 300) };
}
