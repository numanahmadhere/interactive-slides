// Builds the public pages (home, learn, privacy, terms, 404) as plain static HTML.
// No framework and almost no JavaScript, so the first visit is fast and search
// engines and link previews see real content.

import { renderTable, CHECKED } from './compare.mjs';
import { listBlocks } from '../src/core/blocks/index.js';
import { PLANS, PLAN_ORDER, PRICES, TRIAL_DAYS } from '../src/billing/plans.js';
import { highlights } from '../src/billing/features.js';

const planCards = () => PLAN_ORDER.map((id) => {
  const plan = PLANS[id];
  const price = PRICES[id];
  return `<article class="bp__card${id === 'pro' ? ' is-highlight' : ''}">
<h3 class="bp__name">${plan.name}</h3><p class="bp__blurb">${plan.blurb}</p>
<p class="bp__price"><b>${price ? `$${price.month}` : '$0'}</b><span>${price ? ' a month' : ' forever'}</span></p>
<p class="bp__save">${price ? `or $${price.year} a year, two months free` : ''}</p>
<ul class="bp__list">${highlights(id).map((t) => `<li>${t}</li>`).join('')}</ul>
${price ? `<a class="btn${id === 'pro' ? '' : ' ghost'}" href="/app/account?plan=${id}">Start ${TRIAL_DAYS}-day free trial</a>` : '<a class="btn ghost" href="/app/">Start building</a>'}
</article>`;
}).join('\n');

const BLOCK_COUNT = listBlocks().filter((d) => !d.internal).length;

const SITE = (process.env.SITE_URL ?? 'https://densight-slides.netlify.app').replace(/\/+$/, '');
const NAME = 'Densight Slides';
const SUPPORT = 'hello@densight.com';
const COMPANY = 'https://densightlabs.com';
const mailto = (subject = 'Densight Slides support') => `mailto:${SUPPORT}?subject=${encodeURIComponent(subject)}`;
const LOGO = '<img class="logo logo--on-light" src="/brand/logo-64.png" width="32" height="32" alt=""><img class="logo logo--on-dark" src="/brand/logo-light-64.png" width="32" height="32" alt="">';
const LOGO_DARK_BG = '<img class="logo" src="/brand/logo-light-64.png" width="32" height="32" alt="">';
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

const THEME_INIT = "try{var t=localStorage.getItem('interactive-slides:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}document.documentElement.classList.add('js')";

