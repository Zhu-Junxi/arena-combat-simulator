export const BATTLE_RULES = Object.freeze({
  size: 1000,
  fighterSize: 100,
  speed: 220,
  startingDistance: 500,
  projectileSpeedScale: 1,
  controlDurationScale: 1,
  timeScale: 1,
  collisionMode: 'bounce',
  launchDelay: 2000,
  step: 1 / 120
});

export const MOTION = Object.freeze({
  dockDuration: 1050,
  panelDuration: 1300,
  easing: 'cubic-bezier(.65, 0, .85, .35)'
});
