// The Claude connector part of the account page: make a secret link, paste it into Claude, and Claude can build
// decks in this account. Only a hash of the link is stored, so the link can be shown just once, here.

import { h } from '../core/dom.js';
import { button, toast } from '../editor/ui.js';
import { sha256Hex } from '../connector/supabase-store.js';

// 32 random bytes as 43 URL-safe characters.
export function newConnectorToken() {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export const connectorUrl = (token, origin = location.origin) => `${origin}/api/mcp/${token}`;

const day = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }); };

// info: from cloud.connectorInfo(). shown: a link made a moment ago, which is the only time it can be seen.
export function connectorSection({ cloud, info, shown, run, rerender }) {
  if (info === undefined) return null; // this project has not run the connector part of schema.sql
  const out = [h('h2', { text: 'Claude connector' }),
    h('p', { text: 'Connect Claude to your account and ask it to build presentations for you. It adds finished decks to My decks, with questions your audience can answer live.' })];

  if (shown) {
    const input = h('input', { class: 'ed-input', type: 'text', readonly: 'true', value: shown, 'aria-label': 'Your connector link', onfocus: (e) => e.target.select() });
    out.push(
      h('div', { class: 'ed-live__url' }, input),
      h('div', { class: 'ed-live__actions' }, button({ label: 'Copy link', variant: 'primary', onClick: async () => {
        try { await navigator.clipboard.writeText(shown); toast('Link copied.'); } catch { input.select(); toast('Press Ctrl+C or Cmd+C to copy.'); }
      } })),
      h('p', { class: 'ed-hint ed-hint--warn', text: 'This link is a password. Anyone who has it can add and change decks in your account. It is shown only now, so copy it before you leave this page. If it gets out, make a new one and the old one stops working.' }),
      h('ol', { class: 'sh-steps' },
        h('li', { text: 'In Claude, open Settings, then Connectors.' }),
        h('li', { text: 'Choose Add custom connector, name it Densight Slides, and paste the link as its address.' }),
        h('li', { text: 'In a chat, turn the connector on and ask: "Make me a 10 slide deck about ... with a poll and a quiz."' })));
  } else if (info) {
    out.push(h('p', { class: 'ed-hint', text: `A connector link is active. Made ${day(info.created_at)}${info.last_used_at ? `, last used ${day(info.last_used_at)}` : ', not used yet'}. For safety it cannot be shown again.` }));
  }

  const actions = [button({ label: info ? 'Make a new link' : 'Make my connector link', variant: info ? undefined : 'primary', onClick: run('Making your link...', async () => {
    if (info && !confirm('Make a new link? The old one stops working straight away, so Claude needs the new one.')) return;
    const token = newConnectorToken();
    await cloud.setConnectorKey(await sha256Hex(token));
    await rerender(connectorUrl(token));
  }) })];
  if (info) actions.push(button({ label: 'Turn off', variant: 'danger', onClick: run('Turning off...', async () => {
    if (!confirm('Turn the connector off? Claude will no longer be able to reach your account. Decks it already made stay.')) return;
    await cloud.removeConnectorKey();
    await rerender(null);
  }) }));
  out.push(h('div', { class: 'ed-live__actions' }, ...actions));
  return h('section', { class: 'sh-section' }, ...out);
}
