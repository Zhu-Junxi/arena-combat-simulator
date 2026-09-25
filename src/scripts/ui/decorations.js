export function frameCorner(position) {
  return '<svg class="frame-corner corner-' + position + '" viewBox="0 0 28 28" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1"><path d="M1 1h15v15H1Zm7 7h15v15H8ZM1 9h7v7H1Zm8-8v7h7V1M16 16h11v11H16Z"/></g></svg>';
}

export function panelDecoration(side) {
  return frameCorner(side === 'left' ? 'tl' : 'tr') +
    '<svg class="panel-art" viewBox="0 0 365 300" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<g fill="none" stroke="currentColor" stroke-width=".6"><path d="M23 8 317 300" opacity=".6"/>' +
    '<path d="M8 285 280 10" opacity=".13"/><circle cx="138.7" cy="87" r="56" opacity=".25"/><circle cx="138.7" cy="87" r="75" opacity=".12"/>' +
    '<path d="M18 19V300M225 55H365" opacity=".55"/></g><path d="m18 57 6 6-6 6-6-6Z" fill="currentColor"/></svg>' +
    '<svg class="panel-lower-art" viewBox="0 0 365 160" preserveAspectRatio="none" aria-hidden="true" focusable="false">' +
    '<g fill="none" stroke="currentColor" stroke-width=".6"><path d="M317 0 365 50M18 0V143" opacity=".55"/></g>' +
    '<g class="lower-motif" transform="translate(-43.8 0)"><g fill="none" stroke="currentColor" stroke-width=".6">' +
    '<g class="lower-arcs" opacity=".18"><circle cx="182.5" cy="5" r="91.5"/><circle cx="182.5" cy="5" r="74.5"/></g>' +
    '</g><path d="m182 68 4 4-4 4-4-4Z" fill="currentColor"/></g>' +
    '<g fill="none" stroke="currentColor" stroke-width=".6"><path d="M38 126H154l28-19 28 19h117M38 132H152l30-20 30 20h115" opacity=".55"/>' +
    '<path d="M40 10 114 80M325 10 251 80" opacity=".12"/></g><path d="m18 93 5 5-5 5-5-5Z" fill="currentColor"/></svg>' +
    frameCorner(side === 'left' ? 'bl' : 'br');
}
