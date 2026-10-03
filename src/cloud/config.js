// The Supabase project used for accounts and cloud decks, kept in this browser.

import { cleanConfig } from '../live/protocol.js';
import { loadSettings } from '../live/config.js';
import { BUILT_IN_PROJECT } from './defaults.js';

const KEY = 'interactive-slides:cloud-project';

// { url, key } or null. Falls back to the project already set for live sessions.
export function loadProject() {
  if (BUILT_IN_PROJECT) return BUILT_IN_PROJECT;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const clean = cleanConfig({ kind: 'realtime', url: raw?.url, key: raw?.key });
    if (clean) return { url: clean.url, key: clean.key };
  } catch { /* fall through */ }
  const live = loadSettings().config;
  return live.kind === 'realtime' ? { url: live.url, key: live.key } : null;
}

export function saveProject(project) {
  if (BUILT_IN_PROJECT) return;
  try {
    if (project) localStorage.setItem(KEY, JSON.stringify(project));
    else localStorage.removeItem(KEY);
  } catch { /* lasts until the page closes */ }
}
