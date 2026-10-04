// Build and dev server.
//   node build.mjs           bundle to dist/ (and dist/single/index.html)
//   node build.mjs --serve   watch and serve dist/ on http://localhost:5177
import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { serviceWorkerSource } from './src/sw-template.js';
import { buildSite } from './tools/site.mjs';
import { paddleFromEnv } from './tools/paddle-env.mjs';
import { cleanConfig } from './src/live/protocol.js';

// The project this build talks to. Real environment variables win over .env.local
// (a file for local development that is never committed).
async function readEnv() {
  const env = { ...process.env };
  try {
    for (const line of (await readFile('.env.local', 'utf8')).split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env.local */ }
  return env;
}

function projectFromEnv(env) {
  const url = env.SUPABASE_URL ?? '';
  const key = env.SUPABASE_ANON_KEY ?? '';
  if (!url && !key) return { url: '', key: '' };
  const clean = cleanConfig({ kind: 'realtime', url, key });
  if (!clean) throw new Error('SUPABASE_URL must be the project address (https://xxxx.supabase.co) and SUPABASE_ANON_KEY must be set.');
  // A key that can bypass the access rules must never be compiled into a public page.
  try {
    const role = JSON.parse(Buffer.from(key.split('.')[1] ?? '', 'base64url').toString()).role;
    if (role === 'service_role') throw new Error('SUPABASE_ANON_KEY is a service_role key. Use the anon (public) key, never the service_role key.');
  } catch (err) {
    if (err.message.includes('service_role')) throw err;
  }
  if (/^sb_secret_/.test(key)) throw new Error('SUPABASE_ANON_KEY is a secret key. Use the anon or publishable key.');
  return { url: clean.url, key: clean.key };
}

const project = projectFromEnv(await readEnv());

const paddle = paddleFromEnv(await readEnv());

// A short label for this build: the commit when known (Netlify sets COMMIT_REF), plus the date.
function buildLabel() {
  let sha = (process.env.COMMIT_REF ?? '').slice(0, 7);
  if (!sha) {
    try { sha = execSync('git rev-parse --short=7 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { sha = 'local'; }
  }
  return `${sha} ${new Date().toISOString().slice(0, 10)}`;
}

const serve = process.argv.includes('--serve');
const PORT = 5177;

// The exporter ships the player to every exported deck, so the player is built
// first as its own bundle and handed to the editor as two strings. Any change
// under the player's imports rebuilds the editor too (watchFiles).
const playerRuntime = {
  name: 'player-runtime',
  setup(b) {
    b.onResolve({ filter: /^player-runtime$/ }, () => ({ path: 'player-runtime', namespace: 'player-runtime' }));
    b.onLoad({ filter: /.*/, namespace: 'player-runtime' }, async () => {
      const result = await build({
        entryPoints: { player: 'src/player-entry.js' },
        outdir: 'out',
        write: false,
        bundle: true,
        format: 'iife',
        target: ['es2022', 'safari15', 'chrome100', 'firefox100'],
        minify: true,
        loader: { '.woff2': 'dataurl' },
        metafile: true,
        logLevel: 'silent',
      });
      const text = (ext) => result.outputFiles.find((f) => f.path.endsWith(ext))?.text ?? '';
      return {
        contents: `export const js = ${JSON.stringify(text('.js'))};\nexport const css = ${JSON.stringify(text('.css'))};`,
        loader: 'js',
        watchFiles: Object.keys(result.metafile.inputs).map((p) => resolve(p)),
      };
    });
  },
};

const options = {
  entryPoints: { app: 'src/app.js' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  // iPhones in the audience may be a few iOS versions behind: compile for Safari 15 and up.
  target: ['es2022', 'safari15', 'chrome100', 'firefox100'],
  loader: { '.woff2': 'dataurl' },
  define: { __BUILD__: JSON.stringify(serve ? 'dev' : buildLabel()), __DEV__: String(serve), __SUPABASE_URL__: JSON.stringify(project.url), __SUPABASE_KEY__: JSON.stringify(project.key), __PADDLE_TOKEN__: JSON.stringify(paddle.token), __PADDLE_ENV__: JSON.stringify(paddle.environment) },
  sourcemap: serve,
  minify: !serve,
  logLevel: 'info',
  plugins: [
    playerRuntime,
    {
      name: 'site',
      setup(b) {
        b.onEnd(async () => {
          await writeSite();
        });
      },
    },
  ],
};

// The public pages, the app shell (served for every address under /app/) and the
// static files next to them.
async function writeSite() {
  await mkdir('dist/app', { recursive: true });
  await copyFile('src/app.html', 'dist/app/index.html');
  await copyFile('site/site.css', 'dist/site.css');
  await copyFile('src/styles/tokens.css', 'dist/tokens.css');
  await copyFile('site/favicon.ico', 'dist/favicon.ico');
  await copyFile('site/fonts.css', 'dist/fonts.css');
  await copyFile('site/tutorial.js', 'dist/tutorial.js');
  await mkdir('dist/fonts', { recursive: true });
  for (const f of await readdir('site/fonts')) await copyFile(`site/fonts/${f}`, `dist/fonts/${f}`);
  await mkdir('dist/clients', { recursive: true });
  for (const f of await readdir('site/clients')) await copyFile(`site/clients/${f}`, `dist/clients/${f}`);
  await mkdir('dist/brand', { recursive: true });
  for (const f of await readdir('site/brand')) await copyFile(`site/brand/${f}`, `dist/brand/${f}`);
  await writeFile('dist/manifest.webmanifest', JSON.stringify({
    name: 'Densight Slides', short_name: 'Densight Slides', description: 'Interactive presentations your audience can answer.',
    start_url: '/app/', scope: '/', display: 'standalone', background_color: '#FFFFFF', theme_color: '#2020E8',
    icons: [
      { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/brand/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, null, 2));
  for (const [file, content] of Object.entries(buildSite())) {
    await mkdir(dirname(resolve('dist', file)), { recursive: true });
    await writeFile(resolve('dist', file), content);
  }
}

// The cache name carries a hash of everything the worker caches, so a changed
// build is a changed worker and visitors get the update.
async function writeServiceWorker() {
  const hash = createHash('sha256');
  for (const file of ['dist/index.html', 'dist/app/index.html', 'dist/app.js', 'dist/app.css', 'dist/site.css', 'dist/tokens.css', 'dist/fonts.css', 'dist/tutorial.js']) hash.update(await readFile(file));
  await writeFile('dist/sw.js', serviceWorkerSource(hash.digest('hex').slice(0, 12)));
}

if (serve) {
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: PORT, fallback: 'src/app.html' });
  console.log(`Serving on http://localhost:${port}`);
} else {
  await rm('dist', { recursive: true, force: true }); // no stale files from older builds
  await build(options);
  await writeServiceWorker();
}