function layout({ path, title, description, body, index = true, hero = false }) {
  const url = SITE + path;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${index ? '' : '<meta name="robots" content="noindex">\n'}<link rel="canonical" href="${url}">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/brand/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="preload" href="/fonts/newsreader-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts.css">
<link rel="stylesheet" href="/tokens.css">
<link rel="stylesheet" href="/site.css">
<meta name="theme-color" content="#2020E8">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/brand/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${SITE}/brand/og-image.png">
<link rel="author" href="${COMPANY}">
<script>${THEME_INIT}</script>
<script>
// Links made before the platform had a home page (/?join=, /?remote=, /?view=) and
// sign-in returns that land here go to the app, with everything after the address kept.
(function(){var l=location;if(/[?&](join|remote|view|play)=/.test(l.search)||/access_token=|error_description=/.test(l.hash)){l.replace('/app/'+l.search+l.hash)}})();
</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
<a class="brand" href="/">${LOGO}<span>${NAME}</span></a>
<nav class="main" aria-label="Main"><a href="/#tutorial">Tutorial</a><a href="/#pricing">Pricing</a><a href="/#features">Features</a><a href="/#live">Live audience</a><a href="/learn/">Guides</a><a href="/#faq">FAQ</a></nav>
<span class="grow"></span>
<a class="link-quiet" href="/app/account">Sign in</a><a class="btn sm" href="/app/">Start building</a>
<details class="menu"><summary aria-label="Menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></summary>
<div class="menu__panel"><a href="/#tutorial">Tutorial</a><a href="/#pricing">Pricing</a><a href="/#features">Features</a><a href="/#live">Live audience</a><a href="/learn/">Guides</a><a href="/#faq">FAQ</a><a href="/app/account">Sign in</a></div></details>
</div></header>
<div class="flash" id="flash" role="status" hidden>Your account and online decks were deleted. Decks on this device were kept.</div>
<main id="main">
${body}
</main>
<footer class="site"><div class="wrap">
<div class="foot-brand"><a class="brand" href="/">${LOGO_DARK_BG}<span>${NAME}</span></a>
<p>Interactive presentations your audience can answer. A product of <a href="${COMPANY}">Densight Labs</a>, an applied AI firm.</p></div>
<div><h3 class="foot-h">Product</h3><a href="/#tutorial">Tutorial</a><a href="/#pricing">Pricing</a><a href="/#features">Features</a><a href="/#live">Live audience</a><a href="/#how">How it works</a><a href="/app/">Open the app</a></div>
<div><h3 class="foot-h">Learn</h3><a href="/learn/">Guides</a><a href="/#faq">FAQ</a></div>
<div><h3 class="foot-h">Company</h3><a href="${COMPANY}">Densight Labs</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="${mailto()}">Support: ${SUPPORT}</a></div>
</div><div class="wrap foot-end"><span>&copy; ${new Date().getFullYear()} <a href="${COMPANY}">Densight Labs</a>. All rights reserved.</span><a href="${mailto()}">${SUPPORT}</a></div></footer>
<script>
if(/[?&]account-deleted=1/.test(location.search))document.getElementById('flash').hidden=false;
(function(){var els=document.querySelectorAll('.reveal');if(!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){els.forEach(function(e){e.classList.add('in')});return}
var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});els.forEach(function(e){io.observe(e)})})();
document.querySelectorAll('.menu__panel a').forEach(function(a){a.addEventListener('click',function(){document.querySelector('.menu').open=false})});
</script>
</body>
</html>
`;
}

const CHECK = '<svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

const pollBars = (rows) => rows.map(([label, w]) => `<div class="bar" style="--w:${w}%"><span>${label}</span><b>${w}%</b></div>`).join('');

// Small drawings of the kinds of blocks a deck can hold. Colours come from CSS classes,
// so they follow light and dark.
const FIGS = [
  ['Quiz', 'Instant feedback on every answer', `<svg viewBox="0 0 240 150" role="img" aria-label="A quiz question with three options, one marked correct"><rect class="ik" x="16" y="14" width="150" height="9" rx="2"/><rect class="tx" x="16" y="30" width="96" height="6" rx="2"/><rect class="ln" x="16" y="52" width="208" height="26" rx="6"/><rect class="bs" x="16" y="52" width="208" height="26" rx="6"/><rect class="bl" x="26" y="61" width="8" height="8" rx="2"/><path class="ck" d="M190 65l5 5 11-12"/><rect class="ln" x="16" y="86" width="208" height="26" rx="6"/><rect class="ln" x="16" y="120" width="208" height="26" rx="6"/></svg>`],
  ['Chart', 'From pasted data, with a table for screen readers', `<svg viewBox="0 0 240 150" role="img" aria-label="A bar chart"><path class="ln" d="M24 16v118h200"/><rect class="bs" x="40" y="86" width="26" height="48"/><rect class="bl" x="80" y="52" width="26" height="82"/><rect class="bs" x="120" y="72" width="26" height="62"/><rect class="bl" x="160" y="30" width="26" height="104"/><rect class="bs" x="198" y="96" width="20" height="38"/></svg>`],
  ['Timeline', 'Step through stages one at a time', `<svg viewBox="0 0 240 150" role="img" aria-label="A timeline with four stages"><path class="ln" d="M24 72h192"/><circle class="bl" cx="40" cy="72" r="9"/><circle class="bl" cx="100" cy="72" r="9"/><circle class="dotb" cx="160" cy="72" r="9"/><circle class="dotb" cx="212" cy="72" r="9"/><rect class="ik" x="26" y="94" width="30" height="6" rx="2"/><rect class="tx" x="86" y="94" width="30" height="6" rx="2"/><rect class="tx" x="146" y="94" width="30" height="6" rx="2"/><rect class="tx" x="198" y="94" width="30" height="6" rx="2"/><rect class="ik" x="26" y="40" width="64" height="8" rx="2"/></svg>`],
  ['Diagram', 'Rows, columns or a cycle with arrows', `<svg viewBox="0 0 240 150" role="img" aria-label="A cycle diagram with four steps"><ellipse class="ln" cx="120" cy="75" rx="74" ry="46" fill="none"/><rect class="bl" x="92" y="14" width="56" height="22" rx="5"/><rect class="bs" x="160" y="64" width="56" height="22" rx="5"/><rect class="bs" x="92" y="114" width="56" height="22" rx="5"/><rect class="bs" x="24" y="64" width="56" height="22" rx="5"/></svg>`],
  ['Matching', 'Pair ideas by drawing them together', `<svg viewBox="0 0 240 150" role="img" aria-label="Two columns of items joined by lines"><rect class="ln" x="16" y="20" width="76" height="24" rx="5"/><rect class="ln" x="16" y="63" width="76" height="24" rx="5"/><rect class="ln" x="16" y="106" width="76" height="24" rx="5"/><rect class="ln" x="148" y="20" width="76" height="24" rx="5"/><rect class="ln" x="148" y="63" width="76" height="24" rx="5"/><rect class="ln" x="148" y="106" width="76" height="24" rx="5"/><path class="cn" d="M92 32L148 118M92 75L148 32M92 118L148 75"/></svg>`],
  ['Hotspots', 'Numbered notes on a picture', `<svg viewBox="0 0 240 150" role="img" aria-label="A picture with three numbered markers"><rect class="bs" x="16" y="12" width="208" height="126" rx="6"/><path class="ln" d="M16 112l56-44 40 30 36-26 76 50" fill="none"/><circle class="bl" cx="70" cy="58" r="11"/><circle class="bl" cx="140" cy="86" r="11"/><circle class="bl" cx="190" cy="44" r="11"/><text class="nm" x="70" y="62" text-anchor="middle">1</text><text class="nm" x="140" y="90" text-anchor="middle">2</text><text class="nm" x="190" y="48" text-anchor="middle">3</text></svg>`],
  ['Word cloud', 'The most common answers grow biggest', `<svg viewBox="0 0 240 150" role="img" aria-label="A cloud of words in different sizes"><text class="bl" x="120" y="64" text-anchor="middle" font-size="30" font-weight="700">clarity</text><text class="ik" x="58" y="98" text-anchor="middle" font-size="18" font-weight="700">speed</text><text class="bl" x="170" y="100" text-anchor="middle" font-size="22" font-weight="700">trust</text><text class="ik" x="64" y="38" text-anchor="middle" font-size="13" font-weight="700">fun</text><text class="ik" x="190" y="40" text-anchor="middle" font-size="12" font-weight="700">simple</text><text class="ik" x="120" y="128" text-anchor="middle" font-size="14" font-weight="700">teamwork</text></svg>`],
  ['Audience Q&A', 'Questions rise with upvotes', `<svg viewBox="0 0 240 150" role="img" aria-label="Three audience questions with vote counts"><rect class="bl" x="16" y="16" width="34" height="26" rx="6"/><text class="nm" x="33" y="34" text-anchor="middle">12</text><rect class="tx" x="60" y="22" width="150" height="9" rx="2"/><rect class="bl" x="16" y="62" width="34" height="26" rx="6"/><text class="nm" x="33" y="80" text-anchor="middle">7</text><rect class="tx" x="60" y="68" width="120" height="9" rx="2"/><rect class="bs" x="16" y="108" width="34" height="26" rx="6"/><text class="ik" x="33" y="126" text-anchor="middle" font-size="12" font-weight="700">3</text><rect class="tx" x="60" y="114" width="90" height="9" rx="2"/></svg>`],
  ['Ranking', 'The room puts items in order', `<svg viewBox="0 0 240 150" role="img" aria-label="Four items in ranked order with bars"><rect class="bl" x="16" y="16" width="200" height="22" rx="4"/><rect class="bl" x="16" y="48" width="150" height="22" rx="4"/><rect class="bs" x="16" y="80" width="104" height="22" rx="4"/><rect class="bs" x="16" y="112" width="60" height="22" rx="4"/></svg>`],
];

const home = () => layout({
  path: '/',
  title: `${NAME}: interactive presentations your audience can answer`,
  description: 'Build slides with quizzes, polls and live questions. Present from your browser, let the audience join from their phones, and control the slides from yours. Free to start.',
  body: `
