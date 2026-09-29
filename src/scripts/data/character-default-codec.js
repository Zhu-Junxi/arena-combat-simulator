import { CHARACTERS } from '../config/characters.js';
import { defaultArenaSettings } from '../config/customization.js';
import { DUEL_SHARE_VERSION, parseDuelRecipe } from '../share/duel-share-codec.js';

export const CHARACTER_DEFAULT_FORMAT = 'arena-duel.character-default';
export const CHARACTER_DEFAULT_VERSION = 1;

export function createCharacterDefault(characterId, stats, advanced = false) {
  return { format: CHARACTER_DEFAULT_FORMAT, version: CHARACTER_DEFAULT_VERSION, characterId,
    advanced: Boolean(advanced), stats: JSON.parse(JSON.stringify(stats)) };
}

export function parseCharacterDefault(value, characters = CHARACTERS) {
  const source = typeof value === 'string' ? JSON.parse(value) : value;
  if (!source || typeof source !== 'object' || Array.isArray(source) ||
      source.format !== CHARACTER_DEFAULT_FORMAT || source.version !== CHARACTER_DEFAULT_VERSION ||
      typeof source.characterId !== 'string' || !source.stats ||
      Object.keys(source).some(key => !['format', 'version', 'characterId', 'advanced', 'stats'].includes(key)) ||
      (source.advanced != null && typeof source.advanced !== 'boolean')) throw new Error('Invalid character default JSON');
  const character = characters.find(item => item.id === source.characterId && !item.locked);
  if (!character) throw new Error('Unknown character default');
  const arena = defaultArenaSettings();
  const fighter = { characterId: character.id, stats: source.stats };
  const parsed = parseDuelRecipe(JSON.stringify({ format: 'arena-duel.duel', version: DUEL_SHARE_VERSION,
    advanced: Boolean(source.advanced), fighters: { left: fighter, right: fighter }, arena }), { characters });
  return createCharacterDefault(character.id, parsed.fighters.left.stats, Boolean(source.advanced));
}
