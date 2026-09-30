import test from 'node:test';
import assert from 'node:assert/strict';
import { createFolderStorage } from '../src/scripts/data/folder-storage.js';
import { backup, factorySettings } from '../src/scripts/data/backup-codec.js';
import { MATCH_SETTINGS_STORAGE_KEY } from '../src/scripts/config/customization.js';
import { memoryDirectory, memoryStorage } from './storage-fixtures.js';
import { readFile } from 'node:fs/promises';

async function seeded() {
  const folder = memoryDirectory();
  const browser = memoryStorage();
  const storage = await createFolderStorage(folder, browser, 'test');
  await storage.importBackup(backup(factorySettings(), { version: 1, entries: [] }));
  return { folder, browser, storage };
}

test('folder backend writes project layout and reads it after reload', async () => {
  const { folder, browser, storage } = await seeded();
  const value = JSON.parse(storage.getItem(MATCH_SETTINGS_STORAGE_KEY));
  value.fighters.left.warrior.health = 132;
  await storage.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(value));
  assert.equal(JSON.parse(folder.files.get('data/settings/match.json')).fighters.left.warrior.health, 132);
  assert.ok(folder.files.has('data/presets/personal/index.json'));
  assert.equal(storage.getSaveState().state, 'saved');
  const reopened = await createFolderStorage(folder, browser, 'test');
  assert.equal(JSON.parse(reopened.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 132);
  storage.dispose(); reopened.dispose();
});

test('folder backend merges independent external edits and prompts for overlaps', async () => {
  const { folder, storage } = await seeded();
  const current = JSON.parse(storage.getItem(MATCH_SETTINGS_STORAGE_KEY));
  const external = JSON.parse(folder.files.get('data/settings/match.json'));
  external.fighters.right.archer.health = 140;
  folder.files.set('data/settings/match.json', JSON.stringify(external));
  current.fighters.left.warrior.health = 130;
  await storage.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(current));
  const merged = JSON.parse(folder.files.get('data/settings/match.json'));
  assert.equal(merged.fighters.left.warrior.health, 130);
  assert.equal(merged.fighters.right.archer.health, 140);
  const conflictSource = JSON.parse(storage.getItem(MATCH_SETTINGS_STORAGE_KEY));
  const secondExternal = JSON.parse(folder.files.get('data/settings/match.json'));
  secondExternal.fighters.left.warrior.health = 150;
  folder.files.set('data/settings/match.json', JSON.stringify(secondExternal));
  conflictSource.fighters.left.warrior.health = 125;
  await assert.rejects(storage.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(conflictSource)));
  assert.equal(storage.getSaveState().state, 'conflict');
  assert.deepEqual(storage.getSaveState().conflict.paths, ['fighters.left.warrior.health']);
  assert.equal(await storage.resolveConflict('browser'), true);
  assert.equal(JSON.parse(folder.files.get('data/settings/match.json')).fighters.left.warrior.health, 125);
  storage.dispose();
});

test('folder permission loss keeps edits in browser journal until reconnection', async () => {
  const { folder, browser, storage } = await seeded();
  const value = JSON.parse(storage.getItem(MATCH_SETTINGS_STORAGE_KEY));
  value.fighters.left.warrior.health = 149;
  folder.setDenied(true);
  await assert.rejects(storage.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(value)));
  assert.equal(storage.getSaveState().state, 'file-error');
  assert.ok(browser.getItem('arena-duel.folder.test.pending'));
  assert.equal(await storage.reconnect(), true);
  assert.equal(storage.getSaveState().state, 'saved');
  assert.equal(browser.getItem('arena-duel.folder.test.pending'), null);
  assert.equal(JSON.parse(folder.files.get('data/settings/match.json')).fighters.left.warrior.health, 149);
  storage.dispose();
});

test('personal presets use the project recipe and index format', async () => {
  const { folder, browser, storage } = await seeded();
  const recipe = JSON.parse(await readFile(new URL('../data/presets/builtin/warrior-archer.json', import.meta.url), 'utf8'));
  const entry = { id: 'personal-one', name: 'My duel', updatedAt: 12345, recipe };
  await storage.importBackup(backup(factorySettings(), { version: 1, entries: [entry] }));
  const index = JSON.parse(folder.files.get('data/presets/personal/index.json'));
  assert.deepEqual(index.entries, [{ id: entry.id, name: entry.name, updatedAt: entry.updatedAt }]);
  const recipeFiles = [...folder.files.keys()].filter(path => path.startsWith('data/presets/personal/') && !path.endsWith('index.json'));
  assert.equal(recipeFiles.length, 1);
  assert.deepEqual(JSON.parse(folder.files.get(recipeFiles[0])), recipe);
  const reloaded = await createFolderStorage(folder, browser, 'test');
  assert.deepEqual((await reloaded.exportBackup()).presets.entries, [entry]);
  storage.dispose(); reloaded.dispose();
});
