const INTERACTIVE_SELECTOR = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"]), [data-tooltip]';

function tooltipText(element) {
  if (element.dataset.tooltip) return element.dataset.tooltip.trim();
  if (element.getAttribute('title')) return element.getAttribute('title').trim();
  if (element.getAttribute('aria-label')) return element.getAttribute('aria-label').trim();
  if (element.labels?.[0]?.textContent) return element.labels[0].textContent.trim();
  return element.textContent.trim().replace(/\s+/g, ' ');
}

export function createFloatingTooltip({ root = document } = {}) {
  const tooltip = document.createElement('div');
  tooltip.className = 'floating-tooltip';
  tooltip.id = 'floating-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  let target = null;
  let showTimer = null;

  function position() {
    if (!target || tooltip.hidden) return;
    const rect = target.getBoundingClientRect();
    const gap = 10;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left = Math.max(gap, Math.min(window.innerWidth - width - gap, rect.left + rect.width / 2 - width / 2));
    const top = rect.top >= height + gap ? rect.top - height - gap : Math.min(window.innerHeight - height - gap, rect.bottom + gap);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function hide() {
    clearTimeout(showTimer);
    if (target?.getAttribute('aria-describedby') === tooltip.id) target.removeAttribute('aria-describedby');
    target = null;
    tooltip.hidden = true;
  }

  function show(element, delayed = false) {
    if (!element || element.disabled || element.matches('.trait-button, [aria-describedby]')) return;
    const text = tooltipText(element);
    if (!text) return;
    clearTimeout(showTimer);
    if (target && target !== element && target.getAttribute('aria-describedby') === tooltip.id) target.removeAttribute('aria-describedby');
    target = element;
    const reveal = () => {
      if (target !== element) return;
      tooltip.textContent = text;
      tooltip.hidden = false;
      element.setAttribute('aria-describedby', tooltip.id);
      position();
    };
    if (delayed) showTimer = setTimeout(reveal, 350);
    else reveal();
  }

  function interactiveFrom(eventTarget) {
    return eventTarget instanceof Element ? eventTarget.closest(INTERACTIVE_SELECTOR) : null;
  }

  function onPointerOver(event) {
    const element = interactiveFrom(event.target);
    if (!element || !root.contains(element) || element === interactiveFrom(event.relatedTarget)) return;
    show(element, true);
  }

  function onPointerOut(event) {
    const element = interactiveFrom(event.target);
    if (element && element === target && !element.contains(event.relatedTarget)) hide();
  }

  function onFocusIn(event) {
    const element = interactiveFrom(event.target);
    if (element && root.contains(element)) show(element);
  }

  function onFocusOut(event) {
    if (event.target === target && !event.target.contains(event.relatedTarget)) hide();
  }

  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('pointerout', onPointerOut);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('focusout', onFocusOut);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  const observer = new MutationObserver(() => {
    if (target && !document.contains(target)) hide();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return Object.freeze({
    destroy() {
      hide();
      root.removeEventListener('pointerover', onPointerOver);
      root.removeEventListener('pointerout', onPointerOut);
      root.removeEventListener('focusin', onFocusIn);
      root.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      observer.disconnect();
      tooltip.remove();
    }
  });
}
