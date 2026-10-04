// Where things live. The app is served under /app/ (every path there is the same
// page; src/app.js reads the address), the public site is plain pages at /.
export const APP_ROOT = '/app/';
export const DASHBOARD_PATH = '/app/';
export const ACCOUNT_PATH = '/app/account';
export const REPORTS_PATH = '/app/reports';
export const deckPath = (id) => `/app/d/${encodeURIComponent(id)}`;

// 'dashboard' | 'account' | 'editor' for a pathname; editor routes also return the deck id.
export function parseAppPath(pathname) {
  const path = pathname.replace(/\/+$/, '');
  if (path === '' || path === '/app') return { page: 'dashboard' };
  if (path === '/app/account') return { page: 'account' };
  if (path === '/app/reports') return { page: 'reports' };
  const m = /^\/app\/d\/([^/]+)$/.exec(path);
  if (m) {
    try { return { page: 'editor', deckId: decodeURIComponent(m[1]) }; } catch { return { page: 'notfound' }; }
  }
  return { page: 'notfound' };
}

// Sign-in links and Google send people back to one fixed page, /app/, so only that
// address has to be allowed in the Supabase project. We remember where they were.
const RETURN_KEY = 'interactive-slides:return-to';
export const signInReturnAddress = () => `${location.origin}${APP_ROOT}`;
export function rememberReturn(path = location.pathname + location.search) {
  try { sessionStorage.setItem(RETURN_KEY, path); } catch { /* sign-in still works; they land on the dashboard */ }
}
export function takeReturn() {
  try {
    const path = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    // Only our own app pages, never an address someone could smuggle in.
    return path && /^\/app\/[A-Za-z0-9_\-/%.]*(\?[\w=&%.-]*)?$/.test(path) ? path : null;
  } catch {
    return null;
  }
}
