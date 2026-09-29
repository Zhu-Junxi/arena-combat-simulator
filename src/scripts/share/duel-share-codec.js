import { ARENA_CONTROLS, COLLISION_MODES, FIGHTER_CONTROLS, PRIEST_ABILITY_CONTROLS, SUMMON_ABILITY_CONTROLS, TRAIT_CONTROLS, WEAPON_TUNING_CONTROLS, GUARDIAN_ABILITY_CONTROLS, GUARDIAN_ABILITY_SWITCHES, STAR_ABILITY_CONTROLS, STAR_ABILITY_SWITCHES, defaultFighterSettings } from '../config/customization.js';
import { normalizeMageAbilities, normalizePriestAbilities, normalizeSummonAbilities, normalizeGuardianAbilities, normalizeStarAbilities } from '../customization/settings-store.js';
import { TARGET_STRATEGIES, activeSlots } from '../config/match.js';

export const DUEL_SHARE_FORMAT = 'arena-duel.duel';
export const DUEL_SHARE_VERSION = 13;

const FIGHTER_KEYS = Object.freeze(['health', 'attack', 'attackCD', 'movementSpeed']);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = value => value != null && typeof value === 'object' && !Array.isArray(value);
const fail = message => { throw new Error(`Invalid duel recipe: ${message}`); };

function exactKeys(value, keys, label) {
  if (!isObject(value) || Object.keys(value).length !== keys.length || !keys.every(key => hasOwn(value, key))) fail(`${label} has an invalid structure`);
}

function isControlValue(value, control, advanced = false) {
  if (!Number.isFinite(value) || (!advanced && (value < control.min || value > control.max))) return false;
  if (advanced && Math.abs(value) >= 1e21) return true;
  const steps = (value - control.min) / control.step;
  return Math.abs(steps - Math.round(steps)) < 1e-8;
}

function validStartingDistance(arena, advanced = false) {
  if (advanced) return Number.isFinite(arena.startingDistance);
  const minimum = Math.max(ARENA_CONTROLS.startingDistance.min, arena.fighterSize);
  const maximum = Math.min(ARENA_CONTROLS.startingDistance.max, arena.size - arena.fighterSize);
  return arena.startingDistance >= minimum && arena.startingDistance <= maximum;
}

