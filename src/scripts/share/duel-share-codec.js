import { ARENA_CONTROLS, COLLISION_MODES, FIGHTER_CONTROLS, defaultFighterSettings } from '../config/customization.js';

export const DUEL_SHARE_FORMAT = 'arena-duel.duel';
export const DUEL_SHARE_VERSION = 1;

const SIDES = Object.freeze(['left', 'right']);
const FIGHTER_KEYS = Object.freeze(['health', 'attack', 'attackCD', 'movementSpeed']);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => value != null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`Invalid duel recipe: ${message}`); };

function exactKeys(value, keys, label) {
  if (!isObject(value) || Object.keys(value).length !== keys.length || !keys.every(key => hasOwn(value, key))) fail(`${label} has an invalid structure`);
}

function isControlValue(value, control) {
  if (!Number.isFinite(value) || value < control.min || value > control.max) return false;
  const steps = (value - control.min) / control.step;
  return Math.abs(steps - Math.round(steps)) < 1e-8;
}

function validStartingDistance(arena) {
  const minimum = Math.max(ARENA_CONTROLS.startingDistance.min, arena.fighterSize);
  const maximum = Math.min(ARENA_CONTROLS.startingDistance.max, arena.size - arena.fighterSize);
  return arena.startingDistance >= minimum && arena.startingDistance <= maximum;
}

function readFighter(source, character, side) {
  exactKeys(source, ['characterId', 'stats'], `${side} fighter`);
  if (source.characterId !== character.id) fail(`${side} fighter character is unavailable`);
  exactKeys(source.stats, FIGHTER_KEYS, `${side} fighter stats`);
  const defaults = defaultFighterSettings(character);
  const stats = {};
  for (const key of FIGHTER_KEYS) {
    const value = source.stats[key];
    const control = FIGHTER_CONTROLS[key];
    if (Array.isArray(defaults[key])) {
      if (!Array.isArray(value) || value.length !== defaults[key].length || !value.every(item => isControlValue(item, control))) fail(`${side} fighter ${key} is invalid`);
      stats[key] = [...value];
    } else {
      if (Array.isArray(value) || !isControlValue(value, control)) fail(`${side} fighter ${key} is invalid`);
      stats[key] = value;
    }
  }
  return { characterId: character.id, stats };
}

function readArena(source) {
  const keys = [...Object.keys(ARENA_CONTROLS), 'collisionMode'];
  exactKeys(source, keys, 'arena');
  const arena = {};
  for (const [key, control] of Object.entries(ARENA_CONTROLS)) {
    if (!isControlValue(source[key], control)) fail(`arena ${key} is invalid`);
    arena[key] = source[key];
  }
  if (!COLLISION_MODES.includes(source.collisionMode)) fail('arena collisionMode is invalid');
  if (!validStartingDistance(arena)) fail('arena startingDistance is invalid');
  return { ...arena, collisionMode: source.collisionMode };
}

export function createDuelRecipe({ selectedCharacters, setup }) {
  if (!selectedCharacters?.left?.id || !selectedCharacters?.right?.id || !setup?.fighters || !setup?.arena) throw new Error('Cannot export an incomplete duel setup');
  return {
    format: DUEL_SHARE_FORMAT,
    version: DUEL_SHARE_VERSION,
    fighters: Object.fromEntries(SIDES.map(side => [side, {
      characterId: selectedCharacters[side].id,
      stats: JSON.parse(JSON.stringify(setup.fighters[side]))
    }])),
    arena: { ...setup.arena, launchDelay: setup.arena.launchDelay / 1000 }
  };
}

export function stringifyDuelRecipe(recipe) {
  return `${JSON.stringify(recipe, null, 2)}\n`;
}

export function parseDuelRecipe(text, { characters }) {
  let source;
  try { source = JSON.parse(text); }
  catch { fail('the file is not valid JSON'); }
  exactKeys(source, ['format', 'version', 'fighters', 'arena'], 'recipe');
  if (source.format !== DUEL_SHARE_FORMAT) fail('the file format is unsupported');
  if (source.version !== DUEL_SHARE_VERSION) fail('the recipe version is unsupported');
  exactKeys(source.fighters, SIDES, 'fighters');
  const characterById = Object.fromEntries(characters.map(character => [character.id, character]));
  const fighters = {};
  for (const side of SIDES) {
    const character = characterById[source.fighters[side]?.characterId];
    if (!character) fail(`${side} fighter character is unavailable`);
    fighters[side] = readFighter(source.fighters[side], character, side);
  }
  return { fighters, arena: readArena(source.arena) };
}
