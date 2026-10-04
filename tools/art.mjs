// Flat illustrations for the public pages, drawn here in code so they match our colours and can move.
// Each scene is a stand-alone SVG file (served from /art/) with its own small stylesheet, so it animates
// when used as an <img>, costs the page nothing, and stays still for people who ask for less motion.

const C = {
  ink: '#0F1117', blue: '#2020E8', indigo: '#17177F', sky: '#7C8CFF', lav: '#E6E7FF',
  teal: '#0B7A69', mint: '#9BE3D0', coral: '#E8643C', peach: '#FFC9B5', violet: '#6A3FC2', lilac: '#D7C4FA',
  amber: '#F5B93B', pink: '#FF7FAE', red: '#E5484D', green: '#1F9D55', white: '#FFFFFF', paper: '#F4F5FA',
};
const SKIN = ['#F6D2B0', '#E3A877', '#B97A4B', '#7A4B2E', '#4F2F1C'];

const STYLE = `
text{font-family:Inter,Arial,Helvetica,sans-serif}
.bar{transform-box:fill-box;transform-origin:left center;animation:grow 3.6s ease-in-out infinite alternate}
.d1{animation-delay:.4s}.d2{animation-delay:.9s}.d3{animation-delay:1.4s}.d4{animation-delay:1.9s}
@keyframes grow{from{transform:scaleX(.18)}}
.float{animation:float 5s ease-in-out infinite}.float.b{animation-duration:6.5s;animation-delay:-2s}.float.c{animation-duration:4.2s;animation-delay:-1s}
@keyframes float{50%{transform:translateY(-9px)}}
.bob{animation:bob 3.2s ease-in-out infinite}.bob.b{animation-delay:-1.1s}.bob.c{animation-delay:-2.2s}
@keyframes bob{50%{transform:translateY(-5px)}}
.pulse{transform-box:fill-box;transform-origin:center;animation:pulse 2.6s ease-out infinite}.pulse.b{animation-delay:.9s}.pulse.c{animation-delay:1.7s}
@keyframes pulse{0%{transform:scale(.5);opacity:.85}100%{transform:scale(1.7);opacity:0}}
.wave{transform-box:fill-box;transform-origin:0% 100%;animation:wave 1.5s ease-in-out infinite}
.wave.l{transform-origin:100% 100%;animation-name:wavel}
@keyframes wave{50%{transform:rotate(-16deg)}}
@keyframes wavel{50%{transform:rotate(16deg)}}
.pop{transform-box:fill-box;transform-origin:center;animation:pop 5s ease-in-out infinite}
.p1{animation-delay:0s}.p2{animation-delay:.5s}.p3{animation-delay:1s}.p4{animation-delay:1.5s}.p5{animation-delay:2s}.p6{animation-delay:2.5s}
@keyframes pop{0%{transform:scale(0)}12%,82%{transform:scale(1)}94%,100%{transform:scale(0)}}
.rise{animation:rise 4.6s ease-in infinite}.rise.b{animation-delay:-1.6s}.rise.c{animation-delay:-3.1s}
@keyframes rise{0%{transform:translateY(24px);opacity:0}18%{opacity:1}100%{transform:translateY(-80px);opacity:0}}
.spin{transform-box:fill-box;transform-origin:center;animation:spin 22s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.dot{animation:dot 1.2s ease-in-out infinite}.dot.b{animation-delay:.2s}.dot.c{animation-delay:.4s}
@keyframes dot{40%{transform:translateY(-9px)}}
.beam{animation:beam 4s ease-in-out infinite alternate;transform-box:fill-box;transform-origin:50% 0}
@keyframes beam{from{opacity:.25}to{opacity:.55}}
.tw{animation:tw 2.4s ease-in-out infinite}.tw.b{animation-delay:.8s}.tw.c{animation-delay:1.6s}
@keyframes tw{50%{opacity:.25}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}}`;