function readFighter(source, character, side, version, advanced = false) {
  exactKeys(source, ['characterId', 'stats'], `${side} fighter`);
  if (source.characterId !== character.id) fail(`${side} fighter character is unavailable`);
  const isMage = character.trait?.id === 'elemental-cycles';
  const isPriest = character.trait?.id === 'prayer';
  const isBeastmaster = character.trait?.id === 'beastmaster';
  const isGuardian = character.id === 'guardian';
  const isStar = character.id === 'dongfang-changfan';
  const traitControls = TRAIT_CONTROLS[character.trait?.id];
  const weaponControls = WEAPON_TUNING_CONTROLS[character.id];
  const isRanged = defaults => defaults.projectileSpeed != null;
  const isMelee = defaults => defaults.attackRange != null;
  const defaults = defaultFighterSettings(character);
  const statKeys = [...FIGHTER_KEYS, ...(isRanged(defaults) && version >= 5 ? ['projectileSpeed'] : []), ...(isMelee(defaults) && version >= 6 ? ['attackRange'] : []), ...((isMage && version >= 2) || (isPriest && version >= 7) || (isBeastmaster && version >= 11) || ((isGuardian || isStar) && version >= 12) ? ['abilities'] : []), ...(traitControls && version >= 4 ? ['trait'] : []), ...(weaponControls && version >= 13 ? ['weapon'] : [])];
  exactKeys(source.stats, statKeys, `${side} fighter stats`);
  const stats = {};
  for (const key of FIGHTER_KEYS) {
    const value = source.stats[key];
    const control = FIGHTER_CONTROLS[key];
    if (Array.isArray(defaults[key])) {
      if (!Array.isArray(value) || value.length !== defaults[key].length || !value.every(item => isControlValue(item, control, advanced))) fail(`${side} fighter ${key} is invalid`);
      stats[key] = [...value];
    } else {
      if (Array.isArray(value) || !isControlValue(value, control, advanced)) fail(`${side} fighter ${key} is invalid`);
      stats[key] = value;
    }
  }
  if (isRanged(defaults)) {
    const value = version >= 5 ? source.stats.projectileSpeed : defaults.projectileSpeed;
    if (!isControlValue(value, FIGHTER_CONTROLS.projectileSpeed, advanced)) fail(`${side} fighter projectileSpeed is invalid`);
    stats.projectileSpeed = value;
  }
  if (isMelee(defaults)) {
    const value = version >= 6 ? source.stats.attackRange : defaults.attackRange;
    if (!isControlValue(value, FIGHTER_CONTROLS.attackRange, advanced)) fail(`${side} fighter attackRange is invalid`);
    stats.attackRange = value;
  }
  if (traitControls) {
    if (version >= 4) exactKeys(source.stats.trait, Object.keys(traitControls), `${side} fighter trait`);
    stats.trait = {};
    for (const [key, control] of Object.entries(traitControls)) {
      const value = version >= 4 ? source.stats.trait?.[key] : defaults.trait[key];
      if (!isControlValue(value, control, advanced)) fail(`${side} fighter trait ${key} is invalid`);
      stats.trait[key] = value;
    }
  }
  if (weaponControls) {
    if (version >= 13) {
      exactKeys(source.stats.weapon, Object.keys(weaponControls), `${side} fighter weapon`);
      for (const [key, control] of Object.entries(weaponControls)) {
        if (source.stats.weapon[key] < control.min || !isControlValue(source.stats.weapon[key], control, advanced && !['active', 'windup'].includes(key))) fail(`${side} fighter weapon ${key} is invalid`);
      }
    }
    stats.weapon = version >= 13 ? { ...source.stats.weapon } : { ...defaults.weapon };
  }
  if (isMage) stats.abilities = version >= 2 ? normalizeMageAbilities(source.stats.abilities, undefined, advanced) : normalizeMageAbilities();
  if (isPriest) {
    if (version >= 7) {
      const controls = Object.entries(PRIEST_ABILITY_CONTROLS).filter(([key]) => version >= 8 || !['markMoveSlowPerMark', 'markAttackSlowPerMark'].includes(key));
      exactKeys(source.stats.abilities, controls.map(([key]) => key), `${side} fighter abilities`);
      for (const [key, control] of controls) {
        if (!isControlValue(source.stats.abilities[key], control, advanced)) fail(`${side} fighter ability ${key} is invalid`);
      }
    }
    stats.abilities = version >= 7 ? normalizePriestAbilities(source.stats.abilities, undefined, advanced) : normalizePriestAbilities();
  }
  if (isBeastmaster) {
    if (version >= 11) {
      exactKeys(source.stats.abilities, Object.keys(SUMMON_ABILITY_CONTROLS), `${side} fighter abilities`);
      for (const [key, control] of Object.entries(SUMMON_ABILITY_CONTROLS)) {
        if (!isControlValue(source.stats.abilities[key], control, advanced)) fail(`${side} fighter ability ${key} is invalid`);
      }
    }
    stats.abilities = version >= 11 ? normalizeSummonAbilities(source.stats.abilities, undefined, advanced) : normalizeSummonAbilities();
  }
  if (isGuardian || isStar) {
    const controls = isGuardian ? GUARDIAN_ABILITY_CONTROLS : STAR_ABILITY_CONTROLS;
    const switches = isGuardian ? GUARDIAN_ABILITY_SWITCHES : STAR_ABILITY_SWITCHES;
    if (version >= 12) {
      const abilities = source.stats.abilities;
      exactKeys(abilities, [...Object.keys(controls), ...Object.keys(switches), ...(isGuardian ? ['startingMode'] : [])], `${side} fighter abilities`);
      for (const [key, control] of Object.entries(controls)) {
        if (abilities[key] !== control.default && !isControlValue(abilities[key], control, advanced)) fail(`${side} fighter ability ${key} is invalid`);
      }
      for (const key of Object.keys(switches)) if (typeof abilities[key] !== 'boolean') fail(`${side} fighter ability ${key} is invalid`);
      if (isGuardian && !['charge', 'flail'].includes(abilities.startingMode)) fail(`${side} fighter starting mode is invalid`);
    }
    stats.abilities = isGuardian ? normalizeGuardianAbilities(source.stats.abilities, undefined, advanced) : normalizeStarAbilities(source.stats.abilities, undefined, advanced);
  }
  return { characterId: character.id, stats };
}

