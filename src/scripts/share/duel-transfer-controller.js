import { activeSlots } from '../config/match.js';

export function applyImportedDuel({ recipe, settings, state, characterById }) {
  const slots = activeSlots(recipe.arena.fighterCount);
  for (const side of slots) if (!characterById[recipe.fighters[side].characterId]) throw new Error('Unknown imported fighter');
  settings.applyDuel(recipe);
  for (const side of slots) state[side] = characterById[recipe.fighters[side].characterId];
  state.side = 'left';
}
