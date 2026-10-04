// The presenter's side of a live room. It owns two channels: one for the
// audience (short code, answers only) and one for a phone remote (long secret,
// can move the slides). The presenter's page is the single source of truth: it
// decides which slide is current, which prompts are open, and what the totals are.

import { slideTitle } from '../core/schema.js';
import { uid } from '../core/util.js';
import { stripTags } from '../core/util.js';
import { collectPrompts, collectKeys } from './prompts.js';
import {
  Tally, audienceChannel, remoteChannel, parseVote, parseCommand, parseHello, parseText, parseAsk, CHOICE_KINDS,
} from './protocol.js';
import { Boards } from './boards.js';
import { resultsCsv } from './results.js';
import { canUseKind, livePhones, canLeaderboard } from '../billing/plans.js';
import { Scoreboard, isRight, pointsFor } from './scoring.js';

const HOST_CID = 'host';
const PUBLISH_DELAY_MS = 250;
const SEEN_WINDOW_MS = 60_000;
export const HEARTBEAT_MS = 15_000; // phones treat 3 missed beats as "presenter offline"

export class LiveHost {
  #audience = null;
  #remote = null;
  #player = null;
  #detach = null;
  #prompts = [];
  #tally = new Tally();
  #boards = new Boards();
  #known = new Map(); // every prompt shown during the session, for the results export
  #seen = new Map(); // cid -> last time we heard from that phone
  #subs = new Set();
  #timer = 0;
  #status = 'idle';
  #statusSubs = new Set();
  #opened = { audience: false, remote: false };
  #heartbeat = 0;
  #locked;
  #board = new Scoreboard();
  #keys = new Map();      // quiz id -> answer key (stays on this page)
  #askedAt = new Map();   // quiz id -> when its question first appeared
  #full = new Map(); // phones turned away because the room is full -> when we last told them

  // plan: who is hosting. It decides which kinds of question phones can answer and how many phones fit.
  // It defaults to the smallest plan, so a caller that forgets to pass one is limited, not unlimited.
  // names: ask phones for a nickname and keep a leaderboard. teams: names of teams phones may join.
  constructor({ transport, room, title = '', now = Date.now, plan = 'free', names = false, teams = [] }) {
    this.title = title;
    this.plan = plan;
    this.wantNames = names;
    this.teamNames = teams.map((t) => String(t).trim()).filter(Boolean).slice(0, 8);
    this.#locked = new Set();
    this.sessionId = uid('h_'); // changes whenever a presenter page (re)starts; phones re-send their answers when it does
    this.transport = transport;
    this.room = room;
    this.now = now;
  }

