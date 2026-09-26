const DISPLAY_PERCENT = 'percent';
const DISPLAY_MULTIPLIER = 'multiplier';

export const SETTING_PRESENTATIONS = Object.freeze({
  health: { unit: 'unit.hp', description: 'tooltip.health', example: 'tooltip.current_value' },
  attack: { unit: 'unit.damage_per_hit', description: 'tooltip.attack', example: 'tooltip.current_value' },
  attackCD: { unit: 'unit.seconds_short', description: 'tooltip.cooldown', example: 'tooltip.current_value' },
  movementSpeed: { unit: 'unit.arena_units_per_second', description: 'tooltip.movement_speed', example: 'tooltip.current_value' },
  projectileSpeed: { unit: 'unit.arena_units_per_second', description: 'tooltip.projectile_speed', example: 'tooltip.current_value' },
  attackRange: { unit: 'unit.arena_units', description: 'tooltip.attack_range', example: 'tooltip.current_value' },
  reduction: { unit: 'unit.damage_per_hit', description: 'tooltip.damage_reduction', example: 'tooltip.current_value' },
  every: { unit: 'unit.arrows', description: 'tooltip.empowered_arrow', example: 'tooltip.every_arrow' },
  rootDuration: { unit: 'unit.seconds_short', description: 'tooltip.root_duration', example: 'tooltip.current_value' },
  slowDuration: { unit: 'unit.seconds_short', description: 'tooltip.slow_duration', example: 'tooltip.current_value' },
  slowFactor: { unit: 'unit.percent', display: DISPLAY_PERCENT, description: 'tooltip.movement_remaining', example: 'tooltip.movement_remaining_example' },
  markDuration: { unit: 'unit.seconds_short', description: 'tooltip.mark_duration', example: 'tooltip.current_value' },
  maxMarks: { unit: 'unit.marks', description: 'tooltip.max_marks', example: 'tooltip.current_value' },
  damagePerMark: { unit: 'unit.damage_per_mark', description: 'tooltip.damage_per_mark', example: 'tooltip.per_mark_total' },
  iceSlowFactor: { unit: 'unit.percent', display: DISPLAY_PERCENT, description: 'tooltip.movement_remaining', example: 'tooltip.movement_remaining_example' },
  iceSlowDuration: { unit: 'unit.seconds_short', description: 'tooltip.slow_duration', example: 'tooltip.current_value' },
  iceFreezeBase: { unit: 'unit.seconds_short', description: 'tooltip.freeze_duration', example: 'tooltip.current_value' },
  iceFreezePerMark: { unit: 'unit.seconds_per_mark', description: 'tooltip.freeze_per_mark', example: 'tooltip.current_value' },
  iceBurstDamage: { unit: 'unit.damage_per_hit', description: 'tooltip.burst_damage', example: 'tooltip.current_value' },
  iceBurstRadius: { unit: 'unit.arena_units', description: 'tooltip.effect_radius', example: 'tooltip.current_value' },
  fireBurnDamage: { unit: 'unit.damage_per_second', description: 'tooltip.damage_over_time', example: 'tooltip.dot_total' },
  fireBurnDuration: { unit: 'unit.seconds_short', description: 'tooltip.burn_duration', example: 'tooltip.current_value' },
  fireExplosionRadius: { unit: 'unit.arena_units', description: 'tooltip.effect_radius', example: 'tooltip.current_value' },
  fireMaxBurnDamage: { unit: 'unit.damage_per_second', description: 'tooltip.damage_over_time', example: 'tooltip.current_value' },
  fireMaxBurnDuration: { unit: 'unit.seconds_short', description: 'tooltip.burn_duration', example: 'tooltip.current_value' },
  leechBleedDamage: { unit: 'unit.damage_per_second', description: 'tooltip.damage_over_time', example: 'tooltip.dot_total' },
  leechBleedDuration: { unit: 'unit.seconds_short', description: 'tooltip.bleed_duration', example: 'tooltip.current_value' },
  leechHealBase: { unit: 'unit.hp', description: 'tooltip.base_heal', example: 'tooltip.current_value' },
  leechHealPerMark: { unit: 'unit.hp_per_mark', description: 'tooltip.heal_per_mark', example: 'tooltip.per_mark_total' },
  leechMaxBleedDamage: { unit: 'unit.damage_per_second', description: 'tooltip.damage_over_time', example: 'tooltip.dot_total' },
  leechMaxBleedDuration: { unit: 'unit.seconds_short', description: 'tooltip.bleed_duration', example: 'tooltip.current_value' },
  markCooldown: { unit: 'unit.seconds_short', description: 'tooltip.mark_cooldown', example: 'tooltip.current_value' },
  prayerCooldown: { unit: 'unit.seconds_short', description: 'tooltip.prayer_cooldown', example: 'tooltip.current_value' },
  prayerDuration: { unit: 'unit.seconds_short', description: 'tooltip.prayer_duration', example: 'tooltip.current_value' },
  prayerMoveFactor: { unit: 'unit.percent', display: DISPLAY_PERCENT, description: 'tooltip.prayer_movement', example: 'tooltip.movement_remaining_example' },
  interruptLockout: { unit: 'unit.seconds_short', description: 'tooltip.interrupt_lockout', example: 'tooltip.current_value' },
  decayFloor: { unit: 'unit.marks', description: 'tooltip.decay_floor', example: 'tooltip.current_value' },
  decayInterval: { unit: 'unit.seconds_short', description: 'tooltip.decay_interval', example: 'tooltip.current_value' },
  decayAmount: { unit: 'unit.marks', description: 'tooltip.decay_amount', example: 'tooltip.current_value' },
  markMoveSlowPerMark: { unit: 'unit.percent_per_mark', display: DISPLAY_PERCENT, description: 'tooltip.priest_move_slow', example: 'tooltip.priest_slow_example' },
  markAttackSlowPerMark: { unit: 'unit.percent_per_mark', display: DISPLAY_PERCENT, description: 'tooltip.priest_attack_slow', example: 'tooltip.priest_slow_example' },
  baseHeal: { unit: 'unit.hp', description: 'tooltip.base_heal', example: 'tooltip.current_value' },
  healPerMark: { unit: 'unit.hp_per_mark', description: 'tooltip.heal_per_mark', example: 'tooltip.per_mark_total' },
  baseDamage: { unit: 'unit.damage_per_hit', description: 'tooltip.base_damage', example: 'tooltip.current_value' },
  size: { unit: 'unit.arena_units', description: 'tooltip.arena_size', example: 'tooltip.current_value' },
  fighterSize: { unit: 'unit.arena_units', description: 'tooltip.fighter_size', example: 'tooltip.current_value' },
  timeScale: { unit: 'unit.multiplier', display: DISPLAY_MULTIPLIER, description: 'tooltip.time_scale', example: 'tooltip.multiplier_example' },
  startingDistance: { unit: 'unit.arena_units', description: 'tooltip.starting_distance', example: 'tooltip.distance_range' },
  projectileSpeedScale: { unit: 'unit.multiplier', display: DISPLAY_MULTIPLIER, description: 'tooltip.projectile_multiplier', example: 'tooltip.multiplier_example' },
  launchDelay: { unit: 'unit.seconds_short', description: 'tooltip.launch_delay', example: 'tooltip.current_value' },
  controlDurationScale: { unit: 'unit.multiplier', display: DISPLAY_MULTIPLIER, description: 'tooltip.control_multiplier', example: 'tooltip.multiplier_example' },
  contactStopDuration: { unit: 'unit.seconds_short', description: 'tooltip.contact_stop', example: 'tooltip.current_value' }
});

