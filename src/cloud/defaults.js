// The Supabase project this build was made for. build.mjs reads SUPABASE_URL and
// SUPABASE_ANON_KEY (Netlify environment variables, or .env.local when developing)
// and compiles them in, so nobody has to type them. The anon key is public by
// design: it only opens what the database's access rules allow.

import { cleanConfig } from '../live/protocol.js';

/* global __SUPABASE_URL__, __SUPABASE_KEY__ */
const url = typeof __SUPABASE_URL__ === 'string' ? __SUPABASE_URL__ : '';
const key = typeof __SUPABASE_KEY__ === 'string' ? __SUPABASE_KEY__ : '';

// { kind: 'realtime', url, key } or null when this build has no project built in.
export const BUILT_IN_CONFIG = url && key ? cleanConfig({ kind: 'realtime', url, key }) : null;
export const BUILT_IN_PROJECT = BUILT_IN_CONFIG ? { url: BUILT_IN_CONFIG.url, key: BUILT_IN_CONFIG.key } : null;

export const sameConfig = (a, b) => !!a && !!b && a.kind === b.kind && a.url === b.url && a.key === b.key;
