import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS, CHARACTER_BY_ID } from '../src/scripts/config/characters.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import {
  DUEL_SHARE_FORMAT,
  DUEL_SHARE_VERSION,
  createDuelRecipe,
  parseDuelRecipe,
  stringifyDuelRecipe
} from '../src/scripts/share/duel-share-codec.js';
import { applyImportedDuel } from '../src/scripts/share/duel-transfer-controller.js';

function createStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

function createRecipe() {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  store.setFighterValue('left', 'mage', 'health', 135);
  store.setFighterValue('left', 'mage', 'attack', 17, 1);
  store.setFighterValue('right', 'archer', 'movementSpeed', 180);
  store.setArenaValue('size', 1200);
  store.setArenaValue('launchDelay', 3.5);
  const selectedCharacters = { left: CHARACTER_BY_ID.mage, right: CHARACTER_BY_ID.archer };
  return createDuelRecipe({ selectedCharacters, setup: store.snapshot(selectedCharacters) });
}

test('duel recipes round trip selected fighters, multi-mode stats, and arena values', () => {
  const recipe = createRecipe();
  assert.equal(recipe.format, DUEL_SHARE_FORMAT);
  assert.equal(recipe.version, DUEL_SHARE_VERSION);
  assert.equal(recipe.fighters.left.characterId, 'mage');
  assert.deepEqual(recipe.fighters.left.stats.attack, [3, 17, 5]);
  assert.equal(recipe.fighters.right.stats.trait.every, 4);
  assert.equal(recipe.arena.launchDelay, 3.5);
  assert.equal(recipe.arena.contactStopDuration, 0.5);
  const parsed = parseDuelRecipe(stringifyDuelRecipe(recipe), { characters: CHARACTERS });
  assert.deepEqual(parsed, { fighters: recipe.fighters, arena: recipe.arena });
});

test('duel recipes preserve Priest ability settings', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  settings.setPriestAbilityValue('left', 'priest', 'decayAmount', 4);
  settings.setPriestAbilityValue('left', 'priest', 'prayerCooldown', 8.5);
  const selectedCharacters = { left: CHARACTER_BY_ID.priest, right: CHARACTER_BY_ID.archer };
  const recipe = createDuelRecipe({ selectedCharacters, setup: settings.snapshot(selectedCharacters) });
  const parsed = parseDuelRecipe(stringifyDuelRecipe(recipe), { characters: CHARACTERS });
  assert.equal(parsed.fighters.left.stats.abilities.decayAmount, 4);
  assert.equal(parsed.fighters.left.stats.abilities.prayerCooldown, 8.5);
});

test('duel recipe parsing rejects bad files without applying a partial import', () => {
  const recipe = createRecipe();
  assert.throws(() => parseDuelRecipe('{bad', { characters: CHARACTERS }), /valid JSON/);
  assert.throws(() => parseDuelRecipe(JSON.stringify({ ...recipe, version: 99 }), { characters: CHARACTERS }), /version/);
  const unavailable = structuredClone(recipe);
  unavailable.fighters.left.characterId = 'missing';
  assert.throws(() => parseDuelRecipe(JSON.stringify(unavailable), { characters: CHARACTERS }), /unavailable/);
  const malformed = structuredClone(recipe);
  malformed.fighters.left.stats.attack = 17;
  assert.throws(() => parseDuelRecipe(JSON.stringify(malformed), { characters: CHARACTERS }), /attack/);
  const outOfRange = structuredClone(recipe);
  outOfRange.arena.timeScale = 9;
  assert.throws(() => parseDuelRecipe(JSON.stringify(outOfRange), { characters: CHARACTERS }), /timeScale/);
});

test('applying a parsed duel is atomic, persists it, and retains unrelated presets', () => {
  const storage = createStorage();
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  store.setFighterValue('left', 'warrior', 'health', 225);
  const changes = [];
  store.subscribe(change => changes.push(change));
  const parsed = parseDuelRecipe(stringifyDuelRecipe(createRecipe()), { characters: CHARACTERS });
  store.applyDuel(parsed);
  const snapshot = store.snapshot({ left: CHARACTER_BY_ID.mage, right: CHARACTER_BY_ID.archer });
  assert.equal(snapshot.fighters.left.health, 135);
  assert.deepEqual(snapshot.fighters.left.attack, [3, 17, 5]);
  assert.equal(snapshot.fighters.right.movementSpeed, 180);
  assert.equal(snapshot.arena.launchDelay, 3500);
  assert.equal(store.getFighter('left', 'warrior').health, 225);
  assert.deepEqual(changes, [{ scope: 'duel', imported: true }]);
  assert.ok(storage.getItem('arena-duel.match-settings.v1'));
  assert.throws(() => store.applyDuel({ fighters: { left: parsed.fighters.left, right: { characterId: 'missing' } }, arena: parsed.arena }));
  assert.equal(store.getFighter('left', 'mage').health, 135);
});

test('applying an imported duel restores the selected characters', () => {
  const state = { left: CHARACTER_BY_ID.warrior, right: CHARACTER_BY_ID.archer, side: 'right' };
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: createStorage() });
  const recipe = parseDuelRecipe(stringifyDuelRecipe(createRecipe()), { characters: CHARACTERS });
  applyImportedDuel({ recipe, settings, state, characterById: CHARACTER_BY_ID });
  assert.equal(state.left.id, 'mage');
  assert.equal(state.right.id, 'archer');
  assert.equal(state.side, 'left');
  assert.equal(settings.snapshot(state).fighters.left.health, 135);
});