<section class="hero"><div class="wrap hero__grid">
<div class="hero__copy">
<p class="label">Interactive presentations</p>
<h1>Presentations your audience can <em>answer.</em></h1>
<p class="lead">Add live polls, quizzes and questions to the presentations you already give. Run them from your browser while the room responds from their phones, then share or export the deck.</p>
<p class="cta"><a class="btn lg" href="/app/">Start building</a><a class="textlink" href="#tutorial">Try the tutorial <span aria-hidden="true">&darr;</span></a></p>
<p class="assure">Free to start. Nothing to install. No account needed to try it.</p>
</div>
<div class="visual" role="img" aria-label="A live poll on a presenter's slide, with the same poll open on a phone and the bars filling as people answer">
<div class="visual__slide"><p class="vs-tag">Live poll</p>
<p class="vs-q">Which block would you use first?</p>
<div class="bars">${pollBars([['Quiz question', 46], ['Chart', 28], ['Diagram', 18], ['Calculator', 8]])}</div>
<p class="vs-foot">38 responses &middot; Join with 5F5BLZ</p></div>
<div class="visual__phone"><p class="phone__brand">Densight Slides</p>
<p class="phone__q">Which block would you use first?</p>
<div class="opt"><i>A</i>Quiz question</div><div class="opt on"><i>B</i>Chart</div><div class="opt"><i>C</i>Diagram</div>
<p class="phone__sent">${CHECK}Answer sent</p></div>
</div>
</div>
<div class="wrap"><dl class="facts">
<div><dt>${BLOCK_COUNT}</dt><dd>interactive and design blocks</dd></div>
<div><dt>0</dt><dd>apps for your audience to install</dd></div>
<div><dt>5</dt><dd>ways to export a deck</dd></div>
<div><dt>12</dt><dd>slide templates to start from</dd></div>
</dl></div>
</section>

