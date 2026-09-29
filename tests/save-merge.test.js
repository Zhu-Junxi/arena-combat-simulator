import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeProjectSection } from '../src/scripts/data/merge-project-data.js';
import { mergeHandoff } from '../src/scripts/data/save-ui.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import { CHARACTERS } from '../src/scripts/config/characters.js';

const defaults = () => createMatchSettingsStore({ characters: CHARACTERS,
  storage: { getItem: () => null, setItem() {} } }).exportData();

test('settings merge preserves separate edits and reports overlapping values', () => {
  const base = defaults();
  const left = structuredClone(base);
  const right = structuredClone(base);
  left.fighters.left.warrior.health = 130;
  right.fighters.right.archer.health = 140;
  const safe = mergeProjectSection('settings', base, left, right);
  assert.deepEqual(safe.conflicts, []);
  assert.equal(safe.value.fighters.left.warrior.health, 130);
  assert.equal(safe.value.fighters.right.archer.health, 140);
  right.fighters.left.warrior.health = 150;
  const overlap = mergeProjectSection('settings', base, left, right);
  assert.deepEqual(overlap.conflicts, ['fighters.left.warrior.health']);
});

test('preset merge uses stable IDs and retains separate presets', () => {
  const base = { version: 1, entries: [] };
  const a = { id: 'a', name: 'A' };
  const b = { id: 'b', name: 'B' };
  const merged = mergeProjectSection('presets', base, { version: 1, entries: [a] }, { version: 1, entries: [b] });
  assert.deepEqual(merged.conflicts, []);
  assert.deepEqual(merged.value.entries.map(item => item.id), ['b', 'a']);
});

test('handoff fills absent project sections and merges separate settings', () => {
  const source = { format: 'arena-duel.backup', version: 1, settings: defaults(), presets: { version: 1, entries: [] } };
  const project = { format: 'arena-duel.backup', version: 1, settings: defaults(), presets: null };
  source.settings.fighters.left.warrior.health = 130;
  project.settings.fighters.right.archer.health = 140;
  const merged = mergeHandoff(source, project);
  assert.deepEqual(merged.conflicts, []);
  assert.equal(merged.value.settings.fighters.left.warrior.health, 130);
  assert.equal(merged.value.settings.fighters.right.archer.health, 140);
});
