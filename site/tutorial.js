// The interactive tutorial at the top of the home page. Four kinds of question sit in a list;
// pointing at one shows it running: your screen on the right, a participant's phone beside it.
// You can answer on the phone and watch your own answer land, while a small simulated room
// answers around you. Nothing here talks to a server.
//
// The first half is plain logic (tested in Node); the second half draws it.

export const JOIN_CODE = '5F5BLZ';

export const TYPES = [
  { id: 'cloud', name: 'Word Cloud', blurb: 'Visualize what people think, in real time' },
  { id: 'quiz', name: 'Quiz', blurb: 'Test participants with questions that have set correct answers' },
  { id: 'poll', name: 'Poll', blurb: 'Let your participants vote on set options' },
  { id: 'open', name: 'Open Ended', blurb: 'Collect and display responses in their own words' },
];

export const SCENES = {
  cloud: {
    question: 'What are you hoping to get out of this meeting?',
    seed: [['clarity', 6], ['alignment', 5], ['ideas', 4], ['focus', 4], ['inspiration', 3], ['decisions', 2], ['energy', 1]],
    crowd: ['clarity', 'ideas', 'focus', 'alignment', 'next steps', 'learning', 'trust', 'direction', 'answers', 'teamwork', 'speed', 'clarity', 'focus'],
  },
  quiz: { question: 'What is the capital of Australia?', options: ['Sydney', 'Canberra', 'Melbourne'], correct: 1, timeLimit: 15, room: 11 },
  poll: { question: 'Which topic should we cover first?', options: ['Budget review', 'Hiring plan', 'Client feedback'], seed: [7, 4, 3] },
  open: {
    question: 'What is one thing we should change?',
    seed: ['Shorter meetings, please', 'More time for questions'],
    crowd: ['Share the slides beforehand', 'Fewer slides, more discussion', 'A clearer agenda', 'Start on time', 'Send a summary afterwards', 'Let us vote on the topics'],
  },
};

export const cleanWord = (raw) => String(raw ?? '').toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 24);
export const cleanText = (raw) => String(raw ?? '').replace(/\s+/g, ' ').trim().slice(0, 140);

const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

// ---- word cloud ------------------------------------------------------------------------

export class CloudDemo {
  constructor(seed = SCENES.cloud.seed) {
    this.counts = new Map(seed);
    this.mine = new Set();
    this.crowdAt = 0;
  }

  add(raw, fromYou = false) {
    const word = cleanWord(raw);
    if (!word) return null;
    if (fromYou) {
      if (this.mine.size >= 3 || this.mine.has(word)) return null;
      this.mine.add(word);
    }
    this.counts.set(word, (this.counts.get(word) ?? 0) + 1);
    return word;
  }

  crowdStep(list = SCENES.cloud.crowd) {
    this.add(list[this.crowdAt % list.length]);
    this.crowdAt++;
  }

  get total() { return [...this.counts.values()].reduce((a, b) => a + b, 0); }

  // Biggest first, sizes by square root so one popular word does not drown the rest. The same words always get
  // the same turn and colour, so the cloud does not reshuffle when a vote arrives.
  layout(max = 24) {
    const words = [...this.counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max);
    const top = Math.max(1, ...words.map((w) => w[1]));
    return words.map(([word, n]) => ({ word, n, size: Math.round((1 + 1.9 * Math.sqrt(n / top)) * 100) / 100, turn: hash(word) % 6 === 0, hue: hash(word) % 5, mine: this.mine.has(word) }))
      .sort((a, b) => hash(a.word) - hash(b.word));
  }
}

// ---- poll ------------------------------------------------------------------------------

export class PollDemo {
  constructor(options = SCENES.poll.options, seed = SCENES.poll.seed) {
    this.options = options;
    this.counts = options.map((_, i) => seed[i] ?? 0);
    this.you = null;
  }

  vote(i) {
    if (!Number.isInteger(i) || i < 0 || i >= this.options.length || i === this.you) return false;
    if (this.you !== null) this.counts[this.you]--;
    this.counts[i]++;
    this.you = i;
    return true;
  }

  crowdStep(rand = Math.random) {
    const w = this.options.map((_, i) => 1 / (i + 1.3));
    let r = rand() * w.reduce((a, b) => a + b, 0);
    let i = 0;
    for (; i < w.length - 1; i++) { r -= w[i]; if (r < 0) break; }
    this.counts[i]++;
  }

