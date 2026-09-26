import { fromDisplayValue, presentationFor } from './setting-presentation.js';

export function createSettingsController({ state, settings, view, elements, panels, onSettingsChange = () => {}, onActiveSideChange = () => {} }) {
  let expanded = false;

  function setExpanded(nextExpanded, { restoreFocus = false } = {}) {
    if (state.phase !== 'select' && nextExpanded) return;
    expanded = Boolean(nextExpanded);
    elements.dock.dataset.expanded = String(expanded);
    elements['settings-toggle'].setAttribute('aria-expanded', String(expanded));
    elements['settings-panel'].setAttribute('aria-hidden', String(!expanded));
    elements['settings-panel'].inert = !expanded;
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
  }

  function updateSetting(input) {
    if (input.value === '') return;
    const { settingScope: scope, settingKey: key } = input.dataset;
    const mode = input.dataset.settingMode == null ? null : Number(input.dataset.settingMode);
    const value = fromDisplayValue(input.value, presentationFor(input.dataset.settingPresentation));
    if (key === 'priest') {
      settings.setPriestAbilityValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (key === 'trait') {
      settings.setTraitValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (input.dataset.magePath) {
      settings.setMageAbilityValue(scope, state[scope].id, input.dataset.magePath, value);
      view.renderContent();
    } else if (scope === 'arena') {
      const arena = settings.setArenaValue(key, key === 'collisionMode' ? input.value : value);
      const value = key === 'launchDelay' ? arena[key] / 1000 : arena[key];
      view.syncControl(scope, key, mode, value);
      if (key === 'size' || key === 'fighterSize') view.syncArenaConstraints();
    } else {
      const character = state[scope];
      const fighter = settings.setFighterValue(scope, character.id, key, value, mode ?? 0);
      view.syncControl(scope, key, mode, mode == null ? fighter[key] : fighter[key][mode]);
    }
    onSettingsChange(scope);
  }

  function bind() {
    elements['settings-toggle'].addEventListener('click', toggle);
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
      if (event.target.matches('input[type="number"][data-setting-key], select[data-setting-key]')) updateSetting(event.target);
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
        input.value = String(Number(input.value) + Number(adjust.dataset.adjust) * Number(input.step));
        updateSetting(input);
        return;
      }
      const saveDefault = event.target.closest('[data-set-character-default]');
      if (saveDefault) {
        const side = saveDefault.dataset.setCharacterDefault;
        settings.setCharacterDefault(side, state[side].id);
        view.renderContent();
        onSettingsChange(side);
        return;
      }
      const reset = event.target.closest('[data-reset-scope]');
      if (!reset) return;
      const scope = reset.dataset.resetScope;
      if (scope === 'arena') settings.resetArena();
      else settings.resetFighter(scope, state[scope].id);
      view.renderContent();
      onSettingsChange(scope);
    });
    elements['settings-reset-all'].addEventListener('click', () => {
      settings.resetAll();
      view.renderContent();
      onSettingsChange('all');
    });
    elements['advanced-tuning'].addEventListener('change', event => {
      settings.setAdvanced(event.target.checked);
      view.render();
      onSettingsChange('all');
    });
    document.addEventListener('keydown', event => {
      if (event.target.matches?.('input, textarea, select')) return;
      if (event.key === 'Escape' && expanded) {
        event.preventDefault();
        setExpanded(false, { restoreFocus: true });
      }
    });
  }

  return Object.freeze({ bind, setExpanded, toggle, selectTab, isExpanded: () => expanded });
}
