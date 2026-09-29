import { createDuelRecipe, parseDuelRecipe, stringifyDuelRecipe } from './duel-share-codec.js';
import { applyImportedDuel } from './duel-transfer-controller.js';
import { createBuiltinPresets, createDuelPresetLibrary, firstTwoFighterRecipe, normalizePresetName, uniquePresetName } from './duel-preset-library.js';

const append = (parent, tag, className, content) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (content != null) element.textContent = content;
  parent.appendChild(element);
  return element;
};

export function createDuelPresetController({ elements, state, settings, i18n, feedback, storage, characters, characterById, getSetup, onLoaded = () => {} }) {
  const builtins = createBuiltinPresets(characters);
  const library = createDuelPresetLibrary({ characters, storage });
  const dialog = elements['preset-dialog'];
  let filter = 'all';
  let editor = null;
  let confirmation = null;
  let closeTimer = null;
  const panelExits = new WeakMap();
  const t = (key, parameters) => i18n.t(key, parameters);
  const builtinName = item => t(item.nameKey);
  const allItems = () => [
    ...builtins.map(item => ({ ...item, name: builtinName(item) })),
    ...library.list().map(item => ({ ...item, builtIn: false }))
  ];
  const findItem = id => allItems().find(item => item.id === id);
  const reservedNames = () => builtins.map(builtinName);

  function setStatus(key, parameters, tone = 'success', anchor = null) {
    if (key) feedback.show({ key, parameters, tone, anchor, context: 'dialog' });
    else elements['preset-status'].textContent = '';
  }

  function hidePanels() {
    const focusWasInside = elements['preset-editor'].contains(document.activeElement) || elements['preset-confirm'].contains(document.activeElement);
    editor = null;
    confirmation = null;
    for (const panel of [elements['preset-editor'], elements['preset-confirm']]) {
      panelExits.get(panel)?.cancel();
      if (!panel.hidden && panel.animate && dialog.open && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        panel.inert = true;
        const exit = panel.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-5px)' }], { duration: 120, fill: 'forwards' });
        panelExits.set(panel, exit);
        exit.onfinish = () => { panel.hidden = true; exit.cancel(); panelExits.delete(panel); };
      } else panel.hidden = true;
    }
    if (focusWasInside && dialog.open) elements['preset-search'].focus();
  }

  function renderFilters() {
    const root = elements['preset-filters'];
    root.replaceChildren();
    for (const value of ['all', 'builtin', 'mine']) {
      const button = append(root, 'button', '', t(`preset.filter_${value}`));
      button.type = 'button';
      button.dataset.presetFilter = value;
      button.setAttribute('aria-pressed', String(filter === value));
    }
  }

  function renderTile(root, item) {
    const card = append(root, 'article', 'preset-tile');
    card.dataset.presetId = item.id;
    const count = item.recipe.arena.fighterCount;
    const icon = append(card, 'div', `preset-tile-icon${count > 2 ? ' preset-tile-icon-muted' : ''}`, count > 2 ? `${count}` : '⚔');
    icon.setAttribute('aria-hidden', 'true');
    const heading = append(card, 'div', 'preset-tile-heading');
    append(heading, 'span', 'preset-tile-kind', t(item.builtIn ? 'preset.builtin' : 'preset.mine'));
    append(heading, 'h3', '', item.name);
    const fighters = item.recipe.fighters;
    const left = characterById[fighters.left.characterId];
    const right = characterById[fighters.right.characterId];
    append(card, 'p', 'preset-matchup', `${t(left.nameKey)}  vs  ${t(right.nameKey)}`);
    if (count > 2) append(card, 'p', 'preset-limited', t('preset.extra_fighters', { count }));
    else if (!item.builtIn) append(card, 'p', 'preset-date', new Intl.DateTimeFormat(i18n.getLocale(), { dateStyle: 'medium' }).format(item.updatedAt));

    const actions = append(card, 'div', 'preset-tile-actions');
    const load = append(actions, 'button', 'preset-load', t('preset.load'));
    load.type = 'button';
    load.dataset.presetAction = 'load';
    load.disabled = count > 2;
    if (count > 2) load.title = t('preset.extra_fighters', { count });
    const menu = append(actions, 'details', 'preset-menu');
    const summary = append(menu, 'summary', '', t('preset.more'));
    summary.setAttribute('aria-label', t('preset.more_for', { name: item.name }));
    const choices = append(menu, 'div', 'preset-menu-list');
    if (count > 2) {
      const firstTwo = append(choices, 'button', '', t('preset.load_first_two'));
      firstTwo.type = 'button';
      firstTwo.dataset.presetAction = 'first-two';
    }
    const exportButton = append(choices, 'button', '', t('preset.export'));
    exportButton.type = 'button';
    exportButton.dataset.presetAction = 'export';
    if (!item.builtIn) {
      const rename = append(choices, 'button', '', t('preset.rename'));
      rename.type = 'button';
      rename.dataset.presetAction = 'rename';
      const remove = append(choices, 'button', '', t('preset.delete'));
      remove.type = 'button';
      remove.dataset.presetAction = 'delete';
    }
  }

  function render() {
    renderFilters();
    const root = elements['preset-grid'];
    root.replaceChildren();
    const query = elements['preset-search'].value.trim().toLocaleLowerCase();
    const items = allItems().filter(item =>
      (filter === 'all' || (filter === 'builtin') === item.builtIn) &&
      (item.name.toLocaleLowerCase().includes(query) ||
        Object.values(item.recipe.fighters).some(fighter => t(characterById[fighter.characterId].nameKey).toLocaleLowerCase().includes(query)))
    );
    if (!items.length) append(root, 'p', 'preset-empty', t('preset.empty'));
    else items.forEach(item => renderTile(root, item));
  }

  function open() {
    if (state.phase !== 'select') return;
    hidePanels();
    feedback.hide();
    setStatus(null);
    elements['preset-search'].value = '';
    filter = 'all';
    render();
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
    dialog.classList.remove('preset-closing');
    dialog.showModal();
    elements['preset-search'].focus();
  }

  function close() {
    if (!dialog.open || closeTimer) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return; }
    dialog.classList.add('preset-closing');
    closeTimer = setTimeout(() => {
      closeTimer = null;
      dialog.classList.remove('preset-closing');
      if (dialog.open) dialog.close();
    }, 170);
  }

  function currentRecipe() {
    const setup = getSetup();
    return createDuelRecipe({ selectedCharacters: { left: state.left, right: state.right }, setup });
  }

  function showEditor(mode, item = null) {
    hidePanels();
    editor = { mode, id: item?.id ?? null };
    elements['preset-editor-label'].textContent = t(mode === 'rename' ? 'preset.rename_label' : 'preset.name_label');
    elements['preset-name'].value = item?.name ?? '';
    panelExits.get(elements['preset-editor'])?.cancel();
    elements['preset-editor'].hidden = false;
    elements['preset-editor'].inert = false;
    elements['preset-name'].focus();
  }

  function showConfirmation(messageKey, primaryKey, secondaryKey, onPrimary, onSecondary = hidePanels, parameters = {}) {
    confirmation = { onPrimary, onSecondary };
    elements['preset-confirm-message'].textContent = t(messageKey, parameters);
    elements['preset-confirm-primary'].textContent = t(primaryKey);
    elements['preset-confirm-secondary'].textContent = t(secondaryKey);
    panelExits.get(elements['preset-confirm'])?.cancel();
    elements['preset-confirm'].hidden = false;
    elements['preset-confirm'].inert = false;
    elements['preset-confirm-primary'].focus();
  }

  async function persistName(mode, id, name, recipe = null, replaceId = null) {
    const item = mode === 'rename'
      ? library.rename(id, name, { replaceId, reservedNames: reservedNames() })
      : library.save(name, recipe, { replaceId, reservedNames: reservedNames() });
    hidePanels();
    render();
    elements['preset-search'].focus();
    await library.whenPersisted();
    setStatus(mode === 'rename' ? 'preset.renamed' : 'preset.saved', { name: item.name }, 'success', elements['preset-search']);
  }

  function beginPersist(mode, id, rawName, recipe = null) {
    try {
      const name = uniquePresetName(normalizePresetName(rawName), reservedNames());
      if (recipe) parseDuelRecipe(JSON.stringify(recipe), { characters });
      const existing = library.collision(name, mode === 'rename' ? id : null);
      hidePanels();
      if (existing) {
        showConfirmation('preset.replace_question', 'preset.replace', 'preset.keep_both',
          () => { void persistName(mode, id, name, recipe, existing.id).catch(handleError); },
          () => { void persistName(mode, id, name, recipe).catch(handleError); },
          { name });
      } else void persistName(mode, id, name, recipe).catch(handleError);
    } catch (error) { handleError(error); }
  }

  function handleError(error) {
    console.warn('Duel preset operation failed', error);
    setStatus(storage?.hasConflict() ? 'data.conflict' : 'preset.error', {}, 'error', elements['preset-search']);
  }

  async function load(item, firstTwo = false) {
    try {
      const recipe = firstTwo ? firstTwoFighterRecipe(item.recipe, characters) : item.recipe;
      if (!firstTwo && recipe.arena.fighterCount > 2) return;
      const parsed = parseDuelRecipe(stringifyDuelRecipe(recipe), { characters });
      applyImportedDuel({ recipe: parsed, settings, state, characterById });
      onLoaded(parsed);
      close();
      const persisted = await settings.whenPersisted();
      feedback.show({ key: persisted ? 'preset.loaded' : storage?.hasConflict() ? 'data.conflict' : 'feedback.session_only',
        parameters: { name: item.name }, tone: persisted ? 'success' : 'warning',
        anchor: elements['settings-presets'] });
    } catch (error) { handleError(error); }
  }

  function exportItem(item, anchor) {
    const filename = item.name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'duel-preset';
    const url = URL.createObjectURL(new Blob([stringifyDuelRecipe(item.recipe)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setStatus('preset.exported', { name: item.name }, 'success', anchor);
  }

  async function importFile() {
    const file = elements['preset-import-file'].files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      parseDuelRecipe(text, { characters });
      const name = file.name.replace(/\.json$/i, '').trim() || t('preset.untitled');
      beginPersist('save', null, name, JSON.parse(text));
    } catch (error) { handleError(error); }
    finally { elements['preset-import-file'].value = ''; }
  }

  function handleAction(item, action, anchor) {
    if (action === 'load') void load(item);
    else if (action === 'first-two') void load(item, true);
    else if (action === 'export') exportItem(item, anchor);
    else if (action === 'rename' && !item.builtIn) showEditor('rename', item);
    else if (action === 'delete' && !item.builtIn) {
      hidePanels();
      showConfirmation('preset.delete_question', 'preset.delete', 'preset.cancel',
        async () => {
          try {
            library.remove(item.id);
            hidePanels();
            render();
            elements['preset-search'].focus();
            await library.whenPersisted();
            setStatus('preset.deleted', { name: item.name }, 'success', elements['preset-search']);
          } catch (error) { handleError(error); }
        }, hidePanels, { name: item.name });
    }
  }

  function bind() {
    elements['settings-presets'].addEventListener('click', open);
    elements['preset-close'].addEventListener('click', close);
    dialog.addEventListener('close', () => {
      hidePanels();
      elements['settings-presets'].focus({ preventScroll: true });
    });
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      hidePanels();
      close();
    });
    dialog.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      const menu = dialog.querySelector('details[open]');
      if (!menu) return;
      event.preventDefault();
      event.stopPropagation();
      menu.open = false;
      menu.querySelector('summary')?.focus();
    });
    dialog.addEventListener('click', event => {
      if (event.target.closest('.preset-menu')) return;
      dialog.querySelectorAll('details[open]').forEach(menu => { menu.open = false; });
    });
    elements['preset-search'].addEventListener('input', render);
    elements['preset-filters'].addEventListener('click', event => {
      const button = event.target.closest('[data-preset-filter]');
      if (!button) return;
      filter = button.dataset.presetFilter;
      render();
      elements['preset-filters'].querySelector(`[data-preset-filter="${filter}"]`)?.focus();
    });
    elements['preset-save-current'].addEventListener('click', () => showEditor('save'));
    elements['preset-import'].addEventListener('click', () => elements['preset-import-file'].click());
    elements['preset-import-file'].addEventListener('change', () => { void importFile(); });
    elements['preset-editor-submit'].addEventListener('click', () => {
      if (!editor) return;
      try {
        beginPersist(editor.mode, editor.id, elements['preset-name'].value, editor.mode === 'save' ? currentRecipe() : null);
      } catch (error) { handleError(error); }
    });
    elements['preset-name'].addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); elements['preset-editor-submit'].click(); }
    });
    elements['preset-editor-cancel'].addEventListener('click', hidePanels);
    elements['preset-confirm-primary'].addEventListener('click', () => confirmation?.onPrimary());
    elements['preset-confirm-secondary'].addEventListener('click', () => confirmation?.onSecondary());
    elements['preset-grid'].addEventListener('click', event => {
      const action = event.target.closest('[data-preset-action]');
      if (!action) return;
      const item = findItem(action.closest('[data-preset-id]')?.dataset.presetId);
      if (item) {
        handleAction(item, action.dataset.presetAction, action);
        if (action.dataset.presetAction === 'export') action.closest('details').open = false;
      }
    });
    elements['preset-grid'].addEventListener('contextmenu', event => {
      const card = event.target.closest('[data-preset-id]');
      if (!card) return;
      event.preventDefault();
      elements['preset-grid'].querySelectorAll('details[open]').forEach(menu => { menu.open = false; });
      const menu = card.querySelector('details');
      menu.open = true;
      menu.querySelector('button')?.focus();
    });
  }

  return Object.freeze({ bind, render, open, close });
}
