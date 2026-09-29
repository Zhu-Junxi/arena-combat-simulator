import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHARACTERS } from '../src/scripts/config/characters.js';
import { defaultFighterSettings } from '../src/scripts/config/customization.js';
import { createCharacterDefault, parseCharacterDefault } from '../src/scripts/data/character-default-codec.js';

for (const character of CHARACTERS.filter(item => !item.locked)) {
  test(`${character.id} factory character JSON round trips with duel-shaped stats`, async () => {
    const text = await readFile(new URL(`../data/characters/factory/${character.id}.json`, import.meta.url), 'utf8');
    const parsed = parseCharacterDefault(text);
    assert.equal(parsed.characterId, character.id);
    assert.deepEqual(parsed.stats, defaultFighterSettings(character));
    assert.deepEqual(parseCharacterDefault(createCharacterDefault(character.id, parsed.stats)), parsed);
  });
}

test('character import rejects a wrong ID and invalid stats', () => {
  const warrior = defaultFighterSettings(CHARACTERS.find(item => item.id === 'warrior'));
  assert.throws(() => parseCharacterDefault(createCharacterDefault('unknown', warrior)));
  assert.throws(() => parseCharacterDefault(createCharacterDefault('warrior', { ...warrior, health: -2 })));
});