export function presentationFor(key) {
  return SETTING_PRESENTATIONS[key] ?? { unit: '', description: 'tooltip.current_value', example: 'tooltip.current_value' };
}

export function toDisplayValue(value, presentation = {}) {
  return presentation.display === DISPLAY_PERCENT ? Number((value * 100).toFixed(4)) : value;
}

export function fromDisplayValue(value, presentation = {}) {
  const numeric = Number(value);
  return presentation.display === DISPLAY_PERCENT ? numeric / 100 : numeric;
}

export function displayControl(control, presentation = {}) {
  const factor = presentation.display === DISPLAY_PERCENT ? 100 : 1;
  return { min: control.min * factor, max: control.max * factor, step: control.step * factor };
}

export function formatValue(value, presentation, t) {
  const shown = toDisplayValue(value, presentation);
  const number = Number.isInteger(shown) ? String(shown) : String(Number(shown.toFixed(2)));
  const unit = presentation.unit ? t(presentation.unit) : '';
  return presentation.display === DISPLAY_MULTIPLIER ? `${number}×` : `${number}${unit ? ` ${unit}` : ''}`;
}

export function settingTooltip({ key, label, value, control, t, distanceRange = null }) {
  const presentation = presentationFor(key);
  const current = formatValue(value, presentation, t);
  const display = displayControl(control, presentation);
  const minimum = formatValue(control.min, presentation, t);
  const maximum = formatValue(control.max, presentation, t);
  const description = t(presentation.description);
  let example = t(presentation.example, {
    value: current,
    minimum,
    maximum,
    remaining: Math.round(toDisplayValue(value, presentation)),
    reduction: Math.round((1 - value) * 100),
    threeMarks: Math.min(90, Math.round(toDisplayValue(value, presentation) * 3)),
    total: Number((value * 3).toFixed(2)),
    rangeMin: distanceRange?.min ?? display.min,
    rangeMax: distanceRange?.max ?? display.max
  });
  return `${label}. ${description} ${example} ${t('tooltip.allowed_range', { minimum, maximum })}`;
}
