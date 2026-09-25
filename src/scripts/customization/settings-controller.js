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
    if (scope === 'arena') {
      const arena = settings.setArenaValue(key, key === 'collisionMode' ? input.value : Number(input.value));
      const value = key === 'launchDelay' ? arena[key] / 1000 : arena[key];
      view.syncControl(scope, key, mode, value);
      if (key === 'size' || key === 'fighterSize') view.syncArenaConstraints();
    } else {
      const character = state[scope];
      const fighter = settings.setFighterValue(scope, character.id, key, Number(input.value), mode ?? 0);
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
      if (event.target.matches('input[data-setting-key]')) updateSetting(event.target);
    });
    elements['settings-content'].addEventListener('change', event => {
      if (event.target.matches('select[data-setting-key]')) updateSetting(event.target);
    });
    elements['settings-content'].addEventListener('click', event => {
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
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && expanded) {
        event.preventDefault();
        setExpanded(false, { restoreFocus: true });
      }
    });
  }

  return Object.freeze({ bind, setExpanded, toggle, selectTab, isExpanded: () => expanded });
}
