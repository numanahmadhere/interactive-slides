// Connection settings for live sessions, kept in this browser. Phones never read
// these: the link and QR code the presenter shows carry the settings they need.

import { cleanConfig, encodeConfig } from './protocol.js';

const KEY = 'interactive-slides:live';

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return { config: cleanConfig(raw?.config) ?? { kind: 'local' }, base: typeof raw?.base === 'string' ? raw.base : '' };
  } catch {
    return { config: { kind: 'local' }, base: '' };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch { /* private mode: the settings last until the page closes */ }
}

// The address phones open. The page's own address unless the presenter typed one.
export function baseAddress(settings, here = location) {
  const typed = settings.base.trim();
  if (/^https?:\/\/[^\s]+$/i.test(typed)) return typed.replace(/[?#].*$/, '');
  return `${here.origin}${here.pathname}`;
}

export function isLocalAddress(url) {
  try {
    const host = new URL(url).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
  } catch {
    return false;
  }
}

function link(base, name, value, config) {
  const url = new URL(base);
  url.searchParams.set(name, value);
  if (config.kind !== 'local') url.searchParams.set('rt', encodeConfig(config));
  return url.toString();
}

export const joinLink = (base, code, config) => link(base, 'join', code, config);
export const remoteLink = (base, key, config) => link(base, 'remote', key, config);