function readArena(source, version, advanced = false) {
  const controlEntries = Object.entries(ARENA_CONTROLS).filter(([key]) =>
    (version >= 3 || key !== 'contactStopDuration') && (version >= 10 || key !== 'fighterCount'));
  const keys = [...controlEntries.map(([key]) => key), 'collisionMode', ...(version >= 10 ? ['targetStrategy'] : [])];
  exactKeys(source, keys, 'arena');
  const arena = version >= 3 ? {} : { contactStopDuration: ARENA_CONTROLS.contactStopDuration.default };
  for (const [key, control] of controlEntries) {
    if (!isControlValue(source[key], control, key === 'fighterCount' ? false : advanced)) fail(`arena ${key} is invalid`);
    arena[key] = source[key];
  }
  if (!COLLISION_MODES.includes(source.collisionMode)) fail('arena collisionMode is invalid');
  if (!validStartingDistance(arena, advanced)) fail('arena startingDistance is invalid');
  if (version < 10) arena.fighterCount = 2;
  const targetStrategy = version >= 10 ? source.targetStrategy : 'nearest';
  if (!TARGET_STRATEGIES.includes(targetStrategy)) fail('arena targetStrategy is invalid');
  return { ...arena, collisionMode: source.collisionMode, targetStrategy };
}

export function createDuelRecipe({ selectedCharacters, setup }) {
  if (!selectedCharacters?.left?.id || !selectedCharacters?.right?.id || !setup?.fighters || !setup?.arena) throw new Error('Cannot export an incomplete duel setup');
  const slots = activeSlots(setup.arena.fighterCount);
  return {
    format: DUEL_SHARE_FORMAT,
    version: DUEL_SHARE_VERSION,
    advanced: Boolean(setup.advanced),
    fighters: Object.fromEntries(slots.map(side => [side, {
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
  const version = source?.version;
  exactKeys(source, version >= 9 ? ['format', 'version', 'advanced', 'fighters', 'arena'] : ['format', 'version', 'fighters', 'arena'], 'recipe');
  if (source.format !== DUEL_SHARE_FORMAT) fail('the file format is unsupported');
  if (!Number.isInteger(source.version) || source.version < 1 || source.version > DUEL_SHARE_VERSION) fail('the recipe version is unsupported');
  if (version >= 9 && typeof source.advanced !== 'boolean') fail('advanced mode is invalid');
  const advanced = version >= 9 && source.advanced;
  const arena = readArena(source.arena, source.version, advanced);
  const slots = activeSlots(arena.fighterCount);
  exactKeys(source.fighters, slots, 'fighters');
  const characterById = Object.fromEntries(characters.map(character => [character.id, character]));
  const fighters = {};
  for (const side of slots) {
    const character = characterById[source.fighters[side]?.characterId];
    if (!character || character.locked) fail(`${side} fighter character is unavailable`);
    fighters[side] = readFighter(source.fighters[side], character, side, source.version, advanced);
  }
  return { advanced, fighters, arena };
}
