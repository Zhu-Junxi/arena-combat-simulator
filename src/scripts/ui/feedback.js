// A toast is visual only. The existing status elements make the same message
// available to assistive technology without announcing it twice.
export function createFeedback({ i18n, mainStatus, dialogStatus, mainToast, dialogToast, dialog,
  schedule = globalThis.setTimeout, cancel = globalThis.clearTimeout, viewport = globalThis } = {}) {
  const hosts = { main: { status: mainStatus, toast: mainToast }, dialog: { status: dialogStatus, toast: dialogToast } };
  let current = null;
  let timer = null;

  function hide() {
    if (timer != null) cancel(timer);
    timer = null;
    for (const { toast } of Object.values(hosts)) {
      if (toast) toast.hidden = true;
    }
    current = null;
  }

  function show({ key, parameters = {}, tone = 'success', anchor = null, context = 'main' }) {
    hide();
    const target = context === 'dialog' && dialog?.open ? hosts.dialog : hosts.main;
    const message = i18n.t(key, parameters);
    target.status.textContent = message;
    target.toast.textContent = message;
    target.toast.dataset.tone = tone;
    target.toast.hidden = false;
    // Clear the previous anchor before measuring. A fixed element with both a
    // top and bottom inset stretches to fill the space between them.
    Object.assign(target.toast.style, { left: '', right: '', top: '', bottom: '' });
    if (anchor?.getBoundingClientRect) {
      const rect = anchor.getBoundingClientRect();
      const margin = 12;
      const gap = 8;
      const width = target.toast.offsetWidth;
      const height = target.toast.offsetHeight;
      const below = rect.bottom + gap;
      const above = rect.top - gap - height;
      const top = below + height <= viewport.innerHeight - margin ? below :
        above >= margin ? above : Math.max(margin, Math.min(below, viewport.innerHeight - height - margin));
      const left = Math.max(margin, Math.min(rect.left, viewport.innerWidth - width - margin));
      Object.assign(target.toast.style, {
        right: 'auto', bottom: 'auto', left: `${left}px`, top: `${top}px`
      });
    }
    current = { key, parameters, target };
    timer = schedule(hide, tone === 'success' ? 2500 : 4500);
  }

  function refreshLocalization() {
    if (!current) return;
    const message = i18n.t(current.key, current.parameters);
    current.target.status.textContent = message;
    current.target.toast.textContent = message;
  }

  return Object.freeze({ show, hide, refreshLocalization });
}
