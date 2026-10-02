// Build and dev server.
//   node build.mjs           bundle to dist/ (and dist/single/index.html)
//   node build.mjs --serve   watch and serve dist/ on http://localhost:5177
import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { serviceWorkerSource } from './src/sw-template.js';

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
        target: 'es2022',
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
  target: 'es2022',
  loader: { '.woff2': 'dataurl' },
  define: { __DEV__: String(serve) },
  sourcemap: serve,
  minify: !serve,
  logLevel: 'info',
  plugins: [
    playerRuntime,
    {
      name: 'copy-html',
      setup(b) {
        b.onEnd(async () => {
          await mkdir('dist', { recursive: true });
          await copyFile('src/index.html', 'dist/index.html');
        });
      },
    },
  ],
};

// One self-contained HTML file: opens from disk with no server.
async function inlineSingleFile() {
  const [html, js, css] = await Promise.all([
    readFile('src/index.html', 'utf8'),
    readFile('dist/app.js', 'utf8'),
    readFile('dist/app.css', 'utf8'),
  ]);
  const out = html
    .replace('<meta charset="utf-8">', '<meta charset="utf-8">\n  <meta name="no-service-worker" content="">')
    .replace('<link rel="stylesheet" href="app.css">', () => `<style>${css}</style>`)
    .replace('<script src="app.js"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  await mkdir('dist/single', { recursive: true });
  await writeFile('dist/single/index.html', out);
}

// The cache name carries a hash of everything the worker caches, so a changed
// build is a changed worker and visitors get the update.
async function writeServiceWorker() {
  const hash = createHash('sha256');
  for (const file of ['dist/index.html', 'dist/app.js', 'dist/app.css']) hash.update(await readFile(file));
  await writeFile('dist/sw.js', serviceWorkerSource(hash.digest('hex').slice(0, 12)));
}

if (serve) {
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: PORT });
  console.log(`Serving on http://localhost:${port}`);
} else {
  await build(options);
  await inlineSingleFile();
  await writeServiceWorker();
}
