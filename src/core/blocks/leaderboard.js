import { h, rich } from '../dom.js';
import { str, oneOf, clamp } from '../util.js';
import { registerBlock } from './registry.js';

const SAMPLE_PLAYERS = [['Amira', 2850, 3], ['Jonas', 2640, 3], ['Priya', 2310, 2], ['Tomas', 1900, 2], ['Lena', 1250, 1]];
const SAMPLE_TEAMS = [['Red', 2480, 5], ['Blue', 2105, 5]];

export default registerBlock({
  type: 'leaderboard',
  label: 'Leaderboard',
  group: 'Interactive',
  defaults: () => ({ title: 'Leaderboard', show: 'players', top: 5 }),
  normalize: (p) => ({
    title: str(p.title, '', 300),
    show: oneOf(p.show, ['players', 'teams'], 'players'),
    top: Number.isFinite(Number(p.top)) ? clamp(Math.round(Number(p.top)), 3, 10) : 5,
  }),
  fields: [
    { key: 'show', label: 'Show', type: 'segmented', options: [{ value: 'players', label: 'Players' }, { value: 'teams', label: 'Teams' }] },
    { key: 'top', label: 'How many', type: 'segmented', options: [3, 5, 10].map((n) => ({ value: n, label: String(n) })) },
    { type: 'hint', text: 'Fills in during a live session that asks for names. Scores come from quiz questions; a right answer is worth 1000 points, and on a timed question the faster answer scores more.' },
  ],
  edit: [{ prop: 'title', selector: '.sp-lb__title', kind: 'rich', placeholder: 'Title' }],
  render: (block, ctx) => {
    const list = h('ol', { class: 'sp-lb__rows' });
    if (ctx.mode === 'edit' || ctx.mode === 'thumb') {
      const rows = block.props.show === 'teams' ? SAMPLE_TEAMS : SAMPLE_PLAYERS;
      rows.slice(0, block.props.top).forEach(([name, pts], i) => list.append(row(i + 1, name, pts)));
    }
    const root = h('div', { class: 'sp-lb' }, rich('p', { class: 'sp-lb__title' }, block.props.title), list);
    if (ctx.mode === 'present') root.append(h('p', { class: 'sp-live__count', role: 'status', 'aria-live': 'polite' }));
    return root;
  },
  mount: (el, block, ctx) => {
    const live = ctx.live ?? null;
    const list = el.querySelector('.sp-lb__rows');
    const count = el.querySelector('.sp-live__count');
    const paint = () => {
      const teams = block.props.show === 'teams';
      const rows = live ? (teams ? live.teamBoard() : live.leaderboard(block.props.top)) : [];
      list.replaceChildren(...rows.slice(0, block.props.top).map((r, i) => row(i + 1, teams ? r.team : r.name, teams ? r.average : r.points, teams ? `${r.members} ${r.members === 1 ? 'player' : 'players'}` : r.team)));
      count.textContent = rows.length ? '' : !live ? 'Start a live session that asks for names to fill this in' : 'Waiting for scores. Answer a quiz question to appear here';
    };
    paint();
    return live?.subscribe(paint);
  },
});

function row(place, name, points, note = '') {
  return h('li', { class: 'sp-lb__row' },
    h('span', { class: 'sp-lb__place', text: String(place) }),
    h('span', { class: 'sp-lb__name', text: name }),
    note ? h('span', { class: 'sp-lb__note', text: note }) : null,
    h('span', { class: 'sp-lb__pts', text: points.toLocaleString('en-US') }));
}
