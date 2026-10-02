// Build and dev server.
//   node build.mjs           bundle to dist/ (and dist/single/index.html)
//   node build.mjs --serve   watch and serve dist/ on http://localhost:5177
import { build, context } from 'esbuild';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const serve = process.argv.includes('--serve');
const PORT = 5177;

const options = {
  entryPoints: { app: 'src/app.js' },
  outdir: 'dist',
  bundle: true,
  format: 'iife',
  target: 'es2022',
  loader: { '.woff2': 'dataurl' },
  sourcemap: serve,
  minify: !serve,
  logLevel: 'info',
  plugins: [{
    name: 'copy-html',
    setup(b) {
      b.onEnd(async () => {
        await mkdir('dist', { recursive: true });
        await copyFile('src/index.html', 'dist/index.html');
      });
    },
  }],
};

// One self-contained HTML file: opens from disk with no server.
async function inlineSingleFile() {
  const [html, js, css] = await Promise.all([
    readFile('src/index.html', 'utf8'),
    readFile('dist/app.js', 'utf8'),
    readFile('dist/app.css', 'utf8'),
  ]);
  const out = html
    .replace('<link rel="stylesheet" href="app.css">', () => `<style>${css}</style>`)
    .replace('<script src="app.js"></script>', () => `<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`);
  await mkdir('dist/single', { recursive: true });
  await writeFile('dist/single/index.html', out);
}

if (serve) {
  const ctx = await context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: PORT });
  console.log(`Serving on http://localhost:${port}`);
} else {
  await build(options);
  await inlineSingleFile();
}
