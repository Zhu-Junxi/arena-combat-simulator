import {
  ARENA_CONTROLS,
  COLLISION_MODES,
  FIGHTER_CONTROLS,
  MATCH_SETTINGS_STORAGE_KEY,
  MATCH_SETTINGS_VERSION,
  defaultArenaSettings,
  defaultFighterSettings
} from '../config/customization.js';

const SIDES = Object.freeze(['left', 'right']);
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

export function clampSetting(value, control) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return control.default ?? control.min;
  const stepped = control.min + Math.round((numeric - control.min) / control.step) * control.step;
  return Number(Math.max(control.min, Math.min(control.max, stepped)).toFixed(decimalPlaces(control.step)));
}

function normalizeModes(value, defaults, control) {
  if (!Array.isArray(value)) return [...defaults];
  return defaults.map((fallback, index) => Number.isFinite(Number(value[index])) ? clampSetting(value[index], control) : fallback);
}

function normalizeFighter(value, character) {
  const defaults = defaultFighterSettings(character);
  return {
    health: Number.isFinite(Number(value?.health)) ? clampSetting(value.health, FIGHTER_CONTROLS.health) : defaults.health,
    attack: normalizeModes(value?.attack, defaults.attack, FIGHTER_CONTROLS.attack),
    attackCD: normalizeModes(value?.attackCD, defaults.attackCD, FIGHTER_CONTROLS.attackCD),
    movementSpeed: Number.isFinite(Number(value?.movementSpeed)) ? clampSetting(value.movementSpeed, FIGHTER_CONTROLS.movementSpeed) : defaults.movementSpeed
  };
}

export function constrainStartingDistance(arena) {
  const minimum = Math.max(ARENA_CONTROLS.startingDistance.min, arena.fighterSize);
  const maximum = Math.min(ARENA_CONTROLS.startingDistance.max, arena.size - arena.fighterSize);
  return Math.max(minimum, Math.min(maximum, clampSetting(arena.startingDistance, ARENA_CONTROLS.startingDistance)));
}

function normalizeArena(value = {}) {
  const arena = defaultArenaSettings();
  for (const [key, control] of Object.entries(ARENA_CONTROLS)) {
    arena[key] = Number.isFinite(Number(value[key])) ? clampSetting(value[key], control) : control.default;
  }
  arena.startingDistance = constrainStartingDistance(arena);
  arena.collisionMode = COLLISION_MODES.includes(value.collisionMode) ? value.collisionMode : 'bounce';
  arena.launchDelay *= 1000;
  return arena;
}

function serializeArena(arena) {
  return { ...arena, launchDelay: arena.launchDelay / 1000 };
}

export function createMatchSettingsStore({ characters, storage = globalThis.localStorage, logger = console } = {}) {
  const characterById = Object.fromEntries(characters.map(character => [character.id, character]));
  let source = null;
  try {
    source = JSON.parse(storage?.getItem(MATCH_SETTINGS_STORAGE_KEY) ?? 'null');
  } catch (error) {
    logger.warn?.('Ignoring malformed saved match settings', error);
  }
  if (source?.version !== MATCH_SETTINGS_VERSION) source = null;

  const fighters = Object.fromEntries(SIDES.map(side => [side, Object.fromEntries(characters.map(character => [
    character.id,
    normalizeFighter(source?.fighters?.[side]?.[character.id], character)
  ]))]));
  let arena = normalizeArena(source?.arena);
  const listeners = new Set();

  function persist() {
    const value = {
      version: MATCH_SETTINGS_VERSION,
      fighters: clone(fighters),
      arena: serializeArena(arena)
    };
    try { storage?.setItem(MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(value)); }
    catch { /* Customization remains usable when persistence is unavailable. */ }
  }

  function notify(detail) {
    persist();
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
      target[key][mode] = clampSetting(value, control);
    } else {
      target[key] = clampSetting(value, control);
    }
    notify({ scope: side, characterId, key, mode });
    return getFighter(side, characterId);
  }

  function getArena() {
    return deepFreeze(clone(arena));
  }

  function setArenaValue(key, value) {
    if (key === 'collisionMode') {
      if (!COLLISION_MODES.includes(value)) throw new Error('Unknown collision mode');
      arena.collisionMode = value;
    } else {
      const control = ARENA_CONTROLS[key];
      if (!control) throw new Error('Unknown arena setting');
      const normalizedValue = key === 'launchDelay' ? Number(value) * 1000 : value;
      const normalizedControl = key === 'launchDelay'
        ? { ...control, min: control.min * 1000, max: control.max * 1000, step: control.step * 1000, default: control.default * 1000 }
        : control;
      arena[key] = clampSetting(normalizedValue, normalizedControl);
      arena.startingDistance = constrainStartingDistance(arena);
    }
    notify({ scope: 'arena', key });
    return getArena();
  }

  function resetFighter(side, characterId) {
    fighters[side][characterId] = normalizeFighter(null, characterById[characterId]);
    notify({ scope: side, characterId, reset: true });
  }

  function resetArena() {
    arena = normalizeArena();
    notify({ scope: 'arena', reset: true });
  }

  function resetAll() {
    SIDES.forEach(side => characters.forEach(character => {
      fighters[side][character.id] = normalizeFighter(null, character);
    }));
    arena = normalizeArena();
    notify({ scope: 'all', reset: true });
  }

  function snapshot(selectedCharacters) {
    return deepFreeze({
      fighters: Object.fromEntries(SIDES.map(side => [side, clone(fighters[side][selectedCharacters[side].id])])),
      arena: clone(arena)
    });
  }

  function applyDuel(duel) {
    const nextFighters = {};
    for (const side of SIDES) {
      const imported = duel?.fighters?.[side];
      const character = characterById[imported?.characterId];
      if (!character) throw new Error('Unknown imported fighter');
      nextFighters[side] = { characterId: character.id, values: normalizeFighter(imported.stats, character) };
    }
    const nextArena = normalizeArena(duel?.arena);
    for (const side of SIDES) fighters[side][nextFighters[side].characterId] = nextFighters[side].values;
    arena = nextArena;
    notify({ scope: 'duel', imported: true });
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return Object.freeze({ getFighter, setFighterValue, getArena, setArenaValue, resetFighter, resetArena, resetAll, snapshot, applyDuel, subscribe });
}
