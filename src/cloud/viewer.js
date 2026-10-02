// A shared deck, opened from a share link (?view=TOKEN). Read-only: the visitor
// gets the player, nothing from the editor, and needs no account.

import { Cloud } from './client.js';
import { normalizeDeck } from '../core/schema.js';
import { Player } from '../player/player.js';

export async function mountViewer(root, { token, config }) {
  root.textContent = 'Loading the presentation...';
  try {
    const cloud = new Cloud({ url: config.url, key: config.key });
    const { deck } = normalizeDeck(await cloud.getShared(token)); // untrusted: the same gate as an import
    document.title = deck.meta.title;
    root.replaceChildren();
    return new Player(root, deck, { mode: 'present', syncHash: true });
  } catch (err) {
    root.textContent = err.code === 'not_found' ? 'This presentation is not shared any more.' : 'Could not load this presentation. Check your connection and try again.';
    return null;
  }
}
