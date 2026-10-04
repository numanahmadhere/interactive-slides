// The interactive tutorial on the home page: write a question, start a session, answer
// from a phone, watch the room. Nothing here talks to a server; it is a faithful toy of
// the real thing, so people can try it before they sign up.
//
// The first half is pure logic (tested in Node); the second half wires it to the page.
// Flow is the state machine for the four steps; mount() only draws what it says.

export const MAX_OPTIONS = 4;
export const MIN_OPTIONS = 2;
export const CROWD_SIZE = 24;
export const DEFAULT_QUESTION = 'Which topic should we cover first?';
export const DEFAULT_OPTIONS = ['Budget review', 'Hiring plan', 'Client feedback'];

// Trim, drop blanks and duplicates, cap the count; always return at least two options.
export function cleanOptions(raw) {
  const seen = new Set();
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const text = String(item ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (!text || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
    if (out.length === MAX_OPTIONS) break;
  }
  for (const filler of ['Option A', 'Option B']) if (out.length < MIN_OPTIONS && !out.includes(filler)) out.push(filler);
  return out;
}

export const cleanQuestion = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 120) || DEFAULT_QUESTION;

// Pick an option index by weight. rand() returns [0, 1).
export function pickWeighted(weights, rand = Math.random) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

// The crowd leans towards the first options, like a real room tends to.
export const crowdWeights = (n) => Array.from({ length: n }, (_, i) => 1 / (i + 1.4));

// One poll: your own answer (one at a time, changeable) plus however many others have voted.
export class Poll {
  constructor(question = DEFAULT_QUESTION, options = DEFAULT_OPTIONS) {
    this.question = cleanQuestion(question);
    this.options = cleanOptions(options);
    this.you = null;
    this.crowd = new Array(this.options.length).fill(0);
  }

  // The editor changed the wording: keep votes that still make sense by position.
  edit(question, options) {
    this.question = cleanQuestion(question);
    const next = cleanOptions(options);
    const crowd = next.map((_, i) => this.crowd[i] ?? 0);
    this.you = this.you !== null && this.you < next.length ? this.you : null;
    this.options = next;
    this.crowd = crowd;
  }

  setYou(i) {
    this.you = Number.isInteger(i) && i >= 0 && i < this.options.length ? i : this.you;
  }

  addCrowd(i) {
    if (Number.isInteger(i) && i >= 0 && i < this.options.length) this.crowd[i]++;
  }

  get counts() {
    return this.options.map((_, i) => this.crowd[i] + (this.you === i ? 1 : 0));
  }

  get total() {
    return this.counts.reduce((a, b) => a + b, 0);
  }

  percent(i) {
    return this.total ? Math.round((this.counts[i] / this.total) * 100) : 0;
  }

  get leader() {
    if (!this.total) return null;
    const c = this.counts;
    const top = Math.max(...c);
    return c.indexOf(top);
  }

  reset() {
    this.you = null;
    this.crowd = new Array(this.options.length).fill(0);
  }
}

export const JOIN_CODE = '5F5BLZ';

// What people type into the phone: letters and digits, upper case, six at most.
export const cleanCode = (raw) => String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);

export const STEPS = [
  { id: 1, title: 'Write the question', hint: 'Edit the slide' },
  { id: 2, title: 'Start the session', hint: 'Get a join code' },
  { id: 3, title: 'Answer from a phone', hint: 'Tap an option' },
  { id: 4, title: 'Watch the room', hint: 'See results build' },
];

// The four steps as a small state machine. It never touches the page, so every path
// through the tutorial can be tested: step, whether the session is running, whether the
// phone has joined, and whether the crowd has arrived.
export class Flow {
  constructor() {
    this.reset();
  }

  reset() {
    this.step = 1;
    this.started = false;
    this.joined = false;
    this.crowded = false;
  }

  // Jumping ahead should never leave a dead phone: later steps assume a running session.
  go(n) {
    this.step = Math.min(STEPS.length, Math.max(1, Math.trunc(Number(n)) || 1));
    if (this.step >= 3) {
      this.started = true;
      this.joined = true;
    }
    return this.step;
  }

  start() {
    this.started = true;
  }

  // Try a code on the phone. -> 'ok' | 'wrong' | 'early' | 'short'
  join(raw) {
    const code = cleanCode(raw);
    if (code.length < 6) return 'short';
    if (code !== JOIN_CODE) return 'wrong';
    if (!this.started) return 'early';
    this.joined = true;
    return 'ok';
  }

