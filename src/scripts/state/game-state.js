export function createGameState(characters) {
  return {
    side: 'left',
    category: '基础',
    left: characters[0],
    right: characters[1],
    phase: 'select'
  };
}
