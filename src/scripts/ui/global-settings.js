export function createGlobalSettings({ elements }) {
  const toggle = elements['global-settings-toggle'];
  const popover = elements['global-settings-popover'];
  const closeButton = elements['global-settings-close'];
  let open = false;

  function setOpen(nextOpen, { restoreFocus = false } = {}) {
    if (open === Boolean(nextOpen)) return;
    open = Boolean(nextOpen);
    toggle.setAttribute('aria-expanded', String(open));
    popover.hidden = !open;
    popover.inert = !open;
    if (open) closeButton.focus({ preventScroll: true });
    else if (restoreFocus) toggle.focus({ preventScroll: true });
  }

  function bind() {
    toggle.addEventListener('click', () => setOpen(!open));
    closeButton.addEventListener('click', () => setOpen(false, { restoreFocus: true }));
    document.addEventListener('pointerdown', event => {
      if (open && !popover.contains(event.target) && !toggle.contains(event.target)) setOpen(false, { restoreFocus: true });
    });
    document.addEventListener('keydown', event => {
      if (open && event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false, { restoreFocus: true });
      }
    }, true);
  }

  return Object.freeze({ bind, close: () => setOpen(false), isOpen: () => open });
}
