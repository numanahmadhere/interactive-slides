// Registers the offline service worker in production builds. In development it
// removes any worker left over from a production build on the same address, so
// edits are never hidden behind a cache.

import { toast } from './editor/ui.js';

/* global __DEV__ */
export async function setupOffline() {
  if (!('serviceWorker' in navigator)) return;
  if (__DEV__) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((r) => r.unregister()));
    return;
  }
  // Needs a real server address, and the single-file build has no worker beside it.
  if (!/^https?:$/.test(location.protocol) || document.querySelector('meta[name="no-service-worker"]')) return;

  const hadController = !!navigator.serviceWorker.controller;
  let notified = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (notified) return;
    notified = true;
    toast(hadController
      ? 'A new version was installed. Reload to use it.'
      : 'Ready to work offline.', { timeout: hadController ? 8000 : 4000 });
  });
  try {
    await navigator.serviceWorker.register('sw.js');
  } catch (err) {
    console.warn('Offline support is unavailable:', err);
  }
}
