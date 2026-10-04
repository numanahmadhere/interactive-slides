// Builds the public pages (home, learn, privacy, terms, 404) as plain static HTML.
// No framework and almost no JavaScript, so the first visit is fast and search
// engines and link previews see real content.

import { renderTable, CHECKED } from './compare.mjs';
import { listBlocks, getBlock } from '../src/core/blocks/index.js';
import { PLANS, PLAN_ORDER, PRICES, TRIAL_DAYS } from '../src/billing/plans.js';
import { highlights } from '../src/billing/features.js';
import { TEMPLATES } from '../src/library/templates.js';

const planCards = () => PLAN_ORDER.map((id) => {
  const plan = PLANS[id];
  const price = PRICES[id];
  return `<article class="bp__card${id === 'pro' ? ' is-highlight' : ''}">
${id === 'pro' ? '<span class="bp__tag">Recommended</span>' : ''}<h3 class="bp__name">${plan.name}</h3><p class="bp__blurb">${plan.blurb}</p>
<p class="bp__price"><b>${price ? `$${price.month}` : '$0'}</b><span>${price ? ' a month' : ' forever'}</span></p>
<p class="bp__save">${price ? `or $${price.year.toLocaleString('en-US')} a year, two months free` : ''}</p>
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
const UPDATED = '5 October 2026';
const REFUND_DAYS = 7;

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
<nav class="main" aria-label="Main"><a href="/#features">Features</a>
<details class="dd"><summary>Solutions</summary><div class="dd__panel"><a href="/training/"><b>Training and meetings</b><small>Workshops, town halls, briefings</small></a><a href="/education/"><b>Education</b><small>Lectures, lessons, assessments</small></a></div></details>
<a href="/templates/">Templates</a><a href="/pricing/">Pricing</a><a href="/learn/">Guides</a></nav>
<span class="grow"></span>
<a class="link-quiet" href="/app/account">Sign in</a><a class="btn sm" href="/app/">Start building</a>
<details class="menu"><summary aria-label="Menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></summary>
<div class="menu__panel"><a href="/#features">Features</a><a href="/training/">Training and meetings</a><a href="/education/">Education</a><a href="/templates/">Templates</a><a href="/pricing/">Pricing</a><a href="/security/">Security</a><a href="/learn/">Guides</a><a href="/app/account">Sign in</a></div></details>
</div></header>
<div class="flash" id="flash" role="status" hidden>Your account and online decks were deleted. Decks on this device were kept.</div>
<main id="main">
${body}
</main>
<footer class="site"><div class="wrap">
<div class="foot-brand"><a class="brand" href="/">${LOGO_DARK_BG}<span>${NAME}</span></a>
<p>Interactive presentations your audience can answer. A product of <a href="${COMPANY}">Densight Labs</a>, an applied AI firm.</p></div>
<div><h3 class="foot-h">Product</h3><a href="/#features">Features</a><a href="/templates/">Templates</a><a href="/pricing/">Pricing</a><a href="/#live">Live audience</a><a href="/app/">Open the app</a></div>
<div><h3 class="foot-h">Solutions</h3><a href="/training/">Training and meetings</a><a href="/education/">Education</a></div>
<div><h3 class="foot-h">Resources</h3><a href="/learn/">Guides</a><a href="/#faq">FAQ</a><a href="/security/">Security</a></div>
<div><h3 class="foot-h">Company</h3><a href="${COMPANY}">Densight Labs</a><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/refund/">Refunds</a><a href="${mailto()}">Support: ${SUPPORT}</a></div>
</div><div class="wrap foot-end"><span>&copy; ${new Date().getFullYear()} <a href="${COMPANY}">Densight Labs</a>. All rights reserved.</span><a href="${mailto()}">${SUPPORT}</a></div></footer>
<a class="stickycta" id="stickycta" href="/app/" hidden>Start building free</a>
<script>
(function(){var b=document.getElementById('stickycta');if(!b||!document.getElementById('tutorial'))return;function f(){b.hidden=scrollY<700}f();addEventListener('scroll',f,{passive:true})})();
document.addEventListener('click',function(e){document.querySelectorAll('details.dd[open]').forEach(function(d){if(!d.contains(e.target))d.open=false})});
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
<section id="tutorial" class="hero tuthero"><div class="wrap">
<header class="tuthero__head">
<h1>Presentations your audience can <em>answer.</em></h1>
<p class="lead">Add live polls, quizzes and questions to the presentations you already give. Pick a question type below and use it: answer on the phone and watch your own answer appear on the big screen.</p>
<p class="cta tuthero__cta"><a class="btn lg" href="/app/">Start building free</a><span class="assure">No account or card needed to try it.</span></p>
</header>
<div class="show reveal" id="show">
<ul class="show__cards" aria-label="Question types">
<li class="show__card"><button type="button" class="show__pick" data-type="cloud" aria-pressed="false"><svg class="show__ico" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17a4 4 0 01-.6-7.96A5.5 5.5 0 0117 8.5a3.8 3.8 0 01.5 7.5H7z"/><path d="M9.5 13.5l1.3-3 1.3 3M10 12.6h1.6M14 11v3M14 12.2c.8-.9 1.9-.4 1.9.6"/></svg><span><b>Word Cloud</b><small>Visualize what people think, in real time</small></span></button><a class="show__create" href="/app/">Create</a></li>
<li class="show__card"><button type="button" class="show__pick" data-type="quiz" aria-pressed="false"><svg class="show__ico" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="11" height="16" rx="1.5"/><path d="M8 8h5M8 11.5h5M8 15h3"/><path d="M15 15l5-6 1.5 1.2-5 6L14 17z"/></svg><span><b>Quiz</b><small>Test participants with questions that have set correct answers</small></span></button><a class="show__create" href="/app/">Create</a></li>
<li class="show__card"><button type="button" class="show__pick" data-type="poll" aria-pressed="false"><svg class="show__ico" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V12h4v8M10 20V5h4v15M16 20V9h4v11"/><path d="M3 20h18"/></svg><span><b>Poll</b><small>Let your participants vote on set options</small></span></button><a class="show__create" href="/app/">Create</a></li>
<li class="show__card"><button type="button" class="show__pick" data-type="open" aria-pressed="false"><svg class="show__ico" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 014 13.5z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" stroke-width="2.4"/></svg><span><b>Open Ended</b><small>Collect and display responses in their own words</small></span></button><a class="show__create" href="/app/">Create</a></li>
</ul>
<div class="show__stage">
<span class="show__tag show__tag--screen" aria-hidden="true">Your screen<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v15M6 13l6 6 6-6"/></svg></span>
<span class="show__tag show__tag--phone" aria-hidden="true">Participant&rsquo;s screen<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 5c0 6 3 9 9 10M10 11l4 4-4 4"/></svg></span>
<div class="show__screen"><p class="show__join"><i class="show__live" aria-hidden="true"></i>Join with the code <b>5F5BLZ</b></p><div id="show-slide" class="show__slide"></div></div>
<div class="show__phone"><div class="show__phonebrand">Densight Slides</div><div id="show-phone" class="show__phonebody"></div></div>
</div>
<p class="sr" id="show-announce" role="status" aria-live="polite"></p>
</div>
<noscript><p class="note">The demo needs JavaScript. The <a href="/learn/">guides</a> cover the same steps in text.</p></noscript>
</div></section>

<section id="clients" class="clients"><div class="wrap">
<p class="clients__label reveal">Trusted by</p>
<ul class="clients__row reveal" aria-label="Client logos">
<li><img src="/clients/uchicago.svg" alt="University of Chicago" width="250" height="63" loading="lazy" style="height:34px"></li>
<li><img src="/clients/utaustin.svg" alt="The University of Texas at Austin" width="350" height="100" loading="lazy" style="height:44px"></li>
<li><img src="/clients/agakhan.webp" alt="Aga Khan University Hospital" width="262" height="150" loading="lazy" style="height:54px"></li>
<li><img src="/clients/loreal.webp" alt="L&rsquo;Or&eacute;al Pakistan" width="400" height="188" loading="lazy" style="height:34px"></li>
<li><img src="/clients/alyousif.webp" alt="Al Yousif Group" width="300" height="129" loading="lazy" style="height:40px"></li>
<li><img src="/clients/pseb.webp" alt="Pakistan Software Export Board" width="300" height="143" loading="lazy" style="height:40px"></li>
<li><img src="/clients/vision2030.webp" alt="Vision 2030" width="200" height="150" loading="lazy" style="height:58px"></li>
</ul>
</div></section>

<section id="loop"><div class="wrap">
<header class="head reveal"><p class="label">Why it works</p><h2>Good questions, great <em>insights.</em></h2>
<p class="sub">Start with a question. See the answers arrive. Act on what the room just told you.</p></header>
<ol class="steps">
<li class="reveal"><span class="num">1</span><h3>Ask</h3><p>Put a poll, quiz, word cloud or open question on any slide, between the slides you already have.</p></li>
<li class="reveal"><span class="num">2</span><h3>See</h3><p>People answer from their phones and the results build on your screen as they arrive. No app, no sign-up.</p></li>
<li class="reveal"><span class="num">3</span><h3>Act</h3><p>Change direction on the spot, answer the top questions, then save a report or share the deck afterwards.</p></li>
</ol></div></section>

<section id="products" class="alt"><div class="wrap">
<header class="head reveal"><p class="label">One account</p><h2>Three ways to <em>engage.</em></h2>
<p class="sub">The same slides work in the room, on their own, and across a team.</p></header>
<div class="rules">
<article class="item prod reveal"><h3>Present live</h3><p>Polls, quizzes, word clouds, open answers and audience Q&amp;A, in the room or online. Works on any phone, with no app and no login for the audience.</p><a class="prod__go" href="/learn/#live-session">Discover live sessions <span aria-hidden="true">&rarr;</span></a></article>
<article class="item prod reveal"><h3>Run a course</h3><p>Share a deck as a self-paced course. Learners go through it in their own time, you see who finished, and they can print a certificate. Starter plan and above.</p><a class="prod__go" href="/learn/#course">Discover courses <span aria-hidden="true">&rarr;</span></a></article>
<article class="item prod reveal"><h3>Work as a team</h3><p>Share decks with colleagues, comment on slides, and keep one logo and colour set for everyone. People join with a link. Pro plan and above.</p><a class="prod__go" href="/learn/#team">Discover teams <span aria-hidden="true">&rarr;</span></a></article>
</div></div></section>

<section id="compare"><div class="wrap">
<header class="head reveal"><p class="label">How we compare</p><h2>Pick the right tool, not just ours.</h2>
<p class="sub">Four well-known audience tools next to Densight Slides. Where we are missing something, it says so, and where a feature needs a paid plan, it says that too. Read from each vendor's public pages in ${CHECKED}; plans change, so confirm anything that decides a purchase.</p></header>
<div class="reveal">
${renderTable()}
<ul class="cmp__key" aria-label="Key"><li><span class="cmp__mark cmp__yes"></span>Included</li><li><span class="cmp__mark cmp__paid"></span>Paid plan only</li><li><span class="cmp__mark cmp__part"></span>Partly</li><li><span class="cmp__mark cmp__no"></span>Not offered, as far as we could find</li><li><span class="cmp__mark cmp__soon"></span>Not yet (ours)</li><li><span class="cmp__mark cmp__check"></span>Could not confirm</li></ul>
<p class="cmp__note">Where we win: slides, questions and results in one place, working offline, with answers that stay in your browser. Where others lead today: add-ins for PowerPoint and Google Slides, single sign-on and editing the same deck together in real time. Those are not built yet, and we would rather say so. <a href="/app/">Try it free</a> and judge for yourself.</p>
</div>
</div></section>

<section id="pricing" class="alt"><div class="wrap">
<header class="head reveal"><p class="label">Pricing</p><h2>Start free. Pay when you outgrow it.</h2>
<p class="sub">Building and presenting are free. Paid plans add bigger rooms, more question types, your own branding and more ways to export. Every paid plan starts with a ${TRIAL_DAYS}-day free trial; a card is needed to start it and you can cancel before it ends to pay nothing.</p></header>
<div class="reveal"><div class="bp__grid">
${planCards()}
</div>
<p class="bp__fine">Prices are in US dollars. Checkout shows your local price and any tax. Questions about plans? <a href="${mailto('Plans and pricing')}">${SUPPORT}</a>. <a href="/pricing/">Monthly or yearly, and common questions</a>.</p></div>
</div></section>

<section id="features"><div class="wrap">
<header class="head reveal"><p class="label">Features</p><h2>Everything a live presentation needs.</h2>
<p class="sub">Built for rooms where people are expected to take part, not just watch.</p></header>
<div class="rules">
<article class="item reveal"><span class="no">01</span><h3>Interactive blocks</h3><p>Timed quizzes, polls, word clouds, open answers, ratings, rankings, audience Q&A, pins on a picture, reactions and hand raise, tables, 2x2 matrices, matching, flip cards, hotspots, timelines, charts, calculators and a live code lab, all inside your slides.</p></article>
<article class="item reveal"><span class="no">02</span><h3>Live audience</h3><p>Show a code or QR. People answer on their phones and watch the results build on your screen. Nothing for them to install.</p></article>
<article class="item reveal"><span class="no">03</span><h3>Phone remote</h3><p>Move the slides from your phone and read your speaker notes and the next slide while you talk.</p></article>
<article class="item reveal"><span class="no">04</span><h3>Drag, drop, done</h3><p>Place anything anywhere, with guides that snap things into line. Start from one of the ready-made slides, then change the theme, colours, logo and backgrounds. Text stays readable on any colour you pick.</p></article>
<article class="item reveal"><span class="no">05</span><h3>Present or export anywhere</h3><p>Present in the browser, even offline. Export to a standalone web page, PDF, images or PowerPoint. Already have slides? Import a PowerPoint or Google Slides file (text, pictures and notes come across).</p></article>
<article class="item reveal"><span class="no">06</span><h3>Save and share</h3><p>Decks save on your device automatically. Sign in to keep them online, open them anywhere, and share a link anyone can view.</p></article>
<article class="item reveal"><span class="no">07</span><h3>Moderation and privacy</h3><p>A swear filter is on by default, or hold every answer until you approve it. Start a private session and nothing is kept: no names, no report, and answers vanish when you end it.</p></article>
<article class="item reveal"><span class="no">08</span><h3>Games, reports and courses</h3><p>Timed quizzes with names, teams and a leaderboard. Save a session report on your device. Share a deck as a self-paced course that lists who finished and prints a certificate.</p></article>
<article class="item reveal"><span class="no">09</span><h3>Teams</h3><p>On Pro and Advanced, share decks with your team, comment on slides, and keep one logo and colour set for everyone. People join with a link.</p></article>
</div></div></section>

<section id="live" class="dark"><div class="wrap split">
<div class="reveal"><p class="label on-dark">Live audience</p><h2>Your audience joins in seconds.</h2>
<p class="sub">No sign-up and no app. Names only if you ask for them. They scan, they answer, you see it happen.</p>
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

<section id="trust" class="alt"><div class="wrap">
<header class="head reveal"><p class="label">Security and privacy</p><h2>Built with confidential material in mind.</h2>
<p class="sub">Presentations often carry sensitive content. These are the choices we made, stated plainly.</p></header>
<div class="rules four">
<article class="item reveal"><h3>On your device first</h3><p>Decks are stored in your browser. Nothing is uploaded unless you sign in or choose to share.</p></article>
<article class="item reveal"><h3>No tracking</h3><p>No advertising, no tracking cookies and no sale of data. See the <a href="/privacy/">privacy policy</a>.</p></article>
<article class="item reveal"><h3>Answers stay with you</h3><p>Audience responses are held in the presenter's browser and are not stored on our servers.</p></article>
<article class="item reveal"><h3>You stay in control</h3><p>Export any deck, revoke a share link instantly, and delete your account and online data at any time.</p></article>
</div><p class="reveal" style="margin-top:8px"><a href="/security/">Read the full security and privacy summary</a></p></div></section>

<section id="usecases"><div class="wrap">
<header class="head reveal"><p class="label">Use cases</p><h2>More <em>engagement,</em> every day.</h2>
<p class="sub">Easily add participation to more of the moments where you talk and others listen.</p></header>
<div class="uc">
<div class="uc__col reveal"><h3>At work</h3>
<ul>
<li><b>Anonymous feedback.</b> Ask how a talk or briefing landed, and get honest answers.</li>
<li><b>Training that sticks.</b> A short quiz after each section shows what was understood.</li>
<li><b>Brainstorming.</b> Word clouds and open answers turn a quiet room into a loud one.</li>
<li><b>Alignment and decisions.</b> Rank priorities together and place ideas on a 2x2.</li>
<li><b>Town halls.</b> Let people send questions, upvote the best, and hold them for approval.</li>
<li><b>Client sessions.</b> Present with your own logo, from your phone, and leave a shareable deck.</li>
</ul><a class="btn ghost" href="/training/">See training and meeting uses</a></div>
<div class="uc__col reveal"><h3>In education</h3>
<ul>
<li><b>Lecture feedback.</b> Quick reactions and polls show where the room is lost.</li>
<li><b>Check understanding.</b> Anonymous quizzes with no accounts for students.</li>
<li><b>Assessments and games.</b> Timed questions, points for speed, teams and a leaderboard.</li>
<li><b>Seminar starters.</b> One open question and the room has something to discuss.</li>
<li><b>Hands-on lessons.</b> Matching, ordering, fill-in-the-blank, flip cards and hotspots.</li>
<li><b>Independent study.</b> Share a self-paced course with a completion list and certificate.</li>
</ul><a class="btn ghost" href="/education/">See classroom uses</a></div>
</div></div></section>

<section id="start" class="alt"><div class="wrap">
<header class="head reveal"><p class="label">Getting started</p><h2>Easy to start. Simple to <em>connect.</em></h2>
<p class="sub">Choose a ready-made slide, start from a blank one, or bring the slides you already have.</p></header>
<div class="rules">
<article class="item prod reveal"><h3>Pick a ready-made slide</h3><p>${TEMPLATES.length} slides for icebreakers, quizzes, feedback, tables and matrices. Every part can be edited or removed.</p><a class="prod__go" href="/templates/">Browse the slides <span aria-hidden="true">&rarr;</span></a></article>
<article class="item prod reveal"><h3>Start from a blank slide</h3><p>Drag text, pictures and interactive blocks anywhere, with guides that snap them into line. It saves as you go.</p><a class="prod__go" href="/app/">Open the editor <span aria-hidden="true">&rarr;</span></a></article>
<article class="item prod reveal"><h3>Bring your PowerPoint</h3><p>Import a .pptx file, or a Google Slides deck downloaded as PowerPoint. Text, pictures and notes come across.</p><a class="prod__go" href="/learn/#import">How importing works <span aria-hidden="true">&rarr;</span></a></article>
</div>
<div class="easy reveal"><h3>New tools? No trouble.</h3>
<ul><li><b>Nothing for the audience to install.</b> A link or a QR code is enough.</li><li><b>Take your slides with you.</b> Export to a web page, PDF, images or PowerPoint.</li><li><b>Works offline.</b> Build and present without a connection.</li><li><b>A person answers.</b> Write to <a href="${mailto()}">${SUPPORT}</a>.</li></ul></div>
</div></section>

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

const welcome = () => layout({
  path: '/welcome/',
  title: `Thank you: ${NAME}`,
  description: 'Your payment went through.',
  index: false,
  body: `<div class="doc"><h1>Thank you</h1><p class="meta">Your payment went through and your plan is being switched on.</p>
<p>It usually takes a few seconds. We are taking you to your account now; if nothing happens, <a href="/app/account?welcome=1">open your account</a>.</p>
<p>A receipt is on its way to your email from Paddle, who handle payments for us. Questions? Write to <a href="${mailto('My payment')}">${SUPPORT}</a>.</p></div>
<script>setTimeout(function(){location.replace('/app/account?welcome=1')},2500)</script>`,
});

const guides = [ // [title, body, anchor]
  ['Make your first deck', '<ol><li>Open <a href="/app/">My decks</a> and choose <strong>Blank deck</strong>.</li><li>Click the title text on the slide and type. Click it again to edit in place.</li><li>Press <strong>Insert</strong> above the slide (or type <kbd>/</kbd>) to add text, images, quizzes and more, then drag them where you want. Double-click empty space to type there.</li><li>Your deck saves on your device as you work. Rename it with the title box at the top.</li></ol>'],
  ['Add a quiz or poll', '<p>Press <strong>Insert</strong> or type <kbd>/</kbd>, then choose <em>Quiz question</em> or <em>Live poll</em>. Type the question, edit the choices, and tick which choice is correct for a quiz. Add a <em>Score summary</em> block on a later slide to total every quiz.</p>'],
  ['Present your deck', '<p>Press <strong>Present</strong> or <kbd>Ctrl</kbd>/<kbd>Cmd</kbd> + <kbd>Enter</kbd>. Move with the arrow keys or space. <kbd>O</kbd> opens an overview, <kbd>L</kbd> is a laser pointer, <kbd>D</kbd> draws, <kbd>F</kbd> is full screen and <kbd>?</kbd> lists every shortcut. Choose <em>With presenter view</em> for notes and a timer on a second screen.</p>'],
  ['Run a live session with phones', '<ol><li>Open a slide that has a poll or quiz, then choose <strong>Present &gt; Go live &gt; Start session</strong>.</li><li>Show the code or QR to the room. Phones open the link and see the question when you reach that slide.</li><li>Votes appear on your slide as they arrive. Scan the second QR code with your own phone to use it as a remote with your notes.</li></ol><p>If you reload your page mid-session, the same code resumes and phones send their answers again.</p>', 'live-session'],
  ['Run a self-paced course', '<p>Save the deck online (<strong>File &gt; Cloud</strong>), press <em>Share</em>, then turn on <em>Self-paced course</em>. Anyone with the link goes through the slides in their own time; the page remembers which they have seen. When they have seen every slide they can type their name to be recorded as finished and print a certificate. You see the list under the same dialog and can download it as a spreadsheet. Starter plan and above. &ldquo;Finished&rdquo; means every slide was viewed; quizzes are not graded.</p>', 'course'],
  ['Work as a team', '<p>On the Pro and Advanced plans, open <strong>Account &gt; Team</strong> and create a team, then <em>Invite someone</em> to get a link that works once and expires in seven days. People join by opening it while signed in; they do not need a plan of their own. In the editor, <strong>File &gt; Cloud</strong> lets you put a deck in the team, apply or save the team&rsquo;s logo and colours, and <strong>File &gt; Comments</strong> opens comments on the slide you are looking at. Pro includes 5 people, Advanced 25.</p>', 'team'],
  ['Import a PowerPoint or Google Slides deck', '<p>On <a href="/app/">My decks</a> choose <strong>Import a deck</strong> and pick a .pptx file. For Google Slides use <em>File &gt; Download &gt; Microsoft PowerPoint (.pptx)</em> first. Titles, text, bullet lists, pictures, speaker notes and positions come across. Tables become plain text. Charts, SmartArt, video, animations and master styling do not, and the app tells you what it left out. You get a new deck; your original is untouched.</p>', 'import'],
  ['Keep answers moderated and private', '<p>Word clouds, open answers and Q&amp;A hide swearing by default; choose <em>Approve first</em> in the block&rsquo;s panel to hold every answer until you let it through. In the live dialog, <em>Private session</em> keeps nothing: no names or teams, no report and no spreadsheet, and answers disappear when you end the session.</p>', 'moderation'],
  ['Save online and share', '<p>Choose <strong>Sign in</strong>, enter your email, and open the link we send. From then on your decks also save online. In the editor open <strong>File &gt; Cloud</strong> and press <em>Share</em> to get a link anyone can view. <em>Stop sharing</em> ends it immediately.</p>'],
  ['Export', '<p>Open <strong>File &gt; Export</strong> for a standalone web page (every interaction works), a PDF, PNG images, PowerPoint, or the deck file to reopen later.</p>'],
];

const learn = () => layout({
  path: '/learn/',
  title: `Learn ${NAME}`,
  description: 'Short guides: make a deck, add quizzes and polls, present, run a live session with phones, save and share, export.',
  body: `<div class="doc"><h1>Learn ${NAME}</h1><p class="meta">Short guides. The app also has an optional guided tour that you can skip.</p>
${guides.map(([t, b, id]) => `<div class="guide"${id ? ` id="${id}"` : ''}><h2>${esc(t)}</h2>${b}</div>`).join('\n')}
<p style="margin-top:32px"><a class="btn" href="/app/">Open the app</a> &nbsp; Need a hand? <a href="${mailto()}">${SUPPORT}</a></p></div>`,
});

const privacy = () => layout({
  path: '/privacy/',
  title: `Privacy policy | ${NAME}`,
  description: `What ${NAME} stores, where, who else handles it, and how to delete it.`,
  body: `<div class="doc"><h1>Privacy policy</h1><p class="meta">Last updated ${UPDATED}. ${NAME} is a product of <a href="${COMPANY}">Densight Labs</a> (&ldquo;we&rdquo;). This page explains what we keep about you and why. A shorter version is on the <a href="/security/">security page</a>.</p>
<h2>The short version</h2><p>You can use the editor and present without an account, and then nothing leaves your device. If you create an account we keep your email address and the decks you save online. If you pay, our payment provider handles your payment details; we never see your card. We do not use advertising or tracking cookies and we do not sell your data.</p>
<h2>What we collect, and why</h2>
<ul><li><strong>On your device only:</strong> decks, images and settings you create, kept in your browser storage so the app works and remembers your work. We do not receive them.</li>
<li><strong>Account:</strong> your email address, used to sign you in and to write to you about your account. Sign-in and storage are provided by Supabase.</li>
<li><strong>Online decks:</strong> the decks you choose to save online, including images inside them and the unguessable token of any share link.</li>
<li><strong>Teams and comments:</strong> if you create or join a team, we keep the team&rsquo;s name, who belongs to it (by email), its shared logo and colours, the decks shared into it, and comments people write on slides.</li>
<li><strong>Self-paced courses:</strong> when someone finishes a course on a shared link and types their name, we store that name and the time against the deck so its owner can see who finished. Which slides a visitor has viewed is kept on their own device.</li>
<li><strong>Billing:</strong> your plan, its status and dates, and an identifier from our payment provider. Card and billing details are collected and held by that provider, not by us.</li>
<li><strong>Live sessions:</strong> audience answers travel through a realtime messaging service between the presenter&rsquo;s page and the phones. They are held in the presenter&rsquo;s browser while the session runs and are not saved on our servers. Names and teams are collected only if the presenter turns them on. Session reports are saved on the presenter&rsquo;s own device only if the presenter chooses.</li>
<li><strong>Messages to us:</strong> if you email us, we keep the conversation so we can help you.</li></ul>
<h2>Who else handles data</h2>
<ul><li><strong>Supabase</strong> provides sign-in, the database for online decks, teams, comments and course completions, and the realtime messaging for live sessions.</li>
<li><strong>Netlify</strong> hosts the site and may keep standard server logs, such as IP address and time of request, for security and operation.</li>
<li><strong>Paddle</strong> is our payment provider and merchant of record. It processes payments, handles tax and sends receipts under its own privacy policy.</li></ul>
<p>We do not sell personal data and we do not share it for advertising.</p>
<h2>Cookies and storage</h2><p>We do not use advertising or analytics cookies. The app stores your decks and preferences, such as light or dark mode, in your browser storage, and keeps you signed in with a session in the same storage. Clearing your browser data removes them. The checkout is shown by Paddle and may set its own cookies.</p>
<h2>How long we keep it</h2><p>Decks and account data stay until you delete them or your account. Deleting your account removes your sign-in and, with it, your online decks, share links, team memberships, your comments and the course completions on your decks. Records we must keep for tax or accounting, such as payment records, are kept by our payment provider for as long as the law requires.</p>
<h2>Your choices and rights</h2><ul><li>Delete a deck, or all decks on this device, from My decks and Account.</li><li>Delete your account and all online data from Account &gt; Delete my account.</li><li>Export any deck as a file at any time.</li><li>Ask us for a copy of the personal data we hold about you, to correct it, or to delete it, by writing to <a href="${mailto('My data')}">${SUPPORT}</a>. Depending on where you live you may have further rights, and you may complain to your local data protection authority.</li></ul>
<h2>Shared decks</h2><p>Anyone with a share link can view that deck without an account. Turn sharing off and the link stops working immediately. Do not put information in a shared deck that you do not want others to see.</p>
<h2>Children</h2><p>The service is not directed at children under 13, and accounts are for people old enough to agree to the terms where they live. Teachers should not require pupils to create accounts; audience members never need one.</p>
<h2>Changes and contact</h2><p>If this policy changes we will update the date above. Questions or requests about your data: write to <a href="${mailto('Densight Slides privacy')}">${SUPPORT}</a>. ${NAME} is a product of <a href="${COMPANY}">Densight Labs</a>. See also the <a href="/terms/">terms of use</a> and <a href="/refund/">refund policy</a>.</p></div>`,
});

const terms = () => layout({
  path: '/terms/',
  title: `Terms of use | ${NAME}`,
  description: `The rules for using ${NAME}, including plans, billing, trials and cancellation.`,
  body: `<div class="doc"><h1>Terms of use</h1><p class="meta">Last updated ${UPDATED}. ${NAME} is a product of <a href="${COMPANY}">Densight Labs</a> (&ldquo;we&rdquo;).</p>
<p>By using ${NAME} you agree to these terms. If you do not agree, please do not use the service. If you use it for an organisation, you confirm you can accept these terms for it.</p>
<h2>The service</h2><p>${NAME} lets you build interactive presentations, present them, and run live sessions where an audience answers on their phones. You can use the editor and present without an account. An account is needed to save decks online, share them, and use paid plans.</p>
<h2>Your account</h2><p>Keep your sign-in secure and tell us if you think someone else has used it. You are responsible for what happens under your account.</p>
<h2>Your content</h2><p>You own the decks you make. You give us permission to store and display them as needed to run the service for you, including showing a shared deck to anyone who has its link and showing a team deck to the team&rsquo;s members. You promise you have the right to use what you upload.</p>
<h2>Plans, trials and billing</h2><ul><li>There is a free plan and there are paid plans (Starter, Pro and Advanced). What each includes is shown on the <a href="/pricing/">pricing page</a>. We may change plans and prices; a change to the price of a plan you already pay for takes effect at your next renewal, after we tell you.</li>
<li>Each paid plan starts with a free trial, as stated at checkout. A payment method is needed to start a trial. If you cancel before the trial ends you are not charged; if you do not, the plan starts and you are charged.</li>
<li>Paid plans renew automatically each month or year until you cancel. You can cancel any time from Account &gt; Manage billing. You keep the plan until the end of the period you have paid for.</li>
<li>Payments are handled by our payment provider, Paddle, who is the seller of record. Prices are shown in US dollars and checkout shows your local price and any tax.</li>
<li>Refunds are covered by our <a href="/refund/">refund policy</a>.</li>
<li>If a plan ends or you move to a lower plan, nothing is deleted. You can still open, edit, present and export your decks. The limits of the lower plan apply to what you add next, such as new decks online, paid question types in live rooms, and the size of live rooms.</li></ul>
<h2>Teams</h2><p>The person who creates a team owns it and can invite and remove people, change its shared brand, and close it. Anyone in a team can edit and comment on the decks shared into it; only a deck&rsquo;s maker can delete it, publish a share link for it, or take it out of the team. Closing a team does not delete the decks, which stay with the people who made them.</p>
<h2>What you may not do</h2><ul><li>Upload or share anything illegal, hateful, harassing, deceptive, or that infringes someone else&rsquo;s rights.</li><li>Use the service to send spam, malware, or phishing content, or to collect people&rsquo;s personal data without consent.</li><li>Try to break, overload, scrape, or gain unauthorised access to the service or other people&rsquo;s accounts, or to get around plan limits.</li><li>Use live sessions to collect answers from people who have not been told who is collecting them.</li></ul>
<h2>Reporting and removal</h2><p>We may remove content or suspend sharing or accounts that break these rules, with or without notice. If you see a shared deck that breaks them, tell us at <a href="${mailto('Report a shared deck')}">${SUPPORT}</a>.</p>
<h2>Availability and changes</h2><p>We work to keep the service running but do not promise it will always be available, error-free, or that features will not change. Keep your own copy of important decks by exporting them. We may add, change or remove features; if we remove something a paid plan clearly includes, we will tell you and you may cancel and ask for a refund of the unused part of the period.</p>
<h2>No warranty and limits of liability</h2><p>The service is provided as is. To the extent the law allows, Densight Labs is not liable for indirect or consequential losses, or for losses from content you or others create or share, and our total liability to you is limited to the amount you paid us in the twelve months before the claim. Nothing here limits rights you have by law that cannot be limited.</p>
<h2>Ending</h2><p>You can stop using the service and delete your account at any time. We may end or limit access if these terms are broken or if a payment cannot be collected.</p>
<h2>Privacy</h2><p>How we handle personal data is described in the <a href="/privacy/">privacy policy</a>.</p>
<h2>Changes and contact</h2><p>We may update these terms and will change the date above. If a change is significant we will tell signed-in users. Continuing to use the service after a change means you accept it. Questions: <a href="${mailto('Densight Slides terms')}">${SUPPORT}</a>.</p></div>`,
});

const refund = () => layout({
  path: '/refund/',
  title: `Refund policy | ${NAME}`,
  description: `Full refund within ${REFUND_DAYS} days of any payment, no questions asked. How trials, cancellation and refunds work.`,
  body: `<div class="doc"><h1>Refund policy</h1><p class="meta">Last updated ${UPDATED}.</p>
<p>We want you to pay for ${NAME} only if it is useful to you. Here is exactly how that works.</p>
<h2>${REFUND_DAYS} days, full refund</h2><p>If you are not happy with a paid plan, ask within <strong>${REFUND_DAYS} days of any payment</strong>, the first one or a renewal, and we will refund that payment in full. You do not need to give a reason.</p>
<h2>Free trial</h2><p>Every paid plan starts with a ${TRIAL_DAYS}-day free trial. If you cancel before the trial ends you are not charged at all. You can cancel from Account &gt; Manage billing.</p>
<h2>Cancelling</h2><p>You can cancel at any time. Your plan then stays active until the end of the period you have paid for and does not renew. Cancelling does not by itself refund the current period; for that, use the ${REFUND_DAYS}-day refund above.</p>
<h2>Mistakes and double charges</h2><p>If you were charged twice, charged by mistake, or charged after you cancelled, tell us and we will refund it, whenever it happened.</p>
<h2>If we remove something you paid for</h2><p>If we take away a feature that your plan clearly included, you may cancel and ask for a refund of the unused part of the period.</p>
<h2>How to ask</h2><ol><li>Write to <a href="${mailto('Refund request')}">${SUPPORT}</a> from the email address on your account, or reply to your receipt.</li><li>Tell us which payment (the date or the receipt number helps).</li><li>We confirm and refund it. Refunds are processed by our payment provider, Paddle, and go back to the payment method you used. Your bank may take several days to show it.</li></ol>
<h2>What happens to your decks</h2><p>If you get a refund and your plan ends, nothing is deleted. You can still open, edit, present and export your decks; the free plan&rsquo;s limits apply to what you add next. See the <a href="/terms/">terms of use</a>.</p>
<h2>Your legal rights</h2><p>This policy is in addition to any rights you have by law, which it does not limit. Paddle&rsquo;s own terms for buyers may also apply to your purchase.</p>
<p style="margin-top:28px"><a class="btn" href="${mailto('Refund request')}">Ask for a refund</a></p></div>`,
});

const notFound = () => layout({
  path: '/404.html',
  title: `Page not found | ${NAME}`,
  description: 'That page does not exist.',
  index: false,
  body: `<div class="doc"><h1>Page not found</h1><p>That address does not exist. <a href="/">Go to the home page</a> or <a href="/app/">open the app</a>.</p></div>`,
});

// ---- template previews: a flat sketch of each ready-made slide, drawn from its real block positions ----------

const plain = (html) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
const pct = (n, of) => `${Math.round((n / of) * 1000) / 10}%`;
const SIZES = { 1: 4.6, 2: 3.3, 3: 2.4 };

function sketch(block) {
  const f = block.frame ?? { x: 128, y: 128, w: 800 };
  const t = block.type;
  const p = block.props;
  const label = getBlock(t)?.label ?? t;
  let h = f.h;
  let cls = 'tp__b';
  let inner = '';
  let style = '';
  if (t === 'heading') {
    cls += ' tp__text';
    style = `font-size:${SIZES[p.level] ?? 3.3}cqw;font-weight:650;text-align:${p.align === 'center' ? 'center' : p.align === 'end' ? 'right' : 'left'}`;
    inner = esc(plain(p.text));
    h = h ?? (SIZES[p.level] ?? 3.3) * 19.2 * 1.6;
  } else if (t === 'text' || t === 'quote') {
    cls += ' tp__text tp__muted';
    style = `font-size:${p.size === 'lg' ? 2.6 : 2.1}cqw;text-align:${p.align === 'center' ? 'center' : 'left'}${t === 'quote' ? ';font-style:italic' : ''}`;
    inner = esc(plain(p.text));
    h = h ?? 160;
  } else if (t === 'list') {
    cls += ' tp__text';
    style = `font-size:${p.size === 'lg' ? 2.5 : 2.2}cqw`;
    inner = `<ul>${(p.items ?? []).slice(0, 5).map((i) => `<li>${esc(plain(i))}</li>`).join('')}</ul>`;
    h = h ?? 380;
  } else if (t === 'shape') {
    cls += ` tp__shape tp__shape--${p.fill ?? 'accent'}`;
    inner = esc(plain(p.text));
    h = h ?? 60;
  } else if (t === 'image') {
    cls += ' tp__img';
    inner = '<i></i>';
    h = h ?? 400;
  } else if (t === 'icon') {
    cls += ' tp__icon';
    h = h ?? 200;
  } else if (t === 'matrix') {
    cls += ' tp__panel tp__matrix';
    inner = [p.tl, p.tr, p.bl, p.br].map((x) => `<span>${esc(plain(x))}</span>`).join('');
    h = h ?? 600;
  } else if (t === 'table') {
    cls += ' tp__panel tp__table';
    inner = '<span></span>'.repeat(9);
    h = h ?? 300;
  } else {
    cls += ' tp__panel';
    const q = plain(p.question ?? p.text ?? '');
    inner = `<em>${esc(label)}</em>${q ? `<span class="tp__q">${esc(q)}</span>` : ''}<i style="width:78%"></i><i style="width:54%"></i><i style="width:32%"></i>`;
    h = h ?? 420;
  }
  return `<div class="${cls}" style="left:${pct(f.x, 1920)};top:${pct(f.y, 1080)};width:${pct(f.w, 1920)};height:${pct(h, 1080)};${style}">${inner}</div>`;
}

const thumb = (slide) => `<div class="tp" aria-hidden="true">${slide.blocks.map(sketch).join('')}</div>`;

const templatesPage = () => {
  const groups = [...new Set(TEMPLATES.map((t) => t.group))];
  return layout({
    path: '/templates/',
    title: `Ready-made slides | ${NAME}`,
    description: `${TEMPLATES.length} ready-made slides for icebreakers, quizzes, polls, feedback, tables and matrices. Pick one and edit it in your browser. Free to use.`,
    body: `<div class="doc doc--wide"><p class="label">Ready-made slides</p><h1>${TEMPLATES.length} slides to start from</h1>
<p class="meta">Icebreakers, quizzes, polls, feedback, tables and matrices. Choose one and it opens in the editor as a new deck, ready to change. No sign-up needed. The pictures below are sketches; the real slides use your theme.</p>
${groups.map((g) => `<h2 class="tpg">${esc(g)}</h2><ul class="tpl">${TEMPLATES.filter((t) => t.group === g).map((t) => `<li class="tpl__card">${thumb(t.make())}<div class="tpl__row"><b>${esc(t.name)}</b><a class="btn sm" href="/app/?template=${t.id}" aria-label="Use the ${esc(t.name)} slide">Use this slide</a></div></li>`).join('')}</ul>`).join('\n')}
<p style="margin-top:36px"><a class="btn" href="/app/">Start from a blank deck</a></p></div>`,
  });
};

// ---- segment pages (education, training) ----------------------------------------------------------------------

function segmentPage({ path, title, description, eyebrow, h1, lead, cases, trust, closing }) {
  return layout({
    path, title, description,
    body: `<section class="seg"><div class="wrap">
<p class="label">${eyebrow}</p><h1>${h1}</h1><p class="lead">${lead}</p>
<p class="cta"><a class="btn lg" href="/app/">Start building free</a><a class="textlink" href="/templates/">Browse ready-made slides <span aria-hidden="true">&rarr;</span></a></p>
</div></section>
<section><div class="wrap"><header class="head"><h2>How people use it</h2></header>
<div class="cases">${cases.map(([t, text, how]) => `<article class="case"><h3>${t}</h3><p>${text}</p><p class="case__how"><b>Use:</b> ${how}</p></article>`).join('')}</div></div></section>
<section class="alt"><div class="wrap"><header class="head"><h2>What you can count on</h2></header>
<ul class="checks seg__checks">${trust.map(([b, t]) => `<li>${CHECK}<span><b>${b}</b> ${t}</span></li>`).join('')}</ul>
<p class="seg__fine">${closing}</p></div></section>
<section class="cta-band"><div class="wrap"><h2>Try it with your next session.</h2><p>Free to start. Nothing for your audience to install.</p><a class="btn lg light" href="/app/">Start building free</a></div></section>`,
  });
}

const educationPage = () => segmentPage({
  path: '/education/',
  title: `${NAME} for education: keep every student answering`,
  description: 'Live polls, quizzes, word clouds and questions for lectures, seminars and classrooms. Students join from their phones with no account. Free to start.',
  eyebrow: 'For education',
  h1: 'Keep every student <em>answering.</em>',
  lead: 'Ask a question in the middle of a lecture and see what the whole room thinks, in seconds. Students join from any phone with a code. They do not need an account, and answers are not stored on our servers.',
  cases: [
    ['Large lectures', 'Everyone answers and nobody is put on the spot. Ask a quick question, or let students tell you when they are lost.', 'Live poll, reactions and hand raise, audience Q&amp;A with upvotes.'],
    ['Assessments', 'Timed questions with points for speed, optional names and teams, and a leaderboard. Save a report of the whole session afterwards.', 'Quiz with a time limit, leaderboard, session report (Starter plan and above).'],
    ['Seminars', 'Start a discussion with one open question and put the best answers on screen. Hold answers for your approval first if you want.', 'Open answers, word cloud, approve-first moderation (Starter plan and above).'],
    ['Student events', 'Break the ice with a one-word question, or let people drop a pin on a map or floor plan.', 'Word cloud, pin on an image, ranking.'],
    ['Classroom lessons', 'Interactive exercises sit right inside the slides: pair things up, put steps in order, fill the gap, flip a card, explore a picture.', 'Matching, ordering, fill-in-the-blank, flip cards, hotspots.'],
    ['Independent study', 'Share a deck as a self-paced course. Students work through it in their own time and print a certificate at the end; you see who finished.', 'Self-paced course (Starter plan and above). Decks also present offline.'],
  ],
  trust: [
    ['Students never need an account.', 'They open a link or scan a code on their phone.'],
    ['No tracking and no advertising.', 'We do not use tracking cookies or sell data. See the <a href="/privacy/">privacy policy</a>.'],
    ['Answers stay with you.', 'Audience responses are held in the presenter&rsquo;s browser, not saved on our servers. Choose a private session and nothing is kept at all.'],
    ['Swearing is hidden by default.', 'Or hold every answer until you approve it.'],
    ['Works for everyone.', 'Slides can be driven from the keyboard and the interactive blocks have text versions for screen readers.'],
  ],
  closing: `The free plan covers building, presenting, polls and quizzes with rooms of up to ${PLANS.free.livePhones} phones. Teaching in an institution and need something different? Write to <a href="${mailto('Education use')}">${SUPPORT}</a> and a person will reply.`,
});

const trainingPage = () => segmentPage({
  path: '/training/',
  title: `${NAME} for training, workshops and meetings`,
  description: 'Run workshops, town halls and client briefings where the room answers. Live polls, quizzes, word clouds, ranked priorities and Q&A, from your browser.',
  eyebrow: 'For training and meetings',
  h1: 'Make the room part of <em>the meeting.</em>',
  lead: 'Put questions between your slides, show the code, and watch what the room thinks. Present from your browser, move the slides from your phone, and leave behind a deck people can open.',
  cases: [
    ['Workshops and training', 'A short quiz after each section shows what landed. Re-teach only what the room missed.', 'Quiz, score summary, session report (Starter plan and above).'],
    ['Courses and onboarding', 'Share a deck as a self-paced course. New starters go through it in their own time, and you get a list of who finished plus certificates.', 'Self-paced course (Starter plan and above).'],
    ['Brainstorming', 'One question, one word each, and the cloud shows the pattern. Or collect longer answers and put the best on screen.', 'Word cloud, open answers, moderation (Starter plan and above).'],
    ['Alignment and decisions', 'Have the room rank priorities together, or place ideas on an impact and effort grid.', 'Ranking, 2x2 matrix, live poll.'],
    ['Town halls and Q&amp;A', 'People send questions, the room upvotes, you answer the top ones. Hold questions for approval first when the topic is sensitive.', 'Audience Q&amp;A, approve-first moderation (Starter plan and above).'],
    ['Client sessions and briefings', 'Present with your own logo and colours, keep your notes on your phone, and share the deck afterwards. For confidential sessions, nothing is kept.', 'Brand colours and logo, phone remote, private session, share link.'],
  ],
  trust: [
    ['Nothing for the audience to install.', 'A link or QR code is enough, on any phone.'],
    ['Confidential material stays yours.', 'Decks live in your browser first; answers are not stored on our servers; a private session keeps nothing. See <a href="/security/">security</a>.'],
    ['Bring what you have.', 'Import a PowerPoint or Google Slides deck, and export to PowerPoint, PDF, images or a web page.'],
    ['Work together.', 'On Pro and Advanced, share decks with your team, comment on slides and keep one brand kit.'],
    ['Works offline.', 'Build and present without a connection; live answers need one.'],
  ],
  closing: `Paid plans add bigger rooms (up to ${PLANS.advanced.livePhones.toLocaleString('en-US')} phones), more question types, your own branding and team workspaces, each with a ${TRIAL_DAYS}-day free trial. See <a href="/pricing/">pricing</a>.`,
});

// ---- pricing --------------------------------------------------------------------------------------------------

const money = (n) => `$${n.toLocaleString('en-US')}`;

const pricingCards = () => PLAN_ORDER.map((id) => {
  const plan = PLANS[id];
  const price = PRICES[id];
  const cta = price ? `<a class="btn${id === 'pro' ? '' : ' ghost'}" data-plan="${id}" href="/app/account?plan=${id}">Start ${TRIAL_DAYS}-day free trial</a>` : '<a class="btn ghost" href="/app/">Start building</a>';
  return `<article class="bp__card${id === 'pro' ? ' is-highlight' : ''}">${id === 'pro' ? '<span class="bp__tag">Recommended</span>' : ''}
<h3 class="bp__name">${plan.name}</h3><p class="bp__blurb">${plan.blurb}</p>
<p class="bp__price">${price ? `<b data-m="${money(price.month)}" data-y="${money(price.year)}">${money(price.month)}</b><span data-m=" a month" data-y=" a year"> a month</span>` : '<b>$0</b><span> forever</span>'}</p>
<p class="bp__save" data-note="${price ? `Two months free when billed yearly` : ''}">${price ? `or ${money(price.year)} a year, two months free` : ''}</p>
<ul class="bp__list">${highlights(id).map((t) => `<li>${t}</li>`).join('')}</ul>${cta}</article>`;
}).join('\n');

const pricingFaq = () => [
  ['Is there a free plan?', `Yes. You can build, present, run polls and quizzes, and export your deck as a file or images without paying. The free plan keeps ${PLANS.free.cloudDecks} decks online and rooms of up to ${PLANS.free.livePhones} phones.`],
  ['How does the free trial work?', `Every paid plan starts with a ${TRIAL_DAYS}-day free trial. A card is needed to start it. Cancel before the trial ends and you pay nothing.`],
  ['Can I switch plans or cancel?', 'Yes, any time, from Account &gt; Manage billing. You keep your plan until the period you paid for ends.'],
  ['What happens to my decks if I downgrade?', 'Nothing is deleted. You can still open, edit and present every deck. The new plan limits only apply to what you add next, such as new decks online or paid question types in a live room.'],
  ['Do my participants pay or sign up?', 'No. Participants join with a code or QR on their phone and never create an account.'],
  ['How many people can answer at once?', `Rooms hold up to ${PLANS.free.livePhones} phones on Free, ${PLANS.starter.livePhones} on Starter, ${PLANS.pro.livePhones} on Pro and ${PLANS.advanced.livePhones.toLocaleString('en-US')} on Advanced.`],
  ['Which plan do I need for teams?', `Team workspaces come with Pro (up to ${PLANS.pro.teamSeats} people) and Advanced (up to ${PLANS.advanced.teamSeats}). People you invite join with a link and do not need a plan.`],
  ['How do you handle payment and tax?', 'Payments are handled by Paddle. We never see or store your card details. Checkout shows the price in your currency with any tax included, and Paddle sends your receipt.'],
  ['Is there an education or non-profit price?', `Write to <a href="${mailto('Education or non-profit pricing')}">${SUPPORT}</a> and tell us how you would use it. A person will reply.`],
  ['Can I get a refund?', `Yes. Ask within ${REFUND_DAYS} days of any payment and we refund it in full, no reason needed. Double or mistaken charges are refunded whenever they happened. See the <a href="/refund/">refund policy</a>.`],
];

const pricingPage = () => layout({
  path: '/pricing/',
  title: `Pricing | ${NAME}`,
  description: `Start free. Paid plans from ${money(PRICES.starter.month)} a month add bigger rooms, more question types, branding and team workspaces, each with a ${TRIAL_DAYS}-day free trial.`,
  body: `<section class="seg"><div class="wrap"><p class="label">Pricing</p><h1>Start free. Pay when you <em>outgrow it.</em></h1>
<p class="lead">Building and presenting are free. Paid plans add bigger rooms, more question types, your own branding and team workspaces. Every paid plan starts with a ${TRIAL_DAYS}-day free trial.</p>
<div class="bp__toggle" role="group" aria-label="Billing period"><button type="button" class="bp__tab" data-interval="month" aria-pressed="true">Pay monthly</button><button type="button" class="bp__tab" data-interval="year" aria-pressed="false">Pay yearly <small>2 months free</small></button></div></div></section>
<section><div class="wrap"><h2 class="sr">Plans</h2><div class="bp__grid">${pricingCards()}</div>
<p class="bp__fine">Prices are in US dollars. Checkout shows your local price and any tax. Payments are handled by Paddle; we never see your card.</p></div></section>
<section class="alt"><div class="wrap faq"><div><p class="label">FAQ</p><h2>Pricing questions, answered.</h2><p class="sub">Something else? Write to <a href="${mailto('Plans and pricing')}">${SUPPORT}</a>.</p></div>
<div>${pricingFaq().map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div></div></section>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: pricingFaq().map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a.replace(/<[^>]*>/g, '').replace(/&gt;/g, '>') } })) })}</script>
<script>
(function(){var tabs=document.querySelectorAll('.bp__tab'),cards=document.querySelectorAll('.bp__card');function set(v){tabs.forEach(function(t){t.setAttribute('aria-pressed',String(t.dataset.interval===v))});cards.forEach(function(c){c.querySelectorAll('[data-m]').forEach(function(e){e.textContent=e.dataset[v==='year'?'y':'m']});var s=c.querySelector('.bp__save');if(s&&s.dataset.note)s.textContent=v==='year'?s.dataset.note:'or pay yearly and get two months free';var a=c.querySelector('a[data-plan]');if(a)a.href='/app/account?plan='+a.dataset.plan+'&interval='+v})}tabs.forEach(function(t){t.addEventListener('click',function(){set(t.dataset.interval)})})})();
</script>`,
});

// ---- security -------------------------------------------------------------------------------------------------

const securityPage = () => layout({
  path: '/security/',
  title: `Security and privacy | ${NAME}`,
  description: 'What Densight Slides stores, where it is kept, who handles payments, and how to delete everything. Plain statements, no certifications we do not hold.',
  body: `<div class="doc"><p class="label">Security and privacy</p><h1>What we keep, and what we do not</h1>
