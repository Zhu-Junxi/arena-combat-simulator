import { CHARACTER_BY_ID } from './characters.js';
import { readProjectJson } from '../data/project-files.js';

const clone = value => JSON.parse(JSON.stringify(value));
const arenaData = await readProjectJson('settings/factory-arena.json');
if (arenaData.format !== 'arena-duel.arena-default' || arenaData.version !== 1) throw new Error('Invalid factory arena data');

export const MATCH_SETTINGS_STORAGE_KEY = 'arena-duel.match-settings.v1';
export const MATCH_SETTINGS_VERSION = 5;
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
    reduction: Object.freeze({ min: 0, max: 20, step: 0.001, default: CHARACTER_BY_ID.warrior.defaultSettings.trait.reduction, labelKey: 'customization.plate_reduction' })
  }),
  vine: Object.freeze({
    every: Object.freeze({ min: 1, max: 10, step: 1, default: CHARACTER_BY_ID.archer.defaultSettings.trait.every, labelKey: 'customization.vine_every' }),
    rootDuration: Object.freeze({ min: 0, max: 5, step: 0.001, default: CHARACTER_BY_ID.archer.defaultSettings.trait.rootDuration, labelKey: 'customization.vine_root_duration' }),
    slowDuration: Object.freeze({ min: 0, max: 5, step: 0.001, default: CHARACTER_BY_ID.archer.defaultSettings.trait.slowDuration, labelKey: 'customization.vine_slow_duration' }),
    slowFactor: Object.freeze({ min: 0.1, max: 1, step: 0.0001, default: CHARACTER_BY_ID.archer.defaultSettings.trait.slowFactor, labelKey: 'customization.vine_slow_factor' })
  })
});

export const MAGE_CYCLES = Object.freeze(['ice', 'fire', 'leech']);
export const MAGE_SPELL_SLOTS = Object.freeze(['normal', 'theme', 'final']);
export const MAGE_ABILITY_CONTROLS = Object.freeze({
  markDuration: Object.freeze({ min: 1, max: 10, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.markDuration, labelKey: 'customization.mage_mark_duration' }),
  maxMarks: Object.freeze({ min: 1, max: 4, step: 1, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.maxMarks, labelKey: 'customization.mage_max_marks' }),
  damagePerMark: Object.freeze({ min: 0, max: 10, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.damagePerMark, labelKey: 'customization.mage_damage_per_mark' }),
  iceSlowFactor: Object.freeze({ min: 0.25, max: 0.9, step: 0.0001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.iceSlowFactor, labelKey: 'customization.mage_ice_slow' }),
  iceSlowDuration: Object.freeze({ min: 0, max: 5, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.iceSlowDuration, labelKey: 'customization.mage_ice_slow_duration' }),
  iceFreezeBase: Object.freeze({ min: 0, max: 3, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.iceFreezeBase, labelKey: 'customization.mage_ice_freeze_base' }),
  iceFreezePerMark: Object.freeze({ min: 0, max: 3, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.iceFreezePerMark, labelKey: 'customization.mage_ice_freeze_per_mark' }),
  iceBurstDamage: Object.freeze({ min: 0, max: 20, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.iceBurstDamage, labelKey: 'customization.mage_ice_burst_damage' }),
  iceBurstRadius: Object.freeze({ min: 0, max: 300, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.iceBurstRadius, labelKey: 'customization.mage_ice_burst_radius' }),
  fireBurnDamage: Object.freeze({ min: 0, max: 10, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.fireBurnDamage, labelKey: 'customization.mage_fire_burn_damage' }),
  fireBurnDuration: Object.freeze({ min: 0, max: 8, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.fireBurnDuration, labelKey: 'customization.mage_fire_burn_duration' }),
  fireExplosionRadius: Object.freeze({ min: 0, max: 300, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.fireExplosionRadius, labelKey: 'customization.mage_fire_explosion_radius' }),
  fireMaxBurnDamage: Object.freeze({ min: 0, max: 10, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.fireMaxBurnDamage, labelKey: 'customization.mage_fire_max_burn_damage' }),
  fireMaxBurnDuration: Object.freeze({ min: 0, max: 8, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.fireMaxBurnDuration, labelKey: 'customization.mage_fire_max_burn_duration' }),
  leechBleedDamage: Object.freeze({ min: 0, max: 10, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.leechBleedDamage, labelKey: 'customization.mage_leech_bleed_damage' }),
  leechBleedDuration: Object.freeze({ min: 0, max: 8, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.leechBleedDuration, labelKey: 'customization.mage_leech_bleed_duration' }),
  leechHealBase: Object.freeze({ min: 0, max: 20, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.leechHealBase, labelKey: 'customization.mage_leech_heal_base' }),
  leechHealPerMark: Object.freeze({ min: 0, max: 20, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.leechHealPerMark, labelKey: 'customization.mage_leech_heal_per_mark' }),
  leechMaxBleedDamage: Object.freeze({ min: 0, max: 10, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.leechMaxBleedDamage, labelKey: 'customization.mage_leech_max_bleed_damage' }),
  leechMaxBleedDuration: Object.freeze({ min: 0, max: 8, step: 0.001, default: CHARACTER_BY_ID.mage.defaultSettings.abilities.effects.leechMaxBleedDuration, labelKey: 'customization.mage_leech_max_bleed_duration' })
});