const svg = (w, h, body, bg, extra = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><style>${STYLE}</style>${bg ? `<rect width="${w}" height="${h}" rx="28" fill="${bg}"/>` : ''}${extra}${body}</svg>`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// ---- parts -----------------------------------------------------------------------------------------------------

// A person. Origin is the middle of the waist. pose: down | phone | raise | point | cheer. back: seen from behind.
function person(x, y, o = {}) {
  const { s = 1, skin = SKIN[1], shirt = C.blue, hair = C.ink, style = 'short', pose = 'down', legs = false, pants = C.indigo, back = false, flip = false, bob = '' } = o;
  const arm = (d, col = shirt) => `<path d="${d}" stroke="${col}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
  const hand = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="9" fill="${skin}"/>`;
  const phone = (px, py, r = 0) => `<g transform="translate(${px} ${py}) rotate(${r})"><rect x="-11" y="-20" width="22" height="40" rx="5" fill="${C.ink}"/><rect x="-8" y="-16" width="16" height="30" rx="2.5" fill="${C.sky}"/></g>`;
  let arms = '';
  if (pose === 'down') arms = arm('M-33 -94 L-42 -30') + arm('M33 -94 L42 -30') + hand(-42, -26) + hand(42, -26);
  else if (pose === 'phone') arms = arm('M-33 -94 L-44 -44 L-12 -48') + arm('M33 -94 L44 -44 L12 -48') + (back ? '' : phone(0, -66, 0)) + hand(-12, -48) + hand(12, -48);
  else if (pose === 'raise') arms = arm('M-33 -94 L-42 -30') + hand(-42, -26) + `<g class="wave">${arm('M33 -94 L60 -150 L54 -200')}${hand(54, -206)}${phone(54, -236, 8)}</g>`;
  else if (pose === 'cheer') arms = `<g class="wave l">${arm('M-33 -94 L-62 -150 L-56 -198')}${hand(-56, -204)}</g><g class="wave">${arm('M33 -94 L62 -150 L56 -198')}${hand(56, -204)}</g>`;
  else if (pose === 'point') arms = arm('M33 -94 L42 -30') + hand(42, -26) + arm('M-33 -94 L-92 -120 L-132 -128') + hand(-138, -130);
  const torso = `<rect x="-35" y="-118" width="70" height="118" rx="28" fill="${shirt}"/>`;
  const legsSvg = legs ? `<rect x="-27" y="-8" width="25" height="96" rx="12" fill="${pants}"/><rect x="2" y="-8" width="25" height="96" rx="12" fill="${pants}"/><rect x="-33" y="78" width="33" height="14" rx="7" fill="${C.ink}"/><rect x="0" y="78" width="33" height="14" rx="7" fill="${C.ink}"/>` : '';
  const neck = `<rect x="-10" y="-134" width="20" height="22" rx="8" fill="${skin}"/>`;
  const head = `<circle cx="0" cy="-152" r="31" fill="${skin}"/>`;
  const hairSvg = {
    short: `<path d="M-32 -150 A32 32 0 0 1 32 -150 Q16 -166 0 -164 Q-16 -166 -32 -150Z" fill="${hair}"/>`,
    long: `<path d="M-33 -150 A33 33 0 0 1 33 -150 L35 -108 Q22 -112 20 -122 L20 -140 Q0 -158 -20 -140 L-20 -122 Q-22 -112 -35 -108Z" fill="${hair}"/>`,
    bun: `<path d="M-32 -150 A32 32 0 0 1 32 -150 Q16 -166 0 -164 Q-16 -166 -32 -150Z" fill="${hair}"/><circle cx="0" cy="-190" r="15" fill="${hair}"/>`,
    curly: [-24, -12, 0, 12, 24].map((cx, i) => `<circle cx="${cx}" cy="${-172 + Math.abs(cx) / 5}" r="${i % 2 ? 15 : 17}" fill="${hair}"/>`).join('') + `<circle cx="-30" cy="-152" r="11" fill="${hair}"/><circle cx="30" cy="-152" r="11" fill="${hair}"/>`,
    cap: `<path d="M-33 -152 A33 33 0 0 1 33 -152Z" fill="${hair}"/><rect x="-4" y="-160" width="46" height="9" rx="4" fill="${hair}"/>`,
    bald: '',
  }[style] ?? '';
  const face = back ? `<circle cx="0" cy="-152" r="31" fill="${hair}"/>` : `<circle cx="-11" cy="-150" r="3.2" fill="${C.ink}"/><circle cx="11" cy="-150" r="3.2" fill="${C.ink}"/><path d="M-9 -138 Q0 -130 9 -138" stroke="${C.ink}" stroke-width="3" stroke-linecap="round" fill="none"/>`;
  const inner = `${legsSvg}${torso}${arms}${neck}${head}${back ? '' : hairSvg}${face}`;
  return `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})"><g class="${bob ? `bob ${bob}` : ''}">${inner}</g></g>`;
}