<section id="tutorial" class="alt"><div class="wrap">
<header class="head reveal"><p class="label">Interactive tutorial</p><h2>Run your first live poll in four steps.</h2>
<p class="sub">Nothing here is a recording. Type, click and tap, and it behaves like the real thing.</p></header>
<div class="tut reveal" id="tut">
<ol class="tut__nav" aria-label="Tutorial steps">
<li><button type="button" data-go="1"><span class="n">1</span><span><b>Write the question</b><small>Edit the slide</small></span></button></li>
<li><button type="button" data-go="2"><span class="n">2</span><span><b>Start the session</b><small>Get a join code</small></span></button></li>
<li><button type="button" data-go="3"><span class="n">3</span><span><b>Answer from a phone</b><small>Tap an option</small></span></button></li>
<li><button type="button" data-go="4"><span class="n">4</span><span><b>Watch the room</b><small>See results build</small></span></button></li>
</ol>
<div class="tut__main">
<p class="tut__task" id="tut-task" role="status" aria-live="polite"></p>
<div class="tut__actions"><button type="button" class="btn ghost" id="tut-back">Back</button><button type="button" class="btn" id="tut-act">Next</button><a class="btn" id="tut-open" href="/app/" hidden>Build your own poll</a><button type="button" class="btn ghost" id="tut-replay" hidden>Replay</button></div>
<p class="sr" id="tut-announce" role="status" aria-live="polite"></p>
<div class="tut__stage">
<div class="tut__screen"><div class="tut__bar"><span>Presenter screen</span><span id="tut-code" data-live="false">Not started</span></div>
<h3 id="tut-q" class="tut__q"></h3><ul id="tut-bars" class="tbars"></ul><p id="tut-count" class="tut__count"></p></div>
<div class="tut__phone"><p class="phone__brand">Audience phone</p>
<form class="tjoin" id="tut-join" onsubmit="return false"><label for="tut-code-in">Join code</label><div class="tjoin__row"><input id="tut-code-in" type="text" inputmode="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="6 characters"><button type="submit" class="btn sm">Join</button></div><p class="tjoin__msg" id="tut-join-msg"></p><button type="button" class="tjoin__fill" id="tut-fill" hidden>Use the code on screen</button></form>
<div id="tut-joined" hidden><p id="tut-phone-q" class="phone__q"></p><div id="tut-opts" class="topts"></div><p id="tut-phone-state" class="tut__pstate"></p></div></div>
</div>
<form class="tut__form" id="tut-form" onsubmit="return false">
<label>Question<input id="tut-question" type="text" maxlength="120" autocomplete="off"></label>
<fieldset><legend>Answers (two to four)</legend>
<input data-opt type="text" maxlength="60" autocomplete="off" aria-label="Answer 1"><input data-opt type="text" maxlength="60" autocomplete="off" aria-label="Answer 2"><input data-opt type="text" maxlength="60" autocomplete="off" aria-label="Answer 3"><input data-opt type="text" maxlength="60" autocomplete="off" placeholder="Optional fourth answer" aria-label="Answer 4">
</fieldset></form>
</div></div>
<noscript><p class="note">The tutorial needs JavaScript. The <a href="/learn/">guides</a> cover the same steps in text.</p></noscript>
</div></section>

