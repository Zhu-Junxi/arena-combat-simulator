import { ARENA_CONTROLS, COLLISION_MODES, FIGHTER_CONTROLS } from '../config/customization.js';

const SIDES = Object.freeze(['left', 'right']);

export function createSettingsView({ state, settings, elements, i18n }) {
  let activeTab = 'left';
  const t = (key, parameters) => i18n.t(key, parameters);

  function valueControl({ id, label, value, min, max, step, scope, key, mode, unit = '' }) {
    const attributes = `data-setting-scope="${scope}" data-setting-key="${key}"` +
      (mode == null ? '' : ` data-setting-mode="${mode}"`);
    return `<div class="setting-row" data-setting-row="${id}"><div class="setting-label"><label for="${id}-range">${label}</label>` +
      `<span>${unit}</span></div><div class="setting-inputs"><input id="${id}-range" type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${attributes}>` +
      `<input id="${id}-number" type="number" min="${min}" max="${max}" step="${step}" value="${value}" ${attributes} aria-label="${label}"></div></div>`;
  }

  function renderFighter(side) {
    const character = state[side];
    const values = settings.getFighter(side, character.id);
    const attackRows = values.attack.map((value, mode) => valueControl({
      id: `${side}-attack-${mode}`,
      label: values.attack.length > 1 ? t('customization.attack_mode', { mode: mode + 1 }) : t(FIGHTER_CONTROLS.attack.labelKey),
      value,
      ...FIGHTER_CONTROLS.attack,
      scope: side,
      key: 'attack',
      mode
    })).join('');
    const cooldownRows = values.attackCD.map((value, mode) => valueControl({
      id: `${side}-cooldown-${mode}`,
      label: values.attackCD.length > 1 ? t('customization.cooldown_mode', { mode: mode + 1 }) : t(FIGHTER_CONTROLS.attackCD.labelKey),
      value,
      ...FIGHTER_CONTROLS.attackCD,
      scope: side,
      key: 'attackCD',
      mode,
      unit: t('unit.seconds_short')
    })).join('');
    return `<section class="settings-sheet" role="tabpanel" id="settings-panel-${side}" aria-labelledby="settings-tab-${side}">` +
      `<div class="settings-sheet-heading"><div><span>${t(`side.${side}`)}</span><h3>${t(character.nameKey)}</h3></div>` +
      `<button type="button" data-reset-scope="${side}">${t('customization.reset_tab')}</button></div>` +
      `<div class="settings-grid">${valueControl({ id: `${side}-health`, label: t(FIGHTER_CONTROLS.health.labelKey), value: values.health, ...FIGHTER_CONTROLS.health, scope: side, key: 'health' })}` +
      attackRows + cooldownRows + valueControl({ id: `${side}-speed`, label: t(FIGHTER_CONTROLS.movementSpeed.labelKey), value: values.movementSpeed, ...FIGHTER_CONTROLS.movementSpeed, scope: side, key: 'movementSpeed', unit: t('customization.units_per_second') }) +
      `</div></section>`;
  }

  function arenaDisplayValue(key, value) {
    return key === 'launchDelay' ? value / 1000 : value;
  }

  function renderArena() {
    const arena = settings.getArena();
    const distanceMin = Math.max(ARENA_CONTROLS.startingDistance.min, arena.fighterSize);
    const distanceMax = Math.min(ARENA_CONTROLS.startingDistance.max, arena.size - arena.fighterSize);
    const units = {
      size: t('customization.units'),
      fighterSize: t('customization.units'),
      timeScale: '×',
      startingDistance: t('customization.units'),
      projectileSpeedScale: '×',
      launchDelay: t('unit.seconds_short'),
      controlDurationScale: '×'
    };
    const controls = Object.entries(ARENA_CONTROLS).map(([key, control]) => valueControl({
      id: `arena-${key}`,
      label: t(control.labelKey),
      value: arenaDisplayValue(key, arena[key]),
      min: key === 'startingDistance' ? distanceMin : control.min,
      max: key === 'startingDistance' ? distanceMax : control.max,
      step: control.step,
      scope: 'arena',
      key,
      unit: units[key]
    })).join('');
    const collisionOptions = COLLISION_MODES.map(mode => `<option value="${mode}"${arena.collisionMode === mode ? ' selected' : ''}>${t(`customization.collision_${mode}`)}</option>`).join('');
    return `<section class="settings-sheet" role="tabpanel" id="settings-panel-arena" aria-labelledby="settings-tab-arena">` +
      `<div class="settings-sheet-heading"><div><span>${t('customization.match_rules')}</span><h3>${t('customization.arena')}</h3></div>` +
      `<button type="button" data-reset-scope="arena">${t('customization.reset_tab')}</button></div>` +
      `<div class="settings-grid">${controls}<div class="setting-row setting-select"><label for="arena-collision">${t('customization.collision')}</label>` +
      `<select id="arena-collision" data-setting-scope="arena" data-setting-key="collisionMode">${collisionOptions}</select></div></div></section>`;
  }

  function renderTabs() {
    elements['settings-tabs'].innerHTML = [...SIDES, 'arena'].map(tab => {
      const label = tab === 'arena' ? t('customization.arena') : t(`customization.${tab}_fighter`);
      return `<button type="button" role="tab" id="settings-tab-${tab}" aria-controls="settings-content" ` +
        `aria-selected="${activeTab === tab}" tabindex="${activeTab === tab ? 0 : -1}" data-settings-tab="${tab}">${label}</button>`;
    }).join('');
  }

  function renderContent() {
    elements['settings-content'].innerHTML = activeTab === 'arena' ? renderArena() : renderFighter(activeTab);
  }

  function render() {
    renderTabs();
    renderContent();
    elements['settings-reset-all'].textContent = t('customization.reset_all');
  }

  function setActiveTab(tab, { focus = false } = {}) {
    if (![...SIDES, 'arena'].includes(tab)) return;
    activeTab = tab;
    render();
    if (focus) elements['settings-tabs'].querySelector(`[data-settings-tab="${tab}"]`)?.focus();
  }

  function syncControl(scope, key, mode, value) {
    const selector = `[data-setting-scope="${scope}"][data-setting-key="${key}"]` +
      (mode == null ? ':not([data-setting-mode])' : `[data-setting-mode="${mode}"]`);
    elements['settings-content'].querySelectorAll(selector).forEach(input => { input.value = value; });
  }

  function syncArenaConstraints() {
    if (activeTab !== 'arena') return;
    const arena = settings.getArena();
    const minimum = Math.max(ARENA_CONTROLS.startingDistance.min, arena.fighterSize);
    const maximum = Math.min(ARENA_CONTROLS.startingDistance.max, arena.size - arena.fighterSize);
    elements['settings-content'].querySelectorAll('[data-setting-key="startingDistance"]').forEach(input => {
      input.min = minimum;
      input.max = maximum;
      input.value = arena.startingDistance;
    });
  }

  return Object.freeze({
    render,
    renderContent,
    setActiveTab,
    getActiveTab: () => activeTab,
    syncControl,
    syncArenaConstraints
  });
}
