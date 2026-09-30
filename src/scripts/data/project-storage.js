import { MATCH_SETTINGS_STORAGE_KEY, MATCH_SETTINGS_VERSION } from '../config/customization.js';
import { PRESET_LIBRARY_KEY, createDuelPresetLibrary } from '../share/duel-preset-library.js';
import { CHARACTERS } from '../config/characters.js';
import { createMatchSettingsStore } from '../customization/settings-store.js';
import { mergeProjectSection, chooseConflictValues } from './merge-project-data.js';
import { validateBackup } from './backup-codec.js';

const keys = { [MATCH_SETTINGS_STORAGE_KEY]: 'settings', [PRESET_LIBRARY_KEY]: 'presets' };
const pendingKey = kind => `arena-duel.project-pending.${kind}`;
const pendingBackupKey = 'arena-duel.project-pending.backup';
const clone = value => JSON.parse(JSON.stringify(value));
const canonical = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export async function createProjectStorage(browserStorage, fetcher = fetch) {
  const values = {};
  const revisions = {};
  const pending = {};
  const timers = {};
  const inflight = {};
  const dirty = {};
  let disposed = false;
  let retryTimer = null;
  const bases = {};
  const listeners = new Set();
  let saveState = 'waiting-for-server';
  let conflictDetails = null;
  let lastError = null;
  let liveServer = false;
  let remoteMerge = false;
  function state(next, error = null) {
    saveState = next;
    lastError = error;
    for (const listener of listeners) listener({ state: next, error, conflict: conflictDetails, liveServer, remoteMerge });
  }
  let fileAvailable = false;
  let conflict = false;
  let serverData = null;
  let backupPending = null;
  let backupGeneration = 0;
  const legacy = {};
  const offline = {};
  try { backupPending = JSON.parse(browserStorage?.getItem(pendingBackupKey) ?? 'null'); } catch { backupPending = null; }
  for (const [key, kind] of Object.entries(keys)) {
    try { legacy[kind] = browserStorage?.getItem(key) ?? null; } catch { legacy[kind] = null; }
    try { offline[kind] = JSON.parse(browserStorage?.getItem(pendingKey(kind)) ?? 'null'); } catch { offline[kind] = null; }
  }
  function clearPending(kind) {
    offline[kind] = null;
    legacy[kind] = null;
    try {
      browserStorage?.removeItem?.(pendingKey(kind));
      browserStorage?.removeItem?.(Object.keys(keys).find(candidate => keys[candidate] === kind));
    } catch { /* The server save still succeeded. */ }
  }
  function rememberPending(kind, value) {
    offline[kind] = { revision: revisions[kind] ?? null, base: bases[kind] ?? null, value };
    try {
      browserStorage?.setItem(Object.keys(keys).find(candidate => keys[candidate] === kind), value);
      browserStorage?.setItem(pendingKey(kind), JSON.stringify(offline[kind]));
    } catch { /* Edits remain in memory. */ }
  }
  function rememberBackup(value, recordedRevisions) {
    backupGeneration += 1;
    backupPending = { value: clone(value), revisions: clone(recordedRevisions) };
    try {
      browserStorage?.setItem(pendingBackupKey, JSON.stringify(backupPending));
      for (const [key, kind] of Object.entries(keys)) {
        if (value[kind]) browserStorage?.setItem(key, JSON.stringify(value[kind]));
        else browserStorage?.removeItem?.(key);
      }
    } catch { /* The backup remains in memory. */ }
  }
  function clearBackup() {
    backupPending = null;
    try { browserStorage?.removeItem?.(pendingBackupKey); } catch { /* Server data remains authoritative. */ }
  }
  function normalizeLegacy(kind) {
    if (!legacy[kind]) return null;
    const parsed = JSON.parse(legacy[kind]);
    if (kind === 'settings') {
      if (![1, 2, 3, 4, MATCH_SETTINGS_VERSION].includes(parsed?.version)) return null;
      return JSON.stringify(createMatchSettingsStore({ characters: CHARACTERS,
        storage: { getItem: () => legacy[kind], setItem: () => {} } }).exportData());
    }
    if (parsed?.version !== 1 || !Array.isArray(parsed.entries)) return null;
    const library = createDuelPresetLibrary({ characters: CHARACTERS,
      storage: { getItem: () => legacy[kind], setItem: () => {} } });
    return JSON.stringify({ version: 1, entries: library.list() });
  }
  async function request(route, options = {}) {
    const response = await fetcher(`/api/data/${route}`, { cache: 'no-store', ...options });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (response.status === 404 && route === 'bootstrap') liveServer = true;
      throw Object.assign(new Error(body.error || `Save failed (${response.status})`), { status: response.status });
    }
    try { return await response.json(); }
    catch (error) {
      if (route === 'bootstrap') liveServer = true;
      throw error;
    }
  }
  async function load() {
    const data = await request('bootstrap');
    serverData = data;
    fileAvailable = true;
    liveServer = false;
    if (backupPending) {
      const saved = backupPending.value;
      if (canonical(data.settings) === canonical(saved.settings) && canonical(data.presets) === canonical(saved.presets)) clearBackup();
      else {
        const matches = ['settings', 'presets'].every(kind => backupPending.revisions[kind] === data.revisions[kind] ||
          (backupPending.revisions[kind] === null && !data.exists[kind]));
        for (const [key, kind] of Object.entries(keys)) {
          revisions[kind] = data.revisions[kind];
          values[key] = saved[kind] ? JSON.stringify(saved[kind]) : null;
        }
        if (!matches) {
          conflict = true;
          conflictDetails = { kind: 'backup', local: saved, remote: {
            format: 'arena-duel.backup', version: 1, settings: data.settings, presets: data.presets
          } };
        }
        return;
      }
    }
    for (const kind of ['settings', 'presets']) {
      revisions[kind] = data.revisions[kind];
      bases[kind] = clone(data[kind]);
      const key = Object.keys(keys).find(candidate => keys[candidate] === kind);
      values[key] = null;
      if (typeof offline[kind]?.value === 'string') {
        let matchesSaved = false;
        let validPending = true;
        try { matchesSaved = canonical(data[kind]) === canonical(JSON.parse(offline[kind].value)); }
        catch { validPending = false; clearPending(kind); }
        if (matchesSaved) clearPending(kind);
        else if (validPending) {
          values[key] = offline[kind].value;
          const matches = offline[kind].revision === data.revisions[kind] ||
            (offline[kind].revision === null && !data.exists[kind]);
          if (matches) dirty[kind] = true;
          else dirty[kind] = true;
          continue;
        }
      }
      if (data[kind]) {
        values[key] = JSON.stringify(data[kind]);
        if (kind === 'settings' && legacy.settings && data.filePresence) {
          try {
            const source = JSON.parse(legacy.settings);
            const normalized = JSON.parse(normalizeLegacy('settings'));
            const protectedIds = new Set(data.filePresence.characterOverrides);
            const merged = data.filePresence.match ? clone(data.settings) : normalized;
            if (!data.filePresence.match) {
              for (const id of protectedIds) merged.characterDefaults[id] = data.settings.characterDefaults[id];
            }
            for (const id of Object.keys(source.characterDefaults ?? {})) {
              if (!protectedIds.has(id) && normalized.characterDefaults[id] &&
                  canonical(merged.characterDefaults[id]) !== canonical(normalized.characterDefaults[id])) {
                merged.characterDefaults[id] = normalized.characterDefaults[id];
              }
            }
            if (canonical(merged) !== canonical(data.settings)) {
              const migrated = await request('settings', { method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'If-Match': revisions.settings }, body: JSON.stringify(merged) });
              revisions.settings = migrated.revision;
              bases.settings = clone(merged);
              values[key] = JSON.stringify(merged);
            }
          } catch { /* Existing project data remains authoritative if legacy data is invalid. */ }
        }
      }
      else if (legacy[kind]) {
        // The API validator decides whether legacy data is safe to migrate.
        try {
          const body = normalizeLegacy(kind);
          if (!body) continue;
          const migrated = await request(kind, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revisions[kind] }, body });
          revisions[kind] = migrated.revision;
          bases[kind] = JSON.parse(body);
          values[key] = body;
          clearPending(kind);
        } catch { /* Invalid legacy data is ignored. */ }
      }
    }
  }
  try { await load(); state(conflict ? 'conflict' : Object.values(dirty).some(Boolean) || backupPending ? 'retrying' : 'saved'); }
  catch (error) {
    state(error.status === 403 ? 'file-error' : 'waiting-for-server', error);
    if (backupPending) {
      for (const [key, kind] of Object.entries(keys)) {
        values[key] = backupPending.value[kind] ? JSON.stringify(backupPending.value[kind]) : null;
        revisions[kind] = backupPending.revisions[kind];
      }
    } else {
      for (const [key, kind] of Object.entries(keys)) {
        try { values[key] = typeof offline[kind]?.value === 'string' ? offline[kind].value : normalizeLegacy(kind);
          if (offline[kind]?.revision) revisions[kind] = offline[kind].revision;
          if (offline[kind]?.base !== undefined) bases[kind] = offline[kind].base;
          dirty[kind] = Boolean(values[key]); }
        catch { values[key] = null; }
      }
    }
  }
  async function flush(kind) {
    if (inflight[kind]) await inflight[kind];
    const record = pending[kind];
    if (!record) return;
    pending[kind] = null;
    const key = Object.keys(keys).find(candidate => keys[candidate] === kind);
    const submitted = values[key];
    state('saving');
    try {
      if (!fileAvailable) {
        const data = await request('bootstrap');
        fileAvailable = true;
        liveServer = false;
        serverData = data;
        if (revisions[kind] !== data.revisions[kind] && (revisions[kind] || data.exists[kind])) {
          const merged = mergeProjectSection(kind, bases[kind] ?? null, JSON.parse(submitted), data[kind]);
          if (merged.conflicts.length) {
            conflictDetails = { kind, base: bases[kind] ?? null, local: JSON.parse(submitted), remote: data[kind], paths: merged.conflicts };
            throw Object.assign(new Error('Overlapping saved changes'), { status: 409 });
          }
          values[key] = JSON.stringify(merged.value);
        }
        revisions[kind] = data.revisions[kind];
        bases[kind] = clone(data[kind]);
      }
      let payload = values[key];
      let result;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          result = await request(kind, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': revisions[kind] }, body: payload });
          break;
        } catch (error) {
          if (error.status !== 409 || attempt === 2) throw error;
          const fresh = await request('bootstrap');
          const merged = mergeProjectSection(kind, bases[kind] ?? null, JSON.parse(payload), fresh[kind]);
          if (merged.conflicts.length) {
            conflictDetails = { kind, base: bases[kind] ?? null, local: JSON.parse(payload), remote: fresh[kind], paths: merged.conflicts };
            throw error;
          }
          payload = JSON.stringify(merged.value);
          revisions[kind] = fresh.revisions[kind];
          bases[kind] = clone(fresh[kind]);
        }
      }
      revisions[kind] = result.revision;
      bases[kind] = JSON.parse(payload);
      if (values[key] === submitted && payload !== submitted) {
        values[key] = payload;
        remoteMerge = true;
      }
      dirty[kind] = values[key] !== payload;
      if (dirty[kind]) rememberPending(kind, values[key]);
      else clearPending(kind);
      state(dirty[kind] ? 'retrying' : 'saved');
      record.resolve();
    } catch (error) {
      if (error.status === 409) conflict = true;
      if (error.status !== 409) fileAvailable = false;
      dirty[kind] = error.status !== 409 && error.status !== 400;
      rememberPending(kind, values[key]);
      state(error.status === 409 ? 'conflict' : error.status === 403 || error.status === 400 || error.status === 413 ? 'file-error' : liveServer ? 'waiting-for-server' : 'retrying', error);
      record.reject(error); // Never report a project save until the file API acknowledges it.
    }
  }
  let backupSync = null;
  async function syncBackup() {
    if (!backupPending || conflict) return false;
    const saved = clone(backupPending);
    const generation = backupGeneration;
    state('saving');
    try {
      if (!fileAvailable) {
        const data = await request('bootstrap');
        fileAvailable = true;
        serverData = data;
        const matches = ['settings', 'presets'].every(kind => saved.revisions[kind] === data.revisions[kind] ||
          (saved.revisions[kind] === null && !data.exists[kind]));
        if (!matches) throw Object.assign(new Error('Saved data changed while offline'), { status: 409 });
        revisions.settings = data.revisions.settings;
        revisions.presets = data.revisions.presets;
      }
      const result = await request('backup', { method: 'POST', headers: { 'Content-Type': 'application/json',
        'X-Settings-Revision': revisions.settings, 'X-Presets-Revision': revisions.presets },
      body: JSON.stringify(saved.value) });
      revisions.settings = result.revisions.settings;
      revisions.presets = result.revisions.presets;
      if (backupGeneration !== generation) {
        backupPending.revisions = clone(result.revisions);
        try { browserStorage?.setItem(pendingBackupKey, JSON.stringify(backupPending)); } catch { /* Keep in memory. */ }
        return false;
      }
      values[MATCH_SETTINGS_STORAGE_KEY] = result.settings ? JSON.stringify(result.settings) : null;
      values[PRESET_LIBRARY_KEY] = result.presets ? JSON.stringify(result.presets) : null;
      clearBackup();
      clearPending('settings');
      clearPending('presets');
      dirty.settings = dirty.presets = false;
      state('saved');
      return true;
    } catch (error) {
      if (error.status >= 400 && error.status < 500) conflict = true;
      if (error.status !== 409) fileAvailable = false;
      state(error.status === 409 ? 'conflict' : error.status === 403 || error.status === 400 ? 'file-error' : liveServer ? 'waiting-for-server' : 'retrying', error);
      return false;
    }
  }
  function setItem(key, value, options = {}) {
    const kind = keys[key];
    if (!kind) return browserStorage?.setItem(key, value);
    values[key] = value;
    dirty[kind] = true;
    state(fileAvailable ? 'saving' : saveState === 'file-error' ? 'file-error' : 'waiting-for-server');
    if (backupPending) {
      backupPending.value[kind] = JSON.parse(value);
      rememberBackup(backupPending.value, backupPending.revisions);
      return Promise.reject(new Error('Backup has not synchronized with project files'));
    }
    if (conflict) {
      offline[kind] = { revision: offline[kind]?.revision ?? null, value };
      try { browserStorage?.setItem(key, value); browserStorage?.setItem(pendingKey(kind), JSON.stringify(offline[kind])); } catch { /* Keep in memory. */ }
      return Promise.reject(Object.assign(new Error('Saved data changed in another tab. Reload or export your edits.'), { status: 409 }));
    }
    rememberPending(kind, value);
    if (pending[kind]) clearTimeout(timers[kind]);
    const previous = pending[kind];
    const promise = new Promise((resolve, reject) => {
      pending[kind] = { resolve: () => { previous?.resolve(); resolve(); }, reject: error => { previous?.reject(error); reject(error); } };
    });
    pending[kind].promise = promise;
    timers[kind] = setTimeout(() => {
      const operation = flush(kind);
      inflight[kind] = operation;
      void operation.finally(() => { if (inflight[kind] === operation) inflight[kind] = null; });
    }, options.debounce ? 220 : 0);
    return promise;
  }
  if (typeof setInterval === 'function') {
    retryTimer = setInterval(() => {
      if (disposed || conflict) return;
      if (backupPending) {
        if (!backupSync) {
          backupSync = syncBackup();
          void backupSync.finally(() => { backupSync = null; });
        }
        return;
      }
      for (const kind of ['settings', 'presets']) {
        if (!dirty[kind] || pending[kind] || inflight[kind]) continue;
        pending[kind] = { resolve: () => {}, reject: () => {} };
        const operation = flush(kind);
        inflight[kind] = operation;
        void operation.finally(() => { if (inflight[kind] === operation) inflight[kind] = null; });
      }
    }, 5000);
    retryTimer.unref?.();
  }
  async function exportBackup() {
    if (backupPending) return clone(backupPending.value);
    if (fileAvailable && !conflict && !pending.settings && !pending.presets && !inflight.settings && !inflight.presets) return request('backup');
    return { format: 'arena-duel.backup', version: 1,
      settings: values[MATCH_SETTINGS_STORAGE_KEY] ? JSON.parse(values[MATCH_SETTINGS_STORAGE_KEY]) : null,
      presets: values[PRESET_LIBRARY_KEY] ? JSON.parse(values[PRESET_LIBRARY_KEY]) : null };
  }
  async function whenSettled() {
    await Promise.allSettled([pending.settings?.promise, pending.presets?.promise,
      inflight.settings, inflight.presets].filter(Boolean));
  }
  async function syncPending() {
    if (backupPending) return syncBackup();
    for (const kind of ['settings', 'presets']) {
      if (!dirty[kind] || pending[kind] || inflight[kind]) continue;
      pending[kind] = { resolve: () => {}, reject: () => {} };
      await flush(kind);
    }
    return !conflict && !dirty.settings && !dirty.presets && saveState === 'saved';
  }
  async function importBackup(value) {
    value = validateBackup(value);
    if (!fileAvailable) {
      clearPending('settings');
      clearPending('presets');
      rememberBackup(value, { settings: revisions.settings ?? null, presets: revisions.presets ?? null });
      values[MATCH_SETTINGS_STORAGE_KEY] = value.settings ? JSON.stringify(value.settings) : null;
      values[PRESET_LIBRARY_KEY] = value.presets ? JSON.stringify(value.presets) : null;
      state('waiting-for-server');
      return { settings: value.settings, presets: value.presets, revisions: clone(revisions) };
    }
    state('saving');
    let result;
    try {
      result = await request('backup', { method: 'POST', headers: { 'Content-Type': 'application/json',
        'X-Settings-Revision': revisions.settings, 'X-Presets-Revision': revisions.presets }, body: JSON.stringify(value) });
    } catch (error) {
      state(error.status === 409 ? 'conflict' : error.status === 403 || error.status === 400 ? 'file-error' : 'retrying', error);
      throw error;
    }
    revisions.settings = result.revisions.settings;
    revisions.presets = result.revisions.presets;
    bases.settings = clone(result.settings);
    bases.presets = clone(result.presets);
    values[MATCH_SETTINGS_STORAGE_KEY] = result.settings ? JSON.stringify(result.settings) : null;
    values[PRESET_LIBRARY_KEY] = result.presets ? JSON.stringify(result.presets) : null;
    clearBackup();
    clearPending('settings');
    clearPending('presets');
    dirty.settings = dirty.presets = false;
    conflict = false;
    conflictDetails = null;
    state('saved');
    for (const [key, kind] of Object.entries(keys)) {
      legacy[kind] = null;
      try { browserStorage?.removeItem?.(key); } catch { /* Project files remain authoritative. */ }
    }
    return result;
  }
  function discardLocalEdits() {
    clearBackup();
    for (const [key, kind] of Object.entries(keys)) {
      clearTimeout(timers[kind]);
      pending[kind]?.reject(new Error('Local edits discarded'));
      pending[kind] = null;
      clearPending(kind);
      dirty[kind] = false;
      legacy[kind] = null;
      try { browserStorage?.removeItem?.(key); } catch { /* Server files remain authoritative. */ }
    }
    conflict = false;
    conflictDetails = null;
    state('saved');
  }
  async function resolveConflict(choice) {
    if (!conflictDetails || !['browser', 'project'].includes(choice)) return false;
    const { kind, base, local, remote } = conflictDetails;
    const fresh = await request('bootstrap');
    if (kind === 'backup') {
      const merged = { format: 'arena-duel.backup', version: 1, settings: null, presets: null };
      for (const section of ['settings', 'presets']) {
        const baseline = section === 'settings' ? createMatchSettingsStore({ characters: CHARACTERS,
          storage: { getItem: () => null, setItem: () => {} } }).exportData() : { version: 1, entries: [] };
        const current = fresh[section] ?? remote[section];
        if (local[section] === null) merged[section] = current;
        else if (current === null) merged[section] = local[section];
        else merged[section] = chooseConflictValues(section, baseline, local[section], current, choice);
      }
      revisions.settings = fresh.revisions.settings;
      revisions.presets = fresh.revisions.presets;
      conflict = false;
      conflictDetails = null;
      return importBackup(merged).then(() => true);
    }
    const key = Object.keys(keys).find(candidate => keys[candidate] === kind);
    const next = chooseConflictValues(kind, base, local, fresh[kind] ?? remote, choice);
    conflict = false;
    conflictDetails = null;
    revisions[kind] = fresh.revisions[kind];
    bases[kind] = clone(fresh[kind]);
    values[key] = JSON.stringify(next);
    await setItem(key, values[key]);
    return true;
  }
  return Object.freeze({ getItem: key => keys[key] ? (values[key] ?? null) : (browserStorage?.getItem(key) ?? null),
    setItem, exportBackup, importBackup, whenSettled, syncPending, discardLocalEdits, hasConflict: () => conflict, fileAvailable: () => fileAvailable,
    getSaveState: () => ({ state: saveState, error: lastError, conflict: conflictDetails, liveServer, remoteMerge }),
    subscribeSaveState: listener => { listeners.add(listener); listener({ state: saveState, error: lastError, conflict: conflictDetails, liveServer, remoteMerge }); return () => listeners.delete(listener); },
    resolveConflict,
    reload: async () => { discardLocalEdits(); await load(); return clone(serverData); },
    dispose: () => { disposed = true; clearInterval(retryTimer); for (const timer of Object.values(timers)) clearTimeout(timer); } });
}
