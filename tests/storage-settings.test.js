import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bindStorageSettings, createStorageConflictPrompt } from '../src/scripts/data/storage-settings.js';

const node = () => ({ hidden: false, textContent: '', listeners: {},
  addEventListener(type, handler) { this.listeners[type] = handler; },
  removeEventListener(type) { delete this.listeners[type]; },
  focus() { this.focused = true; }, click() { this.clicked = true; } });

test('settings expose three localized modes and a readable JSON preview', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /<option value="browser" data-i18n="storage.mode_browser"/);
  assert.match(html, /<option value="project" data-i18n="storage.mode_project"/);
  assert.match(html, /<option value="folder" data-i18n="storage.mode_folder"/);
  assert.match(html, /id="storage-preview-dialog"/);
  const ids = ['storage-mode', 'storage-location', 'storage-save-state', 'storage-folder-help', 'storage-unsupported',
    'storage-change-folder', 'storage-reconnect', 'storage-preview', 'storage-export', 'storage-import',
    'storage-import-file', 'storage-error', 'storage-preview-dialog', 'storage-preview-json',
    'storage-preview-close', 'storage-preview-copy'];
  const elements = Object.fromEntries(ids.map(id => [id, node()]));
  const folderOption = {};
  elements['storage-mode'].querySelector = () => folderOption;
  elements['storage-preview-dialog'].showModal = function () { this.open = true; };
  elements['storage-preview-dialog'].close = function () { this.open = false; this.listeners.close(); };
  const value = { format: 'arena-duel.backup', version: 1, settings: null, presets: null };
  const storage = { getSaveState: () => ({ state: 'saved', mode: 'browser' }), getMode: () => 'browser',
    folderAvailable: () => false, subscribeSaveState: callback => callback(storage.getSaveState()),
    whenSettled: async () => {}, exportBackup: async () => value };
  const i18n = { t: key => key, subscribe() {} };
  bindStorageSettings({ elements, storage, i18n, saveUI: { startProjectHandoff() {} } });
  assert.equal(folderOption.disabled, true);
  assert.equal(elements['storage-unsupported'].hidden, false);
  assert.equal(elements['storage-mode'].value, 'browser');
  await elements['storage-preview'].listeners.click();
  assert.equal(elements['storage-preview-dialog'].open, true);
  assert.deepEqual(JSON.parse(elements['storage-preview-json'].textContent), value);
  elements['storage-preview-close'].listeners.click();
  assert.equal(elements['storage-preview'].focused, true);
});

test('overlap dialog offers current, destination, and cancel without treating Escape as a choice', async () => {
  const ids = ['storage-conflict-dialog', 'storage-conflict-current', 'storage-conflict-destination',
    'storage-conflict-cancel', 'storage-conflict-message'];
  const elements = Object.fromEntries(ids.map(id => [id, node()]));
  const dialog = elements['storage-conflict-dialog'];
  dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; };
  const ask = createStorageConflictPrompt(elements, { t: (key, values) => `${key}:${values.count}` });
  const first = ask(['a']);
  elements['storage-conflict-current'].listeners.click();
  assert.equal(await first, 'source');
  const second = ask(['a', 'b']);
  elements['storage-conflict-destination'].listeners.click();
  assert.equal(await second, 'destination');
  const third = ask(['a']);
  dialog.listeners.close();
  assert.equal(await third, null);
});