<section id="compare"><div class="wrap">
<header class="head reveal"><p class="label">How we compare</p><h2>Pick the right tool, not just ours.</h2>
<p class="sub">Four well-known audience tools next to Densight Slides. Where we are missing something, it says so. Read from each vendor's public pages in ${CHECKED}; plans change, so confirm anything that decides a purchase.</p></header>
<div class="reveal">
${renderTable()}
<ul class="cmp__key" aria-label="Key"><li><span class="cmp__mark cmp__yes"></span>Included</li><li><span class="cmp__mark cmp__paid"></span>Paid plan only</li><li><span class="cmp__mark cmp__part"></span>Partly</li><li><span class="cmp__mark cmp__no"></span>Not offered, as far as we could find</li><li><span class="cmp__mark cmp__soon"></span>Not yet (ours)</li><li><span class="cmp__mark cmp__check"></span>Could not confirm</li></ul>
<p class="cmp__note">Where we win: slides, questions and results in one place, working offline, with answers that stay in your browser. Where others lead today: add-ins for PowerPoint and Google Slides, team workspaces and timed leaderboards. <a href="/app/">Try it free</a> and judge for yourself.</p>
</div>
</div></section>

<section id="pricing" class="alt"><div class="wrap">
<header class="head reveal"><p class="label">Pricing</p><h2>Start free. Pay when you outgrow it.</h2>
<p class="sub">Building and presenting are free. Paid plans add bigger rooms, more question types, your own branding and more ways to export. Every paid plan starts with a ${TRIAL_DAYS}-day free trial; a card is needed to start it and you can cancel before it ends to pay nothing.</p></header>
<div class="reveal"><div class="bp__grid">
${planCards()}
</div>
<p class="bp__fine">Prices are in US dollars. Checkout shows your local price and any tax. Questions about plans? <a href="${mailto('Plans and pricing')}">${SUPPORT}</a>.</p></div>
</div></section>

<section id="features"><div class="wrap">
<header class="head reveal"><p class="label">Features</p><h2>Everything a live presentation needs.</h2>
<p class="sub">Built for rooms where people are expected to take part, not just watch.</p></header>
<div class="rules">
<article class="item reveal"><span class="no">01</span><h3>Interactive blocks</h3><p>Quizzes, polls, word clouds, open answers, ratings, rankings, audience Q&A, matching, flip cards, hotspots, timelines, charts, calculators and a live code lab, all inside your slides.</p></article>
<article class="item reveal"><span class="no">02</span><h3>Live audience</h3><p>Show a code or QR. People answer on their phones and watch the results build on your screen. Nothing for them to install.</p></article>
<article class="item reveal"><span class="no">03</span><h3>Phone remote</h3><p>Move the slides from your phone and read your speaker notes and the next slide while you talk.</p></article>
<article class="item reveal"><span class="no">04</span><h3>Drag, drop, done</h3><p>Place anything anywhere, with guides that snap things into line. Start from a template, then change the theme, colours, logo and backgrounds. Text stays readable on any colour you pick.</p></article>
<article class="item reveal"><span class="no">05</span><h3>Present or export anywhere</h3><p>Present in the browser, even offline. Export to a standalone web page, PDF, images or PowerPoint.</p></article>
<article class="item reveal"><span class="no">06</span><h3>Save and share</h3><p>Decks save on your device automatically. Sign in to keep them online, open them anywhere, and share a link anyone can view.</p></article>
</div></div></section>

