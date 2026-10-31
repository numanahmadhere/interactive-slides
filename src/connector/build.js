// Turns the plain slide descriptions Claude sends through the connector into real slides.
// Everything goes through normalizeDeck at the end, so whatever comes in, the deck that comes out opens in the editor.

import { createDeck, normalizeDeck, MAX_SLIDES } from '../core/schema.js';
import { createBlock } from '../core/blocks/index.js';
import { uid } from '../core/util.js';

export const MAX_SLIDES_PER_CALL = 60;
export const THEMES = ['densight-dark', 'densight-light', 'paper', 'midnight'];
export const SLIDE_KINDS = ['title', 'content', 'two-column', 'section', 'question', 'diagram', 'timeline', 'table'];
export const QUESTION_KINDS = ['poll', 'quiz', 'wordcloud', 'open', 'rating', 'ranking', 'qna'];

const B = (type, props, frame) => ({ ...createBlock(type, { props }), slot: 'free', frame });
const slide = (blocks, notes = '') => ({ id: uid('s_'), layout: 'free', blocks, notes });
const text = (v, max = 600) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const pairs = (v, a, b, max = 8) => (Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? { [a]: text(x, 120), [b]: '' } : { [a]: text(x?.[a] ?? x?.label ?? x?.title, 120), [b]: text(x?.[b] ?? x?.note ?? x?.text ?? x?.detail, 300) })).filter((x) => x[a]).slice(0, max) : []);
const list = (v, max = 12, len = 300) => (Array.isArray(v) ? v.map((x) => text(String(x ?? ''), len)).filter(Boolean).slice(0, max) : []);

function questionBlock(q = {}) {
  const kind = QUESTION_KINDS.includes(q.kind) ? q.kind : 'poll';
  const question = text(q.text, 300) || 'What do you think?';
  const options = list(q.options, 8, 200);
  switch (kind) {
    case 'quiz': {
      const choices = (options.length >= 2 ? options : ['True', 'False']).map((t) => ({ text: t, correct: false }));
      const correct = (Array.isArray(q.correct) ? q.correct : [q.correct]).map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < choices.length);
      for (const i of correct.length ? correct : [0]) choices[i].correct = true;
      const timeLimit = [10, 20, 30, 60, 120].includes(Number(q.time_limit)) ? Number(q.time_limit) : 0;
      return ['quiz', { question, choices, mode: correct.length > 1 ? 'multiple' : 'single', explanation: text(q.explanation, 500), timeLimit }];
    }
    case 'wordcloud': return ['wordcloud', { question, limit: Math.min(5, Math.max(1, Number(q.limit) || 3)) }];
    case 'open': return ['open-answers', { question, limit: Math.min(5, Math.max(1, Number(q.limit) || 1)) }];
    case 'rating': return ['rating', { question, max: [5, 7, 10].includes(Number(q.max)) ? Number(q.max) : 5, low: text(q.low, 40) || 'Low', high: text(q.high, 40) || 'High' }];
    case 'ranking': return ['ranking', { question, items: (options.length >= 2 ? options : ['First', 'Second']).map((t) => ({ text: t })) }];
    case 'qna': return ['qna', { question }];
    default: return ['poll', { question, options: (options.length >= 2 ? options : ['Yes', 'No']).map((t) => ({ text: t })), multi: q.multi === true }];
  }
}

