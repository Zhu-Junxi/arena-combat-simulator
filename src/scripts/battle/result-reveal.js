export function clearResultReveal(arena) {
  delete arena.dataset.result;
}

export function showResultReveal(arena, winner) {
  arena.dataset.result = winner?.side ?? 'draw';
}
