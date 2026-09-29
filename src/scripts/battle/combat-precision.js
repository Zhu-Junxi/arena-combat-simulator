export const COMBAT_RESOLUTION = 0.001;
const COMBAT_SCALE = 1 / COMBAT_RESOLUTION;

// Combat resources are rounded at each application boundary. Time, movement,
// and rates retain their full precision until they produce an HP change.
export function roundCombat(value) {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e12) return value;
  return Math.round(value * COMBAT_SCALE) / COMBAT_SCALE;
}

export function formatCombat(value) {
  return String(roundCombat(Math.max(0, value)));
}

export function removeCombatHealth(target, amount, elapsed = 0) {
  const current = roundCombat(Math.max(0, target.health));
  const dealt = Math.min(current, roundCombat(Math.max(0, amount)));
  target.health = roundCombat(current - dealt);
  if (dealt > 0) target.hitUntil = elapsed + 0.12;
  return dealt;
}

export function restoreCombatHealth(target, amount) {
  const current = roundCombat(Math.max(0, target.health));
  const maximum = roundCombat(Math.max(0, target.maxHealth));
  const healed = Math.max(0, Math.min(roundCombat(Math.max(0, amount)), roundCombat(maximum - current)));
  target.health = roundCombat(current + healed);
  return healed;
}
