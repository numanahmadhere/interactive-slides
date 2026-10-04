// Finds the prompts (polls and quiz questions) on a slide, including ones inside
// tabs, accordions and columns, in the plain form that is sent to phones.

import { getBlock } from '../core/blocks/index.js';
import { stripTags } from '../core/util.js';

import { CHOICE_KINDS } from './protocol.js';

const clean = (html) => stripTags(html);

function fromBlock(block) {
  const p = block.props;
  if (block.type === 'poll') {
    return { id: block.id, kind: 'poll', question: clean(p.question), options: p.options.map((o) => clean(o.text)), multi: p.multi === true };
  }
  if (block.type === 'quiz') {
    return { id: block.id, kind: 'quiz', question: clean(p.question), options: p.choices.map((c) => clean(c.text)), multi: p.mode === 'multiple', timeLimit: p.timeLimit ?? 0 };
  }
  if (block.type === 'wordcloud') return { id: block.id, kind: 'cloud', question: clean(p.question), options: [], multi: false, limit: p.limit, moderation: p.moderation };
  if (block.type === 'open-answers') return { id: block.id, kind: 'open', question: clean(p.question), options: [], multi: false, limit: p.limit, moderation: p.moderation };
  if (block.type === 'rating') {
    return { id: block.id, kind: 'rating', question: clean(p.question), options: Array.from({ length: p.max }, (_, i) => String(i + 1)), multi: false, low: clean(p.low), high: clean(p.high) };
  }
  if (block.type === 'ranking') return { id: block.id, kind: 'ranking', question: clean(p.question), options: p.items.map((o) => clean(o.text)), multi: false };
  if (block.type === 'qna') return { id: block.id, kind: 'qna', question: clean(p.question), options: [], multi: false, moderation: p.moderation };
  if (block.type === 'reactions') return { id: block.id, kind: 'poll', question: clean(p.question), options: p.options.map((o) => clean(o.text)), multi: false };
  if (block.type === 'pin') return { id: block.id, kind: 'pin', question: clean(p.question), options: [], multi: false };
  return null;
}

export function collectPrompts(slide) {
  const out = [];
  const visit = (blocks) => {
    for (const block of blocks ?? []) {
      const prompt = fromBlock(block);
      if (prompt && (!CHOICE_KINDS.has(prompt.kind) || prompt.options.length >= 2)) out.push(prompt);
      const key = getBlock(block.type)?.container?.key;
      if (key && Array.isArray(block.props[key])) for (const section of block.props[key]) visit(section.blocks);
    }
  };
  visit(slide?.blocks);
  return out.slice(0, 8);
}

// The answer keys for the quiz questions on a slide, for scoring on the presenter's page. These never go to
// phones: collectPrompts above leaves them out on purpose. -> Map(prompt id -> { mode, correct: bool[], timeLimit })
export function collectKeys(slide) {
  const keys = new Map();
  const visit = (blocks) => {
    for (const block of blocks ?? []) {
      if (block.type === 'quiz') keys.set(block.id, { mode: block.props.mode, correct: block.props.choices.map((c) => c.correct === true), timeLimit: block.props.timeLimit ?? 0 });
      const key = getBlock(block.type)?.container?.key;
      if (key && Array.isArray(block.props[key])) for (const section of block.props[key]) visit(section.blocks);
    }
  };
  visit(slide?.blocks);
  return keys;
}
