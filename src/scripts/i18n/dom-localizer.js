export function localizeDocument(i18n, root = document) {
  root.querySelectorAll('[data-i18n]').forEach(element => {
    element.textContent = i18n.t(element.dataset.i18n);
  });
  for (const [attribute, datasetKey] of [['aria-label', 'i18nAriaLabel'], ['title', 'i18nTitle']]) {
    root.querySelectorAll(`[data-${datasetKey.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}]`).forEach(element => {
      element.setAttribute(attribute, i18n.t(element.dataset[datasetKey]));
    });
  }
  document.documentElement.lang = i18n.getLocale();
  document.title = i18n.t('app.title');
}

export function populateLanguageSelector(select, i18n) {
  select.replaceChildren(...i18n.availableLocales.map(({ code, name }) => {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = name;
    return option;
  }));
  select.value = i18n.getLocale();
  select.setAttribute('aria-label', i18n.t('accessibility.language'));
}
