// A tiny stand-in for Supabase Realtime, for trying live features on your own
// network (phones on the same Wi-Fi) or in tests. It speaks just enough of the
// Phoenix channel protocol (v1 JSON frames) for broadcast channels: join, leave,
// heartbeat and "broadcast" fan-out. Nothing is stored. No authentication: run it
// on a network you trust.
//
//   node tools/relay.mjs [port]      default port 5199

import { WebSocketServer } from 'ws';
import { pathToFileURL } from 'node:url';

export function startRelay({ port = 5199, host = '0.0.0.0' } = {}) {
  const topics = new Map(); // topic -> Set(socket)
  const wss = new WebSocketServer({ port, host });

  const reply = (ws, msg, status, response = {}) => ws.send(JSON.stringify({
    topic: msg.topic, event: 'phx_reply', ref: msg.ref, join_ref: msg.join_ref, payload: { status, response },
  }));

  wss.on('connection', (ws) => {
    const joined = new Set();
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (!msg || typeof msg.topic !== 'string') return;

      if (msg.event === 'phx_join') {
        if (!topics.has(msg.topic)) topics.set(msg.topic, new Set());
        topics.get(msg.topic).add(ws);
        joined.add(msg.topic);
        reply(ws, msg, 'ok', { postgres_changes: [] });
      } else if (msg.event === 'phx_leave') {
        topics.get(msg.topic)?.delete(ws);
        joined.delete(msg.topic);
        reply(ws, msg, 'ok');
      } else if (msg.event === 'heartbeat') {
        reply(ws, msg, 'ok');
      } else if (msg.event === 'broadcast') {
        if (!joined.has(msg.topic)) return;
        const out = JSON.stringify({ topic: msg.topic, event: 'broadcast', payload: msg.payload, ref: null });
        for (const peer of topics.get(msg.topic) ?? []) if (peer !== ws && peer.readyState === 1) peer.send(out);
        if (msg.ref) reply(ws, msg, 'ok');
      } else if (msg.ref) {
        reply(ws, msg, 'ok'); // access_token and the like
      }
    });
    ws.on('close', () => {
      for (const topic of joined) {
        const set = topics.get(topic);
        set?.delete(ws);
        if (set && !set.size) topics.delete(topic);
      }
    });
  });

  return new Promise((resolve) => wss.on('listening', () => resolve({
    port: wss.address().port,
    close: () => new Promise((done) => { for (const c of wss.clients) c.terminate(); wss.close(() => done()); }),
  })));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const port = Number(process.argv[2]) || 5199;
  const relay = await startRelay({ port });
  console.log(`Relay listening on port ${relay.port}`);
  console.log(`In the app use: http://<this computer's address>:${relay.port}  with any key, e.g. "local"`);
}
