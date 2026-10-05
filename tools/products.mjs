// One page for each part of the product, so "Product" in the menu leads somewhere specific instead of one long page.
// Everything that mentions a plan is worked out from the real plan table, so a page cannot promise what a plan lacks.

import { PLANS, PLAN_ORDER, PRICES, TRIAL_DAYS, canUseKind } from '../src/billing/plans.js';

const firstPlan = (test) => PLAN_ORDER.find((id) => test(PLANS[id]));
const planName = (id) => (id === 'free' ? 'Free' : `${PLANS[id].name} and above`);
const fromPlan = (test) => planName(firstPlan(test));

export const PRODUCTS = [
  { slug: 'live-sessions', name: 'Live sessions', short: 'Codes, phones and results that build on your screen.', icon: 'live', tone: 'a' },
  { slug: 'questions', name: 'Polls, quizzes and word clouds', short: 'Every question type, and which plan each one needs.', icon: 'bars', tone: 'b' },
  { slug: 'moderation-privacy', name: 'Moderation and privacy', short: 'Swear filter, approve-first, and sessions that keep nothing.', icon: 'shield', tone: 'c' },
  { slug: 'courses', name: 'Self-paced courses', short: 'Completion list and certificates for any shared deck.', icon: 'cap', tone: 'd' },
  { slug: 'teams', name: 'Teams', short: 'Shared decks, comments and one brand kit.', icon: 'team', tone: 'a' },
  { slug: 'import-export', name: 'Import and export', short: 'Bring PowerPoint in, take decks out in five formats.', icon: 'export', tone: 'b' },
  { slug: 'editor', name: 'The slide editor', short: 'Free-form canvas, themes, brand colours and blocks.', icon: 'design', tone: 'c' },
  { slug: 'reports', name: 'Results and reports', short: 'Leaderboards, session reports and spreadsheet downloads.', icon: 'trophy', tone: 'd' },
];
export const productHref = (p) => `/product/${p.slug}/`;

const EXPORT_NAMES = { json: 'Deck file', png: 'PNG images', html: 'Standalone web page', pdf: 'PDF', pptx: 'PowerPoint' };

