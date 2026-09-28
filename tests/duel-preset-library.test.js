import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS, CHARACTER_BY_ID } from '../src/scripts/config/characters.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import { createDuelRecipe, parseDuelRecipe, stringifyDuelRecipe } from '../src/scripts/share/duel-share-codec.js';
import { applyImportedDuel } from '../src/scripts/share/duel-transfer-controller.js';
import {
  PRESET_LIBRARY_KEY, createBuiltinPresets, createDuelPresetLibrary, firstTwoFighterRecipe,
  uniquePresetName
} from '../src/scripts/share/duel-preset-library.js';

function memoryStorage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

function recipeFor(left = 'warrior', right = 'archer') {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: memoryStorage() });
  const selectedCharacters = { left: CHARACTER_BY_ID[left], right: CHARACTER_BY_ID[right] };
  return createDuelRecipe({ selectedCharacters, setup: settings.snapshot(selectedCharacters) });
}

test('built-in matchups are valid default recipes', () => {
  const presets = createBuiltinPresets(CHARACTERS);
  assert.deepEqual(presets.map(item => [item.recipe.fighters.left.characterId, item.recipe.fighters.right.characterId]), [
    ['warrior', 'archer'], ['guardian', 'mage'], ['priest', 'beastmaster']
  ]);
  for (const item of presets) {
    assert.equal(item.builtIn, true);
    assert.equal(item.recipe.arena.fighterCount, 2);
    assert.deepEqual(parseDuelRecipe(stringifyDuelRecipe(item.recipe), { characters: CHARACTERS }).fighters, item.recipe.fighters);
  }
});

test('personal presets persist separately and support save, rename, replace, and delete', () => {
  const storage = memoryStorage();
  let nextId = 1;
  const options = { characters: CHARACTERS, storage, idFactory: () => String(nextId++) };
  const library = createDuelPresetLibrary(options);
  const first = library.save('My Duel', recipeFor());
  const second = library.save('My Duel', recipeFor('mage', 'guardian'));
  assert.equal(second.name, 'My Duel (2)');
  assert.equal(parseDuelRecipe(stringifyDuelRecipe(second.recipe), { characters: CHARACTERS }).fighters.left.characterId, 'mage');
  assert.equal(library.collision('my duel').id, first.id);
  assert.equal(library.rename(second.id, 'My Duel').name, 'My Duel (2)');
  assert.equal(library.rename(second.id, 'My Duel', { replaceId: first.id }).name, 'My Duel');
  assert.deepEqual(library.list().map(item => item.id), [second.id]);
  assert.equal(createDuelPresetLibrary(options).list()[0].recipe.fighters.left.characterId, 'mage');
  assert.ok(storage.getItem(PRESET_LIBRARY_KEY));
  library.remove(second.id);
  assert.deepEqual(createDuelPresetLibrary(options).list(), []);
});

test('reserved names and duplicate copies remain unique', () => {
  assert.equal(uniquePresetName('Warrior vs Archer', ['Warrior vs Archer']), 'Warrior vs Archer (2)');
  const library = createDuelPresetLibrary({ characters: CHARACTERS, storage: memoryStorage(), idFactory: () => 'one' });
  const saved = library.save('Warrior vs Archer', recipeFor(), { reservedNames: ['Warrior vs Archer'] });
  assert.equal(saved.name, 'Warrior vs Archer (2)');
});

test('invalid imports and failed storage writes leave the library unchanged', () => {
  const valid = recipeFor();
  const broken = structuredClone(valid);
  broken.fighters.left.characterId = 'not-a-character';
  const storage = memoryStorage();
  const library = createDuelPresetLibrary({ characters: CHARACTERS, storage, idFactory: () => 'one' });
  assert.throws(() => library.save('Broken', broken));
  assert.deepEqual(library.list(), []);
  const saved = library.save('Valid', valid);
  storage.setItem = () => { throw new Error('Storage full'); };
  assert.throws(() => library.rename(saved.id, 'Changed'), /Storage full/);
  assert.equal(library.get(saved.id).name, 'Valid');
  assert.throws(() => library.remove(saved.id), /Storage full/);
  assert.equal(library.list().length, 1);
});

test('larger recipes retain all fighters in the library and load only the visible two on request', () => {
  const characters = { left: CHARACTER_BY_ID.warrior, right: CHARACTER_BY_ID.archer, third: CHARACTER_BY_ID.mage };
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: memoryStorage() });
  settings.setArenaValue('fighterCount', 3);
  const full = createDuelRecipe({ selectedCharacters: characters, setup: settings.snapshot(characters) });
  const library = createDuelPresetLibrary({ characters: CHARACTERS, storage: memoryStorage(), idFactory: () => 'three' });
  library.save('Three Fighters', full);
  assert.equal(library.get('three').recipe.arena.fighterCount, 3);
  assert.equal(Object.keys(library.get('three').recipe.fighters).length, 3);

  const visible = firstTwoFighterRecipe(full, CHARACTERS);
  const parsed = parseDuelRecipe(stringifyDuelRecipe(visible), { characters: CHARACTERS });
  assert.equal(parsed.arena.fighterCount, 2);
  assert.deepEqual(Object.keys(parsed.fighters), ['left', 'right']);
  const state = { left: CHARACTER_BY_ID.priest, right: CHARACTER_BY_ID.guardian, side: 'right' };
  applyImportedDuel({ recipe: parsed, settings, state, characterById: CHARACTER_BY_ID });
  assert.equal(state.left.id, 'warrior');
  assert.equal(state.right.id, 'archer');
  assert.equal(settings.getArena().fighterCount, 2);
  assert.equal(library.get('three').recipe.arena.fighterCount, 3);
});

test('four-fighter presets also create a valid first-two duel without changing the source', () => {
  const selected = {
    left: CHARACTER_BY_ID.warrior, right: CHARACTER_BY_ID.archer,
    third: CHARACTER_BY_ID.mage, fourth: CHARACTER_BY_ID.priest
  };
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: memoryStorage() });
  settings.setArenaValue('fighterCount', 4);
  const full = createDuelRecipe({ selectedCharacters: selected, setup: settings.snapshot(selected) });
  const visible = firstTwoFighterRecipe(full, CHARACTERS);
  assert.equal(full.arena.fighterCount, 4);
  assert.equal(Object.keys(full.fighters).length, 4);
  assert.equal(parseDuelRecipe(stringifyDuelRecipe(visible), { characters: CHARACTERS }).arena.fighterCount, 2);
});
