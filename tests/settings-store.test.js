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
  assert.deepEqual(store.getFighter('left', 'mage').attack, [3, 2, 5]);
  assert.equal(CHARACTERS[0].stats.speed, 5);
});

test('legacy untouched mage defaults migrate to the Arcane Weave values', () => {
  const storage = createStorage({
    [MATCH_SETTINGS_STORAGE_KEY]: JSON.stringify({
      version: 1,
      fighters: {
        left: { mage: { attack: [1, 2, 3], attackCD: [2, 2, 2] } },
        right: { mage: { attack: [1, 2, 3], attackCD: [2, 2, 2] } }
      },
      arena: {}
    })
  });
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  assert.deepEqual(store.getFighter('left', 'mage').attack, [3, 2, 5]);
  assert.deepEqual(store.getFighter('right', 'mage').attackCD, [1.6, 1.9, 2.5]);
});

test('fighter values are clamped and remain independent by side and character', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setFighterValue('left', 'warrior', 'health', 999);
  store.setFighterValue('left', 'mage', 'attack', 17, 1);
  store.setFighterValue('right', 'warrior', 'health', 40);
  store.setFighterValue('left', 'archer', 'projectileSpeed', 9999);
  store.setFighterValue('left', 'warrior', 'attackRange', 999);
  assert.equal(store.getFighter('left', 'warrior').health, 300);
  assert.equal(store.getFighter('right', 'warrior').health, 40);
  assert.deepEqual(store.getFighter('left', 'mage').attack, [3, 17, 5]);
  assert.deepEqual(store.getFighter('right', 'mage').attack, [3, 2, 5]);
  assert.equal(store.getFighter('left', 'archer').projectileSpeed, 1200);
  assert.equal(store.getFighter('left', 'warrior').attackRange, 300);
});

test('trait settings are configurable and a saved character default is reused on reset', () => {
  const storage = createStorage();
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  store.setTraitValue('left', 'archer', 'every', 3);
  store.setTraitValue('left', 'archer', 'rootDuration', 1.24);
  store.setCharacterDefault('left', 'archer');
  store.setTraitValue('left', 'archer', 'every', 8);
  store.resetFighter('left', 'archer');
  assert.equal(store.getFighter('left', 'archer').trait.every, 3);
  assert.equal(store.getFighter('left', 'archer').trait.rootDuration, 1.24);

  const restored = createMatchSettingsStore({ characters: CHARACTERS, storage });
  restored.resetFighter('right', 'archer');
  assert.equal(restored.getFighter('right', 'archer').trait.every, 3);
});

test('saved character defaults include mage ability settings', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setMageAbilityValue('left', 'mage', 'effects.iceSlowDuration', 3.5);
  store.setCharacterDefault('left', 'mage');
  store.setMageAbilityValue('left', 'mage', 'effects.iceSlowDuration', 0.5);
  store.resetFighter('left', 'mage');
  assert.equal(store.getFighter('left', 'mage').abilities.effects.iceSlowDuration, 3.5);
});

test('Priest ability values clamp and are preserved in saved character defaults', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setPriestAbilityValue('left', 'priest', 'prayerCooldown', 99);
  store.setPriestAbilityValue('left', 'priest', 'decayFloor', 7);
  store.setPriestAbilityValue('left', 'priest', 'markMoveSlowPerMark', 1);
  store.setCharacterDefault('left', 'priest');
  store.setPriestAbilityValue('left', 'priest', 'decayFloor', 0);
  store.resetFighter('left', 'priest');
  const abilities = store.getFighter('left', 'priest').abilities;
  assert.equal(abilities.prayerCooldown, 20);
  assert.equal(abilities.decayFloor, 7);
  assert.equal(abilities.markMoveSlowPerMark, 0.25);
});

test('arena constraints, collision modes, launch delay, and contact stop duration are normalized', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setArenaValue('size', 600);
  store.setArenaValue('fighterSize', 160);
  store.setArenaValue('startingDistance', 1000);
  store.setArenaValue('launchDelay', 3.5);
  store.setArenaValue('contactStopDuration', 1.26);
  store.setArenaValue('collisionMode', 'pass');
  const arena = store.getArena();
  assert.equal(arena.startingDistance, 440);
  assert.equal(arena.launchDelay, 3500);
  assert.equal(arena.contactStopDuration, 1.26);
  assert.equal(arena.collisionMode, 'pass');
  assert.throws(() => store.setArenaValue('collisionMode', 'merge'), /Unknown collision mode/);
});

test('advanced tuning preserves finite out-of-range values and clamps them on exit', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setAdvanced(true);
  store.setFighterValue('left', 'warrior', 'attack', 123.4);
  store.setArenaValue('size', 2400);
  assert.equal(store.getAdvanced(), true);
  assert.equal(store.getFighter('left', 'warrior').attack[0], 123.4);
  assert.equal(store.getArena().size, 2400);
  store.setAdvanced(false);
  assert.equal(store.getAdvanced(), false);
  assert.equal(store.getFighter('left', 'warrior').attack[0], 50);
  assert.equal(store.getArena().size, 1600);
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
