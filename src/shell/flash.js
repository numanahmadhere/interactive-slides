// A one-line message that survives a page change ("Deck imported", "Signed in").
const KEY = 'interactive-slides:flash';
export function setFlash(text, kind = 'info') {
  try { sessionStorage.setItem(KEY, JSON.stringify({ text, kind })); } catch { /* the message is optional */ }
}
export function takeFlash() {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    const f = JSON.parse(raw ?? 'null');
    return f && typeof f.text === 'string' ? { text: f.text.slice(0, 200), kind: f.kind === 'error' ? 'error' : 'info' } : null;
  } catch {
    return null;
  }
}