// One described slide -> one slide. Unknown or missing fields fall back to something sensible instead of failing.
export function buildSlide(spec = {}) {
  const kind = SLIDE_KINDS.includes(spec.kind) ? spec.kind : spec.question ? 'question' : spec.left || spec.right ? 'two-column' : spec.steps ? 'diagram' : spec.stages ? 'timeline' : spec.rows ? 'table' : 'content';
  const reveal = spec.reveal === true; // show the parts one at a time, one per click
  const title = text(spec.title, 200);
  const notes = text(spec.notes, 4000);
  const bullets = list(spec.bullets);
  const body = text(spec.text, 1500);

  if (kind === 'title') {
    return slide([
      B('shape', { kind: 'rect', fill: 'accent', text: '', size: 'sm', width: 'full' }, { x: 200, y: 300, w: 160, h: 12 }),
      B('heading', { text: title || 'Untitled', level: 1 }, { x: 200, y: 340, w: 1520 }),
      ...(text(spec.subtitle, 300) ? [B('text', { text: text(spec.subtitle, 300), size: 'lg', muted: true }, { x: 200, y: 600, w: 1200 })] : []),
    ], notes);
  }
  if (kind === 'section') {
    return slide([
      B('shape', { kind: 'rect', fill: 'accent', text: '', size: 'sm', width: 'full' }, { x: 160, y: 420, w: 120, h: 10 }),
      B('heading', { text: title || 'Section', level: 1 }, { x: 160, y: 460, w: 1600 }),
      ...(text(spec.subtitle, 300) ? [B('text', { text: text(spec.subtitle, 300), size: 'lg', muted: true }, { x: 160, y: 680, w: 1300 })] : []),
    ], notes);
  }
  if (kind === 'diagram' || kind === 'timeline') {
    const head = B('heading', { text: title || (kind === 'diagram' ? 'How it works' : 'Timeline'), level: 2 }, { x: 128, y: 96, w: 1664 });
    if (kind === 'timeline') {
      const items = pairs(spec.stages ?? spec.steps, 'title', 'text');
      return slide([head, B('timeline', { items: items.length >= 2 ? items : [{ title: 'Start', text: '' }, { title: 'Finish', text: '' }], revealItems: reveal }, { x: 128, y: 300, w: 1664 })], notes);
    }
    const nodes = pairs(spec.steps ?? spec.stages, 'label', 'note');
    const layout = ['row', 'column', 'cycle'].includes(spec.layout) ? spec.layout : nodes.length > 5 ? 'cycle' : 'row';
    return slide([head, B('diagram', { layout, style: 'filled', nodes: nodes.length >= 2 ? nodes : [{ label: 'Start', note: '' }, { label: 'Finish', note: '' }], revealItems: reveal }, { x: 128, y: layout === 'column' ? 240 : 320, w: 1664 })], notes);
  }
  if (kind === 'table') {
    const rows = (Array.isArray(spec.rows) ? spec.rows : []).slice(0, 30).map((r) => (Array.isArray(r) ? r : [r]).slice(0, 8).map((c) => text(String(c ?? ''), 120).replace(/\|/g, '/')));
    const data = rows.length ? rows.map((r) => r.join(' | ')).join('\n') : 'Item | Detail\nOne | Two';
    return slide([B('heading', { text: title || 'Table', level: 2 }, { x: 128, y: 96, w: 1664 }), B('table', { data, header: true, striped: true, size: 'md', revealItems: reveal }, { x: 128, y: 290, w: 1664 })], notes);
  }
  if (kind === 'question') {
    const [type, props] = questionBlock(spec.question);
    return slide([
      ...(title ? [B('heading', { text: title, level: 2 }, { x: 128, y: 96, w: 1664 })] : []),
      B(type, props, { x: 128, y: title ? 280 : 140, w: 1664 }),
    ], notes);
  }
  if (kind === 'two-column') {
    const col = (v) => (Array.isArray(v) ? { items: list(v) } : { text: text(v, 1500) });
    const side = (v, x) => {
      const c = col(v);
      return c.items?.length ? B('list', { items: c.items, size: 'md' }, { x, y: 300, w: 780 }) : B('text', { text: c.text || ' ' }, { x, y: 300, w: 780 });
    };
    return slide([B('heading', { text: title || 'Comparison', level: 2 }, { x: 128, y: 96, w: 1664 }), side(spec.left, 128), side(spec.right, 1012)], notes);
  }
  return slide([
    B('heading', { text: title || 'Slide', level: 2 }, { x: 128, y: 96, w: 1664 }),
    ...(bullets.length ? [B('list', { items: bullets, size: 'lg', revealItems: reveal }, { x: 128, y: body ? 440 : 300, w: 1500 })] : []),
    ...(body ? [B('text', { text: body, size: 'lg' }, { x: 128, y: 280, w: 1500 })] : []),
  ], notes);
}

export function buildSlides(specs) {
  if (!Array.isArray(specs) || !specs.length) throw new Error('Give at least one slide.');
  if (specs.length > MAX_SLIDES_PER_CALL) throw new Error(`Send at most ${MAX_SLIDES_PER_CALL} slides at a time.`);
  return specs.map(buildSlide);
}

export function buildDeck({ title, slides, theme } = {}) {
  const deck = createDeck({ title: text(title, 200) || 'Untitled deck', theme: THEMES.includes(theme) ? theme : undefined });
  deck.slides = buildSlides(slides);
  return normalizeDeck(deck).deck;
}

// A short, readable outline of a deck, so Claude can see what is there without the whole JSON.
export function outline(deck) {
  return deck.slides.map((s, i) => {
    const head = s.blocks.find((b) => b.type === 'heading');
    const q = s.blocks.find((b) => ['poll', 'quiz', 'wordcloud', 'open-answers', 'rating', 'ranking', 'qna'].includes(b.type));
    const stepped = s.blocks.some((b) => b.props?.revealItems === true);
    return { index: i, title: head?.props?.text ?? q?.props?.question ?? '(no title)', question: q ? q.type : undefined, ...(stepped ? { stepped: true } : {}) };
  });
}

export function addSlides(deck, specs, position) {
  const fresh = buildSlides(specs);
  if (deck.slides.length + fresh.length > MAX_SLIDES) throw new Error(`A deck holds at most ${MAX_SLIDES} slides.`);
  const at = Number.isInteger(position) ? Math.min(Math.max(position, 0), deck.slides.length) : deck.slides.length;
  const slides = [...deck.slides.slice(0, at), ...fresh, ...deck.slides.slice(at)];
  return normalizeDeck({ ...deck, slides }).deck;
}

export function replaceSlide(deck, index, spec) {
  if (!Number.isInteger(index) || index < 0 || index >= deck.slides.length) throw new Error(`There is no slide ${index}. The deck has ${deck.slides.length}.`);
  const slides = deck.slides.map((s, i) => (i === index ? buildSlide(spec) : s));
  return normalizeDeck({ ...deck, slides }).deck;
}

export function deleteSlide(deck, index) {
  if (!Number.isInteger(index) || index < 0 || index >= deck.slides.length) throw new Error(`There is no slide ${index}. The deck has ${deck.slides.length}.`);
  if (deck.slides.length === 1) throw new Error('A deck needs at least one slide.');
  return normalizeDeck({ ...deck, slides: deck.slides.filter((_, i) => i !== index) }).deck;
}
