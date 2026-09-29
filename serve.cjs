// Local project preview and JSON data API. No npm dependencies.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const port = Number(process.env.PORT || 4173);
const maxBody = 2 * 1024 * 1024;
const types = {
  '.css': 'text/css; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.svg': 'image/svg+xml'
};
let service;
function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function allowed(req) {
  const host = req.headers.host || '';
  if (!/^(localhost|127\.0\.0\.1|\[::1\]):\d+$/.test(host)) return false;
  if (!req.headers.origin) return true;
  try { return new URL(req.headers.origin).host === host; } catch { return false; }
}
async function body(req) {
  let size = 0;
  let oversized = false;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBody) oversized = true;
    if (!oversized) chunks.push(chunk);
  }
  if (oversized) throw Object.assign(new Error('JSON payload too large'), { status: 413 });
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
async function api(req, res, route) {
  try {
    service ||= import('./src/scripts/data/project-data-service.js');
    const data = await service;
    if (req.method === 'GET' && route === '/api/data/bootstrap') return json(res, 200, await data.bootstrapData());
    if (req.method === 'GET' && route === '/api/data/backup') return json(res, 200, await data.exportBackup());
    if (req.method === 'PUT' && route === '/api/data/settings') {
      if (typeof req.headers['if-match'] !== 'string') return json(res, 428, { error: 'File revision required' });
      return json(res, 200, { revision: await data.saveSettings(await body(req), req.headers['if-match']) });
    }
    if (req.method === 'PUT' && route === '/api/data/presets') {
      if (typeof req.headers['if-match'] !== 'string') return json(res, 428, { error: 'File revision required' });
      return json(res, 200, { revision: await data.savePresets(await body(req), req.headers['if-match']) });
    }
    if (req.method === 'POST' && route === '/api/data/backup') {
      const revisions = { settings: req.headers['x-settings-revision'], presets: req.headers['x-presets-revision'] };
      return json(res, 200, await data.importBackup(await body(req), revisions));
    }
    return json(res, 404, { error: 'Unknown data endpoint' });
  } catch (error) {
    console.warn('Data API:', error);
    return json(res, error.status || 500, { error: error.message || 'Data operation failed' });
  }
}
http.createServer((req, res) => {
  if (!allowed(req)) { res.writeHead(403).end(); return; }
  let route;
  try { route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end(); return; }
  if (route.startsWith('/api/data/')) { void api(req, res, route); return; }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  if (route === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (/^\/data\/(characters\/overrides|settings\/match\.json|presets\/personal)(\/|$)/.test(route)) { res.writeHead(403).end(); return; }
  const file = path.resolve(root, '.' + (route === '/' ? '/index.html' : route));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(req.method === 'HEAD' ? undefined : bytes);
  });
}).listen(port, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:' + port));
