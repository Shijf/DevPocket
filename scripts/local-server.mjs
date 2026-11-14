import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';

if (!process.argv[2]) throw new Error('Specify a dedicated resource directory; the workspace is never served by default.');
const root = await realpath(resolve(process.argv[2]));
const port = Number(process.argv[3] || 3000);
const origin = process.argv[4] || `http://127.0.0.1:${port}`;
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Port must be 1–65535.');
if (origin === '*' || !/^https?:/.test(origin) || new URL(origin).origin !== origin) throw new Error('CORS origin must be a full origin, for example https://site.example.');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm' };
function inside(path) { const rel = relative(root, path); return !isAbsolute(rel) && !rel.split('/').some(part => part.startsWith('.')); }
const server = createServer(async (request, response) => {
  // Prevent DNS rebinding and browser pages from silently reading local resources.
  const host = request.headers.host?.toLowerCase();
  if (![ `127.0.0.1:${port}`, `localhost:${port}` ].includes(host)) { response.writeHead(403); response.end('Untrusted Host'); return; }
  const requestOrigin = request.headers.origin;
  if ((requestOrigin && requestOrigin !== origin) || (!requestOrigin && request.headers['sec-fetch-site'] === 'cross-site')) {
    response.writeHead(403); response.end('Origin not allowed'); return;
  }
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Origin', origin);
  // Credentials are unnecessary for serving public development assets.
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
  // Only a loopback development server; reflect preflight header names for local debugging.
  if (request.headers['access-control-request-headers']) response.setHeader('Access-Control-Allow-Headers', request.headers['access-control-request-headers']);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
  try {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/__devpocket_echo') {
      const chunks = []; let size = 0;
      for await (const chunk of request) { size += chunk.length; if (size > 1_000_000) { response.writeHead(413); response.end('Body too large'); return; } chunks.push(chunk); }
      response.setHeader('Content-Type', types['.json']);
      response.end(JSON.stringify({ source: 'local', method: request.method, url: request.url, headers: request.headers, body: Buffer.concat(chunks).toString('utf8') }, null, 2)); return;
    }
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end('Static files support GET / HEAD; use /__devpocket_echo or your API server.'); return; }
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) { response.writeHead(403); response.end('Forbidden'); return; }
    let file = resolve(root, '.' + pathname);
    if (!inside(file)) { response.writeHead(403); response.end('Forbidden'); return; }
    file = await realpath(file);
    if (!inside(file)) { response.writeHead(403); response.end('Forbidden'); return; }
    if ((await stat(file)).isDirectory()) file = await realpath(resolve(file, 'index.html'));
    if ((await stat(file)).size > 50 * 1024 * 1024) { response.writeHead(413); response.end('Resource exceeds 50 MB'); return; }
    if (!inside(file)) { response.writeHead(403); response.end('Forbidden'); return; }
    const content = await readFile(file);
    response.setHeader('Content-Type', types[extname(file).toLowerCase()] || 'application/octet-stream');
    response.setHeader('Content-Length', content.length);
    response.writeHead(200); response.end(request.method === 'HEAD' ? undefined : content);
  } catch (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 400); response.end(error.code === 'ENOENT' ? 'Not found' : 'Invalid request'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local resources: http://127.0.0.1:${port}\nDirectory: ${root}\nAPI echo: /__devpocket_echo\nCORS: ${origin}`));
