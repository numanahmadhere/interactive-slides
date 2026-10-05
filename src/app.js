/* global __DEV__ */
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/slides.css';
import './player/player.css';
import './editor/editor.css';
import './styles/app.css';
import './live/live.css';
import './shell/shell.css';

import { normalizeDeck } from './core/schema.js';
import { Player } from './player/player.js';
import { PresenterView } from './player/presenter-view.js';
import { sampleDeck } from './samples/sample-deck.js';
import { interactiveDeck } from './samples/interactive-deck.js';
import { h } from './core/dom.js';
import { Editor } from './editor/editor.js';
import { setupOffline } from './offline.js';
import { decodeConfig, normalizeCode, normalizeKey } from './live/protocol.js';
import { mountAudience } from './live/audience.js';
import { mountRemote } from './live/remote.js';
import { mountViewer } from './cloud/viewer.js';
import { defaultConfig } from './live/config.js';
import { getCloud } from './cloud/instance.js';
import { toast } from './editor/ui.js';
import { parseAppPath, takeReturn, DASHBOARD_PATH } from './shell/paths.js';
import { takeFlash } from './shell/flash.js';
import { mountDashboard } from './shell/dashboard.js';
import { mountAccount } from './shell/account.js';
import { mountReports } from './shell/reports.js';
import { showMessage } from './shell/chrome.js';

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
  if (!token || liveConfig?.kind !== 'realtime') showMessage(mount, 'This link is not valid', 'Ask the person who shared it for a new one.');
  else mountViewer(mount, { token, config: liveConfig });
} else if (params.has('join') || params.has('remote')) {
  const ok = liveConfig && (params.has('join') ? audienceCode : remoteKey);
  if (!ok) showMessage(mount, 'This link is not valid', 'Ask the presenter for a new one.');
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
  // The platform: /app/ (decks), /app/account, /app/d/<id> (the editor).
  const route = parseAppPath(location.pathname);

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
    // Put them back where they were before signing in.
    const back = notice && !notice.kind ? takeReturn() : null;
    if (back && back !== location.pathname + location.search) {
      const { setFlash } = await import('./shell/flash.js');
      setFlash(notice.text);
      location.replace(back);
      return 'redirecting';
    }
    return notice ?? null;
  };

  const notFound = (text) => showMessage(mount, text, '', { href: DASHBOARD_PATH, label: 'Go to My decks' });

  finishSignIn().then(async (notice) => {
    if (notice === 'redirecting') return;
    // Building needs a free account. The deck list, the editor and reports sit behind a sign-in screen;
    // the account page is where signing in happens, and audience pages, share links and the demo are open.
    const cloudNow = getCloud();
    const needsAccount = ['dashboard', 'editor', 'reports'].includes(route.page);
    // A live build with no account system set up must not quietly let everyone in; only local development does.
    if (!cloudNow && needsAccount && !__DEV__) {
      showMessage(mount, 'Sign-in is unavailable', 'Accounts are not reachable right now, so decks cannot be opened. Please try again shortly.', { href: '/', label: 'Back to home' });
      return;
    }
    if (cloudNow && !cloudNow.user && needsAccount) {
      const { mountGate } = await import('./shell/gate.js');
      mountGate(mount, cloudNow, { template: params.get('template') });
      return;
    }
    if (route.page === 'editor') {
      const editor = new Editor(mount, route.deckId);
      window.editor = editor; // handy for debugging in the console
      try {
        await editor.start();
      } catch (err) {
        if (err.code === 'not_found') return notFound('That deck is not on this device');
        throw err;
      }
      const flash = notice ?? takeFlash();
      if (flash) toast(flash.text, { kind: flash.kind ?? 'info', timeout: 7000 });
      return;
    }
    document.body.className = 'sh';
    if (notice) { const { setFlash } = await import('./shell/flash.js'); setFlash(notice.text, notice.kind); }
    if (route.page === 'dashboard') await mountDashboard(mount);
    else if (route.page === 'account') await mountAccount(mount);
    else if (route.page === 'reports') await mountReports(mount);
    else notFound('Page not found');
  }).catch((err) => {
    console.error(err);
    showMessage(mount, 'Something went wrong', 'The app could not start. Reload the page; if it keeps happening, your browser may be blocking storage.', { href: '/app/', label: 'Try again' });
  });
}

setupOffline();
