export function createGameState(characters) {
  return {
    side: 'left',
    category: 'base',
    left: characters[0],
    right: characters[1],
    phase: 'select'
  };
}
