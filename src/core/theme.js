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
      border: '#272B38', codeBg: '#151824', codeFg: '#E6E8F0', ...DARK_FONTS,
    },
  },
  'densight-light': {
    name: 'Densight Light',
    mode: 'light',
    tokens: {
      bg: '#FFFFFF', surface: '#F8F9FB', fg: '#0F1117', muted: '#5B6173',
      accent: '#2020E8', accentFg: '#FFFFFF', accentText: '#2020E8',
      border: '#E3E6EE', codeBg: '#F3F4F8', codeFg: '#1B1E2B', ...DARK_FONTS,
    },
  },
  paper: {
    name: 'Paper',
    mode: 'light',
    tokens: {
      bg: '#FAF8F4', surface: '#F1EDE4', fg: '#1C1B1A', muted: '#6B6760',
      accent: '#B4441F', accentFg: '#FFFFFF', accentText: '#B4441F',
      border: '#E2DCCF', codeBg: '#F1EDE4', codeFg: '#2A2826', ...DARK_FONTS,
    },
  },
  midnight: {
    name: 'Midnight',
    mode: 'dark',
    tokens: {
      bg: '#0B1220', surface: '#121B2E', fg: '#F1F5F9', muted: '#94A3B8',
      accent: '#38BDF8', accentFg: '#0B1220', accentText: '#38BDF8',
      border: '#22304A', codeBg: '#0F1829', codeFg: '#E2E8F0', ...DARK_FONTS,
    },
  },
};

export const DEFAULT_THEME = 'densight-dark';

const COLOR_KEYS = ['bg', 'surface', 'fg', 'muted', 'accent', 'accentFg', 'accentText', 'border', 'codeBg', 'codeFg'];
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
