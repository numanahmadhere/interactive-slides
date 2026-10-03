import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceWorkerSource, CACHE_PREFIX, SHELL_FILES } from '../src/sw-template.js';

// Runs the generated worker against a tiny fake of the service worker globals.
function boot(version, { existing = [], origin = 'https://example.test', network = async (req) => ({ from: 'network', url: req.url }), impatient = false } = {}) {
  const handlers = {};
  const stores = new Map(existing.map((name) => [name, new Map()]));
  const fetched = [];
  const cacheApi = {
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return { addAll: async (reqs) => { for (const r of reqs) store.set(new URL(r.url, origin + '/app/').pathname, r); }, store };
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    match: async (request, opts) => {
      for (const store of stores.values()) {
        const path = new URL(request.url).pathname;
        if (store.has(path)) return { from: 'cache', path, ignoreSearch: opts?.ignoreSearch };
      }
      return undefined;
    },
  };
  class Request { constructor(url, init = {}) { this.url = url; this.method = 'GET'; Object.assign(this, init); } }
  const state = { skipped: false, claimed: false };
  const self = {
    location: { origin },
    registration: { scope: origin + '/app/'.replace('app/', '') },
    addEventListener: (type, fn) => { handlers[type] = fn; },
    skipWaiting: async () => { state.skipped = true; },
    clients: { claim: async () => { state.claimed = true; } },
  };
  const fetchFn = async (req) => { fetched.push(req.url); return network(req); };
  const timer = impatient ? (fn) => queueMicrotask(fn) : setTimeout; // an impatient worker gives up on the network at once
  const ResponseStub = { error: () => ({ from: 'error' }) };
  new Function('self', 'caches', 'Request', 'fetch', 'URL', 'setTimeout', 'Response', serviceWorkerSource(version))(self, cacheApi, Request, fetchFn, URL, timer, ResponseStub);
  const run = async (type, event) => {
    let promise;
    await handlers[type]({ ...event, waitUntil: (p) => { promise = p; }, respondWith: (p) => { promise = p; } });
    return promise ? await promise : undefined;
  };
  return { run, stores, fetched, state, Request };
}

test('install caches the whole shell fresh from the network and takes over', async () => {
  const sw = boot('v1');
  await sw.run('install', {});
  const cache = sw.stores.get(`${CACHE_PREFIX}v1`);
  assert.equal(cache.size, SHELL_FILES.length);
  assert.ok([...cache.values()].every((r) => r.cache === 'reload'), 'bypasses the HTTP cache');
  assert.ok(sw.state.skipped);
});

test('activate removes older versions and nothing else', async () => {
  const sw = boot('v2', { existing: [`${CACHE_PREFIX}v1`, `${CACHE_PREFIX}v2`, 'someone-elses-cache'] });
  await sw.run('activate', {});
  assert.deepEqual([...sw.stores.keys()].sort(), [`${CACHE_PREFIX}v2`, 'someone-elses-cache']);
  assert.ok(sw.state.claimed);
});

test('fetch: the network is asked first, so an online visitor always gets the newest file', async () => {
  const sw = boot('v1');
  await sw.run('install', {});
  const fetchedAfterInstall = sw.fetched.length;
  const res = await sw.run('fetch', { request: new sw.Request('https://example.test/app/app.js?x=1') });
  assert.equal(res.from, 'network', 'not the stale cached copy');
  assert.equal(sw.fetched.length, fetchedAfterInstall + 1);
});

test('fetch: offline, or too slow, the cache answers (ignoring the query string)', async () => {
  const down = boot('v1', { network: async () => { throw new TypeError('Failed to fetch'); } });
  down.stores.set('interactive-slides-v1', new Map([['/app/app.js', { path: '/app/app.js' }]]));
  const offline = await down.run('fetch', { request: new down.Request('https://example.test/app/app.js?x=1') });
  assert.equal(offline.from, 'cache');
  assert.equal(offline.ignoreSearch, true);

  const slow = boot('v1', { network: () => new Promise(() => {}), impatient: true });
  slow.stores.set('interactive-slides-v1', new Map([['/app/app.js', { path: '/app/app.js' }]]));
  assert.equal((await slow.run('fetch', { request: new slow.Request('https://example.test/app/app.js') })).from, 'cache');
});

test('fetch: nothing cached and no network is an error, not a hang', async () => {
  const sw = boot('v1', { network: async () => { throw new TypeError('Failed to fetch'); } });
  assert.equal((await sw.run('fetch', { request: new sw.Request('https://example.test/app/other.json') })).from, 'error');
});

test('fetch: other origins and non-GET requests are left alone', async () => {
  const sw = boot('v1');
  assert.equal(await sw.run('fetch', { request: new sw.Request('https://cdn.test/x.js') }), undefined);
  assert.equal(await sw.run('fetch', { request: new sw.Request('https://example.test/app/app.js', { method: 'POST' }) }), undefined);
});

test('the generated source is plain, valid script', () => {
  assert.doesNotThrow(() => new Function(serviceWorkerSource('abc123')));
  assert.match(serviceWorkerSource('abc123'), /interactive-slides-abc123/);
});
