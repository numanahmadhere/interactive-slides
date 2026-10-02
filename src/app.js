import './styles/fonts.css';
import './styles/slides.css';
import './player/player.css';
import './editor/editor.css';
import './styles/app.css';

import { normalizeDeck } from './core/schema.js';
import { Player } from './player/player.js';
import { PresenterView } from './player/presenter-view.js';
import { sampleDeck } from './samples/sample-deck.js';
import { interactiveDeck } from './samples/interactive-deck.js';
import { Editor } from './editor/editor.js';
import { setupOffline } from './offline.js';

const mount = document.getElementById('app');
const params = new URLSearchParams(location.search);

if (params.has('play')) {
  // Player-only shell: ?play[&deck=interactive][&theme=paper][&aspect=4:3][&transition=zoom]
  const raw = structuredClone(params.get('deck') === 'interactive' ? interactiveDeck : sampleDeck);
  if (params.has('theme')) raw.theme = { id: params.get('theme') };
  if (params.has('aspect')) raw.aspect = params.get('aspect');
  if (params.has('transition')) raw.transition = params.get('transition');
  const { deck, warnings } = normalizeDeck(raw);
  if (warnings.length) console.warn('Deck warnings:', warnings);
  window.deck = deck;
  window.player = new Player(mount, deck);
  Object.assign(window, { Player, PresenterView, normalizeDeck }); // handles for poking at the player from the console
} else {
  const editor = new Editor(mount);
  window.editor = editor; // handy for debugging in the console
  editor.start().catch((err) => {
    console.error(err);
    mount.textContent = 'The editor failed to start. See the console for details.';
  });
}

setupOffline();
