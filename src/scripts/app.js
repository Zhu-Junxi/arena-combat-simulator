import { CHARACTER_BY_ID, CHARACTER_CATEGORIES, CHARACTERS } from './config/characters.js';
import { createCombatEngine } from './battle/combat-engine.js';
import { createBattleRuntime, createCombatRenderer } from './battle/combat-renderer.js';
import { loadI18n } from './i18n/i18n.js';
import { localizeDocument, populateLanguageSelector } from './i18n/dom-localizer.js';
import { createSelectionController } from './selection/selection-controller.js';
import { createSelectionView } from './selection/selection-view.js';
import { buildCombatSetup } from './customization/combat-setup.js';
import { createSettingsController } from './customization/settings-controller.js';
import { createMatchSettingsStore } from './customization/settings-store.js';
import { createSettingsView } from './customization/settings-view.js';
import { createDuelTransferController } from './share/duel-transfer-controller.js';
import { createGameState } from './state/game-state.js';
import { createThemeController } from './theme/theme-controller.js';
import { populateThemeSelector } from './theme/theme-view.js';
import { requireElements } from './ui/dom.js';
import { createFloatingTooltip } from './ui/floating-tooltip.js';
import { createTransitions } from './ui/transitions.js';

const bootstrapElements = requireElements(['bootstrap-error', 'bootstrap-retry', 'bootstrap-status']);
bootstrapElements['bootstrap-retry'].addEventListener('click', () => location.reload());

async function initialize() {
  const i18n = await loadI18n(new URL('../locales/translations.csv', import.meta.url));
  const elements = requireElements([
    'arena', 'back', 'battlefield', 'battle-note', 'categories', 'categories-down', 'categories-up', 'combat-effects',
    'countdown', 'dock', 'fighter-left', 'fighter-right', 'language-select', 'panel-left', 'panel-right',
    'projectile-effects', 'roster', 'selection-label', 'settings-content', 'settings-export', 'settings-import', 'settings-import-file', 'settings-panel', 'settings-reset-all',
    'settings-tabs', 'settings-toggle', 'stage', 'start', 'start-control', 'status', 'theme-select', 'view-label',
    'weapon-effects', 'zone-effects'
  ]);

  const theme = createThemeController();
  localizeDocument(i18n);
  createFloatingTooltip();
  populateLanguageSelector(elements['language-select'], i18n);
  populateThemeSelector(elements['theme-select'], theme, i18n);

  const state = createGameState(CHARACTERS);
  const panels = [elements['panel-left'], elements['panel-right']];
  const settings = createMatchSettingsStore({ characters: CHARACTERS });
  const matchSetup = () => buildCombatSetup(settings, { left: state.left, right: state.right });
  const renderer = createCombatRenderer(elements, i18n);
  const engine = createCombatEngine({ onEvent: renderer.handleEvent });
  const runtime = createBattleRuntime({
    engine,
    renderer,
    elements,
    i18n,
    getAppPhase: () => state.phase
  });
  const selectionView = createSelectionView({
    state,
    characters: CHARACTERS,
    categories: CHARACTER_CATEGORIES,
    elements,
    i18n,
    getFighterSettings: (side, characterId) => settings.getFighter(side, characterId)
  });
  const settingsView = createSettingsView({ state, settings, elements, i18n });
  const settingsController = createSettingsController({
    state,
    settings,
    view: settingsView,
    elements,
    panels,
    onActiveSideChange: () => {
      selectionView.renderPanel('left');
      selectionView.renderPanel('right');
      selectionView.syncSelection();
    },
    onSettingsChange: scope => {
      if (scope === 'left' || scope === 'right') selectionView.renderPanel(scope);
      if (scope === 'all') {
        selectionView.renderPanel('left');
        selectionView.renderPanel('right');
      }
    }
  });
  const selectionController = createSelectionController({
    state,
    characterById: CHARACTER_BY_ID,
    elements,
    view: selectionView,
    i18n,
    onSelectionChange: side => {
      if (side) settingsController.selectTab(side);
      else settingsView.render();
    }
  });
  const transitions = createTransitions({
    state,
    elements,
    panels,
    i18n,
    beginBattle: selected => runtime.begin(selected, matchSetup()),
    resetBattle: () => {
      runtime.stop();
      engine.reset({ left: state.left, right: state.right }, matchSetup());
    },
    collapseCustomization: () => settingsController.setExpanded(false)
  });
  const duelTransfer = createDuelTransferController({
    elements,
    state,
    settings,
    i18n,
    characters: CHARACTERS,
    characterById: CHARACTER_BY_ID,
    getSetup: matchSetup,
    onImported: recipe => {
      selectionView.renderPanel('left');
      selectionView.renderPanel('right');
      selectionView.syncSelection();
      settingsView.render();
    }
  });

  selectionView.render();
  selectionController.bind();
  settingsView.render();
  settingsController.bind();
  duelTransfer.bind();
  transitions.bind();
  engine.reset({ left: state.left, right: state.right }, matchSetup());
  transitions.refreshLocalization();

  i18n.subscribe(() => {
    localizeDocument(i18n);
    populateLanguageSelector(elements['language-select'], i18n);
    populateThemeSelector(elements['theme-select'], theme, i18n);
    settingsView.render();
    selectionView.refresh();
    transitions.refreshLocalization();
    renderer.refreshLocalization(engine.state);
  });
  elements['language-select'].addEventListener('change', event => i18n.setLocale(event.target.value));
  elements['theme-select'].addEventListener('change', event => {
    void theme.setPreference(event.target.value).catch(() => {
      elements['theme-select'].value = theme.getPreference();
    });
  });

  bootstrapElements['bootstrap-status'].hidden = true;
  document.body.dataset.i18nReady = 'true';
}

initialize().catch(error => {
  console.error(error);
  bootstrapElements['bootstrap-status'].hidden = true;
  bootstrapElements['bootstrap-error'].hidden = false;
});
