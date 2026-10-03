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
const appHtml = readFileSync('dist/app/index.html', 'utf8');
const sw = existsSync('dist/sw.js') ? readFileSync('dist/sw.js', 'utf8') : '';

// 3. the app files are all there and wired together
check('the app page loads /app.js and /app.css', appHtml.includes('src="/app.js"') && appHtml.includes('href="/app.css"'));
check('the home page is small (under 30 KB, no app bundle)', html.length < 30 * 1024 && !html.includes('app.js'), `${(html.length / 1024).toFixed(1)} KB`);
check('privacy, terms, learn, sitemap and robots exist', ['privacy', 'terms', 'learn'].every((d) => existsSync(`dist/${d}/index.html`)) && existsSync('dist/sitemap.xml') && existsSync('dist/robots.txt'));
check('service worker was generated with a versioned cache', /const CACHE = "interactive-slides-[0-9a-f]{12}"/.test(sw));
check('/app/* is rewritten to the app page', /from\s*=\s*"\/app\/\*"[\s\S]*?to\s*=\s*"\/app\/index\.html"[\s\S]*?status\s*=\s*200/.test(existsSync('netlify.toml') ? readFileSync('netlify.toml', 'utf8') : ''));

check('brand icons, manifest and sharing image are in the build', ['favicon.ico', 'brand/apple-touch-icon.png', 'brand/icon-512.png', 'brand/og-image.png', 'brand/logo-64.png', 'brand/logo-light-64.png', 'manifest.webmanifest'].every((f) => existsSync(`dist/${f}`)));
check('the support address is on the home page', html.includes('hello@densight.com') && html.includes('https://densightlabs.com'));

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
// Known and harmless: the Supabase project, XML namespaces, the video embed block's
// providers (only used when someone adds an embed), our own company site (a plain link), and documentation links that
// libraries print inside error messages (never fetched).
const allowed = new RegExp('(^|\\.)(' + [
  'supabase\\.co', 'supabase\\.com', 'w3\\.org', 'localhost', '127\\.0\\.0\\.1', 'example\\.com', 'yoursite\\.com', '192\\.168\\.1\\.5',
  'densightlabs\\.com', 'youtube\\.com', 'youtube-nocookie\\.com', 'vimeo\\.com', 'loom\\.com',
  'github\\.com', 'github\\.io', 'openxmlformats\\.org', 'microsoft\\.com', 'purl\\.org', 'stuartk\\.com', 'mozilla\\.org', 'wikipedia\\.org', 'ecma-international\\.org',
].join('|') + ')$');
const unexpected = [...hosts].filter((h) => /[a-z0-9]/i.test(h) && !allowed.test(h)); // "https://..." in help text is not a host
check('no unexpected third-party hosts in the bundle', unexpected.length === 0, unexpected.slice(0, 8).join(', '));

// 8. size budgets (gzip is what people download)
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const gz = gzipSync(js).length;
check('app.js under 1.3 MB (and 400 KB gzipped)', js.length < 1.3 * 1024 * 1024 && gz < 400 * 1024, `${kb(js.length)}, ${kb(gz)} gzipped`);
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
