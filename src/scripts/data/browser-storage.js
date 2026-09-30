import { backup, backupKeys, validateBackup } from './backup-codec.js';

export function createBrowserStorage(storage) {
  const values = {};
  const listeners = new Set();
  let saveState = 'saved';
  let lastError = null;
  for (const key of Object.keys(backupKeys)) {
    try { values[key] = storage?.getItem(key) ?? null; }
    catch { values[key] = null; }
  }
  function notify(state, error = null) {
    saveState = state;
    lastError = error;
    for (const listener of listeners) listener(getSaveState());
  }
  function getSaveState() { return { state: saveState, error: lastError, conflict: null, liveServer: false }; }
  function getItem(key) { return Object.hasOwn(backupKeys, key) ? values[key] : storage?.getItem(key) ?? null; }
  function setItem(key, value) {
    if (!Object.hasOwn(backupKeys, key)) return storage?.setItem(key, value);
    values[key] = value;
    notify('saving');
    try {
      if (!storage) throw new Error('Browser storage unavailable');
      storage.setItem(key, value);
      notify('saved');
      return Promise.resolve();
    } catch (error) {
      notify('file-error', error);
      return Promise.reject(error);
    }
  }
  async function exportBackup() {
    return validateBackup(backup(...['settings', 'presets'].map(kind => {
      const key = Object.keys(backupKeys).find(candidate => backupKeys[candidate] === kind);
      return values[key] ? JSON.parse(values[key]) : null;
    })));
  }
  async function importBackup(value) {
    const valid = validateBackup(value);
    const prior = Object.fromEntries(Object.keys(backupKeys).map(key => [key, storage?.getItem(key) ?? null]));
    notify('saving');
    try {
      if (!storage) throw new Error('Browser storage unavailable');
      for (const [key, kind] of Object.entries(backupKeys)) {
        if (valid[kind]) storage.setItem(key, JSON.stringify(valid[kind]));
        else storage.removeItem(key);
      }
      for (const [key, kind] of Object.entries(backupKeys)) values[key] = valid[kind] ? JSON.stringify(valid[kind]) : null;
      notify('saved');
      return valid;
    } catch (error) {
      for (const [key, previous] of Object.entries(prior)) {
        try { if (previous === null) storage?.removeItem(key); else storage?.setItem(key, previous); } catch { /* Keep memory copy. */ }
      }
      notify('file-error', error);
      throw error;
    }
  }
  async function syncPending() {
    if (saveState !== 'file-error') return true;
    try { await importBackup(await exportBackup()); return true; } catch { return false; }
  }
  function discardLocalEdits() {
    for (const key of Object.keys(backupKeys)) values[key] = storage?.getItem(key) ?? null;
    notify('saved');
  }
  return Object.freeze({ getItem, setItem, exportBackup, importBackup, getSaveState,
    subscribeSaveState: listener => { listeners.add(listener); listener(getSaveState()); return () => listeners.delete(listener); },
    whenSettled: async () => {}, syncPending, discardLocalEdits, hasConflict: () => false,
    fileAvailable: () => Boolean(storage), reload: async () => { discardLocalEdits(); return exportBackup(); }, dispose() {} });
}
