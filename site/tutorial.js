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

export function makeDemo(type) {
  if (type === 'cloud') return new CloudDemo();
  if (type === 'quiz') return new QuizDemo();
  if (type === 'poll') return new PollDemo();
  if (type === 'open') return new OpenDemo();
  throw new Error(`Unknown demo "${type}"`);
}

// ---- drawing ---------------------------------------------------------------------------

const TICK_MS = 250;
const CROWD_EVERY = 6; // ticks, so every 1.5 seconds
const REVEAL_PAUSE_TICKS = 28;

function mount(root) {
  const $ = (sel) => root.querySelector(sel);
  const cards = [...root.querySelectorAll('[data-type]')];
  const slide = $('#show-slide');
  const phone = $('#show-phone');
  const announce = $('#show-announce');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = matchMedia('(hover: hover)').matches;

  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };

  let type = 'cloud';
  let demo = makeDemo(type);
  let ticks = 0;
  let revealAt = 0;
  let timer = 0;
  let visible = false;
  let note = '';
  let drawn = new Set(); // what is already on the big screen, so only new things animate

  const elapsed = () => ticks * TICK_MS / 1000;

  // ---- your screen
  function drawScreen() {
    const scene = SCENES[type];
    slide.replaceChildren(el('h2', 'show__q', scene.question));
    if (type === 'cloud') {
      const cloud = el('div', 'show__cloud');
      cloud.setAttribute('role', 'img');
      cloud.setAttribute('aria-label', `Word cloud of ${demo.total} words`);
      for (const w of demo.layout()) {
        const s = el('span', `show__word${w.turn ? ' is-turned' : ''}${drawn.has(w.word) ? '' : ' is-new'}`, w.word);
        drawn.add(w.word);
        s.dataset.hue = w.hue;
        s.style.fontSize = `${w.size}em`;
        if (w.mine) s.classList.add('is-mine');
        cloud.append(s);
      }
      slide.append(cloud, el('p', 'show__count', `${demo.total} ${demo.total === 1 ? 'word' : 'words'}`));
    } else if (type === 'poll') {
      const list = el('ul', 'show__bars');
      demo.options.forEach((text, i) => {
        const row = el('li', `show__bar${demo.you === i ? ' is-mine' : ''}`);
        const fill = el('span', 'show__fill');
        fill.style.width = `${demo.percent(i)}%`;
        row.append(fill, el('span', 'show__label', text), el('span', 'show__pct', `${demo.percent(i)}%`));
        list.append(row);
      });
      slide.append(list, el('p', 'show__count', `${demo.total} responses`));
    } else if (type === 'quiz') {
      const status = demo.revealed ? `The answer is ${demo.options[demo.correct]}` : demo.everyone ? 'Everyone has voted!' : `${demo.voted} of ${demo.room + 1} have answered`;
      slide.append(el('p', 'show__status', status));
      const cols = el('div', 'show__cols');
      demo.options.forEach((text, i) => {
        const col = el('div', `show__col${demo.revealed ? (i === demo.correct ? ' is-right' : ' is-wrong') : ''}`);
        col.dataset.i = i;
        col.append(el('span', 'show__n', String(demo.counts[i])), el('span', 'show__rule'), el('span', 'show__label', text));
        cols.append(col);
      });
      slide.append(cols);
    } else {
      const list = el('ul', 'show__notes');
      for (const item of demo.items) {
        list.append(el('li', `show__note${item.mine ? ' is-mine' : ''}${drawn.has(item.text) ? '' : ' is-new'}`, item.text));
        drawn.add(item.text);
      }
      slide.append(list, el('p', 'show__count', `${demo.total} responses`));
    }
  }

  // ---- the phone
  function drawPhone() {
    const scene = SCENES[type];
    const kids = [el('p', 'phone__q', scene.question)];
    if (type === 'cloud' || type === 'open') {
      const form = el('form', 'show__form');
      form.setAttribute('autocomplete', 'off');
      const input = type === 'cloud' ? el('input') : el('textarea');
      input.id = 'show-input';
      input.setAttribute('aria-label', type === 'cloud' ? 'Your word' : 'Your answer');
      input.maxLength = type === 'cloud' ? 24 : 140;
      input.placeholder = type === 'cloud' ? 'Type a word' : 'Type your answer';
      if (type === 'open') input.rows = 3;
      const send = el('button', 'show__send', 'Submit');
      send.type = 'submit';
      form.append(input, send);
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const added = demo.add(input.value, true);
        if (!added) { note = demo instanceof CloudDemo && demo.mine.size >= 3 ? 'You have sent three words.' : demo.mineCount >= 3 ? 'You have sent three answers.' : 'Type something first.'; }
        else { note = type === 'cloud' ? 'Sent. Look at the big screen.' : 'Sent. Your answer is on the screen.'; say(`Added "${added}"`); }
        input.value = '';
        drawScreen();
        drawPhone();
      });
      kids.push(form);
    } else if (type === 'poll') {
      const list = el('div', 'show__opts');
      demo.options.forEach((text, i) => {
        const b = el('button', `show__opt${demo.you === i ? ' is-on' : ''}`, text);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(demo.you === i));
        b.addEventListener('click', () => { if (demo.vote(i)) { note = 'Vote sent. You can change it.'; say(`You voted for ${text}`); drawScreen(); drawPhone(); } });
        list.append(b);
      });
      kids.push(list);
    } else {
      const left = Math.max(0, 1 - elapsed() / demo.timeLimit);
      const bar = el('div', 'show__timer');
      bar.setAttribute('aria-hidden', 'true');
      const fill = el('span');
      fill.style.width = `${demo.frozen ?? left * 100}%`;
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
          if (demo.everyone) { demo.reveal(); finish(); }
          drawScreen(); drawPhone();
        });
        list.append(b);
      });
      kids.push(list);
    }
    if (type === 'quiz' && demo.revealed) {
      kids.push(el('p', 'show__result', demo.you === null ? 'Time is up. No answer sent.' : demo.you === demo.correct ? `Correct! You scored ${demo.points} points.` : `Not quite. It was ${demo.options[demo.correct]}.`));
    } else if (note) kids.push(el('p', 'show__note-phone', note));
    phone.replaceChildren(...kids);
  }

  function finish() { revealAt = ticks; }

  function say(text) { announce.textContent = text; }

  function select(next, { focus = false } = {}) {
    if (next === type && slide.childElementCount) return;
    type = next;
    demo = makeDemo(type);
    ticks = 0;
    note = '';
    revealAt = 0;
    drawn = new Set();
    for (const c of cards) {
      const on = c.dataset.type === type;
      c.closest('li').classList.toggle('is-on', on);
      c.setAttribute('aria-pressed', String(on));
    }
    drawScreen();
    drawPhone();
    if (focus) $('#show-input')?.focus();
  }

  // ---- the simulated room
  function step() {
    ticks++;
    if (type === 'quiz') {
      if (!demo.revealed) {
        if (ticks % 3 === 0) demo.crowdStep();
        if (demo.you === null) { const fill = phone.querySelector('.show__timer span'); if (fill) fill.style.width = `${Math.max(0, 1 - elapsed() / demo.timeLimit) * 100}%`; }
        if (demo.everyone || elapsed() >= demo.timeLimit) { while (!demo.everyone && demo.others < demo.room) demo.crowdStep(); demo.frozen ??= 0; demo.reveal(); finish(); drawPhone(); }
        drawScreen();
      } else if (ticks - revealAt > REVEAL_PAUSE_TICKS) {
        demo = makeDemo('quiz'); ticks = 0; note = ''; drawScreen(); drawPhone();
      }
      return;
    }
    if (ticks % CROWD_EVERY === 0) {
      if (demo.total < 60) { demo.crowdStep(); drawScreen(); }
    }
  }

  function run() {
    if (reduced || timer || !visible || document.hidden) return;
    timer = setInterval(step, TICK_MS);
  }
  function halt() { clearInterval(timer); timer = 0; }

  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; if (visible) run(); else halt(); }).observe(root);
  document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));

  cards.forEach((c) => {
    c.addEventListener('click', () => select(c.dataset.type, { focus: true }));
    c.addEventListener('focus', () => select(c.dataset.type));
    if (canHover) c.closest('li').addEventListener('mouseenter', () => select(c.dataset.type));
  });

  // With reduced motion nothing moves by itself, so start from a room that is already full.
  select('cloud');
  if (reduced) { for (let i = 0; i < 6; i++) demo.crowdStep(); drawScreen(); }
}

if (typeof document !== 'undefined') {
  const root = document.getElementById('show');
  if (root) mount(root);
}
