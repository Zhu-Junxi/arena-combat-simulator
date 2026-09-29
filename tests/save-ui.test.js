import test from 'node:test';
import assert from 'node:assert/strict';
import { bindSaveUI } from '../src/scripts/data/save-ui.js';

const backup = { format: 'arena-duel.backup', version: 1, settings: null,
  presets: { version: 1, entries: [] } };
const button = () => ({ hidden: true, handlers: {}, addEventListener(type, handler) { this.handlers[type] = handler; } });
function controls() {
  return { banner: { dataset: {}, hidden: true }, message: { textContent: '' }, move: button(),
    browser: button(), project: button(), retry: button() };
}
const i18n = { t: key => key, subscribe() {} };

test('Live Server handoff sends the backup only to the opened project tab and retains it on failure', async () => {
  const originalWindow = globalThis.window;
  const originalLocation = globalThis.location;
  const target = { messages: [], postMessage(message, origin) { this.messages.push({ message, origin }); } };
  const events = {};
  const assigned = [];
  let openedUrl;
  globalThis.window = { open: url => { openedUrl = url; return target; }, addEventListener: (type, handler) => { events[type] = handler; } };
  globalThis.location = { href: 'http://127.0.0.1:5500/', origin: 'http://127.0.0.1:5500', assign: url => assigned.push(url) };
  try {
    let exports = 0;
    const storage = { getSaveState: () => ({ state: 'waiting-for-server', liveServer: true }),
      subscribeSaveState: listener => listener(storage.getSaveState()),
      exportBackup: async () => { exports += 1; return backup; } };
    const ui = controls();
    bindSaveUI({ storage, i18n, ...ui });
    ui.move.handlers.click();
    const opened = new URL(openedUrl);
    assert.equal(opened.origin, 'http://127.0.0.1:4173');
    const nonce = opened.searchParams.get('handoff');
    await events.message({ origin: opened.origin, source: {}, data: { type: 'arena-duel-handoff', phase: 'ready', nonce } });
    assert.equal(exports, 0);
    await events.message({ origin: opened.origin, source: target, data: { type: 'arena-duel-handoff', phase: 'ready', nonce } });
    assert.equal(exports, 1);
    assert.deepEqual(target.messages[0], { origin: opened.origin,
      message: { type: 'arena-duel-handoff', phase: 'transfer', nonce, backup } });
    await events.message({ origin: opened.origin, source: target, data: { type: 'arena-duel-handoff', phase: 'failed', nonce } });
    assert.deepEqual(assigned, []);
    assert.equal(ui.message.textContent, 'save.handoff_failed');
    await events.message({ origin: opened.origin, source: target, data: { type: 'arena-duel-handoff', phase: 'done', nonce } });
    assert.deepEqual(assigned, ['http://127.0.0.1:4173/']);
    assert.equal(ui.banner.hidden, false);
  } finally {
    globalThis.window = originalWindow;
    globalThis.location = originalLocation;
  }
});

test('project tab imports a valid handoff before acknowledging the source tab', async () => {
  const originalWindow = globalThis.window;
  const originalLocation = globalThis.location;
  const events = {};
  const messages = [];
  const imported = [];
  const opener = { postMessage: (message, origin) => messages.push({ message, origin }) };
  const source = 'http://127.0.0.1:5500';
  const nonce = 'test-nonce';
  globalThis.window = { opener, closed: false,
    addEventListener: (type, handler) => { events[type] = handler; },
    close() { this.closed = true; } };
  globalThis.location = { href: `http://127.0.0.1:4173/?handoff=${nonce}&source=${encodeURIComponent(source)}`,
    origin: 'http://127.0.0.1:4173' };
  try {
    const storage = { getSaveState: () => ({ state: 'saved' }),
      subscribeSaveState: listener => listener(storage.getSaveState()),
      exportBackup: async () => ({ ...backup, presets: null }),
      importBackup: async value => { imported.push(value); } };
    bindSaveUI({ storage, i18n, ...controls() });
    assert.equal(messages[0].message.phase, 'ready');
    await events.message({ origin: source, source: opener,
      data: { type: 'arena-duel-handoff', phase: 'transfer', nonce, backup } });
    assert.deepEqual(imported, [backup]);
    assert.equal(messages.at(-1).message.phase, 'done');
    assert.equal(globalThis.window.closed, true);
  } finally {
    globalThis.window = originalWindow;
    globalThis.location = originalLocation;
  }
});
