export function createSelectionController({ state, characterById, elements, view }) {
  function scrollCategories(direction) {
    if (state.phase !== 'select') return;
    elements.categories.scrollBy({
      top: direction * Math.max(92, elements.categories.clientHeight * 0.75),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
    });
  }

  function bind() {
    elements.categories.addEventListener('scroll', view.updateCategoryScrollButtons, { passive: true });
    window.addEventListener('resize', view.updateCategoryScrollButtons);
    elements['categories-up'].addEventListener('click', () => scrollCategories(-1));
    elements['categories-down'].addEventListener('click', () => scrollCategories(1));
    elements.categories.addEventListener('keydown', event => {
      if (state.phase !== 'select' || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      const buttons = [...elements.categories.querySelectorAll('button')];
      const current = buttons.indexOf(event.target);
      if (current < 0) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
        Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)));
      buttons[next].focus({ preventScroll: true });
      buttons[next].scrollIntoView({ block: 'nearest', inline: 'nearest' });
      buttons[next].click();
    });
    elements.stage.addEventListener('click', event => {
      if (state.phase !== 'select') return;
      const side = event.target.closest('[data-side]');
      const category = event.target.closest('[data-category]');
      const character = event.target.closest('[data-character]');
      if (side) {
        state.side = side.dataset.side;
        view.renderPanel('left');
        view.renderPanel('right');
        view.syncSelection();
        elements[`panel-${state.side}`].querySelector('.avatar').focus({ preventScroll: true });
        elements.status.textContent = `正在为${state.side === 'left' ? '左方' : '右方'}选角，请点击下方头像`;
      }
      if (category) {
        state.category = category.dataset.category;
        view.renderRoster();
        elements.status.textContent = `当前分类：${state.category} · ${view.visibleCharacters().length} 个角色`;
      }
      if (character) {
        state[state.side] = characterById[character.dataset.character];
        view.renderPanel(state.side);
        view.syncSelection();
        elements.status.textContent = `${state.side === 'left' ? '左方' : '右方'}已选择 ${state[state.side].name}`;
      }
    });
  }

  return { bind, scrollCategories };
}
