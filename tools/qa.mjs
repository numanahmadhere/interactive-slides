// Pre-deploy check. Run it before every deploy:
//
//   npm run qa                        tests, a production build, and checks on what it produced
//   npm run qa -- --require-project   also fail unless a Supabase project is built in
//                                     (put SUPABASE_URL and SUPABASE_ANON_KEY in .env.local first)
//
// It builds into dist/ exactly as Netlify would, then inspects the result.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const requireProject = process.argv.includes('--require-project');
const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok, detail });
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', env: process.env });

// 1. unit and database tests
const tests = run('npm', ['test']);
const summary = (tests.stdout.match(/ℹ (tests|pass|fail) \d+/g) ?? []).join(', ');
check('automated tests pass', tests.status === 0, summary);

// 2. a production build
const build = run('node', ['build.mjs']);
check('production build succeeds', build.status === 0, build.status === 0 ? '' : (build.stderr || build.stdout).split('\n').find((l) => /error/i.test(l)) ?? '');
if (build.status !== 0) finish();

const js = readFileSync('dist/app.js', 'utf8');
const css = readFileSync('dist/app.css', 'utf8');
const html = readFileSync('dist/index.html', 'utf8');
const sw = existsSync('dist/sw.js') ? readFileSync('dist/sw.js', 'utf8') : '';

// 3. the app files are all there and wired together
check('index.html loads app.js and app.css', html.includes('src="app.js"') && html.includes('href="app.css"'));
check('service worker was generated with a versioned cache', /const CACHE = "interactive-slides-[0-9a-f]{12}"/.test(sw));
check('dist/single/index.html is one self-contained file', existsSync('dist/single/index.html') && !/<(script|link)[^>]+(src|href)="https?:/.test(readFileSync('dist/single/index.html', 'utf8')));

// 4. no source maps or debug builds shipped
check('no source map reference in the bundle', !/sourceMappingURL/.test(js));
check('production mode (not the development build)', !/__DEV__/.test(js));

// 5. secrets: every JWT in the bundle must be an anon key, and no secret-key prefixes
const jwts = [...new Set(js.match(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]*/g) ?? [])];
const roles = jwts.map((t) => {
  try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).role; } catch { return 'unreadable'; }
});
check('every key in the bundle is an anon (public) key', roles.every((r) => r === 'anon'), roles.length ? roles.join(', ') : 'none built in');
check('no secret or service-role key prefixes', !/sb_secret_|service_role/.test(js.replace(/service_role key\. Use the anon/g, '')));

// 6. the Supabase project
const urls = [...new Set(js.match(/https:\/\/[a-z0-9-]+\.supabase\.co/g) ?? [])];
if (requireProject) check('a Supabase project is built in', urls.length === 1 && jwts.length + (/sb_publishable_/.test(js) ? 1 : 0) >= 1, urls.join(', ') || 'SUPABASE_URL / SUPABASE_ANON_KEY not set');
else check('Supabase project built in (optional here)', true, urls.length ? urls[0] : 'none: the app falls back to typing it in');
check('project address is clean (no /rest/v1 suffix)', urls.every((u) => !/\/(rest|auth|realtime)\//.test(u)));

// 7. no unexpected third parties: pages must not call out to sites other than the project
const hosts = new Set((js.match(/https?:\/\/[a-zA-Z0-9.-]+/g) ?? []).map((u) => new URL(u).hostname));
const allowed = /(^|\.)(supabase\.co|w3\.org|localhost|example\.com|yoursite\.com|your-project\.supabase\.co|192\.168\.1\.5|127\.0\.0\.1)$/;
const unexpected = [...hosts].filter((h) => !allowed.test(h));
check('no unexpected third-party hosts in the bundle', unexpected.length === 0, unexpected.slice(0, 8).join(', '));

// 8. size budgets (gzip is what people download)
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const gz = gzipSync(js).length;
check('app.js under 1.2 MB (and 320 KB gzipped)', js.length < 1.2 * 1024 * 1024 && gz < 320 * 1024, `${kb(js.length)}, ${kb(gz)} gzipped`);
check('app.css under 200 KB', css.length < 200 * 1024, kb(css.length));

// 9. deploy config
const toml = existsSync('netlify.toml') ? readFileSync('netlify.toml', 'utf8') : '';
check('netlify.toml builds and publishes dist', /command\s*=\s*"npm run build"/.test(toml) && /publish\s*=\s*"dist"/.test(toml));
check('share-link tokens are protected (Referrer-Policy: no-referrer)', /Referrer-Policy\s*=\s*"no-referrer"/.test(toml));
check('sw.js is never cached by the host', /for\s*=\s*"\/sw\.js"[\s\S]*no-cache/.test(toml));
check('.env files are git-ignored', /^\.env/m.test(existsSync('.gitignore') ? readFileSync('.gitignore', 'utf8') : ''));
const tracked = run('git', ['ls-files']).stdout.split('\n').filter((f) => /(^|\/)\.env/.test(f));
check('no .env file is committed', tracked.length === 0, tracked.join(', '));
check('working tree is committed (what you test is what deploys)', run('git', ['status', '--porcelain']).stdout.trim() === '', 'uncommitted changes would not be deployed');

finish();

function finish() {
  const width = Math.max(...results.map((r) => r.name.length));
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(width)}  ${r.detail}`);
  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? `\n${failed.length} check(s) failed. Do not deploy yet.` : '\nAll checks passed.');
  process.exit(failed.length ? 1 : 0);
}
