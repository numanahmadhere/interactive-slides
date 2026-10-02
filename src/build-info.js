// Which build is running, and which server it was made for. Shown on the phone pages
// and in Go live so a stale or misconfigured build is obvious at a glance.

/* global __BUILD__ */
export const BUILD = typeof __BUILD__ === 'string' && __BUILD__ ? __BUILD__ : 'dev';
