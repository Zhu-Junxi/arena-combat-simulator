import { CHARACTER_BY_ID, CHARACTER_CATEGORIES, CHARACTERS } from './config/characters.js';
import { createCombatEngine } from './battle/combat-engine.js';
import { createCombatAudio } from './battle/combat-audio.js';
import { createBattleRuntime, createCombatRenderer } from './battle/combat-renderer.js';
import { loadI18n } from './i18n/i18n.js';
import { localizeDocument, populateLanguageSelector } from './i18n/dom-localizer.js';
import { createSelectionController } from './selection/selection-controller.js';
import { createSelectionView } from './selection/selection-view.js';
import { buildCombatSetup } from './customization/combat-setup.js';
import { createSettingsController } from './customization/settings-controller.js';
import { createMatchSettingsStore } from './customization/settings-store.js';
import { createSettingsView } from './customization/settings-view.js';
import { createDuelPresetController } from './share/duel-preset-controller.js';
import { createGameState } from './state/game-state.js';
import { createThemeController } from './theme/theme-controller.js';
import { populateThemeSelector } from './theme/theme-view.js';
import { requireElements } from './ui/dom.js';
import { createFloatingTooltip } from './ui/floating-tooltip.js';
import { createFeedback } from './ui/feedback.js';
import { createProjectStorage } from './data/project-storage.js';
import { bindDataTransfer } from './data/data-transfer-controller.js';
import { projectCatalog, readProjectJson } from './data/project-files.js';
import { parseCharacterDefault } from './data/character-default-codec.js';
import { createTransitions } from './ui/transitions.js';
import { createGlobalSettings } from './ui/global-settings.js';

const bootstrapElements = requireElements(['bootstrap-error', 'bootstrap-retry', 'bootstrap-status']);
bootstrapElements['bootstrap-retry'].addEventListener('click', () => location.reload());