<section id="live" class="dark"><div class="wrap split">
<div class="reveal"><p class="label on-dark">Live audience</p><h2>Your audience joins in seconds.</h2>
<p class="sub">No sign-up, no app, no names. They scan, they answer, you see it happen.</p>
<ul class="checks">
<li>${CHECK}<span><b>Scan or type a code.</b> A QR code and a six-character code, shown on your screen.</span></li>
<li>${CHECK}<span><b>Answers appear live.</b> Bars grow on your slide as votes arrive.</span></li>
<li>${CHECK}<span><b>You stay in control.</b> Votes count for the slide you are showing, and the answer key never leaves your page.</span></li>
<li>${CHECK}<span><b>Survives a refresh.</b> Reload your page mid-session and the same code carries on.</span></li>
</ul>
<p><a class="btn lg light" href="/app/">Try a live session</a></p></div>
<figure class="reveal flow">
<svg viewBox="0 0 600 330" role="img" aria-label="How a live session connects: your browser holds the slides and the totals; a message relay passes questions to audience phones and their answers back; your own phone can act as a remote">
<defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" class="fl-ah"/></marker></defs>
<rect class="fl-box" x="8" y="108" width="170" height="104" rx="10"/><text class="fl-t1" x="93" y="146" text-anchor="middle">Your browser</text><text class="fl-t2" x="93" y="170" text-anchor="middle">Slides and totals</text><text class="fl-t2" x="93" y="190" text-anchor="middle">Answer key stays here</text>
<rect class="fl-box" x="214" y="130" width="140" height="60" rx="10"/><text class="fl-t1" x="284" y="156" text-anchor="middle">Message relay</text><text class="fl-t2" x="284" y="177" text-anchor="middle">Nothing is stored</text>
<rect class="fl-box" x="396" y="22" width="196" height="92" rx="10"/><text class="fl-t1" x="494" y="58" text-anchor="middle">Audience phones</text><text class="fl-t2" x="494" y="82" text-anchor="middle">Questions in, answers out</text>
<rect class="fl-box" x="396" y="206" width="196" height="92" rx="10"/><text class="fl-t1" x="494" y="242" text-anchor="middle">Your phone</text><text class="fl-t2" x="494" y="266" text-anchor="middle">Remote and notes</text>
<path class="fl-ln" d="M178 160H214" marker-end="url(#ah)" marker-start="url(#ah)"/><path class="fl-ln" d="M354 148L396 92" marker-end="url(#ah)" marker-start="url(#ah)"/><path class="fl-ln" d="M354 172L396 228" marker-end="url(#ah)" marker-start="url(#ah)"/>
</svg>
<figcaption>Everything the audience sends is checked before it is counted.</figcaption></figure>
</div></section>

<section id="demo"><div class="wrap">
<header class="head reveal"><p class="label">The real player</p><h2>See it in action.</h2><p class="sub">This is the actual presentation player. Answer the quiz, open a tab, flip a card.</p></header>
<div class="demo reveal"><div class="win__bar"><i></i><i></i><i></i><span>Interactive demo</span></div>
<div class="frame" id="frame"><button type="button" id="load"><span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>Play the interactive demo</span></button></div></div>
</div></section>

<section id="blocks" class="alt"><div class="wrap">
<header class="head reveal"><p class="label">Blocks</p><h2>${BLOCK_COUNT} kinds of block. One deck.</h2>
<p class="sub">Nine of them are shown here; flip cards, calculators, a live code lab and the rest are in the app. Mix them freely. Each one works while you present, and each has a clear text version for screen readers.</p></header>
<div class="figs">
${FIGS.map(([t, d, svg]) => `<figure class="fig reveal">${svg}<figcaption><b>${t}</b><span>${d}</span></figcaption></figure>`).join('\n')}
</div></div></section>

<section id="how"><div class="wrap">
<header class="head reveal"><p class="label">How it works</p><h2>From idea to live in minutes.</h2></header>
<ol class="steps">
<li class="reveal"><span class="num">1</span><h3>Build</h3><p>Start from a template or a blank slide. Drag in text, images and interactive blocks and place them where you want. It saves as you go.</p></li>
<li class="reveal"><span class="num">2</span><h3>Present</h3><p>Press Present. Use the keyboard, a clicker or your phone. A laser pointer, drawing and a timer are built in.</p></li>
<li class="reveal"><span class="num">3</span><h3>Engage</h3><p>Start a live session, show the code and watch answers arrive. Download or share the deck afterwards.</p></li>
</ol></div></section>

<section id="trust" class="alt"><div class="wrap">
<header class="head reveal"><p class="label">Security and privacy</p><h2>Built with confidential material in mind.</h2>
<p class="sub">Presentations often carry sensitive content. These are the choices we made, stated plainly.</p></header>
<div class="rules four">
<article class="item reveal"><h3>On your device first</h3><p>Decks are stored in your browser. Nothing is uploaded unless you sign in or choose to share.</p></article>
<article class="item reveal"><h3>No tracking</h3><p>No advertising, no tracking cookies and no sale of data. See the <a href="/privacy/">privacy policy</a>.</p></article>
<article class="item reveal"><h3>Answers stay with you</h3><p>Audience responses are held in the presenter's browser and are not stored on our servers.</p></article>
<article class="item reveal"><h3>You stay in control</h3><p>Export any deck, revoke a share link instantly, and delete your account and online data at any time.</p></article>
</div></div></section>

