import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectStorage } from '../src/scripts/data/project-storage.js';
import { MATCH_SETTINGS_STORAGE_KEY } from '../src/scripts/config/customization.js';
import { PRESET_LIBRARY_KEY } from '../src/scripts/share/duel-preset-library.js';
import { CHARACTERS } from '../src/scripts/config/characters.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';

function memory() {
  const map = new Map();
  return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) };
}
const response = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const empty = () => ({ settings: null, presets: null,
  revisions: { settings: 'initial-settings', presets: 'initial-presets' },
  exists: { settings: false, presets: false } });

test('offline edits stay in browser storage and synchronize after reconnect', async () => {
  const browser = memory();
  let online = false;
  let saved = null;
  const fetcher = async (url, options = {}) => {
    if (!online) throw new Error('offline');
    if (url.endsWith('/bootstrap')) return response(200, empty());
    if (url.endsWith('/settings') && options.method === 'PUT') {
      assert.equal(options.headers['If-Match'], 'initial-settings');
      saved = JSON.parse(options.body);
      return response(200, { revision: 'saved-settings' });
    }
    throw new Error(`Unexpected request ${url}`);
  };
  const storage = await createProjectStorage(browser, fetcher);
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  store.setFighterValue('left', 'warrior', 'health', 119);
  assert.equal(await store.whenPersisted(), false);
  assert.ok(browser.getItem(MATCH_SETTINGS_STORAGE_KEY));
  online = true;
  store.setFighterValue('left', 'warrior', 'health', 121);
  assert.equal(await store.whenPersisted(), true);
  assert.equal(saved.fighters.left.warrior.health, 121);
});

test('file data wins over legacy browser data and stale writes retain edits', async () => {
  const browser = memory();
  browser.setItem(PRESET_LIBRARY_KEY, JSON.stringify({ version: 1, entries: [] }));
  const files = empty();
  files.presets = { version: 1, entries: [] };
  files.exists.presets = true;
  let writes = 0;
  const fetcher = async (url, options = {}) => {
    if (url.endsWith('/bootstrap')) return response(200, files);
    if (options.method === 'PUT') { writes += 1; return response(409, { error: 'stale' }); }
    throw new Error('Unexpected request');
  };
  const storage = await createProjectStorage(browser, fetcher);
  assert.equal(storage.getItem(PRESET_LIBRARY_KEY), JSON.stringify(files.presets));
  await assert.rejects(storage.setItem(PRESET_LIBRARY_KEY, JSON.stringify({ version: 1, entries: [] })));
  assert.equal(writes, 1);
  assert.equal(storage.hasConflict(), true);
  assert.ok(storage.getItem(PRESET_LIBRARY_KEY));
  storage.discardLocalEdits();
  assert.equal(storage.hasConflict(), false);
  assert.equal(browser.getItem('arena-duel.project-pending.presets'), null);
});

test('valid older browser settings migrate only when no project file exists', async () => {
  const browser = memory();
  browser.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 3, advanced: false,
    fighters: { left: { warrior: { health: 144 } } }, arena: {} }));
  let migrated = null;
  const fetcher = async (url, options = {}) => {
    if (url.endsWith('/bootstrap')) return response(200, empty());
    if (url.endsWith('/settings') && options.method === 'PUT') {
      migrated = JSON.parse(options.body);
      return response(200, { revision: 'migrated' });
    }
    throw new Error('Unexpected request');
  };
  const storage = await createProjectStorage(browser, fetcher);
  assert.equal(migrated.version, 4);
  assert.equal(migrated.fighters.left.warrior.health, 144);
  assert.equal(JSON.parse(storage.getItem(MATCH_SETTINGS_STORAGE_KEY)).version, 4);
});

