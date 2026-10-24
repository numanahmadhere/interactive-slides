// The guides: a hub with search and a page for each guide, in plain steps. Each guide is short and points to the part
// of the product it belongs to.

import { LIMITS } from '../src/billing/plans.js';


export const CATEGORIES = [
  ['start', 'Getting started', 'Your first deck, in minutes.'],
  ['ask', 'Questions and live sessions', 'Ask the room and watch the answers arrive.'],
  ['share', 'Sharing and teams', 'Courses, teammates, links and exports.'],
];

export const GUIDES = [
  { slug: 'make-your-first-deck', cat: 'start', minutes: 4, icon: 'design', tone: 'a', product: 'editor', title: 'Make your first deck', summary: 'Start a deck, add a slide, and put something on it.', keywords: 'new blank slide insert drag first start',
    steps: [['Start a deck', 'Sign in, then on <a href="/app/">My decks</a> choose <strong>Blank deck</strong>, or pick a ready-made slide from <a href="/templates/">Templates</a>.'], ['Write on the slide', 'Click the title text and type. Click again to edit in place.'], ['Add something', 'Press <strong>Insert</strong> above the slide, or type <kbd>/</kbd>, to add text, pictures, shapes and question blocks. Drag to move, drag a corner to resize, and use the guides that appear to line things up.'], ['Style it', 'Open the <strong>Deck</strong> tab on the right to change the theme and colours. Your own logo, colours and font are included.'], ['It saves as you go', 'You will see Saved at the top. Press <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Z</kbd> to undo anything.']],
    tips: ['Press <kbd>?</kbd> in the editor for the list of keyboard shortcuts.', 'On a phone, tap a block to select it and use the bar at the bottom.'], next: ['add-a-quiz-or-poll', 'present-your-deck'] },
  { slug: 'add-a-quiz-or-poll', cat: 'ask', minutes: 3, icon: 'quiz', tone: 'b', product: 'questions', title: 'Add a quiz or poll', summary: 'Put a question on a slide and set the answers.', keywords: 'quiz poll question rating timer score',
    steps: [['Insert it', 'Press <strong>Insert</strong> or type <kbd>/</kbd>, then choose <em>Quiz question</em>, <em>Live poll</em> or <em>Rating scale</em>.'], ['Write the question', 'Type the question and edit the choices in place or in the panel on the right.'], ['Mark the right answer', 'For a quiz, tick the correct choice. Add a time limit if you want points for speed.'], ['Total the scores', 'Add a <em>Score summary</em> block on a later slide to total every quiz in the deck.']],
    tips: ['Every question type is free.'], next: ['collect-words-and-answers', 'live-session'] },
  { slug: 'collect-words-and-answers', cat: 'ask', minutes: 3, icon: 'bars', tone: 'c', product: 'questions', title: 'Collect words, answers and questions', summary: 'Word clouds, open answers, ranking and audience Q&A.', keywords: 'word cloud open answers ranking q&a questions upvote',
    steps: [['Choose the block', 'Insert a <em>Word cloud</em>, <em>Open answers</em>, <em>Ranking</em> or <em>Audience Q&amp;A</em> block.'], ['Set the limit', 'In the panel, choose how many words or answers each person can send.'], ['Choose moderation', 'Hide swearing, hold answers for approval, or show everything. See <a href="/learn/moderation/">Moderation and privacy</a>.'], ['Run it live', 'Start a live session. Words grow as more people send the same one, and questions rise with upvotes.']],
    tips: ['Ask for one word to get a clearer cloud.'], next: ['moderation', 'live-session'] },
  { slug: 'present-your-deck', cat: 'start', minutes: 3, icon: 'live', tone: 'd', product: 'editor', title: 'Present your deck', summary: 'Keyboard, clicker, phone, laser pointer and timer.', keywords: 'present full screen presenter view shortcuts laser draw',
    steps: [['Start presenting', 'Press <strong>Present</strong> or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd>. Choose From this slide or From the beginning.'], ['Move around', 'Use the arrow keys, space, a clicker or your phone. <kbd>O</kbd> opens an overview.'], ['Use the tools', '<kbd>L</kbd> is a laser pointer, <kbd>D</kbd> draws on the slide, <kbd>F</kbd> is full screen and <kbd>?</kbd> lists every shortcut.'], ['Use presenter view', 'Choose <em>With presenter view</em> to see your notes, the next slide and a timer on one screen while the audience sees the slides on another.']],
    tips: ['Your deck presents offline once the page has loaded.'], next: ['live-session', 'export'] },
  { slug: 'live-session', cat: 'ask', minutes: 5, icon: 'live', tone: 'a', product: 'live-sessions', title: 'Run a live session with phones', summary: 'Show a code, take answers, move the slides from your phone.', keywords: 'live code qr phones audience remote session',
    steps: [['Start the session', 'Open a slide that has a question, then choose <strong>Present &gt; Go live &gt; Start session</strong>.'], ['Show the code', 'Show the six-character code or the QR code to the room. Phones open the link and see the question when you reach that slide.'], ['Watch the results', 'Votes appear on your slide as they arrive. Use the second QR code, labelled for the presenter, to open a phone remote and read your notes.'], ['Finish', 'Before you end, save a report if you want to keep the answers. See <a href="/learn/results-and-reports/">Results and reports</a>.']],
    tips: [`Rooms hold up to ${LIMITS.livePhones.toLocaleString('en-US')} phones.`, 'If the page reloads, the same code resumes and phones send their answers again.', 'Choose "Try it here" to test with another tab of your own browser.'], next: ['moderation', 'results-and-reports'] },
  { slug: 'moderation', cat: 'ask', minutes: 3, icon: 'shield', tone: 'b', product: 'moderation-privacy', title: 'Keep answers moderated and private', summary: 'Swear filter, approve first, and private sessions.', keywords: 'moderation swear filter approve private anonymous',
    steps: [['Pick a mode', 'In a word cloud, open-answers or Q&amp;A block choose <strong>Filter</strong> (the default), <strong>Approve first</strong> or <strong>Show everything</strong>.'], ['Approve in the queue', 'With Approve first, held answers wait in a queue on your screen. Approve or hide each one.'], ['Go private', 'In the live dialog turn on <em>Private session: keep nothing</em>. No names or teams, no saved report and no spreadsheet.']],
    tips: ['Answers are never stored on our servers.'], next: ['live-session', 'results-and-reports'] },
  { slug: 'results-and-reports', cat: 'ask', minutes: 3, icon: 'trophy', tone: 'c', product: 'reports', title: 'Results, leaderboards and reports', summary: 'Names, teams, a leaderboard, and saving what happened.', keywords: 'results report leaderboard csv download teams names',
    steps: [['Turn on names and teams', 'In the live dialog choose to ask for names and, if you like, add up to eight teams.'], ['Watch the board', 'Quiz points are 1,000 for an instant right answer, falling to 500 at the buzzer. Teams rank by average score.'], ['Save a report', 'Before you end the session, choose <strong>Save report</strong>. It is stored on your own device.'], ['Use it later', 'Open <a href="/app/reports">Reports</a> to view, print or download. Spreadsheet downloads are included.']],
    tips: ['Private sessions keep nothing, so they have no report.'], next: ['live-session', 'save-and-share'] },
  { slug: 'course', cat: 'share', minutes: 4, icon: 'cap', tone: 'd', product: 'courses', title: 'Run a self-paced course', summary: 'Share a deck so people learn in their own time.', keywords: 'course self paced certificate completion learners',
    steps: [['Save and share', 'Save the deck online (<strong>File &gt; Cloud</strong>) and press <em>Share</em> to get a link.'], ['Switch on the course', 'In the same dialog turn on <em>Self-paced course</em>, and choose whether to offer a certificate.'], ['Learners follow along', 'The page remembers which slides they have seen. At the end they can type their name to be recorded as finished and print a certificate.'], ['See who finished', 'Press <em>Who has finished</em> to see the list and download it.']],
    tips: ['"Finished" means every slide was viewed. Quizzes are not graded.'], next: ['save-and-share', 'team'] },
  { slug: 'team', cat: 'share', minutes: 4, icon: 'team', tone: 'a', product: 'teams', title: 'Work as a team', summary: 'Invite people, share decks, comment and keep one brand.', keywords: 'team invite share comments brand kit workspace',
    steps: [['Create a team', 'On <a href="/app/account">Account</a>, create a team. Then press <em>Invite someone</em> for a link that works once and lasts seven days.'], ['Share a deck', 'In the editor open <strong>File &gt; Cloud</strong> and choose the team. Everyone in it can edit and comment.'], ['Comment', 'Choose <strong>File &gt; Comments</strong> to comment on the slide you are looking at. Mark comments done as you go.'], ['Keep the brand', 'Save your logo, colours and font to the team once, and apply them to any deck with <em>Use the team brand</em>.']],
    tips: [`A team holds up to ${LIMITS.teamSeats} people.`], next: ['course', 'save-and-share'] },
  { slug: 'import', cat: 'start', minutes: 3, icon: 'export', tone: 'b', product: 'import-export', title: 'Import a PowerPoint or Google Slides deck', summary: 'Bring an existing deck in and add questions to it.', keywords: 'import powerpoint pptx google slides keynote',
    steps: [['Get a .pptx file', 'From PowerPoint, save as .pptx. From Google Slides use <em>File &gt; Download &gt; Microsoft PowerPoint</em>. From Keynote, export as PowerPoint.'], ['Import it', 'On <a href="/app/">My decks</a> choose <strong>Import a deck</strong> and pick the file.'], ['Check the result', 'Titles, text, bullet lists, pictures, speaker notes and positions come across. Tables become plain text. Charts, SmartArt, video, animations and master styling do not, and the app tells you what it left out.'], ['Add your questions', 'You get a new deck; your original is untouched. Insert polls and quizzes where you want them.']],
    tips: ['Importing is free.'], next: ['add-a-quiz-or-poll', 'export'] },
  { slug: 'save-and-share', cat: 'share', minutes: 3, icon: 'share', tone: 'c', product: 'editor', title: 'Save online and share', summary: 'Open your decks anywhere and share a link.', keywords: 'save online share link account sync',
    steps: [['Sign in', 'You sign in once with Google or an emailed link. From then on decks save online as you work.'], ['Share', 'In the editor open <strong>File &gt; Cloud</strong> and press <em>Share</em> to get a link anyone can view, no account needed.'], ['Stop sharing', 'Press <em>Stop sharing</em> and the link stops working at once.']],
    tips: [`An account keeps up to ${LIMITS.cloudDecks.toLocaleString('en-US')} decks online.`], next: ['course', 'export'] },
  { slug: 'export', cat: 'share', minutes: 2, icon: 'export', tone: 'd', product: 'import-export', title: 'Export your deck', summary: 'Web page, PDF, images, PowerPoint or a deck file.', keywords: 'export pdf png html pptx download',
    steps: [['Open Export', 'Choose <strong>File &gt; Export</strong>.'], ['Pick a format', 'Deck file, PNG images, standalone web page, PDF or PowerPoint. All are free.'], ['Use it', 'A web page keeps every interaction working, even without us.']],
    tips: ['Exporting never deletes or changes your deck.'], next: ['present-your-deck', 'import'] },
  { slug: 'claude-connector', cat: 'start', minutes: 3, icon: 'live', tone: 'b', product: 'editor', title: 'Build decks with Claude', summary: 'Connect Claude to your account and ask it for a deck.', keywords: 'claude connector ai chat assistant mcp generate create deck',
    steps: [['Make your link', 'Sign in, open <a href="/app/account">Account</a> and press <strong>Make my connector link</strong>. Copy the link straight away: it is shown once.'], ['Add it to Claude', 'In Claude open <strong>Settings &gt; Connectors</strong>, choose <em>Add custom connector</em>, name it Densight Slides and paste the link as its address.'], ['Ask for a deck', 'In a chat, turn the connector on and ask, for example: "Make me a 10 slide deck about our quarterly results, with a poll and a quiz." The deck appears in <a href="/app/">My decks</a>, ready to edit and run live.']],
    tips: ['The link is a password: anyone who has it can add and change decks in your account. Make a new one, or turn it off, from the Account page if it ever gets out.', 'Claude can also add, rewrite and delete slides in a deck it made earlier.', 'Custom connectors depend on your Claude plan.'], next: ['make-your-first-deck', 'live-session'] },
  { slug: 'build-on-your-phone', cat: 'start', minutes: 3, icon: 'live', tone: 'a', product: 'editor', title: 'Build on your phone', summary: 'The editor works on a phone: slide strip, toolbar, sheets.', keywords: 'phone mobile tablet touch edit',
    steps: [['Open the editor', 'Sign in on your phone and open My decks. The editor adapts to the screen.'], ['Pick a slide', 'The slide strip runs along the bottom; swipe it and tap a slide.'], ['Add and edit', 'Tap <strong>Insert</strong> in the bottom bar to add something, tap a block to select it, and drag it where you want. Tap <strong>Edit</strong> for its properties in a sheet that slides up.'], ['Present from the same phone', 'Press Present, or open the remote on a second phone and drive a deck shown on another screen.']],
    tips: ['Turn the phone sideways for a wider canvas.', 'Everything you make on a phone is in your account on every other device.'], next: ['make-your-first-deck', 'present-your-deck'] },
];