export const PRIEST_ABILITY_CONTROLS = Object.freeze({
  markCooldown: Object.freeze({ min: 0.25, max: 10, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.markCooldown, labelKey: 'customization.priest_mark_cooldown' }),
  prayerCooldown: Object.freeze({ min: 0.5, max: 20, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.prayerCooldown, labelKey: 'customization.priest_prayer_cooldown' }),
  prayerDuration: Object.freeze({ min: 0.25, max: 10, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.prayerDuration, labelKey: 'customization.priest_prayer_duration' }),
  prayerMoveFactor: Object.freeze({ min: 0.1, max: 1, step: 0.0001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.prayerMoveFactor, labelKey: 'customization.priest_prayer_move_factor' }),
  interruptLockout: Object.freeze({ min: 0, max: 10, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.interruptLockout, labelKey: 'customization.priest_interrupt_lockout' }),
  decayFloor: Object.freeze({ min: 0, max: 20, step: 1, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.decayFloor, labelKey: 'customization.priest_decay_floor' }),
  decayInterval: Object.freeze({ min: 0.25, max: 20, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.decayInterval, labelKey: 'customization.priest_decay_interval' }),
  decayAmount: Object.freeze({ min: 1, max: 20, step: 1, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.decayAmount, labelKey: 'customization.priest_decay_amount' }),
  markMoveSlowPerMark: Object.freeze({ min: 0, max: 0.25, step: 0.0001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.markMoveSlowPerMark, labelKey: 'customization.priest_mark_move_slow' }),
  markAttackSlowPerMark: Object.freeze({ min: 0, max: 0.25, step: 0.0001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.markAttackSlowPerMark, labelKey: 'customization.priest_mark_attack_slow' }),
  baseHeal: Object.freeze({ min: 0, max: 50, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.baseHeal, labelKey: 'customization.priest_base_heal' }),
  healPerMark: Object.freeze({ min: 0, max: 20, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.healPerMark, labelKey: 'customization.priest_heal_per_mark' }),
  baseDamage: Object.freeze({ min: 0, max: 50, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.baseDamage, labelKey: 'customization.priest_base_damage' }),
  damagePerMark: Object.freeze({ min: 0, max: 20, step: 0.001, default: CHARACTER_BY_ID.priest.defaultSettings.abilities.damagePerMark, labelKey: 'customization.priest_damage_per_mark' })
});

export const SUMMON_ABILITY_CONTROLS = Object.freeze({
  companionHealth: Object.freeze({ min: 0.001, max: 200, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.companionHealth, labelKey: 'customization.summon_companion_health' }),
  companionSpeed: Object.freeze({ min: 25, max: 600, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.companionSpeed, labelKey: 'customization.summon_companion_speed' }),
  biteDamage: Object.freeze({ min: 0, max: 50, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.biteDamage, labelKey: 'customization.summon_bite_damage' }),
  biteRange: Object.freeze({ min: 10, max: 300, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.biteRange, labelKey: 'customization.summon_bite_range' }),
  biteCooldown: Object.freeze({ min: 0.1, max: 10, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.biteCooldown, labelKey: 'customization.summon_bite_cooldown' }),
  respawnDelay: Object.freeze({ min: 0, max: 20, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.respawnDelay, labelKey: 'customization.summon_respawn_delay' }),
  meterThreshold: Object.freeze({ min: 1, max: 20, step: 1, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.meterThreshold, labelKey: 'customization.summon_meter_threshold' }),
  meterPerBite: Object.freeze({ min: 1, max: 10, step: 1, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.meterPerBite, labelKey: 'customization.summon_meter_per_bite' }),
  packCooldown: Object.freeze({ min: 0, max: 30, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.packCooldown, labelKey: 'customization.summon_pack_cooldown' }),
  packSize: Object.freeze({ min: 1, max: 10, step: 1, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.packSize, labelKey: 'customization.summon_pack_size' }),
  chargeDamage: Object.freeze({ min: 0, max: 50, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.chargeDamage, labelKey: 'customization.summon_charge_damage' }),
  chargeSpeed: Object.freeze({ min: 100, max: 1500, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.chargeSpeed, labelKey: 'customization.summon_charge_speed' }),
  chargeLifetime: Object.freeze({ min: 0.1, max: 10, step: 0.001, default: CHARACTER_BY_ID.beastmaster.defaultSettings.abilities.chargeLifetime, labelKey: 'customization.summon_charge_lifetime' })
});

