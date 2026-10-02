// How messages travel. A transport opens named channels; a channel sends JSON
// to everyone else on it and calls onMessage for what others send.
//
//   local      BroadcastChannel: other tabs of this browser only (try it out, no setup)
//   realtime   a Supabase Realtime project, or tools/relay.mjs on your own network;
//              both speak the same protocol, so this one code path serves both

import { RealtimeClient } from '@supabase/realtime-js';

const EVENT = 'm';

class LocalChannel {
  constructor(name, { onMessage, onStatus }) {
    this.bc = new BroadcastChannel(`interactive-slides:${name}`);
    this.bc.onmessage = (e) => onMessage(e.data);
    queueMicrotask(() => onStatus('connected'));
  }

  send(message) {
    this.bc.postMessage(message);
  }

  close() {
    this.bc.close();
  }
}

class RealtimeChannel {
  constructor(client, name, { onMessage, onStatus }) {
    this.channel = client.channel(name, { config: { broadcast: { self: false, ack: false } } });
    this.channel.on('broadcast', { event: EVENT }, (msg) => onMessage(msg.payload));
    this.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') onStatus('connected');
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus('error');
      else if (status === 'CLOSED') onStatus('closed');
    });
  }

  send(message) {
    this.channel.send({ type: 'broadcast', event: EVENT, payload: message });
  }

  close() {
    this.channel.unsubscribe();
  }
}

// config is a cleaned connection setting (see protocol.js cleanConfig).
export function createTransport(config) {
  if (config.kind === 'local') {
    return { open: (name, handlers) => new LocalChannel(name, handlers), close() {} };
  }
  const endpoint = `${config.url.replace(/^http/i, 'ws')}/realtime/v1`;
  // vsn 1.0.0 is plain JSON frames, which Supabase accepts and the relay can read.
  const client = new RealtimeClient(endpoint, { params: { apikey: config.key }, vsn: '1.0.0', heartbeatIntervalMs: 20000 });
  client.connect();
  return {
    open: (name, handlers) => new RealtimeChannel(client, name, handlers),
    close() {
      client.disconnect();
    },
  };
}
