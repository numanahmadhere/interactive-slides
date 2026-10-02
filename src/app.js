import './styles/fonts.css';
import './styles/slides.css';
import './player/player.css';
import './editor/editor.css';
import './styles/app.css';
import './live/live.css';

import { normalizeDeck } from './core/schema.js';
import { Player } from './player/player.js';
import { PresenterView } from './player/presenter-view.js';
import { sampleDeck } from './samples/sample-deck.js';
import { interactiveDeck } from './samples/interactive-deck.js';
import { Editor } from './editor/editor.js';
import { setupOffline } from './offline.js';
import { decodeConfig, normalizeCode, normalizeKey } from './live/protocol.js';
import { mountAudience } from './live/audience.js';
import { mountRemote } from './live/remote.js';
import { mountViewer } from './cloud/viewer.js';
import { defaultConfig } from './live/config.js';
import { getCloud } from './cloud/instance.js';
import { toast } from './editor/ui.js';

const mount = document.getElementById('app');
const params = new URLSearchParams(location.search);

// Phone pages. The connection settings travel in the link (rt=...); with none, the
// try-it-here mode between tabs of this browser is used.
const liveConfig = params.has('rt') ? decodeConfig(params.get('rt')) : defaultConfig();
const audienceCode = normalizeCode(params.get('join'));
const remoteKey = normalizeKey(params.get('remote'));

if (params.has('view')) {
  // A share link: ?view=TOKEN&rt=... (the project's address and public key)
  const token = normalizeKey(params.get('view'));
  if (!token || liveConfig?.kind !== 'realtime') mount.textContent = 'This link is not valid. Ask the person who shared it for a new one.';
  else mountViewer(mount, { token, config: liveConfig });
} else if (params.has('join') || params.has('remote')) {
  const ok = liveConfig && (params.has('join') ? audienceCode : remoteKey);
  if (!ok) mount.textContent = 'This link is not valid. Ask the presenter for a new one.';
  else if (params.has('join')) mountAudience(mount, { code: audienceCode, config: liveConfig });
  else mountRemote(mount, { key: remoteKey, config: liveConfig });
} else if (params.has('play')) {
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

  // Coming back from "Continue with Google" or an emailed sign-in link: the session
  // is in the address. Finish signing in, then tidy the address.
  const finishSignIn = async () => {
    const cloud = getCloud();
    if (!cloud || !/(access_token|error_description)=/.test(location.hash)) return null;
    let notice;
    try {
      if (await cloud.consumeRedirect(location.hash)) notice = { text: `Signed in as ${cloud.user.email}. Your decks now save online.` };
    } catch (err) {
      notice = { text: err.message || 'Sign-in did not complete.', kind: 'error' };
    }
    history.replaceState(null, '', location.pathname + location.search);
    return notice ?? null;
  };

  // The session must be in place before the editor starts, so it knows who is signed in.
  finishSignIn().then((signInNotice) => editor.start().then(() => {
    if (signInNotice) toast(signInNotice.text, { kind: signInNotice.kind ?? 'info', timeout: 7000 });
  })).catch((err) => {
    console.error(err);
    mount.textContent = 'The editor failed to start. See the console for details.';
  });
}

setupOffline();