test('offline edits survive a reload and keep their recorded file revision', async () => {
  const browser = memory();
  const savedSettings = createMatchSettingsStore({ characters: CHARACTERS,
    storage: { getItem: () => null, setItem() {} } }).exportData();
  const files = { ...empty(), settings: savedSettings, exists: { settings: true, presets: false } };
  let online = true;
  let revision = 'initial-settings';
  let writes = 0;
  const fetcher = async (url, options = {}) => {
    if (!online) throw new Error('offline');
    if (url.endsWith('/bootstrap')) return response(200, { ...files, revisions: { ...files.revisions, settings: revision } });
    if (url.endsWith('/settings') && options.method === 'PUT') {
      writes += 1;
      if (options.headers['If-Match'] !== revision) return response(409, { error: 'stale' });
      revision = 'next-settings';
      return response(200, { revision });
    }
    throw new Error('Unexpected request');
  };
  const first = await createProjectStorage(browser, fetcher);
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: first });
  online = false;
  store.setFighterValue('left', 'warrior', 'health', 130);
  assert.equal(await store.whenPersisted(), false);
  online = true;
  const second = await createProjectStorage(browser, fetcher);
  assert.equal(JSON.parse(second.getItem(MATCH_SETTINGS_STORAGE_KEY)).fighters.left.warrior.health, 130);
  await second.setItem(MATCH_SETTINGS_STORAGE_KEY, second.getItem(MATCH_SETTINGS_STORAGE_KEY));
  assert.equal(writes, 1);
  assert.equal(browser.getItem('arena-duel.project-pending.settings'), null);
});

test('a full backup imported offline synchronizes as one revision-checked replacement', async () => {
  const browser = memory();
  let online = false;
  let imported = null;
  const fetcher = async (url, options = {}) => {
    if (!online) throw new Error('offline');
    if (url.endsWith('/bootstrap')) return response(200, empty());
    if (url.endsWith('/backup') && options.method === 'POST') {
      assert.equal(options.headers['X-Settings-Revision'], 'initial-settings');
      imported = JSON.parse(options.body);
      return response(200, { settings: null, presets: { version: 1, entries: [] },
        revisions: { settings: 'after-settings', presets: 'after-presets' } });
    }
    throw new Error('Unexpected request');
  };
  const backup = { format: 'arena-duel.backup', version: 1, settings: null, presets: { version: 1, entries: [] } };
  const first = await createProjectStorage(browser, fetcher);
  await first.importBackup(backup);
  assert.deepEqual(await first.exportBackup(), backup);
  online = true;
  const second = await createProjectStorage(browser, fetcher);
  assert.equal(await second.syncPending(), true);
  assert.deepEqual(imported, backup);
  assert.equal(browser.getItem('arena-duel.project-pending.backup'), null);
});

test('legacy character defaults migrate only for fighters without override files', async () => {
  const browser = memory();
  const legacyStore = createMatchSettingsStore({ characters: CHARACTERS,
    storage: { getItem: () => null, setItem() {} } });
  legacyStore.setFighterValue('left', 'mage', 'health', 166);
  legacyStore.setCharacterDefault('left', 'mage');
  legacyStore.setFighterValue('left', 'warrior', 'health', 177);
  legacyStore.setCharacterDefault('left', 'warrior');
  browser.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(legacyStore.exportData()));
  const serverStore = createMatchSettingsStore({ characters: CHARACTERS,
    storage: { getItem: () => null, setItem() {} } });
  serverStore.setFighterValue('left', 'warrior', 'health', 123);
  serverStore.setCharacterDefault('left', 'warrior');
  let merged = null;
  const fetcher = async (url, options = {}) => {
    if (url.endsWith('/bootstrap')) return response(200, { ...empty(), settings: serverStore.exportData(),
      exists: { settings: true, presets: false },
      filePresence: { match: true, characterOverrides: ['warrior'], presetIndex: false } });
    if (url.endsWith('/settings') && options.method === 'PUT') {
      merged = JSON.parse(options.body);
      return response(200, { revision: 'migrated-defaults' });
    }
    throw new Error('Unexpected request');
  };
  const storage = await createProjectStorage(browser, fetcher);
  assert.equal(merged.characterDefaults.warrior.health, 123);
  assert.equal(merged.characterDefaults.mage.health, 166);
  assert.equal(JSON.parse(storage.getItem(MATCH_SETTINGS_STORAGE_KEY)).characterDefaults.mage.health, 166);
});
