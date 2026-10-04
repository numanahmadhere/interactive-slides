// The interactive tutorial on the home page: write a question, start a session, answer
// from a phone, watch the room. Nothing here talks to a server; it is a faithful toy of
// the real thing, so people can try it before they sign up.
//
// The first half is pure logic (tested in Node); the second half wires it to the page.

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

export const STEPS = [
  { id: 1, title: 'Write the question', hint: 'Edit the slide', task: 'Change the question or the options below. The slide and the phone update as you type.', next: 'Next: start the session' },
  { id: 2, title: 'Start the session', hint: 'Get a join code', task: 'Starting a session shows a join code. Phones that enter it see your question.', next: 'Next: answer from a phone' },
  { id: 3, title: 'Answer from a phone', hint: 'Tap an option', task: 'You are the audience now. Tap an option on the phone and watch your vote land on the slide.', next: 'Next: watch the room' },
  { id: 4, title: 'Watch the room', hint: 'See results build', task: 'A real room adds up quickly. Add 24 more people and watch the totals settle.', next: 'Add 24 people' },
];

// ---- the page ------------------------------------------------------------------------

function mount(root) {
  const $ = (id) => root.querySelector(`#${id}`);
  const poll = new Poll();
  const state = { step: 1, started: false, crowded: false, timers: [] };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const code = '5F5BLZ';

  const els = {
    nav: [...root.querySelectorAll('[data-go]')],
    task: $('tut-task'), q: $('tut-q'), bars: $('tut-bars'), count: $('tut-count'), code: $('tut-code'),
    phoneState: $('tut-phone-state'), phoneQ: $('tut-phone-q'), opts: $('tut-opts'),
    form: $('tut-form'), question: $('tut-question'), optionInputs: [...root.querySelectorAll('[data-opt]')],
    back: $('tut-back'), act: $('tut-act'), done: $('tut-done'),
  };

  const clearTimers = () => { state.timers.forEach(clearTimeout); state.timers = []; };

  function renderScreen() {
    els.q.textContent = poll.question;
    els.code.textContent = state.started ? `Join with ${code}` : 'Not started';
    els.code.dataset.live = String(state.started);
    els.bars.replaceChildren(...poll.options.map((text, i) => {
      const row = document.createElement('li');
      row.className = 'tbar';
      row.style.setProperty('--w', `${poll.percent(i)}%`);
      if (poll.leader === i && poll.total > 1) row.dataset.lead = 'true';
      const label = document.createElement('span');
      label.className = 'tbar__label';
      label.textContent = text;
      const pct = document.createElement('b');
      pct.textContent = state.started && poll.total ? `${poll.percent(i)}%` : '';
      row.append(label, pct);
      return row;
    }));
    const n = poll.total;
    els.count.textContent = !state.started ? 'Session not started'
      : n ? `${n} ${n === 1 ? 'response' : 'responses'}${poll.leader !== null && n > 1 ? `. Leading: ${poll.options[poll.leader]}, ${poll.percent(poll.leader)}%.` : '.'}`
        : 'Waiting for responses.';
  }

  function renderPhone() {
    els.phoneQ.textContent = state.started ? poll.question : '';
    els.phoneState.textContent = !state.started ? 'Enter the join code to connect.' : poll.you === null ? 'Tap your answer.' : 'Answer sent. Tap another option to change it.';
    els.opts.replaceChildren(...(state.started ? poll.options : []).map((text, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'topt';
      b.setAttribute('aria-pressed', String(poll.you === i));
      const key = document.createElement('i');
      key.textContent = String.fromCharCode(65 + i);
      b.append(key, document.createTextNode(text));
      b.addEventListener('click', () => { poll.setYou(i); render(); });
      return b;
    }));
  }

  function renderForm() {
    els.form.hidden = state.step !== 1;
    els.optionInputs.forEach((input, i) => { input.hidden = false; input.setAttribute('aria-label', `Option ${i + 1}`); });
  }

  function renderNav() {
    els.nav.forEach((b) => {
      const n = Number(b.dataset.go);
      b.setAttribute('aria-current', n === state.step ? 'step' : 'false');
      b.dataset.done = String(n < state.step);
    });
    const step = STEPS[state.step - 1];
    els.task.textContent = step.task;
    els.back.disabled = state.step === 1;
    els.act.textContent = state.step === 4 && state.crowded ? 'Start over' : state.step === 2 && !state.started ? 'Start session' : step.next;
    els.done.hidden = !(state.step === 4 && state.crowded);
  }

  function render() {
    renderNav();
    renderForm();
    renderScreen();
    renderPhone();
  }

  function go(n) {
    state.step = Math.min(4, Math.max(1, n));
    if (state.step >= 3) state.started = true; // jumping ahead should not leave a dead phone
    render();
  }

  function addCrowd() {
    clearTimers();
    state.crowded = true;
    const weights = crowdWeights(poll.options.length);
    const votes = Array.from({ length: CROWD_SIZE }, () => pickWeighted(weights));
    if (reduced) { votes.forEach((v) => poll.addCrowd(v)); render(); return; }
    votes.forEach((v, k) => state.timers.push(setTimeout(() => { poll.addCrowd(v); renderScreen(); }, 90 * k)));
    state.timers.push(setTimeout(render, 90 * CROWD_SIZE + 20));
    render();
  }

  function restart() {
    clearTimers();
    poll.reset();
    state.started = false;
    state.crowded = false;
    go(1);
  }

  els.nav.forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.go))));
  els.back.addEventListener('click', () => go(state.step - 1));
  els.act.addEventListener('click', () => {
    if (state.step === 1) go(2);
    else if (state.step === 2) { if (!state.started) { state.started = true; render(); } else go(3); }
    else if (state.step === 3) go(4);
    else if (!state.crowded) addCrowd();
    else restart();
  });
  const onEdit = () => { poll.edit(els.question.value, els.optionInputs.map((i) => i.value)); renderScreen(); renderPhone(); };
  els.question.addEventListener('input', onEdit);
  els.optionInputs.forEach((i) => i.addEventListener('input', onEdit));

  els.question.value = poll.question;
  els.optionInputs.forEach((input, i) => { input.value = poll.options[i] ?? ''; });
  render();
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('tut');
  if (root) mount(root);
}
