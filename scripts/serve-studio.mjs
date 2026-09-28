// Serve the stable Orbital Studio build (dist/) for everyday use, separate from the
// development server. Files are read from dist/ on every request, so a publish (which
// swaps the whole folder) is picked up without restarting, and pages and version.json
// are never cached, so "Update ready" and a reload always get the newest build.
// Usage: node scripts/serve-studio.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');
const port = Number(process.argv[2] ?? 4178);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.webp': 'image/webp', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.txt': 'text/plain; charset=utf-8',
  '.glb': 'model/gltf-binary', '.hdr': 'application/octet-stream', '.md': 'text/markdown; charset=utf-8',
};

createServer(async (request, response) => {
  try {
    const path = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    let file = normalize(join(root, path));
    if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
    if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    const type = types[extname(file)] ?? 'application/octet-stream';
    // Hashed assets never change; pages and version.json must always be fresh.
    const cache = /\/assets\//.test(file) ? 'public, max-age=31536000, immutable' : 'no-store';
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': cache });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
  }
}).listen(port, '127.0.0.1', () => console.log(`Orbital Studio (stable build) at http://127.0.0.1:${port}/`));
