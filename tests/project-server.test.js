import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

test('local data API blocks private static paths and stale writes', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'arena-duel-server-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'src'), { recursive: true });
  await cp(join(root, 'src/scripts'), join(directory, 'src/scripts'), { recursive: true });
  await mkdir(join(directory, 'data/characters'), { recursive: true });
  await mkdir(join(directory, 'data/presets'), { recursive: true });
  await mkdir(join(directory, 'data/settings'), { recursive: true });
  await cp(join(root, 'data/catalog.json'), join(directory, 'data/catalog.json'));
  await cp(join(root, 'data/characters/factory'), join(directory, 'data/characters/factory'), { recursive: true });
  await cp(join(root, 'data/presets/builtin'), join(directory, 'data/presets/builtin'), { recursive: true });
  await cp(join(root, 'data/settings/factory-arena.json'), join(directory, 'data/settings/factory-arena.json'));
  await cp(join(root, 'serve.cjs'), join(directory, 'serve.cjs'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
  const port = await freePort();
  const child = spawn(process.execPath, ['serve.cjs'], { cwd: directory, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => child.kill());
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { const result = await fetch(`${base}/api/data/bootstrap`); if (result.ok) { ready = true; break; } }
    catch { /* Startup is still in progress. */ }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(ready, true);
  assert.equal((await fetch(`${base}/data/characters/overrides/warrior.json`)).status, 403);
  assert.equal((await fetch(`${base}/data/settings/match.json`)).status, 403);
  assert.equal((await fetch(`${base}/data/presets/personal/index.json`)).status, 403);
  assert.equal((await fetch(`${base}/api/data/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': 'stale' }, body: '{}' })).status, 409);
  assert.equal((await fetch(`${base}/api/data/settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': 'revision' }, body: ' '.repeat(2 * 1024 * 1024 + 1) })).status, 413);
  assert.equal((await fetch(`${base}/api/data/backup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'not json' })).status, 400);
  assert.equal((await fetch(`${base}/api/data/bootstrap`, { headers: { Origin: 'http://example.com' } })).status, 403);
});