  // The main button. -> what the page should do next.
  primary() {
    if (this.step === 1) return { do: 'go', to: 2 };
    if (this.step === 2) {
      if (!this.started) return { do: 'start' };
      if (!this.joined) return { do: 'join-for-me' };
      return { do: 'go', to: 3 };
    }
    if (this.step === 3) return { do: 'go', to: 4 };
    return this.crowded ? { do: 'open-app' } : { do: 'crowd' };
  }

  // Everything the page shows that depends on where you are. `voted`: you have tapped an answer.
  view({ voted = false, total = 25, busy = false } = {}) {
    const v = { step: this.step, back: this.step > 1, replay: this.step === 4 && this.crowded };
    if (this.step === 1) {
      v.task = 'Write your question and up to four answers. The slide and the phone change as you type.';
      v.label = 'Next: start the session';
    } else if (this.step === 2) {
      if (!this.started) {
        v.task = 'Press Start session. A join code appears on your screen for the room to type in.';
        v.label = 'Start session';
      } else if (!this.joined) {
        v.task = 'The code is on the presenter screen. Type it into the phone and press Join, just as your audience would.';
        v.label = 'Join the phone for me';
      } else {
        v.task = 'Connected. Anyone who joins sees your question the moment you show the slide.';
        v.label = 'Next: answer from the phone';
      }
    } else if (this.step === 3) {
      v.task = voted
        ? 'Your vote has landed on the slide. Tap another answer to change it, or carry on.'
        : 'You are the audience now. Tap an answer on the phone and watch it land on the slide.';
      v.label = voted ? 'Next: watch the room' : 'Skip voting';
    } else {
      v.task = this.crowded
        ? `That is a room of ${total}. Everyone answered from their own phone and nothing was installed.`
        : 'A real room adds up quickly. Add 24 more people and watch the totals settle.';
      v.label = this.crowded ? 'Build your own poll' : busy ? 'People are joining...' : 'Add 24 people';
    }
    return v;
  }
}

// ---- the page ------------------------------------------------------------------------

const JOIN_MESSAGES = {
  short: 'Codes have six characters.',
  wrong: 'That code does not match. Check the presenter screen.',
  early: 'No session is running yet. Start one on the presenter screen first.',
};

