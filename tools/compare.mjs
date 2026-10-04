// The comparison table on the home page. The data lives here so a test can check that
// every "Yes" in our column is a feature the product really has, and that nothing in the
// table is left half filled.
//
// Competitor cells come from each vendor's public pages and help articles (and review
// sites that quote their plans), last read in the month below. Where a feature could not
// be confirmed from public pages the cell says "Check" instead of guessing.

export const CHECKED = 'October 2026';

export const VENDORS = [
  { id: 'us', name: 'Densight Slides', us: true },
  { id: 'menti', name: 'Mentimeter', url: 'https://www.mentimeter.com' },
  { id: 'slido', name: 'Slido', url: 'https://www.slido.com' },
  { id: 'kahoot', name: 'Kahoot!', url: 'https://kahoot.com' },
  { id: 'pe', name: 'Poll Everywhere', url: 'https://www.polleverywhere.com' },
];

// yes | no | paid (only on a paid plan) | part (partly) | soon (not yet, ours only) | check (not confirmed) | text:...
// Order of cells: us, Mentimeter, Slido, Kahoot, Poll Everywhere.
export const GROUPS = [
  { title: 'Ask your audience', rows: [
    { name: 'Live polls', cells: ['yes', 'yes', 'yes', 'yes', 'yes'] },
    { name: 'Scored quizzes', cells: ['yes', 'yes', 'yes', 'yes', 'yes'] },
    { name: 'Timed quizzes with a leaderboard', cells: ['soon', 'yes', 'yes', 'yes', 'yes'], needs: null },
    { name: 'Word cloud', cells: ['yes', 'yes', 'yes', 'paid', 'yes'], needs: ['wordcloud'] },
    { name: 'Open-text answers', cells: ['yes', 'yes', 'yes', 'paid', 'yes'], needs: ['open-answers'] },
    { name: 'Rating scales and ranking', cells: ['yes', 'yes', 'yes', 'check', 'yes'], needs: ['rating', 'ranking'] },
    { name: 'Audience Q&A with upvotes', cells: ['yes', 'yes', 'yes', 'paid', 'yes'], needs: ['qna'] },
    { name: 'Download results as a spreadsheet', cells: ['yes', 'paid', 'paid', 'check', 'paid'], needs: ['csv'] },
  ] },
  { title: 'Build and present', rows: [
    { name: 'Design full slides in the same tool', cells: ['yes', 'part', 'no', 'part', 'no'], needs: ['free-form'] },
    { name: 'Works inside PowerPoint or Google Slides', cells: ['soon', 'yes', 'yes', 'paid', 'yes'] },
    { name: 'Present with no internet connection', cells: ['yes', 'no', 'no', 'no', 'no'], needs: ['offline'] },
  ] },
  { title: 'Privacy, teams and cost', rows: [
    { name: 'Audience answers stay off the vendor\'s servers', cells: ['yes', 'no', 'no', 'no', 'no'], needs: ['no-storage'] },
    { name: 'Team workspaces and single sign-on', cells: ['soon', 'paid', 'paid', 'paid', 'paid'] },
    { name: 'Free plan limits', cells: ['text:No caps on questions or exports', 'text:50 participants a month', 'text:100 participants, 3 polls per event', 'text:10 players (3 on a work account)', 'text:25 audience members'] },
    { name: 'Cheapest paid plan, per presenter', cells: ['text:Free to start', 'text:About $11 a month', 'text:About $17.50 a month', 'text:About $25 a month', 'text:See vendor'] },
  ] },
];

const LABELS = { yes: 'Yes', no: 'No', paid: 'Paid plan', part: 'Partly', soon: 'Not yet', check: 'Check' };

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

export function renderCell(cell) {
  if (cell.startsWith('text:')) return `<td class="cmp__text">${esc(cell.slice(5))}</td>`;
  return `<td class="cmp__${cell}"><span class="cmp__mark" aria-hidden="true"></span><span class="cmp__word">${LABELS[cell]}</span></td>`;
}

export function renderTable() {
  const head = VENDORS.map((v) => `<th scope="col"${v.us ? ' class="cmp__us"' : ''}>${v.url ? `<a href="${v.url}" rel="noopener nofollow">${esc(v.name)}</a>` : esc(v.name)}</th>`).join('');
  const body = GROUPS.map((g) => `<tbody><tr class="cmp__group"><th scope="colgroup" colspan="${VENDORS.length + 1}">${esc(g.title)}</th></tr>
${g.rows.map((r) => `<tr><th scope="row">${esc(r.name)}</th>${r.cells.map(renderCell).join('')}</tr>`).join('\n')}</tbody>`).join('\n');
  return `<div class="cmp__scroll" tabindex="0" role="region" aria-label="Comparison table, scrolls sideways on small screens"><table class="cmp"><caption class="sr">How Densight Slides compares with four other tools, checked ${CHECKED}</caption>
<thead><tr><th scope="col"><span class="sr">Feature</span></th>${head}</tr></thead>
${body}
</table></div>`;
}
