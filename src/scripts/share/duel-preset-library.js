import { defaultArenaSettings, defaultFighterSettings } from '../config/customization.js';
import { createDuelRecipe, parseDuelRecipe } from './duel-share-codec.js';

export const PRESET_LIBRARY_KEY = 'arena-duel.presets.v1';
export const PRESET_LIBRARY_VERSION = 1;

const clone = value => JSON.parse(JSON.stringify(value));
const MATCHUPS = Object.freeze([
  ['warrior-archer', 'warrior', 'archer'],
  ['guardian-mage', 'guardian', 'mage'],
  ['priest-beastmaster', 'priest', 'beastmaster']
]);

export function normalizePresetName(value) {
  const name = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) throw new Error('Preset name must contain 1 to 80 printable characters');
  return name;
}

export function uniquePresetName(name, occupied) {
  const taken = new Set(occupied.map(value => value.toLocaleLowerCase()));
  if (!taken.has(name.toLocaleLowerCase())) return name;
  for (let number = 2; ; number += 1) {
    const suffix = ` (${number})`;
    const candidate = `${name.slice(0, 80 - suffix.length)}${suffix}`;
    if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
  }
}

export function createBuiltinPresets(characters) {
  const byId = Object.fromEntries(characters.map(character => [character.id, character]));
  return MATCHUPS.map(([id, leftId, rightId]) => {
    const left = byId[leftId];
    const right = byId[rightId];
    const arena = defaultArenaSettings();
    const recipe = createDuelRecipe({
      selectedCharacters: { left, right },
      setup: {
        advanced: false,
        fighters: { left: defaultFighterSettings(left), right: defaultFighterSettings(right) },
        arena: { ...arena, collisionMode: 'bounce', targetStrategy: 'nearest', launchDelay: arena.launchDelay * 1000 }
      }
    });
    return Object.freeze({ id: `builtin:${id}`, nameKey: `preset.builtin.${id.replace('-', '_')}`, builtIn: true, recipe });
  });
}

export function firstTwoFighterRecipe(recipe, characters) {
  const parsed = parseDuelRecipe(JSON.stringify(recipe), { characters });
  return {
    ...recipe,
    fighters: { left: clone(parsed.fighters.left), right: clone(parsed.fighters.right) },
    arena: { ...recipe.arena, fighterCount: 2 }
  };
}

export function createDuelPresetLibrary({ characters, storage = globalThis.localStorage, idFactory = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`, logger = console } = {}) {
  let entries = [];
  try {
    const source = JSON.parse(storage?.getItem(PRESET_LIBRARY_KEY) ?? 'null');
    if (source?.version === PRESET_LIBRARY_VERSION && Array.isArray(source.entries)) {
      const seen = new Set();
      entries = source.entries.filter(entry => {
        try {
          if (typeof entry.id !== 'string' || !entry.id || seen.has(entry.id) || !Number.isFinite(entry.updatedAt)) return false;
          normalizePresetName(entry.name);
          parseDuelRecipe(JSON.stringify(entry.recipe), { characters });
          seen.add(entry.id);
          return true;
        } catch { return false; }
      }).map(clone);
    }
  } catch (error) {
    logger.warn?.('Ignoring malformed duel preset library', error);
  }

  function commit(next) {
    // Do not claim a save succeeded if storage is unavailable or full.
    if (!storage) throw new Error('Preset storage is unavailable');
    storage.setItem(PRESET_LIBRARY_KEY, JSON.stringify({ version: PRESET_LIBRARY_VERSION, entries: next }));
    entries = next;
  }

  function list() { return clone(entries); }
  function get(id) { const entry = entries.find(item => item.id === id); return entry ? clone(entry) : null; }
  function collision(name, exceptId = null) {
    return entries.find(entry => entry.id !== exceptId && entry.name.toLocaleLowerCase() === name.toLocaleLowerCase()) ?? null;
  }

  function save(nameInput, recipe, { replaceId = null, reservedNames = [] } = {}) {
    const name = normalizePresetName(nameInput);
    parseDuelRecipe(JSON.stringify(recipe), { characters });
    const replacing = replaceId ? get(replaceId) : null;
    if (replaceId && !replacing) throw new Error('Unknown preset to replace');
    const finalName = replacing ? name : uniquePresetName(name, [...entries.map(entry => entry.name), ...reservedNames]);
    const entry = { id: replacing?.id ?? idFactory(), name: finalName, recipe: clone(recipe), updatedAt: Date.now() };
    commit(replacing ? entries.map(item => item.id === replaceId ? entry : item) : [entry, ...entries]);
    return clone(entry);
  }

  function rename(id, nameInput, { replaceId = null, reservedNames = [] } = {}) {
    const current = get(id);
    if (!current) throw new Error('Unknown preset');
    const name = normalizePresetName(nameInput);
    if (replaceId === id) throw new Error('Cannot replace the same preset');
    if (replaceId && !get(replaceId)) throw new Error('Unknown preset to replace');
    const remaining = entries.filter(entry => entry.id !== id && entry.id !== replaceId);
    const finalName = replaceId ? name : uniquePresetName(name, [...remaining.map(entry => entry.name), ...reservedNames]);
    const changed = { ...current, name: finalName, updatedAt: Date.now() };
    commit([changed, ...remaining]);
    return clone(changed);
  }

  function remove(id) {
    if (!get(id)) throw new Error('Unknown preset');
    commit(entries.filter(entry => entry.id !== id));
  }

  return Object.freeze({ list, get, collision, save, rename, remove });
}
