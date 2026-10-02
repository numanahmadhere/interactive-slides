// The standalone player: what an exported deck runs. It reads the deck from a
// JSON script element, validates it the same way the editor does, and plays it.
// This file is bundled separately and embedded in the editor as a string.

import './styles/fonts.css';
import './styles/slides.css';
import './player/player.css';

import { normalizeDeck } from './core/schema.js';
import { Player } from './player/player.js';
import { openPresenterView } from './player/presenter-view.js';

const data = document.getElementById('deck-data');
const mount = document.getElementById('app');

try {
  const { deck } = normalizeDeck(JSON.parse(data.textContent));
  document.title = deck.meta.title;
  window.player = new Player(mount, deck, { onPresenterView: (p) => openPresenterView(p) });
} catch (err) {
  console.error(err);
  mount.textContent = 'This presentation could not be loaded.';
}
