import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => readFile(path.join(root, relativePath), 'utf8');

test('index is a clean application shell with external CSS and module JavaScript', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?[^\s][\s\S]*?<\/script>/i);
  assert.match(html, /<script type="module" src="src\/scripts\/app\.js"><\/script>/);
  for (const stylesheet of ['base', 'layout', 'selection', 'battle', 'responsive']) {
    assert.match(html, new RegExp(`src/styles/${stylesheet}\\.css`));
  }
});

test('all local HTML resources exist', async () => {
  const html = await read('index.html');
  const references = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
    .map(match => match[1])
    .filter(reference => !reference.startsWith('#') && !reference.includes('://'));
  for (const reference of references) {
    const file = await stat(path.join(root, reference));
    assert.ok(file.isFile(), `Missing ${reference}`);
  }
});

test('runtime source does not reference removed outputs or archived files', async () => {
  const runtimeFiles = [
    'index.html',
    'src/scripts/app.js',
    'src/scripts/config/characters.js',
    'src/scripts/config/weapons.js',
    'src/scripts/battle/weapon-effects.js'
  ];
  for (const file of runtimeFiles) {
    const source = await read(file);
    assert.doesNotMatch(source, /(?:outputs|archive)\//, `${file} contains a non-runtime path`);
  }
});

test('all JavaScript module imports resolve', async () => {
  const modules = [
    'src/scripts/app.js',
    'src/scripts/battle/combat-engine.js',
    'src/scripts/battle/combat-renderer.js',
    'src/scripts/battle/weapon-effects.js',
    'src/scripts/selection/selection-controller.js',
    'src/scripts/selection/selection-view.js',
    'src/scripts/ui/transitions.js'
  ];
  for (const modulePath of modules) {
    const source = await read(modulePath);
    for (const match of source.matchAll(/from ['"](\.[^'"]+)['"]/g)) {
      const resolved = path.resolve(root, path.dirname(modulePath), match[1]);
      const file = await stat(resolved);
      assert.ok(file.isFile(), `Missing import ${match[1]} from ${modulePath}`);
    }
  }
});
