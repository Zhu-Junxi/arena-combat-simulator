import { readFile, mkdir, rename, writeFile, readdir, unlink } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CHARACTERS } from '../config/characters.js';
import { MATCH_SETTINGS_VERSION, defaultFighterSettings } from '../config/customization.js';
import { PRESET_LIBRARY_VERSION, normalizePresetName } from '../share/duel-preset-library.js';
import { parseDuelRecipe, DUEL_SHARE_VERSION } from '../share/duel-share-codec.js';
import { parseCharacterDefault, createCharacterDefault } from './character-default-codec.js';
import { activeSlots } from '../config/match.js';
import { createMatchSettingsStore } from '../customization/settings-store.js';
import { projectCatalog, readProjectJson } from './project-files.js';

const root = fileURLToPath(new URL('../../../data/', import.meta.url));
const ids = CHARACTERS.filter(item => !item.locked).map(item => item.id);
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fileId = id => createHash('sha256').update(id).digest('hex') + '.json';
const pathFor = relative => join(root, relative);
const readRaw = async relative => { try { return await readFile(pathFor(relative), 'utf8'); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } };
async function atomic(relative, value) {
  const target = pathFor(relative);
  await mkdir(dirname(target), { recursive: true });
  const temporary = `${target}.${randomUUID()}.tmp`;
  try { await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); await rename(temporary, target); }
  catch (error) { await unlink(temporary).catch(() => {}); throw error; }
}
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const conflict = () => { throw Object.assign(new Error('Saved files changed in another tab. Reload or export your edits.'), { status: 409 }); };

