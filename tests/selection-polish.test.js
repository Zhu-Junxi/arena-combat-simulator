import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSelectionView } from '../src/scripts/selection/selection-view.js';
import { createSelectionController } from '../src/scripts/selection/selection-controller.js';
import { createSettingsController } from '../src/scripts/customization/settings-controller.js';
import { createGlobalSettings } from '../src/scripts/ui/global-settings.js';
import { createTransitions } from '../src/scripts/ui/transitions.js';
import { clearResultReveal, showResultReveal } from '../src/scripts/battle/result-reveal.js';

const node = () => ({
  dataset: {}, attributes: {}, hidden: false, inert: false, innerHTML: '', textContent: '',
  setAttribute(name, value) { this.attributes[name] = value; },
  querySelectorAll() { return []; },
  querySelector() { return { focus() {} }; },
  focus() { this.focused = true; },
  addEventListener(name, handler) { (this.listeners ??= {})[name] = handler; },
  contains(target) { return target === this; }
});

test('grid renders all characters, locked cards, side controls, and independent filters', () => {
  const elements = {
    'roster-grid-sides': node(), 'roster-grid-filters': node(), 'roster-grid-cards': node(),
    'selection-label': node(), categories: node(), dock: node()
  };
  const characters = [
    { id: 'warrior', nameKey: 'name.warrior', category: 'melee', art: null },
    { id: 'archer', nameKey: 'name.archer', category: 'ranged', art: null },
    { id: 'future', nameKey: 'name.future', category: 'ranged', roleKey: 'role.future', locked: true, art: null }
  ];
  const state = { side: 'left', category: 'melee', left: characters[0], right: characters[1] };
  const view = createSelectionView({ state, characters, categories: ['melee', 'ranged'], elements,
    i18n: { t: (key, values) => key === 'selection.grid_side' ? `Set ${values.side}` : key } });
  view.renderGrid();
  assert.match(elements['roster-grid-cards'].innerHTML, /data-character="warrior"/);
  assert.match(elements['roster-grid-cards'].innerHTML, /data-character="archer"/);
  assert.match(elements['roster-grid-cards'].innerHTML, /class="character locked" disabled/);
  assert.match(elements['roster-grid-sides'].innerHTML, /data-grid-side="left"/);
  assert.match(elements['roster-grid-sides'].innerHTML, /data-grid-side="right"/);
  view.setGridCategory('ranged');
  assert.doesNotMatch(elements['roster-grid-cards'].innerHTML, /data-character="warrior"/);
  assert.match(elements['roster-grid-cards'].innerHTML, /data-character="archer"/);
  assert.equal(state.category, 'melee');
  view.setGridCategory('all');
  assert.match(elements['roster-grid-cards'].innerHTML, /data-character="warrior"/);
});

