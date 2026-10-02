import { h } from '../dom.js';
import { str } from '../util.js';
import { registerBlock, walkDeck, getBlock } from './registry.js';

// Every question-like block (quiz, matching, ordering, fill in the blank) counts.
function collectQuizzes(deck) {
  const quizzes = [];
  walkDeck(deck, (block, slide) => {
    if (getBlock(block.type)?.scored) quizzes.push({ id: block.id, slideId: slide.id });
  });
  return quizzes;
}

export default registerBlock({
  type: 'quiz-results',
  label: 'Score summary',
  group: 'Interactive',
  defaults: () => ({ title: 'Your score', restart: true, restartLabel: 'Try again' }),
  normalize: (p) => ({ title: str(p.title, '', 200), restart: p.restart !== false, restartLabel: str(p.restartLabel, 'Try again', 60) }),
  fields: [
    { key: 'restart', label: 'Show a "try again" button', type: 'toggle' },
    { key: 'restartLabel', label: 'Button label', type: 'text', when: { key: 'restart', in: [true] } },
  ],
  edit: [{ prop: 'title', selector: '.sp-score__title', kind: 'plain', placeholder: 'Title' }],
  render: (block, ctx) => {
    const { title, restart, restartLabel } = block.props;
    const quizzes = collectQuizzes(ctx.deck);
    const present = ctx.mode === 'present';
    const states = quizzes.map((q) => ctx.session?.peek(q.id));
    const answered = states.filter((s) => s?.done).length;
    const correct = states.filter((s) => s?.done && s.correct).length;
    const total = quizzes.length;
    const percent = total ? Math.round((correct / total) * 100) : 0;

    const note = !present
      ? `Shows each person's result across the ${total} scored question${total === 1 ? '' : 's'} in this deck`
      : !total ? 'There are no scored questions in this deck'
      : answered < total ? `${total - answered} of ${total} not answered yet`
      : `${percent}% correct`;

    const root = h('div', { class: 'sp-score' },
      h('p', { class: 'sp-score__title', text: title }),
      h('div', { class: 'sp-score__value', role: 'status' },
        h('span', { class: 'sp-score__num', text: present ? String(correct) : '-' }),
        h('span', { class: 'sp-score__of', text: ` / ${total}` })),
      h('div', { class: 'sp-score__bar', 'aria-hidden': 'true' }, h('div', { class: 'sp-score__fill', style: `width:${present ? percent : 0}%` })),
      h('p', { class: 'sp-score__note', text: note }));
    if (restart && present && total) {
      root.append(h('button', { class: 'sp-btn sp-btn--outline sp-btn--md sp-score__restart', type: 'button', text: restartLabel }));
    }
    return root;
  },
  mount: (el, block, ctx) => {
    const button = el.querySelector('.sp-score__restart');
    if (!button || !ctx.session) return;
    const quizzes = collectQuizzes(ctx.deck);
    button.addEventListener('click', () => {
      const ids = new Set(quizzes.map((q) => q.id));
      ctx.session.clear((id) => ids.has(id));
      ctx.actions?.goToSlide(quizzes[0].slideId);
    });
  },
});
