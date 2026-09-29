import {
  ARENA_CONTROLS,
  COLLISION_MODES,
  FIGHTER_CONTROLS,
  MAGE_ABILITY_CONTROLS,
  MAGE_CYCLES,
  MAGE_SPELL_SLOTS,
  PRIEST_ABILITY_CONTROLS,
  SUMMON_ABILITY_CONTROLS,
  GUARDIAN_ABILITY_CONTROLS, GUARDIAN_ABILITY_SWITCHES, STAR_ABILITY_CONTROLS, STAR_ABILITY_SWITCHES,
  TRAIT_CONTROLS,
  WEAPON_TUNING_CONTROLS,
  MATCH_SETTINGS_STORAGE_KEY,
  MATCH_SETTINGS_VERSION,
  defaultArenaSettings,
  defaultFighterSettings,
  defaultMageAbilities,
  defaultPriestAbilities,
  defaultSummonAbilities,
  defaultGuardianAbilities,
  defaultStarAbilities
} from '../config/customization.js';
import { FIGHTER_SLOTS, TARGET_STRATEGIES, activeSlots } from '../config/match.js';

const SIDES = FIGHTER_SLOTS;
const clone = value => JSON.parse(JSON.stringify(value));
const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

function decimalPlaces(step) {
  return String(step).split('.')[1]?.length ?? 0;
}

export function clampSetting(value, control, advanced = false) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return control.default ?? control.min;
  const stepped = control.min + Math.round((numeric - control.min) / control.step) * control.step;
  if (advanced && !Number.isFinite(stepped)) return numeric;
  const bounded = advanced ? stepped : Math.max(control.min, Math.min(control.max, stepped));
  return Math.abs(bounded) >= 1e21 ? bounded : Number(bounded.toFixed(decimalPlaces(control.step)));
}

function normalizeModes(value, defaults, control, advanced = false) {
  if (!Array.isArray(value)) return [...defaults];
  return defaults.map((fallback, index) => Number.isFinite(Number(value[index])) ? clampSetting(value[index], control, advanced) : fallback);
}

function normalizeFighter(value, character, fallback = defaultFighterSettings(character), advanced = false) {
  const defaults = fallback;
  const fighter = {
    health: Number.isFinite(Number(value?.health)) ? clampSetting(value.health, FIGHTER_CONTROLS.health, advanced) : defaults.health,
    attack: normalizeModes(value?.attack, defaults.attack, FIGHTER_CONTROLS.attack, advanced),
    attackCD: normalizeModes(value?.attackCD, defaults.attackCD, FIGHTER_CONTROLS.attackCD, advanced),
    movementSpeed: Number.isFinite(Number(value?.movementSpeed)) ? clampSetting(value.movementSpeed, FIGHTER_CONTROLS.movementSpeed, advanced) : defaults.movementSpeed
  };
  if (defaults.projectileSpeed != null) fighter.projectileSpeed = Number.isFinite(Number(value?.projectileSpeed))
    ? clampSetting(value.projectileSpeed, FIGHTER_CONTROLS.projectileSpeed, advanced) : defaults.projectileSpeed;
  if (defaults.attackRange != null) fighter.attackRange = Number.isFinite(Number(value?.attackRange))
    ? clampSetting(value.attackRange, FIGHTER_CONTROLS.attackRange, advanced) : defaults.attackRange;
  if (TRAIT_CONTROLS[character.trait?.id]) fighter.trait = normalizeTraitSettings(value?.trait, character, defaults.trait, advanced);
  if (WEAPON_TUNING_CONTROLS[character.id]) fighter.weapon = normalizeWeapon(value?.weapon, character, defaults.weapon, advanced);
  if (character.trait?.id === 'elemental-cycles') fighter.abilities = normalizeMageAbilities(value?.abilities, defaults.abilities, advanced);
  if (character.trait?.id === 'prayer') fighter.abilities = normalizePriestAbilities(value?.abilities, defaults.abilities, advanced);
  if (character.trait?.id === 'beastmaster') fighter.abilities = normalizeSummonAbilities(value?.abilities, defaults.abilities, advanced);
  if (character.id === 'guardian') fighter.abilities = normalizeGuardianAbilities(value?.abilities, defaults.abilities, advanced);
  if (character.id === 'dongfang-changfan') fighter.abilities = normalizeStarAbilities(value?.abilities, defaults.abilities, advanced);
  return fighter;
}

