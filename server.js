/**
 * Self-hosted runtime for the Docker image.
 *
 * In the managed deployment each file in api/ is a Vercel serverless function.
 * This server mounts the exact same handlers on the same paths and serves the
 * built frontend, so Docker and serverless behave identically.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, 'dist');
const API_DIR = path.join(__dirname, 'api');
const PORT = Number(process.env.PORT || 8080);
const MAX_BODY = 12 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.csv': 'text/csv; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

const handlers = new Map();
async function loadHandler(name) {
  if (handlers.has(name)) return handlers.get(name);
  const file = path.join(API_DIR, name + '.js');
  if (!fs.existsSync(file)) return null;
  const mod = await import(pathToFileURL(file).href);
  const fn = mod.default;
  handlers.set(name, fn);
  return fn;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function decorate(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (obj) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
    return res;
  };
  res.send = (body) => {
    res.end(body);
    return res;
  };
  return res;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  decorate(res);

  if (url.pathname === '/api/health') {
    return res.status(200).json({ ok: true, uptime: process.uptime() });
  }

  if (url.pathname.startsWith('/api/')) {
    const name = url.pathname.slice(5).replace(/\/+$/, '');
    if (!/^[a-z0-9-]+$/i.test(name)) return res.status(404).json({ error: 'Not found' });
    try {
      const handler = await loadHandler(name);
      if (!handler) return res.status(404).json({ error: 'No such API route: ' + name });
      req.query = Object.fromEntries(url.searchParams.entries());
      if (req.method !== 'GET' && req.method !== 'HEAD' && req.method !== 'OPTIONS') {
        const raw = await readBody(req);
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          req.body = {};
        }
      } else {
        req.body = {};
      }
      return await handler(req, res);
    } catch (err) {
      console.error('API error', url.pathname, err);
      if (!res.headersSent) res.status(500).json({ error: err.message });
      return undefined;
    }
  }

  // Static assets with SPA fallback
  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const target = path.join(DIST, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  const serve = (file) => {
    const ext = path.extname(file);
    res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
    if (ext !== '.html') res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    fs.createReadStream(file).pipe(res);
  };
  if (target.startsWith(DIST) && fs.existsSync(target) && fs.statSync(target).isFile()) return serve(target);
  return serve(path.join(DIST, 'index.html'));
});

server.listen(PORT, () => {
  console.log('DriftWatch listening on http://0.0.0.0:' + PORT);
});
