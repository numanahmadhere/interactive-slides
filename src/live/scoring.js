// Points for timed quizzes, the leaderboard and teams. Pure, so every rule is tested. The answer key only ever
// lives on the presenter's page; phones are told whether they were right, never what the key was.

import { isProfane } from './profanity.js';

export const BASE_POINTS = 1000;

// Was this answer right? key: { mode: 'single'|'multiple', correct: boolean[] }, picks: option indexes.
export function isRight(key, picks) {
  const chosen = [...new Set(picks)].sort((a, b) => a - b);
  if (key.mode === 'single') return chosen.length === 1 && key.correct[chosen[0]] === true;
  const right = key.correct.flatMap((c, i) => (c ? [i] : []));
  return right.length > 0 && chosen.length === right.length && chosen.every((v, i) => v === right[i]);
}

// A right answer is worth 1000. On a timed question the first half is for being right and the second half
// shrinks to nothing as the clock runs out, so speed matters but being right matters more. Wrong is 0.
export function pointsFor({ correct, elapsedS = 0, limitS = 0 }) {
  if (!correct) return 0;
  if (!limitS) return BASE_POINTS;
  const used = Math.min(1, Math.max(0, elapsedS / limitS));
  return Math.round(BASE_POINTS / 2 + (BASE_POINTS / 2) * (1 - used));
}

const tidy = (v, max) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');

export class Scoreboard {
  #players = new Map(); // cid -> { name, team, answers: Map(promptId -> { correct, points }) }

  // A phone says who it is. A name that breaks the filter is replaced, never shown on the big screen.
  join(cid, { name = '', team = '' } = {}, teams = []) {
    const p = this.#players.get(cid) ?? { name: '', team: '', answers: new Map() };
    const clean = tidy(name, 24);
    if (clean) p.name = isProfane(clean) ? 'Player' : clean;
    const wanted = tidy(team, 24);
    if (teams.length) p.team = teams.find((t) => t.toLowerCase() === wanted.toLowerCase()) ?? p.team;
    this.#players.set(cid, p);
    return p;
  }

  has(cid) {
    return this.#players.has(cid);
  }

  // The latest answer to a question replaces an earlier one, so changing your mind never double-counts.
  record(cid, promptId, { correct, points }) {
    const p = this.#players.get(cid) ?? this.join(cid);
    p.answers.set(promptId, { correct, points });
  }

  answered(cid, promptId) {
    return this.#players.get(cid)?.answers.has(promptId) ?? false;
  }

  forget(promptId) {
    for (const p of this.#players.values()) p.answers.delete(promptId);
  }

  reset() {
    this.#players.clear();
  }

  #row(cid, p, index) {
    let points = 0;
    let right = 0;
    for (const a of p.answers.values()) {
      points += a.points;
      if (a.correct) right++;
    }
    return { cid, name: p.name || `Guest ${index + 1}`, team: p.team, points, correct: right, answered: p.answers.size };
  }

  // Everyone who has answered a scored question, best first (ties share the earlier join order).
  players(limit = 1000) {
    const rows = [...this.#players].map(([cid, p], i) => this.#row(cid, p, i)).filter((r) => r.answered > 0);
    return rows.sort((a, b) => b.points - a.points || b.correct - a.correct).slice(0, limit);
  }

  rankOf(cid) {
    const rows = this.players();
    const i = rows.findIndex((r) => r.cid === cid);
    return i < 0 ? null : { rank: i + 1, of: rows.length, points: rows[i].points };
  }

  // Teams are ranked by the average of their members, so a bigger team has no advantage.
  teams() {
    const by = new Map();
    for (const r of this.players()) {
      if (!r.team) continue;
      const t = by.get(r.team) ?? { team: r.team, points: 0, members: 0 };
      t.points += r.points;
      t.members += 1;
      by.set(r.team, t);
    }
    return [...by.values()].map((t) => ({ ...t, average: Math.round(t.points / t.members) })).sort((a, b) => b.average - a.average);
  }
}