// the head and shoulders of someone in a crowd, seen from behind
const crowdHead = (x, y, r, skin, hair, shirt, phone = false) => `<g transform="translate(${x} ${y})"><rect x="${-r * 1.5}" y="${r * 0.7}" width="${r * 3}" height="${r * 3}" rx="${r}" fill="${shirt}"/><circle r="${r}" fill="${skin}"/><path d="M${-r} 0 A${r} ${r} 0 0 1 ${r} 0 Q${r * 0.5} ${-r * 0.3} 0 ${-r * 0.2} Q${-r * 0.5} ${-r * 0.3} ${-r} 0Z" fill="${hair}" transform="translate(0 ${-r * 0.05})"/><circle r="${r}" fill="${hair}" opacity=".0"/>${phone ? `<g transform="translate(${r * 1.1} ${-r * 0.9}) rotate(14)"><rect x="-7" y="-13" width="14" height="26" rx="3.5" fill="${C.ink}"/><rect x="-5" y="-10" width="10" height="19" rx="1.5" fill="${C.sky}"/></g>` : ''}</g>`;

// a presentation screen showing bars that grow
function screen(x, y, w, h, title, rows, opt = {}) {
  const { bg = C.white, ink = C.ink, bars = [C.blue, C.pink, C.amber, C.red], label = true } = opt;
  const top = 46;
  const rh = Math.min(26, (h - top - 18) / rows.length - 10);
  return `<g transform="translate(${x} ${y})"><rect width="${w}" height="${h}" rx="14" fill="${bg}"/><rect width="${w}" height="${h}" rx="14" fill="none" stroke="${ink}" stroke-opacity=".12" stroke-width="2"/>
<text x="20" y="32" font-size="${w > 340 ? 19 : 16}" font-weight="650" fill="${ink}">${esc(title)}</text>
${rows.map((r, i) => `<g transform="translate(20 ${top + i * (rh + 10)})">${label ? `<text x="0" y="${rh * 0.72}" font-size="12" font-weight="650" fill="${ink}" opacity=".7">${esc(r[1] ?? '')}</text>` : ''}<rect class="bar d${(i % 4) + 1}" x="${label ? 34 : 0}" y="0" width="${(w - 60 - (label ? 34 : 0)) * r[0]}" height="${rh}" rx="6" fill="${bars[i % bars.length]}"/></g>`).join('')}</g>`;
}

const sparkle = (x, y, r, col, cls = 'tw') => `<path class="${cls}" transform="translate(${x} ${y})" d="M0 ${-r} Q${r * 0.18} ${-r * 0.18} ${r} 0 Q${r * 0.18} ${r * 0.18} 0 ${r} Q${-r * 0.18} ${r * 0.18} ${-r} 0 Q${-r * 0.18} ${-r * 0.18} 0 ${-r}Z" fill="${col}"/>`;
const bubble = (x, y, w, h, col, content = '', cls = 'float') => `<g transform="translate(${x} ${y})"><g class="${cls}"><rect width="${w}" height="${h}" rx="${Math.min(22, h / 2)}" fill="${col}"/><path d="M${w * 0.2} ${h - 2} l-12 20 l30 -18z" fill="${col}"/>${content}</g></g>`;
const heart = (x, y, s, col, cls = 'rise') => `<g transform="translate(${x} ${y})"><g class="${cls}"><path transform="scale(${s})" d="M0 8 C-14 -4 -10 -18 0 -10 C10 -18 14 -4 0 8Z" fill="${col}"/></g></g>`;
const plant = (x, y, col = C.green) => `<g transform="translate(${x} ${y})"><rect x="-18" y="-34" width="36" height="34" rx="8" fill="${C.coral}"/><path d="M0 -34 Q-28 -70 -34 -96 Q-4 -84 0 -34Z M0 -34 Q28 -76 38 -92 Q8 -86 0 -34Z M0 -34 Q-4 -80 2 -112 Q16 -76 0 -34Z" fill="${col}"/></g>`;
const phoneBig = (x, y, r = 0, col = C.sky) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-16" y="-30" width="32" height="60" rx="8" fill="${C.ink}"/><rect x="-12" y="-25" width="24" height="46" rx="4" fill="${col}"/></g>`;

// ---- the eight scenes -----------------------------------------------------------------------------------------

const W = 800, H = 560;

