import { createCharacterDefault, parseCharacterDefault } from './character-default-codec.js';

function download(filename, value) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2) + '\n'], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function bindDataTransfer({ elements, state, settings, storage, i18n, feedback, onCharacterImported }) {
  const side = () => state.side === 'right' ? 'right' : 'left';
  const show = (key, tone = 'success', anchor = null) => feedback.show({ key, tone, anchor });
  elements['character-export'].addEventListener('click', () => {
    const id = state[side()]?.id;
    if (!id || state[side()].locked) return show('data.error', 'error', elements['character-export']);
    download(`${id}-default.json`, createCharacterDefault(id, settings.getCharacterDefault(id), settings.getAdvanced()));
    show('data.exported', 'success', elements['character-export']);
  });
  elements['character-import'].addEventListener('click', () => elements['character-import-file'].click());
  elements['character-import-file'].addEventListener('change', async () => {
    const file = elements['character-import-file'].files?.[0];
    if (!file) return;
    try {
      const parsed = parseCharacterDefault(await file.text());
      settings.importCharacterDefault(parsed.characterId, parsed.stats, parsed.advanced);
      onCharacterImported();
      show(await settings.whenPersisted() ? 'data.imported' : 'data.save_failed',
        settings.getLastPersistenceStatus() ? 'success' : 'warning', elements['character-import']);
    } catch (error) { console.warn(error); show('data.error', 'error', elements['character-import']); }
    finally { elements['character-import-file'].value = ''; }
  });
  elements['backup-export'].addEventListener('click', async () => {
    try {
      await settings.whenPersisted();
      await storage.whenSettled();
      download('arena-duel-backup.json', await storage.exportBackup());
      show('data.exported', 'success', elements['backup-export']);
    } catch (error) { console.warn(error); show('data.error', 'error', elements['backup-export']); }
  });
  elements['backup-import'].addEventListener('click', () => elements['backup-import-file'].click());
  elements['backup-import-file'].addEventListener('change', async () => {
    const file = elements['backup-import-file'].files?.[0];
    if (!file) return;
    try {
      const value = JSON.parse(await file.text());
      if (!value || value.format !== 'arena-duel.backup' || value.version !== 1) throw new Error('Invalid backup');
      if (!globalThis.confirm(i18n.t('data.replace_confirm'))) return;
      await storage.whenSettled();
      await storage.importBackup(value);
      location.reload();
    } catch (error) { console.warn(error); show('data.error', 'error', elements['backup-import']); }
    finally { elements['backup-import-file'].value = ''; }
  });
  elements['data-reload'].addEventListener('click', () => {
    if (globalThis.confirm(i18n.t('data.reload_confirm'))) {
      storage.discardLocalEdits();
      location.reload();
    }
  });
}
