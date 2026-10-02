// Themes are sets of design tokens exposed as CSS custom properties
// (--sp-bg, --sp-accent, ...). Decks pick a theme by id and may override
// individual tokens; overrides are validated because they end up in CSS.

const DARK_FONTS = {
  fontSans: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', sans-serif",
  fontMono: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace",
};

export const THEMES = {
  'densight-dark': {
    name: 'Densight Dark',
    mode: 'dark',
    tokens: {
      bg: '#0F1117', surface: '#181B25', fg: '#FFFFFF', muted: '#A3A9BD',
      accent: '#2020E8', accentFg: '#FFFFFF', accentText: '#8F8FFF',
      border: '#272B38', codeBg: '#151824', codeFg: '#E6E8F0', good: '#4ADE80', bad: '#F87171', ...DARK_FONTS,
    },
  },
  'densight-light': {
    name: 'Densight Light',
    mode: 'light',
    tokens: {
      bg: '#FFFFFF', surface: '#F8F9FB', fg: '#0F1117', muted: '#5B6173',
      accent: '#2020E8', accentFg: '#FFFFFF', accentText: '#2020E8',
      border: '#E3E6EE', codeBg: '#F3F4F8', codeFg: '#1B1E2B', good: '#15803D', bad: '#B91C1C', ...DARK_FONTS,
    },
  },
  paper: {
    name: 'Paper',
    mode: 'light',
    tokens: {
      bg: '#FAF8F4', surface: '#F1EDE4', fg: '#1C1B1A', muted: '#6B6760',
      accent: '#B4441F', accentFg: '#FFFFFF', accentText: '#B4441F',
      border: '#E2DCCF', codeBg: '#F1EDE4', codeFg: '#2A2826', good: '#2F7D4F', bad: '#B42318', ...DARK_FONTS,
    },
  },
  midnight: {
    name: 'Midnight',
    mode: 'dark',
    tokens: {
      bg: '#0B1220', surface: '#121B2E', fg: '#F1F5F9', muted: '#94A3B8',
      accent: '#38BDF8', accentFg: '#0B1220', accentText: '#38BDF8',
      border: '#22304A', codeBg: '#0F1829', codeFg: '#E2E8F0', good: '#4ADE80', bad: '#FB7185', ...DARK_FONTS,
    },
  },
};

export const DEFAULT_THEME = 'densight-dark';

const COLOR_KEYS = ['bg', 'surface', 'fg', 'muted', 'accent', 'accentFg', 'accentText', 'border', 'codeBg', 'codeFg', 'good', 'bad'];
const FONT_KEYS = ['fontSans', 'fontMono'];

const COLOR_RE = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(?:rgb|hsl)a?\(\s*[\d.%\s,/-]+\))$/i;
const FONT_RE = /^[\w\s,'"-]{1,200}$/;

function cssVarName(key) {
  return '--sp-' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
}

export function listThemes() {
  return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name, mode: t.mode, tokens: t.tokens }));
}

// Returns a clean { id, overrides } and reports what was repaired via warn().
export function normalizeThemeRef(raw, warn = () => {}) {
  const ref = raw && typeof raw === 'object' ? raw : {};
  let id = typeof ref.id === 'string' ? ref.id : DEFAULT_THEME;
  if (!THEMES[id]) {
    warn(`unknown theme "${id}", using ${DEFAULT_THEME}`);
    id = DEFAULT_THEME;
  }
  const overrides = {};
  const given = ref.overrides && typeof ref.overrides === 'object' ? ref.overrides : {};
  for (const [key, value] of Object.entries(given)) {
    const ok = COLOR_KEYS.includes(key) ? COLOR_RE.test(String(value))
      : FONT_KEYS.includes(key) ? FONT_RE.test(String(value))
      : false;
    if (ok) overrides[key] = String(value);
    else warn(`theme override "${key}" ignored`);
  }
  return { id, overrides };
}

export function themeVars(ref) {
  const { id, overrides } = normalizeThemeRef(ref);
  const tokens = { ...THEMES[id].tokens, ...overrides };
  const vars = {};
  for (const [key, value] of Object.entries(tokens)) vars[cssVarName(key)] = value;
  return vars;
}

