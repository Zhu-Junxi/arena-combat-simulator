import { buildCatalog } from './csv.js';

export const STORAGE_KEY = 'arena-duel.locale';

export function matchLocale(requestedLocale, availableLocales) {
  if (!requestedLocale) return null;
  const normalized = requestedLocale.replace('_', '-').toLowerCase();
  const exact = availableLocales.find(locale => locale.toLowerCase() === normalized);
  if (exact) return exact;
  if (normalized === 'zh' || normalized.startsWith('zh-cn') || normalized.startsWith('zh-hans')) {
    return availableLocales.find(locale => locale.toLowerCase() === 'zh-cn') ?? null;
  }
  const language = normalized.split('-')[0];
  return availableLocales.find(locale => locale.toLowerCase() === language) ?? null;
}

export function resolveLocale({ savedLocale, browserLanguages = [], availableLocales, fallbackLocale = 'en' }) {
  return matchLocale(savedLocale, availableLocales) ??
    browserLanguages.map(locale => matchLocale(locale, availableLocales)).find(Boolean) ??
    fallbackLocale;
}

export function createI18n({ source, storage = globalThis.localStorage, browserLanguages = globalThis.navigator?.languages ?? [], fallbackLocale = 'en', logger = console }) {
  const { locales, catalog } = buildCatalog(source, fallbackLocale);
  let savedLocale = null;
  try { savedLocale = storage?.getItem(STORAGE_KEY); } catch { /* Storage can be unavailable in privacy modes. */ }
  let locale = resolveLocale({ savedLocale, browserLanguages, availableLocales: locales, fallbackLocale });
  const listeners = new Set();

  function translateFor(targetLocale, key, parameters = {}) {
    const entry = catalog.get(key);
    if (!entry) {
      logger.warn?.(`Missing translation key: ${key}`);
      return `[${key}]`;
    }
    const template = entry[targetLocale] || entry[fallbackLocale];
    if (!template) {
      logger.warn?.(`Missing translation value: ${key} (${targetLocale})`);
      return `[${key}]`;
    }
    return template.replace(/\{([A-Za-z][A-Za-z0-9_]*)\}/g, (match, name) =>
      Object.hasOwn(parameters, name) ? String(parameters[name]) : match
    );
  }

  function t(key, parameters) {
    return translateFor(locale, key, parameters);
  }

  function setLocale(nextLocale) {
    const matched = matchLocale(nextLocale, locales);
    if (!matched) throw new Error(`Unsupported locale: ${nextLocale}`);
    if (matched === locale) return;
    locale = matched;
    try { storage?.setItem(STORAGE_KEY, locale); } catch { /* Language switching still works without persistence. */ }
    listeners.forEach(listener => listener(locale));
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  const availableLocales = Object.freeze(locales.map(code => Object.freeze({
    code,
    name: translateFor(code, 'meta.language_name')
  })));

  return Object.freeze({ t, setLocale, getLocale: () => locale, availableLocales, subscribe });
}

export async function loadI18n(url, options = {}) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Unable to load translations (${response.status})`);
  return createI18n({ ...options, source: await response.text() });
}
