// Light / dark / follow the system. The choice is remembered in this browser and
// applied before the page paints (see the one-line script in each page's head).

const KEY = 'interactive-slides:theme';
export const THEME_INIT_SNIPPET = "try{var t=localStorage.getItem('interactive-slides:theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}";

export function themePref() {
  try {
    const t = localStorage.getItem(KEY);
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}

export function setThemePref(pref) {
  try {
    if (pref === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, pref);
  } catch { /* lasts for this page only */ }
  if (pref === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = pref;
}

// The scheme actually showing right now.
export const isDarkNow = () => (themePref() === 'system' ? matchMedia('(prefers-color-scheme: dark)').matches : themePref() === 'dark');