const scenes = {
  // a meeting room: screen behind a table, four people answering, a presenter pointing
  training: () => svg(W, H,
    `<rect x="0" y="400" width="800" height="160" rx="0" fill="${C.indigo}"/>
${screen(210, 56, 400, 230, 'Which topic should we cover first?', [[0.82, 'A'], [0.58, 'B'], [0.36, 'C'], [0.2, 'D']])}
<ellipse cx="410" cy="330" rx="330" ry="12" fill="#000" opacity=".15"/>
${person(100, 400, { s: 1.05, skin: SKIN[2], shirt: C.pink, hair: C.ink, style: 'bun', pose: 'point', legs: true, pants: C.ink, flip: true })}
${person(250, 436, { skin: SKIN[0], shirt: C.white, hair: '#6B3A1E', style: 'long', pose: 'phone', bob: '' })}
${person(400, 436, { skin: SKIN[3], shirt: C.amber, hair: C.ink, style: 'curly', pose: 'phone', bob: 'b' })}
${person(550, 436, { skin: SKIN[1], shirt: C.mint, hair: '#2B2B2B', style: 'short', pose: 'raise', bob: 'c' })}
${person(695, 436, { skin: SKIN[0], shirt: C.sky, hair: '#C26A2E', style: 'long', pose: 'phone' })}
<rect x="40" y="440" width="720" height="26" rx="13" fill="#2B2FB0"/><rect x="40" y="458" width="720" height="110" rx="0" fill="#2B2FB0"/>
<circle class="pulse" cx="604" cy="200" r="22" fill="none" stroke="${C.mint}" stroke-width="4"/><circle class="pulse b" cx="604" cy="200" r="22" fill="none" stroke="${C.mint}" stroke-width="4"/>
${heart(250, 330, 1.4, C.pink)}${heart(400, 340, 1.2, C.amber, 'rise b')}${sparkle(70, 90, 16, C.white)}${sparkle(740, 120, 12, C.mint, 'tw b')}${sparkle(690, 330, 10, C.white, 'tw c')}`,
    C.blue),

  // a lecture hall: quiz on the screen, rows of students seen from behind, the lecturer at the side
  education: () => svg(W, H,
    `<rect x="0" y="330" width="800" height="230" fill="#08594D"/>
${screen(54, 48, 440, 250, 'What is the capital of Australia?', [[0.26, 'A'], [0.78, 'B'], [0.14, 'C']], { bars: [C.lav, C.green, C.lav] })}
${person(660, 330, { s: 1.15, skin: SKIN[3], shirt: C.amber, hair: C.ink, style: 'short', pose: 'point', legs: true, pants: C.ink })}
${[110, 230, 350, 470, 590, 710].map((x, i) => crowdHead(x, 392, 24, SKIN[(i * 2) % 5], [C.ink, '#6B3A1E', '#C26A2E', C.ink, '#2B2B2B', '#8A5A2B'][i], [C.coral, C.lav, C.mint, C.pink, C.amber, C.sky][i], i % 2 === 0)).join('')}
${[60, 180, 300, 420, 540, 660].map((x, i) => crowdHead(x, 470, 30, SKIN[(i * 3 + 1) % 5], [C.ink, '#C26A2E', C.ink, '#6B3A1E', '#2B2B2B', C.ink][i], [C.violet, C.amber, C.red, C.sky, C.pink, C.blue][i], i % 3 === 1)).join('')}
${sparkle(540, 70, 14, C.amber)}${sparkle(750, 90, 10, C.white, 'tw b')}${sparkle(40, 330, 10, C.mint, 'tw c')}`,
    C.teal),

  // a conference: stage and presenter, big question wall, crowd with phones and light beams
  events: () => svg(W, H,
    `<polygon class="beam" points="170,0 300,0 120,340 40,340" fill="#fff" opacity=".35"/><polygon class="beam" points="640,0 760,0 760,340 660,340" fill="#fff" opacity=".3" style="animation-delay:-1.6s"/>
<rect x="30" y="330" width="460" height="22" rx="10" fill="${C.lilac}"/>
${person(150, 330, { s: 1.12, skin: SKIN[2], shirt: C.coral, hair: C.ink, style: 'curly', pose: 'cheer', legs: true, pants: C.ink })}
${person(330, 330, { s: 1.0, skin: SKIN[0], shirt: C.white, hair: '#C26A2E', style: 'bun', pose: 'down', legs: true, pants: C.indigo })}
<g transform="translate(520 60)"><rect width="250" height="270" rx="16" fill="#fff"/>
${[0, 1, 2].map((i) => `<g transform="translate(16 ${22 + i * 82})"><rect class="pop p${i + 1}" width="218" height="68" rx="12" fill="${[C.lav, '#DDF3EE', '#FCE8E1'][i]}"/><rect x="14" y="14" width="${[150, 120, 170][i]}" height="9" rx="4" fill="${C.ink}" opacity=".7"/><rect x="14" y="32" width="${[100, 140, 80][i]}" height="9" rx="4" fill="${C.ink}" opacity=".3"/><g transform="translate(184 34)"><rect x="-22" y="-14" width="44" height="28" rx="14" fill="${[C.blue, C.teal, C.coral][i]}"/><text x="0" y="5" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${[24, 17, 9][i]}</text></g></g>`).join('')}</g>
${[40, 120, 200, 280, 360, 440, 520, 600, 680, 760].map((x, i) => crowdHead(x, 468 + (i % 2) * 8, 24, SKIN[i % 5], [C.ink, '#6B3A1E', C.ink, '#C26A2E', '#2B2B2B'][i % 5], ['#4A2A91', '#5B34B0', '#3C2278'][i % 3], i % 3 === 0)).join('')}
${[90, 330, 560, 700].map((x, i) => `<g transform="translate(${x} 420)"><g class="rise ${['', 'b', 'c', ''][i]}"><rect x="-9" y="-16" width="18" height="32" rx="4" fill="${C.amber}"/></g></g>`).join('')}
${sparkle(470, 80, 14, C.amber)}${sparkle(60, 120, 12, C.white, 'tw b')}${sparkle(740, 40, 10, C.lilac, 'tw c')}`,
    C.violet),

  // an all-hands: anonymous question cards, hearts, a circle of people
  'people-teams': () => svg(W, H,
    `<circle cx="400" cy="610" r="330" fill="#F5886A"/>
${bubble(120, 54, 190, 100, C.white, `<rect x="22" y="26" width="120" height="10" rx="5" fill="${C.ink}" opacity=".75"/><rect x="22" y="46" width="90" height="10" rx="5" fill="${C.ink}" opacity=".3"/><text x="150" y="68" font-size="40" font-weight="800" fill="${C.coral}">?</text>`, 'float')}
${bubble(520, 40, 190, 100, C.white, `<rect x="22" y="26" width="110" height="10" rx="5" fill="${C.ink}" opacity=".75"/><rect x="22" y="46" width="130" height="10" rx="5" fill="${C.ink}" opacity=".3"/><g transform="translate(160 56)"><path d="M0 8 C-14 -4 -10 -18 0 -10 C10 -18 14 -4 0 8Z" fill="${C.red}"/></g>`, 'float b')}
${bubble(330, 20, 130, 74, C.lav, `<g transform="translate(65 34)"><circle class="dot" cx="-24" cy="0" r="7" fill="${C.blue}"/><circle class="dot b" cx="0" cy="0" r="7" fill="${C.blue}"/><circle class="dot c" cx="24" cy="0" r="7" fill="${C.blue}"/></g>`, 'float c')}
${person(150, 612, { s: 1.45, skin: SKIN[1], shirt: C.white, hair: C.ink, style: 'long', pose: 'phone' })}
${person(310, 612, { s: 1.45, skin: SKIN[3], shirt: C.violet, hair: C.ink, style: 'short', pose: 'raise', bob: 'b' })}
${person(490, 612, { s: 1.45, skin: SKIN[0], shirt: C.amber, hair: '#8A5A2B', style: 'bun', pose: 'phone', bob: 'c' })}
${person(650, 612, { s: 1.45, skin: SKIN[2], shirt: C.teal, hair: C.ink, style: 'curly', pose: 'cheer' })}
${heart(230, 300, 1.5, C.pink)}${heart(400, 310, 1.2, C.white, 'rise b')}${heart(590, 300, 1.6, C.amber, 'rise c')}${sparkle(60, 230, 14, C.white)}${sparkle(750, 230, 12, C.white, 'tw b')}${sparkle(700, 410, 9, C.amber, 'tw c')}`,
    C.coral),

  // a client workshop: 2x2 on a whiteboard, dots landing in the quadrants, two facilitators
  consulting: () => svg(W, H,
    `<rect x="0" y="440" width="800" height="120" fill="#1B1F2B"/>
<g transform="translate(150 44)"><rect width="500" height="340" rx="16" fill="#fff"/>
<path d="M250 24 V316 M30 170 H470" stroke="${C.ink}" stroke-opacity=".25" stroke-width="3" stroke-linecap="round"/>
<text x="24" y="40" font-size="14" font-weight="700" fill="${C.blue}">Quick wins</text><text x="274" y="40" font-size="14" font-weight="700" fill="${C.violet}">Big bets</text><text x="24" y="196" font-size="14" font-weight="700" fill="${C.teal}">Fill-ins</text><text x="274" y="196" font-size="14" font-weight="700" fill="${C.coral}">Avoid</text>
${[[100, 90, C.blue, 'p1'], [170, 120, C.pink, 'p2'], [340, 80, C.violet, 'p3'], [400, 120, C.amber, 'p4'], [110, 250, C.teal, 'p5'], [190, 230, C.sky, 'p6'], [360, 250, C.coral, 'p2'], [420, 220, C.red, 'p4']].map(([x, y, col, c]) => `<circle class="pop ${c}" cx="${x}" cy="${y}" r="15" fill="${col}"/>`).join('')}</g>
${person(80, 440, { s: 1.12, skin: SKIN[2], shirt: C.sky, hair: C.ink, style: 'short', pose: 'point', legs: true, pants: '#2B2F45', flip: true })}
${person(720, 440, { s: 1.12, skin: SKIN[0], shirt: C.white, hair: '#6B3A1E', style: 'long', pose: 'phone', legs: true, pants: '#2B2F45' })}
<circle class="pulse" cx="720" cy="338" r="26" fill="none" stroke="${C.sky}" stroke-width="4"/>${sparkle(60, 80, 14, C.amber)}${sparkle(750, 90, 11, C.sky, 'tw b')}${sparkle(710, 420, 9, C.white, 'tw c')}`,
    C.ink),

  // an online session: laptop with a grid of faces and a shared poll, a phone beside it
  webinars: () => svg(W, H,
    `<ellipse cx="400" cy="500" rx="330" ry="22" fill="#000" opacity=".12"/>
<g transform="translate(120 56)"><rect width="560" height="360" rx="22" fill="${C.ink}"/><rect x="14" y="14" width="532" height="318" rx="12" fill="${C.paper}"/>
<g transform="translate(28 28)">${[[0, 0, C.coral], [128, 0, C.teal], [256, 0, C.violet], [0, 96, C.amber], [128, 96, C.pink]].map(([x, y, col], i) => `<g transform="translate(${x} ${y})"><rect width="120" height="88" rx="10" fill="${col}" opacity=".9"/><circle cx="60" cy="38" r="20" fill="${SKIN[(i * 2 + 1) % 5]}"/><path d="M26 88 Q60 52 94 88Z" fill="#fff" opacity=".85"/><circle class="pulse ${['', 'b', 'c', '', 'b'][i]}" cx="104" cy="14" r="5" fill="${C.green}"/></g>`).join('')}
<g transform="translate(256 96)"><rect width="248" height="88" rx="10" fill="#fff"/><rect class="bar d1" x="12" y="14" width="150" height="14" rx="5" fill="${C.blue}"/><rect class="bar d2" x="12" y="36" width="104" height="14" rx="5" fill="${C.pink}"/><rect class="bar d3" x="12" y="58" width="60" height="14" rx="5" fill="${C.amber}"/></g>
<g transform="translate(0 196)"><rect width="504" height="64" rx="10" fill="#fff"/><rect x="16" y="18" width="150" height="9" rx="4" fill="${C.ink}" opacity=".6"/><rect x="16" y="36" width="230" height="9" rx="4" fill="${C.ink}" opacity=".25"/><g transform="translate(450 32)"><rect x="-34" y="-16" width="68" height="32" rx="10" fill="${C.blue}"/><text x="0" y="5" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">Join</text></g></g></g></g>
<path d="M80 420 H720 L690 452 H110Z" fill="#B9BED0"/><rect x="330" y="420" width="140" height="10" rx="5" fill="#8E94AB"/>
<g transform="translate(700 340)"><g class="float c"><rect x="-58" y="-104" width="116" height="208" rx="22" fill="${C.ink}"/><rect x="-48" y="-92" width="96" height="184" rx="12" fill="#fff"/><text x="-36" y="-62" font-size="11" font-weight="700" fill="${C.ink}">Your answer</text>${[0, 1, 2].map((i) => `<rect x="-38" y="${-42 + i * 38}" width="76" height="28" rx="8" fill="${i === 1 ? C.lav : C.paper}" stroke="${i === 1 ? C.blue : 'none'}" stroke-width="2"/>`).join('')}</g></g>
${bubble(60, 330, 130, 64, C.white, `<g transform="translate(65 28)"><circle class="dot" cx="-22" cy="0" r="6" fill="${C.teal}"/><circle class="dot b" cx="0" cy="0" r="6" fill="${C.teal}"/><circle class="dot c" cx="22" cy="0" r="6" fill="${C.teal}"/></g>`, 'float')}${sparkle(60, 80, 14, C.white)}${sparkle(760, 60, 11, C.mint, 'tw b')}`,
    '#1F5FE0'),

  // a retro: three columns of sticky notes that appear one by one, two teammates
  retrospectives: () => svg(W, H,
    `<rect x="0" y="450" width="800" height="110" fill="#DB9A1F"/>
<g transform="translate(130 40)"><rect width="540" height="370" rx="16" fill="#fff"/>
${[['Went well', C.green], ['Could improve', C.red], ['Try next', C.blue]].map(([t, col], i) => `<g transform="translate(${18 + i * 170} 18)"><rect width="156" height="34" rx="10" fill="${col}"/><text x="78" y="22" text-anchor="middle" font-size="13" font-weight="700" fill="#fff">${t}</text>${[0, 1, 2].map((j) => `<g transform="translate(0 ${48 + j * 100})"><rect class="pop p${((i + j) % 6) + 1}" width="156" height="88" rx="8" fill="${[C.amber, C.pink, C.mint][(i + j) % 3]}"/><rect x="14" y="18" width="${[110, 90, 120][(i + j) % 3]}" height="8" rx="4" fill="${C.ink}" opacity=".55"/><rect x="14" y="36" width="${[80, 112, 70][(i * 2 + j) % 3]}" height="8" rx="4" fill="${C.ink}" opacity=".3"/><rect x="14" y="54" width="60" height="8" rx="4" fill="${C.ink}" opacity=".2"/></g>`).join('')}</g>`).join('')}</g>
${person(70, 450, { s: 1.1, skin: SKIN[3], shirt: C.white, hair: C.ink, style: 'curly', pose: 'phone', legs: true, pants: C.indigo })}
${person(735, 450, { s: 1.1, skin: SKIN[0], shirt: C.violet, hair: '#C26A2E', style: 'bun', pose: 'raise', legs: true, pants: C.ink })}
${sparkle(40, 60, 14, C.white)}${sparkle(760, 100, 11, C.white, 'tw b')}`,
    C.amber),

  // a community hall: bunting, people with raised phones and hands, a hall-wide vote
  community: () => svg(W, H,
    `<path d="M0 40 Q400 110 800 40" stroke="${C.ink}" stroke-width="3" fill="none" opacity=".4"/>
${Array.from({ length: 13 }, (_, i) => { const x = 30 + i * 60; const y = 40 + Math.sin((i / 12) * Math.PI) * 52 + 4; return `<path class="bob ${['', 'b', 'c'][i % 3]}" d="M${x} ${y} l22 0 l-11 30z" fill="${[C.amber, C.white, C.blue, C.mint, C.violet][i % 5]}"/>`; }).join('')}
<g transform="translate(240 96)"><rect width="320" height="130" rx="16" fill="#fff"/><text x="22" y="34" font-size="17" font-weight="700" fill="${C.ink}">Should we open on Saturdays?</text><rect class="bar d1" x="22" y="52" width="230" height="20" rx="7" fill="${C.green}"/><rect class="bar d2" x="22" y="82" width="110" height="20" rx="7" fill="${C.pink}"/><text x="262" y="68" font-size="13" font-weight="700" fill="${C.ink}">68%</text></g>
${person(110, 606, { s: 1.4, skin: SKIN[2], shirt: C.white, hair: C.ink, style: 'long', pose: 'cheer' })}
${person(270, 606, { s: 1.4, skin: SKIN[0], shirt: C.coral, hair: '#6B3A1E', style: 'short', pose: 'raise', bob: 'b' })}
${person(430, 606, { s: 1.4, skin: SKIN[3], shirt: C.sky, hair: C.ink, style: 'curly', pose: 'phone', bob: 'c' })}
${person(580, 606, { s: 1.4, skin: SKIN[1], shirt: C.amber, hair: C.ink, style: 'bun', pose: 'raise' })}
${person(715, 606, { s: 1.4, skin: SKIN[4], shirt: C.violet, hair: C.ink, style: 'short', pose: 'cheer', bob: 'b' })}
${heart(190, 300, 1.5, C.red)}${heart(500, 310, 1.3, C.white, 'rise b')}${heart(660, 300, 1.6, C.amber, 'rise c')}${sparkle(60, 230, 13, C.white)}${sparkle(740, 220, 11, C.ink, 'tw b')}`,
    C.pink),
};

