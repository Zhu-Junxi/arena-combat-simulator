import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCatalog, parseCsv } from '../src/scripts/i18n/csv.js';
import { createI18n, matchLocale, resolveLocale, STORAGE_KEY } from '../src/scripts/i18n/i18n.js';
import { SETTING_PRESENTATIONS } from '../src/scripts/customization/setting-presentation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const translations = await readFile(path.join(root, 'src/locales/translations.csv'), 'utf8');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: key => values.get(key)
  };
}

test('CSV parser supports BOM, CRLF, commas, escaped quotes, and multiline fields', () => {
  const rows = parseCsv('\uFEFFkey,en,zh-CN\r\nexample,"Hello, ""friend""\nAgain",你好\r\n');
  assert.deepEqual(rows, [
    ['key', 'en', 'zh-CN'],
    ['example', 'Hello, "friend"\nAgain', '你好']
  ]);
});

test('catalog validation rejects malformed rows, duplicate keys, and placeholder mismatches', () => {
  assert.throws(() => parseCsv('key,en\na,"open'), /unclosed quoted field/);
  assert.throws(() => buildCatalog('key,en,zh-CN\na,A,甲\na,B,乙'), /Duplicate translation key/);
  assert.throws(() => buildCatalog('key,en,zh-CN\na,{name} wins,获胜'), /Placeholder mismatch/);
  assert.throws(() => buildCatalog('key,zh-CN\na,甲'), /must include en/);
  assert.throws(() => buildCatalog('key,en,zh-CN\na,,甲'), /Missing en translation/);
});

test('locale resolution prefers saved choice, then browser language, then English', () => {
  const availableLocales = ['en', 'zh-CN'];
  assert.equal(matchLocale('zh-Hans-SG', availableLocales), 'zh-CN');
  assert.equal(matchLocale('en-AU', availableLocales), 'en');
  assert.equal(resolveLocale({ savedLocale: 'zh-CN', browserLanguages: ['en-AU'], availableLocales }), 'zh-CN');
  assert.equal(resolveLocale({ savedLocale: null, browserLanguages: ['zh-Hans'], availableLocales }), 'zh-CN');
  assert.equal(resolveLocale({ savedLocale: null, browserLanguages: ['fr-FR'], availableLocales }), 'en');
});

test('i18n translates, interpolates, persists, subscribes, and falls back to English', () => {
  const storage = createStorage();
  const warnings = [];
  const i18n = createI18n({
    source: 'key,en,zh-CN\nmeta.language_name,English,简体中文\ngreeting,Hello {name},你好 {name}\nfallback,English only,',
    storage,
    browserLanguages: ['en-AU'],
    logger: { warn: message => warnings.push(message) }
  });
  let notified = null;
  i18n.subscribe(locale => { notified = locale; });
  assert.equal(i18n.t('greeting', { name: 'Alex' }), 'Hello Alex');
  i18n.setLocale('zh');
  assert.equal(notified, 'zh-CN');
  assert.equal(storage.value(STORAGE_KEY), 'zh-CN');
  assert.equal(i18n.t('greeting', { name: '艾莉丝' }), '你好 艾莉丝');
  assert.equal(i18n.t('fallback'), 'English only');
  assert.equal(i18n.t('not.present'), '[not.present]');
  assert.equal(warnings.length, 1);
});

test('production catalog has complete English and Chinese values', () => {
  const { locales, catalog } = buildCatalog(translations);
  assert.deepEqual(locales, ['en', 'zh-CN']);
  for (const [key, entry] of catalog) {
    assert.ok(entry.en, `${key} is missing English`);
    assert.ok(entry['zh-CN'], `${key} is missing Simplified Chinese`);
  }
});

test('every setting presentation reference is localized', () => {
  const { catalog } = buildCatalog(translations);
  for (const presentation of Object.values(SETTING_PRESENTATIONS)) {
    for (const key of [presentation.unit, presentation.description, presentation.example]) {
      if (key) assert.ok(catalog.has(key), `Missing setting presentation key ${key}`);
    }
  }
});

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(target) : entry.name.endsWith('.js') ? [target] : [];
  }));
  return nested.flat();
}

test('every translation key referenced by runtime source exists', async () => {
  const { catalog } = buildCatalog(translations);
  const files = await javascriptFiles(path.join(root, 'src/scripts'));
  const sources = await Promise.all(files.map(file => readFile(file, 'utf8')));
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const referenced = new Set();
  for (const source of [...sources, html]) {
    for (const match of source.matchAll(/(?:i18n\.t|\bt)\(['"]([a-z][a-z0-9_.]+)['"]/g)) referenced.add(match[1]);
    for (const match of source.matchAll(/data-i18n(?:-aria-label|-title)?="([a-z][a-z0-9_.]+)"/g)) referenced.add(match[1]);
    for (const match of source.matchAll(/(?:nameKey|descriptionKey|labelKey):\s*['"]([a-z][a-z0-9_.]+)['"]/g)) referenced.add(match[1]);
  }
  for (const key of [
    'side.left', 'side.right',
    'battle.rooted', 'battle.slowed',
    'customization.left_fighter', 'customization.right_fighter',
    'customization.attack_mode', 'customization.cooldown_mode',
    'customization.collision_bounce', 'customization.collision_stop', 'customization.collision_pass',
    ...['base', 'melee', 'ranged', 'special', 'defense', 'healing', 'summon', 'control', 'mobility'].map(id => `category.${id}`)
  ]) referenced.add(key);
  for (const key of referenced) assert.ok(catalog.has(key), `Missing catalog key ${key}`);
});

test('runtime source contains no hard-coded Chinese UI copy outside the CSV bootstrap fallback', async () => {
  const files = await javascriptFiles(path.join(root, 'src/scripts'));
  for (const file of files) {
    const source = (await readFile(file, 'utf8'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(source, /[\u3400-\u9fff]/, `${path.relative(root, file)} contains hard-coded Chinese UI copy`);
  }
  const html = (await readFile(path.join(root, 'index.html'), 'utf8'))
    .replace(/<div class="bootstrap-status"[\s\S]*?<\/div>/, '')
    .replace(/<div class="bootstrap-error"[\s\S]*?<\/div>/, '');
  assert.doesNotMatch(html, /[\u3400-\u9fff]/);
});
