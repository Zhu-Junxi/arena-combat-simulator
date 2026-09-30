import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectableStorage, STORAGE_MODE_KEY } from '../src/scripts/data/selectable-storage.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import { MATCH_SETTINGS_STORAGE_KEY } from '../src/scripts/config/customization.js';
import { CHARACTERS } from '../src/scripts/config/characters.js';
import { memoryDirectory, memoryStorage } from './storage-fixtures.js';
import { createFolderStorage } from '../src/scripts/data/folder-storage.js';
import { backup, factorySettings } from '../src/scripts/data/backup-codec.js';
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test('new browser mode saves without calling the project API', async () => {
  const browser = memoryStorage();
  let apiCalls = 0;
  const fetcher = async () => { apiCalls += 1; throw new Error('No server'); };
  const storage = await createSelectableStorage(browser, fetcher, { pickerAvailable: false });
  assert.equal(storage.getMode(), 'browser');
  const initialProbe = apiCalls;
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  store.setFighterValue('left', 'warrior', 'health', 137);
  assert.equal(await store.whenPersisted(), true);
  assert.equal(apiCalls, initialProbe);
  assert.equal(JSON.parse(browser.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 137);
  assert.equal(storage.getSaveState().state, 'saved');
});

test('switching to a linked folder copies data and preserves browser source', async () => {
  const browser = memoryStorage();
  browser.setItem(STORAGE_MODE_KEY, 'browser');
  const folder = memoryDirectory();
  let linked;
  const handles = { get: async () => linked, put: async value => { linked = value; } };
  const storage = await createSelectableStorage(browser, async () => { throw new Error('API must stay unused'); },
    { pickerAvailable: true, handleStore: handles });
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  store.setFighterValue('left', 'warrior', 'health', 142);
  assert.equal(await store.whenPersisted(), true);
  const browserCopy = browser.getItem(MATCH_SETTINGS_STORAGE_KEY);
  assert.equal(await storage.switchMode('folder', { handle: folder }), true);
  assert.equal(storage.getMode(), 'folder');
  assert.equal(browser.getItem(MATCH_SETTINGS_STORAGE_KEY), browserCopy);
  assert.ok(folder.files.has('data/settings/match.json'));
  assert.equal(JSON.parse(folder.files.get('data/settings/match.json')).fighters.left.warrior.health, 142);
  const reloaded = await createSelectableStorage(browser, async () => { throw new Error('API must stay unused'); },
    { pickerAvailable: true, handleStore: handles });
  assert.equal(reloaded.getMode(), 'folder');
  assert.equal(JSON.parse(reloaded.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 142);
});

test('failed folder transfer keeps browser mode and browser data', async () => {
  const browser = memoryStorage();
  browser.setItem(STORAGE_MODE_KEY, 'browser');
  const folder = memoryDirectory();
  folder.setFailWrite(true);
  const storage = await createSelectableStorage(browser, async () => { throw new Error('No API'); },
    { pickerAvailable: true, handleStore: { get: async () => null, put: async () => {} } });
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  store.setFighterValue('left', 'warrior', 'health', 144);
  assert.equal(await store.whenPersisted(), true);
  await assert.rejects(storage.switchMode('folder', { handle: folder }));
  assert.equal(storage.getMode(), 'browser');
  assert.equal(JSON.parse(browser.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 144);
});

test('existing project files retain project mode and a browser switch copies them', async () => {
  const browser = memoryStorage();
  const oldBrowser = createMatchSettingsStore({ characters: CHARACTERS,
    storage: { getItem: () => null, setItem() {} } }).exportData();
  oldBrowser.fighters.left.warrior.health = 122;
  browser.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(oldBrowser));
  const settings = createMatchSettingsStore({ characters: CHARACTERS,
    storage: { getItem: () => null, setItem() {} } }).exportData();
  settings.fighters.left.warrior.health = 151;
  const fetcher = async url => {
    if (url.endsWith('/bootstrap')) return response(200, { settings, presets: null,
      revisions: { settings: 'one', presets: 'two' }, exists: { settings: true, presets: false } });
    if (url.endsWith('/backup')) return response(200, { format: 'arena-duel.backup', version: 1, settings, presets: null });
    throw new Error('Unexpected API call');
  };
  const storage = await createSelectableStorage(browser, fetcher, { pickerAvailable: false });
  assert.equal(storage.getMode(), 'project');
  assert.equal(JSON.parse(browser.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 122);
  assert.equal(await storage.switchMode('browser'), true);
  assert.equal(storage.getMode(), 'browser');
  assert.equal(JSON.parse(browser.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 151);
});

test('switch to project files copies browser values and leaves browser source intact', async () => {
  const browser = memoryStorage();
  browser.setItem(STORAGE_MODE_KEY, 'browser');
  const settings = createMatchSettingsStore({ characters: CHARACTERS,
    storage: { getItem: () => null, setItem() {} } }).exportData();
  settings.fighters.left.warrior.health = 155;
  browser.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  let imported = null;
  const fetcher = async (url, options = {}) => {
    if (url.endsWith('/bootstrap')) return response(200, { settings: null, presets: null,
      revisions: { settings: 'one', presets: 'two' }, exists: { settings: false, presets: false } });
    if (url.endsWith('/backup') && options.method === 'POST') {
      imported = JSON.parse(options.body);
      return response(200, { ...imported, revisions: { settings: 'after', presets: 'after' } });
    }
    if (url.endsWith('/backup')) return response(200, { format: 'arena-duel.backup', version: 1, settings: null, presets: null });
    throw new Error('Unexpected API call');
  };
  const storage = await createSelectableStorage(browser, fetcher, { pickerAvailable: false });
  assert.equal(await storage.switchMode('project'), true);
  assert.equal(storage.getMode(), 'project');
  assert.equal(imported.settings.fighters.left.warrior.health, 155);
  assert.equal(JSON.parse(browser.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 155);
});

test('folder mode is unavailable when the picker is unsupported', async () => {
  const browser = memoryStorage();
  browser.setItem(STORAGE_MODE_KEY, 'browser');
  const storage = await createSelectableStorage(browser, async () => { throw new Error('Unexpected API call'); },
    { pickerAvailable: false });
  assert.equal(storage.folderAvailable(), false);
  await assert.rejects(storage.switchMode('folder'));
  assert.equal(storage.getMode(), 'browser');
});

test('switch merges independent folder values and asks before overlapping values', async () => {
  const browser = memoryStorage();
  browser.setItem(STORAGE_MODE_KEY, 'browser');
  const source = factorySettings();
  source.fighters.left.warrior.health = 130;
  browser.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(source));
  const folder = memoryDirectory();
  const destination = await createFolderStorage(folder, memoryStorage(), 'seed');
  const existing = factorySettings();
  existing.fighters.right.archer.health = 140;
  await destination.importBackup(backup(existing, null));
  destination.dispose();
  const handles = { get: async () => null, put: async () => {} };
  const storage = await createSelectableStorage(browser, async () => { throw new Error('No API'); },
    { pickerAvailable: true, handleStore: handles });
  assert.equal(await storage.switchMode('folder', { handle: folder,
    chooseOverlaps: () => { throw new Error('No overlap expected'); } }), true);
  const combined = (await storage.exportBackup()).settings;
  assert.equal(combined.fighters.left.warrior.health, 130);
  assert.equal(combined.fighters.right.archer.health, 140);
  assert.equal(JSON.parse(browser.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.right.archer.health,
    source.fighters.right.archer.health);

  const secondBrowser = memoryStorage();
  secondBrowser.setItem(STORAGE_MODE_KEY, 'browser');
  const other = factorySettings();
  other.fighters.left.warrior.health = 125;
  secondBrowser.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(other));
  const choice = await createSelectableStorage(secondBrowser, async () => { throw new Error('No API'); },
    { pickerAvailable: true, handleStore: handles });
  let overlaps;
  await choice.switchMode('folder', { handle: folder, chooseOverlaps: paths => { overlaps = paths; return 'destination'; } });
  assert.ok(overlaps.includes('fighters.left.warrior.health'));
  assert.equal((await choice.exportBackup()).settings.fighters.left.warrior.health, 130);
  assert.equal(JSON.parse(secondBrowser.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 125);
});

test('failed project write leaves browser mode and source data active', async () => {
  const browser = memoryStorage();
  browser.setItem(STORAGE_MODE_KEY, 'browser');
  const settings = factorySettings();
  settings.fighters.left.warrior.health = 161;
  browser.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  const fetcher = async (url, options = {}) => {
    if (url.endsWith('/bootstrap')) return response(200, { settings: null, presets: null,
      revisions: { settings: 'one', presets: 'two' }, exists: { settings: false, presets: false } });
    if (url.endsWith('/backup') && options.method === 'POST') return response(500, { error: 'disk failure' });
    if (url.endsWith('/backup')) return response(200, backup());
    throw new Error('Unexpected API call');
  };
  const storage = await createSelectableStorage(browser, fetcher, { pickerAvailable: false });
  await assert.rejects(storage.switchMode('project'));
  assert.equal(storage.getMode(), 'browser');
  assert.equal(JSON.parse(browser.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 161);
});
