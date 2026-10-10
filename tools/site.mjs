// Builds the public pages (home, learn, privacy, terms, 404) as plain static HTML.
// No framework and almost no JavaScript, so the first visit is fast and search
// engines and link previews see real content.

import { renderCompare, renderKey, CHECKED } from './compare.mjs';
import { listBlocks, getBlock } from '../src/core/blocks/index.js';
import { PLANS, PLAN_ORDER, PRICES, TRIAL_DAYS } from '../src/billing/plans.js';
import { highlights } from '../src/billing/features.js';
import { TEMPLATES } from '../src/library/templates.js';
import { buildArt, ART_ALT } from './art.mjs';
import qrcode from 'qrcode-generator';
import { productPages, PRODUCTS, productHref } from './products.mjs';
import { learnPages, GUIDES, guideHref } from './learn.mjs';

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

const money = (n) => `$${n.toLocaleString('en-US')}`;
// A QR code as one small inline SVG path, drawn in runs so it stays tiny.
function qrSvg(text) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  const n = q.getModuleCount();
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!q.isDark(r, c)) continue;
      let len = 1;
      while (c + len < n && q.isDark(r, c + len)) len++;
      d += `M${c + 2} ${r + 2}h${len}v1h-${len}z`;
      c += len - 1;
    }
  }
  return `<svg viewBox="0 0 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-hidden="true"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#0F1117"/></svg>`;
}

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
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l8 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M17.5 8.5a5 5 0 0 1 0 7"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5.5M18 14.5c1.8.7 3 2.4 3 4.5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/>',
  loop: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 0 1-13.7 5.6L4 15M4 20v-5h5"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  bars: '<path d="M5 20V11M12 20V4M19 20v-7"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-4.5M22 9v6"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8-8 9-4.8-1-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 21h7M10 17h4"/>',
  team: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 5.5a3 3 0 0 1 0 5.5M18 14.5c1.8.7 3 2.4 3 4.5"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/>',
};
// ---- use cases: one list drives the menu, the footer, the hub page and the home page ------------------------------------