function mount(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const poll = new Poll();
  const flow = new Flow();
  const timers = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const els = {
    nav: [...root.querySelectorAll('[data-go]')],
    task: $('tut-task'), q: $('tut-q'), bars: $('tut-bars'), count: $('tut-count'), code: $('tut-code'), announce: $('tut-announce'),
    joinForm: $('tut-join'), joinInput: $('tut-code-in'), joinMsg: $('tut-join-msg'), fill: $('tut-fill'), joined: $('tut-joined'),
    phoneQ: $('tut-phone-q'), phoneState: $('tut-phone-state'), opts: $('tut-opts'),
    form: $('tut-form'), question: $('tut-question'), optionInputs: [...root.querySelectorAll('[data-opt]')],
    back: $('tut-back'), act: $('tut-act'), open: $('tut-open'), replay: $('tut-replay'),
  };
  let joinMessage = '';
  let crowdBusy = false;

  const clearTimers = () => { timers.splice(0).forEach(clearTimeout); crowdBusy = false; };
  const say = (text) => { els.announce.textContent = ''; setTimeout(() => { els.announce.textContent = text; }, 40); };
  const summary = () => (poll.total > 1 && poll.leader !== null
    ? `${poll.total} responses. Leading: ${poll.options[poll.leader]}, ${poll.percent(poll.leader)}%.`
    : poll.total ? '1 response.' : 'Waiting for responses.');

  function renderScreen() {
    els.q.textContent = poll.question;
    els.code.textContent = flow.started ? `Join with ${JOIN_CODE}` : 'Not started';
    els.code.dataset.live = String(flow.started);
    els.bars.replaceChildren(...poll.options.map((text, i) => {
      const row = document.createElement('li');
      row.className = 'tbar';
      row.style.setProperty('--w', `${flow.started ? poll.percent(i) : 0}%`);
      if (flow.started && poll.leader === i && poll.total > 1) row.dataset.lead = 'true';
      const label = document.createElement('span');
      label.className = 'tbar__label';
      label.textContent = text;
      const pct = document.createElement('b');
      pct.textContent = flow.started && poll.total ? `${poll.percent(i)}%` : '';
      row.append(label, pct);
      return row;
    }));
    els.count.textContent = !flow.started ? 'Session not started' : summary();
  }

  function renderPhone() {
    const joined = flow.joined;
    els.joinForm.hidden = joined;
    els.joined.hidden = !joined;
    els.fill.hidden = !flow.started || joined;
    els.joinMsg.textContent = joinMessage;
    if (!joined) return;
    els.phoneQ.textContent = poll.question;
    els.phoneState.textContent = poll.you === null ? 'Tap your answer.' : 'Answer sent. Tap another to change it.';
    els.opts.dataset.nudge = String(flow.step === 3 && poll.you === null);
    els.opts.replaceChildren(...poll.options.map((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'topt';
      b.setAttribute('aria-pressed', String(poll.you === i));
      const key = document.createElement('i');
      key.textContent = String.fromCharCode(65 + i);
      b.append(key, document.createTextNode(text));
      b.addEventListener('click', () => {
        const first = poll.you === null;
        poll.setYou(i);
        render();
        say(first ? `Answer sent: ${text}. ${summary()}` : `Changed to ${text}.`);
      });
      return b;
    }));
  }

  function renderNav(view) {
    els.nav.forEach((b) => {
      const n = Number(b.dataset.go);
      b.setAttribute('aria-current', n === flow.step ? 'step' : 'false');
      b.dataset.done = String(n < flow.step);
    });
    els.task.textContent = view.task;
    els.back.disabled = !view.back;
    const final = view.step === 4 && flow.crowded;
    els.act.hidden = final;
    els.open.hidden = !final;
    els.replay.hidden = !view.replay;
    els.act.textContent = view.label;
    els.act.disabled = crowdBusy;
    els.act.dataset.quiet = String(view.step === 3 && poll.you === null);
    els.form.hidden = flow.step !== 1;
  }

  function render() {
    renderNav(flow.view({ voted: poll.you !== null, total: poll.total, busy: crowdBusy }));
    renderScreen();
    renderPhone();
  }

  function go(n) {
    clearTimers();
    flow.go(n);
    joinMessage = '';
    render();
  }

  function addCrowd() {
    if (crowdBusy) return;
    clearTimers();
    const weights = crowdWeights(poll.options.length);
    const votes = Array.from({ length: CROWD_SIZE }, () => pickWeighted(weights));
    const finish = () => { crowdBusy = false; flow.crowded = true; render(); say(`The room has answered. ${summary()}`); els.open.focus(); };
    if (reduced) { votes.forEach((v) => poll.addCrowd(v)); finish(); return; }
    crowdBusy = true;
    votes.forEach((v, k) => timers.push(setTimeout(() => { poll.addCrowd(v); renderScreen(); }, 90 * k)));
    timers.push(setTimeout(finish, 90 * CROWD_SIZE + 20));
    render();
  }

  function restart() {
    clearTimers();
    poll.reset();
    flow.reset();
    joinMessage = '';
    els.joinInput.value = '';
    render();
    els.act.focus();
  }

  function tryJoin() {
    const result = flow.join(els.joinInput.value);
    joinMessage = result === 'ok' ? '' : JOIN_MESSAGES[result];
    render();
    if (result === 'ok') { say('Connected to the session.'); els.opts.querySelector('button')?.focus?.(); }
    else els.joinInput.focus();
  }

  els.nav.forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
  els.back.addEventListener('click', () => go(flow.step - 1));
  els.act.addEventListener('click', () => {
    const next = flow.primary();
    if (next.do === 'go') go(next.to);
    else if (next.do === 'start') { flow.start(); joinMessage = ''; render(); say(`Session started. The join code is ${JOIN_CODE.split('').join(' ')}.`); }
    else if (next.do === 'join-for-me') { els.joinInput.value = JOIN_CODE; tryJoin(); }
    else if (next.do === 'crowd') addCrowd();
  });
  els.replay.addEventListener('click', restart);
  els.fill.addEventListener('click', () => { els.joinInput.value = JOIN_CODE; els.joinInput.focus(); });
  els.joinForm.addEventListener('submit', (e) => { e.preventDefault(); tryJoin(); });
  els.joinInput.addEventListener('input', () => {
    const at = els.joinInput.selectionStart;
    els.joinInput.value = cleanCode(els.joinInput.value);
    els.joinInput.setSelectionRange(at, at);
    if (joinMessage) { joinMessage = ''; els.joinMsg.textContent = ''; }
  });
  const onEdit = () => { poll.edit(els.question.value, els.optionInputs.map((i) => i.value)); renderScreen(); renderPhone(); };
  els.question.addEventListener('input', onEdit);
  els.optionInputs.forEach((i) => i.addEventListener('input', onEdit));
  els.form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); els.act.click(); } });

  els.question.value = poll.question;
  els.optionInputs.forEach((input, i) => { input.value = poll.options[i] ?? ''; });
  render();
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('tut');
  if (root) mount(root);
}
