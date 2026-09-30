import { validateBackup } from './backup-codec.js';

function downloadBackup(value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'arena-duel-backup.json';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function createStorageConflictPrompt(elements, i18n) {
  const dialog = elements['storage-conflict-dialog'];
  const current = elements['storage-conflict-current'];
  const destination = elements['storage-conflict-destination'];
  const cancel = elements['storage-conflict-cancel'];
  return paths => new Promise(resolve => {
    elements['storage-conflict-message'].textContent = i18n.t('storage.overlap_message', { count: paths.length });
    const cleanup = () => {
      current.removeEventListener('click', keepCurrent);
      destination.removeEventListener('click', keepDestination);
      cancel.removeEventListener('click', stop);
      dialog.removeEventListener('close', stop);
    };
    const finish = choice => { cleanup(); dialog.close(); resolve(choice); };
    const keepCurrent = () => finish('source');
    const keepDestination = () => finish('destination');
    const stop = () => { cleanup(); if (dialog.open) dialog.close(); resolve(null); };
    current.addEventListener('click', keepCurrent);
    destination.addEventListener('click', keepDestination);
    cancel.addEventListener('click', stop);
    dialog.addEventListener('close', stop);
    dialog.showModal();
    current.focus({ preventScroll: true });
  });
}

export function bindStorageSettings({ elements, storage, i18n, saveUI, chooseOverlaps }) {
  const select = elements['storage-mode'];
  const locationLabel = elements['storage-location'];
  const saveLabel = elements['storage-save-state'];
  const unsupported = elements['storage-unsupported'];
  const changeFolder = elements['storage-change-folder'];
  const reconnect = elements['storage-reconnect'];
  const previewButton = elements['storage-preview'];
  const preview = elements['storage-preview-dialog'];
  const previewJson = elements['storage-preview-json'];
  const errorLabel = elements['storage-error'];
  let busy = false;
  function error(key = 'storage.operation_failed') {
    errorLabel.hidden = false;
    errorLabel.textContent = i18n.t(key);
  }
  function clearError() { errorLabel.hidden = true; errorLabel.textContent = ''; }
  function render() {
    const status = storage.getSaveState();
    const mode = storage.getMode();
    select.value = mode;
    select.disabled = busy;
    select.querySelector('option[value="folder"]').disabled = !storage.folderAvailable();
    unsupported.hidden = storage.folderAvailable();
    elements['storage-folder-help'].hidden = mode !== 'folder';
    locationLabel.textContent = i18n.t(`storage.location_${mode}`, { folder: status.location ?? '' });
    saveLabel.textContent = i18n.t(status.state === 'saved' ? `save.saved_${mode}` :
      `save.${status.state.replaceAll('-', '_')}`, { mode: i18n.t(`storage.mode_${mode}`) });
    changeFolder.hidden = mode !== 'folder';
    reconnect.hidden = mode !== 'folder' || status.state !== 'file-error';
  }
  storage.subscribeSaveState(render);
  i18n.subscribe(render);
  async function switchTo(mode, handle = null) {
    if (busy) return;
    busy = true;
    clearError();
    render();
    try {
      const switched = await storage.switchMode(mode, { handle, chooseOverlaps });
      if (switched) location.reload();
    } catch (failure) {
      if (failure?.code === 'PROJECT_SERVER_UNAVAILABLE') {
        saveUI.startProjectHandoff();
        error('storage.start_project_server');
      } else if (failure?.name !== 'AbortError') error();
    } finally { busy = false; render(); }
  }
  select.addEventListener('change', () => {
    const mode = select.value;
    if (mode === 'project' && location.origin !== 'http://127.0.0.1:4173') {
      saveUI.startProjectHandoff();
      error('storage.start_project_server');
      render();
      return;
    }
    if (mode === 'folder') {
      if (!storage.folderAvailable()) { render(); return; }
      // The picker must be called in the user's change event, before any await.
      let picked;
      try { picked = globalThis.showDirectoryPicker({ mode: 'readwrite' }); }
      catch { error(); render(); return; }
      void picked.then(handle => switchTo('folder', handle)).catch(failure => {
        if (failure.name !== 'AbortError') error();
        render();
      });
    } else void switchTo(mode);
  });
  changeFolder.addEventListener('click', () => {
    let picked;
    try { picked = globalThis.showDirectoryPicker({ mode: 'readwrite' }); }
    catch { error(); return; }
    void picked.then(handle => switchTo('folder', handle)).catch(failure => {
      if (failure.name !== 'AbortError') error();
    });
  });
  reconnect.addEventListener('click', async () => {
    try { if (await storage.reconnect()) location.reload(); else error('storage.permission_needed'); }
    catch { error('storage.permission_needed'); }
  });
  previewButton.addEventListener('click', async () => {
    try {
      await storage.whenSettled();
      previewJson.textContent = JSON.stringify(validateBackup(await storage.exportBackup()), null, 2);
      preview.showModal();
      previewJson.focus();
    } catch { error(); }
  });
  elements['storage-preview-close'].addEventListener('click', () => preview.close());
  preview.addEventListener('close', () => previewButton.focus({ preventScroll: true }));
  elements['storage-preview-copy'].addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(previewJson.textContent); }
    catch { error('storage.copy_failed'); }
  });
  elements['storage-export'].addEventListener('click', async () => {
    try { await storage.whenSettled(); downloadBackup(validateBackup(await storage.exportBackup())); }
    catch { error(); }
  });
  elements['storage-import'].addEventListener('click', () => elements['storage-import-file'].click());
  elements['storage-import-file'].addEventListener('change', async () => {
    const input = elements['storage-import-file'];
    const file = input.files?.[0];
    if (!file) return;
    try {
      const value = validateBackup(JSON.parse(await file.text()));
      if (!globalThis.confirm(i18n.t('data.replace_confirm'))) return;
      await storage.whenSettled();
      await storage.importBackup(value);
      location.reload();
    } catch { error(); }
    finally { input.value = ''; }
  });
  render();
}
