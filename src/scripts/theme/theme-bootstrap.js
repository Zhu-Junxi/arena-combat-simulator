(function bootstrapTheme() {
  const STORAGE_KEY = 'arena-duel.theme';
  let preference = 'system';
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch { /* Storage can be unavailable in privacy modes. */ }

  const resolved = preference === 'system'
    ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : preference;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.dataset.themePreference = preference;

  const link = document.createElement('link');
  link.id = 'theme-stylesheet';
  link.rel = 'stylesheet';
  link.href = new URL('../../styles/themes/' + resolved + '.css', document.currentScript.src).href;
  link.dataset.theme = resolved;
  document.head.appendChild(link);
})();
