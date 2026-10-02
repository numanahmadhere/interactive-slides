import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RealtimeClient } from '@supabase/realtime-js';
import { startRelay } from '../tools/relay.mjs';

// Two real realtime-js clients through the relay: the same client code the app
// ships, so this checks the way the app talks to a Realtime server.
test('broadcast reaches the other client on the same channel only', async () => {
  const relay = await startRelay({ port: 0, host: '127.0.0.1' });
  const url = `ws://127.0.0.1:${relay.port}/realtime/v1`;
  const make = () => new RealtimeClient(url, { params: { apikey: 'local' }, vsn: '1.0.0' });
  const a = make();
  const b = make();
  const c = make();
  try {
    const got = { b: [], c: [], a: [] };
    const join = (client, name, key) => new Promise((resolve, reject) => {
      const ch = client.channel(name, { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'm' }, (m) => got[key].push(m.payload));
      ch.subscribe((s) => { if (s === 'SUBSCRIBED') resolve(ch); else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') reject(new Error(s)); });
    });
    const [chA, , ] = await Promise.all([join(a, 'is-a-ABC234', 'a'), join(b, 'is-a-ABC234', 'b'), join(c, 'is-a-OTHER1', 'c')]);
    await chA.send({ type: 'broadcast', event: 'm', payload: { t: 'hello', cid: 'x' } });
    await new Promise((r) => setTimeout(r, 200));
    assert.deepEqual(got.b, [{ t: 'hello', cid: 'x' }]);
    assert.deepEqual(got.c, [], 'other channels hear nothing');
    assert.deepEqual(got.a, [], 'the sender does not hear itself');
  } finally {
    for (const client of [a, b, c]) client.disconnect();
    await relay.close();
  }
});
