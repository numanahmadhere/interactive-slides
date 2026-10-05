// The comparison table on the home page. The data lives here so a test can check that
// every "Yes" in our column is a feature the product really has, and that nothing in the
// table is left half filled.
//
// Competitor cells come from each vendor's public pages and help articles (and review
// sites that quote their plans), last read in the month below. Where a feature could not
// be confirmed from public pages the cell says "Check" instead of guessing.

import { PRICES } from '../src/billing/plans.js';

export const CHECKED = 'October 2026';

export const VENDORS = [
  { id: 'us', name: 'Densight Slides', us: true },
  { id: 'menti', name: 'Mentimeter', url: 'https://www.mentimeter.com' },
  { id: 'slido', name: 'Slido', url: 'https://www.slido.com' },
  { id: 'kahoot', name: 'Kahoot!', url: 'https://kahoot.com' },
  { id: 'pe', name: 'Poll Everywhere', url: 'https://www.polleverywhere.com' },
];

// yes | no | paid (only on a paid plan) | part (partly) | soon (not yet, ours only) | check (not confirmed) | text:...
// "needs" names what must exist in the product for a Yes or Paid in our column; "gated" names what must be
// locked on the free plan for a Paid in our column (a test checks both).
// Order of cells: us, Mentimeter, Slido, Kahoot, Poll Everywhere.
export const GROUPS = [
  { title: 'Ask your audience', rows: [
    { name: 'Live polls', cells: ['yes', 'yes', 'yes', 'yes', 'yes'] },
    { name: 'Scored quizzes', cells: ['yes', 'yes', 'yes', 'yes', 'yes'] },
    { name: 'Timed quizzes with names, teams and a leaderboard', cells: ['paid', 'yes', 'yes', 'yes', 'yes'], needs: ['leaderboard'], gated: ['leaderboard'] },
    { name: 'Word cloud', cells: ['paid', 'yes', 'yes', 'paid', 'yes'], needs: ['wordcloud'], gated: ['kind:cloud'] },
    { name: 'Open-text answers', cells: ['paid', 'yes', 'yes', 'paid', 'yes'], needs: ['open-answers'], gated: ['kind:open'] },
    { name: 'Rating scales and ranking', cells: ['part', 'yes', 'yes', 'check', 'yes'], needs: ['rating', 'ranking'], gated: ['kind:ranking'] },
    { name: 'Audience Q&A with upvotes', cells: ['paid', 'yes', 'yes', 'paid', 'yes'], needs: ['qna'], gated: ['kind:qna'] },
    { name: 'Pin on an image', cells: ['paid', 'yes', 'check', 'check', 'yes'], needs: ['pin'], gated: ['kind:pin'] },
    { name: 'Swear filter and approve-first moderation', cells: ['paid', 'yes', 'paid', 'check', 'yes'], needs: ['moderation'], gated: ['kind:open'] },
    { name: 'Quiz answer key never leaves the presenter\'s browser', cells: ['yes', 'check', 'check', 'check', 'check'], needs: ['answer-key'] },
    { name: 'Download results as a spreadsheet', cells: ['paid', 'paid', 'paid', 'check', 'paid'], needs: ['csv'], gated: ['csv'] },
    { name: 'Session reports to keep', cells: ['paid', 'yes', 'paid', 'yes', 'yes'], needs: ['reports'], gated: ['reports'] },
  ] },
  { title: 'Build and present', rows: [
    { name: 'Design full slides in the same tool', cells: ['yes', 'part', 'no', 'part', 'no'], needs: ['free-form'] },
    { name: 'Import a PowerPoint or Google Slides file', cells: ['part', 'part', 'no', 'part', 'check'], needs: ['import'] },
    { name: 'Self-paced mode with completion list and certificate', cells: ['paid', 'part', 'no', 'yes', 'check'], needs: ['self-paced'], gated: ['self-paced'] },
    { name: 'Works inside PowerPoint or Google Slides', cells: ['soon', 'yes', 'yes', 'paid', 'yes'] },
    { name: 'Phone remote with speaker notes', cells: ['yes', 'check', 'check', 'check', 'check'], needs: ['remote'] },
    { name: 'Text versions of every block for screen readers', cells: ['yes', 'check', 'check', 'check', 'check'], needs: ['a11y'] },
    { name: 'Present with no internet connection', cells: ['yes', 'no', 'no', 'no', 'no'], needs: ['offline'] },
  ] },
  { title: 'Privacy, teams and cost', rows: [
    { name: 'Audience answers stay off the vendor\'s servers', cells: ['yes', 'no', 'no', 'no', 'no'], needs: ['no-storage'] },
    { name: 'Private session that keeps nothing', cells: ['yes', 'check', 'check', 'check', 'check'], needs: ['private'] },
    { name: 'Team workspace with shared decks, comments and brand kit', cells: ['paid', 'paid', 'paid', 'paid', 'paid'], needs: ['teams'], gated: ['teams'] },
    { name: 'Edit the same deck together in real time', cells: ['soon', 'yes', 'check', 'yes', 'check'] },
    { name: 'Single sign-on (SSO)', cells: ['soon', 'paid', 'paid', 'paid', 'paid'] },
    { name: 'No monthly cap on participants (free plan)', cells: ['yes', 'no', 'check', 'check', 'check'], needs: ['no-cap'] },
    { name: 'Free plan limits', cells: ['text:3 decks online, rooms up to 25 phones', 'text:50 participants a month', 'text:100 participants, 3 polls per event', 'text:10 players (3 on a work account)', 'text:25 audience members'] },
    { name: 'Cheapest paid plan, per presenter', cells: ['text:$10 a month, 7-day trial', 'text:About $11 a month', 'text:About $17.50 a month', 'text:About $25 a month', 'text:See vendor'] },
  ] },
];

