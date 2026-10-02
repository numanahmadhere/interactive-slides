import './styles/fonts.css';
import './styles/slides.css';
import './player/player.css';
import './styles/app.css';

import { normalizeDeck } from './core/schema.js';
import { Player } from './player/player.js';
import { sampleDeck } from './samples/sample-deck.js';

// Phase 1 shell: plays the sample deck. ?theme=, ?aspect= and ?transition=
// override it so every theme and layout can be checked without an editor.
const params = new URLSearchParams(location.search);
const raw = structuredClone(sampleDeck);
if (params.has('theme')) raw.theme = { id: params.get('theme') };
if (params.has('aspect')) raw.aspect = params.get('aspect');
if (params.has('transition')) raw.transition = params.get('transition');

const { deck, warnings } = normalizeDeck(raw);
if (warnings.length) console.warn('Deck warnings:', warnings);

window.deck = deck;
window.player = new Player(document.getElementById('app'), deck);
