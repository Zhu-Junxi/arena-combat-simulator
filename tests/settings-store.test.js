import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS } from '../src/scripts/config/characters.js';
import { MATCH_SETTINGS_STORAGE_KEY } from '../src/scripts/config/customization.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    value: key => values.get(key)
  };
}

test('settings defaults activate character speed ratings without mutating characters', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  assert.equal(store.getFighter('left', 'warrior').movementSpeed, 220);
  assert.equal(store.getFighter('left', 'archer').movementSpeed, 132);
  assert.deepEqual(store.getFighter('left', 'mage').attack, [1, 2, 3]);
  assert.equal(CHARACTERS[0].stats.speed, 5);
});

test('fighter values are clamped and remain independent by side and character', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setFighterValue('left', 'warrior', 'health', 999);
  store.setFighterValue('left', 'mage', 'attack', 17, 1);
  store.setFighterValue('right', 'warrior', 'health', 40);
  assert.equal(store.getFighter('left', 'warrior').health, 300);
  assert.equal(store.getFighter('right', 'warrior').health, 40);
  assert.deepEqual(store.getFighter('left', 'mage').attack, [1, 17, 3]);
  assert.deepEqual(store.getFighter('right', 'mage').attack, [1, 2, 3]);
});

test('arena constraints, collision modes, and launch delay are normalized', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setArenaValue('size', 600);
  store.setArenaValue('fighterSize', 160);
  store.setArenaValue('startingDistance', 1000);
  store.setArenaValue('launchDelay', 3.5);
  store.setArenaValue('collisionMode', 'pass');
  const arena = store.getArena();
  assert.equal(arena.startingDistance, 440);
  assert.equal(arena.launchDelay, 3500);
  assert.equal(arena.collisionMode, 'pass');
  assert.throws(() => store.setArenaValue('collisionMode', 'merge'), /Unknown collision mode/);
});

test('settings persist, hydrate, reject malformed values, notify, and reset', () => {
  const storage = createStorage();
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  const changes = [];
  store.subscribe(change => changes.push(change));
  store.setFighterValue('left', 'archer', 'attackCD', 1.25, 0);
  store.setArenaValue('timeScale', 1.7);
  assert.equal(changes.length, 2);

  const restored = createMatchSettingsStore({ characters: CHARACTERS, storage });
  assert.equal(restored.getFighter('left', 'archer').attackCD[0], 1.25);
  assert.equal(restored.getArena().timeScale, 1.7);
  restored.resetFighter('left', 'archer');
  assert.equal(restored.getFighter('left', 'archer').attackCD[0], 2.5);
  restored.resetAll();
  assert.equal(restored.getArena().timeScale, 1);

  storage.setItem(MATCH_SETTINGS_STORAGE_KEY, '{broken');
  const recovered = createMatchSettingsStore({ characters: CHARACTERS, storage, logger: { warn() {} } });
  assert.equal(recovered.getFighter('left', 'warrior').health, 100);
  storage.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify({ version: 99, fighters: { left: { warrior: { health: 250 } } } }));
  const outdated = createMatchSettingsStore({ characters: CHARACTERS, storage });
  assert.equal(outdated.getFighter('left', 'warrior').health, 100);
});

test('match snapshots contain only selected side settings and are deeply frozen', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setFighterValue('left', 'warrior', 'health', 155);
  const snapshot = store.snapshot({ left: CHARACTERS[0], right: CHARACTERS[1] });
  assert.equal(snapshot.fighters.left.health, 155);
  assert.equal(snapshot.fighters.right.health, 80);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.fighters.left.attack));
});
