// A shared deck, opened from a share link (?view=TOKEN). Read-only: the visitor
// gets the player, nothing from the editor, and needs no account.

import { Cloud } from './client.js';
import { normalizeDeck } from '../core/schema.js';
import { Player } from '../player/player.js';
import { showMessage } from '../shell/chrome.js';

export async function mountViewer(root, { token, config }) {
  showMessage(root, 'Loading the presentation...', '', null);
  try {
    const cloud = new Cloud({ url: config.url, key: config.key });
    const { deck } = normalizeDeck(await cloud.getShared(token)); // untrusted: the same gate as an import
    document.title = deck.meta.title;
    document.body.className = '';
    root.replaceChildren();
    return new Player(root, deck, { mode: 'present', syncHash: true });
  } catch (err) {
    if (err.code === 'not_found') showMessage(root, 'This presentation is not shared any more', 'The owner may have stopped sharing it.');
    else showMessage(root, 'Could not load this presentation', 'Check your connection and try again.', { href: location.href, label: 'Reload' });
    return null;
  }
}
