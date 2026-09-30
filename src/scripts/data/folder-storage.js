import { backup, backupKeys, validateBackup } from './backup-codec.js';
import { readFolderData, writeFolderSection } from './folder-files.js';
import { mergeProjectSection, chooseConflictValues } from './merge-project-data.js';

const clone = value => structuredClone(value);
const canonical = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const same = (a, b) => canonical(a) === canonical(b);

export async function createFolderStorage(handle, browserStorage, folderId = 'active') {
  const cacheKey = `arena-duel.folder.${folderId}.cache`;
  const pendingKey = `arena-duel.folder.${folderId}.pending`;
  const values = {};
  const revisions = {};
  const bases = {};
  const pending = {};
  const timers = {};
  const inflight = {};
  const dirty = {};
  const listeners = new Set();
  let lastError = null;
  let saveState = 'saved';
  let conflict = null;
  let remoteMerge = false;
  let disposed = false;
  let retryTimer;
  const keyFor = kind => Object.keys(backupKeys).find(key => backupKeys[key] === kind);
  const getSaveState = () => ({ state: saveState, error: lastError, conflict, liveServer: false, remoteMerge,
    location: `${handle.name}/data/` });
  function state(next, error = null) {
    saveState = next;
    lastError = error;
    for (const listener of listeners) listener(getSaveState());
  }
  function snapshot() { return backup(...['settings', 'presets'].map(kind => values[keyFor(kind)] ? JSON.parse(values[keyFor(kind)]) : null)); }
  function journal() {
    try { browserStorage?.setItem(cacheKey, JSON.stringify(snapshot()));
      browserStorage?.setItem(pendingKey, JSON.stringify({ value: snapshot(), revisions, bases })); }
    catch { /* Unsaved edits remain in memory. */ }
  }
  function clearJournal() {
    try { browserStorage?.setItem(cacheKey, JSON.stringify(snapshot())); browserStorage?.removeItem(pendingKey); }
    catch { /* The folder write already succeeded. */ }
  }
  let savedPending = null;
  try { savedPending = JSON.parse(browserStorage?.getItem(pendingKey) ?? 'null'); } catch { /* Ignore damaged journal. */ }
  try {
    const initial = await readFolderData(handle);
    for (const kind of ['settings', 'presets']) {
      const key = keyFor(kind);
      revisions[kind] = savedPending?.revisions?.[kind] ?? initial.revisions[kind];
      bases[kind] = savedPending?.bases?.[kind] ?? clone(initial.value[kind]);
      const current = savedPending?.value?.[kind] ?? initial.value[kind];
      values[key] = current ? JSON.stringify(current) : null;
      dirty[kind] = Boolean(savedPending && !same(current, initial.value[kind]));
    }
    state(Object.values(dirty).some(Boolean) ? 'retrying' : 'saved');
    if (!Object.values(dirty).some(Boolean)) clearJournal();
  } catch (error) {
    let cached = null;
    try { cached = validateBackup(savedPending?.value ?? JSON.parse(browserStorage?.getItem(cacheKey) ?? 'null')); }
    catch { cached = backup(); }
    for (const kind of ['settings', 'presets']) {
      values[keyFor(kind)] = cached[kind] ? JSON.stringify(cached[kind]) : null;
      revisions[kind] = savedPending?.revisions?.[kind] ?? null;
      bases[kind] = savedPending?.bases?.[kind] ?? null;
      dirty[kind] = Boolean(savedPending?.value?.[kind]);
    }
    state('file-error', error);
  }
  async function flush(kind) {
    if (inflight[kind]) await inflight[kind];
    const record = pending[kind];
    if (!record) return;
    pending[kind] = null;
    const key = keyFor(kind);
    const submitted = values[key];
    state('saving');
    try {
      const current = await readFolderData(handle);
      let next = submitted ? JSON.parse(submitted) : null;
      if (revisions[kind] !== current.revisions[kind]) {
        const merged = mergeProjectSection(kind, bases[kind], next, current.value[kind]);
        if (merged.conflicts.length) {
          conflict = { kind, base: bases[kind], local: next, remote: current.value[kind], paths: merged.conflicts };
          throw Object.assign(new Error('Overlapping folder edits'), { status: 409 });
        }
        next = merged.value;
      }
      validateBackup(backup(kind === 'settings' ? next : null, kind === 'presets' ? next : null));
      await writeFolderSection(handle, kind, next);
      const written = await readFolderData(handle);
      if (!same(written.value[kind], next)) throw new Error('Folder write could not be verified');
      revisions[kind] = written.revisions[kind];
      bases[kind] = clone(next);
      if (values[key] === submitted) {
        values[key] = next ? JSON.stringify(next) : null;
        if (!same(submitted ? JSON.parse(submitted) : null, next)) remoteMerge = true;
      }
      dirty[kind] = values[key] !== (next ? JSON.stringify(next) : null);
      if (dirty.settings || dirty.presets) journal(); else clearJournal();
      state(dirty[kind] ? 'retrying' : 'saved');
      record.resolve();
    } catch (error) {
      dirty[kind] = true;
      journal();
      state(error.status === 409 ? 'conflict' : ['NotAllowedError', 'SecurityError'].includes(error.name)
        ? 'file-error' : 'retrying', error);
      record.reject(error);
    }
  }
  function setItem(key, value, options = {}) {
    const kind = backupKeys[key];
    if (!kind) return browserStorage?.setItem(key, value);
    values[key] = value;
    dirty[kind] = true;
    journal();
    if (conflict) { state('conflict'); return Promise.reject(Object.assign(new Error('Folder values changed'), { status: 409 })); }
    state('saving');
    if (pending[kind]) clearTimeout(timers[kind]);
    const previous = pending[kind];
    const promise = new Promise((resolve, reject) => {
      pending[kind] = { resolve: () => { previous?.resolve(); resolve(); },
        reject: error => { previous?.reject(error); reject(error); } };
    });
    pending[kind].promise = promise;
    timers[kind] = setTimeout(() => {
      const operation = flush(kind);
      inflight[kind] = operation;
      void operation.finally(() => { if (inflight[kind] === operation) inflight[kind] = null; });
    }, options.debounce ? 220 : 0);
    return promise;
  }
  retryTimer = setInterval(() => {
    if (disposed || conflict || saveState === 'file-error') return;
    for (const kind of ['settings', 'presets']) {
      if (!dirty[kind] || pending[kind] || inflight[kind]) continue;
      pending[kind] = { resolve() {}, reject() {} };
      const operation = flush(kind);
      inflight[kind] = operation;
      void operation.finally(() => { if (inflight[kind] === operation) inflight[kind] = null; });
    }
  }, 5000);
  retryTimer.unref?.();
  async function importBackup(value) {
    const valid = validateBackup(value);
    state('saving');
    try {
      const before = await readFolderData(handle);
      if (['settings', 'presets'].some(kind => revisions[kind] !== before.revisions[kind])) {
        throw Object.assign(new Error('Folder files changed'), { status: 409 });
      }
      for (const kind of ['settings', 'presets']) await writeFolderSection(handle, kind, valid[kind]);
      const written = await readFolderData(handle);
      if (!same(written.value, valid)) throw new Error('Folder write could not be verified');
      for (const kind of ['settings', 'presets']) {
        values[keyFor(kind)] = valid[kind] ? JSON.stringify(valid[kind]) : null;
        revisions[kind] = written.revisions[kind];
        bases[kind] = clone(valid[kind]);
        dirty[kind] = false;
      }
      conflict = null;
      clearJournal();
      state('saved');
      return valid;
    } catch (error) { state(error.status === 409 ? 'conflict' : ['NotAllowedError', 'SecurityError'].includes(error.name)
      ? 'file-error' : 'retrying', error); throw error; }
  }
  async function resolveConflict(choice) {
    if (!conflict || !['browser', 'project'].includes(choice)) return false;
    const { kind, base, local } = conflict;
    const fresh = await readFolderData(handle);
    const next = chooseConflictValues(kind, base, local, fresh.value[kind], choice);
    revisions[kind] = fresh.revisions[kind];
    bases[kind] = clone(fresh.value[kind]);
    conflict = null;
    await setItem(keyFor(kind), JSON.stringify(next));
    return true;
  }
  async function syncPending() {
    if (conflict) return false;
    for (const kind of ['settings', 'presets']) {
      if (!dirty[kind] || pending[kind] || inflight[kind]) continue;
      pending[kind] = { resolve() {}, reject() {} };
      await flush(kind);
    }
    return !dirty.settings && !dirty.presets && saveState === 'saved';
  }
  async function reconnect() {
    if (await handle.requestPermission?.({ mode: 'readwrite' }) !== 'granted') return false;
    state('retrying');
    if (!dirty.settings && !dirty.presets) {
      const fresh = await readFolderData(handle);
      for (const kind of ['settings', 'presets']) {
        values[keyFor(kind)] = fresh.value[kind] ? JSON.stringify(fresh.value[kind]) : null;
        revisions[kind] = fresh.revisions[kind];
        bases[kind] = clone(fresh.value[kind]);
      }
      clearJournal();
      state('saved');
      return true;
    }
    return syncPending();
  }
  function discardLocalEdits() {
    try { browserStorage?.removeItem(pendingKey); } catch { /* Keep memory. */ }
    dirty.settings = dirty.presets = false;
    conflict = null;
  }
  return Object.freeze({ getItem: key => Object.hasOwn(backupKeys, key) ? values[key] : browserStorage?.getItem(key) ?? null,
    setItem, exportBackup: async () => validateBackup(snapshot()), importBackup, getSaveState,
    subscribeSaveState: listener => { listeners.add(listener); listener(getSaveState()); return () => listeners.delete(listener); },
    whenSettled: async () => { await Promise.allSettled([pending.settings?.promise, pending.presets?.promise,
      inflight.settings, inflight.presets].filter(Boolean)); },
    syncPending, discardLocalEdits, hasConflict: () => Boolean(conflict), fileAvailable: () => saveState !== 'file-error',
    resolveConflict, reconnect, reload: async () => readFolderData(handle),
    dispose: () => { disposed = true; clearInterval(retryTimer); for (const timer of Object.values(timers)) clearTimeout(timer); } });
}