<section><div class="wrap">
<header class="head reveal"><p class="label">Use cases</p><h2>For people who lead the room.</h2></header>
<div class="rules four">
<article class="item reveal"><h3>Executive briefings</h3><p>Take the temperature of the room before you decide, and branch to the topics that matter to this audience.</p></article>
<article class="item reveal"><h3>Training and workshops</h3><p>Check understanding with short quizzes and see at a glance what the room knows.</p></article>
<article class="item reveal"><h3>Client presentations</h3><p>Keep your notes on your phone, move the slides from anywhere in the room, and leave behind a shareable deck.</p></article>
<article class="item reveal"><h3>Town halls and events</h3><p>Let a whole room respond from their seats while you stay in control of the screen.</p></article>
</div></div></section>

<section id="faq" class="alt"><div class="wrap faq">
<div class="reveal"><p class="label">FAQ</p><h2>Questions, answered.</h2><p class="sub">Anything else? Read the <a href="/learn/">guides</a>.</p></div>
<div class="reveal">
<details><summary>Is it free?</summary><p>You can build, present and export without paying or signing in. Saving online and sharing links need a free account.</p></details>
<details><summary>Does my audience need an account or an app?</summary><p>No. They open a link or scan a QR code in their phone's browser and enter nothing else.</p></details>
<details><summary>Where are my decks stored?</summary><p>On your device first. If you sign in they are also saved to your online account so you can open them on other devices. See the <a href="/privacy/">privacy policy</a>.</p></details>
<details><summary>Does it work offline?</summary><p>After your first visit, yes: you can edit and present without a connection. Live audience features and online saving need one.</p></details>
<details><summary>Can I place things anywhere on a slide?</summary><p>Yes. Drag, resize and rotate anything, group blocks, and let guides snap them into line. Templates and one-click arrangements give you a tidy start.</p></details>
<details><summary>Can I get my slides out?</summary><p>Yes: a standalone web page, PDF, PNG images, PowerPoint, or the deck file itself. Your content is yours.</p></details>
<details><summary>How do I get help?</summary><p>Write to <a href="${mailto()}">${SUPPORT}</a> and a person at Densight Labs will reply. The <a href="/learn/">guides</a> cover the common questions.</p></details>
<details><summary>Which browsers work?</summary><p>Current Chrome, Edge, Firefox and Safari, on computers, tablets and phones. Audience pages work on phones from about 2022 onward.</p></details>
</div></div></section>

<section class="built"><div class="wrap"><div class="built__in reveal">
<img class="logo logo--on-light" src="/brand/logo-64.png" width="40" height="40" alt=""><img class="logo logo--on-dark" src="/brand/logo-light-64.png" width="40" height="40" alt="">
<p><strong>Built by <a href="${COMPANY}">Densight Labs</a>.</strong> We are an applied AI firm that deploys AI inside enterprise teams. Densight Slides is the tool we wanted for running workshops and briefings. <a href="${COMPANY}">Visit densightlabs.com</a></p>
</div></div></section>

<section class="cta-band"><div class="wrap reveal">
<h2>Make your next presentation a conversation.</h2>
<p>Open the app and have your first deck ready in minutes. Questions first? Write to <a class="plain" href="${mailto()}">${SUPPORT}</a>.</p>
<a class="btn lg light" href="/app/">Start building</a>
</div></section>
<script type="module" src="/tutorial.js"></script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'Organization', '@id': COMPANY + '/#org', name: 'Densight Labs', url: COMPANY, logo: SITE + '/brand/icon-512.png', email: SUPPORT },
  { '@type': 'SoftwareApplication', name: NAME, url: SITE + '/', applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@id': COMPANY + '/#org' }, image: SITE + '/brand/og-image.png' },
] })}</script>
<script>
(function(){var b=document.getElementById('load');if(!b)return;b.addEventListener('click',function(){var f=document.createElement('iframe');f.src='/app/?play&deck=interactive';f.title='Interactive demo deck';f.loading='lazy';f.allow='fullscreen';document.getElementById('frame').replaceChildren(f);f.focus()})})();
</script>`,
});

const guides = [
  ['Make your first deck', '<ol><li>Open <a href="/app/">My decks</a> and choose <strong>Blank deck</strong>.</li><li>Click the title text on the slide and type. Click it again to edit in place.</li><li>Press <strong>Insert</strong> above the slide (or type <kbd>/</kbd>) to add text, images, quizzes and more, then drag them where you want. Double-click empty space to type there.</li><li>Your deck saves on your device as you work. Rename it with the title box at the top.</li></ol>'],
  ['Add a quiz or poll', '<p>Press <strong>Insert</strong> or type <kbd>/</kbd>, then choose <em>Quiz question</em> or <em>Live poll</em>. Type the question, edit the choices, and tick which choice is correct for a quiz. Add a <em>Score summary</em> block on a later slide to total every quiz.</p>'],
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
<p style="margin-top:32px"><a class="btn" href="/app/">Open the app</a> &nbsp; Need a hand? <a href="${mailto()}">${SUPPORT}</a></p></div>`,
});

