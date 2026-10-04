// Free-text answers: word clouds, open responses and an audience Q&A. Pure data
// structures with hard limits, because everything arrives from phones nobody vets.

export const BOARD_LIMITS = {
  entry: 40,      // characters in one word-cloud entry
  response: 280,  // characters in one open answer
  question: 280,  // characters in one audience question
  perPerson: 5,   // entries a single phone may add to one cloud or open board
  asksPerPerson: 5,
  entries: 2000,  // per board
  questions: 150, // per Q&A
};

// "  Clear   Vision! " -> "clear vision". Case-insensitive, trimmed of edge punctuation.
export function normalizeEntry(raw, max = BOARD_LIMITS.entry) {
  const t = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .slice(0, max)
    .trim();
  return t;
}

// Plain text for open answers and questions: whitespace tidied, nothing else changed.
export function cleanText(raw, max) {
  return String(raw ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export class Boards {
  #cloud = new Map();     // prompt id -> Map(cid -> string[])
  #open = new Map();      // prompt id -> { cid, text }[]
  #qna = new Map();       // prompt id -> Map(qid -> { id, cid, text, ups:Set, answered, hidden, at })
  #seq = 0;

  // ---- word cloud --------------------------------------------------------------

  addEntry(id, cid, raw, limit = BOARD_LIMITS.perPerson) {
    const word = normalizeEntry(raw);
    if (!word) return false;
    let byPerson = this.#cloud.get(id);
    if (!byPerson) this.#cloud.set(id, (byPerson = new Map()));
    const mine = byPerson.get(cid) ?? [];
    if (mine.length >= Math.min(limit, BOARD_LIMITS.perPerson)) return false;
    if (mine.includes(word)) return false; // the same word twice from one phone counts once
    let total = 0;
    for (const list of byPerson.values()) total += list.length;
    if (total >= BOARD_LIMITS.entries) return false;
    byPerson.set(cid, [...mine, word]);
    return true;
  }

  // [[word, count], ...] biggest first, then alphabetical so the order is stable.
  words(id, top = 80) {
    const counts = new Map();
    for (const list of this.#cloud.get(id)?.values() ?? []) for (const w of list) counts.set(w, (counts.get(w) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
  }

  entriesOf(id, cid) {
    return this.#cloud.get(id)?.get(cid) ?? [];
  }

  // ---- open answers --------------------------------------------------------------

  addResponse(id, cid, raw, limit = 3) {
    const text = cleanText(raw, BOARD_LIMITS.response);
    if (!text) return false;
    const list = this.#open.get(id) ?? [];
    if (list.filter((r) => r.cid === cid).length >= Math.min(limit, BOARD_LIMITS.perPerson)) return false;
    if (list.length >= BOARD_LIMITS.entries) return false;
    this.#open.set(id, [...list, { cid, text }]);
    return true;
  }

  // Newest first, so the latest answer is on top.
  responses(id, top = 60) {
    return (this.#open.get(id) ?? []).slice().reverse().slice(0, top).map((r) => r.text);
  }

  responsesOf(id, cid) {
    return (this.#open.get(id) ?? []).filter((r) => r.cid === cid).map((r) => r.text);
  }

  // ---- Q&A -------------------------------------------------------------------------

  ask(id, cid, raw, at = 0) {
    const text = cleanText(raw, BOARD_LIMITS.question);
    if (!text) return null;
    let all = this.#qna.get(id);
    if (!all) this.#qna.set(id, (all = new Map()));
    if (all.size >= BOARD_LIMITS.questions) return null;
    let mine = 0;
    for (const q of all.values()) if (q.cid === cid) mine++;
    if (mine >= BOARD_LIMITS.asksPerPerson) return null;
    const qid = `q${++this.#seq}`;
    all.set(qid, { id: qid, cid, text, ups: new Set([cid]), answered: false, hidden: false, at });
    return qid;
  }

  // Toggles this person's upvote. You cannot take back the question you asked.
  upvote(id, cid, qid) {
    const q = this.#qna.get(id)?.get(qid);
    if (!q || q.hidden) return false;
    if (q.ups.has(cid)) {
      if (q.cid === cid) return false;
      q.ups.delete(cid);
    } else q.ups.add(cid);
    return true;
  }

  // op: 'answered' | 'open' | 'hide' | 'show'
  moderate(id, qid, op) {
    const q = this.#qna.get(id)?.get(qid);
    if (!q) return false;
    if (op === 'answered') q.answered = true;
    else if (op === 'open') q.answered = false;
    else if (op === 'hide') q.hidden = true;
    else if (op === 'show') q.hidden = false;
    else return false;
    return true;
  }

  // Open questions by upvotes, then oldest first; answered ones go to the end. Hidden are never listed.
  questions(id, { includeHidden = false } = {}) {
    const all = [...(this.#qna.get(id)?.values() ?? [])].filter((q) => includeHidden || !q.hidden);
    return all
      .sort((a, b) => Number(a.answered) - Number(b.answered) || b.ups.size - a.ups.size || a.at - b.at || a.id.localeCompare(b.id, 'en', { numeric: true }))
      .map((q) => ({ id: q.id, text: q.text, votes: q.ups.size, answered: q.answered, hidden: q.hidden }));
  }

  upvotedBy(id, cid) {
    return [...(this.#qna.get(id)?.values() ?? [])].filter((q) => q.ups.has(cid) && !q.hidden).map((q) => q.id);
  }

  reset(id) {
    if (id === undefined) {
      this.#cloud.clear();
      this.#open.clear();
      this.#qna.clear();
    } else {
      this.#cloud.delete(id);
      this.#open.delete(id);
      this.#qna.delete(id);
    }
  }
}
