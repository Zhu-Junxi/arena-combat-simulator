import { frameCorner, panelDecoration } from '../ui/decorations.js';

function formatStat(value, cooldown = false) {
  if (value == null) return '—';
  const multiple = Array.isArray(value);
  const text = multiple ? value.join('/') : cooldown ? value.toFixed(1) : String(value);
  const content = text + (cooldown ? '<small>秒</small>' : '');
  return multiple ? `<span class="stat-modes">${content}</span>` : content;
}

function renderTrait(character, side) {
  const { trait } = character;
  if (!trait) return '<div class="trait"><span>特性</span><span>—</span></div>';
  const tooltipId = `trait-description-${side}`;
  return '<div class="trait"><span>特性</span><button class="trait-button" type="button" aria-label="' +
    `${character.name}特性：${trait.name}" aria-describedby="${tooltipId}">${trait.name}</button>` +
    `<div class="trait-tooltip" id="${tooltipId}" role="tooltip"><strong>${trait.name}</strong>${trait.description}</div></div>`;
}

export function createSelectionView({ state, characters, categories, elements }) {
  const visibleCharacters = () => characters.filter(character => character.kind === state.category);

  function renderPanel(side) {
    const character = state[side];
    const sideName = side === 'left' ? '左方' : '右方';
    const portrait = '<button class="portrait' + (character.art ? ' has-art' : '') + `" data-side="${side}" aria-label="为${sideName}选择角色">` +
      (character.art ? `<img class="portrait-image" src="${character.art.portrait}" alt="${character.name}立绘" draggable="false">` : '<strong>立绘预留</strong>') +
      (character.art ? '' : `<span>${character.name} · ${character.kind}</span>`) + `<small>点击为${sideName}选角</small></button>`;
    const info = `<div class="info"><h2>${character.name}</h2><button class="avatar${character.art ? ' has-art' : ''}" data-side="${side}" aria-label="切换到${sideName}选角">` +
      (character.art ? `<img class="avatar-image" src="${character.art.avatar}" alt="" draggable="false">` : '头像预留') +
      `</button><span class="kind">${character.kind}</span><dl class="stats">` +
      `<div><dt>攻击</dt><dd>${formatStat(character.stats.attack)}</dd></div>` +
      `<div><dt>攻击CD</dt><dd>${formatStat(character.stats.attackCD, true)}</dd></div>` +
      `<div><dt>速度</dt><dd>${formatStat(character.stats.speed)}</dd></div>` +
      `<div><dt>血量</dt><dd>${formatStat(character.stats.health)}</dd></div></dl>${renderTrait(character, side)}</div>`;
    const panel = elements[`panel-${side}`];
    panel.dataset.active = String(state.side === side);
    panel.innerHTML = panelDecoration(side) + `<div class="panel-head"><button class="side-button" data-side="${side}" aria-pressed="${state.side === side}">${sideName}角色</button>` +
      `<span class="panel-number">${side === 'left' ? '01' : '02'}</span></div><div class="panel-content">` +
      (side === 'left' ? portrait + info : info + portrait) + '</div>';
  }

  function syncSelection() {
    const sideName = state.side === 'left' ? '左方' : '右方';
    elements['selection-label'].textContent = `为${sideName}选择 · ${state.category} / ${visibleCharacters().length}`;
    document.querySelectorAll('[data-category]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.category === state.category));
    });
    document.querySelectorAll('[data-character]').forEach(button => {
      const id = button.dataset.character;
      button.setAttribute('aria-pressed', String(state[state.side].id === id));
      const badge = button.querySelector('.badge');
      badge.textContent = [state.left.id === id ? '左' : '', state.right.id === id ? '右' : ''].filter(Boolean).join('/');
      badge.hidden = !badge.textContent;
    });
  }

  function renderRoster() {
    elements.roster.innerHTML = visibleCharacters().map(character =>
      `<button class="character" data-character="${character.id}" aria-label="选择${character.name}" aria-pressed="false">` +
      `<span class="mini-avatar${character.art ? ' has-art' : ''}">` +
      (character.art ? `<img class="avatar-image" src="${character.art.avatar}" alt="" draggable="false">` : '头像预留') +
      `</span><span class="name">${character.name}</span><span class="badge" hidden></span></button>`
    ).join('');
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
      const count = characters.filter(character => character.kind === category).length;
      return `<button class="category" data-category="${category}" aria-label="${category}" aria-pressed="false"><span>${category}</span><small>${count}</small></button>`;
    }).join('');
    renderPanel('left');
    renderPanel('right');
    renderRoster();
    updateCategoryScrollButtons();
  }

  return { render, renderPanel, renderRoster, syncSelection, updateCategoryScrollButtons, visibleCharacters };
}