const privacy = () => layout({
  path: '/privacy/',
  title: `Privacy policy | ${NAME}`,
  description: `What ${NAME} stores, where, and how to delete it.`,
  body: `<div class="doc"><h1>Privacy policy</h1><p class="meta">Last updated ${UPDATED}. ${NAME} is a product of <a href="${COMPANY}">Densight Labs</a>.</p>
<h2>The short version</h2><p>We keep your decks and your email address, only if you create an account. We do not use advertising or tracking cookies, and we do not sell data.</p>
<h2>On your device</h2><p>Decks and images you create are stored in your browser (IndexedDB and localStorage) on your device. They are not sent anywhere unless you sign in. Clearing your browser data removes them. We use this storage to make the app work, not to follow you.</p>
<h2>If you create an account</h2><p>We store your email address, the decks you save online (including images inside them), and for decks you choose to share, an unguessable link token. Sign-in and storage are provided by Supabase. You can delete your account and all online decks at any time from Account &gt; Delete my account.</p>
<h2>Shared decks</h2><p>Anyone with a share link can view that deck without an account. Turn sharing off and the link stops working immediately. Do not put information in a shared deck that you do not want others to see.</p>
<h2>Live sessions</h2><p>Audience answers travel through a realtime messaging service (Supabase Realtime) between the presenter's page and the audience's phones. Answers are held in the presenter's browser while the session runs and are not saved on our servers. The audience does not need an account and is not asked for a name.</p>
<h2>Hosting and logs</h2><p>The site is hosted on Netlify, which may keep standard server logs (such as IP address and time of request) for security and operation.</p>
<h2>Your choices</h2><ul><li>Delete a deck, or all decks on this device, from My decks and Account.</li><li>Delete your account and all online data from Account.</li><li>Export any deck as a file at any time.</li></ul>
<h2>Children</h2><p>The service is not directed at children under 13, and accounts are for people old enough to agree to the terms in their country. Teachers should not require pupils to create accounts; audience members never need one.</p>
<h2>Changes and contact</h2><p>If this policy changes we will update the date above. Questions or requests about your data: write to <a href="${mailto('Densight Slides privacy')}">${SUPPORT}</a>. ${NAME} is a product of <a href="${COMPANY}">Densight Labs</a>.</p></div>`,
});

const terms = () => layout({
  path: '/terms/',
  title: `Terms of use | ${NAME}`,
  description: `The rules for using ${NAME}.`,
  body: `<div class="doc"><h1>Terms of use</h1><p class="meta">Last updated ${UPDATED}.</p>
<p>By using ${NAME} you agree to these terms. If you do not agree, please do not use the service.</p>
<h2>Your content</h2><p>You own the decks you make. You give us permission to store and display them as needed to run the service for you, including showing a shared deck to anyone who has its link.</p>
<h2>What you may not do</h2><ul><li>Upload or share anything illegal, hateful, harassing, deceptive, or that infringes someone else's rights.</li><li>Use the service to send spam, malware, or phishing content, or to collect people's personal data without consent.</li><li>Try to break, overload, scrape, or gain unauthorised access to the service or other people's data.</li><li>Create accounts or sessions in bulk, or use live sessions to flood others.</li></ul>
<h2>Reporting and removal</h2><p>We may remove content or suspend sharing or accounts that break these rules, with or without notice. If you see a shared deck that breaks them, tell us at <a href="${mailto('Report a shared deck')}">${SUPPORT}</a>.</p>
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