test('top arrow closes properties while the selection arrow opens the fighter grid', () => {
  const previousDocument = globalThis.document;
  globalThis.document = node();
  try {
    const ids = ['dock', 'dock-main', 'settings-toggle', 'roster-grid-toggle', 'settings-panel', 'roster-grid-panel',
      'roster-grid-sides', 'settings-tabs', 'settings-content', 'settings-reset-all', 'advanced-tuning', 'start-control'];
    const elements = Object.fromEntries(ids.map(id => [id, node()]));
    const state = { phase: 'select', side: 'left', left: { id: 'warrior' }, right: { id: 'archer' } };
    let gridOpens = 0;
    let localePrefix = '';
    const panels = [node(), node()];
    const controller = createSettingsController({ state, settings: {}, view: { render() {} }, elements,
      panels, feedback: {}, i18n: { t: key => localePrefix + key }, onGridOpen: () => { gridOpens += 1; } });
    controller.bind();
    const pressArrow = () => elements['settings-toggle'].listeners.click();
    const pressGridArrow = () => elements['roster-grid-toggle'].listeners.click();
    assert.equal(controller.getStep(), 'compact');
    assert.equal(elements['roster-grid-toggle'].hidden, true);
    assert.equal(elements['settings-toggle'].attributes['aria-label'], 'customization.open_properties');
    pressArrow();
    assert.equal(controller.getStep(), 'properties');
    assert.equal(elements['settings-toggle'].attributes['aria-label'], 'customization.close_properties');
    assert.equal(elements['roster-grid-toggle'].attributes['aria-label'], 'selection.grid_open');
    assert.equal(elements['roster-grid-toggle'].hidden, false);
    assert.equal(elements['settings-panel'].inert, false);
    assert.equal(elements['dock-main'].inert, false);
    pressArrow();
    assert.equal(controller.getStep(), 'compact');
    pressArrow();
    pressGridArrow();
    assert.equal(controller.getStep(), 'grid');
    assert.equal(elements['roster-grid-toggle'].hidden, true);
    assert.equal(elements['settings-toggle'].attributes['aria-label'], 'selection.grid_back_properties');
    assert.equal(elements['settings-panel'].inert, true);
    assert.equal(elements['roster-grid-panel'].inert, false);
    assert.equal(elements['dock-main'].inert, true);
    assert.equal(elements['dock-main'].attributes['aria-hidden'], 'true');
    assert.equal(gridOpens, 1);
    pressArrow();
    assert.equal(controller.getStep(), 'properties');
    assert.equal(elements['settings-toggle'].attributes['aria-label'], 'customization.close_properties');
    assert.equal(elements['roster-grid-toggle'].hidden, false);
    assert.equal(elements['settings-toggle'].focused, true);
    assert.equal(elements['dock-main'].inert, false);
    pressArrow();
    assert.equal(controller.getStep(), 'compact');
    assert.equal(elements.dock.dataset.expanded, 'false');
    assert.equal(elements['roster-grid-panel'].inert, true);
    assert.deepEqual(state, { phase: 'select', side: 'left', left: { id: 'warrior' }, right: { id: 'archer' } });

    pressArrow();
    pressGridArrow();
    assert.equal(gridOpens, 2);
    localePrefix = 'zh:';
    controller.refreshLocalization();
    assert.equal(elements['settings-toggle'].attributes['aria-label'], 'zh:selection.grid_back_properties');
    assert.equal(elements['roster-grid-toggle'].attributes['aria-label'], 'zh:selection.grid_open');
    let prevented = false;
    const escape = () => globalThis.document.listeners.keydown({ key: 'Escape', target: node(),
      preventDefault() { prevented = true; } });
    escape();
    assert.equal(controller.getStep(), 'properties');
    escape();
    assert.equal(controller.getStep(), 'compact');
    assert.equal(prevented, true);
    pressArrow();
    pressGridArrow();
    controller.setExpanded(false);
    assert.equal(controller.getStep(), 'compact');
    assert.equal(elements['dock-main'].inert, false);
    state.phase = 'arena';
    panels.forEach(panel => { panel.inert = true; });
    controller.refreshLocalization();
    assert.equal(panels.every(panel => panel.inert), true);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('grid side choice and character choice keep the grid active for both sides', () => {
  const previousWindow = globalThis.window;
  globalThis.window = node();
  try {
    const fighter = { id: 'archer' };
    const elements = Object.fromEntries(['categories', 'categories-up', 'categories-down', 'stage',
      'roster-grid-sides', 'roster-grid-filters', 'roster', 'status'].map(id => [id, node()]));
    const sideFocus = node();
    elements['roster-grid-sides'].querySelector = () => sideFocus;
    const state = { phase: 'select', side: 'left', left: { id: 'warrior' }, right: { id: 'warrior' } };
    const choices = [];
    let feedbackAnchor;
    const controller = createSelectionController({ state, characterById: { archer: fighter, future: { id: 'future', locked: true } }, elements,
      view: { renderPanel() {}, syncSelection() {}, setGridCategory() {}, sideName: side => side,
        characterName: character => character.id }, i18n: { t: key => key },
      feedback: { show: ({ anchor }) => { feedbackAnchor = anchor; } },
      onSelectionChange: side => choices.push(side) });
    controller.bind();
    const sideButton = { dataset: { gridSide: 'right' } };
    elements.stage.listeners.click({ target: { closest: selector => selector === '[data-grid-side]' ? sideButton : null } });
    assert.equal(state.side, 'right');
    assert.equal(sideFocus.focused, true);
    const card = { dataset: { character: 'archer' } };
    elements.stage.listeners.click({ target: { closest: selector => selector === '[data-character]' ? card : null } });
    assert.equal(state.right, fighter);
    assert.equal(feedbackAnchor, card);
    assert.deepEqual(choices, ['right', 'right']);
    const lockedCard = { dataset: { character: 'future' } };
    elements.stage.listeners.click({ target: { closest: selector => selector === '[data-character]' ? lockedCard : null } });
    assert.equal(state.right, fighter);
    assert.deepEqual(choices, ['right', 'right']);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('footer settings closes via button, Escape, and outside pointer input', () => {
  const previousDocument = globalThis.document;
  const document = node();
  globalThis.document = document;
  try {
    const elements = { 'global-settings-toggle': node(), 'global-settings-popover': node(), 'global-settings-close': node() };
    const controller = createGlobalSettings({ elements });
    controller.bind();
    elements['global-settings-toggle'].listeners.click();
    assert.equal(controller.isOpen(), true);
    assert.equal(elements['global-settings-popover'].inert, false);
    elements['global-settings-close'].listeners.click();
    assert.equal(controller.isOpen(), false);
    assert.equal(elements['global-settings-toggle'].focused, true);
    elements['global-settings-toggle'].listeners.click();
    document.listeners.keydown({ key: 'Escape', preventDefault() {}, stopImmediatePropagation() {} });
    assert.equal(controller.isOpen(), false);
    elements['global-settings-toggle'].listeners.click();
    document.listeners.pointerdown({ target: node() });
    assert.equal(controller.isOpen(), false);
  } finally {
    globalThis.document = previousDocument;
  }
});

test('starting from the grid closes it and reduced motion skips panel travel', async () => {
  const previousMatchMedia = globalThis.matchMedia;
  const previousDocument = globalThis.document;
  globalThis.matchMedia = () => ({ matches: true });
  globalThis.document = node();
  try {
    const durations = [];
    const animated = () => ({ ...node(), animate(_frames, options) {
      durations.push(options.duration);
      return { finished: Promise.resolve(), cancel() {} };
    } });
    const elements = { dock: animated(), arena: node(), stage: node(), 'start-control': node(),
      start: node(), 'roster-grid-start': node(), back: node(), status: node(), 'view-label': node() };
    const state = { phase: 'select', left: { id: 'warrior' }, right: { id: 'archer' } };
    let gridOpen = true;
    let battleStarted = false;
    const transitions = createTransitions({ state, elements, panels: [animated(), animated()],
      i18n: { t: key => key }, collapseCustomization: () => { gridOpen = false; },
      closeGlobalSettings() {}, resetBattle() {}, beginBattle() { battleStarted = true; } });
    transitions.bind();
    await elements['roster-grid-start'].listeners.click();
    assert.equal(gridOpen, false);
    assert.equal(state.phase, 'arena');
    assert.equal(battleStarted, true);
    assert.equal(elements['view-label'].textContent, 'view.battle');
    assert.deepEqual(durations, [0, 0, 0]);
  } finally {
    globalThis.matchMedia = previousMatchMedia;
    globalThis.document = previousDocument;
  }
});

test('win, draw, and reset update the result reveal without stale sides', () => {
  const arena = node();
  showResultReveal(arena, { side: 'left' });
  assert.equal(arena.dataset.result, 'left');
  clearResultReveal(arena);
  assert.equal('result' in arena.dataset, false);
  showResultReveal(arena, { side: 'right' });
  assert.equal(arena.dataset.result, 'right');
  clearResultReveal(arena);
  showResultReveal(arena, null);
  assert.equal(arena.dataset.result, 'draw');
});

test('new controls and restrained results have localized, reduced-motion styling', async () => {
  const [html, css, customizationCss, translations, renderer] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/polish.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/customization.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/locales/translations.csv', import.meta.url), 'utf8'),
    readFile(new URL('../src/scripts/battle/combat-renderer.js', import.meta.url), 'utf8')
  ]);
  assert.match(html, /id="roster-grid-toggle"[^>]*aria-controls="roster-grid-panel"/);
  assert.match(customizationCss, /roster-grid-toggle/);
  assert.match(html, /id="settings-toggle"[^>]*aria-controls="settings-panel roster-grid-panel"/);
  assert.match(css, /\[data-step="grid"\] \.roster-grid-panel \{ bottom: 0/);
  assert.match(css, /\[data-step="grid"\] \.dock-main \{ visibility: hidden/);
  assert.match(html, /id="roster-grid-start"[^>]*data-i18n="action\.start"/);
  assert.match(html, /id="global-settings-toggle"[^>]*aria-controls="global-settings-popover"/);
  assert.match(css, /data-result="draw"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(renderer, /clearResultReveal\(elements\.arena\)/);
  assert.match(renderer, /showResultReveal\(elements\.arena, event\.winner\)/);
  for (const key of ['customization.open_properties', 'customization.close_properties', 'selection.grid_open',
    'selection.grid_back_properties', 'selection.grid_all', 'global_settings.heading']) {
    assert.match(translations, new RegExp(`^${key.replace('.', '\\.')},`, 'm'));
  }
});
