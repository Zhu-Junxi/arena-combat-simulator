// Stable identifiers are deliberately independent from a character choice.  This
// makes duplicate characters and saved per-seat tuning unambiguous.
export const FIGHTER_SLOTS = Object.freeze(['left', 'right', 'third', 'fourth']);
export const TARGET_STRATEGIES = Object.freeze(['nearest', 'lock', 'random']);

export function activeSlots(count = 2) {
  return FIGHTER_SLOTS.slice(0, Math.max(2, Math.min(FIGHTER_SLOTS.length, Number(count) || 2)));
}