async function initialize() {
  await Promise.all(projectCatalog.characters.map(async id => {
    parseCharacterDefault(await readProjectJson(`characters/factory/${id}.json`));
  }));
  let storage = null;
  try { storage = globalThis.localStorage; } catch { /* The app remains usable without browser storage. */ }
  const i18n = await loadI18n(new URL('../locales/translations.csv', import.meta.url), { storage });
  const elements = requireElements([
    'arena', 'back', 'battlefield', 'battle-note', 'categories', 'categories-down', 'categories-up', 'combat-effects',
    'countdown', 'dock', 'fighter-left', 'fighter-right', 'language-select', 'panel-left', 'panel-right',
    'roster-grid-toggle', 'roster-grid-panel', 'roster-grid-sides', 'roster-grid-filters', 'roster-grid-cards', 'roster-grid-start',
    'global-settings-toggle', 'global-settings-popover', 'global-settings-close',
    'projectile-effects', 'roster', 'selection-label', 'settings-content', 'settings-presets', 'settings-panel', 'settings-reset-all', 'advanced-tuning', 'adjustment-step',
    'settings-tabs', 'settings-toggle', 'stage', 'start', 'start-control', 'status', 'theme-select', 'view-label',
    'character-export', 'character-import', 'character-import-file', 'backup-export', 'backup-import', 'backup-import-file', 'data-reload',
    'weapon-effects', 'zone-effects', 'duel-corners', 'duel-left', 'duel-right', 'duel-name-left', 'duel-name-right',
    'duel-clock', 'duel-speed', 'duel-phase', 'duel-result', 'duel-event-time', 'duel-event',
    'preset-dialog', 'preset-heading', 'preset-close', 'preset-search', 'preset-filters',
    'preset-save-current', 'preset-import', 'preset-import-file', 'preset-grid', 'preset-editor', 'preset-editor-label',
    'preset-name', 'preset-editor-submit', 'preset-editor-cancel', 'preset-confirm', 'preset-confirm-message',
    'preset-confirm-primary', 'preset-confirm-secondary', 'preset-status', 'feedback-toast', 'preset-feedback-toast'
  ]);

  const theme = createThemeController({ storage });
  const projectStorage = await createProjectStorage(storage);
  localizeDocument(i18n);
  createFloatingTooltip();
  populateLanguageSelector(elements['language-select'], i18n);
  populateThemeSelector(elements['theme-select'], theme, i18n);

  const state = createGameState(CHARACTERS);
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: projectStorage });
  const feedback = createFeedback({ i18n, mainStatus: elements.status, dialogStatus: elements['preset-status'],
    mainToast: elements['feedback-toast'], dialogToast: elements['preset-feedback-toast'], dialog: elements['preset-dialog'] });
  if (projectStorage.hasConflict()) feedback.show({ key: 'data.conflict', tone: 'warning', anchor: elements['data-reload'] });
  const selected = () => ({ left: state.left, right: state.right });
  const panels = [elements['panel-left'], elements['panel-right']];
  // The UI is temporarily duel-only.  The store and engine retain FFA data,
  // but this presentation path deliberately activates the two visible seats.
  const matchSetup = () => {
    const setup = buildCombatSetup(settings, selected());
    return { ...setup, arena: { ...setup.arena, fighterCount: 2 } };
  };
  const renderer = createCombatRenderer(elements, i18n);
  const audio = createCombatAudio();
  elements.start.addEventListener('click', () => { void audio.unlock(); });
  elements['roster-grid-start'].addEventListener('click', () => { void audio.unlock(); });
  const engine = createCombatEngine({ onEvent: event => {
    renderer.handleEvent(event);
    audio.handleEvent(event);
  } });
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
    feedback,
    i18n,
    storage: projectStorage,
    onGridOpen: () => selectionView.setGridCategory('all'),
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
    feedback,
    onSelectionChange: side => {
      if (side) settingsController.selectTab(side);
      else settingsView.render();
    }
  });
  const globalSettings = createGlobalSettings({ elements });
  const transitions = createTransitions({
    state,
    elements,
    panels,
    i18n,
    beginBattle: selectedCharacters => runtime.begin(selectedCharacters, matchSetup()),
    resetBattle: () => {
      runtime.stop();
      engine.reset(selected(), matchSetup());
    },
    collapseCustomization: () => settingsController.setExpanded(false),
    closeGlobalSettings: globalSettings.close
  });
  const duelPresets = createDuelPresetController({
    elements,
    state,
    settings,
    i18n,
    feedback,
    storage: projectStorage,
    characters: CHARACTERS,
    characterById: CHARACTER_BY_ID,
    getSetup: matchSetup,
    onLoaded: () => {
      settingsController.selectTab('left');
      selectionView.renderPanel('left');
      selectionView.renderPanel('right');
      selectionView.syncSelection();
      settingsView.render();
    }
  });
  bindDataTransfer({ elements, state, settings, storage: projectStorage, i18n, feedback,
    onCharacterImported: () => {
      settingsView.render();
      selectionView.renderPanel('left');
      selectionView.renderPanel('right');
    } });

  selectionView.render();
  selectionController.bind();
  settingsView.render();
  settingsController.bind();
  globalSettings.bind();
  elements['settings-presets'].addEventListener('click', globalSettings.close);
  duelPresets.bind();
  transitions.bind();
  engine.reset(selected(), matchSetup());
  transitions.refreshLocalization();

  i18n.subscribe(() => {
    localizeDocument(i18n);
    populateLanguageSelector(elements['language-select'], i18n);
    populateThemeSelector(elements['theme-select'], theme, i18n);
    settingsView.render();
    selectionView.refresh();
    settingsController.refreshLocalization();
    transitions.refreshLocalization();
    renderer.refreshLocalization(engine.state);
    duelPresets.render();
    feedback.refreshLocalization();
  });
  elements['language-select'].addEventListener('change', event => {
    i18n.setLocale(event.target.value);
    feedback.show({ key: 'feedback.language', anchor: elements['language-select'] });
  });
  elements['theme-select'].addEventListener('change', event => {
    const requested = event.target.value;
    const previous = theme.getPreference();
    void theme.setPreference(requested).then(() => {
      if (theme.getPreference() === requested) feedback.show({ key: 'feedback.theme', anchor: elements['theme-select'] });
    }).catch(() => {
      if (theme.getPreference() !== requested) return;
      void theme.setPreference(previous).catch(() => {});
      elements['theme-select'].value = previous;
      feedback.show({ key: 'feedback.theme_error', tone: 'error', anchor: elements['theme-select'] });
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
