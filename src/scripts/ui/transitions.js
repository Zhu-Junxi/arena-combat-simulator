import { MOTION } from '../config/combat.js';

export function createTransitions({ state, elements, panels, beginBattle, resetBattle, collapseCustomization = () => {}, i18n }) {
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
    collapseCustomization();
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
    elements.status.textContent = i18n.t('status.select_prompt');
    elements['view-label'].textContent = i18n.t('view.selection');
    elements.start.focus({ preventScroll: true });
  }

  async function enterArena() {
    if (state.phase !== 'select') return;
    collapseCustomization();
    state.phase = 'lowering';
    elements.stage.dataset.phase = state.phase;
    elements.start.disabled = true;
    elements['start-control'].hidden = true;
    elements.dock.inert = true;
    panels.forEach(panel => { panel.inert = true; });
    resetBattle();
    const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    try {
      elements.status.textContent = i18n.t('transition.lowering');
      await slide(elements.dock, 'translateY(102%)', reduceMotion ? 120 : MOTION.dockDuration);
      state.phase = 'opening';
      elements.stage.dataset.phase = state.phase;
      elements.status.textContent = i18n.t('transition.opening');
      await Promise.all([
        slide(panels[0], 'translateX(-102%)', reduceMotion ? 120 : MOTION.panelDuration),
        slide(panels[1], 'translateX(102%)', reduceMotion ? 120 : MOTION.panelDuration)
      ]);
      state.phase = 'arena';
      elements.stage.dataset.phase = state.phase;
      elements.arena.inert = false;
      elements.arena.setAttribute('aria-hidden', 'false');
      beginBattle({ left: state.left, right: state.right });
      elements['view-label'].textContent = i18n.t('view.battle');
      elements.back.focus({ preventScroll: true });
    } catch (error) {
      resetSelection();
      elements.status.textContent = i18n.t('transition.reset');
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
      elements.status.textContent = i18n.t('transition.closing');
      await Promise.all([
        slide(panels[0], 'translateX(0)', reduceMotion ? 120 : MOTION.panelDuration, 'translateX(-102%)'),
        slide(panels[1], 'translateX(0)', reduceMotion ? 120 : MOTION.panelDuration, 'translateX(102%)')
      ]);
      state.phase = 'raising';
      elements.stage.dataset.phase = state.phase;
      elements.arena.setAttribute('aria-hidden', 'true');
      elements.status.textContent = i18n.t('transition.raising');
      await slide(elements.dock, 'translateY(0)', reduceMotion ? 120 : MOTION.dockDuration, 'translateY(102%)');
      resetSelection();
    } catch (error) {
      resetSelection();
      elements.status.textContent = i18n.t('transition.reset');
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

  function refreshLocalization() {
    const statusKeys = {
      select: 'status.select_prompt',
      lowering: 'transition.lowering',
      opening: 'transition.opening',
      closing: 'transition.closing',
      raising: 'transition.raising'
    };
    if (statusKeys[state.phase]) elements.status.textContent = i18n.t(statusKeys[state.phase]);
    elements['view-label'].textContent = i18n.t(state.phase === 'arena' ? 'view.battle' : 'view.selection');
  }

  return { bind, enterArena, returnToSelection, resetSelection, refreshLocalization };
}