// Only controls that change combat belong here. Defaults stay tied to the
// weapon definition so old saved settings retain the original weapon behavior.
export const WEAPON_TUNING_CONTROLS = Object.freeze({
  war: Object.freeze({
    width: Object.freeze({ min: 4, max: 80, step: 0.001, default: CHARACTER_BY_ID.war.defaultSettings.weapon.width, labelKey: 'customization.war_blade_width' })
  }),
  warrior: Object.freeze({
    width: Object.freeze({ min: 4, max: 50, step: 0.001, default: CHARACTER_BY_ID.warrior.defaultSettings.weapon.width, labelKey: 'customization.sword_width' }),
    active: Object.freeze({ min: 0.05, max: 0.5, step: 0.001, default: CHARACTER_BY_ID.warrior.defaultSettings.weapon.active, labelKey: 'customization.sword_active' })
  }),
  archer: Object.freeze({
    radius: Object.freeze({ min: 1, max: 25, step: 0.001, default: CHARACTER_BY_ID.archer.defaultSettings.weapon.radius, labelKey: 'customization.arrow_radius' }),
    windup: Object.freeze({ min: 0.05, max: 0.6, step: 0.001, default: CHARACTER_BY_ID.archer.defaultSettings.weapon.windup, labelKey: 'customization.arrow_windup' })
  })
});

export const WAR_ABILITY_CONTROLS = Object.freeze({
  chargeDistance: Object.freeze({ min: 1, max: 1200, step: 0.001, default: CHARACTER_BY_ID.war.defaultSettings.abilities.chargeDistance, labelKey: 'customization.war_charge_distance' }),
  speedMultiplier: Object.freeze({ min: 0.25, max: 8, step: 0.001, default: CHARACTER_BY_ID.war.defaultSettings.abilities.speedMultiplier, labelKey: 'customization.war_speed_multiplier' }),
  swingDuration: Object.freeze({ min: 0.005, max: 0.3, step: 0.001, default: CHARACTER_BY_ID.war.defaultSettings.abilities.swingDuration, labelKey: 'customization.war_swing_duration' }),
  recovery: Object.freeze({ min: 0.01, max: 1, step: 0.001, default: CHARACTER_BY_ID.war.defaultSettings.abilities.recovery, labelKey: 'customization.war_recovery' }),
  knockbackDistance: Object.freeze({ min: 0, max: 500, step: 0.001, default: CHARACTER_BY_ID.war.defaultSettings.abilities.knockbackDistance, labelKey: 'customization.war_knockback_distance' }),
  knockbackDuration: Object.freeze({ min: 0.01, max: 1, step: 0.001, default: CHARACTER_BY_ID.war.defaultSettings.abilities.knockbackDuration, labelKey: 'customization.war_knockback_duration' })
});

// Fighter-specific controls live with the rest of the match schema so saved
// defaults, exports and the battle all use the same numbers.
export const GUARDIAN_ABILITY_CONTROLS = Object.freeze({
  durability: { min: 0, max: 200, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.durability},
  shieldFlashDuration: { min: 0, max: 2, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.shieldFlashDuration},
  chargeSpeed: { min: 25, max: 2000, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.chargeSpeed},
  chargeDistance: { min: 0, max: 700, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.chargeDistance},
  chargeDamageFactor: { min: 0, max: 5, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.chargeDamageFactor},
  throwSpeed: { min: 25, max: 1500, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.throwSpeed},
  returnSpeed: { min: 25, max: 1500, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.returnSpeed},
  headRadius: { min: 1, max: 100, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.headRadius},
  impactRadius: { min: 1, max: 200, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.impactRadius},
  groundDuration: { min: 0, max: 20, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.groundDuration},
  outboundDamageFactor: { min: 0, max: 5, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.outboundDamageFactor},
  landingDamageFactor: { min: 0, max: 5, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.landingDamageFactor},
  returnDamageFactor: { min: 0, max: 5, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.returnDamageFactor},
  contactDamage: { min: 0, max: 50, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.contactDamage},
  chainWidth: { min: 1, max: 40, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.chainWidth},
  windup: { min: 0.01, max: 3, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.windup},
  active: { min: 0.01, max: 3, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.active},
  duration: { min: 0.02, max: 5, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.duration},
  equipmentScale: { min: 0.25, max: 4, step: 0.001, default: CHARACTER_BY_ID.guardian.defaultSettings.abilities.equipmentScale}
});
export const GUARDIAN_ABILITY_SWITCHES = Object.freeze(Object.fromEntries([
  'chargeEnabled', 'flailEnabled', 'autoSwitch', 'outboundEnabled', 'landingEnabled',
  'returnEnabled', 'contactEnabled', 'chainBlocking'
].map(key => [key, CHARACTER_BY_ID.guardian.defaultSettings.abilities[key]])));
export const STAR_ABILITY_CONTROLS = Object.freeze({
  stackDuration: { min: 0.1, max: 20, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.stackDuration},
  hastePerStack: { min: 0, max: 10, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.hastePerStack},
  starsPerAttack: { min: 0, max: 10, step: 1, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.starsPerAttack},
  rearSpreadDegrees: { min: 0, max: 89, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.rearSpreadDegrees},
  orbitRadiusMin: { min: 0.1, max: 5, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.orbitRadiusMin},
  orbitRadiusMax: { min: 0.1, max: 5, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.orbitRadiusMax},
  initialSpeedFactor: { min: 0.01, max: 5, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.initialSpeedFactor},
  accelerationFactor: { min: 0.01, max: 10, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.accelerationFactor},
  lifetime: { min: 0.1, max: 20, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.lifetime},
  radius: { min: 1, max: 60, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.radius},
  windup: { min: 0.01, max: 3, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.windup},
  duration: { min: 0.02, max: 5, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.duration},
  visualScale: { min: 0.25, max: 4, step: 0.001, default: CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities.visualScale}
});
export const STAR_ABILITY_SWITCHES = Object.freeze(Object.fromEntries([
  'enemyAttack', 'enemyHurt', 'enemyHit'
].map(key => [key, CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities[key]])));