// ---- small animated shapes for the "what you can do" rows ---------------------------------------------------

const spots = {
  ask: () => svg(200, 200,
    `<g class="float"><rect x="22" y="26" width="104" height="82" rx="20" fill="${C.green}"/><path d="M44 106 l-4 34 l32 -30z" fill="${C.green}"/></g>
<g class="float b"><rect x="76" y="86" width="104" height="82" rx="20" fill="${C.mint}"/><path d="M150 166 l8 28 l-30 -26z" fill="${C.mint}"/><g transform="translate(128 127)"><circle class="dot" cx="-22" cy="0" r="6" fill="${C.teal}"/><circle class="dot b" cx="0" cy="0" r="6" fill="${C.teal}"/><circle class="dot c" cx="22" cy="0" r="6" fill="${C.teal}"/></g></g>`),
  quiz: () => svg(200, 200,
    `<g class="spin"><path d="M100 14 L116 40 L146 32 L148 62 L178 70 L164 98 L184 122 L158 138 L162 168 L132 166 L116 190 L100 172 L84 190 L68 166 L38 168 L42 138 L16 122 L36 98 L22 70 L52 62 L54 32 L84 40Z" fill="${C.amber}"/></g><circle cx="100" cy="100" r="42" fill="#FFE08A"/><path class="tw" d="M80 102 L95 117 L124 84" stroke="${C.ink}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`),
  rank: () => svg(200, 200,
    Array.from({ length: 5 }, (_, r) => Array.from({ length: 5 }, (_, c) => `<circle class="pop" style="animation-delay:${((r + c) * 0.18).toFixed(2)}s;animation-duration:3.2s" cx="${30 + c * 35}" cy="${30 + r * 35}" r="14" fill="${[C.pink, '#FF9CC0'][(r + c) % 2]}"/>`).join('')).join('')),
  discuss: () => svg(200, 200,
    `<g class="float c"><circle cx="76" cy="84" r="52" fill="${C.blue}"/><path d="M34 118 l-16 40 l48 -26z" fill="${C.blue}"/></g>
<g class="float"><rect x="62" y="64" width="116" height="82" rx="30" fill="${C.pink}"/><path d="M148 142 l24 38 l-48 -28z" fill="${C.pink}"/><g transform="translate(120 105)"><circle class="dot" cx="-26" cy="0" r="8" fill="#fff"/><circle class="dot b" cx="0" cy="0" r="8" fill="#fff"/><circle class="dot c" cx="26" cy="0" r="8" fill="#fff"/></g></g>`),
};

export const ART_ALT = {
  training: 'People in a meeting room answering a poll on their phones while the results grow on the screen',
  education: 'Students in a lecture hall answering a quiz question on their phones while the lecturer points at the screen',
  events: 'A speaker on a conference stage next to a wall of audience questions, with the crowd holding up phones',
  'people-teams': 'A team sending anonymous questions and hearts in speech bubbles during an all-hands',
  consulting: 'Two facilitators at a whiteboard 2x2 grid with dots landing in each quadrant',
  webinars: 'A laptop showing a video call with a shared poll, and a phone with an answer screen beside it',
  retrospectives: 'A retrospective board with three columns of sticky notes appearing, and two teammates beside it',
  community: 'A community hall with bunting, people raising hands and phones, and a vote result on a screen',
};

// path (inside dist/) -> svg text
export function buildArt() {
  const out = {};
  for (const [name, fn] of Object.entries(scenes)) out[`art/${name}.svg`] = fn();
  for (const [name, fn] of Object.entries(spots)) out[`art/spot-${name}.svg`] = fn();
  return out;
}
