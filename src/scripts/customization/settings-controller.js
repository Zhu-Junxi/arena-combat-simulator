import { fromDisplayValue, presentationFor } from './setting-presentation.js';

export const ADJUSTMENT_STEPS = Object.freeze([0.001, 0.01, 0.1, 1, 5, 10]);

function decimalPlaces(value) {
  const text = String(value);
  if (text.includes('e-')) return Number(text.split('e-')[1]);
  return text.split('.')[1]?.length ?? 0;
}

export function adjustmentStepFor(input, selectedStep) {
  const fieldStep = Number(input.step);
  const selected = Number(selectedStep);
  return Math.max(Number.isFinite(fieldStep) && fieldStep > 0 ? fieldStep : 0.001,
    ADJUSTMENT_STEPS.includes(selected) ? selected : ADJUSTMENT_STEPS[0]);
}

export function createSettingsController({ state, settings, view, elements, panels, feedback, i18n, storage, onSettingsChange = () => {}, onActiveSideChange = () => {}, onGridOpen = () => {} }) {
  let expanded = false;
  let gridOpen = false;

  function updateGridVisibility() {
    const grid = elements['roster-grid-panel'];
    const settingsPanel = elements['settings-panel'];
    grid.inert = !expanded || !gridOpen;
    grid.setAttribute('aria-hidden', String(!expanded || !gridOpen));
    settingsPanel.inert = !expanded || gridOpen;
    settingsPanel.setAttribute('aria-hidden', String(!expanded || gridOpen));
    elements.dock.dataset.gridOpen = String(gridOpen);
    const gridToggle = elements['roster-grid-toggle'];
    gridToggle.hidden = !expanded;
    gridToggle.setAttribute('aria-hidden', String(!expanded));
    gridToggle.setAttribute('aria-expanded', String(gridOpen));
    const label = i18n.t(gridOpen ? 'selection.grid_close' : 'selection.grid_open');
    gridToggle.setAttribute('aria-label', label);
    gridToggle.dataset.tooltip = label;
  }

  function setGridOpen(nextOpen, { restoreFocus = false } = {}) {
    if (!expanded || state.phase !== 'select') nextOpen = false;
    if (gridOpen === Boolean(nextOpen)) return;
    gridOpen = Boolean(nextOpen);
    if (gridOpen) onGridOpen();
    updateGridVisibility();
    if (gridOpen) elements['roster-grid-sides'].querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
    else if (restoreFocus) elements['roster-grid-toggle'].focus({ preventScroll: true });
  }

  async function confirm(key, parameters = {}, anchor = null) {
    const persisted = await settings.whenPersisted();
    feedback.show({ key: persisted ? key : storage?.hasConflict() ? 'data.conflict' : key === 'feedback.character_default' ? 'feedback.character_default_session' : 'feedback.session_only', parameters, anchor,
      tone: persisted ? 'success' : 'warning' });
  }

  function setExpanded(nextExpanded, { restoreFocus = false } = {}) {
    if (state.phase !== 'select' && nextExpanded) return;
    expanded = Boolean(nextExpanded);
    if (!expanded) gridOpen = false;
    elements.dock.dataset.expanded = String(expanded);
    elements['settings-toggle'].setAttribute('aria-expanded', String(expanded));
    updateGridVisibility();
    panels.forEach(panel => { panel.inert = expanded; });
    elements['start-control'].inert = expanded;
    if (expanded) {
      view.render();
      elements['settings-tabs'].querySelector('[aria-selected="true"]')?.focus({ preventScroll: true });
    } else if (restoreFocus) {
      elements['settings-toggle'].focus({ preventScroll: true });
    }
  }

  function toggle() {
    setExpanded(!expanded, { restoreFocus: expanded });
  }

  function selectTab(tab, options) {
    if (tab === 'left' || tab === 'right') {
      state.side = tab;
      onActiveSideChange(tab);
    }
    view.setActiveTab(tab, options);
    if (expanded) {
      const sheet = elements['settings-content'].querySelector('.settings-sheet');
      sheet?.classList.add('settings-sheet-reveal');
    }
  }

  function updateSetting(input) {
    if (input.value === '') return;
    const { settingScope: scope, settingKey: key } = input.dataset;
    const mode = input.dataset.settingMode == null ? null : Number(input.dataset.settingMode);
    const value = fromDisplayValue(input.value, presentationFor(input.dataset.settingPresentation));
    if (key === 'priest') {
      settings.setPriestAbilityValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (key === 'weapon') {
      settings.setWeaponValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (key === 'summon') {
      settings.setSummonAbilityValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (key === 'special') {
      settings.setSpecialAbilityValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (key === 'trait') {
      settings.setTraitValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (input.dataset.magePath) {
      settings.setMageAbilityValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (scope === 'arena') {
      const arena = settings.setArenaValue(key, ['collisionMode', 'targetStrategy'].includes(key) ? input.value : value);
      // Arena launch delay is stored in milliseconds but the settings UI presents
      // seconds. Keep this distinct from the parsed input value above.
      const displayValue = key === 'launchDelay' ? arena[key] / 1000 : arena[key];
      view.syncControl(scope, key, mode, displayValue);
      if (key === 'size' || key === 'fighterSize') view.syncArenaConstraints();
    } else {
      const character = state[scope];
      const fighter = settings.setFighterValue(scope, character.id, key, value, mode ?? 0);
      view.syncControl(scope, key, mode, mode == null ? fighter[key] : fighter[key][mode]);
    }
    onSettingsChange(scope);
  }

  async function warnIfSessionOnly(anchor) {
    if (!await settings.whenPersisted()) {
      feedback.show({ key: storage?.hasConflict() ? 'data.conflict' : 'feedback.session_only', tone: 'warning', anchor });
    }
  }

  function bind() {
    elements['settings-toggle'].addEventListener('click', toggle);
    elements['roster-grid-toggle'].addEventListener('click', () => setGridOpen(!gridOpen, { restoreFocus: gridOpen }));
    elements['settings-tabs'].addEventListener('click', event => {
      const tab = event.target.closest('[data-settings-tab]');
      if (tab) selectTab(tab.dataset.settingsTab);
    });
    elements['settings-tabs'].addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const tabs = [...elements['settings-tabs'].querySelectorAll('[role="tab"]')];
      const current = tabs.indexOf(event.target);
      if (current < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
        (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      selectTab(tabs[next].dataset.settingsTab, { focus: true });
    });
    elements['settings-content'].addEventListener('input', event => {
      if (event.target.matches('input[type="range"][data-setting-key]')) updateSetting(event.target);
    });
    elements['settings-content'].addEventListener('change', event => {
      if (event.target.matches('[data-special-switch], [data-special-mode]')) {
        const input = event.target;
        const scope = input.dataset.settingScope;
        settings.setSpecialAbilityValue(scope, state[scope].id, input.dataset.specialSwitch ?? 'startingMode',
          input.dataset.specialSwitch ? input.checked : input.value);
        view.renderContent();
        onSettingsChange(scope);
        warnIfSessionOnly(input);
        return;
      }
      if (event.target.matches('input[type="number"][data-setting-key], select[data-setting-key]')) {
        updateSetting(event.target);
        warnIfSessionOnly(event.target);
      } else if (event.target.matches('input[type="range"][data-setting-key]')) {
        warnIfSessionOnly(event.target);
      }
    });
    elements['settings-content'].addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('input[type="number"][data-setting-key]')) {
        event.preventDefault();
        event.target.blur();
      }
    });
    elements['settings-content'].addEventListener('click', event => {
      const expand = event.target.closest('[data-expand-slider]');
      if (expand) {
        view.expandSlider(expand.dataset.expandSlider);
        return;
      }
      const adjust = event.target.closest('[data-adjust]');
      if (adjust) {
        const input = adjust.closest('.setting-row')?.querySelector('input[type="number"][data-setting-key]');
        if (!input) return;
        const step = adjustmentStepFor(input, elements['adjustment-step'].value);
        const next = Number(input.value) + Number(adjust.dataset.adjust) * step;
        input.value = String(Number(next.toFixed(decimalPlaces(step))));
        updateSetting(input);
        warnIfSessionOnly(adjust);
        return;
      }
      const saveDefault = event.target.closest('[data-set-character-default]');
      if (saveDefault) {
        const side = saveDefault.dataset.setCharacterDefault;
        settings.setCharacterDefault(side, state[side].id);
        view.renderContent();
        onSettingsChange('all');
        confirm('feedback.character_default', { name: i18n.t(state[side].nameKey) },
          elements['settings-content'].querySelector(`[data-set-character-default="${side}"]`));
        return;
      }
      const reset = event.target.closest('[data-reset-scope]');
      if (!reset) return;
      const scope = reset.dataset.resetScope;
      if (scope === 'arena') settings.resetArena();
      else settings.resetFighter(scope, state[scope].id);
      view.renderContent();
      onSettingsChange(scope);
      confirm(scope === 'arena' ? 'feedback.reset_arena' : 'feedback.reset_fighter',
        scope === 'arena' ? {} : { name: i18n.t(state[scope].nameKey) },
        elements['settings-content'].querySelector(`[data-reset-scope="${scope}"]`));
    });
    elements['settings-reset-all'].addEventListener('click', () => {
      settings.resetAll();
      view.renderContent();
      onSettingsChange('all');
      confirm('feedback.reset_all', {}, elements['settings-reset-all']);
    });
    elements['advanced-tuning'].addEventListener('change', event => {
      settings.setAdvanced(event.target.checked);
      view.render();
      onSettingsChange('all');
      confirm(event.target.checked ? 'feedback.advanced_on' : 'feedback.advanced_off', {}, elements['advanced-tuning']);
    });
    document.addEventListener('keydown', event => {
      if (event.target.closest?.('dialog[open]')) return;
      if (event.target.matches?.('input, textarea, select')) return;
      if (event.key === 'Escape' && expanded) {
        event.preventDefault();
        if (gridOpen) setGridOpen(false, { restoreFocus: true });
        else setExpanded(false, { restoreFocus: true });
      }
    });
  }

  return Object.freeze({ bind, setExpanded, setGridOpen, toggle, selectTab, refreshLocalization: updateGridVisibility, isExpanded: () => expanded, isGridOpen: () => gridOpen });
}