function validateStats(id, stats, advanced = false) {
  try { return parseCharacterDefault(createCharacterDefault(id, stats, advanced)).stats; }
  catch { fail(`Invalid ${id} fighter stats`); }
}
function validateSettings(value) {
  if (!value || value.version !== MATCH_SETTINGS_VERSION || typeof value.advanced !== 'boolean' ||
      !value.fighters || !value.arena || !value.characterDefaults) fail('Invalid match settings');
  value = clone(value);
  // Existing version-4 project files predate War; keep every saved fighter and
  // add only the new roster member's factory defaults when its entry is absent.
  const warDefaults = () => defaultFighterSettings(CHARACTERS.find(character => character.id === 'war'));
  if (!Object.hasOwn(value.characterDefaults, 'war')) value.characterDefaults.war = warDefaults();
  for (const id of ids) validateStats(id, value.characterDefaults[id], value.advanced);
  for (const side of ['left', 'right', 'third', 'fourth']) {
    if (!value.fighters[side]) fail('Missing fighter settings');
    if (!Object.hasOwn(value.fighters[side], 'war')) value.fighters[side].war = clone(value.characterDefaults.war);
    for (const id of ids) validateStats(id, value.fighters[side][id], value.advanced);
  }
  const fighters = Object.fromEntries(activeSlots(value.arena.fighterCount)
    .map(side => [side, { characterId: ids[0], stats: value.fighters[side][ids[0]] }]));
  try {
    parseDuelRecipe(JSON.stringify({ format: 'arena-duel.duel', version: DUEL_SHARE_VERSION,
      advanced: value.advanced, fighters, arena: value.arena }), { characters: CHARACTERS });
  } catch { fail('Invalid arena settings'); }
  return clone(value);
}
function validatePresets(value) {
  if (!value || value.version !== PRESET_LIBRARY_VERSION || !Array.isArray(value.entries) || value.entries.length > 200) fail('Invalid preset library');
  const seen = new Set();
  for (const entry of value.entries) {
    if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length > 150 || seen.has(entry.id) ||
        !Number.isFinite(entry.updatedAt) || Object.keys(entry).sort().join(',') !== 'id,name,recipe,updatedAt') fail('Invalid preset entry');
    try {
      normalizePresetName(entry.name);
      parseDuelRecipe(JSON.stringify(entry.recipe), { characters: CHARACTERS });
    } catch { fail('Invalid preset recipe or name'); }
    seen.add(entry.id);
  }
  return clone(value);
}
async function settingsState() {
  const matchRaw = await readRaw('settings/match.json');
  const match = matchRaw === null ? null : JSON.parse(matchRaw);
  const overrides = {};
  const overrideFiles = {};
  for (const id of ids) {
    const raw = await readRaw(`characters/overrides/${id}.json`);
    overrideFiles[id] = raw;
    const value = raw === null ? null : JSON.parse(raw);
    if (value) overrides[id] = parseCharacterDefault(value);
  }
  const base = match ?? (Object.keys(overrides).length ? createMatchSettingsStore({ characters: CHARACTERS,
    storage: { getItem: () => null, setItem: () => {} } }).exportData() : null);
  let result = base ? { ...base, characterDefaults: Object.fromEntries(CHARACTERS.map(character => [character.id,
    overrides[character.id]?.stats ?? defaultFighterSettings(character)])) } : null;
  if (result && Object.values(overrides).some(value => value.advanced)) result.advanced = true;
  if (result && !match) for (const side of ['left', 'right', 'third', 'fourth']) {
    for (const [id, value] of Object.entries(overrides)) result.fighters[side][id] = clone(value.stats);
  }
  if (result) result = validateSettings(result);
  return { value: result, overrides, revision: hash({ matchRaw, overrideFiles }), exists: Boolean(match || Object.keys(overrides).length),
    matchExists: Boolean(match), overrideIds: Object.keys(overrides) };
}
async function presetState() {
  const indexRaw = await readRaw('presets/personal/index.json');
  const index = indexRaw === null ? null : JSON.parse(indexRaw);
  if (!index) return { value: null, revision: hash({ indexRaw: null }), exists: false };
  if (index.version !== PRESET_LIBRARY_VERSION || !Array.isArray(index.entries)) fail('Invalid preset index');
  const entries = [];
  const recipeFiles = {};
  for (const meta of index.entries) {
    if (!meta || Object.keys(meta).sort().join(',') !== 'id,name,updatedAt' || typeof meta.id !== 'string') fail('Invalid preset index entry');
    const raw = await readRaw(`presets/personal/${fileId(meta.id)}`);
    recipeFiles[meta.id] = raw;
    const recipe = raw === null ? null : JSON.parse(raw);
    if (!recipe) fail('Missing preset recipe');
    entries.push({ ...meta, recipe });
  }
  const value = validatePresets({ version: PRESET_LIBRARY_VERSION, entries });
  return { value, revision: hash({ indexRaw, recipeFiles }), exists: true };
}
async function readBootstrapData() {
  for (const id of projectCatalog.characters) parseCharacterDefault(await readProjectJson(`characters/factory/${id}.json`));
  const [settings, presets] = await Promise.all([settingsState(), presetState()]);
  return { settings: settings.value, presets: presets.value,
    revisions: { settings: settings.revision, presets: presets.revision },
    exists: { settings: settings.exists, presets: presets.exists },
    filePresence: { match: settings.matchExists, characterOverrides: settings.overrideIds, presetIndex: presets.exists } };
}
let queue = Promise.resolve();
export async function bootstrapData() {
  await queue;
  return readBootstrapData();
}
function serial(operation) { const next = queue.then(operation); queue = next.catch(() => {}); return next; }
export function saveSettings(value, revision) { return serial(async () => {
  const current = await settingsState();
  if (revision !== current.revision) conflict();
  const valid = validateSettings(value);
  const match = { ...valid };
  delete match.characterDefaults;
  await atomic('settings/match.json', match);
  for (const id of ids) {
    const factory = defaultFighterSettings(CHARACTERS.find(item => item.id === id));
    const relative = `characters/overrides/${id}.json`;
    if (JSON.stringify(valid.characterDefaults[id]) === JSON.stringify(factory)) await unlink(pathFor(relative)).catch(error => { if (error.code !== 'ENOENT') throw error; });
    else await atomic(relative, createCharacterDefault(id, valid.characterDefaults[id], valid.advanced));
  }
  return (await settingsState()).revision;
}); }
export function savePresets(value, revision) { return serial(async () => {
  const current = await presetState();
  if (revision !== current.revision) conflict();
  const valid = validatePresets(value);
  for (const entry of valid.entries) await atomic(`presets/personal/${fileId(entry.id)}`, entry.recipe);
  await atomic('presets/personal/index.json', { version: PRESET_LIBRARY_VERSION,
    entries: valid.entries.map(({ recipe, ...meta }) => meta) });
  const keep = new Set(valid.entries.map(entry => fileId(entry.id)));
  const folder = pathFor('presets/personal');
  for (const file of await readdir(folder).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    if (file.endsWith('.json') && file !== 'index.json' && !keep.has(file)) await unlink(join(folder, file));
  }
  return (await presetState()).revision;
}); }
export async function exportBackup() {
  const data = await bootstrapData();
  return { format: 'arena-duel.backup', version: 1, settings: data.settings, presets: data.presets };
}
export function importBackup(value, revisions) { return serial(async () => {
  if (!value || value.format !== 'arena-duel.backup' || value.version !== 1 ||
      Object.keys(value).sort().join(',') !== 'format,presets,settings,version' ||
      (value.settings !== null && typeof value.settings !== 'object') ||
      (value.presets !== null && typeof value.presets !== 'object')) fail('Invalid backup');
  const before = await readBootstrapData();
  if (revisions?.settings !== before.revisions.settings || revisions?.presets !== before.revisions.presets) conflict();
  if (value.settings) validateSettings(value.settings);
  if (value.presets) validatePresets(value.presets);
  // Keep revisions checked across the complete import.
  if (value.settings) await saveSettingsUnlocked(value.settings, before.revisions.settings);
  else {
    await unlink(pathFor('settings/match.json')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    for (const id of ids) await unlink(pathFor(`characters/overrides/${id}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  if (value.presets) await savePresetsUnlocked(value.presets, before.revisions.presets);
  else {
    await unlink(pathFor('presets/personal/index.json')).catch(error => { if (error.code !== 'ENOENT') throw error; });
    for (const file of await readdir(pathFor('presets/personal')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
      if (file.endsWith('.json')) await unlink(pathFor(`presets/personal/${file}`));
    }
  }
  return readBootstrapData();
}); }
async function saveSettingsUnlocked(value, revision) { // Reuse public writer without nesting its queue.
  const current = await settingsState(); if (revision !== current.revision) conflict();
  const valid = validateSettings(value); const match = { ...valid }; delete match.characterDefaults;
  await atomic('settings/match.json', match);
  for (const id of ids) await atomic(`characters/overrides/${id}.json`, createCharacterDefault(id, valid.characterDefaults[id], valid.advanced));
}
async function savePresetsUnlocked(value, revision) {
  const current = await presetState(); if (revision !== current.revision) conflict();
  const valid = validatePresets(value);
  for (const entry of valid.entries) await atomic(`presets/personal/${fileId(entry.id)}`, entry.recipe);
  await atomic('presets/personal/index.json', { version: PRESET_LIBRARY_VERSION, entries: valid.entries.map(({ recipe, ...meta }) => meta) });
  const keep = new Set(valid.entries.map(entry => fileId(entry.id)));
  for (const file of await readdir(pathFor('presets/personal')).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
    if (file.endsWith('.json') && file !== 'index.json' && !keep.has(file)) await unlink(pathFor(`presets/personal/${file}`));
  }
}
export { validateSettings, validatePresets, validateStats };