function normalizeWeapon(value, character, fallback, advanced = false) {
  return Object.fromEntries(Object.entries(WEAPON_TUNING_CONTROLS[character.id]).map(([key, control]) => [key,
    Number.isFinite(Number(value?.[key])) ? clampWeaponSetting(value[key], control, key, advanced) : fallback[key]
  ]));
}

function clampWeaponSetting(value, control, key, advanced) {
  const timing = key === 'active' || key === 'windup';
  return Math.max(control.min, clampSetting(value, control, advanced && !timing));
}

export function normalizeTraitSettings(value, character, fallback, advanced = false) {
  const controls = TRAIT_CONTROLS[character.trait?.id];
  if (!controls) return undefined;
  const defaults = fallback ?? Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, character.trait[key] ?? control.default]));
  return Object.fromEntries(Object.entries(controls).map(([key, control]) => [key,
    Number.isFinite(Number(value?.[key])) ? clampSetting(value[key], control, advanced) : defaults[key]
  ]));
}

export function normalizeMageAbilities(value, fallback = defaultMageAbilities(), advanced = false) {
  const defaults = fallback;
  return {
    cycles: Object.fromEntries(MAGE_CYCLES.map(cycle => [cycle, MAGE_SPELL_SLOTS.map((slot, index) => ({
      damage: Number.isFinite(Number(value?.cycles?.[cycle]?.[index]?.damage)) ? clampSetting(value.cycles[cycle][index].damage, FIGHTER_CONTROLS.attack, advanced) : defaults.cycles[cycle][index].damage,
      cooldown: Number.isFinite(Number(value?.cycles?.[cycle]?.[index]?.cooldown)) ? clampSetting(value.cycles[cycle][index].cooldown, FIGHTER_CONTROLS.attackCD, advanced) : defaults.cycles[cycle][index].cooldown
    }))])),
    effects: Object.fromEntries(Object.entries(MAGE_ABILITY_CONTROLS).map(([key, control]) => [key,
      Number.isFinite(Number(value?.effects?.[key])) ? clampSetting(value.effects[key], control, advanced) : defaults.effects[key]
    ]))
  };
}

export function normalizePriestAbilities(value, fallback = defaultPriestAbilities(), advanced = false) {
  return Object.fromEntries(Object.entries(PRIEST_ABILITY_CONTROLS).map(([key, control]) => [key,
    Number.isFinite(Number(value?.[key])) ? clampSetting(value[key], control, advanced) : fallback[key]
  ]));
}

export function normalizeSummonAbilities(value, fallback = defaultSummonAbilities(), advanced = false) {
  return Object.fromEntries(Object.entries(SUMMON_ABILITY_CONTROLS).map(([key, control]) => [key,
    Number.isFinite(Number(value?.[key])) ? clampSetting(value[key], control, advanced) : fallback[key]
  ]));
}

function normalizeSpecialAbilities(value, fallback, controls, switches, advanced) {
  return {
    ...Object.fromEntries(Object.entries(controls).map(([key, control]) => [key,
      value?.[key] === control.default ? control.default : Number.isFinite(Number(value?.[key])) ? clampSetting(value[key], control, advanced) : fallback[key]
    ])),
    ...Object.fromEntries(Object.keys(switches).map(key => [key, typeof value?.[key] === 'boolean' ? value[key] : fallback[key]]))
  };
}

export function normalizeGuardianAbilities(value, fallback = defaultGuardianAbilities(), advanced = false) {
  return { ...normalizeSpecialAbilities(value, fallback, GUARDIAN_ABILITY_CONTROLS, GUARDIAN_ABILITY_SWITCHES, advanced),
    startingMode: ['charge', 'flail'].includes(value?.startingMode) ? value.startingMode : fallback.startingMode };
}