export function applyTheme(el, ref) {
  for (const [name, value] of Object.entries(themeVars(ref))) el.style.setProperty(name, value);
  el.dataset.themeMode = THEMES[normalizeThemeRef(ref).id].mode;
}

// ---- colour maths and the theme builder -----------------------------------

export const isColor = (value) => COLOR_RE.test(String(value));

// "#rgb", "#rrggbb", "rgb(...)", "hsl(...)" (alpha ignored) -> [r, g, b] or null
export function parseColor(input) {
  const s = String(input ?? '').trim();
  let m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  }
  m = /^rgba?\(\s*([\d.]+)%?[\s,]+([\d.]+)%?[\s,]+([\d.]+)%?/i.exec(s);
  if (m) return [m[1], m[2], m[3]].map((v) => Math.min(255, Math.max(0, Math.round(parseFloat(v)))));
  m = /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%/i.exec(s);
  if (m) {
    const [h, sat, light] = [parseFloat(m[1]) % 360, parseFloat(m[2]) / 100, parseFloat(m[3]) / 100];
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(light, 1 - light);
    const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
  }
  return null;
}

export const toHex = ([r, g, b]) => `#${[r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

// WCAG relative luminance and contrast ratio.
export function luminance([r, g, b]) {
  const lin = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// t of the way from a to b
export const mixColors = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

const WHITE = [255, 255, 255];
const INK = [15, 17, 23];

// Text, surface and border tokens that read well on a background colour. The
// text colour is whichever of white and near-black contrasts more, and the muted
// tone is as soft as it can be while still reaching 4.5:1 where the background
// allows it.
export function surfaceTokens(bg) {
  const dark = contrastRatio(WHITE, bg) >= contrastRatio(INK, bg);
  const fg = dark ? WHITE : INK;
  let muted = fg;
  for (let t = 0.4; t >= 0.04; t -= 0.04) {
    const candidate = mixColors(fg, bg, t);
    if (contrastRatio(candidate, bg) >= 4.5) {
      muted = candidate;
      break;
    }
  }
  return {
    dark,
    fg: toHex(fg),
    muted: toHex(muted),
    surface: toHex(mixColors(bg, fg, 0.07)),
    border: toHex(mixColors(bg, fg, 0.16)),
    codeBg: toHex(mixColors(bg, fg, 0.05)),
    codeFg: toHex(fg),
  };
}

// A complete set of colour overrides from just an accent and a background.
// Every text pairing it produces meets WCAG AA (4.5:1).
export function buildThemeTokens({ accent, bg }) {
  const bgRgb = parseColor(bg);
  const accRgb = parseColor(accent);
  if (!bgRgb || !accRgb) return null;
  const base = surfaceTokens(bgRgb);

  const accentFg = contrastRatio(accRgb, WHITE) >= contrastRatio(accRgb, INK) ? WHITE : INK;
  // Accent used as text (links, markers) must be readable on the background.
  let accentText = accRgb;
  const toward = base.dark ? WHITE : [0, 0, 0];
  for (let i = 0; i < 14 && contrastRatio(accentText, bgRgb) < 4.5; i++) accentText = mixColors(accentText, toward, 0.1);

  return {
    bg: toHex(bgRgb), accent: toHex(accRgb), accentFg: toHex(accentFg), accentText: toHex(accentText),
    fg: base.fg, muted: base.muted, surface: base.surface, border: base.border, codeBg: base.codeBg, codeFg: base.codeFg,
    good: base.dark ? '#4ADE80' : '#15803D', bad: base.dark ? '#F87171' : '#B91C1C',
  };
}

// CSS variables that keep text readable on a slide with its own background.
export function backgroundVars(bgColor) {
  const rgb = parseColor(bgColor);
  if (!rgb) return {};
  const t = surfaceTokens(rgb);
  return { '--sp-fg': t.fg, '--sp-muted': t.muted, '--sp-surface': t.surface, '--sp-border': t.border, '--sp-code-bg': t.codeBg, '--sp-code-fg': t.codeFg };
}

export const IMAGE_BACKGROUND_VARS = {
  '--sp-fg': '#FFFFFF', '--sp-muted': 'rgb(255 255 255 / 0.82)', '--sp-surface': 'rgb(0 0 0 / 0.35)',
  '--sp-border': 'rgb(255 255 255 / 0.28)', '--sp-accent-text': '#FFFFFF',
};