  get status() { return this.#status; }
  get maxPhones() { return livePhones(this.plan); }

  // The plan changed (a purchase went through): re-read which questions are open to phones.
  setPlan(plan) {
    if (plan === this.plan) return;
    this.plan = plan;
    this.#refreshPrompts();
    this.#publishNow();
  }

  // True when this block's question type is not part of the plan, so phones never see it.
  isLocked = (id) => this.#locked.has(id);

  // Names, teams and the leaderboard need a plan that includes them.
  get names() { return this.wantNames && canLeaderboard(this.plan); }
  get teams() { return this.names ? this.teamNames : []; }

  // The leaderboard and teams, for the slide.
  leaderboard = (n = 10) => (this.names ? this.#board.players(n) : []);
  teamBoard = () => (this.names ? this.#board.teams() : []);

  // Seconds left on a timed question, or null when it has no clock (or the plan has no timed quizzes).
  remaining = (id) => {
    const key = this.#keys.get(id);
    const limit = this.#limitOf(key);
    const opened = this.#askedAt.get(id);
    if (!limit || opened === undefined) return null;
    return Math.max(0, limit - (this.now() - opened) / 1000);
  };

  #limitOf(key) {
    return key && key.timeLimit > 0 && canLeaderboard(this.plan) ? key.timeLimit : 0;
  }
  get prompts() { return this.#prompts; }

  onStatus(fn) {
    this.#statusSubs.add(fn);
    return () => this.#statusSubs.delete(fn);
  }

  #setStatus(status) {
    if (status === this.#status) return;
    this.#status = status;
    for (const fn of [...this.#statusSubs]) fn(status);
  }

  start() {
    this.#setStatus('connecting');
    this.#heartbeat = setInterval(() => { if (this.#status === 'live') this.#publishNow(); }, HEARTBEAT_MS);
    const onStatus = (which) => (s) => {
      if (s === 'connected') {
        this.#opened[which] = true;
        if (this.#opened.audience && this.#opened.remote) this.#setStatus('live');
        this.#publishNow();
      } else if (s === 'error') this.#setStatus('error');
      else if (s === 'closed' && this.#status !== 'stopped') this.#setStatus('connecting');
    };
    this.#audience = this.transport.open(audienceChannel(this.room.code), {
      onMessage: (m) => this.#onAudience(m), onStatus: onStatus('audience'),
    });
    this.#remote = this.transport.open(remoteChannel(this.room.key), {
      onMessage: (m) => this.#onRemote(m), onStatus: onStatus('remote'),
    });
  }

  stop() {
    this.#setStatus('stopped');
    clearTimeout(this.#timer);
    clearInterval(this.#heartbeat);
    this.#detach?.();
    this.#detach = null;
    this.#audience?.send({ t: 'state', session: this.sessionId, ended: true });
    this.#audience?.close();
    this.#remote?.close();
    this.#audience = this.#remote = null;
    this.transport.close();
    this.#subs.clear();
  }

  // ---- the Player it follows --------------------------------------------------

  attach(player) {
    this.#detach?.();
    this.#player = player;
    this.#refreshPrompts();
    const off = player.subscribe(() => {
      this.#refreshPrompts();
      this.#publishSoon();
    });
    this.#publishNow();
    this.#detach = () => {
      off();
      this.#player = null;
      this.#refreshPrompts();
      this.#publishNow();
    };
    return this.#detach;
  }

  #refreshPrompts() {
    const p = this.#player;
    const all = p ? collectPrompts(p.deck.slides[p.state.slide]) : [];
    this.#locked = new Set(all.filter((x) => !canUseKind(this.plan, x.kind)).map((x) => x.id));
    this.#prompts = all.filter((x) => !this.#locked.has(x.id));
    this.#keys = p ? collectKeys(p.deck.slides[p.state.slide]) : new Map();
    for (const prompt of this.#prompts) {
      this.#known.set(prompt.id, { prompt, slide: p.state.slide + 1 });
      if (prompt.kind === 'quiz' && !this.#askedAt.has(prompt.id)) this.#askedAt.set(prompt.id, this.now()); // the clock starts the first time it is shown
    }
    for (const fn of [...this.#subs]) fn();
  }

  // ---- what blocks see (ctx.live) ----------------------------------------------

  counts = (id, n) => this.#tally.counts(id, n);
  voters = (id) => this.#tally.voters(id);
  subscribe = (fn) => {
    this.#subs.add(fn);
    return () => this.#subs.delete(fn);
  };

  // The presenter clicking an option on their own screen counts as one voter.
  vote = (id, picks) => {
    const prompt = this.#prompts.find((p) => p.id === id);
    if (prompt && this.#tally.vote({ cid: HOST_CID, id, picks }, prompt)) this.#changed();
  };

  resetVotes(id) {
    this.#tally.reset(id);
    if (id === undefined) { this.#board.reset(); this.#askedAt.clear(); } else { this.#board.forget(id); this.#askedAt.delete(id); }
    this.#boards.reset(id);
    this.#changed();
  }

  // What the typed-answer blocks draw: the cloud's words, recent responses, the open questions.
  words = (id) => this.#boards.words(id);
  responses = (id) => this.#boards.responses(id);
  questions = (id, opts) => this.#boards.questions(id, opts);
  ranking = (id, n) => this.#tally.scores(id, n);

  // The presenter taking part from their own screen counts as one person.
  submitText = (id, text) => {
    const prompt = this.#prompts.find((p) => p.id === id);
    if (!prompt) return false;
    const own = { mode: 'off' }; // the presenter is trusted
    const ok = prompt.kind === 'cloud' ? this.#boards.addEntry(id, HOST_CID, text, prompt.limit, own) === 'added'
      : prompt.kind === 'open' ? this.#boards.addResponse(id, HOST_CID, text, prompt.limit, own) === 'added' : false;
    if (ok) this.#changed();
    return ok;
  };

  ask = (id, text) => {
    const qid = this.#prompts.some((p) => p.id === id && p.kind === 'qna') ? this.#boards.ask(id, HOST_CID, text, this.now(), { mode: 'off' }) : null;
    if (qid) this.#changed();
    return qid;
  };

  upvote = (id, qid) => {
    if (this.#boards.upvote(id, HOST_CID, qid)) this.#changed();
  };

  // Entries waiting for the presenter on boards set to "approve first".
  pending = (id) => this.#boards.pending(id);
  approve = (id, pid) => { if (this.#boards.approve(id, pid)) this.#changed(); };
  reject = (id, pid) => { if (this.#boards.reject(id, pid)) this.#changed(); };

  // Tell one phone what became of what it sent, when that is not "it appeared": held for approval, or filtered.
  #tell(cid, id, outcome) {
    if (outcome === 'pending' || outcome === 'filtered') this.#audience?.send({ t: 'note', cid, id, what: outcome });
  }

  // The presenter's own moderation of the audience's questions.
  moderate = (id, qid, op) => {
    if (this.#boards.moderate(id, qid, op)) this.#changed();
  };

  // Everything answered so far, as a CSV the presenter can download. Nothing leaves this page.
  exportResults() {
    return resultsCsv([...this.#known.values()], this.#tally, this.#boards, this.title);
  }

  get audienceSize() {
    const cutoff = this.now() - SEEN_WINDOW_MS;
    for (const [cid, at] of this.#seen) if (at < cutoff) this.#seen.delete(cid);
    return this.#seen.size;
  }

  #changed() {
    for (const fn of [...this.#subs]) fn();
    this.#publishSoon();
  }

  // ---- incoming ------------------------------------------------------------------

  #onAudience(raw) {
    const hello = parseHello(raw);
    if (hello) {
      if (!this.#admit(hello.cid)) return;
      this.#touch(hello.cid);
      if (this.names) this.#board.join(hello.cid, hello, this.teamNames);
      this.#publishSoon();
      return;
    }
    const text = parseText(raw, this.#prompts);
    if (text) {
      if (!this.#admit(text.cid)) return;
      this.#touch(text.cid);
      const prompt = this.#prompts.find((p) => p.id === text.id);
      const mode = { mode: prompt?.moderation ?? 'filter' };
      const outcome = text.kind === 'cloud' ? this.#boards.addEntry(text.id, text.cid, text.text, text.limit, mode) : this.#boards.addResponse(text.id, text.cid, text.text, text.limit, mode);
      this.#tell(text.cid, text.id, outcome);
      if (outcome === 'added' || outcome === 'pending') this.#changed();
      return;
    }
    const ask = parseAsk(raw, this.#prompts);
    if (ask) {
      if (!this.#admit(ask.cid)) return;
      this.#touch(ask.cid);
      let ok;
      if (ask.op === 'ask') {
        const prompt = this.#prompts.find((p) => p.id === ask.id);
        const outcome = this.#boards.ask(ask.id, ask.cid, ask.text, this.now(), { mode: prompt?.moderation ?? 'filter' });
        this.#tell(ask.cid, ask.id, outcome);
        ok = !!outcome && outcome !== 'filtered';
      } else ok = this.#boards.upvote(ask.id, ask.cid, ask.q);
      if (ok) this.#changed();
      return;
    }
    const vote = parseVote(raw, this.#prompts);
    if (!vote) return;
    if (!this.#admit(vote.cid)) return;
    this.#touch(vote.cid);
    const prompt = this.#prompts.find((p) => p.id === vote.id);
    const key = prompt.kind === 'quiz' ? this.#keys.get(prompt.id) : null;
    const limit = this.#limitOf(key);
    if (limit) { // a timed question: no answers after the clock, and the first answer stands
      const elapsed = (this.now() - (this.#askedAt.get(prompt.id) ?? this.now())) / 1000;
      if (elapsed > limit + 1) { this.#audience?.send({ t: 'score', cid: vote.cid, id: prompt.id, late: true }); return; }
      if (this.#board.answered(vote.cid, prompt.id)) return;
    }
    if (!this.#tally.vote(vote, prompt)) return;
    if (key && this.names) this.#score(vote, key, limit);
    this.#changed();
  }

  // Marks a quiz answer, banks the points, and tells that one phone how it did.
  #score(vote, key, limit) {
    const elapsedS = (this.now() - (this.#askedAt.get(vote.id) ?? this.now())) / 1000;
    if (!this.#board.has(vote.cid)) this.#board.join(vote.cid);
    const correct = isRight(key, vote.picks);
    const points = pointsFor({ correct, elapsedS, limitS: limit });
    this.#board.record(vote.cid, vote.id, { correct, points });
    const standing = this.#board.rankOf(vote.cid);
    this.#audience?.send({ t: 'score', cid: vote.cid, id: vote.id, correct, points, total: standing?.points ?? points, rank: standing?.rank ?? null, of: standing?.of ?? null });
  }

  #touch(cid) {
    if (this.#seen.size < 5000 || this.#seen.has(cid)) this.#seen.set(cid, this.now());
  }

  // May this phone take part? A phone already counted always may; a new one only while the room has space.
  // A phone that is turned away is told, at most once every ten seconds, so it can say so instead of
  // looking broken.
  #admit(cid) {
    this.audienceSize; // drop phones not heard from for a minute, which frees their places
    if (this.#seen.has(cid) || this.#seen.size < this.maxPhones) return true;
    const last = this.#full.get(cid) ?? 0;
    if (this.now() - last > 10_000) {
      this.#full.set(cid, this.now());
      this.#audience?.send({ t: 'full', cid, limit: this.maxPhones });
    }
    if (this.#full.size > 5000) this.#full.clear();
    return false;
  }

  #onRemote(raw) {
    if (raw?.t === 'hello') {
      this.#publishRemote();
      return;
    }
    const cmd = parseCommand(raw);
    const p = this.#player;
    if (!cmd || !p) return;
    p[cmd.op]();
  }

  // ---- outgoing --------------------------------------------------------------------

  #publishSoon() {
    if (this.#timer) return;
    this.#timer = setTimeout(() => this.#publishNow(), PUBLISH_DELAY_MS);
  }

  #publishNow() {
    clearTimeout(this.#timer);
    this.#timer = 0;
    if (!this.#audience) return;
    const counts = {};
    const data = {};
    for (const p of this.#prompts) {
      if (p.kind === 'ranking') counts[p.id] = this.#tally.scores(p.id, p.options.length);
      else if (CHOICE_KINDS.has(p.kind)) counts[p.id] = this.#tally.counts(p.id, p.options.length);
      else if (p.kind === 'cloud') data[p.id] = this.#boards.words(p.id);
      else if (p.kind === 'open') data[p.id] = this.#boards.responses(p.id);
      else if (p.kind === 'qna') data[p.id] = this.#boards.questions(p.id).slice(0, 100);
    }
    const remaining = {};
    for (const p of this.#prompts) {
      const left = this.remaining(p.id);
      if (left !== null) remaining[p.id] = left;
    }
    this.#audience.send({ t: 'state', session: this.sessionId, title: this.#player?.deck.meta.title ?? this.title, prompts: this.#prompts, counts, data, names: this.names, teams: this.teams, remaining });
    this.#publishRemote();
  }

  #publishRemote() {
    const p = this.#player;
    if (!p || !this.#remote) return;
    const { slide, step } = p.state;
    const slides = p.deck.slides;
    this.#remote.send({
      t: 'state',
      slide,
      total: slides.length,
      step,
      steps: p.nav.stepCounts[slide] ?? 0,
      title: slideTitle(slides[slide], slide),
      next: slides[slide + 1] ? slideTitle(slides[slide + 1], slide + 1) : '',
      notes: stripTags(slides[slide].notes ?? ''),
    });
  }
}
