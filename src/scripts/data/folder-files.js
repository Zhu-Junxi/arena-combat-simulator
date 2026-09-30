import { CHARACTERS } from '../config/characters.js';
import { defaultFighterSettings } from '../config/customization.js';
import { createCharacterDefault, parseCharacterDefault } from './character-default-codec.js';
import { backup, factorySettings, validateBackup } from './backup-codec.js';

const ids = CHARACTERS.filter(character => !character.locked).map(character => character.id);
const missing = error => error?.name === 'NotFoundError';
const clone = value => structuredClone(value);

async function directory(parent, path, create = false) {
  let current = parent;
  for (const segment of path.split('/').filter(Boolean)) {
    try { current = await current.getDirectoryHandle(segment, { create }); }
    catch (error) { if (!create && missing(error)) return null; throw error; }
  }
  return current;
}
async function readRaw(parent, path) {
  const segments = path.split('/');
  const folder = await directory(parent, segments.slice(0, -1).join('/'));
  if (!folder) return null;
  try { return await (await (await folder.getFileHandle(segments.at(-1))).getFile()).text(); }
  catch (error) { if (missing(error)) return null; throw error; }
}
async function writeJson(parent, path, value) {
  const segments = path.split('/');
  const folder = await directory(parent, segments.slice(0, -1).join('/'), true);
  const file = await folder.getFileHandle(segments.at(-1), { create: true });
  const writable = await file.createWritable();
  try { await writable.write(JSON.stringify(value, null, 2) + '\n'); await writable.close(); }
  catch (error) { try { await writable.abort?.(); } catch { /* Preserve the write error. */ } throw error; }
}
async function removeFile(parent, path) {
  const segments = path.split('/');
  const folder = await directory(parent, segments.slice(0, -1).join('/'));
  if (!folder) return;
  try { await folder.removeEntry(segments.at(-1)); }
  catch (error) { if (!missing(error)) throw error; }
}
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
const recipeFile = async id => `data/presets/personal/${await sha256(id)}.json`;

export async function readFolderData(parent) {
  const matchRaw = await readRaw(parent, 'data/settings/match.json');
  const overrideFiles = {};
  const overrides = {};
  for (const id of ids) {
    const raw = await readRaw(parent, `data/characters/overrides/${id}.json`);
    overrideFiles[id] = raw;
    if (raw !== null) {
      const parsed = parseCharacterDefault(raw);
      if (parsed.characterId !== id) throw new Error(`Wrong character override: ${id}`);
      overrides[id] = parsed;
    }
  }
  let settings = null;
  if (matchRaw !== null || Object.keys(overrides).length) {
    settings = matchRaw === null ? factorySettings() : JSON.parse(matchRaw);
    settings.characterDefaults = Object.fromEntries(CHARACTERS.map(character => [character.id,
      overrides[character.id]?.stats ?? defaultFighterSettings(character)]));
    if (Object.values(overrides).some(value => value.advanced)) settings.advanced = true;
    if (matchRaw === null) for (const side of ['left', 'right', 'third', 'fourth']) {
      for (const [id, value] of Object.entries(overrides)) settings.fighters[side][id] = clone(value.stats);
    }
  }
  const indexRaw = await readRaw(parent, 'data/presets/personal/index.json');
  const recipeFiles = {};
  let presets = null;
  if (indexRaw !== null) {
    const index = JSON.parse(indexRaw);
    if (index?.version !== 1 || !Array.isArray(index.entries)) throw new Error('Invalid preset index');
    const entries = [];
    for (const meta of index.entries) {
      if (typeof meta?.id !== 'string' || Object.keys(meta).sort().join(',') !== 'id,name,updatedAt') throw new Error('Invalid preset index entry');
      const raw = await readRaw(parent, await recipeFile(meta.id));
      if (raw === null) throw new Error('Missing preset recipe');
      recipeFiles[meta.id] = raw;
      entries.push({ ...meta, recipe: JSON.parse(raw) });
    }
    presets = { version: 1, entries };
  }
  const value = validateBackup(backup(settings, presets));
  return { value, revisions: { settings: await sha256(JSON.stringify({ matchRaw, overrideFiles })),
    presets: await sha256(JSON.stringify({ indexRaw, recipeFiles })) },
    exists: { settings: settings !== null, presets: presets !== null } };
}

export async function writeFolderSection(parent, kind, value) {
  validateBackup(backup(kind === 'settings' ? value : null, kind === 'presets' ? value : null));
  if (kind === 'settings') {
    if (value === null) {
      await removeFile(parent, 'data/settings/match.json');
      for (const id of ids) await removeFile(parent, `data/characters/overrides/${id}.json`);
    } else {
      const match = { ...value };
      delete match.characterDefaults;
      await writeJson(parent, 'data/settings/match.json', match);
      for (const id of ids) {
        const character = CHARACTERS.find(item => item.id === id);
        const stats = value.characterDefaults[id];
        if (JSON.stringify(stats) === JSON.stringify(defaultFighterSettings(character))) {
          await removeFile(parent, `data/characters/overrides/${id}.json`);
        } else await writeJson(parent, `data/characters/overrides/${id}.json`, createCharacterDefault(id, stats, value.advanced));
      }
    }
  } else if (kind === 'presets') {
    const folder = await directory(parent, 'data/presets/personal', Boolean(value));
    if (!value) {
      if (folder) for await (const [name, handle] of folder.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json')) await folder.removeEntry(name);
      }
    } else {
      const keep = new Set(['index.json']);
      for (const entry of value.entries) {
        const filename = (await recipeFile(entry.id)).split('/').at(-1);
        keep.add(filename);
        await writeJson(parent, `data/presets/personal/${filename}`, entry.recipe);
      }
      await writeJson(parent, 'data/presets/personal/index.json', { version: 1,
        entries: value.entries.map(({ recipe, ...meta }) => meta) });
      for await (const [name, handle] of folder.entries()) {
        if (handle.kind === 'file' && name.endsWith('.json') && !keep.has(name)) await folder.removeEntry(name);
      }
    }
  } else throw new Error('Unknown folder section');
}
