import { MATCH_SETTINGS_VERSION } from '../config/customization.js';
import { MATCH_SETTINGS_STORAGE_KEY } from '../config/customization.js';
import { CHARACTERS } from '../config/characters.js';
import { createMatchSettingsStore } from '../customization/settings-store.js';
import { PRESET_LIBRARY_KEY, createDuelPresetLibrary } from '../share/duel-preset-library.js';

const canonical = value => JSON.stringify(value, (_key, item) => item && !Array.isArray(item) && typeof item === 'object'
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);

export const backupKeys = Object.freeze({ [MATCH_SETTINGS_STORAGE_KEY]: 'settings', [PRESET_LIBRARY_KEY]: 'presets' });
export const backup = (settings = null, presets = null) => ({ format: 'arena-duel.backup', version: 1, settings, presets });
export const factorySettings = () => createMatchSettingsStore({ characters: CHARACTERS,
  storage: { getItem: () => null, setItem() {} } }).exportData();
function withoutLocked(value) {
  const result = structuredClone(value);
  for (const character of CHARACTERS.filter(item => item.locked)) {
    delete result.characterDefaults?.[character.id];
    for (const side of Object.values(result.fighters ?? {})) delete side?.[character.id];
  }
  return result;
}

export function validateBackup(value) {
  if (!value || value.format !== 'arena-duel.backup' || value.version !== 1 ||
      Object.keys(value).sort().join(',') !== 'format,presets,settings,version') throw new Error('Invalid backup');
  let settings = null;
  let presets = null;
  if (value.settings !== null) {
    if (![1, 2, 3, 4, MATCH_SETTINGS_VERSION].includes(value.settings?.version)) throw new Error('Invalid backup settings');
    settings = createMatchSettingsStore({ characters: CHARACTERS,
      storage: { getItem: () => JSON.stringify(value.settings), setItem() {} } }).exportData();
    if (value.settings.version === MATCH_SETTINGS_VERSION &&
        canonical(withoutLocked(settings)) !== canonical(withoutLocked(value.settings))) {
      throw new Error('Invalid backup settings');
    }
    if (value.settings.version === MATCH_SETTINGS_VERSION) settings = structuredClone(value.settings);
  }
  if (value.presets !== null) {
    if (value.presets?.version !== 1 || !Array.isArray(value.presets.entries)) throw new Error('Invalid backup presets');
    const library = createDuelPresetLibrary({ characters: CHARACTERS,
      storage: { getItem: () => JSON.stringify(value.presets), setItem() {} } });
    presets = { version: 1, entries: library.list() };
    if (canonical(presets) !== canonical(value.presets)) throw new Error('Invalid backup presets');
  }
  return backup(settings, presets);
}
