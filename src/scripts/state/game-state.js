export function createGameState(characters) {
  return {
    side: 'left',
    category: 'base',
    left: characters[0],
    right: characters[1],
    third: characters[2] ?? characters[0],
    fourth: characters[3] ?? characters[1],
    phase: 'select'
  };
}
