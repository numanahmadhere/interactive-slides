import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeClient } from '@supabase/realtime-js';
import { startRelay } from '../tools/relay.mjs';
import { createTransport } from '../src/live/transport.js';
import { LiveHost } from '../src/live/host.js';
import { newRoom, audienceChannel, cleanAudienceState } from '../src/live/protocol.js';
import { normalizeDeck } from '../src/core/schema.js';

// A whole audience: every phone has its own connection, joins, says hello and votes
// at about the same moment. The presenter's totals must be exact and every phone
// must end up seeing them.

const PHONES = 150;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test(`${PHONES} phones voting at once: exact totals, everyone sees them`, async () => {
  const relay = await startRelay({ port: 0, host: '127.0.0.1' });
  const config = { kind: 'realtime', url: `http://127.0.0.1:${relay.port}`, key: 'k' };
  const { deck } = normalizeDeck({ slides: [{ id: 's1', layout: 'content', blocks: [
    { id: 'poll1', type: 'poll', slot: 'body', props: { question: 'Q', options: [{ text: 'A' }, { text: 'B' }, { text: 'C' }] } },
  ] }] });
  const room = newRoom();
  const host = new LiveHost({ transport: createTransport(config), room, title: 'Load', plan: 'pro' });
  host.start();
  const listeners = new Set();
  host.attach({
    deck, state: { slide: 0, step: 0 }, nav: { stepCounts: [0] }, next() {}, prev() {}, first() {}, last() {},
    subscribe: (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
  });
  const phones = [];
  try {
    await wait(300);
    const t0 = Date.now();
    // connect everyone
    await Promise.all(Array.from({ length: PHONES }, (_, i) => new Promise((resolve, reject) => {
      const client = new RealtimeClient(`ws://127.0.0.1:${relay.port}/realtime/v1`, { params: { apikey: 'k' }, vsn: '1.0.0' });
      const phone = { i, client, last: null };
      const ch = client.channel(audienceChannel(room.code), { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'm' }, (m) => { const s = cleanAudienceState(m.payload); if (s) phone.last = s; });
      ch.subscribe((s) => {
        if (s === 'SUBSCRIBED') { phone.ch = ch; phones.push(phone); resolve(); } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(`phone ${i}: ${s}`));
      });
    })));
    const connectedMs = Date.now() - t0;
    // everyone says hello and votes (A for even numbers, B for every third, C otherwise)
    const pick = (i) => (i % 2 === 0 ? 0 : i % 3 === 0 ? 1 : 2);
    await Promise.all(phones.map(async (p) => {
      await p.ch.send({ type: 'broadcast', event: 'm', payload: { t: 'hello', cid: `u${p.i}` } });
      await p.ch.send({ type: 'broadcast', event: 'm', payload: { t: 'vote', cid: `u${p.i}`, id: 'poll1', picks: [pick(p.i)] } });
    }));
    await wait(1200); // the host batches its updates
    const expected = [0, 0, 0];
    for (let i = 0; i < PHONES; i++) expected[pick(i)]++;

    assert.deepEqual(host.counts('poll1', 3), expected, 'the presenter has every vote exactly once');
    assert.equal(host.voters('poll1'), PHONES);
    assert.equal(host.audienceSize, PHONES);
    const seen = phones.filter((p) => JSON.stringify(p.last?.counts?.poll1) === JSON.stringify(expected)).length;
    assert.equal(seen, PHONES, 'every phone sees the final totals');

    // people change their minds: the first 30 switch to option C
    await Promise.all(phones.slice(0, 30).map((p) => p.ch.send({ type: 'broadcast', event: 'm', payload: { t: 'vote', cid: `u${p.i}`, id: 'poll1', picks: [2] } })));
    await wait(900);
    const after = [0, 0, 0];
    for (let i = 0; i < PHONES; i++) after[i < 30 ? 2 : pick(i)]++;
    assert.deepEqual(host.counts('poll1', 3), after, 'changed votes replace the old ones');
    assert.equal(host.voters('poll1'), PHONES, 'still one vote per phone');
    console.log(`  ${PHONES} phones connected in ${connectedMs} ms; totals exact`);
  } finally {
    for (const p of phones) p.client.disconnect();
    host.stop();
    await relay.close();
  }
});
