import { createServer } from 'node:http';
import { createReadStream, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const root = resolve(process.env.MAKEFUN_OUTPUT_DIR || 'out');
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.jpg': 'image/jpeg' };

const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname);
  const target = resolve(join(root, pathname === '/' ? 'dashboard/index.html' : pathname.slice(1)));
  if (!target.startsWith(root) || !statSafe(target)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'content-type': mime[extname(target)] || 'application/octet-stream' });
  createReadStream(target).pipe(response);
});

function statSafe(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

server.listen(port, '127.0.0.1', () => process.stdout.write(`radar dashboard: http://127.0.0.1:${port}/\n`));