const LABELS = { yes: 'Included', no: 'No', paid: 'Paid plan', part: 'Partly', soon: 'Not yet', check: 'Check' };
const ICON_PATHS = {
  yes: '<circle cx="10" cy="10" r="10" fill="currentColor" stroke="none"/><path d="M5.5 10.5l3 3 6-6.5" stroke="#fff" stroke-width="2.2"/>',
  paid: '<circle cx="10" cy="10" r="9"/><path d="M6.5 10h7M10 6.5v7"/>',
  part: '<circle cx="10" cy="10" r="9"/><path d="M10 1a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/>',
  no: '<circle cx="10" cy="10" r="9"/><path d="M6.5 10h7"/>',
  soon: '<circle cx="10" cy="10" r="9"/><path d="M10 5.5V10l3 2"/>',
  check: '<circle cx="10" cy="10" r="9"/><path d="M8 8a2 2 0 1 1 3 1.7c-.7.4-1 .8-1 1.6M10 14h.01"/>',
};
// drawn once, used everywhere (keeps the page small)
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">${Object.entries(ICON_PATHS).map(([k, d]) => `<symbol id="cmp-${k}" viewBox="0 0 20 20">${d}</symbol>`).join('')}</svg>`;
const ICON = Object.fromEntries(Object.keys(ICON_PATHS).map((k) => [k, `<svg class="cm" aria-hidden="true"><use href="#cmp-${k}"/></svg>`]));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function renderCell(cell) {
  if (cell.startsWith('text:')) return `<td class="cmp__text">${esc(cell.slice(5))}</td>`;
  return `<td class="cmp__${cell}">${ICON[cell]}<span class="cmp__word">${LABELS[cell]}</span></td>`;
}

// Points: included on any plan counts 1, partly counts a half. "Not yet", "No" and "Check" (could not confirm) count 0,
// so a vendor is only credited for what we could confirm.
const POINTS = { yes: 1, paid: 1, part: 0.5 };
export function scores() {
  const rows = GROUPS.flatMap((g) => g.rows).filter((r) => !r.cells[0].startsWith('text:'));
  return VENDORS.map((_, i) => ({ points: rows.reduce((a, r) => a + (POINTS[r.cells[i]] ?? 0), 0), of: rows.length }));
}

export function renderCompare() {
  const sc = scores();
  const top = Math.max(...sc.map((x) => x.points));
  const board = VENDORS.map((v, i) => `<li class="cmp__score${v.us ? ' is-us' : ''}${sc[i].points === top ? ' is-top' : ''}"><span class="cmp__sname">${esc(v.name)}${sc[i].points === top ? ' <b class="cmp__crown">Most features</b>' : ''}</span><span class="cmp__sbar"><i style="--w:${Math.round((sc[i].points / sc[i].of) * 100)}%"></i></span><span class="cmp__snum"><b>${Number.isInteger(sc[i].points) ? sc[i].points : sc[i].points.toFixed(1)}</b> of ${sc[i].of}</span></li>`).join('');
  const wins = [
    ['Works offline', 'The only one that lets you build and present with no connection.'],
    ['Answers stay with you', 'Audience answers are held in your browser, not stored by us.'],
    ['Lowest paid price', `From $${PRICES.starter.month} a month, below the other three that publish a price.`],
    ['Slides and questions in one', 'Design the slide and add the question in the same editor.'],
  ].map(([t, d]) => `<li><b>${t}</b><span>${d}</span></li>`).join('');
  const head = VENDORS.map((v) => `<th scope="col"${v.us ? ' class="cmp__us"' : ''}>${v.us ? '<span class="cmp__best">Best choice</span>' : ''}${v.url ? `<a href="${v.url}" rel="noopener nofollow">${esc(v.name)}</a>` : esc(v.name)}</th>`).join('');
  const body = GROUPS.map((g) => `<tbody><tr class="cmp__group"><th scope="colgroup" colspan="${VENDORS.length + 1}">${esc(g.title)}</th></tr>
${g.rows.map((r) => `<tr><th scope="row">${esc(r.name)}</th>${r.cells.map(renderCell).join('')}</tr>`).join('\n')}</tbody>`).join('\n');
  return `${SPRITE}<ul class="cmp__wins" aria-label="Where we lead">${wins}</ul>
<div class="cmp__board"><h3 class="cmp__bh">Features confirmed, out of ${sc[0].of}</h3><ol class="cmp__scores">${board}</ol><p class="cmp__bnote">Included on any plan counts as 1 and partly counts as a half. &ldquo;Not yet&rdquo;, &ldquo;No&rdquo; and &ldquo;Check&rdquo; (could not confirm) count as 0.</p></div>
<div class="cmp__scroll" tabindex="0" role="region" aria-label="Comparison table, scrolls sideways on small screens"><table class="cmp"><caption class="sr">How Densight Slides compares with four other tools, checked ${CHECKED}</caption>
<thead><tr><th scope="col"><span class="sr">Feature</span></th>${head}</tr></thead>
${body}
</table></div>`;
}

export const renderKey = () => `<ul class="cmp__key" aria-label="Key">${['yes', 'paid', 'part', 'no', 'soon', 'check'].map((k) => `<li class="cmp__${k}">${ICON[k]}${{ yes: 'Included on every plan', paid: 'Included on a paid plan', part: 'Partly', no: 'Not offered, as far as we could find', soon: 'Not yet (ours)', check: 'Could not confirm' }[k]}</li>`).join('')}</ul>`;