export function productPages(ctx) {
  const { layout, esc, mailto, SUPPORT, NAME, ico, CHECK, mkWin, mockEditor, mockResults, mockReport, mockCourse, mockTeam, SEGMENTS, segHref } = ctx;

  const mockModeration = () => mkWin('Held for approval', `<div class="mkm"><p class="mkm__q">What should we change?</p>${[['Shorter meetings, please', 'ok'], ['This is a waste of time', 'no'], ['More time for questions', 'ok']].map(([t, s]) => `<div class="mkm__row ${s}"><span>${t}</span><b>${s === 'ok' ? 'Approve' : 'Hide'}</b></div>`).join('')}<small>3 waiting &middot; swearing is hidden automatically</small></div>`);
  const mockImport = () => mkWin('Import a deck', `<div class="mki"><div class="mki__file"><b>Quarterly review.pptx</b><span>14 slides</span></div><div class="mki__arrow" aria-hidden="true">&rarr;</div><div class="mki__out"><span>Titles and text</span><span>Pictures</span><span>Speaker notes</span><span class="no">Charts (not imported)</span></div></div>`);
  const mockExport = () => mkWin('Export', `<div class="mkf">${Object.entries(EXPORT_NAMES).map(([k, n]) => `<div class="mkf__row"><span>${n}</span><b>${fromPlan((p) => p.exports.includes(k))}</b></div>`).join('')}</div>`);
  const mockQuestions = () => `<div class="mkq" aria-hidden="true">${[['quiz', 'Quiz'], ['ask', 'Word cloud'], ['rank', 'Ranking'], ['discuss', 'Q&amp;A']].map(([s, t]) => `<div><img src="/art/spot-${s}.svg" alt="" width="200" height="200" loading="lazy"><span>${t}</span></div>`).join('')}</div>`;

  const kindCards = [
    ['Live poll', 'poll', 'Pick one or several options and watch the bars grow.'],
    ['Quiz', 'quiz', 'A right answer, optional timer, points for speed.'],
    ['Rating scale', 'rating', 'One to five, seven or ten, with an average.'],
    ['Reactions and hand raise', 'poll', 'Quick buttons such as "Agree" or "Slow down".'],
    ['Ranking', 'ranking', 'The room puts items in order and you see the group order.'],
    ['Word cloud', 'cloud', 'One word each; the most common answers grow biggest.'],
    ['Open answers', 'open', 'Short written answers, shown as they arrive.'],
    ['Audience Q&amp;A', 'qna', 'Questions with upvotes, answered or hidden by you.'],
    ['Pin on an image', 'pin', 'Tap a map, plan or diagram; the dots appear on your screen.'],
  ].map(([t, k, d]) => ({ t, d, plan: canUseKind('free', k) ? 'Free' : fromPlan((p) => p.kinds.includes(k)) }));

  const SPECS = {
    'live-sessions': {
      title: `Live sessions | ${NAME}`,
      description: 'Run a live session: show a code, the audience answers on their phones, results build on your screen. Phone remote, resume after a refresh, rooms up to 1,000.',
      eyebrow: 'Live sessions', h1: 'Show a code. The room <em>answers.</em>',
      lead: 'Start a session from the slide you are on. People scan a QR code or type six characters, answer on their own phone, and the results build on your screen as they arrive. Nothing for them to install.',
      mock: mockResults(),
      steps: [['Start', 'Press Present, then Go live. You get a six-character code and a QR code.'], ['Share', 'Show the code on your screen. Phones open the link and see the question when you reach that slide.'], ['Watch', 'Answers appear live. Move on when you are ready, and download or save a report afterwards.']],
      features: [
        ['live', 'No app, no account', 'The audience page works in any current browser on a phone or a computer.'],
        ['remote', 'Phone remote', 'Move the slides from your own phone and read your notes and the next slide while you talk.'],
        ['shield', 'You hold the answers', 'Responses and the quiz answer key stay in your browser. Names are collected only if you turn them on.'],
        ['share', 'Survives a refresh', 'Reload the presenter page mid-session and the same code carries on; phones send their answers again.'],
        ['trophy', 'Teams and a leaderboard', `Timed quizzes with names, teams and a live leaderboard (${fromPlan((p) => p.leaderboard)}).`],
        ['bars', `Rooms of ${PLANS.free.livePhones} to ${PLANS.advanced.livePhones.toLocaleString('en-US')}`, `${PLANS.free.livePhones} phones on Free, ${PLANS.starter.livePhones} on Starter, ${PLANS.pro.livePhones} on Pro, ${PLANS.advanced.livePhones.toLocaleString('en-US')} on Advanced.`],
      ],
      faq: [['Do people need to be in the room?', 'No. The same code works for people in the room and people on a video call.'], ['What if the Wi-Fi is bad?', 'Your slides present offline, but phones need a connection to send answers. For a very large room, check coverage first.'], ['Can I try it without anyone else?', 'Yes. Choose "Try it here" to open the audience page in another tab of the same browser.']],
      guide: 'live-session',
    },
    questions: {
      title: `Polls, quizzes and word clouds | ${NAME}`,
      description: 'Every question type in Densight Slides: polls, quizzes, ratings, rankings, word clouds, open answers, Q&A, pin on an image, and which plan each one needs.',
      eyebrow: 'Question types', h1: 'The right question for <em>every moment.</em>',
      lead: 'Drop any of these between your slides. Each one works on the audience\'s phones and on your screen, and each has a readable text version for screen readers.',
      mock: mockQuestions(),
      cards: kindCards,
      steps: [['Insert', 'Press Insert or type / and choose a question type.'], ['Write', 'Type your question and options. Quizzes take a right answer and an optional timer.'], ['Present', 'Start a live session and show the code. The block fills in as people answer.']],
      features: [
        ['quiz', 'Quizzes that teach', 'Points fall from 1,000 to 500 with time, wrong answers score nothing, and a score summary totals the deck.'],
        ['design', 'Looks like your deck', 'Question blocks follow your theme, colours and font, and sit anywhere on a slide.'],
        ['export', 'Download the answers', `Every answer can be downloaded as a spreadsheet (${fromPlan((p) => p.csv)}).`],
      ],
      faq: [['Which question types are free?', 'Live polls, quizzes, rating scales and reactions are free. Word clouds, open answers, ranking, Q&amp;A and pins need a paid plan.'], ['Can the same person vote twice?', 'No. Each phone has one current answer per question and can change it.']],
      guide: 'add-a-quiz-or-poll',
    },
    'moderation-privacy': {
      title: `Moderation and privacy | ${NAME}`,
      description: 'A swear filter by default, approve-first moderation, and private sessions that keep nothing. How Densight Slides keeps live answers under your control.',
      eyebrow: 'Moderation and privacy', h1: 'Open to everyone. Under <em>your control.</em>',
      lead: 'Let the room type freely without a surprise on the big screen. Hide swearing automatically, hold every answer until you approve it, or run a private session that keeps nothing at all.',
      mock: mockModeration(),
      steps: [['Choose a mode', 'In a word cloud, open-answers or Q&A block, pick Filter, Approve first or Show everything.'], ['Run the session', 'Held answers wait in a queue on your screen. Approve what you want shown.'], ['End it', 'In a private session nothing is kept: no names, no report, no download.']],
      features: [
        ['shield', 'Swear filter on by default', 'Common swearing and the usual spelling tricks are hidden, without blocking ordinary words.'],
        ['quiz', 'Approve first', 'Every answer waits for you. The sender sees that it is being checked.'],
        ['live', 'Private sessions', 'No names or teams, no saved report, no spreadsheet. Answers disappear when you end it.'],
        ['share', 'Answers stay with you', 'Responses are held in your browser while the session runs and are not stored on our servers.'],
      ],
      faq: [['Is moderation available on the free plan?', 'Word clouds, open answers and Q&amp;A, where moderation applies, come with a paid plan. Private sessions work on every plan.'], ['Can I see who sent what?', 'Only if you turned names on. Otherwise answers are anonymous.']],
      guide: 'moderation',
    },
    courses: {
      title: `Self-paced courses | ${NAME}`,
      description: 'Share a deck as a self-paced course: learners go through it in their own time, you see who finished, and they can print a certificate.',
      eyebrow: 'Self-paced courses', h1: 'Teach when you are <em>not in the room.</em>',
      lead: 'Turn any shared deck into a course. Learners work through the slides at their own speed, the page remembers where they have been, and at the end they can record their name and print a certificate.',
      mock: mockCourse(),
      steps: [['Share', 'Save the deck online and press Share to get a link.'], ['Switch it on', 'Turn on Self-paced course in the same dialog, and choose whether to offer a certificate.'], ['Follow along', 'See who has finished, download the list, and share the link again whenever you like.']],
      features: [
        ['cap', 'Progress that remembers', 'Which slides a visitor has seen is kept on their own device, so they can come back.'],
        ['trophy', 'Certificates', 'A clean, printable certificate with their name, and a record on your side.'],
        ['export', 'The completion list', 'See and download everyone who finished, with the time.'],
        ['shield', 'Light on data', 'We store only the name someone types, against a deck that is being shared.'],
      ],
      faq: [['What counts as finished?', 'Viewing every slide. Quizzes are not graded, and this is not a replacement for a learning management system.'], ['Which plan?', `${fromPlan((p) => p.selfPaced)}.`]],
      guide: 'course',
    },
    teams: {
      title: `Teams | ${NAME}`,
      description: 'Team workspaces for Densight Slides: shared decks, comments on slides, one logo and colour set for everyone, and invite links.',
      eyebrow: 'Teams', h1: 'One workspace for everyone who <em>presents.</em>',
      lead: 'Share decks with your colleagues, comment on slides instead of sending screenshots, and keep one logo, colour set and font so every deck looks like it came from the same place.',
      mock: mockTeam(),
      steps: [['Create a team', 'On the Account page, create a team and invite people with a link that works once.'], ['Share decks', 'In File, Cloud, put a deck in the team. Everyone in it can edit and comment.'], ['Keep it consistent', 'Save your brand once, and apply it to any deck in one click.']],
      features: [
        ['team', 'Invite by link', 'People join with a link that expires in seven days. They do not need a plan of their own.'],
        ['quiz', 'Comments on slides', 'Discuss a slide where it is. Mark comments done.'],
        ['design', 'Shared brand kit', 'Logo, colours and font, saved once and applied anywhere.'],
        ['shield', 'You stay in charge', 'Only a deck\'s maker can delete it, publish a link or move it. Closing a team does not delete decks.'],
      ],
      faq: [['How many people?', `${PLANS.pro.teamSeats} on Pro and ${PLANS.advanced.teamSeats} on Advanced.`], ['Do teammates need to pay?', 'No. Only the person who creates the team needs the plan.']],
      guide: 'team',
    },
    'import-export': {
      title: `Import and export | ${NAME}`,
      description: 'Import PowerPoint and Google Slides decks, and export to a web page, PDF, PNG images, PowerPoint or a deck file.',
      eyebrow: 'Import and export', h1: 'Bring what you have. Take it <em>anywhere.</em>',
      lead: 'Start from the PowerPoint you already made, add questions where they belong, and export the finished deck as a web page, PDF, images or PowerPoint. Your work is never locked in.',
      mock: mockImport(),
      extra: mockExport(),
      steps: [['Import', 'On My decks choose Import a deck and pick a .pptx file. For Google Slides, download as PowerPoint first.'], ['Add questions', 'Your slides arrive as a new deck. Insert polls, quizzes and more where you want them.'], ['Export', `Open File, Export. ${Object.entries(EXPORT_NAMES).map(([k, n]) => `${n} (${fromPlan((p) => p.exports.includes(k))})`).join(', ')}.`]],
      features: [
        ['export', 'What comes across', 'Titles, text, bullet lists, pictures, speaker notes and positions.'],
        ['quiz', 'What does not', 'Charts, SmartArt, video, animations and master styling. The importer tells you what it left out.'],
        ['share', 'Your original is untouched', 'Importing makes a new deck. The file you chose is not changed.'],
        ['design', 'Standalone web page', 'Every interaction works in an exported page, even without us.'],
      ],
      faq: [['Does it work with Keynote?', 'Export from Keynote as PowerPoint first.'], ['Is exporting limited?', `Deck files and PNG images are free. Web page and PDF need ${fromPlan((p) => p.exports.includes('pdf'))}; PowerPoint needs ${fromPlan((p) => p.exports.includes('pptx'))}.`]],
      guide: 'import',
    },
    editor: {
      title: `The slide editor | ${NAME}`,
      description: 'A free-form slide editor in your browser: drag anything anywhere, snapping guides, themes, your brand colours, 40 blocks and ready-made slides. Works offline.',
      eyebrow: 'The slide editor', h1: 'Design the slide. Drop in <em>the question.</em>',
      lead: 'Place text, pictures, shapes and interactive blocks anywhere on the slide, with guides that snap them into line. Start from a ready-made slide or a blank one, and it saves as you go, even offline.',
      mock: mockEditor(),
      steps: [['Pick a start', 'Choose a ready-made slide, a blank slide, or import a PowerPoint.'], ['Add and arrange', 'Press Insert or type /. Drag, resize, rotate and group. Guides snap things into line.'], ['Style it', 'Change the theme, colours and font, and add your logo, in one panel.']],
      features: [
        ['design', 'Free-form canvas', 'Nothing is trapped in a grid. Group, lock, hide and animate blocks.'],
        ['bars', 'Blocks for everything', 'Questions, charts, tables, timelines, diagrams, flip cards, hotspots, calculators and a live code lab.'],
        ['share', 'Works on your phone', 'Open the editor on a phone or tablet, tap a block to edit it, and present from the same device.'],
        ['export', 'Works offline', 'After your first visit you can build and present without a connection.'],
        ['shield', 'Readable by default', 'Text stays readable on any colour you pick, and blocks have text versions for screen readers.'],
        ['quiz', 'Undo that works', 'Every change can be undone, including a deleted slide.'],
      ],
      faq: [['Can I use my own fonts and colours?', `Your own logo, colours and font come with ${fromPlan((p) => p.brand)}. Every plan includes ${PLANS.free.themes.length} themes.`], ['Is there a mobile version?', 'Yes. The editor adapts to phones: a slide strip, a bottom toolbar and bottom sheets for properties.']],
      guide: 'make-your-first-deck',
    },
    reports: {
      title: `Results and reports | ${NAME}`,
      description: 'Leaderboards, session reports saved on your device, and spreadsheet downloads of every answer from a live session.',
      eyebrow: 'Results and reports', h1: 'See what the room said, and <em>keep it.</em>',
      lead: 'Run a timed quiz with names and teams, watch the leaderboard, then save a report of the whole session or download every answer as a spreadsheet.',
      mock: mockReport(),
      steps: [['Run it', 'Ask your questions in a live session. Turn on names and teams for a leaderboard.'], ['Save it', 'Before you end, save a report. It is stored on your own device.'], ['Use it', 'Open reports any time, print them or download the spreadsheet.']],
      features: [
        ['trophy', 'Leaderboard and teams', `Points for speed, ranked players and teams ranked by average (${fromPlan((p) => p.leaderboard)}).`],
        ['export', 'Spreadsheet download', `Every question and answer in one file (${fromPlan((p) => p.csv)}).`],
        ['shield', 'Kept on your device', 'Reports are stored in your browser, not on our servers, and you choose when to save one.'],
        ['quiz', 'Print or save as PDF', 'A clean report page you can print or save, with the session summary first.'],
      ],
      faq: [['Can I see a session after it ended?', 'Only if you saved a report before ending. The app asks you.'], ['Private sessions?', 'They keep nothing, so there is no report or download.']],
      guide: 'live-session',
    },
  };

  const plansStrip = (slug) => {
    const rows = {
      'live-sessions': [['Free', `Rooms up to ${PLANS.free.livePhones} phones`], ['Starter', `${PLANS.starter.livePhones} phones`], ['Pro', `${PLANS.pro.livePhones} phones`], ['Advanced', `${PLANS.advanced.livePhones.toLocaleString('en-US')} phones`]],
    }[slug];
    return rows ? `<ul class="pstrip">${rows.map(([n, d]) => `<li><b>${n}</b><span>${d}</span></li>`).join('')}</ul>` : '';
  };

  const page = (slug, spec) => {
    const me = PRODUCTS.find((p) => p.slug === slug);
    const others = PRODUCTS.filter((p) => p.slug !== slug);
    return layout({
      path: `/product/${slug}/`, title: spec.title, description: spec.description,
      body: `<section class="seg prodhero"><div class="wrap seg__grid"><div>
<p class="label">${spec.eyebrow}</p><h1>${spec.h1}</h1><p class="lead">${spec.lead}</p>
<p class="cta"><a class="btn lg" href="/app/">Start building free</a><a class="textlink" href="/learn/${spec.guide}/">Read the guide <span aria-hidden="true">&rarr;</span></a></p></div>
<div class="prodhero__vis">${spec.mock}</div></div></section>
${spec.cards ? `<section><div class="wrap"><header class="head head--center"><h2>Pick a question type</h2><p class="sub">Nine ways to ask, and the plan each one comes with.</p></header><ul class="kinds">${spec.cards.map((c) => `<li class="kind"><b>${c.t}</b><p>${c.d}</p><span class="kind__plan">${c.plan}</span></li>`).join('')}</ul></div></section>` : ''}
<section class="band-paper"><div class="wrap"><header class="head head--center"><h2>How it works</h2></header>
<ol class="psteps">${spec.steps.map(([t, d], i) => `<li class="reveal"><span class="psteps__n">${i + 1}</span><h3>${t}</h3><p>${d}</p></li>`).join('')}</ol>${plansStrip(slug)}${spec.extra ? `<div class="prodextra">${spec.extra}</div>` : ''}</div></section>
<section><div class="wrap"><header class="head head--center"><h2>What is included</h2></header>
<div class="fcards fcards--two">${spec.features.map(([i, t, d]) => `<article class="fcard reveal"><span class="fcard__ico">${ico(i)}</span><h3>${t}</h3><p>${d}</p></article>`).join('')}</div></div></section>
<section class="band-paper"><div class="wrap faq"><div><p class="label">Questions</p><h2>Good to know.</h2><p class="sub">More in the <a href="/learn/${spec.guide}/">guide</a>, or write to <a href="${mailto(me.name)}">${SUPPORT}</a>.</p></div>
<div>${spec.faq.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></div></section>
<section><div class="wrap"><header class="head head--center"><h2>More of the product</h2></header><ul class="chips chips--center">${others.map((p) => `<li><a href="${productHref(p)}"><span class="mm__ico mm__ico--${p.tone}">${ico(p.icon)}</span>${p.name}</a></li>`).join('')}</ul></div></section>
<section class="cta-band"><div class="wrap"><h2>Try it with your next session.</h2><p>Free account, no card. Paid plans start at $${PRICES.starter.month} a month with a ${TRIAL_DAYS}-day free trial.</p><a class="btn lg light" href="/app/">Start building free</a></div></section>`,
    });
  };

  const out = {};
  for (const [slug, spec] of Object.entries(SPECS)) out[`product/${slug}/index.html`] = page(slug, spec);

  out['product/index.html'] = layout({
    path: '/product/', title: `Product | ${NAME}`,
    description: 'Everything in Densight Slides: live sessions, question types, moderation and privacy, courses, teams, import and export, the editor and reports.',
    body: `<section class="seg"><div class="wrap"><p class="label">Product</p><h1>Everything you need to <em>run the room.</em></h1><p class="lead">One tool for the slides, the questions and the results. Pick a part to see what it does and which plan it comes with.</p><p class="cta"><a class="btn lg" href="/app/">Start building free</a><a class="textlink" href="/pricing/">See pricing <span aria-hidden="true">&rarr;</span></a></p></div></section>
<section><div class="wrap"><ul class="ucgrid">${PRODUCTS.map((p) => `<li><a class="uccard uccard--${p.tone}" href="${productHref(p)}"><span class="mm__ico mm__ico--${p.tone}">${ico(p.icon)}</span><b>${p.name}</b><small>${p.short}</small><span class="mm__go">Learn more <span aria-hidden="true">&rarr;</span></span></a></li>`).join('')}</ul></div></section>
<section class="band-paper"><div class="wrap"><header class="head head--center"><h2>Used for</h2></header><ul class="chips chips--center">${SEGMENTS.map((x) => `<li><a href="${segHref(x)}"><span class="mm__ico mm__ico--${x.tone}">${ico(x.icon)}</span>${x.name}</a></li>`).join('')}</ul></div></section>
<section class="cta-band"><div class="wrap"><h2>Try it with your next session.</h2><p>Free account, no card.</p><a class="btn lg light" href="/app/">Start building free</a></div></section>`,
  });
  return out;
}
