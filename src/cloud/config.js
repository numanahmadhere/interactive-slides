// The Supabase project used for accounts and cloud decks, kept in this browser.

import { cleanConfig } from '../live/protocol.js';
import { loadSettings } from '../live/config.js';

const KEY = 'interactive-slides:cloud-project';

// { url, key } or null. Falls back to the project already set for live sessions.
export function loadProject() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const clean = cleanConfig({ kind: 'realtime', url: raw?.url, key: raw?.key });
    if (clean) return { url: clean.url, key: clean.key };
  } catch { /* fall through */ }
  const live = loadSettings().config;
  return live.kind === 'realtime' ? { url: live.url, key: live.key } : null;
}

export function saveProject(project) {
  try {
    if (project) localStorage.setItem(KEY, JSON.stringify(project));
    else localStorage.removeItem(KEY);
  } catch { /* lasts until the page closes */ }
}

// Which cloud deck the open deck was saved as, so Save updates it. The link also
// remembers the deck's creation stamp: after an undo or a switch to another deck
// the stamp no longer matches and the link is ignored, so Save can never overwrite
// a cloud deck with a different one.
const LINK = 'interactive-slides:cloud-link';
export function getLink(deck) {
  try {
    const { id, createdAt } = JSON.parse(localStorage.getItem(LINK) ?? 'null') ?? {};
    return id && createdAt === deck?.meta?.createdAt ? id : null;
  } catch {
    return null;
  }
}
export function setLink(id, deck) {
  try {
    if (id && deck) localStorage.setItem(LINK, JSON.stringify({ id, createdAt: deck.meta.createdAt }));
    else localStorage.removeItem(LINK);
  } catch { /* nothing to do */ }
}
