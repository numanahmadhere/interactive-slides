// A static server that behaves like the Netlify setup: files and folders as they are,
// every address under /app/ answered with the app page, anything else the 404 page.
//   node tools/serve.mjs [port]     default 5178, serves dist/
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.argv[2]) || 5178;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain', '.json': 'application/json', '.png': 'image/png' };

async function find(pathname) {
  const clean = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  for (const candidate of [join(root, clean), join(root, clean, 'index.html')]) {
    try { if ((await stat(candidate)).isFile()) return candidate; } catch { /* try the next */ }
  }
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  let file = await find(pathname);
  let status = 200;
  if (!file && pathname.startsWith('/app/')) file = join(root, 'app/index.html');
  if (!file) { file = join(root, '404.html'); status = 404; }
  const headers = { 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Referrer-Policy': 'no-referrer' };
  if (file.endsWith('sw.js')) headers['Cache-Control'] = 'no-cache';
  try { res.writeHead(status, headers); res.end(await readFile(file)); } catch { res.writeHead(500); res.end('error'); }
}).listen(port, () => console.log(`Serving dist/ on http://localhost:${port}`));
