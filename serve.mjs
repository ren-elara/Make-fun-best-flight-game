import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const portIndex = process.argv.indexOf('--port');
const requested = portIndex >= 0 ? Number(process.argv[portIndex + 1]) : 8080;
const port = Number.isInteger(requested) && requested > 0 && requested < 65536 ? requested : 8080;
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
};

export const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://aurelia.local');
  let pathname;
  try { pathname = decodeURIComponent(url.pathname); } catch { response.writeHead(400).end('bad request'); return; }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = resolve(join(root, normalize(pathname)));
  if (file !== root && !file.startsWith(root + sep)) { response.writeHead(403).end('forbidden'); return; }
  try {
    const stat = statSync(file);
    if (!stat.isFile()) { response.writeHead(404).end('not found'); return; }
    const size = stat.size;
    response.writeHead(200, { 'content-type': mime[extname(file).toLowerCase()] ?? 'application/octet-stream', 'content-length': size, 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end('not found'); }
});

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  server.listen(port, '127.0.0.1', () => console.log(`AURELIA is flying at http://localhost:${port}`));
}
