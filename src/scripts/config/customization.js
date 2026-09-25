export const MATCH_SETTINGS_STORAGE_KEY = 'arena-duel.match-settings.v1';
export const MATCH_SETTINGS_VERSION = 1;
export const MOVEMENT_UNITS_PER_STAT = 44;
export const COLLISION_MODES = Object.freeze(['bounce', 'stop', 'pass']);

export const FIGHTER_CONTROLS = Object.freeze({
  health: Object.freeze({ min: 25, max: 300, step: 5, labelKey: 'customization.health' }),
  attack: Object.freeze({ min: 1, max: 50, step: 1, labelKey: 'customization.attack' }),
  attackCD: Object.freeze({ min: 0.25, max: 10, step: 0.25, labelKey: 'customization.cooldown' }),
  movementSpeed: Object.freeze({ min: 25, max: 440, step: 1, labelKey: 'customization.movement_speed' })
});

export const ARENA_CONTROLS = Object.freeze({
  size: Object.freeze({ min: 600, max: 1600, step: 50, default: 1000, labelKey: 'customization.arena_size' }),
  fighterSize: Object.freeze({ min: 60, max: 160, step: 10, default: 100, labelKey: 'customization.fighter_size' }),
  timeScale: Object.freeze({ min: 0.5, max: 2, step: 0.1, default: 1, labelKey: 'customization.time_scale' }),
  startingDistance: Object.freeze({ min: 60, max: 1540, step: 10, default: 500, labelKey: 'customization.starting_distance' }),
  projectileSpeedScale: Object.freeze({ min: 0.5, max: 2, step: 0.1, default: 1, labelKey: 'customization.projectile_speed' }),
  launchDelay: Object.freeze({ min: 0, max: 5, step: 0.5, default: 2, labelKey: 'customization.launch_delay' }),
  controlDurationScale: Object.freeze({ min: 0.5, max: 2, step: 0.1, default: 1, labelKey: 'customization.control_duration' })
});

export function asModes(value) {
  return Array.isArray(value) ? [...value] : [value];
}

export function defaultFighterSettings(character) {
  return {
    health: character.stats.health,
    attack: asModes(character.stats.attack),
    attackCD: asModes(character.stats.attackCD),
    movementSpeed: character.stats.speed * MOVEMENT_UNITS_PER_STAT
  };
}

export function defaultArenaSettings() {
  return Object.fromEntries(Object.entries(ARENA_CONTROLS).map(([key, control]) => [key, control.default]));
}
