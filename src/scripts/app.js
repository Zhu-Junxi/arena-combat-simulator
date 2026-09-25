import { CHARACTER_BY_ID, CHARACTER_CATEGORIES, CHARACTERS } from './config/characters.js';
import { createCombatEngine } from './battle/combat-engine.js';
import { createBattleRuntime, createCombatRenderer } from './battle/combat-renderer.js';
import { createSelectionController } from './selection/selection-controller.js';
import { createSelectionView } from './selection/selection-view.js';
import { createGameState } from './state/game-state.js';
import { requireElements } from './ui/dom.js';
import { createTransitions } from './ui/transitions.js';

const elements = requireElements([
  'arena', 'back', 'battlefield', 'battle-note', 'categories', 'categories-down', 'categories-up',
  'countdown', 'dock', 'fighter-left', 'fighter-right', 'panel-left', 'panel-right',
  'projectile-effects', 'roster', 'selection-label', 'stage', 'start', 'start-control', 'status',
  'view-label', 'weapon-effects'
]);

const state = createGameState(CHARACTERS);
const panels = [elements['panel-left'], elements['panel-right']];
const renderer = createCombatRenderer(elements);
const engine = createCombatEngine({ onEvent: renderer.handleEvent });
const runtime = createBattleRuntime({
  engine,
  renderer,
  elements,
  getAppPhase: () => state.phase
});
const selectionView = createSelectionView({
  state,
  characters: CHARACTERS,
  categories: CHARACTER_CATEGORIES,
  elements
});
const selectionController = createSelectionController({
  state,
  characterById: CHARACTER_BY_ID,
  elements,
  view: selectionView
});
const transitions = createTransitions({
  state,
  elements,
  panels,
  beginBattle: runtime.begin,
  resetBattle: () => {
    runtime.stop();
    engine.reset({ left: state.left, right: state.right });
  }
});

selectionView.render();
selectionController.bind();
transitions.bind();
engine.reset({ left: state.left, right: state.right });
