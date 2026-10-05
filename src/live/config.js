// Connection settings for live sessions, kept in this browser. Phones never read
// these: the link and QR code the presenter shows carry the settings they need.

import { cleanConfig, encodeConfig } from './protocol.js';
import { BUILT_IN_CONFIG, sameConfig } from '../cloud/defaults.js';

const KEY = 'interactive-slides:live';

// With a project built in, live sessions use it and nothing is configurable; the
// presenter can still pick "try it here" for a solo test.
export const defaultConfig = () => BUILT_IN_CONFIG ?? { kind: 'local' };

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    const stored = cleanConfig(raw?.config);
    const config = BUILT_IN_CONFIG ? (stored?.kind === 'local' ? stored : BUILT_IN_CONFIG) : stored ?? { kind: 'local' };
    return { config, base: typeof raw?.base === 'string' ? raw.base : '' };
  } catch {
    return { config: defaultConfig(), base: '' };
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

// The short address the audience opens: the app's front door, not the address of the deck being edited.
export function joinBase(settings, here = location) {
  return settings.base.trim() ? baseAddress(settings, here) : `${here.origin}/app/`;
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
  // The link only needs to carry the settings when they differ from this build's own.
  if (config.kind !== 'local' && !sameConfig(config, BUILT_IN_CONFIG)) url.searchParams.set('rt', encodeConfig(config));
  return url.toString();
}

export const joinLink = (base, code, config) => link(base, 'join', code, config);
export const remoteLink = (base, key, config) => link(base, 'remote', key, config);