export const ARENA_CONTROLS = Object.freeze({
  fighterCount: Object.freeze({ min: 2, max: 4, step: 1, default: arenaData.arena.fighterCount, labelKey: 'customization.fighter_count' }),
  size: Object.freeze({ min: 600, max: 1600, step: 0.001, default: arenaData.arena.size, labelKey: 'customization.arena_size' }),
  fighterSize: Object.freeze({ min: 60, max: 160, step: 0.001, default: arenaData.arena.fighterSize, labelKey: 'customization.fighter_size' }),
  timeScale: Object.freeze({ min: 0.5, max: 2, step: 0.001, default: arenaData.arena.timeScale, labelKey: 'customization.time_scale' }),
  startingDistance: Object.freeze({ min: 60, max: 1540, step: 0.001, default: arenaData.arena.startingDistance, labelKey: 'customization.starting_distance' }),
  // Each weapon retains its own projectile speed; this only scales those speeds for the arena.
  projectileSpeedScale: Object.freeze({ min: 0.5, max: 2, step: 0.001, default: arenaData.arena.projectileSpeedScale, labelKey: 'customization.projectile_speed_multiplier' }),
  launchDelay: Object.freeze({ min: 0, max: 5, step: 0.001, default: arenaData.arena.launchDelay, labelKey: 'customization.launch_delay' }),
  controlDurationScale: Object.freeze({ min: 0.5, max: 2, step: 0.001, default: arenaData.arena.controlDurationScale, labelKey: 'customization.control_duration' }),
  contactStopDuration: Object.freeze({ min: 0, max: 5, step: 0.001, default: arenaData.arena.contactStopDuration, labelKey: 'customization.contact_stop_duration' })
});

export function asModes(value) {
  return Array.isArray(value) ? [...value] : [value];
}

export function defaultFighterSettings(character) {
  if (character.locked) return { health: character.stats.health, attack: asModes(character.stats.attack),
    attackCD: asModes(character.stats.attackCD), movementSpeed: character.stats.speed * MOVEMENT_UNITS_PER_STAT };
  if (!character.defaultSettings) throw new Error(`Missing factory settings for ${character.id}`);
  return clone(character.defaultSettings);
}

export function defaultTraitSettings(character) {
  return character.defaultSettings?.trait ? clone(character.defaultSettings.trait) : undefined;
}

export function defaultMageAbilities() {
  return clone(CHARACTER_BY_ID.mage.defaultSettings.abilities);
}

export function defaultPriestAbilities() {
  return clone(CHARACTER_BY_ID.priest.defaultSettings.abilities);
}

export function defaultSummonAbilities() {
  return clone(CHARACTER_BY_ID.beastmaster.defaultSettings.abilities);
}

export function defaultGuardianAbilities() {
  return clone(CHARACTER_BY_ID.guardian.defaultSettings.abilities);
}

export function defaultStarAbilities() {
  return clone(CHARACTER_BY_ID['dongfang-changfan'].defaultSettings.abilities);
}

export function defaultWarAbilities() {
  return clone(CHARACTER_BY_ID.war.defaultSettings.abilities);
}

export function defaultArenaSettings() {
  return clone(arenaData.arena);
}