<p class="meta">Last updated ${UPDATED}. Written for people who have to decide whether it is safe to put their material here. The <a href="/privacy/">privacy policy</a> has the legal wording.</p>
<h2>Your decks</h2><p>Decks are stored in your browser first. Nothing is uploaded unless you sign in to save online or choose to share. Signed-in decks are kept in our database, provided by Supabase, and every account can read and change only its own decks; that rule is enforced inside the database, not just in the app. Decks can be moved into a team workspace only by their owner.</p>
<h2>Live sessions</h2><p>Audience answers pass through a realtime messaging service between your page and the phones. They are held in your browser while the session runs and are not saved on our servers. Answer keys for quizzes never leave your page. Names are only collected if you turn them on. A private session turns names, reports and downloads off entirely.</p>
<h2>Sharing</h2><p>A share link is a long random token. Anyone with it can view that deck; turning sharing off stops it at once. Self-paced courses record only the name a learner types, for decks that are being shared.</p>
<h2>Payments</h2><p>Payments are handled by Paddle. We never see or store card details. Our server confirms each payment event using a signature before changing anyone&rsquo;s plan.</p>
<h2>Tracking</h2><p>No advertising, no tracking cookies and no sale of data. The site is hosted on Netlify, which may keep standard server logs.</p>
<h2>Deleting everything</h2><p>You can delete a deck, all decks on your device, or your whole account and every online deck at any time from the Account page. You can also export any deck as a file.</p>
<h2>What we do not claim</h2><p>We do not currently hold security certifications such as SOC 2 or ISO 27001, and we do not offer single sign-on yet. If your organisation needs a security review, a data-processing agreement or another document, write to us and we will tell you plainly what we can and cannot provide.</p>
<h2>Report a problem</h2><p>If you find a security problem, write to <a href="${mailto('Security report')}">${SUPPORT}</a>. A person at <a href="${COMPANY}">Densight Labs</a> will read it.</p>
<p style="margin-top:28px"><a class="btn" href="${mailto('Security review')}">Ask a security question</a></p></div>`,
});

// path (relative to dist/) -> file contents
export function buildSite() {
  const pages = {
    'index.html': home(),
    'learn/index.html': learn(),
    'privacy/index.html': privacy(),
    'terms/index.html': terms(),
    'refund/index.html': refund(),
    'welcome/index.html': welcome(),
    'templates/index.html': templatesPage(),
    'education/index.html': educationPage(),
    'training/index.html': trainingPage(),
    'pricing/index.html': pricingPage(),
    'security/index.html': securityPage(),
    '404.html': notFound(),
    'robots.txt': `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /welcome/\n\nSitemap: ${SITE}/sitemap.xml\n`,
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/templates/', '/education/', '/training/', '/pricing/', '/security/', '/learn/', '/privacy/', '/terms/', '/refund/'].map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('\n')}\n</urlset>\n`,
  };
  return pages;
}
