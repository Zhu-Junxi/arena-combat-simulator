import { ARENA_CONTROLS, COLLISION_MODES, FIGHTER_CONTROLS, MAGE_ABILITY_CONTROLS, MAGE_CYCLES, MAGE_SPELL_SLOTS, PRIEST_ABILITY_CONTROLS, SUMMON_ABILITY_CONTROLS, TRAIT_CONTROLS, WEAPON_TUNING_CONTROLS, GUARDIAN_ABILITY_CONTROLS, GUARDIAN_ABILITY_SWITCHES, STAR_ABILITY_CONTROLS, STAR_ABILITY_SWITCHES } from '../config/customization.js';
import { displayControl, presentationFor, settingTooltip, toDisplayValue } from './setting-presentation.js';

const SIDES = Object.freeze(['left', 'right']);

export function createSettingsView({ state, settings, elements, i18n }) {
  let activeTab = 'left';
  const sliderExpansions = new Map();
  const openDetails = new Map();
  const t = (key, parameters) => i18n.t(key, parameters);

  function sliderBounds(id, control, value, presentation) {
    const displayed = toDisplayValue(value, presentation);
    const standard = displayControl(control, presentation);
    if (!settings.getAdvanced()) return standard;
    const expansion = sliderExpansions.get(id) ?? 0;
    if (!expansion && displayed >= standard.min && displayed <= standard.max) return standard;
    const width = Math.max((standard.max - standard.min) * 2 ** expansion, Math.abs(displayed) * 0.2);
    return { min: displayed - width / 2, max: displayed + width / 2, step: standard.step };
  }

  function valueControl({ id, label, value, min, max, step, scope, key, mode, magePath = '', presentationKey = magePath || key, distanceRange = null }) {
    const presentation = presentationFor(presentationKey);
    const displayed = toDisplayValue(value, presentation);
    const control = { min, max, step };
    const displayedControl = sliderBounds(id, control, value, presentation);
    const advanced = settings.getAdvanced();
    const tooltip = settingTooltip({ key: presentationKey, label, value, control: { min, max, step }, t, distanceRange });
    const attributes = `data-setting-scope="${scope}" data-setting-key="${key}"` +
      (mode == null ? '' : ` data-setting-mode="${mode}"`) + (magePath ? ` data-mage-path="${magePath}"` : '') +
      ` data-setting-presentation="${presentationKey}" data-setting-label="${label}"` +
      ` data-setting-min="${min}" data-setting-max="${max}" data-setting-step="${step}"` +
      (distanceRange ? ` data-setting-distance-min="${distanceRange.min}" data-setting-distance-max="${distanceRange.max}"` : '');
    return `<div class="setting-row" data-setting-row="${id}"><div class="setting-label"><label for="${id}-range">${label}</label>` +
      `<span>${presentation.unit ? t(presentation.unit) : ''}</span>${advanced ? `<button class="slider-expand" type="button" data-expand-slider="${id}" data-tooltip="${t('tooltip.expand_slider')}" aria-label="${t('tooltip.expand_slider')}">↔</button>` : ''}<button class="setting-help" type="button" data-tooltip="${tooltip}" aria-label="${t('tooltip.help_for', { label })}">?</button></div>` +
      `<div class="setting-inputs"><input id="${id}-range" type="range" min="${displayedControl.min}" max="${displayedControl.max}" step="${displayedControl.step}" value="${displayed}" ${attributes}>` +
      `<button class="setting-adjust" type="button" data-adjust="-1" data-tooltip="${t('tooltip.adjust_down')}" aria-label="${t('tooltip.adjust_down')}">−</button><input id="${id}-number" type="number" ${advanced ? '' : `min="${displayedControl.min}" max="${displayedControl.max}"`} step="${displayedControl.step}" value="${displayed}" ${attributes} aria-label="${label}" data-tooltip="${tooltip}"><button class="setting-adjust" type="button" data-adjust="1" data-tooltip="${t('tooltip.adjust_up')}" aria-label="${t('tooltip.adjust_up')}">+</button></div></div>`;
  }

  function renderFighter(side) {
    const character = state[side];
    const values = settings.getFighter(side, character.id);
    const detailKey = `${side}:${character.id}`;
    const basic = (key, mode = null) => valueControl({
      id: key === 'attack' ? `${side}-attack-${mode}` : key === 'attackCD' ? `${side}-cooldown-${mode}` : `${side}-${key === 'movementSpeed' ? 'speed' : key}`,
      label: t(FIGHTER_CONTROLS[key].labelKey), value: mode == null ? values[key] : values[key][mode],
      ...FIGHTER_CONTROLS[key], scope: side, key, mode
    });
    const trait = key => valueControl({ id: `${side}-trait-${key}`, label: t(TRAIT_CONTROLS[character.trait.id][key].labelKey),
      value: values.trait[key], ...TRAIT_CONTROLS[character.trait.id][key], scope: side, key: 'trait', magePath: key, presentationKey: key });
    const ability = (kind, key, controls, path = key) => valueControl({
      id: `${side}-${kind === 'special' ? character.id === 'guardian' ? 'guardian' : 'star' : kind}-${key}`,
      label: t(controls[key].labelKey ?? `customization.${kind === 'special' ? character.id === 'guardian' ? 'guardian' : 'star' : kind}_${key}`),
      value: values.abilities[key] ?? values.abilities.effects?.[key],
      ...controls[key], scope: side, key: kind, magePath: path, presentationKey: kind === 'special' ? `${character.id === 'guardian' ? 'guardian' : 'star'}_${key}` : key
    });
    const signature = ({
      warrior: () => [basic('attack', 0), basic('attackCD', 0), trait('reduction')],
      archer: () => [basic('attack', 0), basic('attackCD', 0), trait('every')],
      guardian: () => [basic('attack', 0), basic('attackCD', 0), ability('special', 'durability', GUARDIAN_ABILITY_CONTROLS)],
      mage: () => ['markDuration', 'maxMarks', 'damagePerMark'].map(key => ability('mage', key, MAGE_ABILITY_CONTROLS, `effects.${key}`)),
      priest: () => ['markCooldown', 'baseHeal', 'baseDamage'].map(key => ability('priest', key, PRIEST_ABILITY_CONTROLS)),
      'dongfang-changfan': () => [basic('attack', 0), basic('attackCD', 0), ability('special', 'starsPerAttack', STAR_ABILITY_CONTROLS)],
      beastmaster: () => ['companionHealth', 'biteDamage', 'packSize'].map(key => ability('summon', key, SUMMON_ABILITY_CONTROLS))
    }[character.id] ?? (() => []))();
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
    const mageRows = character.id === 'mage' ? renderMageAbilities(side, values.abilities) : '';
    const priestRows = character.id === 'priest' ? renderPriestAbilities(side, values.abilities) : '';
    const summonRows = character.id === 'beastmaster' ? renderSummonAbilities(side, values.abilities) : '';
    const specialRows = character.id === 'guardian' ? renderSpecialAbilities(side, 'guardian', values.abilities, GUARDIAN_ABILITY_CONTROLS, GUARDIAN_ABILITY_SWITCHES) :
      character.id === 'dongfang-changfan' ? renderSpecialAbilities(side, 'star', values.abilities, STAR_ABILITY_CONTROLS, STAR_ABILITY_SWITCHES) : '';
    const traitRows = renderTraitSettings(side, character, values.trait, character.id === 'warrior' ? ['reduction'] : character.id === 'archer' ? ['every'] : []);
    const weaponRows = values.weapon ? `<section class="mage-abilities"><h4>${t('customization.weapon_tuning')}</h4><div class="settings-grid">${Object.entries(WEAPON_TUNING_CONTROLS[character.id]).map(([key, control]) =>
      valueControl({ id: `${side}-weapon-${key}`, label: t(control.labelKey), value: values.weapon[key], ...control,
        scope: side, key: 'weapon', magePath: key, presentationKey: `weapon_${key}` })).join('')}</div></section>` : '';
    const detailedBasics = (character.id === 'beastmaster' ? attackRows + cooldownRows : '') +
      (values.projectileSpeed == null ? '' : basic('projectileSpeed')) +
      (values.attackRange == null ? '' : basic('attackRange'));
    const detailed = (detailedBasics ? `<div class="settings-grid">${detailedBasics}</div>` : '') +
      traitRows + weaponRows + mageRows + priestRows + summonRows + specialRows;
    return `<section class="settings-sheet" role="tabpanel" id="settings-panel-${side}" aria-labelledby="settings-tab-${side}">` +
      `<div class="settings-sheet-heading"><div><span>${t(`side.${side}`)}</span><h3>${t(character.nameKey)}</h3></div>` +
      `<div><button type="button" data-set-character-default="${side}" data-tooltip="${t('tooltip.save_default')}">${t('customization.set_character_default')}</button><button type="button" data-reset-scope="${side}" data-tooltip="${t('tooltip.reset_section')}">${t('customization.reset_tab')}</button></div></div>` +
      `<div class="settings-grid" data-primary-controls>${basic('health')}${basic('movementSpeed')}${signature.join('')}</div>` +
      `<details class="fighter-details" data-detail-key="${detailKey}"${openDetails.get(detailKey) ? ' open' : ''}>` +
      `<summary>${t('customization.detailed_tuning')}</summary><div class="fighter-details-content">${detailed}</div></details></section>`;
  }

  function renderSpecialAbilities(side, kind, abilities, controls, switches) {
    const numeric = key => valueControl({
      id: `${side}-${kind}-${key}`, label: t(`customization.${kind}_${key}`), value: abilities[key], ...controls[key],
      scope: side, key: 'special', magePath: key, presentationKey: `${kind}_${key}`
    });
    const flag = key => `<label class="setting-row setting-select" data-tooltip="${t('tooltip.special_switch')}"><span>${t(`customization.${kind}_${key}`)}</span><input type="checkbox" data-special-switch="${key}" data-setting-scope="${side}" ${abilities[key] ? 'checked' : ''}></label>`;
    const mode = `<label class="setting-row setting-select" data-tooltip="${t('tooltip.guardian_starting_mode')}"><span>${t('customization.guardian_startingMode')}</span><select data-special-mode data-setting-scope="${side}"><option value="charge" ${abilities.startingMode === 'charge' ? 'selected' : ''}>${t('customization.guardian_mode_charge')}</option><option value="flail" ${abilities.startingMode === 'flail' ? 'selected' : ''}>${t('customization.guardian_mode_flail')}</option></select></label>`;
    const groups = kind === 'guardian' ? [
      ['shield', [], []],
      ['charge', ['chargeSpeed', 'chargeDistance', 'chargeDamageFactor'], ['chargeEnabled', 'autoSwitch']],
      ['flail', ['throwSpeed', 'returnSpeed', 'headRadius', 'impactRadius', 'groundDuration', 'outboundDamageFactor', 'landingDamageFactor', 'returnDamageFactor', 'contactDamage', 'chainWidth'], ['flailEnabled', 'outboundEnabled', 'landingEnabled', 'returnEnabled', 'contactEnabled', 'chainBlocking']],
      ['presentation', ['windup', 'active', 'duration'], []]
    ] : [
      ['passive', ['stackDuration', 'hastePerStack'], ['enemyAttack', 'enemyHurt', 'enemyHit']],
      ['flight', ['rearSpreadDegrees', 'orbitRadiusMin', 'orbitRadiusMax', 'initialSpeedFactor', 'accelerationFactor', 'lifetime', 'radius'], []],
      ['presentation', ['windup', 'duration'], []]
    ];
    return `<section class="mage-abilities"><h4>${t(`customization.${kind}_heading`)}</h4>${groups.map(([group, fields, flags]) =>
      fields.length || flags.length || kind === 'guardian' && group === 'charge' ?
        `<h4>${t(`customization.${kind}_${group}`)}</h4><div class="settings-grid">${fields.map(numeric).join('')}${flags.map(flag).join('')}${kind === 'guardian' && group === 'charge' ? mode : ''}</div>` : '').join('')}</section>` +
      `<section class="mage-abilities"><h4>${t('customization.visual_tuning')}</h4><div class="settings-grid">${(kind === 'guardian' ? ['shieldFlashDuration', 'equipmentScale'] : ['visualScale']).map(numeric).join('')}</div></section>`;
  }

  function renderPriestAbilities(side, abilities) {
    const control = key => valueControl({
      id: `${side}-priest-${key}`, label: t(PRIEST_ABILITY_CONTROLS[key].labelKey), value: abilities[key], ...PRIEST_ABILITY_CONTROLS[key],
      scope: side, key: 'priest', magePath: key, presentationKey: key
    });
    const timing = ['prayerCooldown', 'prayerDuration', 'prayerMoveFactor', 'interruptLockout'];
    const decay = ['decayFloor', 'decayInterval', 'decayAmount'];
    const scaling = ['markMoveSlowPerMark', 'markAttackSlowPerMark', 'healPerMark', 'damagePerMark'];
    return `<section class="mage-abilities"><h4>${t('customization.priest_prayer')}</h4><div class="settings-grid">${timing.map(control).join('')}</div><h4>${t('customization.priest_mark_decay')}</h4><div class="settings-grid">${decay.map(control).join('')}</div><h4>${t('customization.priest_scaling')}</h4><div class="settings-grid">${scaling.map(control).join('')}</div></section>`;
  }

  function renderSummonAbilities(side, abilities) {
    const control = key => valueControl({
      id: `${side}-summon-${key}`, label: t(SUMMON_ABILITY_CONTROLS[key].labelKey), value: abilities[key], ...SUMMON_ABILITY_CONTROLS[key],
      scope: side, key: 'summon', magePath: key, presentationKey: key
    });
    const companion = ['companionSpeed', 'biteRange', 'biteCooldown', 'respawnDelay'];
    const command = ['meterThreshold', 'meterPerBite', 'packCooldown', 'chargeDamage', 'chargeSpeed', 'chargeLifetime'];
    return `<section class="mage-abilities"><h4>${t('customization.summon_companion')}</h4><div class="settings-grid">${companion.map(control).join('')}</div><h4>${t('customization.summon_pack')}</h4><div class="settings-grid">${command.map(control).join('')}</div></section>`;
  }

  function renderTraitSettings(side, character, values, excluded = []) {
    const controls = TRAIT_CONTROLS[character.trait?.id];
    if (!controls || !values) return '';
    const rows = Object.entries(controls).filter(([key]) => !excluded.includes(key)).map(([key, control]) => valueControl({
      id: `${side}-trait-${key}`, label: t(control.labelKey), value: values[key], ...control,
      scope: side, key: 'trait', magePath: key, presentationKey: key
    })).join('');
    return rows ? `<section class="mage-abilities"><h4>${t(character.trait.nameKey)}</h4><div class="settings-grid">${rows}</div></section>` : '';
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
    return `<section class="mage-abilities"><h4>${t('customization.mage_cycles')}</h4>${cycleSections}</section>`;
  }

  function arenaDisplayValue(key, value) {
    return key === 'launchDelay' ? value / 1000 : value;
  }

  function renderArena() {
    const arena = settings.getArena();
    const distanceMin = Math.max(ARENA_CONTROLS.startingDistance.min, arena.fighterSize);
    const distanceMax = Math.min(ARENA_CONTROLS.startingDistance.max, arena.size - arena.fighterSize);
    const controls = Object.entries(ARENA_CONTROLS).filter(([key]) => key !== 'fighterCount').map(([key, control]) => valueControl({
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
    const previous = elements['settings-content'].querySelector?.('[data-detail-key]');
    if (previous) openDetails.set(previous.dataset.detailKey, previous.open);
    elements['settings-content'].innerHTML = activeTab === 'arena' ? renderArena() : renderFighter(activeTab);
  }

  function render() {
    renderTabs();
    renderContent();
    elements['settings-reset-all'].textContent = t('customization.reset_all');
    elements['advanced-tuning'].checked = settings.getAdvanced();
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
    const inputs = [...elements['settings-content'].querySelectorAll(selector)];
    if (settings.getAdvanced() && inputs.length) {
      const input = inputs[0];
      const row = input.closest('.setting-row');
      const presentation = presentationFor(input.dataset.settingPresentation);
      const bounds = sliderBounds(row.dataset.settingRow, {
        min: Number(input.dataset.settingMin), max: Number(input.dataset.settingMax), step: Number(input.dataset.settingStep)
      }, value, presentation);
      const slider = row.querySelector('input[type="range"]');
      slider.min = bounds.min;
      slider.max = bounds.max;
      slider.step = bounds.step;
    }
    inputs.forEach(input => {
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
    if (settings.getAdvanced()) return;
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
    syncArenaConstraints,
    expandSlider(id) {
      sliderExpansions.set(id, (sliderExpansions.get(id) ?? 0) + 1);
      renderContent();
    }
  });
}
