const LABEL_KEYS = Object.freeze({
  system: 'theme.system',
  light: 'theme.light',
  dark: 'theme.dark'
});

export function populateThemeSelector(select, theme, i18n) {
  select.replaceChildren(...Object.entries(LABEL_KEYS).map(([value, key]) => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = i18n.t(key);
    return option;
  }));
  select.value = theme.getPreference();
  select.setAttribute('aria-label', i18n.t('accessibility.theme'));
}
