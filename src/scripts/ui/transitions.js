import { MOTION } from '../config/combat.js';

export function createTransitions({ state, elements, panels, beginBattle, resetBattle }) {
  const animations = [];

  async function slide(element, transform, duration, from = 'translate(0, 0)') {
    const animation = element.animate([{ transform: from }, { transform }], {
      duration,
      easing: MOTION.easing,
      fill: 'forwards'
    });
    animations.push(animation);
    await animation.finished;
  }

  function resetSelection() {
    resetBattle();
    animations.forEach(animation => animation.cancel());
    animations.length = 0;
    state.phase = 'select';
    elements.stage.dataset.phase = 'select';
    elements.arena.inert = true;
    elements.arena.setAttribute('aria-hidden', 'true');
    elements.dock.inert = false;
    panels.forEach(panel => { panel.inert = false; });
    elements['start-control'].hidden = false;
    elements.start.disabled = false;
    elements.back.disabled = false;
    elements.status.textContent = '选择角色后，点击开始战斗';
    elements['view-label'].textContent = '01 / 选角';
    elements.start.focus({ preventScroll: true });
  }

  async function enterArena() {
    if (state.phase !== 'select') return;
    state.phase = 'lowering';
    elements.stage.dataset.phase = state.phase;
    elements.start.disabled = true;
    elements['start-control'].hidden = true;
    elements.dock.inert = true;
    panels.forEach(panel => { panel.inert = true; });
    resetBattle();
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      elements.status.textContent = '选角横板下移中…';
      await slide(elements.dock, 'translateY(102%)', reduceMotion ? 120 : MOTION.dockDuration);
      state.phase = 'opening';
      elements.stage.dataset.phase = state.phase;
      elements.status.textContent = '角色竖板向两侧开启…';
      await Promise.all([
        slide(panels[0], 'translateX(-102%)', reduceMotion ? 120 : MOTION.panelDuration),
        slide(panels[1], 'translateX(102%)', reduceMotion ? 120 : MOTION.panelDuration)
      ]);
      state.phase = 'arena';
      elements.stage.dataset.phase = state.phase;
      elements.arena.inert = false;
      elements.arena.setAttribute('aria-hidden', 'false');
      beginBattle({ left: state.left, right: state.right });
      elements['view-label'].textContent = '02 / 战场';
      elements.back.focus({ preventScroll: true });
    } catch (error) {
      resetSelection();
      elements.status.textContent = '动画已重置，可以重新开始';
      console.error(error);
    }
  }

  async function returnToSelection() {
    if (state.phase !== 'arena') return;
    resetBattle();
    state.phase = 'closing';
    elements.stage.dataset.phase = state.phase;
    elements.back.disabled = true;
    elements.arena.inert = true;
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      elements.status.textContent = '角色竖板向中间合拢…';
      await Promise.all([
        slide(panels[0], 'translateX(0)', reduceMotion ? 120 : MOTION.panelDuration, 'translateX(-102%)'),
        slide(panels[1], 'translateX(0)', reduceMotion ? 120 : MOTION.panelDuration, 'translateX(102%)')
      ]);
      state.phase = 'raising';
      elements.stage.dataset.phase = state.phase;
      elements.arena.setAttribute('aria-hidden', 'true');
      elements.status.textContent = '选角横板上移中…';
      await slide(elements.dock, 'translateY(0)', reduceMotion ? 120 : MOTION.dockDuration, 'translateY(102%)');
      resetSelection();
    } catch (error) {
      resetSelection();
      elements.status.textContent = '动画已重置，可以重新开始';
      console.error(error);
    }
  }

  function bind() {
    elements.start.addEventListener('click', enterArena);
    elements.back.addEventListener('click', returnToSelection);
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && state.phase === 'arena') returnToSelection();
    });
  }

  return { bind, enterArena, returnToSelection, resetSelection };
}