  get total() { return this.counts.reduce((a, b) => a + b, 0); }
  percent(i) { return this.total ? Math.round((this.counts[i] / this.total) * 100) : 0; }
}

// ---- quiz ------------------------------------------------------------------------------

// 1000 points for an instant right answer down to 500 at the buzzer, nothing for a wrong one.
export const quizPoints = (right, elapsed, limit) => (right ? Math.round(500 + 500 * Math.max(0, 1 - elapsed / limit)) : 0);

export class QuizDemo {
  constructor({ options, correct, timeLimit, room } = SCENES.quiz) {
    this.options = options;
    this.correct = correct;
    this.timeLimit = timeLimit;
    this.room = room; // people besides you
    this.counts = options.map(() => 0);
    this.others = 0;
    this.you = null;
    this.points = 0;
    this.revealed = false;
  }

  get voted() { return this.others + (this.you === null ? 0 : 1); }
  get everyone() { return this.voted >= this.room + 1; }

  answer(i, elapsed = 0) {
    if (this.revealed || this.you !== null || !Number.isInteger(i) || i < 0 || i >= this.options.length) return false;
    this.you = i;
    this.counts[i]++;
    this.points = quizPoints(i === this.correct, elapsed, this.timeLimit);
    return true;
  }

  // Most of the room gets it right, as a real one does.
  crowdStep(rand = Math.random) {
    if (this.revealed || this.others >= this.room) return;
    const right = rand() < 0.62;
    let i = this.correct;
    if (!right) { const wrong = this.options.map((_, k) => k).filter((k) => k !== this.correct); i = wrong[Math.floor(rand() * wrong.length) % wrong.length]; }
    this.counts[i]++;
    this.others++;
  }

  reveal() { this.revealed = true; }
}

// ---- open ended ------------------------------------------------------------------------

export class OpenDemo {
  constructor(seed = SCENES.open.seed) {
    this.items = seed.map((text) => ({ text, mine: false }));
    this.crowdAt = 0;
    this.mineCount = 0;
  }

  add(raw, fromYou = false) {
    const text = cleanText(raw);
    if (!text) return null;
    if (fromYou) { if (this.mineCount >= 3) return null; this.mineCount++; }
    this.items.unshift({ text, mine: fromYou });
    this.items = this.items.slice(0, 8);
    return text;
  }

  crowdStep(list = SCENES.open.crowd) {
    if (this.crowdAt < list.length) this.add(list[this.crowdAt]);
    this.crowdAt++;
  }

  get total() { return this.items.length; }
}

export function makeDemo(type, { empty = false } = {}) {
  if (type === 'cloud') return new CloudDemo(empty ? [] : undefined);
  if (type === 'quiz') return new QuizDemo();
  if (type === 'poll') return new PollDemo(SCENES.poll.options, empty ? [0, 0, 0] : SCENES.poll.seed);
  if (type === 'open') return new OpenDemo(empty ? [] : undefined);
  throw new Error(`Unknown demo "${type}"`);
}

// ---- the tour --------------------------------------------------------------------------------------------------------
// A guided run through the whole flow, in four steps: write the question, go live, answer on a phone, watch the room.
// It plays by itself (a ghost pointer does the clicking and typing), you can jump to any step, and at the end it hands
// over: the same screen and phone become yours to use.

const TICK_MS = 250;
const CROWD_EVERY = 6; // ticks, so every 1.5 seconds
const REVEAL_PAUSE_TICKS = 28;
const SWAP_MS = 170;
const HOVER_INTENT_MS = 120;
const CANCELLED = Symbol('cancelled');

const CAPTIONS = [
  ['Write the question', 'Put it on a slide and choose how people answer.'],
  ['Go live', 'Press Go live. People join with a code or a QR code.'],
  ['Answer on a phone', 'No app and no account. Tap or type, and it counts.'],
  ['Watch the room', 'Results build on your screen as people answer.'],
];
const CAPTION_PLAY = ['Your turn', 'Answer on the phone and watch it land on the big screen.'];
const TOOL_OF = { cloud: 'cloud', quiz: 'quiz', poll: 'poll', open: 'open' };

