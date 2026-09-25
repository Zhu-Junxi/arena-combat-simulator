export const THEME_STORAGE_KEY = 'arena-duel.theme';
export const THEME_PREFERENCES = Object.freeze(['system', 'light', 'dark']);

export function normalizeThemePreference(value) {
  return value === 'light' || value === 'dark' ? value : 'system';
}

export function resolveTheme(preference, systemPrefersDark = false) {
  const normalized = normalizeThemePreference(preference);
  return normalized === 'system' ? (systemPrefersDark ? 'dark' : 'light') : normalized;
}

export function createThemeController({
  document: targetDocument = globalThis.document,
  storage = globalThis.localStorage,
  mediaQuery = globalThis.matchMedia?.('(prefers-color-scheme: dark)'),
  themeUrl = theme => new URL(`../../styles/themes/${theme}.css`, import.meta.url).href,
  logger = console
} = {}) {
  let saved = null;
  try { saved = storage?.getItem(THEME_STORAGE_KEY); } catch { /* Use System if storage is unavailable. */ }
  let preference = normalizeThemePreference(saved);
  let resolvedTheme = targetDocument.documentElement.dataset.theme || resolveTheme(preference, mediaQuery?.matches);
  let swapVersion = 0;
  let destroyed = false;
  const listeners = new Set();

  targetDocument.documentElement.dataset.themePreference = preference;
  targetDocument.documentElement.dataset.theme = resolvedTheme;

  function notify() {
    listeners.forEach(listener => listener({ preference, resolvedTheme }));
  }

  function commitTheme(theme) {
    resolvedTheme = theme;
    targetDocument.documentElement.dataset.theme = theme;
    targetDocument.documentElement.dataset.themePreference = preference;
    notify();
  }

  function swapStylesheet(theme) {
    const version = ++swapVersion;
    const current = targetDocument.getElementById('theme-stylesheet');
    if (current?.dataset.theme === theme) {
      commitTheme(theme);
      return Promise.resolve(theme);
    }

    return new Promise((resolve, reject) => {
      const replacement = targetDocument.createElement('link');
      replacement.rel = 'stylesheet';
      replacement.href = themeUrl(theme);
      replacement.dataset.themeCandidate = theme;

      replacement.addEventListener('load', () => {
        if (destroyed || version !== swapVersion) {
          replacement.remove();
          resolve(resolvedTheme);
          return;
        }
        targetDocument.getElementById('theme-stylesheet')?.remove();
        replacement.id = 'theme-stylesheet';
        delete replacement.dataset.themeCandidate;
        replacement.dataset.theme = theme;
        commitTheme(theme);
        resolve(theme);
      }, { once: true });
      replacement.addEventListener('error', () => {
        replacement.remove();
        const error = new Error(`Unable to load ${theme} theme stylesheet`);
        logger.error?.(error);
        reject(error);
      }, { once: true });
      targetDocument.head.appendChild(replacement);
    });
  }

  async function setPreference(nextPreference) {
    if (destroyed) return resolvedTheme;
    const normalized = normalizeThemePreference(nextPreference);
    if (nextPreference !== normalized && nextPreference !== 'system') {
      throw new Error(`Unsupported theme preference: ${nextPreference}`);
    }
    preference = normalized;
    try {
      if (preference === 'system') storage?.removeItem(THEME_STORAGE_KEY);
      else storage?.setItem(THEME_STORAGE_KEY, preference);
    } catch { /* Theme switching still works without persistence. */ }
    targetDocument.documentElement.dataset.themePreference = preference;
    return swapStylesheet(resolveTheme(preference, mediaQuery?.matches));
  }

  function handleSystemChange(event) {
    if (preference === 'system') {
      void swapStylesheet(resolveTheme(preference, event.matches)).catch(() => {});
    }
  }
  mediaQuery?.addEventListener?.('change', handleSystemChange);

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function destroy() {
    destroyed = true;
    swapVersion += 1;
    mediaQuery?.removeEventListener?.('change', handleSystemChange);
    targetDocument.querySelectorAll('link[data-theme-candidate]').forEach(link => link.remove());
    listeners.clear();
  }

  return Object.freeze({
    getPreference: () => preference,
    getResolvedTheme: () => resolvedTheme,
    setPreference,
    subscribe,
    destroy
  });
}