export function normalizeStarAbilities(value, fallback = defaultStarAbilities(), advanced = false) {
  return normalizeSpecialAbilities(value, fallback, STAR_ABILITY_CONTROLS, STAR_ABILITY_SWITCHES, advanced);
}

export function constrainStartingDistance(arena, advanced = false) {
  if (advanced) return clampSetting(arena.startingDistance, ARENA_CONTROLS.startingDistance, true);
  const minimum = Math.max(ARENA_CONTROLS.startingDistance.min, arena.fighterSize);
  const count = Math.max(2, Math.min(4, Number(arena.fighterCount) || 2));
  // For a circle, adjacent spawn distance is the chord: 2r·sin(π/n).
  // Keep the circle inside the usable arena radius for every active seat.
  const maximumSpacing = count === 2 ? arena.size - arena.fighterSize :
    (arena.size - arena.fighterSize) * Math.sin(Math.PI / count);
  const maximum = Math.min(ARENA_CONTROLS.startingDistance.max, maximumSpacing);
  return Number(Math.max(minimum, Math.min(maximum, clampSetting(arena.startingDistance, ARENA_CONTROLS.startingDistance))).toFixed(3));
}

function normalizeArena(value = {}, advanced = false) {
  const arena = defaultArenaSettings();
  for (const [key, control] of Object.entries(ARENA_CONTROLS)) {
    // Match size is structural rather than a combat stat: four stable seats is
    // the supported maximum even while Advanced Tuning is enabled.
    const allowAdvanced = key === 'fighterCount' ? false : advanced;
    arena[key] = Number.isFinite(Number(value[key])) ? clampSetting(value[key], control, allowAdvanced) : arena[key];
  }
  arena.startingDistance = constrainStartingDistance(arena, advanced);
  arena.collisionMode = COLLISION_MODES.includes(value.collisionMode) ? value.collisionMode : arena.collisionMode;
  arena.targetStrategy = TARGET_STRATEGIES.includes(value.targetStrategy) ? value.targetStrategy : arena.targetStrategy;
  arena.launchDelay *= 1000;
  return arena;
}

function serializeArena(arena) {
  return { ...arena, launchDelay: arena.launchDelay / 1000 };
}

function isLegacyMageDefaults(fighter) {
  return Array.isArray(fighter?.attack) && Array.isArray(fighter?.attackCD) &&
    fighter.attack.join(',') === '1,2,3' && fighter.attackCD.join(',') === '2,2,2';
}

function migrateMageDefaults(source) {
  const savedCharacters = [source?.characterDefaults, ...SIDES.map(side => source?.fighters?.[side])];
  for (const characters of savedCharacters) {
    if (characters?.archer?.projectileSpeed === 620) characters.archer.projectileSpeed = 1240;
    const guardian = characters?.guardian;
    if (guardian?.attack?.length === 1 && guardian.attack[0] === 8) guardian.attack = [10];
    if (guardian?.attackCD?.length === 1 && guardian.attackCD[0] === 5) guardian.attackCD = [4];
    const fighter = characters?.['dongfang-changfan'];
    if (Array.isArray(fighter?.attack) && fighter.attack.length === 1 && fighter.attack[0] === 5) fighter.attack = [1];
  }
  for (const side of SIDES) {
    if (isLegacyMageDefaults(source?.fighters?.[side]?.mage)) delete source.fighters[side].mage;
  }
  return source;
}

