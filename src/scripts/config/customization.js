import { WEAPON_DEFINITIONS } from './weapons.js';

export const MATCH_SETTINGS_STORAGE_KEY = 'arena-duel.match-settings.v1';
export const MATCH_SETTINGS_VERSION = 3;
export const MOVEMENT_UNITS_PER_STAT = 44;
export const COLLISION_MODES = Object.freeze(['bounce', 'stop', 'pass']);

export const FIGHTER_CONTROLS = Object.freeze({
  health: Object.freeze({ min: 0.001, max: 300, step: 0.001, labelKey: 'customization.health' }),
  attack: Object.freeze({ min: 0.001, max: 50, step: 0.001, labelKey: 'customization.attack' }),
  attackCD: Object.freeze({ min: 0.25, max: 10, step: 0.001, labelKey: 'customization.cooldown' }),
  movementSpeed: Object.freeze({ min: 25, max: 440, step: 0.001, labelKey: 'customization.movement_speed' }),
  projectileSpeed: Object.freeze({ min: 100, max: 1240, step: 0.001, labelKey: 'customization.projectile_speed' }),
  attackRange: Object.freeze({ min: 30, max: 300, step: 0.001, labelKey: 'customization.attack_range' })
});

export const TRAIT_CONTROLS = Object.freeze({
  plate: Object.freeze({
    reduction: Object.freeze({ min: 0, max: 20, step: 0.001, default: 1, labelKey: 'customization.plate_reduction' })
  }),
  vine: Object.freeze({
    every: Object.freeze({ min: 1, max: 10, step: 1, default: 4, labelKey: 'customization.vine_every' }),
    rootDuration: Object.freeze({ min: 0, max: 5, step: 0.001, default: 2, labelKey: 'customization.vine_root_duration' }),
    slowDuration: Object.freeze({ min: 0, max: 5, step: 0.001, default: 3, labelKey: 'customization.vine_slow_duration' }),
    slowFactor: Object.freeze({ min: 0.1, max: 1, step: 0.0001, default: 0.5, labelKey: 'customization.vine_slow_factor' })
  })
});

export const MAGE_CYCLES = Object.freeze(['ice', 'fire', 'leech']);
export const MAGE_SPELL_SLOTS = Object.freeze(['normal', 'theme', 'final']);
export const MAGE_ABILITY_CONTROLS = Object.freeze({
  markDuration: Object.freeze({ min: 1, max: 10, step: 0.001, default: 5, labelKey: 'customization.mage_mark_duration' }),
  maxMarks: Object.freeze({ min: 1, max: 4, step: 1, default: 2, labelKey: 'customization.mage_max_marks' }),
  damagePerMark: Object.freeze({ min: 0, max: 10, step: 0.001, default: 1, labelKey: 'customization.mage_damage_per_mark' }),
  iceSlowFactor: Object.freeze({ min: 0.25, max: 0.9, step: 0.0001, default: 0.75, labelKey: 'customization.mage_ice_slow' }),
  iceSlowDuration: Object.freeze({ min: 0, max: 5, step: 0.001, default: 1.5, labelKey: 'customization.mage_ice_slow_duration' }),
  iceFreezeBase: Object.freeze({ min: 0, max: 3, step: 0.001, default: 0.25, labelKey: 'customization.mage_ice_freeze_base' }),
  iceFreezePerMark: Object.freeze({ min: 0, max: 3, step: 0.001, default: 0.4, labelKey: 'customization.mage_ice_freeze_per_mark' }),
  iceBurstDamage: Object.freeze({ min: 0, max: 20, step: 0.001, default: 3, labelKey: 'customization.mage_ice_burst_damage' }),
  iceBurstRadius: Object.freeze({ min: 0, max: 300, step: 0.001, default: 100, labelKey: 'customization.mage_ice_burst_radius' }),
  fireBurnDamage: Object.freeze({ min: 0, max: 10, step: 0.001, default: 0.5, labelKey: 'customization.mage_fire_burn_damage' }),
  fireBurnDuration: Object.freeze({ min: 0, max: 8, step: 0.001, default: 2, labelKey: 'customization.mage_fire_burn_duration' }),
  fireExplosionRadius: Object.freeze({ min: 0, max: 300, step: 0.001, default: 100, labelKey: 'customization.mage_fire_explosion_radius' }),
  fireMaxBurnDamage: Object.freeze({ min: 0, max: 10, step: 0.001, default: 1, labelKey: 'customization.mage_fire_max_burn_damage' }),
  fireMaxBurnDuration: Object.freeze({ min: 0, max: 8, step: 0.001, default: 2, labelKey: 'customization.mage_fire_max_burn_duration' }),
  leechBleedDamage: Object.freeze({ min: 0, max: 10, step: 0.001, default: 0.5, labelKey: 'customization.mage_leech_bleed_damage' }),
  leechBleedDuration: Object.freeze({ min: 0, max: 8, step: 0.001, default: 2, labelKey: 'customization.mage_leech_bleed_duration' }),
  leechHealBase: Object.freeze({ min: 0, max: 20, step: 0.001, default: 1, labelKey: 'customization.mage_leech_heal_base' }),
  leechHealPerMark: Object.freeze({ min: 0, max: 20, step: 0.001, default: 1, labelKey: 'customization.mage_leech_heal_per_mark' }),
  leechMaxBleedDamage: Object.freeze({ min: 0, max: 10, step: 0.001, default: 1, labelKey: 'customization.mage_leech_max_bleed_damage' }),
  leechMaxBleedDuration: Object.freeze({ min: 0, max: 8, step: 0.001, default: 2, labelKey: 'customization.mage_leech_max_bleed_duration' })
});