function mount(root) {
  const $ = (sel) => root.querySelector(sel);
  const cards = [...root.querySelectorAll('[data-type]')];
  const stepBtns = [...root.querySelectorAll('#show-steps [data-step]')];
  const slide = $('#show-slide');
  const phone = $('#show-phone');
  const announce = $('#show-announce');
  const stage = $('.show__stage');
  const device = $('.tour__device');
  const win = $('#show-window');
  const join = $('#show-join');
  const ghost = $('#show-ghost');
  const people = $('#show-people');
  const clock = $('#show-clock');
  const caption = $('#show-caption');
  const hint = $('#show-hint');
  const goLive = $('#show-golive');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover)').matches;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  let type = 'cloud';
  let demo = makeDemo(type, { empty: true });
  let mode = 'tour'; // 'tour' | 'play'
  let token = 0; // bumped whenever the tour is cancelled or restarted
  let ticks = 0;
  let revealAt = 0;
  let timer = 0;
  let clockTimer = 0;
  let clockStart = 0;
  let visible = false;
  let started = false;
  let note = '';
  let ui = {};
  let swapTimer = 0;
  let phoneView = 'join'; // 'join' | 'joining' | 'question'
  let joinText = '';

  const elapsed = () => ticks * TICK_MS / 1000;
  const say = (text) => { announce.textContent = text; };

  // ---- waiting that can be cancelled and that holds still while the demo is off screen
  const waitFor = async (my, ms) => {
    let left = ms;
    while (left > 0) {
      if (my !== token) throw CANCELLED;
      if (!visible) { await new Promise((r) => setTimeout(r, 200)); continue; }
      const t = Math.min(80, left);
      await new Promise((r) => setTimeout(r, t));
      left -= t;
    }
    if (my !== token) throw CANCELLED;
  };

  // ---- small effects
  function tween(node, to) {
    const from = Number(node.dataset.v ?? node.textContent) || 0;
    node.dataset.v = String(to);
    if (reduced || from === to) { node.textContent = String(to); return; }
    const start = performance.now();
    const run = (now) => {
      const t = Math.min(1, (now - start) / 450);
      node.textContent = String(Math.round(from + (to - from) * (1 - (1 - t) ** 3)));
      if (t < 1 && node.dataset.v === String(to)) requestAnimationFrame(run);
    };
    requestAnimationFrame(run);
  }

  const setPeople = (n) => tween(people, n);

  // a small dot travels from the phone to the big screen
  function fly() {
    hint.classList.add('is-gone');
    if (reduced) return;
    const s = device.getBoundingClientRect();
    const a = phone.getBoundingClientRect();
    const b = slide.getBoundingClientRect();
    const dot = el('span', 'show__fly');
    dot.style.left = `${a.left - s.left + a.width / 2}px`;
    dot.style.top = `${a.top - s.top + a.height / 3}px`;
    device.append(dot);
    const dx = b.left - a.left + b.width * 0.55 - a.width / 2;
    const dy = b.top - a.top + b.height * 0.4 - a.height / 3;
    dot.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 70}px) scale(1.6)`, opacity: 1, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) scale(.3)`, opacity: 0 }], { duration: 800, easing: 'cubic-bezier(.3,.7,.3,1)' }).finished.then(() => dot.remove(), () => dot.remove());
  }

  function confetti() {
    if (reduced) return;
    const box = $('.win__canvas');
    const colours = ['#2020E8', '#FF7FAE', '#F5B93B', '#1F9D55', '#6A3FC2', '#E8643C'];
    for (let i = 0; i < 26; i++) {
      const c = el('span', 'show__conf');
      c.style.cssText = `left:${10 + Math.random() * 80}%;background:${colours[i % colours.length]};--dx:${(Math.random() - 0.5) * 200}px;--r:${Math.random() * 720 - 360}deg;animation-delay:${Math.random() * 0.3}s`;
      box.append(c);
      setTimeout(() => c.remove(), 2200);
    }
  }

  // ---- the ghost pointer: it moves to things and taps them
  function ghostTo(target, { fx = 0.5, fy = 0.5 } = {}) {
    if (!target) return Promise.resolve();
    const d = device.getBoundingClientRect();
    const r = target.getBoundingClientRect();
    ghost.classList.add('is-on');
    ghost.style.transform = `translate(${Math.round(r.left - d.left + r.width * fx)}px, ${Math.round(r.top - d.top + r.height * fy)}px)`;
    return new Promise((res) => setTimeout(res, reduced ? 0 : 750));
  }
  async function ghostTap(my, target, opts) {
    await ghostTo(target, opts);
    if (my !== token) throw CANCELLED;
    ghost.classList.add('is-tap');
    await waitFor(my, 180);
    ghost.classList.remove('is-tap');
    target?.click?.();
  }
  const ghostAway = () => ghost.classList.remove('is-on');

  async function typeText(my, write, text, speed = 55) {
    for (let i = 1; i <= text.length; i++) {
      write(text.slice(0, i));
      await waitFor(my, reduced ? 0 : speed);
    }
  }

  // ---- the big screen: built once, then updated in place
  function buildScreen() {
    const scene = SCENES[type];
    ui = { q: el('h2', 'show__q', scene.question), nodes: new Map() };
    slide.replaceChildren(ui.q);
    if (type === 'cloud') {
      ui.cloud = el('div', 'show__cloud');
      ui.cloud.setAttribute('role', 'img');
      ui.count = el('p', 'show__count');
      slide.append(ui.cloud, ui.count);
    } else if (type === 'poll') {
      ui.list = el('ul', 'show__bars');
      demo.options.forEach((text, i) => {
        const row = el('li', 'show__bar');
        const fill = el('span', 'show__fill');
        const pct = el('span', 'show__pct', '0%');
        row.append(el('span', 'show__key', String.fromCharCode(65 + i)), fill, el('span', 'show__label', text), pct);
        ui.list.append(row);
        ui.nodes.set(row, { fill, pct });
      });
      ui.count = el('p', 'show__count');
      slide.append(ui.list, ui.count);
    } else if (type === 'quiz') {
      ui.status = el('p', 'show__status');
      ui.cols = el('div', 'show__cols');
      demo.options.forEach((text, i) => {
        const col = el('div', 'show__col');
        const n = el('span', 'show__n', '0');
        col.append(n, el('span', 'show__rule'), el('span', 'show__label', text));
        ui.cols.append(col);
        ui.nodes.set(i, { col, n });
      });
      slide.append(ui.status, ui.cols);
    } else {
      ui.list = el('ul', 'show__notes');
      ui.count = el('p', 'show__count');
      slide.append(ui.list, ui.count);
    }
    updateScreen(true);
  }

  function updateScreen(firstPaint = false) {
    if (type === 'cloud') {
      const words = demo.layout();
      const before = new Map([...ui.nodes].map(([k, n]) => [k, n.getBoundingClientRect()]));
      const keep = new Set(words.map((w) => w.word));
      for (const [k, n] of ui.nodes) if (!keep.has(k)) { n.remove(); ui.nodes.delete(k); }
      words.forEach((w) => {
        let n = ui.nodes.get(w.word);
        if (!n) { n = el('span', 'show__word', w.word); ui.nodes.set(w.word, n); if (!firstPaint) n.classList.add('is-new'); }
        n.dataset.hue = w.hue;
        n.classList.toggle('is-turned', w.turn);
        n.classList.toggle('is-mine', w.mine);
        n.style.fontSize = `${w.size}em`;
        ui.cloud.append(n);
      });
      if (!reduced) {
        for (const [k, n] of ui.nodes) {
          const old = before.get(k);
          if (!old) continue;
          const now = n.getBoundingClientRect();
          const dx = old.left - now.left;
          const dy = old.top - now.top;
          if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
          n.style.transition = 'none';
          n.style.transform = `translate(${dx}px, ${dy}px)${n.classList.contains('is-turned') ? ' rotate(180deg)' : ''}`;
          requestAnimationFrame(() => requestAnimationFrame(() => { n.style.transition = ''; n.style.transform = ''; }));
        }
      }
      ui.cloud.setAttribute('aria-label', `Word cloud of ${demo.total} words`);
      ui.count.textContent = demo.total ? `${demo.total} ${demo.total === 1 ? 'word' : 'words'}` : 'Waiting for words';
    } else if (type === 'poll') {
      let i = 0;
      for (const [row, { fill, pct }] of ui.nodes) {
        const p = demo.percent(i);
        fill.style.width = `${p}%`;
        pct.textContent = `${p}%`;
        row.classList.toggle('is-mine', demo.you === i);
        i++;
      }
      ui.count.textContent = demo.total ? `${demo.total} responses` : 'Waiting for votes';
    } else if (type === 'quiz') {
      ui.status.textContent = demo.revealed ? `The answer is ${demo.options[demo.correct]}` : demo.everyone ? 'Everyone has voted!' : `${demo.voted} of ${demo.room + 1} have answered`;
      ui.status.classList.toggle('is-done', demo.revealed || demo.everyone);
      demo.options.forEach((_, i) => {
        const { col, n } = ui.nodes.get(i);
        tween(n, demo.counts[i]);
        col.classList.toggle('is-right', demo.revealed && i === demo.correct);
        col.classList.toggle('is-wrong', demo.revealed && i !== demo.correct);
        col.classList.toggle('is-mine', demo.you === i);
      });
    } else {
      const items = demo.items;
      const keep = new Set(items);
      for (const [item, n] of ui.nodes) if (!keep.has(item)) { n.remove(); ui.nodes.delete(item); }
      [...items].reverse().forEach((item) => {
        let n = ui.nodes.get(item);
        if (!n) { n = el('li', 'show__note', item.text); ui.nodes.set(item, n); if (!firstPaint) n.classList.add('is-new'); }
        n.classList.toggle('is-mine', item.mine);
      });
      items.forEach((item, i) => { const n = ui.nodes.get(item); if (ui.list.children[i] !== n) ui.list.insertBefore(n, ui.list.children[i] ?? null); });
      ui.count.textContent = demo.total ? `${demo.total} responses` : 'Waiting for answers';
    }
  }

  // ---- the phone
  function drawPhone() {
    const scene = SCENES[type];
    if (phoneView === 'join' || phoneView === 'joining') {
      const field = el('div', `show__code${joinText ? '' : ' is-empty'}`, joinText || 'Enter code');
      const go = el('button', 'show__send', phoneView === 'joining' ? 'Joining...' : 'Join');
      go.type = 'button';
      go.tabIndex = -1;
      phone.replaceChildren(el('p', 'phone__q', 'Join a presentation'), el('p', 'show__codehelp', 'Enter the code on the screen'), field, go);
      if (phoneView === 'joining') { const j = el('div', 'show__joining'); j.append(el('span', 'show__spin')); phone.append(j); }
      return;
    }
    const focusedOpt = [...phone.querySelectorAll('.show__opt')].indexOf(document.activeElement);
    const hadInput = document.activeElement?.id === 'show-input';
    const kids = [el('p', 'phone__q', scene.question)];
    if (type === 'cloud' || type === 'open') {
      const form = el('form', 'show__form');
      form.setAttribute('autocomplete', 'off');
      const input = type === 'cloud' ? el('input') : el('textarea');
      input.id = 'show-input';
      input.setAttribute('aria-label', type === 'cloud' ? 'Your word' : 'Your answer');
      input.maxLength = type === 'cloud' ? 24 : 140;
      input.placeholder = type === 'cloud' ? 'Type a word' : 'Type your answer';
      if (type === 'open') {
        input.rows = 3;
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
      }
      const send = el('button', 'show__send', 'Submit');
      send.type = 'submit';
      form.append(input, send);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const added = demo.add(input.value, true);
        if (!added) note = demo.mine?.size >= 3 ? 'You have sent three words.' : demo.mineCount >= 3 ? 'You have sent three answers.' : 'Type something first.';
        else { note = type === 'cloud' ? 'Sent. Look at the big screen.' : 'Sent. Your answer is on the screen.'; say(`Added "${added}"`); fly(); }
        input.value = '';
        updateScreen();
        drawPhone();
      });
      kids.push(form);
    } else if (type === 'poll') {
      const list = el('div', 'show__opts');
      demo.options.forEach((text, i) => {
        const b = el('button', `show__opt${demo.you === i ? ' is-on' : ''}`, text);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(demo.you === i));
        b.addEventListener('click', () => { if (demo.vote(i)) { note = 'Vote sent. You can change it.'; say(`You voted for ${text}`); fly(); updateScreen(); drawPhone(); } });
        list.append(b);
      });
      kids.push(list);
    } else {
      const bar = el('div', 'show__timer');
      bar.setAttribute('aria-hidden', 'true');
      const fill = el('span');
      fill.style.width = `${demo.frozen ?? Math.max(0, 1 - elapsed() / demo.timeLimit) * 100}%`;
      bar.append(fill);
      const ends = el('div', 'show__ends');
      ends.setAttribute('aria-hidden', 'true');
      ends.append(el('span', '', '1000p'), el('span', '', '500p'));
      kids.push(bar, ends);
      const list = el('div', 'show__opts');
      demo.options.forEach((text, i) => {
        let cls = 'show__opt';
        if (demo.revealed && i === demo.correct) cls += ' is-right';
        else if (demo.you === i) cls += demo.revealed ? ' is-wrong' : ' is-on';
        const b = el('button', cls, text);
        b.type = 'button';
        b.disabled = demo.you !== null || demo.revealed;
        b.addEventListener('click', () => {
          const frac = Math.max(0, 1 - elapsed() / demo.timeLimit) * 100;
          if (!demo.answer(i, elapsed())) return;
          demo.frozen = frac;
          note = 'Answer sent. Waiting for the others.';
          say('Answer sent');
          fly();
          if (demo.everyone) { demo.reveal(); revealAt = ticks; }
          updateScreen();
          drawPhone();
        });
        list.append(b);
      });
      kids.push(list);
    }
    if (type === 'quiz' && demo.revealed) {
      kids.push(el('p', 'show__result', demo.you === null ? 'Time is up. No answer sent.' : demo.you === demo.correct ? `Correct! You scored ${demo.points} points.` : `Not quite. It was ${demo.options[demo.correct]}.`));
    } else if (note) kids.push(el('p', 'show__note-phone', note));
    phone.replaceChildren(...kids);
    if (focusedOpt >= 0) phone.querySelectorAll('.show__opt')[focusedOpt]?.focus({ preventScroll: true });
    if (hadInput && mode === 'play') $('#show-input')?.focus({ preventScroll: true });
  }

  // ---- state of the window, the steps and the words above them
  function setStep(k) {
    win.dataset.step = String(k);
    stepBtns.forEach((b, i) => {
      b.classList.toggle('is-done', i < k);
      if (i === k) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      const bar = b.querySelector('.tour__bar');
      bar.classList.remove('is-run');
      if (i === k) { void bar.offsetWidth; bar.classList.add('is-run'); }
    });
    caption.replaceChildren(el('b', '', `${k + 1}. ${CAPTIONS[k][0]}`), document.createTextNode(` ${CAPTIONS[k][1]}`));
    say(`Step ${k + 1}: ${CAPTIONS[k][0]}`);
  }
  function setMode(m) {
    mode = m;
    root.dataset.mode = m;
    if (m === 'play') {
      stepBtns.forEach((b) => { b.removeAttribute('aria-current'); b.classList.add('is-done'); b.querySelector('.tour__bar').classList.remove('is-run'); });
      caption.replaceChildren(el('b', '', CAPTION_PLAY[0] + ':'), document.createTextNode(` ${CAPTION_PLAY[1]}`));
    }
  }
  const setWindow = (m) => { win.dataset.mode = m; };
  const setJoin = (size) => { join.dataset.size = size; win.dataset.join = size; };
  function startClock() {
    clearInterval(clockTimer);
    clockStart = Date.now();
    clock.textContent = '00:00';
    clockTimer = setInterval(() => { const s = Math.floor((Date.now() - clockStart) / 1000); clock.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, 1000);
  }
  const stopClock = () => clearInterval(clockTimer);

  function paintCards() {
    for (const c of cards) {
      const on = c.dataset.type === type;
      c.closest('li').classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', String(on));
    }
    win.querySelectorAll('[data-tool]').forEach((t) => t.classList.toggle('is-hot', false));
  }

  // ---- the four steps of the tour
  async function stepWrite(my) {
    setStep(0); setWindow('edit'); setJoin('off'); ghostAway(); stopClock();
    phoneView = 'join'; joinText = ''; drawPhone();
    buildScreen();
    slide.classList.add('is-drafting');
    ui.q.textContent = '';
    await waitFor(my, 600);
    win.querySelector(`[data-tool="${TOOL_OF[type]}"]`)?.classList.add('is-hot');
    await typeText(my, (t) => { ui.q.textContent = t; }, SCENES[type].question, 42);
    slide.classList.remove('is-drafting');
    await waitFor(my, 500);
    await ghostTap(my, goLive);
    await waitFor(my, 250);
  }

  async function stepLive(my) {
    setStep(1); ghostAway();
    goLive.classList.add('is-live'); goLive.querySelector('span').textContent = 'Live';
    setWindow('live'); setJoin('big'); startClock(); setPeople(0);
    await waitFor(my, 900);
    // the phone joins: type the code, press Join
    phoneView = 'join'; joinText = ''; drawPhone();
    await typeText(my, (t) => { joinText = t; drawPhone(); }, JOIN_CODE, 150);
    await waitFor(my, 300);
    phoneView = 'joining'; drawPhone();
    for (const n of [2, 5, 9]) { setPeople(n); await waitFor(my, 330); }
    phoneView = 'question'; drawPhone();
    await waitFor(my, 500);
  }

  async function stepAnswer(my) {
    setStep(2); setJoin('small');
    await waitFor(my, 500);
    if (type === 'poll') {
      await ghostTap(my, phone.querySelectorAll('.show__opt')[1]);
    } else if (type === 'quiz') {
      await waitFor(my, 900);
      await ghostTap(my, phone.querySelectorAll('.show__opt')[SCENES.quiz.correct]);
    } else {
      const input = $('#show-input');
      const text = type === 'cloud' ? 'focus' : 'More time for questions';
      await ghostTo(input);
      ghost.classList.add('is-tap');
      await typeText(my, (t) => { input.value = t; }, text, type === 'cloud' ? 150 : 70);
      ghost.classList.remove('is-tap');
      await waitFor(my, 350);
      await ghostTap(my, phone.querySelector('.show__send'));
    }
    ghostAway();
    await waitFor(my, 700);
  }

  async function stepWatch(my) {
    setStep(3);
    const target = type === 'quiz' ? 12 : 16;
    for (let i = 0; i < target; i++) {
      if (type === 'quiz') { if (demo.revealed) break; }
      demo.crowdStep();
      if (type === 'quiz' && demo.everyone) { updateScreen(); setPeople(demo.room + 1); await waitFor(my, 500); demo.reveal(); updateScreen(); drawPhone(); if (demo.you === demo.correct) confetti(); break; }
      updateScreen();
      setPeople(Math.min(48, 9 + (i + 1) * 2));
      await waitFor(my, 320);
    }
    if (type === 'quiz' && !demo.revealed) { while (!demo.everyone) demo.crowdStep(); updateScreen(); demo.reveal(); updateScreen(); drawPhone(); if (demo.you === demo.correct) confetti(); }
    await waitFor(my, 1600);
  }

  // bring the screen and phone to how they look after step k - 1, without playing it
  function prepare(k) {
    demo = makeDemo(type, { empty: true });
    note = '';
    ticks = 0;
    buildScreen();
    slide.classList.remove('is-drafting');
    if (k >= 1) { goLive.classList.add('is-live'); goLive.querySelector('span').textContent = 'Live'; setWindow('live'); setJoin('big'); startClock(); setPeople(0); phoneView = 'join'; joinText = ''; }
    else { goLive.classList.remove('is-live'); goLive.querySelector('span').textContent = 'Go live'; setWindow('edit'); setJoin('off'); stopClock(); phoneView = 'join'; joinText = ''; }
    if (k >= 2) { setJoin('small'); phoneView = 'question'; setPeople(9); }
    if (k >= 3) {
      if (type === 'poll') demo.vote(1); else if (type === 'quiz') { demo.answer(SCENES.quiz.correct, 3); demo.frozen = 80; } else if (type === 'cloud') demo.add('focus', true); else demo.add('More time for questions', true);
      updateScreen(true);
    }
    drawPhone();
  }

  async function runTour(from = 0) {
    const my = ++token;
    halt();
    ghostAway();
    setMode('tour');
    hint.classList.add('is-gone');
    prepare(from);
    try {
      if (from <= 0) await stepWrite(my);
      if (from <= 1) await stepLive(my);
      if (from <= 2) await stepAnswer(my);
      await stepWatch(my);
      await waitFor(my, 600);
      startPlay();
    } catch (err) {
      if (err !== CANCELLED) throw err;
    }
  }

  // ---- your turn: the same screen and phone, with the room still answering
  function startPlay() {
    token++;
    ghostAway();
    demo = makeDemo(type);
    ticks = 0; note = ''; revealAt = 0;
    setMode('play');
    goLive.classList.add('is-live'); goLive.querySelector('span').textContent = 'Live';
    setWindow('live'); setJoin('small');
    if (!clockTimer) startClock();
    phoneView = 'question';
    buildScreen();
    drawPhone();
    setPeople(type === 'quiz' ? demo.room + 1 : 18 + Math.min(20, demo.total));
    hint.classList.remove('is-gone');
    say('Your turn. Answer on the phone.');
    run();
  }

  // ---- the room keeps answering while you play
  function step() {
    ticks++;
    if (type === 'quiz') {
      if (!demo.revealed) {
        if (ticks % 3 === 0) demo.crowdStep();
        if (demo.you === null) { const fill = phone.querySelector('.show__timer span'); if (fill) fill.style.width = `${Math.max(0, 1 - elapsed() / demo.timeLimit) * 100}%`; }
        if (demo.everyone || elapsed() >= demo.timeLimit) {
          while (!demo.everyone && demo.others < demo.room) demo.crowdStep();
          demo.frozen ??= 0;
          demo.reveal();
          revealAt = ticks;
          drawPhone();
          if (demo.you === demo.correct) confetti();
        }
        updateScreen();
      } else if (ticks - revealAt > REVEAL_PAUSE_TICKS) {
        revealAt = Infinity;
        swapTimer = setTimeout(() => { demo = makeDemo('quiz'); ticks = 0; note = ''; revealAt = 0; buildScreen(); drawPhone(); hint.classList.remove('is-gone'); }, SWAP_MS);
      }
      return;
    }
    if (ticks % CROWD_EVERY === 0 && demo.total < 60) { demo.crowdStep(); updateScreen(); setPeople(Math.min(48, 18 + demo.total)); }
  }

  function run() {
    if (reduced || timer || !visible || mode !== 'play') return;
    timer = setInterval(step, TICK_MS);
  }
  function halt() { clearInterval(timer); timer = 0; }

  // ---- choosing a question type restarts the tour (or the free play) for that type
  function select(next, { fromUser = false } = {}) {
    if (next === type && started) { if (fromUser && mode === 'tour') startPlay(); return; }
    type = next;
    started = true;
    paintCards();
    clearTimeout(swapTimer);
    if (mode === 'play' || reduced) {
      halt();
      startPlay();
    } else {
      runTour(0);
    }
  }

  // ---- wiring
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) { run(); if (!started) { started = true; if (reduced) startPlay(); else runTour(0); } } else halt();
  }, { threshold: 0.25 }).observe(root);

  cards.forEach((c) => {
    const li = c.closest('li');
    let intent = 0;
    c.addEventListener('click', () => select(c.dataset.type, { fromUser: true }));
    c.addEventListener('focus', () => select(c.dataset.type));
    if (canHover) {
      li.addEventListener('mouseenter', () => { clearTimeout(intent); intent = setTimeout(() => select(c.dataset.type), HOVER_INTENT_MS); });
      li.addEventListener('mouseleave', () => clearTimeout(intent));
    }
  });
  stepBtns.forEach((b) => b.addEventListener('click', () => { halt(); runTour(Number(b.dataset.step)); }));
  $('#show-replay').addEventListener('click', () => { halt(); if (reduced) startPlay(); else runTour(0); });
  $('#show-try').addEventListener('click', () => startPlay());
  // touching the phone during the tour hands it over straight away
  phone.addEventListener('pointerdown', () => { if (mode === 'tour' && phoneView === 'question') startPlay(); });

  paintCards();
  // First look, before it plays: the slide as written, with the phone waiting.
  setMode('tour');
  setStep(0);
  prepare(0);
  ui.q.textContent = SCENES[type].question;
  // A link such as /#tour-2 shows the demo paused at that step (the steps can be shared and checked one by one).
  const linked = /^#tour-([0-3])$/.exec(location.hash);
  if (linked) {
    started = true;
    const k = Number(linked[1]);
    prepare(k);
    setStep(k);
    ui.q.textContent = SCENES[type].question;
    if (k >= 1) { goLive.classList.add('is-live'); goLive.querySelector('span').textContent = 'Live'; }
  }
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('show');
  if (root) mount(root);
}
