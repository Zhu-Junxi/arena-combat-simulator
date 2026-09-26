import { ARENA_CONTROLS, COLLISION_MODES, FIGHTER_CONTROLS, PRIEST_ABILITY_CONTROLS, TRAIT_CONTROLS, defaultFighterSettings } from '../config/customization.js';
import { normalizeMageAbilities, normalizePriestAbilities } from '../customization/settings-store.js';

export const DUEL_SHARE_FORMAT = 'arena-duel.duel';
export const DUEL_SHARE_VERSION = 8;

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

function readFighter(source, character, side, version) {
  exactKeys(source, ['characterId', 'stats'], `${side} fighter`);
  if (source.characterId !== character.id) fail(`${side} fighter character is unavailable`);
  const isMage = character.trait?.id === 'elemental-cycles';
  const isPriest = character.trait?.id === 'prayer';
  const traitControls = TRAIT_CONTROLS[character.trait?.id];
  const isRanged = defaults => defaults.projectileSpeed != null;
  const isMelee = defaults => defaults.attackRange != null;
  const defaults = defaultFighterSettings(character);
  const statKeys = [...FIGHTER_KEYS, ...(isRanged(defaults) && version >= 5 ? ['projectileSpeed'] : []), ...(isMelee(defaults) && version >= 6 ? ['attackRange'] : []), ...((isMage && version >= 2) || (isPriest && version >= 7) ? ['abilities'] : []), ...(traitControls && version >= 4 ? ['trait'] : [])];
  exactKeys(source.stats, statKeys, `${side} fighter stats`);
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
  if (isRanged(defaults)) {
    const value = version >= 5 ? source.stats.projectileSpeed : defaults.projectileSpeed;
    if (!isControlValue(value, FIGHTER_CONTROLS.projectileSpeed)) fail(`${side} fighter projectileSpeed is invalid`);
    stats.projectileSpeed = value;
  }
  if (isMelee(defaults)) {
    const value = version >= 6 ? source.stats.attackRange : defaults.attackRange;
    if (!isControlValue(value, FIGHTER_CONTROLS.attackRange)) fail(`${side} fighter attackRange is invalid`);
    stats.attackRange = value;
  }
  if (traitControls) {
    if (version >= 4) exactKeys(source.stats.trait, Object.keys(traitControls), `${side} fighter trait`);
    stats.trait = {};
    for (const [key, control] of Object.entries(traitControls)) {
      const value = version >= 4 ? source.stats.trait?.[key] : defaults.trait[key];
      if (!isControlValue(value, control)) fail(`${side} fighter trait ${key} is invalid`);
      stats.trait[key] = value;
    }
  }
  if (isMage) stats.abilities = version >= 2 ? normalizeMageAbilities(source.stats.abilities) : normalizeMageAbilities();
  if (isPriest) {
    if (version >= 7) {
      const controls = Object.entries(PRIEST_ABILITY_CONTROLS).filter(([key]) => version >= 8 || !['markMoveSlowPerMark', 'markAttackSlowPerMark'].includes(key));
      exactKeys(source.stats.abilities, controls.map(([key]) => key), `${side} fighter abilities`);
      for (const [key, control] of controls) {
        if (!isControlValue(source.stats.abilities[key], control)) fail(`${side} fighter ability ${key} is invalid`);
      }
    }
    stats.abilities = version >= 7 ? normalizePriestAbilities(source.stats.abilities) : normalizePriestAbilities();
  }
  return { characterId: character.id, stats };
}

function readArena(source, version) {
  const controlEntries = Object.entries(ARENA_CONTROLS).filter(([key]) => version >= 3 || key !== 'contactStopDuration');
  const keys = [...controlEntries.map(([key]) => key), 'collisionMode'];
  exactKeys(source, keys, 'arena');
  const arena = version >= 3 ? {} : { contactStopDuration: ARENA_CONTROLS.contactStopDuration.default };
  for (const [key, control] of controlEntries) {
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
  if (![1, 2, 3, 4, 5, 6, 7, DUEL_SHARE_VERSION].includes(source.version)) fail('the recipe version is unsupported');
  exactKeys(source.fighters, SIDES, 'fighters');
  const characterById = Object.fromEntries(characters.map(character => [character.id, character]));
  const fighters = {};
  for (const side of SIDES) {
    const character = characterById[source.fighters[side]?.characterId];
    if (!character) fail(`${side} fighter character is unavailable`);
    fighters[side] = readFighter(source.fighters[side], character, side, source.version);
  }
  return { fighters, arena: readArena(source.arena, source.version) };
}
