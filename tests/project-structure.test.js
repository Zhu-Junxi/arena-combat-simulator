import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relativePath => readFile(path.join(root, relativePath), 'utf8');

test('index is a clean application shell with external CSS and module JavaScript', async () => {
  const html = await read('index.html');
  assert.doesNotMatch(html, /<style(?:\s|>)/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?[^\s][\s\S]*?<\/script>/i);
  assert.match(html, /<script type="module" src="src\/scripts\/app\.js"><\/script>/);
  assert.match(html, /<script src="src\/scripts\/theme\/theme-bootstrap\.js"><\/script>/);
  for (const stylesheet of ['base', 'layout', 'selection', 'customization', 'battle', 'responsive']) {
    assert.match(html, new RegExp(`src/styles/${stylesheet}\\.css`));
  }
});

test('light and dark themes expose the same semantic variable contract', async () => {
  const [light, dark] = await Promise.all([
    read('src/styles/themes/light.css'),
    read('src/styles/themes/dark.css')
  ]);
  const variables = source => [...source.matchAll(/--([a-z0-9-]+)\s*:/g)].map(match => match[1]).sort();
  assert.deepEqual(variables(light), variables(dark));
  assert.ok(variables(light).length >= 20);
});

test('theme bootstrap owns the single active theme stylesheet', async () => {
  const [html, bootstrap] = await Promise.all([
    read('index.html'),
    read('src/scripts/theme/theme-bootstrap.js')
  ]);
  assert.doesNotMatch(html, /<link[^>]+styles\/themes\//);
  assert.match(bootstrap, /link\.id = 'theme-stylesheet'/);
  assert.match(bootstrap, /arena-duel\.theme/);
  assert.match(bootstrap, /prefers-color-scheme: dark/);
});

test('shared presentation files contain no hard-coded black or white palette values', async () => {
  const styleNames = (await readdir(path.join(root, 'src/styles'))).filter(name => name.endsWith('.css'));
  const files = [
    'index.html',
    'src/scripts/ui/decorations.js',
    'src/scripts/battle/weapon-effects.js',
    ...styleNames.map(name => `src/styles/${name}`)
  ];
  for (const file of files) {
    const source = await read(file);
    assert.doesNotMatch(source, /#(?:000(?:000)?|fff(?:fff)?)(?![0-9a-f])/i, `${file} contains a hard-coded black/white palette value`);
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

test('translation catalog is present as a runtime resource', async () => {
  const file = await stat(path.join(root, 'src/locales/translations.csv'));
  assert.ok(file.isFile());
  const app = await read('src/scripts/app.js');
  assert.match(app, /locales\/translations\.csv/);
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
    'src/scripts/i18n/csv.js',
    'src/scripts/i18n/dom-localizer.js',
    'src/scripts/i18n/i18n.js',
    'src/scripts/customization/combat-setup.js',
    'src/scripts/customization/settings-controller.js',
    'src/scripts/customization/settings-store.js',
    'src/scripts/customization/settings-view.js',
    'src/scripts/theme/theme-controller.js',
    'src/scripts/theme/theme-view.js',
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
