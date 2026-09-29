import { defaultStarAbilities } from '../config/customization.js';

export const STAR_PASSIVE_SOURCES = Object.freeze(['enemy-attack', 'enemy-hurt', 'enemy-hit']);
const DURATION = 2;
const HASTE_PER_STACK = 2;

export function grantStarPassive(fighter, source, now) {
  if (fighter.trait?.id !== 'myriad-star-fireflies' || fighter.health <= 0 || !STAR_PASSIVE_SOURCES.includes(source)) return false;
  const abilities = fighter.starAbilities ?? defaultStarAbilities();
  const switchKey = { 'enemy-attack': 'enemyAttack', 'enemy-hurt': 'enemyHurt', 'enemy-hit': 'enemyHit' }[source];
  if (!abilities[switchKey]) return false;
  // Each source must expire before it can trigger again; repeat events never refresh it.
  if ((fighter.starPassive[source] ?? 0) > now + 1e-9) return false;
  fighter.starPassive[source] = now + Math.max(0.001, abilities.stackDuration ?? DURATION);
  return true;
}

export function activeStarPassives(fighter, now) {
  return STAR_PASSIVE_SOURCES.filter(source => (fighter.starPassive?.[source] ?? 0) > now + 1e-9);
}

export function starAttackSpeed(fighter, now) {
  return 1 + Math.max(0, Math.min(1000, fighter.starAbilities?.hastePerStack ?? HASTE_PER_STACK)) * activeStarPassives(fighter, now).length;
}

// Integrate only the part of this step where each stack is still active.
export function starCooldownAdvance(fighter, from, seconds) {
  return seconds + STAR_PASSIVE_SOURCES.reduce((bonus, source) =>
    bonus + Math.max(0, Math.min(1000, fighter.starAbilities?.hastePerStack ?? HASTE_PER_STACK)) * Math.max(0, Math.min(seconds, (fighter.starPassive?.[source] ?? 0) - from)), 0);
}
