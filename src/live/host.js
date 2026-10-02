// The presenter's side of a live room. It owns two channels: one for the
// audience (short code, answers only) and one for a phone remote (long secret,
// can move the slides). The presenter's page is the single source of truth: it
// decides which slide is current, which prompts are open, and what the totals are.

import { slideTitle } from '../core/schema.js';
import { stripTags } from '../core/util.js';
import { collectPrompts } from './prompts.js';
import {
  Tally, audienceChannel, remoteChannel, parseVote, parseCommand, parseHello,
} from './protocol.js';

const HOST_CID = 'host';
const PUBLISH_DELAY_MS = 250;
const SEEN_WINDOW_MS = 60_000;

export class LiveHost {
  #audience = null;
  #remote = null;
  #player = null;
  #detach = null;
  #prompts = [];
  #tally = new Tally();
  #seen = new Map(); // cid -> last time we heard from that phone
  #subs = new Set();
  #timer = 0;
  #status = 'idle';
  #statusSubs = new Set();
  #opened = { audience: false, remote: false };

  constructor({ transport, room, title = '', now = Date.now }) {
    this.title = title;
    this.transport = transport;
    this.room = room;
    this.now = now;
  }

  get status() { return this.#status; }
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
    this.#detach?.();
    this.#detach = null;
    this.#audience?.send({ t: 'state', ended: true });
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
    this.#prompts = p ? collectPrompts(p.deck.slides[p.state.slide]) : [];
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
    this.#changed();
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
      this.#touch(hello.cid);
      this.#publishSoon();
      return;
    }
    const vote = parseVote(raw, this.#prompts);
    if (!vote) return;
    this.#touch(vote.cid);
    const prompt = this.#prompts.find((p) => p.id === vote.id);
    if (this.#tally.vote(vote, prompt)) this.#changed();
  }

  #touch(cid) {
    if (this.#seen.size < 5000 || this.#seen.has(cid)) this.#seen.set(cid, this.now());
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
    for (const p of this.#prompts) counts[p.id] = this.#tally.counts(p.id, p.options.length);
    this.#audience.send({ t: 'state', title: this.#player?.deck.meta.title ?? this.title, prompts: this.#prompts, counts });
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
