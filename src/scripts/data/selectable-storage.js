import { createBrowserStorage } from './browser-storage.js';
import { createProjectStorage } from './project-storage.js';
import { createFolderStorage } from './folder-storage.js';
import { createFolderHandleStore } from './folder-handle-store.js';
import { factorySettings, validateBackup } from './backup-codec.js';
import { mergeBackupForSwitch } from './merge-project-data.js';

export const STORAGE_MODE_KEY = 'arena-duel.storage-mode.v1';
const folderIdKey = 'arena-duel.folder-id.v1';
const projectPrefix = 'arena-duel.backend.project.';
const modes = new Set(['browser', 'project', 'folder']);

function scopedStorage(storage, prefix) {
  return { getItem: key => storage?.getItem(prefix + key) ?? null,
    setItem: (key, value) => storage?.setItem(prefix + key, value),
    removeItem: key => storage?.removeItem(prefix + key) };
}

export async function createSelectableStorage(browserStorage, fetcher = fetch, options = {}) {
  const handleStore = options.handleStore ?? createFolderHandleStore(options.indexedDB);
  const pickerAvailable = options.pickerAvailable ?? (typeof globalThis.showDirectoryPicker === 'function');
  const listeners = new Set();
  const projectJournal = scopedStorage(browserStorage, projectPrefix);
  let folderId = browserStorage?.getItem(folderIdKey) ?? null;
  let generation = 0;
  let mode = browserStorage?.getItem(STORAGE_MODE_KEY);
  let active;
  let unsubscribe;
  let switching = false;
  if (!modes.has(mode)) {
    const oldPending = ['settings', 'presets', 'backup'].some(kind =>
      browserStorage?.getItem(`arena-duel.project-pending.${kind}`));
    if (oldPending) {
      for (const kind of ['settings', 'presets', 'backup']) {
        const key = `arena-duel.project-pending.${kind}`;
        const value = browserStorage?.getItem(key);
        if (value) projectJournal.setItem(key, value);
      }
      mode = 'project';
    } else {
      try {
        const response = await fetcher('/api/data/bootstrap', { cache: 'no-store' });
        const data = response.ok ? await response.json() : null;
        mode = data?.exists?.settings || data?.exists?.presets ? 'project' : 'browser';
      } catch { mode = 'browser'; }
    }
    try { browserStorage?.setItem(STORAGE_MODE_KEY, mode); } catch { /* Mode remains in memory. */ }
  }
  async function makeBackend(nextMode, { handle, id } = {}) {
    if (nextMode === 'browser') return createBrowserStorage(browserStorage);
    if (nextMode === 'project') return createProjectStorage(projectJournal, fetcher);
    if (nextMode === 'folder') {
      let remembered = null;
      try { remembered = await handleStore.get(); } catch { /* Reconnect through the picker. */ }
      const selected = handle ?? remembered?.handle ?? {
        name: 'unlinked folder', requestPermission: async () => 'denied'
      };
      return createFolderStorage(selected, browserStorage, id ?? folderId ?? remembered?.id ?? 'unlinked');
    }
    throw new Error('Unknown storage mode');
  }
  active = await makeBackend(mode);
  function notify() {
    const status = getSaveState();
    for (const listener of listeners) listener(status);
  }
  function connect() { unsubscribe?.(); unsubscribe = active.subscribeSaveState(notify); }
  connect();
  function getSaveState() { return { ...active.getSaveState(), mode }; }
  async function switchMode(nextMode, { handle, sourceBackup, chooseOverlaps = () => 'source' } = {}) {
    if (!modes.has(nextMode)) throw new Error('Unknown storage mode');
    if (nextMode === mode && !sourceBackup && !handle) return false;
    if (nextMode === 'folder' && !pickerAvailable && !handle) throw new Error('Folder access is unavailable in this browser');
    if (switching) throw new Error('A storage switch is already in progress');
    switching = true;
    const startedAt = generation;
    let candidate;
    try {
      await active.whenSettled();
      const source = validateBackup(sourceBackup ?? await active.exportBackup());
      const nextId = nextMode === 'folder' && handle ? crypto.randomUUID() : folderId;
      candidate = await makeBackend(nextMode, { handle, id: nextId });
      if (nextMode === 'project' && !candidate.fileAvailable()) {
        throw Object.assign(new Error('Project server unavailable'), { code: 'PROJECT_SERVER_UNAVAILABLE' });
      }
      if (nextMode === 'folder' && candidate.getSaveState().state === 'file-error') throw candidate.getSaveState().error;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (nextMode === 'project' && !candidate.fileAvailable()) {
          throw Object.assign(new Error('Project server unavailable'), { code: 'PROJECT_SERVER_UNAVAILABLE' });
        }
        const destination = validateBackup(await candidate.exportBackup());
        let merged = mergeBackupForSwitch(source, destination, factorySettings());
        if (merged.conflicts.length) {
          const choice = await chooseOverlaps(merged.conflicts);
          if (!['source', 'destination'].includes(choice)) return false;
          if (choice === 'destination') merged = mergeBackupForSwitch(source, destination, factorySettings(), 'destination');
        }
        validateBackup(merged.value);
        try {
          await candidate.importBackup(merged.value);
          if (candidate.getSaveState().state !== 'saved') throw new Error('Destination did not acknowledge the save');
          break;
        }
        catch (error) {
          if (error.status !== 409 || attempt === 2) throw error;
          candidate.dispose?.();
          candidate = await makeBackend(nextMode, { handle, id: nextId });
        }
      }
      if (generation !== startedAt) throw new Error('Gameplay data changed during the storage switch. Try again.');
      if (nextMode === 'folder' && handle) {
        const previous = await handleStore.get().catch(() => null);
        const previousId = folderId;
        try {
          await handleStore.put({ handle, id: nextId });
          browserStorage?.setItem(folderIdKey, nextId);
          browserStorage?.setItem(STORAGE_MODE_KEY, nextMode);
        } catch (error) {
          if (previous) await handleStore.put(previous).catch(() => {});
          try { if (previousId) browserStorage?.setItem(folderIdKey, previousId);
            else browserStorage?.removeItem(folderIdKey); } catch { /* Keep the source active. */ }
          throw error;
        }
        folderId = nextId;
      } else browserStorage?.setItem(STORAGE_MODE_KEY, nextMode);
      unsubscribe?.();
      active.discardLocalEdits();
      active.dispose?.();
      active = candidate;
      candidate = null;
      mode = nextMode;
      connect();
      notify();
      return true;
    } finally { candidate?.dispose?.(); switching = false; }
  }
  return Object.freeze({
    getItem: key => active.getItem(key),
    setItem: (key, value, settings) => { generation += 1; return active.setItem(key, value, settings); },
    exportBackup: () => active.exportBackup(), importBackup: value => active.importBackup(value),
    whenSettled: () => active.whenSettled(), syncPending: () => active.syncPending(),
    discardLocalEdits: () => active.discardLocalEdits(), hasConflict: () => active.hasConflict(),
    fileAvailable: () => active.fileAvailable(), reload: () => active.reload(),
    resolveConflict: choice => active.resolveConflict?.(choice) ?? Promise.resolve(false),
    reconnect: () => active.reconnect?.() ?? Promise.resolve(false),
    getSaveState, subscribeSaveState: listener => { listeners.add(listener); listener(getSaveState()); return () => listeners.delete(listener); },
    getMode: () => mode, switchMode, folderAvailable: () => pickerAvailable,
    inspectProject: async () => {
      const candidate = await makeBackend('project');
      try { if (!candidate.fileAvailable()) throw Object.assign(new Error('Project server unavailable'), { code: 'PROJECT_SERVER_UNAVAILABLE' });
        return candidate.exportBackup(); }
      finally { candidate.dispose?.(); }
    }
  });
}