export const PRIEST_ABILITY_CONTROLS = Object.freeze({
  markCooldown: Object.freeze({ min: 0.25, max: 10, step: 0.001, default: 1, labelKey: 'customization.priest_mark_cooldown' }),
  prayerCooldown: Object.freeze({ min: 0.5, max: 20, step: 0.001, default: 6, labelKey: 'customization.priest_prayer_cooldown' }),
  prayerDuration: Object.freeze({ min: 0.25, max: 10, step: 0.001, default: 2, labelKey: 'customization.priest_prayer_duration' }),
  prayerMoveFactor: Object.freeze({ min: 0.1, max: 1, step: 0.0001, default: 0.55, labelKey: 'customization.priest_prayer_move_factor' }),
  interruptLockout: Object.freeze({ min: 0, max: 10, step: 0.001, default: 1.5, labelKey: 'customization.priest_interrupt_lockout' }),
  decayFloor: Object.freeze({ min: 0, max: 20, step: 1, default: 3, labelKey: 'customization.priest_decay_floor' }),
  decayInterval: Object.freeze({ min: 0.25, max: 20, step: 0.001, default: 2, labelKey: 'customization.priest_decay_interval' }),
  decayAmount: Object.freeze({ min: 1, max: 20, step: 1, default: 1, labelKey: 'customization.priest_decay_amount' }),
  markMoveSlowPerMark: Object.freeze({ min: 0, max: 0.25, step: 0.0001, default: 0.05, labelKey: 'customization.priest_mark_move_slow' }),
  markAttackSlowPerMark: Object.freeze({ min: 0, max: 0.25, step: 0.0001, default: 0.05, labelKey: 'customization.priest_mark_attack_slow' }),
  baseHeal: Object.freeze({ min: 0, max: 50, step: 0.001, default: 4, labelKey: 'customization.priest_base_heal' }),
  healPerMark: Object.freeze({ min: 0, max: 20, step: 0.001, default: 2, labelKey: 'customization.priest_heal_per_mark' }),
  baseDamage: Object.freeze({ min: 0, max: 50, step: 0.001, default: 3, labelKey: 'customization.priest_base_damage' }),
  damagePerMark: Object.freeze({ min: 0, max: 20, step: 0.001, default: 2, labelKey: 'customization.priest_damage_per_mark' })
});

