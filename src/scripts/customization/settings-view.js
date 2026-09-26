import { ARENA_CONTROLS, COLLISION_MODES, FIGHTER_CONTROLS, MAGE_ABILITY_CONTROLS, MAGE_CYCLES, MAGE_SPELL_SLOTS, PRIEST_ABILITY_CONTROLS, TRAIT_CONTROLS } from '../config/customization.js';
import { displayControl, presentationFor, settingTooltip, toDisplayValue } from './setting-presentation.js';

const SIDES = Object.freeze(['left', 'right']);

export function createSettingsView({ state, settings, elements, i18n }) {
  let activeTab = 'left';
  const t = (key, parameters) => i18n.t(key, parameters);

  function valueControl({ id, label, value, min, max, step, scope, key, mode, magePath = '', presentationKey = magePath || key, distanceRange = null }) {
    const presentation = presentationFor(presentationKey);
    const displayed = toDisplayValue(value, presentation);
    const displayedControl = displayControl({ min, max, step }, presentation);
    const tooltip = settingTooltip({ key: presentationKey, label, value, control: { min, max, step }, t, distanceRange });
    const attributes = `data-setting-scope="${scope}" data-setting-key="${key}"` +
      (mode == null ? '' : ` data-setting-mode="${mode}"`) + (magePath ? ` data-mage-path="${magePath}"` : '') +
      ` data-setting-presentation="${presentationKey}" data-setting-label="${label}"` +
      ` data-setting-min="${min}" data-setting-max="${max}" data-setting-step="${step}"` +
      (distanceRange ? ` data-setting-distance-min="${distanceRange.min}" data-setting-distance-max="${distanceRange.max}"` : '');
    return `<div class="setting-row" data-setting-row="${id}"><div class="setting-label"><label for="${id}-range">${label}</label>` +
      `<span>${presentation.unit ? t(presentation.unit) : ''}</span><button class="setting-help" type="button" data-tooltip="${tooltip}" aria-label="${t('tooltip.help_for', { label })}">?</button></div>` +
      `<div class="setting-inputs"><input id="${id}-range" type="range" min="${displayedControl.min}" max="${displayedControl.max}" step="${displayedControl.step}" value="${displayed}" ${attributes}>` +
      `<input id="${id}-number" type="number" min="${displayedControl.min}" max="${displayedControl.max}" step="${displayedControl.step}" value="${displayed}" ${attributes} aria-label="${label}" data-tooltip="${tooltip}"></div></div>`;
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
      mode
    })).join('');
    const mageRows = character.trait?.id === 'elemental-cycles' ? renderMageAbilities(side, values.abilities) : '';
    const priestRows = character.trait?.id === 'prayer' ? renderPriestAbilities(side, values.abilities) : '';
    const specialAbilityRows = mageRows || priestRows;
    const traitRows = renderTraitSettings(side, character, values.trait);
    return `<section class="settings-sheet" role="tabpanel" id="settings-panel-${side}" aria-labelledby="settings-tab-${side}">` +
      `<div class="settings-sheet-heading"><div><span>${t(`side.${side}`)}</span><h3>${t(character.nameKey)}</h3></div>` +
      `<div><button type="button" data-set-character-default="${side}" data-tooltip="${t('tooltip.save_default')}">${t('customization.set_character_default')}</button><button type="button" data-reset-scope="${side}" data-tooltip="${t('tooltip.reset_section')}">${t('customization.reset_tab')}</button></div></div>` +
      `<div class="settings-grid">${valueControl({ id: `${side}-health`, label: t(FIGHTER_CONTROLS.health.labelKey), value: values.health, ...FIGHTER_CONTROLS.health, scope: side, key: 'health' })}` +
      (specialAbilityRows ? '' : attackRows + cooldownRows) + valueControl({ id: `${side}-speed`, label: t(FIGHTER_CONTROLS.movementSpeed.labelKey), value: values.movementSpeed, ...FIGHTER_CONTROLS.movementSpeed, scope: side, key: 'movementSpeed' }) +
      (values.projectileSpeed == null ? '' : valueControl({ id: `${side}-projectile-speed`, label: t(FIGHTER_CONTROLS.projectileSpeed.labelKey), value: values.projectileSpeed, ...FIGHTER_CONTROLS.projectileSpeed, scope: side, key: 'projectileSpeed' })) +
      (values.attackRange == null ? '' : valueControl({ id: `${side}-attack-range`, label: t(FIGHTER_CONTROLS.attackRange.labelKey), value: values.attackRange, ...FIGHTER_CONTROLS.attackRange, scope: side, key: 'attackRange' })) +
      `</div>${traitRows}${mageRows}${priestRows}</section>`;
  }

  function renderPriestAbilities(side, abilities) {
    const control = key => valueControl({
      id: `${side}-priest-${key}`, label: t(PRIEST_ABILITY_CONTROLS[key].labelKey), value: abilities[key], ...PRIEST_ABILITY_CONTROLS[key],
      scope: side, key: 'priest', magePath: key, presentationKey: key
    });
    const timing = ['markCooldown', 'prayerCooldown', 'prayerDuration', 'prayerMoveFactor', 'interruptLockout'];
    const decay = ['decayFloor', 'decayInterval', 'decayAmount'];
    const scaling = ['markMoveSlowPerMark', 'markAttackSlowPerMark', 'baseHeal', 'healPerMark', 'baseDamage', 'damagePerMark'];
    return `<section class="mage-abilities"><h4>${t('customization.priest_prayer')}</h4><div class="settings-grid">${timing.map(control).join('')}</div><h4>${t('customization.priest_mark_decay')}</h4><div class="settings-grid">${decay.map(control).join('')}</div><h4>${t('customization.priest_scaling')}</h4><div class="settings-grid">${scaling.map(control).join('')}</div></section>`;
  }

  function renderTraitSettings(side, character, values) {
    const controls = TRAIT_CONTROLS[character.trait?.id];
    if (!controls || !values) return '';
    const rows = Object.entries(controls).map(([key, control]) => valueControl({
      id: `${side}-trait-${key}`, label: t(control.labelKey), value: values[key], ...control,
      scope: side, key: 'trait', magePath: key, presentationKey: key
    })).join('');
    return `<section class="mage-abilities"><h4>${t(character.trait.nameKey)}</h4><div class="settings-grid">${rows}</div></section>`;
  }

  function renderMageAbilities(side, abilities) {
    const effectControl = key => valueControl({
      id: `${side}-mage-${key}`, label: t(MAGE_ABILITY_CONTROLS[key].labelKey), value: abilities.effects[key], ...MAGE_ABILITY_CONTROLS[key],
      scope: side, key: 'mage', magePath: `effects.${key}`, presentationKey: key
    });
    const cycleSections = MAGE_CYCLES.map(cycle => {
      const spells = abilities.cycles[cycle].map((spell, index) => {
        const title = t(`customization.mage_${cycle}_${MAGE_SPELL_SLOTS[index]}`);
        return valueControl({ id: `${side}-mage-${cycle}-${index}-damage`, label: `${title} · ${t('customization.damage')}`, value: spell.damage, ...FIGHTER_CONTROLS.attack, scope: side, key: 'mage', magePath: `cycles.${cycle}.${index}.damage`, presentationKey: 'attack' }) +
          valueControl({ id: `${side}-mage-${cycle}-${index}-cooldown`, label: `${title} · ${t('customization.cooldown')}`, value: spell.cooldown, ...FIGHTER_CONTROLS.attackCD, scope: side, key: 'mage', magePath: `cycles.${cycle}.${index}.cooldown`, presentationKey: 'attackCD' });
      }).join('');
      const effects = cycle === 'ice'
        ? ['iceSlowFactor', 'iceSlowDuration', 'iceFreezeBase', 'iceFreezePerMark', 'iceBurstDamage', 'iceBurstRadius']
        : cycle === 'fire'
          ? ['fireBurnDamage', 'fireBurnDuration', 'fireExplosionRadius', 'fireMaxBurnDamage', 'fireMaxBurnDuration']
          : ['leechBleedDamage', 'leechBleedDuration', 'leechHealBase', 'leechHealPerMark', 'leechMaxBleedDamage', 'leechMaxBleedDuration'];
      return `<section class="mage-cycle"><h4>${t(`customization.mage_${cycle}`)}</h4><div class="settings-grid">${spells}${effects.map(effectControl).join('')}</div></section>`;
    }).join('');
    return `<section class="mage-abilities"><h4>${t('customization.mage_cycles')}</h4><div class="settings-grid">${effectControl('markDuration')}${effectControl('maxMarks')}${effectControl('damagePerMark')}</div>${cycleSections}</section>`;
  }

  function arenaDisplayValue(key, value) {
    return key === 'launchDelay' ? value / 1000 : value;
  }

  function renderArena() {
    const arena = settings.getArena();
    const distanceMin = Math.max(ARENA_CONTROLS.startingDistance.min, arena.fighterSize);
    const distanceMax = Math.min(ARENA_CONTROLS.startingDistance.max, arena.size - arena.fighterSize);
    const controls = Object.entries(ARENA_CONTROLS).map(([key, control]) => valueControl({
      id: `arena-${key}`,
      label: t(control.labelKey),
      value: arenaDisplayValue(key, arena[key]),
      min: key === 'startingDistance' ? distanceMin : control.min,
      max: key === 'startingDistance' ? distanceMax : control.max,
      step: control.step,
      scope: 'arena',
      key,
      distanceRange: key === 'startingDistance' ? { min: distanceMin, max: distanceMax } : null
    })).join('');
    const collisionOptions = COLLISION_MODES.map(mode => `<option value="${mode}"${arena.collisionMode === mode ? ' selected' : ''}>${t(`customization.collision_${mode}`)}</option>`).join('');
    return `<section class="settings-sheet" role="tabpanel" id="settings-panel-arena" aria-labelledby="settings-tab-arena">` +
      `<div class="settings-sheet-heading"><div><span>${t('customization.match_rules')}</span><h3>${t('customization.arena')}</h3></div>` +
      `<button type="button" data-reset-scope="arena" data-tooltip="${t('tooltip.reset_section')}">${t('customization.reset_tab')}</button></div>` +
      `<div class="settings-grid">${controls}<div class="setting-row setting-select"><label for="arena-collision">${t('customization.collision')}</label>` +
      `<select id="arena-collision" data-setting-scope="arena" data-setting-key="collisionMode" data-tooltip="${t('tooltip.collision')}">${collisionOptions}</select></div></div></section>`;
  }

  function renderTabs() {
    elements['settings-tabs'].innerHTML = [...SIDES, 'arena'].map(tab => {
      const label = tab === 'arena' ? t('customization.arena') : t(`customization.${tab}_fighter`);
      return `<button type="button" role="tab" id="settings-tab-${tab}" aria-controls="settings-content" ` +
        `aria-selected="${activeTab === tab}" tabindex="${activeTab === tab ? 0 : -1}" data-settings-tab="${tab}" data-tooltip="${t('tooltip.settings_tab')}">${label}</button>`;
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
    elements['settings-content'].querySelectorAll(selector).forEach(input => {
      const presentation = presentationFor(input.dataset.settingPresentation);
      input.value = toDisplayValue(value, presentation);
      const tooltip = settingTooltip({
        key: input.dataset.settingPresentation,
        label: input.dataset.settingLabel,
        value,
        control: { min: Number(input.dataset.settingMin), max: Number(input.dataset.settingMax), step: Number(input.dataset.settingStep) },
        t,
        distanceRange: input.dataset.settingDistanceMin == null ? null : { min: Number(input.dataset.settingDistanceMin), max: Number(input.dataset.settingDistanceMax) }
      });
      input.dataset.tooltip = tooltip;
      input.closest('.setting-row')?.querySelector('.setting-help')?.setAttribute('data-tooltip', tooltip);
    });
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
      input.dataset.settingMin = String(minimum);
      input.dataset.settingMax = String(maximum);
      const tooltip = settingTooltip({
        key: input.dataset.settingPresentation,
        label: input.dataset.settingLabel,
        value: arena.startingDistance,
        control: { min: minimum, max: maximum, step: Number(input.dataset.settingStep) },
        t,
        distanceRange: { min: minimum, max: maximum }
      });
      input.dataset.tooltip = tooltip;
      input.closest('.setting-row')?.querySelector('.setting-help')?.setAttribute('data-tooltip', tooltip);
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
