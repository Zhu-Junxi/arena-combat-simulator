import { frameCorner, panelDecoration } from '../ui/decorations.js';

export function createSelectionView({ state, characters, categories, elements, i18n, getFighterSettings = null }) {
  const t = (key, parameters) => i18n.t(key, parameters);
  const characterName = character => t(character.nameKey);
  const sideName = side => t(`side.${side}`);
  const categoryName = category => t(`category.${category}`);
  const visibleCharacters = () => characters.filter(character => character.category === state.category);

  function formatStat(value, { cooldown = false, unit = '' } = {}) {
    if (value == null) return '—';
    const multiple = Array.isArray(value);
    const text = multiple ? value.join('/') : cooldown ? value.toFixed(1) : String(value);
    const content = text + (unit ? `<small>${t(unit)}</small>` : '');
    return multiple ? `<span class="stat-modes">${content}</span>` : content;
  }

  function renderTrait(character, side) {
    const { trait } = character;
    if (!trait) return `<div class="trait"><span>${t('trait.label')}</span><span>${t('trait.none')}</span></div>`;
    const tooltipId = `trait-description-${side}`;
    const name = t(trait.nameKey);
    return `<div class="trait"><span>${t('trait.label')}</span><button class="trait-button" type="button" ` +
      `aria-label="${characterName(character)}: ${name}" aria-describedby="${tooltipId}">${name}</button>` +
      `<div class="trait-tooltip" id="${tooltipId}" role="tooltip"><strong>${name}</strong>${t(trait.descriptionKey)}</div></div>`;
  }

  function renderPanel(side) {
    const character = state[side];
    const configured = getFighterSettings?.(side, character.id);
    const stats = configured ? {
      attack: configured.attack.length === 1 ? configured.attack[0] : configured.attack,
      attackCD: configured.attackCD.length === 1 ? configured.attackCD[0] : configured.attackCD,
      speed: configured.movementSpeed,
      health: configured.health
    } : character.stats;
    const translatedSide = sideName(side);
    const name = characterName(character);
    const portrait = '<button class="portrait' + (character.art ? ' has-art' : '') + `" data-side="${side}" ` +
      `aria-label="${t('selection.choose_for', { side: translatedSide })}" data-tooltip="${t('tooltip.side')}">` +
      (character.art ? `<img class="portrait-image" src="${character.art.portrait}" alt="${t('accessibility.portrait', { name })}" draggable="false">` : `<strong>${t('character.placeholder.portrait')}</strong>`) +
      (character.art ? '' : `<span>${name} · ${categoryName(character.category)}</span>`) +
      `<small>${t('selection.click_for', { side: translatedSide })}</small></button>`;
    const info = `<div class="info"><h2>${name}</h2><button class="avatar${character.art ? ' has-art' : ''}" data-side="${side}" ` +
      `aria-label="${t('selection.switch_to', { side: translatedSide })}" data-tooltip="${t('tooltip.side')}">` +
      (character.art ? `<img class="avatar-image" src="${character.art.avatar}" alt="" draggable="false">` : t('character.placeholder.avatar')) +
      `</button><span class="kind">${categoryName(character.category)}</span><dl class="stats">` +
      `<div data-tooltip="${t('tooltip.attack')}"><dt>${t('stats.attack')}</dt><dd>${formatStat(stats.attack, { unit: 'unit.damage_per_hit' })}</dd></div>` +
      `<div data-tooltip="${t('tooltip.cooldown')}"><dt>${t('stats.cooldown')}</dt><dd>${formatStat(stats.attackCD, { cooldown: true, unit: 'unit.seconds_short' })}</dd></div>` +
      `<div data-tooltip="${t('tooltip.movement_speed')}"><dt>${t('stats.speed')}</dt><dd>${formatStat(stats.speed, { unit: 'unit.arena_units_per_second' })}</dd></div>` +
      `<div data-tooltip="${t('tooltip.health')}"><dt>${t('stats.health')}</dt><dd>${formatStat(stats.health, { unit: 'unit.hp' })}</dd></div></dl>${renderTrait(character, side)}</div>`;
    const panel = elements[`panel-${side}`];
    const active = state.side === side;
    panel.dataset.active = String(active);
    const activeLabel = active ? `<span class="selection-active-label"> · ${t('selection.active')}</span>` : '';
    panel.innerHTML = panelDecoration(side) + `<div class="panel-head"><button class="side-button" data-side="${side}" aria-pressed="${active}" data-tooltip="${t('tooltip.side')}">` +
      `${t('selection.side_character', { side: translatedSide })}${activeLabel}</button><span class="panel-number">${side === 'left' ? '01' : '02'}</span></div>` +
      `<div class="panel-content">${side === 'left' ? portrait + info : info + portrait}</div>`;
  }

  function syncSelection() {
    const translatedSide = sideName(state.side);
    elements['selection-label'].textContent = t('selection.summary', {
      side: translatedSide,
      category: categoryName(state.category),
      count: visibleCharacters().length
    });
    document.querySelectorAll('[data-category]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
    });
    document.querySelectorAll('[data-character]').forEach(button => {
      const id = button.dataset.character;
      button.setAttribute('aria-pressed', String(state[state.side].id === id));
      const badge = button.querySelector('.badge');
      badge.textContent = [
        state.left.id === id ? t('side.badge_left') : '',
        state.right.id === id ? t('side.badge_right') : ''
      ].filter(Boolean).join('/');
      badge.hidden = !badge.textContent;
    });
  }

  function renderRoster() {
    elements.roster.innerHTML = visibleCharacters().map(character => {
      const name = characterName(character);
      return `<button class="character" data-character="${character.id}" aria-label="${t('selection.character_aria', { name })}" aria-pressed="false" data-tooltip="${t('tooltip.character')}">` +
        `<span class="mini-avatar${character.art ? ' has-art' : ''}">` +
        (character.art ? `<img class="avatar-image" src="${character.art.avatar}" alt="" draggable="false">` : t('character.placeholder.avatar')) +
        `</span><span class="name">${name}</span><span class="badge" hidden></span></button>`;
    }).join('');
    elements.roster.scrollTop = 0;
    syncSelection();
  }

  function updateCategoryScrollButtons() {
    const list = elements.categories;
    elements['categories-up'].disabled = list.scrollTop <= 1;
    elements['categories-down'].disabled = list.scrollTop + list.clientHeight >= list.scrollHeight - 1;
  }

  function render() {
    if (!elements.dock.querySelector('.frame-corner')) {
      elements.dock.insertAdjacentHTML('beforeend', frameCorner('bl') + frameCorner('br'));
    }
    elements.categories.innerHTML = categories.map(category => {
      const count = characters.filter(character => character.category === category).length;
      const name = categoryName(category);
      return `<button class="category" data-category="${category}" aria-label="${name}" aria-pressed="false" data-tooltip="${t('tooltip.category')}"><span>${name}</span><small>${count}</small></button>`;
    }).join('');
    renderPanel('left');
    renderPanel('right');
    renderRoster();
    updateCategoryScrollButtons();
  }

  return { render, refresh: render, renderPanel, renderRoster, syncSelection, updateCategoryScrollButtons, visibleCharacters, sideName, categoryName, characterName };
}