export const SUMMON_ABILITY_CONTROLS = Object.freeze({
  companionHealth: Object.freeze({ min: 0.001, max: 200, step: 0.001, default: 45, labelKey: 'customization.summon_companion_health' }),
  companionSpeed: Object.freeze({ min: 25, max: 600, step: 0.001, default: 285, labelKey: 'customization.summon_companion_speed' }),
  biteDamage: Object.freeze({ min: 0, max: 50, step: 0.001, default: 4, labelKey: 'customization.summon_bite_damage' }),
  biteRange: Object.freeze({ min: 10, max: 300, step: 0.001, default: 54, labelKey: 'customization.summon_bite_range' }),
  biteCooldown: Object.freeze({ min: 0.1, max: 10, step: 0.001, default: 1.1, labelKey: 'customization.summon_bite_cooldown' }),
  respawnDelay: Object.freeze({ min: 0, max: 20, step: 0.001, default: 4, labelKey: 'customization.summon_respawn_delay' }),
  meterThreshold: Object.freeze({ min: 1, max: 20, step: 1, default: 4, labelKey: 'customization.summon_meter_threshold' }),
  meterPerBite: Object.freeze({ min: 1, max: 10, step: 1, default: 1, labelKey: 'customization.summon_meter_per_bite' }),
  packCooldown: Object.freeze({ min: 0, max: 30, step: 0.001, default: 8, labelKey: 'customization.summon_pack_cooldown' }),
  packSize: Object.freeze({ min: 1, max: 10, step: 1, default: 3, labelKey: 'customization.summon_pack_size' }),
  chargeDamage: Object.freeze({ min: 0, max: 50, step: 0.001, default: 5, labelKey: 'customization.summon_charge_damage' }),
  chargeSpeed: Object.freeze({ min: 100, max: 1500, step: 0.001, default: 720, labelKey: 'customization.summon_charge_speed' }),
  chargeLifetime: Object.freeze({ min: 0.1, max: 10, step: 0.001, default: 0.9, labelKey: 'customization.summon_charge_lifetime' })
});

// Fighter-specific controls live with the rest of the match schema so saved
// defaults, exports and the battle all use the same numbers.
export const GUARDIAN_ABILITY_CONTROLS = Object.freeze({
  durability: { min: 0, max: 200, step: 0.001, default: 40 },
  shieldFlashDuration: { min: 0, max: 2, step: 0.001, default: 0.15 },
  chargeSpeed: { min: 25, max: 2000, step: 0.001, default: 1150 },
  chargeDistance: { min: 0, max: 700, step: 0.001, default: 270 },
  chargeDamageFactor: { min: 0, max: 5, step: 0.001, default: 1 },
  throwSpeed: { min: 25, max: 1500, step: 0.001, default: 380 },
  returnSpeed: { min: 25, max: 1500, step: 0.001, default: 500 },
  headRadius: { min: 1, max: 100, step: 0.001, default: 24 },
  impactRadius: { min: 1, max: 200, step: 0.001, default: 44 },
  groundDuration: { min: 0, max: 20, step: 0.001, default: 5 },
  outboundDamageFactor: { min: 0, max: 5, step: 0.001, default: 1 },
  landingDamageFactor: { min: 0, max: 5, step: 0.001, default: 1 },
  returnDamageFactor: { min: 0, max: 5, step: 0.001, default: 1 },
  contactDamage: { min: 0, max: 50, step: 0.001, default: 5 },
  chainWidth: { min: 1, max: 40, step: 0.001, default: 8 },
  windup: { min: 0.01, max: 3, step: 0.001, default: 0.22 },
  active: { min: 0.01, max: 3, step: 0.001, default: 0.18 },
  duration: { min: 0.02, max: 5, step: 0.001, default: 0.68 },
  equipmentScale: { min: 0.25, max: 4, step: 0.001, default: 1.5 }
});
export const GUARDIAN_ABILITY_SWITCHES = Object.freeze({
  chargeEnabled: true, flailEnabled: true, autoSwitch: true,
  outboundEnabled: true, landingEnabled: true, returnEnabled: true,
  contactEnabled: true, chainBlocking: true
});
export const STAR_ABILITY_CONTROLS = Object.freeze({
  stackDuration: { min: 0.1, max: 20, step: 0.001, default: 2 },
  hastePerStack: { min: 0, max: 10, step: 0.001, default: 2 },
  starsPerAttack: { min: 0, max: 10, step: 1, default: 1 },
  rearSpreadDegrees: { min: 0, max: 89, step: 0.001, default: 180 / 7 },
  orbitRadiusMin: { min: 0.1, max: 5, step: 0.001, default: 1.15 },
  orbitRadiusMax: { min: 0.1, max: 5, step: 0.001, default: 1.45 },
  initialSpeedFactor: { min: 0.01, max: 5, step: 0.001, default: 0.2 },
  accelerationFactor: { min: 0.01, max: 10, step: 0.001, default: 2.4 },
  lifetime: { min: 0.1, max: 20, step: 0.001, default: 5 },
  radius: { min: 1, max: 60, step: 0.001, default: 7 },
  windup: { min: 0.01, max: 3, step: 0.001, default: 0.28 },
  duration: { min: 0.02, max: 5, step: 0.001, default: 0.76 },
  visualScale: { min: 0.25, max: 4, step: 0.001, default: 1 }
});
export const STAR_ABILITY_SWITCHES = Object.freeze({ enemyAttack: true, enemyHurt: true, enemyHit: true });