export function createMatchSettingsStore({ characters, storage = globalThis.localStorage, logger = console } = {}) {
  const characterById = Object.fromEntries(characters.map(character => [character.id, character]));
  let source = null;
  try {
    source = JSON.parse(storage?.getItem(MATCH_SETTINGS_STORAGE_KEY) ?? 'null');
  } catch (error) {
    logger.warn?.('Ignoring malformed saved match settings', error);
  }
  // Versions before free-for-all only had left/right data.  Missing seats are
  // initialized from character defaults, preserving the old match exactly.
  if ([1, 2].includes(source?.version)) source = { ...source, version: MATCH_SETTINGS_VERSION, advanced: Boolean(source.advanced), arena: { ...source.arena, fighterCount: 2, targetStrategy: 'nearest' } };
  if (source?.version === 3) source = { ...source, version: MATCH_SETTINGS_VERSION };
  if (source?.version !== MATCH_SETTINGS_VERSION) source = null;
  if (source) source = migrateMageDefaults(source);
  let advanced = Boolean(source?.advanced);

  const characterDefaults = Object.fromEntries(characters.map(character => [
    character.id, normalizeFighter(source?.characterDefaults?.[character.id], character, defaultFighterSettings(character), advanced)
  ]));
  const fighters = Object.fromEntries(SIDES.map(side => [side, Object.fromEntries(characters.map(character => [
    character.id, normalizeFighter(source?.fighters?.[side]?.[character.id], character, characterDefaults[character.id], advanced)
  ]))]));
  let arena = normalizeArena(source?.arena, advanced);
  const listeners = new Set();
  let lastPersistenceSucceeded = false;
  let lastPersistencePromise = Promise.resolve(false);

  function persist(detail) {
    const value = exportData();
    try {
      if (!storage?.setItem) throw new Error('Storage is unavailable');
      const continuous = Boolean(detail && !detail.reset && !detail.defaultSaved && !detail.imported &&
        (detail.scope === 'arena' || detail.key || detail.trait || detail.weapon || detail.path || detail.priestAbility || detail.summonAbility || detail.specialAbility));
      const write = storage.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(value), { debounce: continuous });
      if (write && typeof write.then === 'function') {
        lastPersistenceSucceeded = false;
        lastPersistencePromise = write.then(() => { lastPersistenceSucceeded = true; return true; }, () => { lastPersistenceSucceeded = false; return false; });
      } else {
        lastPersistenceSucceeded = true;
        lastPersistencePromise = Promise.resolve(true);
      }
    } catch {
      // Customization remains usable when persistence is unavailable.
      lastPersistenceSucceeded = false;
      lastPersistencePromise = Promise.resolve(false);
    }
    return lastPersistenceSucceeded;
  }

  function exportData() {
    return {
      version: MATCH_SETTINGS_VERSION,
      advanced,
      characterDefaults: clone(characterDefaults),
      fighters: clone(fighters),
      arena: serializeArena(arena)
    };
  }

  function notify(detail) {
    persist(detail);
    listeners.forEach(listener => listener(detail));
  }

  function getFighter(side, characterId) {
    if (!SIDES.includes(side) || !characterById[characterId]) throw new Error('Unknown fighter settings target');
    return deepFreeze(clone(fighters[side][characterId]));
  }

  function setFighterValue(side, characterId, key, value, mode = 0) {
    const target = fighters[side]?.[characterId];
    const control = FIGHTER_CONTROLS[key];
    if (!target || !control) throw new Error('Unknown fighter setting');
    if (key === 'attack' || key === 'attackCD') {
      if (!Number.isInteger(mode) || mode < 0 || mode >= target[key].length) throw new Error('Unknown fighter mode');
      target[key][mode] = clampSetting(value, control, advanced);
    } else {
      target[key] = clampSetting(value, control, advanced);
    }
    notify({ scope: side, characterId, key, mode });
    return getFighter(side, characterId);
  }

  function setTraitValue(side, characterId, key, value) {
    const target = fighters[side]?.[characterId];
    const control = TRAIT_CONTROLS[characterById[characterId]?.trait?.id]?.[key];
    if (!target?.trait || !control) throw new Error('Unknown trait setting');
    target.trait[key] = clampSetting(value, control, advanced);
    notify({ scope: side, characterId, trait: key });
    return getFighter(side, characterId);
  }

  function setWeaponValue(side, characterId, key, value) {
    const target = fighters[side]?.[characterId];
    const control = WEAPON_TUNING_CONTROLS[characterId]?.[key];
    if (!target?.weapon || !control) throw new Error('Unknown weapon setting');
    target.weapon[key] = clampWeaponSetting(value, control, key, advanced);
    notify({ scope: side, characterId, weapon: key });
    return getFighter(side, characterId).weapon;
  }

  function getArena() {
    return deepFreeze(clone(arena));
  }

  function getMageAbilities(side, characterId) {
    const fighter = getFighter(side, characterId);
    if (!fighter.abilities) throw new Error('Unknown mage abilities target');
    return fighter.abilities;
  }

  function setMageAbilityValue(side, characterId, path, value) {
    const target = fighters[side]?.[characterId];
    if (!target?.abilities) throw new Error('Unknown mage abilities target');
    const [kind, first, second, field] = path.split('.');
    if (kind === 'effects') {
      const control = MAGE_ABILITY_CONTROLS[first];
      if (!control) throw new Error('Unknown mage ability setting');
      target.abilities.effects[first] = clampSetting(value, control, advanced);
    } else if (kind === 'cycles') {
      const cycle = first;
      const index = Number(second);
      const control = field === 'damage' ? FIGHTER_CONTROLS.attack : field === 'cooldown' ? FIGHTER_CONTROLS.attackCD : null;
      if (!MAGE_CYCLES.includes(cycle) || !Number.isInteger(index) || index < 0 || index >= MAGE_SPELL_SLOTS.length || !control) throw new Error('Unknown mage spell setting');
      target.abilities.cycles[cycle][index][field] = clampSetting(value, control, advanced);
    } else throw new Error('Unknown mage ability setting');
    notify({ scope: side, characterId, path });
    return getMageAbilities(side, characterId);
  }

  function setPriestAbilityValue(side, characterId, key, value) {
    const target = fighters[side]?.[characterId];
    const control = PRIEST_ABILITY_CONTROLS[key];
    if (!target?.abilities || characterById[characterId]?.trait?.id !== 'prayer' || !control) throw new Error('Unknown priest ability setting');
    target.abilities[key] = clampSetting(value, control, advanced);
    notify({ scope: side, characterId, priestAbility: key });
    return getFighter(side, characterId).abilities;
  }

  function setSummonAbilityValue(side, characterId, key, value) {
    const target = fighters[side]?.[characterId];
    const control = SUMMON_ABILITY_CONTROLS[key];
    if (!target?.abilities || characterById[characterId]?.trait?.id !== 'beastmaster' || !control) throw new Error('Unknown summon ability setting');
    target.abilities[key] = clampSetting(value, control, advanced);
    notify({ scope: side, characterId, summonAbility: key });
    return getFighter(side, characterId).abilities;
  }

  function setSpecialAbilityValue(side, characterId, key, value) {
    const target = fighters[side]?.[characterId];
    const guardian = characterId === 'guardian';
    const star = characterId === 'dongfang-changfan';
    if (!target?.abilities || (!guardian && !star)) throw new Error('Unknown special ability target');
    const controls = guardian ? GUARDIAN_ABILITY_CONTROLS : STAR_ABILITY_CONTROLS;
    const switches = guardian ? GUARDIAN_ABILITY_SWITCHES : STAR_ABILITY_SWITCHES;
    if (controls[key]) target.abilities[key] = clampSetting(value, controls[key], advanced);
    else if (key in switches && typeof value === 'boolean') target.abilities[key] = value;
    else if (guardian && key === 'startingMode' && ['charge', 'flail'].includes(value)) target.abilities[key] = value;
    else throw new Error('Unknown special ability setting');
    notify({ scope: side, characterId, specialAbility: key });
    return getFighter(side, characterId).abilities;
  }

  function setArenaValue(key, value) {
    if (key === 'collisionMode') {
      if (!COLLISION_MODES.includes(value)) throw new Error('Unknown collision mode');
      arena.collisionMode = value;
    } else if (key === 'targetStrategy') {
      if (!TARGET_STRATEGIES.includes(value)) throw new Error('Unknown target strategy');
      arena.targetStrategy = value;
    } else {
      const control = ARENA_CONTROLS[key];
      if (!control) throw new Error('Unknown arena setting');
      const normalizedValue = key === 'launchDelay' ? Number(value) * 1000 : value;
      const normalizedControl = key === 'launchDelay'
        ? { ...control, min: control.min * 1000, max: control.max * 1000, step: control.step * 1000, default: control.default * 1000 }
        : control;
      arena[key] = clampSetting(normalizedValue, normalizedControl, key === 'fighterCount' ? false : advanced);
      arena.startingDistance = constrainStartingDistance(arena, advanced);
    }
    notify({ scope: 'arena', key });
    return getArena();
  }

  function resetFighter(side, characterId) {
    fighters[side][characterId] = normalizeFighter(null, characterById[characterId], characterDefaults[characterId], advanced);
    notify({ scope: side, characterId, reset: true });
  }

  function setCharacterDefault(side, characterId) {
    if (!fighters[side]?.[characterId]) throw new Error('Unknown fighter settings target');
    characterDefaults[characterId] = clone(fighters[side][characterId]);
    SIDES.forEach(seat => {
      fighters[seat][characterId] = clone(characterDefaults[characterId]);
    });
    notify({ scope: 'all', characterId, defaultSaved: true });
    return getFighter(side, characterId);
  }

  function importCharacterDefault(characterId, stats, importedAdvanced = false) {
    const character = characterById[characterId];
    if (!character || character.locked) throw new Error('Unknown character default');
    if (importedAdvanced) advanced = true;
    characterDefaults[characterId] = normalizeFighter(stats, character, defaultFighterSettings(character), advanced);
    SIDES.forEach(side => { fighters[side][characterId] = clone(characterDefaults[characterId]); });
    notify({ scope: 'all', characterId, defaultSaved: true });
  }

  function getCharacterDefault(characterId) {
    if (!characterById[characterId]) throw new Error('Unknown character default');
    return deepFreeze(clone(characterDefaults[characterId]));
  }

  function resetArena() {
    arena = normalizeArena({}, advanced);
    notify({ scope: 'arena', reset: true });
  }

  function resetAll() {
    SIDES.forEach(side => characters.forEach(character => {
      fighters[side][character.id] = normalizeFighter(null, character, characterDefaults[character.id], advanced);
    }));
    arena = normalizeArena({}, advanced);
    notify({ scope: 'all', reset: true });
  }

  function setAdvanced(nextAdvanced) {
    const next = Boolean(nextAdvanced);
    if (next === advanced) return advanced;
    if (!next) {
      characters.forEach(character => {
        characterDefaults[character.id] = normalizeFighter(characterDefaults[character.id], character);
        SIDES.forEach(side => {
          fighters[side][character.id] = normalizeFighter(fighters[side][character.id], character);
        });
      });
      arena = normalizeArena(arena);
    }
    advanced = next;
    notify({ scope: 'advanced', advanced });
    return advanced;
  }

  function snapshot(selectedCharacters) {
    const slots = activeSlots(arena.fighterCount).filter(side => selectedCharacters[side]);
    return deepFreeze({
      advanced,
      fighters: Object.fromEntries(slots.map(side => [side, clone(fighters[side][selectedCharacters[side].id])])),
      arena: clone(arena)
    });
  }

  function applyDuel(duel) {
    const nextFighters = {};
    const duelSlots = activeSlots(duel?.arena?.fighterCount ?? 2);
    for (const side of duelSlots) {
      const imported = duel?.fighters?.[side];
      const character = characterById[imported?.characterId];
      if (!character) throw new Error('Unknown imported fighter');
      nextFighters[side] = { characterId: character.id, values: normalizeFighter(imported.stats, character, defaultFighterSettings(character), Boolean(duel?.advanced)) };
    }
    const nextAdvanced = Boolean(duel?.advanced);
    const nextArena = normalizeArena(duel?.arena, nextAdvanced);
    for (const side of duelSlots) fighters[side][nextFighters[side].characterId] = nextFighters[side].values;
    arena = nextArena;
    advanced = nextAdvanced;
    notify({ scope: 'duel', imported: true });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ getFighter, getCharacterDefault, setFighterValue, setTraitValue, setWeaponValue, getMageAbilities, setMageAbilityValue, setPriestAbilityValue, setSummonAbilityValue, setSpecialAbilityValue, getArena, setArenaValue, getAdvanced: () => advanced, getLastPersistenceStatus: () => lastPersistenceSucceeded, whenPersisted: () => lastPersistencePromise, exportData, setAdvanced, resetFighter, setCharacterDefault, importCharacterDefault, resetArena, resetAll, snapshot, applyDuel, subscribe });
}
