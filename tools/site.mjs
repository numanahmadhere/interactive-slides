// Builds the public pages (home, learn, privacy, terms, 404) as plain static HTML.
// No framework and almost no JavaScript, so the first visit is fast and search
// engines and link previews see real content.

const SITE = (process.env.SITE_URL ?? 'https://densight-slides.netlify.app').replace(/\/+$/, '');
const NAME = 'Densight Slides';
const UPDATED = '3 October 2026';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ICONS = {
  quiz: '<path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7M12 17h.01"/><circle cx="12" cy="12" r="9"/>',
  live: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  remote: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  export: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  design: '<circle cx="13.5" cy="6.5" r="1.5"/><circle cx="17.5" cy="10.5" r="1.5"/><circle cx="8.5" cy="7.5" r="1.5"/><circle cx="6.5" cy="12.5" r="1.5"/><path d="M12 22a10 10 0 1 1 10-10c0 2-2 3-4 3h-2a2 2 0 0 0-1 3.7c.5.8.3 3.3-3 3.3z"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
};
const ico = (n) => `<span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS[n]}</svg></span>`;

function layout({ path, title, description, body, index = true }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${index ? '' : '<meta name="robots" content="noindex">\n'}<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/site.css">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary">
<script>
// Links made before the platform had a home page (/?join=, /?remote=, /?view=) and
// sign-in returns that land here go to the app, with everything after the address kept.
(function(){var l=location;if(/[?&](join|remote|view|play)=/.test(l.search)||/access_token=|error_description=/.test(l.hash)){l.replace('/app/'+l.search+l.hash)}})();
</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
<a class="brand" href="/"><span class="mark" aria-hidden="true">D</span>${NAME}</a>
<nav class="main" aria-label="Main"><a href="/#features">Features</a><a href="/#how">How it works</a><a href="/learn/">Learn</a><a href="/#faq">FAQ</a></nav>
<span class="grow"></span>
<a class="btn sm ghost" href="/app/account">Sign in</a><a class="btn sm" href="/app/">Open the app</a>
</div></header>
<div class="flash" id="flash" role="status" hidden>Your account and online decks were deleted. Decks on this device were kept.</div>
<main id="main">
${body}
</main>
<footer class="site"><div class="wrap">
<span>&copy; ${new Date().getFullYear()} Densight Labs</span>
<a href="/learn/">Learn</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/app/">Open the app</a>
</div></footer>
<script>if(/[?&]account-deleted=1/.test(location.search))document.getElementById('flash').hidden=false;</script>
</body>
</html>
`;
}

const home = () => layout({
  path: '/',
  title: `${NAME}: interactive presentations your audience can answer`,
  description: 'Build slides with quizzes, polls and live questions. Present from your browser, let the audience join from their phones, and control the slides from yours. Free to start.',
  body: `
<section class="hero"><div class="wrap">
<span class="eyebrow">Free to start. No download.</span>
<h1>Slides your audience can answer.</h1>
<p class="lead">Build presentations with quizzes, polls and branching, run them live with the room on their phones, and share or export them when you are done.</p>
<div class="cta"><a class="btn" href="/app/">Start building</a><a class="btn ghost" href="#demo">Try a slide first</a></div>
<p class="note">No account needed to build and present. Sign in only to save online.</p>
<div class="demo" id="demo"><div class="bar" aria-hidden="true"><i></i><i></i><i></i></div>
<div class="frame" id="frame"><button type="button" id="load"><span>Play the interactive demo</span></button></div></div>
</div></section>

<section id="features"><div class="wrap">
<h2>Everything a live presentation needs</h2>
<p class="sub">Made for workshops, classrooms, pitches and meetings where people should take part, not just watch.</p>
<div class="cards">
<div class="card">${ico('quiz')}<h3>Interactive blocks</h3><p>Quizzes with instant feedback, polls, matching, ordering, flip cards, hotspots, timelines, charts, calculators and a live code lab, all inside your slides.</p></div>
<div class="card">${ico('live')}<h3>Live audience</h3><p>Show a code or QR. People answer polls and quiz questions on their phones and watch the results build on your screen. No app for them to install.</p></div>
<div class="card">${ico('remote')}<h3>Phone remote</h3><p>Move the slides from your phone and read your speaker notes and the next slide while you talk.</p></div>
<div class="card">${ico('design')}<h3>Looks professional</h3><p>Themes, your own colours and logo, backgrounds, shapes, icons and diagrams. Text stays readable on any colour you pick.</p></div>
<div class="card">${ico('export')}<h3>Present or export anywhere</h3><p>Present in the browser, even offline. Export to a standalone web page, PDF, images or PowerPoint.</p></div>
<div class="card">${ico('share')}<h3>Save and share</h3><p>Decks save on your device automatically. Sign in to keep them online, open them anywhere, and share a link that anyone can view.</p></div>
</div></div></section>

<section id="how" class="alt"><div class="wrap">
<h2>From idea to live in minutes</h2>
<p class="sub">Three steps, and the first one takes a few seconds.</p>
<ol class="steps">
<li><h3>Build</h3><p>Start from a blank deck or the demo. Add headings, text, images and interactive blocks. Everything saves as you go.</p></li>
<li><h3>Present</h3><p>Press Present. Use the keyboard, a clicker, or your phone. Laser pointer, drawing and a timer are built in.</p></li>
<li><h3>Engage</h3><p>Start a live session, show the code, and watch answers arrive. Download or share the deck afterwards.</p></li>
</ol></div></section>

<section><div class="wrap">
<h2>Made for people who teach, train and pitch</h2>
<p class="sub">Use it wherever a room should answer back.</p>
<div class="cards">
<div class="card"><h3>Workshops and training</h3><p>Check understanding with quick quizzes and see at a glance what the room knows.</p></div>
<div class="card"><h3>Classrooms</h3><p>Run a poll to start a lesson, end with a quiz, and share the deck with students afterwards.</p></div>
<div class="card"><h3>Pitches and meetings</h3><p>Branch to the part that matters to this audience with buttons, and keep your notes on your phone.</p></div>
<div class="card"><h3>Events and talks</h3><p>Let hundreds vote from their seats while you stay in control of the screen.</p></div>
</div></div></section>

<section id="faq" class="alt"><div class="wrap">
<h2>Questions</h2>
<details><summary>Is it free?</summary><p>You can build, present and export without paying or signing in. Saving online and sharing links need a free account.</p></details>
<details><summary>Does my audience need an account or an app?</summary><p>No. They open a link or scan a QR code in their phone's browser and enter nothing else.</p></details>
<details><summary>Where are my decks stored?</summary><p>On your device first. If you sign in they are also saved to your online account so you can open them on other devices. See the <a href="/privacy/">privacy policy</a>.</p></details>
<details><summary>Does it work offline?</summary><p>After your first visit, yes: you can edit and present without a connection. Live audience features and online saving need one.</p></details>
<details><summary>Can I get my slides out?</summary><p>Yes: a standalone web page, PDF, PNG images, PowerPoint, or the deck file itself. Your content is yours.</p></details>
<details><summary>Which browsers work?</summary><p>Current Chrome, Edge, Firefox and Safari, on computers, tablets and phones. Audience pages work on phones from about 2022 onward.</p></details>
</div></section>

<section class="final"><div class="wrap">
<h2>Make your next presentation a conversation</h2>
<p class="sub" style="margin-inline:auto">Open the app and have your first deck ready in minutes.</p>
<a class="btn" href="/app/">Start building</a>
</div></section>
<script>
(function(){var b=document.getElementById('load');if(!b)return;b.addEventListener('click',function(){var f=document.createElement('iframe');f.src='/app/?play&deck=interactive';f.title='Interactive demo deck';f.loading='lazy';f.allow='fullscreen';document.getElementById('frame').replaceChildren(f);f.focus()})})();
</script>`,
});

const guides = [
  ['Make your first deck', '<ol><li>Open <a href="/app/">My decks</a> and choose <strong>Blank deck</strong>.</li><li>Click the title text on the slide and type. Click it again to edit in place.</li><li>Use the <strong>+</strong> next to a slot in the right panel to add blocks: text, lists, images, quizzes and more.</li><li>Your deck saves on your device as you work. Rename it with the title box at the top.</li></ol>'],
  ['Add a quiz or poll', '<p>In the right panel under <strong>Add content</strong>, choose <em>Quiz question</em> or <em>Live poll</em>. Type the question, edit the choices, and tick which choice is correct for a quiz. Add a <em>Score summary</em> block on a later slide to total every quiz.</p>'],
  ['Present your deck', '<p>Press <strong>Present</strong> or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd>. Move with the arrow keys or space. <kbd>O</kbd> opens an overview, <kbd>L</kbd> is a laser pointer, <kbd>D</kbd> draws, <kbd>F</kbd> is full screen and <kbd>?</kbd> lists every shortcut. Choose <em>With presenter view</em> for notes and a timer on a second screen.</p>'],
  ['Run a live session with phones', '<ol><li>Open a slide that has a poll or quiz, then choose <strong>Present &gt; Go live &gt; Start session</strong>.</li><li>Show the code or QR to the room. Phones open the link and see the question when you reach that slide.</li><li>Votes appear on your slide as they arrive. Scan the second QR code with your own phone to use it as a remote with your notes.</li></ol><p>If you reload your page mid-session, the same code resumes and phones send their answers again.</p>'],
  ['Save online and share', '<p>Choose <strong>Sign in</strong>, enter your email, and open the link we send. From then on your decks also save online. In the editor open <strong>File &gt; Cloud</strong> and press <em>Share</em> to get a link anyone can view. <em>Stop sharing</em> ends it immediately.</p>'],
  ['Export', '<p>Open <strong>File &gt; Export</strong> for a standalone web page (every interaction works), a PDF, PNG images, PowerPoint, or the deck file to reopen later.</p>'],
];

const learn = () => layout({
  path: '/learn/',
  title: `Learn ${NAME}`,
  description: 'Short guides: make a deck, add quizzes and polls, present, run a live session with phones, save and share, export.',
  body: `<div class="doc"><h1>Learn ${NAME}</h1><p class="meta">Short guides. The app also has an optional guided tour that you can skip.</p>
${guides.map(([t, b]) => `<div class="guide"><h2>${esc(t)}</h2>${b}</div>`).join('\n')}
<p style="margin-top:32px"><a class="btn" href="/app/">Open the app</a></p></div>`,
});

const privacy = () => layout({
  path: '/privacy/',
  title: `Privacy policy | ${NAME}`,
  description: `What ${NAME} stores, where, and how to delete it.`,
  body: `<div class="doc"><h1>Privacy policy</h1><p class="meta">Last updated ${UPDATED}. ${NAME} is run by Densight Labs.</p>
<h2>The short version</h2><p>We keep your decks and your email address, only if you create an account. We do not use advertising or tracking cookies, and we do not sell data.</p>
<h2>On your device</h2><p>Decks and images you create are stored in your browser (IndexedDB and localStorage) on your device. They are not sent anywhere unless you sign in. Clearing your browser data removes them. We use this storage to make the app work, not to follow you.</p>
<h2>If you create an account</h2><p>We store your email address, the decks you save online (including images inside them), and for decks you choose to share, an unguessable link token. Sign-in and storage are provided by Supabase. You can delete your account and all online decks at any time from Account &gt; Delete my account.</p>
<h2>Shared decks</h2><p>Anyone with a share link can view that deck without an account. Turn sharing off and the link stops working immediately. Do not put information in a shared deck that you do not want others to see.</p>
<h2>Live sessions</h2><p>Audience answers travel through a realtime messaging service (Supabase Realtime) between the presenter's page and the audience's phones. Answers are held in the presenter's browser while the session runs and are not saved on our servers. The audience does not need an account and is not asked for a name.</p>
<h2>Hosting and logs</h2><p>The site is hosted on Netlify, which may keep standard server logs (such as IP address and time of request) for security and operation.</p>
<h2>Your choices</h2><ul><li>Delete a deck, or all decks on this device, from My decks and Account.</li><li>Delete your account and all online data from Account.</li><li>Export any deck as a file at any time.</li></ul>
<h2>Children</h2><p>The service is not directed at children under 13, and accounts are for people old enough to agree to the terms in their country. Teachers should not require pupils to create accounts; audience members never need one.</p>
<h2>Changes and contact</h2><p>If this policy changes we will update the date above. Questions: contact Densight Labs through <a href="https://densightlabs.com">densightlabs.com</a>.</p></div>`,
});

const terms = () => layout({
  path: '/terms/',
  title: `Terms of use | ${NAME}`,
  description: `The rules for using ${NAME}.`,
  body: `<div class="doc"><h1>Terms of use</h1><p class="meta">Last updated ${UPDATED}.</p>
<p>By using ${NAME} you agree to these terms. If you do not agree, please do not use the service.</p>
<h2>Your content</h2><p>You own the decks you make. You give us permission to store and display them as needed to run the service for you, including showing a shared deck to anyone who has its link.</p>
<h2>What you may not do</h2><ul><li>Upload or share anything illegal, hateful, harassing, deceptive, or that infringes someone else's rights.</li><li>Use the service to send spam, malware, or phishing content, or to collect people's personal data without consent.</li><li>Try to break, overload, scrape, or gain unauthorised access to the service or other people's data.</li><li>Create accounts or sessions in bulk, or use live sessions to flood others.</li></ul>
<h2>Reporting and removal</h2><p>We may remove content or suspend sharing or accounts that break these rules, with or without notice. If you see a shared deck that breaks them, tell us through <a href="https://densightlabs.com">densightlabs.com</a>.</p>
<h2>Availability and changes</h2><p>We work to keep the service running but do not promise it will always be available, error-free, or that features will not change. Keep your own copy of important decks by exporting them.</p>
<h2>No warranty and limits of liability</h2><p>The service is provided as is. To the extent the law allows, Densight Labs is not liable for indirect or consequential losses, or for losses from content you or others create or share. Nothing here limits rights you have by law that cannot be limited.</p>
<h2>Ending</h2><p>You can stop using the service and delete your account at any time. We may end or limit access if these terms are broken.</p>
<h2>Changes</h2><p>We may update these terms and will change the date above. Continuing to use the service after a change means you accept it.</p></div>`,
});

const notFound = () => layout({
  path: '/404.html',
  title: `Page not found | ${NAME}`,
  description: 'That page does not exist.',
  index: false,
  body: `<div class="doc"><h1>Page not found</h1><p>That address does not exist. <a href="/">Go to the home page</a> or <a href="/app/">open the app</a>.</p></div>`,
});

// path (relative to dist/) -> file contents
export function buildSite() {
  const pages = {
    'index.html': home(),
    'learn/index.html': learn(),
    'privacy/index.html': privacy(),
    'terms/index.html': terms(),
    '404.html': notFound(),
    'robots.txt': `User-agent: *\nAllow: /\nDisallow: /app/\n\nSitemap: ${SITE}/sitemap.xml\n`,
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/learn/', '/privacy/', '/terms/'].map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('\n')}\n</urlset>\n`,
  };
  return pages;
}