export const ARENA_CONTROLS = Object.freeze({
  fighterCount: Object.freeze({ min: 2, max: 4, step: 1, default: 2, labelKey: 'customization.fighter_count' }),
  size: Object.freeze({ min: 600, max: 1600, step: 0.001, default: 1000, labelKey: 'customization.arena_size' }),
  fighterSize: Object.freeze({ min: 60, max: 160, step: 0.001, default: 100, labelKey: 'customization.fighter_size' }),
  timeScale: Object.freeze({ min: 0.5, max: 2, step: 0.001, default: 1, labelKey: 'customization.time_scale' }),
  startingDistance: Object.freeze({ min: 60, max: 1540, step: 0.001, default: 500, labelKey: 'customization.starting_distance' }),
  // Each weapon retains its own projectile speed; this only scales those speeds for the arena.
  projectileSpeedScale: Object.freeze({ min: 0.5, max: 2, step: 0.001, default: 1, labelKey: 'customization.projectile_speed_multiplier' }),
  launchDelay: Object.freeze({ min: 0, max: 5, step: 0.001, default: 2, labelKey: 'customization.launch_delay' }),
  controlDurationScale: Object.freeze({ min: 0.5, max: 2, step: 0.001, default: 1, labelKey: 'customization.control_duration' }),
  contactStopDuration: Object.freeze({ min: 0, max: 5, step: 0.001, default: 0.5, labelKey: 'customization.contact_stop_duration' })
});

export function asModes(value) {
  return Array.isArray(value) ? [...value] : [value];
}

export function defaultFighterSettings(character) {
  const settings = {
    health: character.stats.health,
    attack: asModes(character.stats.attack),
    attackCD: asModes(character.stats.attackCD),
    movementSpeed: character.stats.speed * MOVEMENT_UNITS_PER_STAT
  };
  if (WEAPON_DEFINITIONS[character.id]?.type === 'ranged') settings.projectileSpeed = WEAPON_DEFINITIONS[character.id].projectileSpeed;
  if (WEAPON_DEFINITIONS[character.id]?.type === 'melee') settings.attackRange = WEAPON_DEFINITIONS[character.id].length;
  if (TRAIT_CONTROLS[character.trait?.id]) settings.trait = defaultTraitSettings(character);
  if (character.trait?.id === 'elemental-cycles') settings.abilities = defaultMageAbilities();
  if (character.trait?.id === 'prayer') settings.abilities = defaultPriestAbilities();
  if (character.trait?.id === 'beastmaster') settings.abilities = defaultSummonAbilities();
  if (character.id === 'guardian') settings.abilities = defaultGuardianAbilities();
  if (character.id === 'dongfang-changfan') settings.abilities = defaultStarAbilities();
  return settings;
}

export function defaultTraitSettings(character) {
  const controls = TRAIT_CONTROLS[character.trait?.id];
  if (!controls) return undefined;
  return Object.fromEntries(Object.entries(controls).map(([key, control]) => [key, character.trait[key] ?? control.default]));
}

export function defaultMageAbilities() {
  return {
    cycles: Object.fromEntries(MAGE_CYCLES.map(cycle => [cycle, MAGE_SPELL_SLOTS.map((slot, index) => ({
      damage: [3, 2, 5][index], cooldown: [1.6, 1.9, 2.5][index]
    }))])),
    effects: Object.fromEntries(Object.entries(MAGE_ABILITY_CONTROLS).map(([key, control]) => [key, control.default]))
  };
}

export function defaultPriestAbilities() {
  return Object.fromEntries(Object.entries(PRIEST_ABILITY_CONTROLS).map(([key, control]) => [key, control.default]));
}

export function defaultSummonAbilities() {
  return Object.fromEntries(Object.entries(SUMMON_ABILITY_CONTROLS).map(([key, control]) => [key, control.default]));
}

export function defaultGuardianAbilities() {
  return { ...Object.fromEntries(Object.entries(GUARDIAN_ABILITY_CONTROLS).map(([key, control]) => [key, control.default])),
    ...GUARDIAN_ABILITY_SWITCHES, startingMode: 'charge' };
}

export function defaultStarAbilities() {
  return { ...Object.fromEntries(Object.entries(STAR_ABILITY_CONTROLS).map(([key, control]) => [key, control.default])),
    ...STAR_ABILITY_SWITCHES };
}

export function defaultArenaSettings() {
  return Object.fromEntries(Object.entries(ARENA_CONTROLS).map(([key, control]) => [key, control.default]));
}