export const guideHref = (g) => `/learn/${g.slug}/`;

export function learnPages(ctx) {
  const { layout, esc, mailto, SUPPORT, NAME, ico } = ctx;
  const byslug = Object.fromEntries(GUIDES.map((g) => [g.slug, g]));
  const card = (g) => `<li data-guide="${esc(`${g.title} ${g.summary} ${g.keywords}`.toLowerCase())}"><a class="gcard" href="${guideHref(g)}"><span class="mm__ico mm__ico--${g.tone}">${ico(g.icon)}</span><span class="gcard__t"><b>${g.title}</b><small>${g.summary}</small></span><span class="gcard__m">${g.minutes} min</span></a></li>`;
  const out = {};

  out['learn/index.html'] = layout({
    path: '/learn/', title: `Learn ${NAME}: guides and how-tos`, description: 'Short step-by-step guides: make your first deck, add quizzes and polls, run a live session, moderate answers, run a course, work as a team and more.',
    body: `<section class="seg learnhero"><div class="wrap"><p class="label">Guides</p><h1>Learn it in <em>minutes.</em></h1><p class="lead">Short guides with one job each. Search, or start with the three below.</p>
<form class="gsearch" role="search" onsubmit="return false"><label class="sr" for="gq">Search the guides</label><input id="gq" type="search" placeholder="Search guides: quiz, import, certificate..." autocomplete="off"><span id="gcount" class="sr" role="status" aria-live="polite"></span></form></div></section>
<section id="gstart"><div class="wrap"><header class="head"><h2>Start here</h2></header><ol class="gstart">${['make-your-first-deck', 'add-a-quiz-or-poll', 'live-session'].map((s, i) => { const g = byslug[s]; return `<li><a href="${guideHref(g)}"><span class="gstart__n">${i + 1}</span><b>${g.title}</b><small>${g.summary}</small><span class="mm__go">${g.minutes} minute read <span aria-hidden="true">&rarr;</span></span></a></li>`; }).join('')}</ol></div></section>
${CATEGORIES.map(([id, name, blurb]) => `<section class="gcat band-${id === 'ask' ? 'paper' : 'plain'}" data-cat="${id}"><div class="wrap"><header class="head"><h2>${name}</h2><p class="sub">${blurb}</p></header><ul class="gcards">${GUIDES.filter((g) => g.cat === id).map(card).join('')}</ul></div></section>`).join('\n')}
<section id="gnone" hidden><div class="wrap"><p class="head">No guide matches that. Try another word, or write to <a href="${mailto('A guide I need')}">${SUPPORT}</a> and we will write it.</p></div></section>
<section class="cta-band"><div class="wrap"><h2>Stuck? A person will help.</h2><p>Write to <a class="plain" href="${mailto()}">${SUPPORT}</a>. We read every message.</p><a class="btn lg light" href="/app/">Open the app</a></div></section>
<script>(function(){var q=document.getElementById('gq'),cards=[].slice.call(document.querySelectorAll('[data-guide]')),cats=[].slice.call(document.querySelectorAll('.gcat')),start=document.getElementById('gstart'),none=document.getElementById('gnone'),n=document.getElementById('gcount');function f(){var t=q.value.trim().toLowerCase(),shown=0;cards.forEach(function(c){var ok=!t||c.dataset.guide.indexOf(t)>-1;c.hidden=!ok;if(ok)shown++});cats.forEach(function(s){s.hidden=!s.querySelector('[data-guide]:not([hidden])')});start.hidden=!!t;none.hidden=!(t&&!shown);n.textContent=t?shown+' guides found':''}q.addEventListener('input',f)})();</script>`,
  });

  for (const g of GUIDES) {
    const next = (g.next ?? []).map((s) => byslug[s]).filter(Boolean);
    out[`learn/${g.slug}/index.html`] = layout({
      path: guideHref(g), title: `${g.title} | ${NAME} guide`, description: `${g.summary} A ${g.minutes}-minute guide.`,
      body: `<article class="guide guide--page"><div class="wrap wrap--narrow">
<p class="crumbs"><a href="/learn/">Guides</a> <span aria-hidden="true">/</span> ${CATEGORIES.find((c) => c[0] === g.cat)[1]}</p>
<h1>${g.title}</h1><p class="guide__meta"><span class="mm__ico mm__ico--${g.tone}">${ico(g.icon)}</span>${g.minutes} minute read &middot; ${g.summary}</p>
<ol class="gsteps">${g.steps.map(([t, b]) => `<li><h2>${t}</h2><p>${b}</p></li>`).join('')}</ol>
${g.tips?.length ? `<div class="gtips" role="note"><b>Good to know</b><ul>${g.tips.map((t) => `<li>${t}</li>`).join('')}</ul></div>` : ''}
<p class="guide__product"><a class="btn ghost" href="/product/${g.product}/">About this part of the product <span aria-hidden="true">&rarr;</span></a></p>
${next.length ? `<h2 class="guide__nexth">Next</h2><ul class="gcards gcards--next">${next.map(card).join('')}</ul>` : ''}
</div></article>
<section class="cta-band"><div class="wrap"><h2>Ready to try it?</h2><p>Free account, no card.</p><a class="btn lg light" href="/app/">Open the app</a></div></section>`,
    });
  }
  return out;
}
