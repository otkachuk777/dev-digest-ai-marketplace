import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BASE = '/dev-digest-ai-marketplace/';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/markdown; charset=utf-8', '.xml': 'application/atom+xml; charset=utf-8',
  '.woff2': 'font/woff2',
};

/** Serves `dir` under /dev-digest-ai-marketplace/ exactly like GitHub Pages, so absolute-path bugs show up locally. */
export function serve({ dir, port }) {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith(BASE)) {
      res.writeHead(302, { location: BASE });
      return res.end();
    }
    let rel = decodeURIComponent(url.pathname.slice(BASE.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
      res.end(data);
    } catch {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, () => {
    console.log(`Serving ${root} at http://localhost:${port}${BASE}`);
    ok(server);
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [dir = 'dist', port = '4173'] = process.argv.slice(2);
  serve({ dir, port: Number(port) });
}
