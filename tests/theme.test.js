import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createThemeController,
  normalizeThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY
} from '../src/scripts/theme/theme-controller.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    value: key => values.get(key)
  };
}

function createMediaQuery(matches = false) {
  const listeners = new Set();
  return {
    matches,
    addEventListener: (type, listener) => type === 'change' && listeners.add(listener),
    removeEventListener: (type, listener) => type === 'change' && listeners.delete(listener),
    change(nextMatches) {
      this.matches = nextMatches;
      listeners.forEach(listener => listener({ matches: nextMatches }));
    },
    listenerCount: () => listeners.size
  };
}

function createDocument(theme = 'light', preference = 'system') {
  const links = [];
  const createLink = () => {
    const listeners = new Map();
    return {
      id: '',
      rel: '',
      href: '',
      dataset: {},
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatch(type) { listeners.get(type)?.(); },
      remove() {
        const index = links.indexOf(this);
        if (index >= 0) links.splice(index, 1);
      }
    };
  };
  const active = createLink();
  active.id = 'theme-stylesheet';
  active.dataset.theme = theme;
  links.push(active);
  return {
    documentElement: { dataset: { theme, themePreference: preference } },
    head: { appendChild: link => links.push(link) },
    createElement: tag => {
      assert.equal(tag, 'link');
      return createLink();
    },
    getElementById: id => links.find(link => link.id === id) ?? null,
    querySelectorAll: selector => selector === 'link[data-theme-candidate]'
      ? links.filter(link => link.dataset.themeCandidate)
      : [],
    links
  };
}

test('theme preference normalization and System resolution are deterministic', () => {
  assert.equal(normalizeThemePreference('light'), 'light');
  assert.equal(normalizeThemePreference('dark'), 'dark');
  assert.equal(normalizeThemePreference('sepia'), 'system');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('light', true), 'light');
});

test('saved preference is read and explicit preferences persist', async () => {
  const storage = createStorage({ [THEME_STORAGE_KEY]: 'dark' });
  const document = createDocument('dark', 'dark');
  const theme = createThemeController({ document, storage, mediaQuery: createMediaQuery(false), themeUrl: value => `${value}.css` });
  assert.equal(theme.getPreference(), 'dark');
  assert.equal(theme.getResolvedTheme(), 'dark');

  const changing = theme.setPreference('light');
  const replacement = document.links.at(-1);
  assert.equal(replacement.href, 'light.css');
  replacement.dispatch('load');
  await changing;
  assert.equal(storage.value(THEME_STORAGE_KEY), 'light');
  assert.equal(document.documentElement.dataset.theme, 'light');
  assert.equal(document.links.length, 1);
});

test('invalid saved values fall back to System and selecting System removes the override', async () => {
  const storage = createStorage({ [THEME_STORAGE_KEY]: 'sepia' });
  const mediaQuery = createMediaQuery(true);
  const document = createDocument('dark', 'system');
  const theme = createThemeController({ document, storage, mediaQuery, themeUrl: value => `${value}.css` });
  assert.equal(theme.getPreference(), 'system');
  await theme.setPreference('system');
  assert.equal(storage.value(THEME_STORAGE_KEY), undefined);
  assert.equal(theme.getResolvedTheme(), 'dark');
  await assert.rejects(() => theme.setPreference('sepia'), /Unsupported theme preference/);
});

test('subscribers and System mode respond to operating-system changes', async () => {
  const mediaQuery = createMediaQuery(false);
  const document = createDocument('light', 'system');
  const theme = createThemeController({ document, storage: createStorage(), mediaQuery, themeUrl: value => `${value}.css` });
  const changes = [];
  theme.subscribe(change => changes.push(change));

  mediaQuery.change(true);
  const replacement = document.links.at(-1);
  replacement.dispatch('load');
  await Promise.resolve();
  assert.equal(theme.getResolvedTheme(), 'dark');
  assert.deepEqual(changes.at(-1), { preference: 'system', resolvedTheme: 'dark' });

  theme.destroy();
  assert.equal(mediaQuery.listenerCount(), 0);
});

test('rapid stylesheet swaps keep only the latest loaded theme active', async () => {
  const document = createDocument('light', 'system');
  const theme = createThemeController({ document, storage: createStorage(), mediaQuery: createMediaQuery(false), themeUrl: value => `${value}.css` });
  const firstSwap = theme.setPreference('dark');
  const firstReplacement = document.links.at(-1);
  const secondSwap = theme.setPreference('dark');
  const secondReplacement = document.links.at(-1);

  firstReplacement.dispatch('load');
  await firstSwap;
  assert.equal(theme.getResolvedTheme(), 'light');
  secondReplacement.dispatch('load');
  await secondSwap;
  assert.equal(theme.getResolvedTheme(), 'dark');
  assert.equal(document.links.length, 1);
  assert.equal(document.getElementById('theme-stylesheet').dataset.theme, 'dark');
});
