export function createSelectionController({ state, characterById, elements, view, i18n, onSelectionChange = () => {} }) {
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
        onSelectionChange(state.side);
        elements[`panel-${state.side}`].querySelector('.avatar').focus({ preventScroll: true });
        elements.status.textContent = i18n.t('status.selecting', { side: view.sideName(state.side) });
      }
      if (category) {
        state.category = category.dataset.category;
        view.renderRoster();
        onSelectionChange();
        elements.status.textContent = i18n.t('status.category', {
          category: view.categoryName(state.category),
          count: view.visibleCharacters().length
        });
      }
      if (character) {
        state[state.side] = characterById[character.dataset.character];
        view.renderPanel(state.side);
        view.syncSelection();
        onSelectionChange(state.side);
        elements.status.textContent = i18n.t('status.selected', {
          side: view.sideName(state.side),
          name: view.characterName(state[state.side])
        });
      }
    });
  }

  return { bind, scrollCategories };
}