const SEGMENTS = [
  { slug: 'training', name: 'Training and meetings', short: 'Workshops, town halls, briefings and onboarding where the room answers.', icon: 'briefcase', tone: 'a' },
  { slug: 'education', name: 'Education', short: 'Lectures, seminars and classrooms. Students join with a code and never need an account.', icon: 'cap', tone: 'b' },
  { slug: 'events', name: 'Events and conferences', short: 'Keynote questions, live polls, icebreakers and quizzes for big rooms.', icon: 'megaphone', tone: 'c' },
  { slug: 'people-teams', name: 'HR and people teams', short: 'Onboarding courses, all-hands questions and honest feedback.', icon: 'users', tone: 'd' },
  { slug: 'consulting', name: 'Consulting and workshops', short: 'Facilitate client sessions, rank priorities and leave a report behind.', icon: 'compass', tone: 'a' },
  { slug: 'webinars', name: 'Webinars and online sessions', short: 'Make a remote audience part of the call, from any browser.', icon: 'video', tone: 'b' },
  { slug: 'retrospectives', name: 'Team retrospectives', short: 'Anonymous retros, voting on actions, shared decks for the team.', icon: 'loop', tone: 'c' },
  { slug: 'community', name: 'Non-profits and community groups', short: 'Meetings, volunteer training and fundraising nights on a small budget.', icon: 'heart', tone: 'd' },
];
const segHref = (s) => `/${s.slug}/`;

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
<form class="joinbar" action="/app/" method="get" aria-label="Join a live session"><label for="joincode">Have a code? Join a live session</label><input id="joincode" name="join" type="text" inputmode="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="6 characters" pattern="[A-Za-z0-9]{6}" required><button type="submit">Join</button></form>
<header class="top"><div class="wrap">
<a class="brand" href="/">${LOGO}<span>${NAME}</span></a>
<nav class="main" aria-label="Main">
<details class="dd dd--wide"><summary>Product</summary><div class="dd__panel mm" role="group" aria-label="Product">
<div class="mm__cols"><div class="mm__col"><span class="mm__h">Ask your audience</span>
${[0, 1, 2].map((i) => { const x = PRODUCTS[i]; return `<a class="mm__item" href="${productHref(x)}"><span class="mm__ico mm__ico--${x.tone}">${ico(x.icon)}</span><span class="mm__txt"><b>${x.name}</b><small>${x.short}</small></span></a>`; }).join('')}
</div><div class="mm__col"><span class="mm__h">Build and share</span>
${[3, 4, 5, 6].map((i) => { const x = PRODUCTS[i]; return `<a class="mm__item" href="${productHref(x)}"><span class="mm__ico mm__ico--${x.tone}">${ico(x.icon)}</span><span class="mm__txt"><b>${x.name}</b><small>${x.short}</small></span></a>`; }).join('')}
</div></div>
<a class="mm__feat" href="/#tutorial"><span class="mm__badge">Live demo</span><b>Answer on a phone and watch it land on the big screen</b><span class="mm__mini" aria-hidden="true"><i style="--w:72%"></i><i style="--w:48%"></i><i style="--w:30%"></i></span><span class="mm__go">Try it now <span aria-hidden="true">&rarr;</span></span></a>
<a class="mm__foot" href="/product/"><span>Results, reports and everything else</span><b>See the whole product <span aria-hidden="true">&rarr;</span></b></a>
</div></details>
<details class="dd"><summary>Solutions</summary><div class="dd__panel mm mm--solutions" role="group" aria-label="Solutions">
<a class="mm__card mm__card--a" href="/training/"><span class="mm__ico mm__ico--a">${ico('briefcase')}</span><b>Training and meetings</b><small>Workshops, town halls, client briefings and onboarding where the room answers.</small><span class="mm__go">See how teams use it <span aria-hidden="true">&rarr;</span></span></a>
<a class="mm__card mm__card--b" href="/education/"><span class="mm__ico mm__ico--b">${ico('cap')}</span><b>Education</b><small>Lectures, seminars and classrooms. Students join with a code and never need an account.</small><span class="mm__go">See classroom uses <span aria-hidden="true">&rarr;</span></span></a>
<div class="mm__more"><span class="mm__h">More ways to use it</span><div class="mm__grid">${SEGMENTS.slice(2).map((x) => `<a class="mm__item" href="${segHref(x)}"><span class="mm__ico mm__ico--${x.tone}">${ico(x.icon)}</span><span class="mm__txt"><b>${x.name}</b></span></a>`).join('')}</div></div>
<a class="mm__foot" href="/use-cases/"><span>Not sure which fits?</span><b>See all use cases <span aria-hidden="true">&rarr;</span></b></a>
</div></details>
<a href="/#features">Features</a>
<a href="/templates/">Templates</a><a href="/pricing/">Pricing</a><a href="/learn/">Guides</a></nav>
<span class="grow"></span>
<a class="link-quiet" href="/app/account">Sign in</a><a class="btn sm" href="/app/">Start building</a>
<details class="menu"><summary aria-label="Menu"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></summary>
<div class="menu__panel"><a href="/#tutorial">Try it</a><a href="/product/">Product</a><a href="/use-cases/">Use cases</a><a href="/templates/">Templates</a><a href="/pricing/">Pricing</a><a href="/security/">Security</a><a href="/learn/">Guides</a><a href="/app/account">Sign in</a></div></details>
</div></header>
<div class="flash" id="flash" role="status" hidden>Your account and online decks were deleted. Decks on this device were kept.</div>
<main id="main">
${body}
</main>
<footer class="site"><div class="wrap foot-top"><div><p class="foot-lead">Make your next presentation a conversation.</p><p class="foot-sub">Free to start. Nothing for your audience to install.</p></div><a class="btn lg light" href="/app/">Start building free</a></div>
<div class="wrap foot-cols">
<div class="foot-brand"><a class="brand" href="/">${LOGO_DARK_BG}<span>${NAME}</span></a>
<p>Interactive presentations your audience can answer. A product of <a href="${COMPANY}">Densight Labs</a>, an applied AI firm.</p></div>
<div><h2 class="foot-h">Product</h2><a href="/#tutorial">Try it live</a>${PRODUCTS.map((x) => `<a href="${productHref(x)}">${x.name}</a>`).join('')}<a href="/templates/">Templates</a><a href="/pricing/">Pricing</a></div>
<div><h2 class="foot-h">Use cases</h2>${SEGMENTS.map((x) => `<a href="${segHref(x)}">${x.name}</a>`).join('')}<a href="/use-cases/">All use cases</a></div>
<div><h2 class="foot-h">Resources</h2><a href="/learn/">Guides</a><a href="/#faq">FAQ</a><a href="/security/">Security</a><a href="/#compare">How we compare</a></div>
<div><h2 class="foot-h">Company</h2><a href="${COMPANY}">Densight Labs</a><a href="${mailto()}">Contact</a><a href="${mailto('Security report')}">Report a security issue</a></div>
</div><div class="wrap foot-end"><span>&copy; ${new Date().getFullYear()} <a href="${COMPANY}">Densight Labs</a>. All rights reserved.</span><span class="foot-legal"><a href="/privacy/">Privacy</a><a href="/terms/">Terms</a><a href="/refund/">Refunds</a><a href="${mailto()}">${SUPPORT}</a></span></div></footer>
<a class="stickycta" id="stickycta" href="/app/" hidden>Start building free</a>
<script>
(function(){var b=document.getElementById('stickycta');if(!b||!document.getElementById('tutorial'))return;function f(){b.hidden=scrollY<700}f();addEventListener('scroll',f,{passive:true})})();
(function(){var dds=[].slice.call(document.querySelectorAll('details.dd'));if(!dds.length)return;var fine=matchMedia('(hover: hover)').matches;dds.forEach(function(d){var t=0;d.addEventListener('toggle',function(){if(d.open)dds.forEach(function(o){if(o!==d)o.open=false})});if(fine){d.addEventListener('mouseenter',function(){clearTimeout(t);t=setTimeout(function(){d.open=true},90)});d.addEventListener('mouseleave',function(){clearTimeout(t);t=setTimeout(function(){d.open=false},220)})}d.addEventListener('keydown',function(e){if(e.key==='Escape'&&d.open){d.open=false;d.querySelector('summary').focus()}})})})();
document.addEventListener('click',function(e){document.querySelectorAll('details.dd[open]').forEach(function(d){if(!d.contains(e.target))d.open=false})});
if(/[?&]account-deleted=1/.test(location.search))document.getElementById('flash').hidden=false;
(function(){var f=document.getElementById('joincode');if(f)f.addEventListener('input',function(){f.value=f.value.toUpperCase().replace(/[^A-Z0-9]/g,'')})})();
(function(){document.querySelectorAll('.reveal').forEach(function(e,i){var sib=e.parentElement?[].filter.call(e.parentElement.children,function(c){return c.classList.contains('reveal')}):[e];e.style.setProperty('--i',String(Math.max(0,sib.indexOf(e))))})})();
(function(){var st=document.getElementById('story');if(!st)return;var steps=[].slice.call(st.querySelectorAll('[data-step]')),panels=[].slice.call(st.querySelectorAll('[data-panel]'));function set(n){steps.forEach(function(b){if(b.dataset.step===String(n))b.setAttribute('aria-current','step');else b.removeAttribute('aria-current')});panels.forEach(function(p){p.classList.toggle('is-on',p.dataset.panel===String(n))})}set(1);steps.forEach(function(b){b.addEventListener('click',function(){var p=st.querySelector('[data-panel="'+b.dataset.step+'"]');set(b.dataset.step);if(p&&matchMedia('(max-width: 980px)').matches===false)p.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'})})});if(!('IntersectionObserver' in window))return;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting)set(e.target.dataset.panel)})},{rootMargin:'-45% 0px -45% 0px'});panels.forEach(function(p){io.observe(p)})})();
(function(){var els=document.querySelectorAll('[data-count]');if(!els.length||!('IntersectionObserver' in window)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(!e.isIntersecting)return;io.unobserve(e.target);var el=e.target,to=+el.dataset.count,t0=performance.now();(function tick(t){var k=Math.min(1,(t-t0)/1100);el.textContent=Math.round(to*(1-Math.pow(1-k,3))).toLocaleString('en-US');if(k<1)requestAnimationFrame(tick)})(t0)})},{threshold:.6});els.forEach(function(e){io.observe(e)})})();
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

// ---- small product mock-ups, drawn from the real product's words and shapes (decorative, so hidden from screen readers) ----

const MK_DOTS = '<i></i><i></i><i></i>';
const mkWin = (title, inner, cls = '') => `<div class="mk ${cls}" aria-hidden="true"><div class="mk__bar">${MK_DOTS}<span>${title}</span></div>${inner}</div>`;
const mkPhone = (q, opts, picked = -1, foot = '') => `<div class="mkp" aria-hidden="true"><b>Densight Slides</b><p>${q}</p>${opts.map((o, i) => `<span class="${i === picked ? 'on' : ''}">${o}</span>`).join('')}${foot ? `<small>${foot}</small>` : ''}</div>`;
const tpl = (id) => thumb(TEMPLATES.find((t) => t.id === id).make());

const mockEditor = () => mkWin('Team update', `<div class="mke"><div class="mke__rail">${['title', 'quiz', 'icebreaker'].map((id, i) => `<div class="${i === 2 ? 'on' : ''}">${tpl(id)}</div>`).join('')}</div><div class="mke__main">${tpl('icebreaker')}</div><div class="mke__panel"><u>Word cloud</u><i></i><i style="width:70%"></i><u>Words each person can send</u><span>1</span><span>2</span><span class="on">3</span><u>Swearing</u><i style="width:55%"></i></div></div>`);

const mockResults = () => `<div class="dev">${mkWin('Presenting', `<div class="mkr"><p class="mkr__q">Which topic should we cover first?</p>${pollBars([['Budget review', 46], ['Hiring plan', 31], ['Client feedback', 23]])}<small>38 responses &middot; Join with 5F5BLZ</small></div>`)}${mkPhone('Which topic should we cover first?', ['Budget review', 'Hiring plan', 'Client feedback'], 1, 'Answer sent')}</div>`;

const mockReport = () => mkWin('Session report', `<div class="mkx"><div class="mkx__stats"><div><b>38</b><span>people</span></div><div><b>6</b><span>questions</span></div><div><b>42</b><span>minutes</span></div></div>${['How did the session land?', 'What should we change?', 'Rank your priorities'].map((q, i) => `<div class="mkx__row"><span>${q}</span><i style="width:${[82, 61, 44][i]}%"></i></div>`).join('')}<div class="mkx__btns"><span>Download CSV</span><span>Print or save as PDF</span></div></div>`);

const mockCourse = () => mkWin('Safety basics', `<div class="mkc"><p class="mkc__t">5 of 8 slides seen</p><div class="mkc__bar"><i style="width:62%"></i></div><div class="mkc__cert"><small>Certificate of completion</small><b>Sam Rivera</b><span>completed every part of this course</span></div></div>`);

const mockTeam = () => mkWin('Comments', `<div class="mkt"><div class="mkt__c"><span class="mkt__a">AK</span><div><b>Amira</b><p>Make the chart bigger and drop the footer.</p></div></div><div class="mkt__c"><span class="mkt__a mkt__a--2">JO</span><div><b>Jo</b><p>Done. The brand colours are applied too.</p></div></div><div class="mkt__seats"><span>Team seats</span><b>3 of 5</b></div></div>`);

const home = () => layout({
  path: '/',
  title: `${NAME}: interactive presentations your audience can answer`,
  description: 'Build slides with quizzes, polls and live questions. Present from your browser, let the audience join from their phones, and control the slides from yours. Free to start.',
  body: `
<section id="tutorial" class="hero tuthero"><img class="hero__fig hero__fig--l" src="/art/hero-left.svg" alt="" width="280" height="420"><img class="hero__fig hero__fig--r" src="/art/hero-right.svg" alt="" width="280" height="420"><div class="wrap">
<header class="tuthero__head">
<h1>Presentations your audience can <em>answer.</em></h1>
<p class="lead">Add live polls, quizzes and questions to the presentations you already give. Watch one run from start to finish in under 30 seconds, then try it yourself: answer on the phone and see your answer land on the big screen.</p>
<p class="cta tuthero__cta"><a class="btn lg" href="/app/">Start building free</a><span class="assure">Free account, no card. Try the demo below first.</span></p>
</header>
<div class="show reveal" id="show" data-mode="tour">
<ul class="show__cards" aria-label="Question types">
<li class="show__card"><button type="button" class="show__pick" data-type="cloud" aria-pressed="false"><svg class="show__ico" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17a4 4 0 01-.6-7.96A5.5 5.5 0 0117 8.5a3.8 3.8 0 01.5 7.5H7z"/><path d="M9.5 13.5l1.3-3 1.3 3M10 12.6h1.6M14 11v3M14 12.2c.8-.9 1.9-.4 1.9.6"/></svg><span><b>Word Cloud</b><small>Visualize what people think, in real time</small></span></button><a class="show__create" href="/app/">Create</a></li>
<li class="show__card"><button type="button" class="show__pick" data-type="quiz" aria-pressed="false"><svg class="show__ico" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="4" width="11" height="16" rx="1.5"/><path d="M8 8h5M8 11.5h5M8 15h3"/><path d="M15 15l5-6 1.5 1.2-5 6L14 17z"/></svg><span><b>Quiz</b><small>Test participants with questions that have set correct answers</small></span></button><a class="show__create" href="/app/">Create</a></li>
<li class="show__card"><button type="button" class="show__pick" data-type="poll" aria-pressed="false"><svg class="show__ico" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V12h4v8M10 20V5h4v15M16 20V9h4v11"/><path d="M3 20h18"/></svg><span><b>Poll</b><small>Let your participants vote on set options</small></span></button><a class="show__create" href="/app/">Create</a></li>
<li class="show__card"><button type="button" class="show__pick" data-type="open" aria-pressed="false"><svg class="show__ico" viewBox="0 0 24 24" width="44" height="44" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v7a2.5 2.5 0 01-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 014 13.5z"/><path d="M8.5 10h.01M12 10h.01M15.5 10h.01" stroke-width="2.4"/></svg><span><b>Open Ended</b><small>Collect and display responses in their own words</small></span></button><a class="show__create" href="/app/">Create</a></li>
</ul>
<div class="show__stage tour">
<div class="tour__head"><p class="tour__caption" id="show-caption"></p><div class="tour__ctrl"><button type="button" class="tour__btn" id="show-replay">Replay the tour</button><button type="button" class="tour__btn tour__btn--main" id="show-try">Try it yourself</button></div></div>
<div class="tour__device">
<div class="win" id="show-window" data-mode="edit" data-step="0">
<div class="win__bar"><span class="win__dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="win__title">Team update</span><button type="button" class="win__live" id="show-golive" tabindex="-1" aria-hidden="true"><i></i><span>Go live</span></button></div>
<div class="win__tools" aria-hidden="true"><span class="win__tool is-main">+ Insert</span><span>Text</span><span>Image</span><span>Shape</span><span data-tool="quiz">Quiz</span><span data-tool="poll">Poll</span><span data-tool="cloud">Word cloud</span><span data-tool="open">Open answers</span></div>
<div class="win__body">
<div class="win__rail" aria-hidden="true"><div class="win__thumb"><i style="width:60%"></i><i style="width:38%"></i></div><div class="win__thumb is-on"><b></b><i style="width:70%"></i><i style="width:40%"></i></div><div class="win__thumb"><i style="width:52%"></i><i style="width:66%"></i></div></div>
<div class="win__canvas"><div id="show-slide" class="show__slide"></div>
<div class="win__join" id="show-join" aria-hidden="true"><span class="win__qr">${qrSvg(SITE + '/')}</span><span class="win__joinline">Join with the code</span><b class="win__code">5F5BLZ</b><span class="win__who"><span class="show__avatars"><i style="--c:#2020E8">A</i><i style="--c:#0B7A69">J</i><i style="--c:#E8643C">M</i><i style="--c:#6A3FC2">S</i></span><b id="show-people">0</b> joined</span></div>
</div></div>
<div class="win__foot" aria-hidden="true"><span class="win__nav"><i>&#9664;</i><i>&#9654;</i></span><span class="win__count">2 / 8</span><span class="win__badge"><i></i>Live</span><span class="win__clock" id="show-clock">00:00</span></div>
</div>
<div class="show__phone"><span class="show__hint" id="show-hint" aria-hidden="true">Your turn</span><span class="show__sidebtn" aria-hidden="true"></span><div class="show__pstat" aria-hidden="true"><span>9:41</span><span class="show__notch"></span><span class="show__signal"><i></i><i></i><i></i></span></div><div class="show__phonebrand">Densight Slides</div><div id="show-phone" class="show__phonebody"></div><span class="show__home" aria-hidden="true"></span></div>
<span class="ghost" id="show-ghost" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 2 4 7-3 1.5-4-7-5 4z"/></svg></span>
</div>
<ol class="tour__steps" id="show-steps" aria-label="The four steps">
<li><button type="button" data-step="0"><span class="tour__n">1</span><span><b>Write the question</b><small>Pick how people answer</small></span><i class="tour__bar"></i></button></li>
<li><button type="button" data-step="1"><span class="tour__n">2</span><span><b>Go live</b><small>A code and a QR code</small></span><i class="tour__bar"></i></button></li>
<li><button type="button" data-step="2"><span class="tour__n">3</span><span><b>Answer on a phone</b><small>No app, no account</small></span><i class="tour__bar"></i></button></li>
<li><button type="button" data-step="3"><span class="tour__n">4</span><span><b>Watch the room</b><small>Results build live</small></span><i class="tour__bar"></i></button></li>
</ol>
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

<section id="loop" class="story-sec"><div class="wrap">
<header class="head head--center reveal"><h2>Good questions, great <em>insights.</em></h2>
<p class="sub">Start with a question. See the answers arrive. Act on what the room just told you.</p></header>
<div class="story" id="story">
<div class="story__side"><ol class="story__steps" aria-label="Three steps">
<li><button type="button" data-step="1" aria-current="step"><span class="story__n">01</span><span><b>Ask</b><small>Put a poll, quiz, word cloud or open question on any slide, between the slides you already have.</small></span></button></li>
<li><button type="button" data-step="2"><span class="story__n">02</span><span><b>See</b><small>People answer from their phones and the results build on your screen as they arrive. No app, no sign-up.</small></span></button></li>
<li><button type="button" data-step="3"><span class="story__n">03</span><span><b>Act</b><small>Change direction on the spot, answer the top questions, then save a report or share the deck afterwards.</small></span></button></li>
</ol></div>
<div class="story__panels">
<div class="story__panel" data-panel="1">${mockEditor()}</div>
<div class="story__panel" data-panel="2">${mockResults()}</div>
<div class="story__panel" data-panel="3">${mockReport()}</div>
</div></div></div></section>

<section id="products"><div class="wrap">
<header class="head head--center reveal"><h2>Three ways to engage.</h2>
<p class="sub">The same slides work in the room, on their own, and across a team.</p></header>
<div class="pcards">
<article class="pcard pcard--a reveal"><div class="pcard__vis">${mockResults()}</div><h3>Present live</h3><p>Polls, quizzes, word clouds, open answers and audience Q&amp;A, in the room or online. Any phone, no app, no login for the audience.</p><a class="prod__go" href="/learn/live-session/">Discover live sessions <span aria-hidden="true">&rarr;</span></a></article>
<article class="pcard pcard--b reveal"><div class="pcard__vis">${mockCourse()}</div><h3>Run a course</h3><p>Share a deck as a self-paced course. Learners go through it in their own time, you see who finished, and they can print a certificate. Starter plan and above.</p><a class="prod__go" href="/learn/course/">Discover courses <span aria-hidden="true">&rarr;</span></a></article>
<article class="pcard pcard--c reveal"><div class="pcard__vis">${mockTeam()}</div><h3>Work as a team</h3><p>Share decks with colleagues, comment on slides, and keep one logo and colour set for everyone. People join with a link. Pro plan and above.</p><a class="prod__go" href="/learn/team/">Discover teams <span aria-hidden="true">&rarr;</span></a></article>
</div></div></section>


<section id="stats" class="band-ink"><div class="wrap">
<ul class="stats">
<li class="reveal"><b data-count="${BLOCK_COUNT}">${BLOCK_COUNT}</b><span>kinds of interactive and design block</span></li>
<li class="reveal"><b data-count="${TEMPLATES.length}">${TEMPLATES.length}</b><span>ready-made slides to start from</span></li>
<li class="reveal"><b data-count="0">0</b><span>apps for your audience to install</span></li>
<li class="reveal"><b data-count="${PLANS.advanced.livePhones}">${PLANS.advanced.livePhones.toLocaleString('en-US')}</b><span>phones in one live room, at most</span></li>
</ul></div></section>

<section id="compare"><div class="wrap">
<header class="head reveal"><h2>Why people choose <em>Densight Slides.</em></h2>
<p class="sub">The same job, five tools. We include more of what matters, work where the others cannot, and charge less to start. Where we are missing something we say so. Read from each vendor's public pages in ${CHECKED}; plans change, so confirm anything that decides a purchase.</p></header>
<div class="reveal">
${renderCompare({ fold: true })}
<p class="cmp__note">Where others lead today: add-ins for PowerPoint and Google Slides, single sign-on and editing the same deck together in real time. Those are not built yet, and we would rather say so. <a href="/app/">Try it free</a> and judge for yourself.</p>
</div>
</div></section>

<section id="pricing" class="alt"><div class="wrap">
<header class="head reveal"><h2>Start free. Pay when you outgrow it.</h2>
<p class="sub">Building and presenting are free. Paid plans add bigger rooms, more question types, your own branding and more ways to export. Every paid plan starts with a ${TRIAL_DAYS}-day free trial; a card is needed to start it and you can cancel before it ends to pay nothing.</p></header>
<div class="reveal"><div class="bp__grid">
${planCards()}
</div>
<p class="bp__fine">Prices are in US dollars. Checkout shows your local price and any tax. Questions about plans? <a href="${mailto('Plans and pricing')}">${SUPPORT}</a>. <a href="/pricing/">Monthly or yearly, and common questions</a>.</p></div>
</div></section>

<section id="features" class="band-paper"><div class="wrap">
<header class="head head--center reveal"><h2>Everything a live presentation needs.</h2>
<p class="sub">Built for rooms where people are expected to take part, not just watch.</p></header>
<div class="fcards">
<article class="fcard reveal"><span class="fcard__ico">${ico('quiz')}</span><h3>Interactive blocks</h3><p>Timed quizzes, polls, word clouds, open answers, ratings, rankings, audience Q&amp;A, pins on a picture, reactions, tables, 2x2 matrices, matching, flip cards, hotspots, timelines, charts and calculators, all inside your slides.</p></article>
<article class="fcard reveal"><span class="fcard__ico">${ico('live')}</span><h3>Live audience</h3><p>Show a code or QR. People answer on their phones and watch the results build on your screen. Nothing for them to install.</p></article>
<article class="fcard reveal"><span class="fcard__ico">${ico('remote')}</span><h3>Phone remote</h3><p>Move the slides from your phone and read your speaker notes and the next slide while you talk.</p></article>
<article class="fcard reveal"><span class="fcard__ico">${ico('design')}</span><h3>Drag, drop, done</h3><p>Place anything anywhere, with guides that snap things into line. Start from a ready-made slide, then change the theme, colours, logo and backgrounds.</p></article>
<article class="fcard reveal"><span class="fcard__ico">${ico('export')}</span><h3>Present or export anywhere</h3><p>Present in the browser, even offline. Export to a web page, PDF, images or PowerPoint, or import a PowerPoint or Google Slides file.</p></article>
<article class="fcard reveal"><span class="fcard__ico">${ico('share')}</span><h3>Save and share</h3><p>Decks save on your device automatically. Sign in to keep them online, open them anywhere, and share a link anyone can view.</p></article>
<article class="fcard reveal"><span class="fcard__ico">${ico('shield')}</span><h3>Moderation and privacy</h3><p>A swear filter is on by default, or hold every answer until you approve it. Start a private session and nothing is kept.</p></article>
<article class="fcard reveal"><span class="fcard__ico">${ico('trophy')}</span><h3>Games, reports and courses</h3><p>Timed quizzes with names, teams and a leaderboard. Save a session report. Share a deck as a self-paced course with a certificate.</p></article>
<article class="fcard reveal"><span class="fcard__ico">${ico('team')}</span><h3>Teams</h3><p>On Pro and Advanced, share decks with your team, comment on slides, and keep one logo and colour set for everyone.</p></article>
</div></div></section>



<section id="trust" class="band-paper"><div class="wrap">
<header class="head head--center reveal"><h2>Built with confidential material in mind.</h2></header>
<div class="tcards">
<article class="tcard reveal"><h3>Yours first</h3><p>Decks are stored in your browser as you work, and saved to your account so you can open them anywhere. Nothing is shared unless you choose to.</p></article>
<article class="tcard reveal"><h3>No tracking</h3><p>No advertising, no tracking cookies and no sale of data.</p></article>
<article class="tcard reveal"><h3>Answers stay with you</h3><p>Audience responses are held in the presenter&rsquo;s browser, not stored on our servers.</p></article>
<article class="tcard reveal"><h3>You stay in control</h3><p>Export any deck, revoke a share link instantly, and delete everything at any time.</p></article>
</div><p class="head--center reveal" style="margin-top:28px"><a class="btn ghost" href="/security/">Read the security summary</a></p></div></section>

<section id="usecases"><div class="wrap">
<header class="head reveal"><h2>More <em>engagement,</em> every day.</h2>
<p class="sub">Easily add participation to more of the moments where you talk and others listen.</p></header>
<div class="uc">
<div class="uc__col reveal"><img class="uc__art" src="/art/training.svg" alt="" width="800" height="560" loading="lazy"><h3>At work</h3>
<ul>
<li><b>Anonymous feedback.</b> Ask how a talk or briefing landed, and get honest answers.</li>
<li><b>Training that sticks.</b> A short quiz after each section shows what was understood.</li>
<li><b>Brainstorming.</b> Word clouds and open answers turn a quiet room into a loud one.</li>
<li><b>Alignment and decisions.</b> Rank priorities together and place ideas on a 2x2.</li>
<li><b>Town halls.</b> Let people send questions, upvote the best, and hold them for approval.</li>
<li><b>Client sessions.</b> Present with your own logo, from your phone, and leave a shareable deck.</li>
</ul><a class="btn ghost" href="/training/">See training and meeting uses</a></div>
<div class="uc__col reveal"><img class="uc__art" src="/art/education.svg" alt="" width="800" height="560" loading="lazy"><h3>In education</h3>
<ul>
<li><b>Lecture feedback.</b> Quick reactions and polls show where the room is lost.</li>
<li><b>Check understanding.</b> Anonymous quizzes with no accounts for students.</li>
<li><b>Assessments and games.</b> Timed questions, points for speed, teams and a leaderboard.</li>
<li><b>Seminar starters.</b> One open question and the room has something to discuss.</li>
<li><b>Hands-on lessons.</b> Matching, ordering, fill-in-the-blank, flip cards and hotspots.</li>
<li><b>Independent study.</b> Share a self-paced course with a completion list and certificate.</li>
</ul><a class="btn ghost" href="/education/">See classroom uses</a></div>
</div>
<div class="uc__more reveal"><h3>And wherever people need to be heard</h3><ul>${SEGMENTS.slice(2).map((x) => `<li><a href="${segHref(x)}"><span class="mm__ico mm__ico--${x.tone}">${ico(x.icon)}</span><span><b>${x.name}</b><small>${x.short}</small></span></a></li>`).join('')}</ul><p><a class="btn" href="/use-cases/">See all use cases</a></p></div>
</div></section>

<section id="start" class="alt"><div class="wrap">
<header class="head reveal"><h2>Easy to start. Simple to connect.</h2>
<p class="sub">Choose a ready-made slide, start from a blank one, or bring the slides you already have.</p></header>
<div class="rules">
<article class="item prod reveal"><h3>Pick a ready-made slide</h3><p>${TEMPLATES.length} slides for icebreakers, quizzes, feedback, tables and matrices. Every part can be edited or removed.</p><a class="prod__go" href="/templates/">Browse the slides <span aria-hidden="true">&rarr;</span></a></article>
<article class="item prod reveal"><h3>Start from a blank slide</h3><p>Drag text, pictures and interactive blocks anywhere, with guides that snap them into line. It saves as you go.</p><a class="prod__go" href="/app/">Open the editor <span aria-hidden="true">&rarr;</span></a></article>
<article class="item prod reveal"><h3>Bring your PowerPoint</h3><p>Import a .pptx file, or a Google Slides deck downloaded as PowerPoint. Text, pictures and notes come across.</p><a class="prod__go" href="/learn/import/">How importing works <span aria-hidden="true">&rarr;</span></a></article>
</div>
<div class="easy reveal"><h3>New tools? No trouble.</h3>
<ul><li><b>Nothing for the audience to install.</b> A link or a QR code is enough.</li><li><b>Take your slides with you.</b> Export to a web page, PDF, images or PowerPoint.</li><li><b>Works offline.</b> Build and present without a connection.</li><li><b>A person answers.</b> Write to <a href="${mailto()}">${SUPPORT}</a>.</li></ul></div>
</div></section>

<section id="faq" class="alt"><div class="wrap faq">
<div class="reveal"><h2>Questions, answered.</h2><p class="sub">Anything else? Read the <a href="/learn/">guides</a>.</p></div>
<div class="reveal">
<details><summary>Is it free?</summary><p>Yes. Create a free account (no card) to build, present and export. Your audience never needs an account.</p></details>
<details><summary>Does my audience need an account or an app?</summary><p>No. They open a link or scan a QR code in their phone's browser and enter nothing else.</p></details>
<details><summary>Where are my decks stored?</summary><p>On your device first. If you sign in they are also saved to your online account so you can open them on other devices. See the <a href="/privacy/">privacy policy</a>.</p></details>
<details><summary>Does it work offline?</summary><p>After your first visit, yes: you can edit and present without a connection. Live audience features and online saving need one.</p></details>
<details><summary>Can I place things anywhere on a slide?</summary><p>Yes. Drag, resize and rotate anything, group blocks, and let guides snap them into line. Templates and one-click arrangements give you a tidy start.</p></details>
<details><summary>Can I get my slides out?</summary><p>Yes: a standalone web page, PDF, PNG images, PowerPoint, or the deck file itself. Your content is yours.</p></details>
<details><summary>How do I get help?</summary><p>Write to <a href="${mailto()}">${SUPPORT}</a> and a person at Densight Labs will reply. The <a href="/learn/">guides</a> cover the common questions.</p></details>
<details><summary>Which browsers work?</summary><p>Current Chrome, Edge, Firefox and Safari, on computers, tablets and phones. Audience pages work on phones from about 2022 onward.</p></details>
</div></div></section>

<section class="cta-band"><div class="wrap cta-band__grid"><div class="reveal">
<h2>Make your next presentation a conversation.</h2>
<p>Open the app and have your first deck ready in minutes. Questions first? Write to <a class="plain" href="${mailto()}">${SUPPORT}</a>.</p>
<a class="btn lg light" href="/app/">Start building</a></div>
<img class="cta-band__art" src="/art/cta.svg" alt="A group cheering with confetti falling" width="800" height="420" loading="lazy"></div></section>
<script type="module" src="/tutorial.js"></script>
<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'Organization', '@id': COMPANY + '/#org', name: 'Densight Labs', url: COMPANY, logo: SITE + '/brand/icon-512.png', email: SUPPORT },
  { '@type': 'SoftwareApplication', name: NAME, url: SITE + '/', applicationCategory: 'BusinessApplication', operatingSystem: 'Any (web browser)', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@id': COMPANY + '/#org' }, image: SITE + '/brand/og-image.png' },
] })}</script>
<script>
(function(){var b=document.getElementById('load');if(!b)return;b.addEventListener('click',function(){var f=document.createElement('iframe');f.src='/app/?play&deck=interactive';f.title='Interactive demo deck';f.loading='lazy';f.allow='fullscreen';document.getElementById('frame').replaceChildren(f);f.focus()})})();
</script>`,
});


// Long documents (policies, security) get a header band and a table of contents, so they read like part of the site.
const slug = (t) => t.toLowerCase().replace(/<[^>]*>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function docify(html, { eyebrow }) {
  const inner = html.replace(/^<div class="doc">/, '').replace(/<\/div>\s*$/, '');
  const h1 = /<h1>([\s\S]*?)<\/h1>/.exec(inner)?.[1] ?? '';
  const meta = /<p class="meta">([\s\S]*?)<\/p>/.exec(inner)?.[1] ?? '';
  let rest = inner.replace(/<p class="label">[\s\S]*?<\/p>/, '').replace(/<h1>[\s\S]*?<\/h1>/, '').replace(/<p class="meta">[\s\S]*?<\/p>/, '');
  const heads = [];
  rest = rest.replace(/<h2>([\s\S]*?)<\/h2>/g, (m, t) => { const id = slug(t); heads.push([id, t]); return `<h2 id="${id}">${t}</h2>`; });
  return `<section class="dochero"><div class="wrap"><p class="label">${eyebrow}</p><h1>${h1}</h1><p class="meta">${meta}</p></div></section>
<div class="wrap docgrid">${heads.length > 2 ? `<nav class="doctoc" aria-label="On this page"><b>On this page</b><ol>${heads.map(([id, t]) => `<li><a href="#${id}">${t}</a></li>`).join('')}</ol></nav>` : ''}<article class="docbody">${rest}</article></div>`;
}

const welcome = () => layout({
  path: '/welcome/',
  title: `Thank you: ${NAME}`,
  description: 'Your payment went through.',
  index: false,
  body: `<section class="seg welcome"><div class="wrap seg__grid"><div>
<span class="welcome__tick" aria-hidden="true"><svg viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M14 27l8 8 16-17"/></svg></span>
<h1>Thank you. <em>You are in.</em></h1>
<p class="lead">Your payment went through and your plan is being switched on. It usually takes a few seconds, and we are taking you to your account now.</p>
<p class="cta"><a class="btn lg" href="/app/account?welcome=1">Open my account</a><a class="textlink" href="/learn/">Learn the basics <span aria-hidden="true">&rarr;</span></a></p>
<p class="seg__fine">A receipt is on its way to your email from Paddle, who handle payments for us. Questions? Write to <a href="${mailto('My payment')}">${SUPPORT}</a>.</p></div>
<img class="seg__art" src="/art/cta.svg" alt="" width="800" height="420"></div></section>
<script>setTimeout(function(){location.replace('/app/account?welcome=1')},4000)</script>`,
});

const privacy = () => layout({
  path: '/privacy/',
  title: `Privacy policy | ${NAME}`,
  description: `What ${NAME} stores, where, who else handles it, and how to delete it.`,
  body: docify(`<div class="doc"><h1>Privacy policy</h1><p class="meta">Last updated ${UPDATED}. ${NAME} is a product of <a href="${COMPANY}">Densight Labs</a> (&ldquo;we&rdquo;). This page explains what we keep about you and why. A shorter version is on the <a href="/security/">security page</a>.</p>
<h2>The short version</h2><p>You need a free account to build decks. We keep your email address and the decks you save online, and the people who answer in your live sessions never need an account. If you pay, our payment provider handles your payment details; we never see your card. We do not use advertising or tracking cookies and we do not sell your data.</p>
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
<h2>Changes and contact</h2><p>If this policy changes we will update the date above. Questions or requests about your data: write to <a href="${mailto('Densight Slides privacy')}">${SUPPORT}</a>. ${NAME} is a product of <a href="${COMPANY}">Densight Labs</a>. See also the <a href="/terms/">terms of use</a> and <a href="/refund/">refund policy</a>.</p></div>`, { eyebrow: 'Legal' }),
});

const terms = () => layout({
  path: '/terms/',
  title: `Terms of use | ${NAME}`,
  description: `The rules for using ${NAME}, including plans, billing, trials and cancellation.`,
  body: docify(`<div class="doc"><h1>Terms of use</h1><p class="meta">Last updated ${UPDATED}. ${NAME} is a product of <a href="${COMPANY}">Densight Labs</a> (&ldquo;we&rdquo;).</p>
<p>By using ${NAME} you agree to these terms. If you do not agree, please do not use the service. If you use it for an organisation, you confirm you can accept these terms for it.</p>
<h2>The service</h2><p>${NAME} lets you build interactive presentations, present them, and run live sessions where an audience answers on their phones. You need a free account to build decks, save them online, share them, and use paid plans. Audience members and people viewing a shared deck do not need one.</p>
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
<h2>Changes and contact</h2><p>We may update these terms and will change the date above. If a change is significant we will tell signed-in users. Continuing to use the service after a change means you accept it. Questions: <a href="${mailto('Densight Slides terms')}">${SUPPORT}</a>.</p></div>`, { eyebrow: 'Legal' }),
});

const refund = () => layout({
  path: '/refund/',
  title: `Refund policy | ${NAME}`,
  description: `Full refund within ${REFUND_DAYS} days of any payment, no questions asked. How trials, cancellation and refunds work.`,
  body: docify(`<div class="doc"><h1>Refund policy</h1><p class="meta">Last updated ${UPDATED}.</p>
<p>We want you to pay for ${NAME} only if it is useful to you. Here is exactly how that works.</p>
<h2>${REFUND_DAYS} days, full refund</h2><p>If you are not happy with a paid plan, ask within <strong>${REFUND_DAYS} days of any payment</strong>, the first one or a renewal, and we will refund that payment in full. You do not need to give a reason.</p>
<h2>Free trial</h2><p>Every paid plan starts with a ${TRIAL_DAYS}-day free trial. If you cancel before the trial ends you are not charged at all. You can cancel from Account &gt; Manage billing.</p>
<h2>Cancelling</h2><p>You can cancel at any time. Your plan then stays active until the end of the period you have paid for and does not renew. Cancelling does not by itself refund the current period; for that, use the ${REFUND_DAYS}-day refund above.</p>
<h2>Mistakes and double charges</h2><p>If you were charged twice, charged by mistake, or charged after you cancelled, tell us and we will refund it, whenever it happened.</p>
<h2>If we remove something you paid for</h2><p>If we take away a feature that your plan clearly included, you may cancel and ask for a refund of the unused part of the period.</p>
<h2>How to ask</h2><ol><li>Write to <a href="${mailto('Refund request')}">${SUPPORT}</a> from the email address on your account, or reply to your receipt.</li><li>Tell us which payment (the date or the receipt number helps).</li><li>We confirm and refund it. Refunds are processed by our payment provider, Paddle, and go back to the payment method you used. Your bank may take several days to show it.</li></ol>
<h2>What happens to your decks</h2><p>If you get a refund and your plan ends, nothing is deleted. You can still open, edit, present and export your decks; the free plan&rsquo;s limits apply to what you add next. See the <a href="/terms/">terms of use</a>.</p>
<h2>Your legal rights</h2><p>This policy is in addition to any rights you have by law, which it does not limit. Paddle&rsquo;s own terms for buyers may also apply to your purchase.</p>
<p style="margin-top:28px"><a class="btn" href="${mailto('Refund request')}">Ask for a refund</a></p></div>`, { eyebrow: 'Legal' }),
});

const notFound = () => layout({
  path: '/404.html',
  title: `Page not found | ${NAME}`,
  description: 'That page does not exist.',
  index: false,
  body: `<section class="seg notfound"><div class="wrap seg__grid"><div>
<p class="label">Error 404</p><h1>That page <em>wandered off.</em></h1>
<p class="lead">The address does not exist, or it moved. Here is where most people were headed.</p>
<ul class="chips"><li><a href="/">Home</a></li><li><a href="/product/">Product</a></li><li><a href="/templates/">Templates</a></li><li><a href="/pricing/">Pricing</a></li><li><a href="/learn/">Guides</a></li><li><a href="/app/">Open the app</a></li></ul>
<p class="seg__fine">Still lost? Write to <a href="${mailto('A broken link')}">${SUPPORT}</a>.</p></div>
<img class="seg__art" src="/art/webinars.svg" alt="" width="800" height="560"></div></section>`,
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
<p class="meta">Icebreakers, quizzes, polls, feedback, tables and matrices. Choose one and it opens in the editor as a new deck, ready to change. Sign in with a free account when you open one. The pictures below are sketches; the real slides use your theme.</p>
${groups.map((g) => `<h2 class="tpg">${esc(g)}</h2><ul class="tpl">${TEMPLATES.filter((t) => t.group === g).map((t) => `<li class="tpl__card">${thumb(t.make())}<div class="tpl__row"><b>${esc(t.name)}</b><a class="btn sm" href="/app/?template=${t.id}" aria-label="Use the ${esc(t.name)} slide">Use this slide</a></div></li>`).join('')}</ul>`).join('\n')}
<p style="margin-top:36px"><a class="btn" href="/app/">Start from a blank deck</a></p></div>`,
  });
};

// ---- segment pages (education, training) ----------------------------------------------------------------------

const SPOTS = [['ask', 'Ask', 'Take questions from the whole room'], ['quiz', 'Quiz', 'Test what landed, with points for speed'], ['rank', 'Rank', 'Find the group\'s real priorities'], ['discuss', 'Discuss', 'Start a conversation everyone joins']];
const canBand = (cls = '') => `<section class="can ${cls}"><div class="wrap"><header class="head head--center reveal"><h2>What you can do</h2></header><ul class="can__row">${SPOTS.map(([n, t, d]) => `<li class="reveal"><img src="/art/spot-${n}.svg" alt="" width="200" height="200" loading="lazy"><b>${t}</b><span>${d}</span></li>`).join('')}</ul></div></section>`;

function segmentPage({ path, title, description, eyebrow, h1, lead, cases, trust, closing, templates = [] }) {
  const slug = path.replace(/\//g, '');
  const picks = templates.map((id) => TEMPLATES.find((t) => t.id === id)).filter(Boolean);
  const others = SEGMENTS.filter((x) => x.slug !== slug);
  return layout({
    path, title, description,
    body: `<section class="seg"><div class="wrap seg__grid"><div>
<p class="label">${eyebrow}</p><h1>${h1}</h1><p class="lead">${lead}</p>
<p class="cta"><a class="btn lg" href="/app/">Start building free</a><a class="textlink" href="/templates/">Browse ready-made slides <span aria-hidden="true">&rarr;</span></a></p>
</div><img class="seg__art" src="/art/${slug}.svg" alt="${esc(ART_ALT[slug] ?? '')}" width="800" height="560"></div></section>
${canBand('can--paper')}
<section><div class="wrap"><header class="head"><h2>How people use it</h2></header>
<div class="cases">${cases.map(([t, text, how]) => `<article class="case"><h3>${t}</h3><p>${text}</p><p class="case__how"><b>Use:</b> ${how}</p></article>`).join('')}</div></div></section>
${picks.length ? `<section class="band-paper"><div class="wrap"><header class="head"><h2>Start with these slides</h2><p class="sub">Each one opens in the editor as a new deck, ready to change.</p></header>
<ul class="tpl">${picks.map((t) => `<li class="tpl__card">${thumb(t.make())}<div class="tpl__row"><b>${esc(t.name)}</b><a class="btn sm" href="/app/?template=${t.id}" aria-label="Use the ${esc(t.name)} slide">Use this slide</a></div></li>`).join('')}</ul></div></section>` : ''}
<section><div class="wrap"><header class="head"><h2>What you can count on</h2></header>
<ul class="checks seg__checks">${trust.map(([b, t]) => `<li>${CHECK}<span><b>${b}</b> ${t}</span></li>`).join('')}</ul>
<p class="seg__fine">${closing}</p></div></section>
<section class="band-paper"><div class="wrap"><header class="head"><h2>Other ways people use it</h2></header>
<ul class="chips">${others.map((x) => `<li><a href="${segHref(x)}"><span class="mm__ico mm__ico--${x.tone}">${ico(x.icon)}</span>${x.name}</a></li>`).join('')}</ul></div></section>
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
  templates: ['icebreaker', 'quiz', 'pulse', 'feedback'],
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
  templates: ['icebreaker', 'prioritise', 'priority-matrix', 'questions'],
  closing: `Paid plans add bigger rooms (up to ${PLANS.advanced.livePhones.toLocaleString('en-US')} phones), more question types, your own branding and team workspaces, each with a ${TRIAL_DAYS}-day free trial. See <a href="/pricing/">pricing</a>.`,
});


const SEGMENT_SPECS = {
  events: {
    title: `${NAME} for events and conferences`,
    description: 'Audience questions, live polls, icebreakers, quizzes and feedback for keynotes, conferences and meetups. Rooms of up to 1,000 phones.',
    eyebrow: 'For events and conferences',
    h1: 'Turn a big room into a <em>conversation.</em>',
    lead: 'Open a session with a poll, take upvoted questions from the whole audience, and close with feedback you can read the same day. Attendees join from their own phones with a code or a QR on the screen.',
    cases: [
      ['Keynotes and panels', 'Attendees send questions and upvote the best ones, and you answer what the room cares about most. Hold questions for approval first if you want.', 'Audience Q&amp;A with upvotes, approve-first moderation (Starter plan and above).'],
      ['Opening the session', 'A one-word question gets everyone participating in the first minute and shows you who is in the room.', 'Word cloud, live poll (Starter plan and above for word clouds).'],
      ['Sponsor sessions and games', 'Run a timed quiz between talks, with names, teams and a leaderboard on the big screen.', 'Timed quiz, teams, leaderboard (Starter plan and above).'],
      ['Finding your way around', 'Let people drop a pin on a floor plan or a map to say where they are, or where something should go.', 'Pin on an image (Starter plan and above).'],
      ['Workshops inside the conference', 'Rank topics for the next hour, or place ideas on a grid, and show the result straight away.', 'Ranking, 2x2 matrix, live poll.'],
      ['After the session', 'A rating and one open question collect feedback while people are still in their seats. Download the answers as a spreadsheet.', 'Rating scale, open answers, results download (Starter plan and above).'],
    ],
    templates: ['icebreaker', 'questions', 'pin-map', 'scoreboard'],
    trust: [
      ['Rooms of any size you need.', `Up to ${PLANS.advanced.livePhones.toLocaleString('en-US')} phones in one room on Advanced, ${PLANS.pro.livePhones} on Pro.`],
      ['No app and no sign-up for attendees.', 'A code or QR code is enough, on any phone.'],
      ['You stay in control of the screen.', 'Votes count for the slide you are showing, and you move the slides from your own phone.'],
      ['Know the venue Wi-Fi limits.', 'Your slides present offline, but phones need a connection to send answers. Check coverage before a very large room.'],
    ],
    closing: `Paid plans add bigger rooms, more question types and downloads, each with a ${TRIAL_DAYS}-day free trial. See <a href="/pricing/">pricing</a>.`,
  },
  'people-teams': {
    title: `${NAME} for HR and people teams`,
    description: 'Onboarding courses with certificates, anonymous all-hands questions, polls and feedback sessions for HR and people teams.',
    eyebrow: 'For HR and people teams',
    h1: 'Hear what your people <em>really think.</em>',
    lead: 'Run all-hands with questions people feel safe asking, turn onboarding into a course new starters finish at their own pace, and collect feedback without names attached.',
    cases: [
      ['All-hands and town halls', 'People send questions without putting their name to them, and the room upvotes the ones that matter. You can read each one before it appears.', 'Audience Q&amp;A, approve-first moderation (Starter plan and above).'],
      ['Onboarding courses', 'Share a deck as a self-paced course. New starters go through it in their own time, and you get a list of who finished and a certificate for each person.', 'Self-paced course (Starter plan and above).'],
      ['Training sessions', 'Check what landed with a short quiz after each section, and re-teach only what was missed.', 'Quiz, score summary, session report (Starter plan and above).'],
      ['Feedback and listening', 'Ask how a change is landing with a rating scale and an open question, with no names collected unless you turn them on.', 'Rating scale, open answers, private session.'],
      ['Culture and engagement', 'A one-word question about how the week felt shows the mood of the room at a glance.', 'Word cloud, reactions (word clouds need Starter and above).'],
      ['Benefits and policy sessions', 'Walk through a change, then poll the room on what is still unclear before you close.', 'Live poll, audience Q&amp;A.'],
    ],
    templates: ['questions', 'rating', 'registration', 'feedback'],
    trust: [
      ['Anonymous by default.', 'Names are collected only when you turn them on. A private session keeps nothing at all.'],
      ['You read it before everyone does.', 'Hold answers for your approval, or let the swear filter hide the rest.'],
      ['Answers are not stored on our servers.', 'They stay in the presenter&rsquo;s browser while the session runs. See <a href="/security/">security</a>.'],
      ['A completion list, not a compliance system.', 'A course records who viewed every slide and typed their name. It does not grade quizzes or replace a learning management system.'],
    ],
    closing: `Team workspaces on Pro and Advanced let your whole team share decks and comment on slides. See <a href="/pricing/">pricing</a>.`,
  },
  consulting: {
    title: `${NAME} for consulting and workshops`,
    description: 'Facilitate client workshops: rank priorities, place ideas on a 2x2, collect open answers, present with your own branding and leave a session report.',
    eyebrow: 'For consulting and workshops',
    h1: 'Facilitate the room, not the <em>slideshow.</em>',
    lead: 'Put the decision on the screen and let every person in the room weigh in. Rank priorities together, place ideas on a grid, collect honest answers, and leave the client a clear record.',
    cases: [
      ['Discovery sessions', 'Open questions bring out what people would not say aloud, and you can group and discuss the answers straight away.', 'Open answers, word cloud, approve-first moderation (Starter plan and above).'],
      ['Prioritising together', 'Have the room rank a list of options and see the group&rsquo;s order appear, instead of arguing from the loudest voice.', 'Ranking (Starter plan and above), live poll.'],
      ['Impact and effort', 'Place ideas on a 2x2 and discuss the quick wins first. SWOT and priority grids are ready-made.', '2x2 matrix, SWOT slide.'],
      ['Presenting as your firm', 'Use your own logo, colours and font, and move the slides from your phone while you walk the room.', 'Brand kit, phone remote (Starter plan and above for branding).'],
      ['Confidential work', 'Start a private session when the topic is sensitive: nothing is kept after you end it.', 'Private session.'],
      ['Leaving something behind', 'Save a session report with every question and answer, share the deck with a link, or export to PowerPoint.', 'Session report, share link, PowerPoint export (reports Starter plan and above; PowerPoint on Pro and above).'],
    ],
    templates: ['prioritise', 'priority-matrix', 'swot', 'open-question'],
    trust: [
      ['Works in the client&rsquo;s room.', 'Nothing for participants to install, and the deck presents offline.'],
      ['Bring your existing slides.', 'Import a PowerPoint or Google Slides deck, and take the finished deck out as a PowerPoint.'],
      ['Share work with colleagues.', 'On Pro and Advanced, share decks with your team, comment on slides and keep one brand kit.'],
      ['Honest about limits.', 'Imported charts and SmartArt are not carried across, and the importer tells you what it left out.'],
    ],
    closing: `Pro and Advanced add PowerPoint export and team workspaces. Every paid plan starts with a ${TRIAL_DAYS}-day free trial. See <a href="/pricing/">pricing</a>.`,
  },
  webinars: {
    title: `${NAME} for webinars and online sessions`,
    description: 'Make a remote audience part of the call: live polls, quizzes, word clouds and Q&A from any browser, with no app and no sign-up.',
    eyebrow: 'For webinars and online sessions',
    h1: 'Make the people on the call <em>part of it.</em>',
    lead: 'Share your screen and put a code in the chat. Attendees answer from the browser on their phone or computer, and the results build on the screen you are sharing.',
    cases: [
      ['Starting strong', 'Open with a poll or a one-word question so people do something in the first minute.', 'Live poll, word cloud (word clouds need Starter and above).'],
      ['Questions without the chaos', 'Attendees send questions and upvote them, and you take the top ones instead of scrolling a chat.', 'Audience Q&amp;A (Starter plan and above).'],
      ['Checking understanding', 'A short quiz between sections shows whether the message landed.', 'Quiz, timed questions, score summary.'],
      ['Courses and recordings', 'Turn the same deck into a self-paced course for people who missed the live session.', 'Self-paced course (Starter plan and above).'],
      ['Keeping people with you', 'Quick reactions let attendees tell you to slow down or give an example, without unmuting.', 'Reactions and hand raise.'],
      ['Follow-up', 'Share the deck with a link and download the answers afterwards.', 'Share link, results download (Starter plan and above).'],
    ],
    templates: ['icebreaker', 'poll', 'pulse', 'feedback'],
    trust: [
      ['Works with whatever you use to present.', 'Share the browser window or tab. There is nothing to install and no plugin for your meeting tool.'],
      ['Any device with a browser.', 'Attendees can answer on a phone or a computer.'],
      ['Not an add-in yet.', 'We do not yet have add-ins for PowerPoint, Google Slides or meeting apps. You present from our player.'],
    ],
    closing: `Free to start, with rooms of up to ${PLANS.free.livePhones} people. See <a href="/pricing/">pricing</a> for bigger rooms.`,
  },
  retrospectives: {
    title: `${NAME} for team retrospectives`,
    description: 'Run team retros with anonymous answers, a 2x2, voting on actions and a shared deck. Ready-made retro slides.',
    eyebrow: 'For team retrospectives',
    h1: 'Retros where everyone <em>speaks up.</em>',
    lead: 'Collect what went well and what did not without anyone waiting their turn, vote on what to change, and keep the deck where the whole team can see it.',
    cases: [
      ['What went well, what did not', 'Everyone adds their thoughts at once and the common themes grow on the screen.', 'Word cloud or open answers (Starter plan and above).'],
      ['Honest, anonymous input', 'No names unless you ask for them, so the quiet voices are heard too.', 'Open answers, private session.'],
      ['Choosing what to fix', 'Rank the proposed changes together, or place them on impact and effort.', 'Ranking (Starter plan and above), 2x2 matrix.'],
      ['Taking the temperature', 'Start with a quick rating of the sprint and see how far apart the team is.', 'Rating scale, reactions.'],
      ['Keeping actions visible', 'Put the agreed actions on a slide in a shared deck and comment on them as work moves.', 'Team workspace and comments (Pro plan and above).'],
      ['A record for next time', 'Save the session report so next retro can start from the last one.', 'Session report (Starter plan and above).'],
    ],
    templates: ['open-question', 'rating', 'priority-matrix', 'prioritise'],
    trust: [
      ['No setup for the team.', 'A code on the screen is all anyone needs, in the office or remote.'],
      ['Nothing is kept unless you save it.', 'Answers live in the facilitator&rsquo;s browser, and a private session keeps nothing.'],
      ['Share the deck.', 'On Pro and Advanced, your team shares decks, brand and comments in one workspace.'],
    ],
    closing: `Start free today. Team workspaces come with Pro and Advanced. See <a href="/pricing/">pricing</a>.`,
  },
  community: {
    title: `${NAME} for non-profits and community groups`,
    description: 'Community meetings, volunteer training and fundraising quiz nights for non-profits and groups. Free to start, nothing for people to install.',
    eyebrow: 'For non-profits and community groups',
    h1: 'Everyone in the hall gets <em>a say.</em>',
    lead: 'Run a community meeting where every person can answer, train volunteers with a course they finish in their own time, and host a quiz night that raises money, all from a browser.',
    cases: [
      ['Community meetings', 'Put the options on screen, let everyone vote from their phone, and take upvoted questions from people who would not speak up.', 'Live poll, audience Q&amp;A (Q&amp;A needs Starter and above).'],
      ['Volunteer training', 'Share a deck as a self-paced course. Volunteers go through it when it suits them, and you see who finished.', 'Self-paced course with certificates (Starter plan and above).'],
      ['Fundraising quiz nights', 'Teams, a timer, points for speed and a live leaderboard on the big screen.', 'Timed quiz, teams, leaderboard (Starter plan and above).'],
      ['Planning together', 'Ask what matters most and rank the answers, so decisions reflect the group.', 'Word cloud, ranking.'],
      ['Meetings by phone or online', 'Members join from home with a code, so nobody is left out by distance.', 'Live session, share link.'],
      ['Reporting back', 'Save a report of what people said and share the deck with funders or members.', 'Session report, share link.'],
    ],
    templates: ['poll', 'questions', 'scoreboard', 'icebreaker'],
    trust: [
      ['Free to start.', `Build, present and run polls and quizzes with rooms of up to ${PLANS.free.livePhones} phones at no cost.`],
      ['Nothing to install for members.', 'Any phone with a browser works.'],
      ['Write to us about non-profit pricing.', `Tell us how you would use it at <a href="${mailto('Non-profit pricing')}">${SUPPORT}</a> and a person will reply.`],
    ],
    closing: `Paid plans start at ${money(PRICES.starter.month)} a month with a ${TRIAL_DAYS}-day free trial. See <a href="/pricing/">pricing</a>.`,
  },
};

const segmentPages = () => Object.fromEntries(Object.entries(SEGMENT_SPECS).map(([slug, spec]) => [`${slug}/index.html`, segmentPage({ path: `/${slug}/`, ...spec })]));

const useCasesPage = () => layout({
  path: '/use-cases/',
  title: `Use cases | ${NAME}`,
  description: 'How teams, schools, events and community groups use Densight Slides: training, education, conferences, HR, consulting, webinars, retros and more.',
  body: `<section class="seg"><div class="wrap"><p class="label">Use cases</p><h1>Wherever people need to be <em>heard.</em></h1>
<p class="lead">The same slides, questions and live answers work in a classroom, a boardroom, a conference hall and a video call. Pick the one closest to you.</p></div></section>
<section><div class="wrap"><ul class="ucgrid">${SEGMENTS.map((x) => `<li><a class="uccard uccard--${x.tone}" href="${segHref(x)}"><img class="uccard__art" src="/art/${x.slug}.svg" alt="" width="800" height="560" loading="lazy"><span class="mm__ico mm__ico--${x.tone}">${ico(x.icon)}</span><b>${x.name}</b><small>${x.short}</small><span class="mm__go">Read how <span aria-hidden="true">&rarr;</span></span></a></li>`).join('')}</ul>
<p class="seg__fine" style="margin-top:36px">Not on the list? If people need to answer questions in a room or online, it probably fits. <a href="${mailto('A use case')}">Tell us about yours</a> or <a href="/app/">start building</a>.</p></div></section>
<section class="cta-band"><div class="wrap"><h2>Try it with your next session.</h2><p>Free to start. Nothing for your audience to install.</p><a class="btn lg light" href="/app/">Start building free</a></div></section>`,
});

// ---- pricing --------------------------------------------------------------------------------------------------


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
  ['Is there a free plan?', `Yes. With a free account you can build, present, run polls and quizzes, and export your deck as a file or images without paying. The free plan keeps ${PLANS.free.cloudDecks} decks online and rooms of up to ${PLANS.free.livePhones} phones.`],
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
  body: docify(`<div class="doc"><p class="label">Security and privacy</p><h1>What we keep, and what we do not</h1>
<p class="meta">Last updated ${UPDATED}. Written for people who have to decide whether it is safe to put their material here. The <a href="/privacy/">privacy policy</a> has the legal wording.</p>
<h2>Your decks</h2><p>Decks are stored in your browser first. Nothing is uploaded unless you sign in to save online or choose to share. Signed-in decks are kept in our database, provided by Supabase, and every account can read and change only its own decks; that rule is enforced inside the database, not just in the app. Decks can be moved into a team workspace only by their owner.</p>
<h2>Live sessions</h2><p>Audience answers pass through a realtime messaging service between your page and the phones. They are held in your browser while the session runs and are not saved on our servers. Answer keys for quizzes never leave your page. Names are only collected if you turn them on. A private session turns names, reports and downloads off entirely.</p>
<h2>Sharing</h2><p>A share link is a long random token. Anyone with it can view that deck; turning sharing off stops it at once. Self-paced courses record only the name a learner types, for decks that are being shared.</p>
<h2>Payments</h2><p>Payments are handled by Paddle. We never see or store card details. Our server confirms each payment event using a signature before changing anyone&rsquo;s plan.</p>
<h2>Tracking</h2><p>No advertising, no tracking cookies and no sale of data. The site is hosted on Netlify, which may keep standard server logs.</p>
<h2>Deleting everything</h2><p>You can delete a deck, all decks on your device, or your whole account and every online deck at any time from the Account page. You can also export any deck as a file.</p>
<h2>What we do not claim</h2><p>We do not currently hold security certifications such as SOC 2 or ISO 27001, and we do not offer single sign-on yet. If your organisation needs a security review, a data-processing agreement or another document, write to us and we will tell you plainly what we can and cannot provide.</p>
<h2>Report a problem</h2><p>If you find a security problem, write to <a href="${mailto('Security report')}">${SUPPORT}</a>. A person at <a href="${COMPANY}">Densight Labs</a> will read it.</p>
<p style="margin-top:28px"><a class="btn" href="${mailto('Security review')}">Ask a security question</a></p></div>`, { eyebrow: 'Trust' }),
});

const pageCtx = () => ({ layout, esc, mailto, SUPPORT, COMPANY, NAME, ico, CHECK, SEGMENTS, segHref, mkWin, mockEditor, mockResults, mockReport, mockCourse, mockTeam });

// path (relative to dist/) -> file contents
export function buildSite() {
  const pages = {
    'index.html': home(),
    ...productPages(pageCtx()),
    ...learnPages(pageCtx()),
    'privacy/index.html': privacy(),
    'terms/index.html': terms(),
    'refund/index.html': refund(),
    'welcome/index.html': welcome(),
    'templates/index.html': templatesPage(),
    'education/index.html': educationPage(),
    'training/index.html': trainingPage(),
    'use-cases/index.html': useCasesPage(),
    ...segmentPages(),
    'pricing/index.html': pricingPage(),
    'security/index.html': securityPage(),
    '404.html': notFound(),
    ...buildArt(),
    'robots.txt': `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /welcome/\n\nSitemap: ${SITE}/sitemap.xml\n`,
    'sitemap.xml': `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', '/product/', ...PRODUCTS.map(productHref), '/templates/', '/use-cases/', ...SEGMENTS.map(segHref), '/pricing/', '/security/', '/learn/', ...GUIDES.map(guideHref), '/privacy/', '/terms/', '/refund/'].map((p) => `<url><loc>${SITE}${p}</loc></url>`).join('\n')}\n</urlset>\n`,
  };
  return pages;
}
