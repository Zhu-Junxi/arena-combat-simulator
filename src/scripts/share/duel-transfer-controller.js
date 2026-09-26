import { createDuelRecipe, parseDuelRecipe, stringifyDuelRecipe } from './duel-share-codec.js';

const FILE_NAME = 'arena-duel-duel.json';

export function applyImportedDuel({ recipe, settings, state, characterById }) {
  const left = characterById[recipe.fighters.left.characterId];
  const right = characterById[recipe.fighters.right.characterId];
  if (!left || !right) throw new Error('Unknown imported fighter');
  settings.applyDuel(recipe);
  state.left = left;
  state.right = right;
  state.side = 'left';
}

export function createDuelTransferController({ elements, state, settings, i18n, getSetup, characters, characterById, onImported = () => {} }) {
  function exportDuel() {
    const recipe = createDuelRecipe({ selectedCharacters: { left: state.left, right: state.right }, setup: getSetup() });
    const url = URL.createObjectURL(new Blob([stringifyDuelRecipe(recipe)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = FILE_NAME;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    elements.status.textContent = i18n.t('customization.export_success');
  }

  async function importDuel() {
    const file = elements['settings-import-file'].files?.[0];
    if (!file) return;
    try {
      const recipe = parseDuelRecipe(await file.text(), { characters });
      applyImportedDuel({ recipe, settings, state, characterById });
      onImported(recipe);
      elements.status.textContent = i18n.t('customization.import_success');
    } catch (error) {
      console.warn('Unable to import duel recipe', error);
      elements.status.textContent = i18n.t('customization.import_error');
    } finally {
      elements['settings-import-file'].value = '';
    }
  }

  function bind() {
    elements['settings-export'].addEventListener('click', exportDuel);
    elements['settings-import'].addEventListener('click', () => elements['settings-import-file'].click());
    elements['settings-import-file'].addEventListener('change', () => { void importDuel(); });
  }

  return Object.freeze({ bind, exportDuel, importDuel });
}
