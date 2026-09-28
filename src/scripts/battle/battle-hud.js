import { frameCorner } from '../ui/decorations.js';
import { cooldownProgress, modeValue, movementFactor, priestMarkAttackCooldownFactor } from './combat-engine.js';
import { activeStarPassives, starAttackSpeed } from './star-passive.js';
import { GUARDIAN_RULES } from './guardian.js';

const clamp = value => Math.max(0, Math.min(1, value));
const number = value => String(Number(Math.max(0, value).toFixed(1)));
const kinds = { warrior: 'melee', guardian: 'defense', archer: 'ranged', mage: 'control', priest: 'healing', 'dongfang-changfan': 'mobility' };

export function battleTime(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}

export function fighterHudState(fighter, battle, t) {
  const now = battle.elapsed;
  const target = battle.fighters.find(other => other !== fighter);
  const cooldown = fighter.attackCooldown * priestMarkAttackCooldownFactor(fighter);
  const haste = starAttackSpeed(fighter, now);
  const progress = cooldownProgress(fighter.cooldownElapsed, cooldown);
  let extraLabel = t('hud.armor');
  let extraValue = number(fighter.trait?.reduction ?? 0);
  let extraRatio = null;
  let status = t('hud.melee');
  if (fighter.guardian) {
    const g = fighter.guardian;
    extraLabel = t(g.shield > 0 ? 'battle.guardian_shield' : 'hud.flail');
    extraValue = g.shield > 0 ? `${number(g.shield)} / ${number(g.maxShield)}` :
      g.flail?.phase === 'grounded' ? t('hud.seconds', { seconds: Math.max(0, g.flail.expiresAt - now).toFixed(1) }) : t('hud.shield_broken');
    extraRatio = g.shield > 0 ? clamp(g.shield / g.maxShield) : g.flail?.phase === 'grounded' ? clamp((g.flail.expiresAt - now) / GUARDIAN_RULES.groundDuration) : 0;
    status = t(g.shield > 0 ? (g.dash ? 'hud.charging' : 'hud.shield_charge') :
      g.flail?.phase === 'grounded' ? 'hud.chain_wall' : g.flail?.phase === 'returning' ? 'hud.flail_return' : g.flail ? 'hud.flail_throw' : 'hud.flail_ready');
  } else if (fighter.character.id === 'archer') {
    const every = Math.max(1, Math.round(fighter.trait?.every ?? 4));
    const count = fighter.attacksFired % every;
    extraLabel = t('hud.vines');
    extraValue = `${count} / ${every}`;
    extraRatio = count / every;
    status = t(fighter.attack?.empowered ? 'hud.vine_firing' : count === every - 1 ? 'hud.vine_next' : 'hud.bow');
  } else if (fighter.character.id === 'dongfang-changfan') {
    const count = activeStarPassives(fighter, now).length;
    extraLabel = t('trait.myriad_star_fireflies.name');
    extraValue = `${count} / 3`;
    extraRatio = count / 3;
    status = t('hud.star_haste', { bonus: Math.round((haste - 1) * 100) });
  } else if (fighter.mageAbilities) {
    const theme = fighter.mageCycle ? t(`battle.theme_${fighter.mageCycle}`) : t('hud.preparing');
    extraLabel = t('trait.elemental_cycles.name');
    extraValue = theme;
    extraRatio = fighter.mageCycle ? (fighter.mageSpellIndex + 1) / 3 : 0;
    status = t('hud.spell_step', { step: fighter.mageSpellIndex + 1 });
  } else if (fighter.summonAbilities) {
    extraLabel = t('trait.beastmaster.name');
    extraValue = `${number(fighter.summonMeter)} / ${number(fighter.summonAbilities.meterThreshold)}`;
    extraRatio = clamp(fighter.summonMeter / fighter.summonAbilities.meterThreshold);
    status = t('battle.command_meter', { current: fighter.summonMeter, maximum: fighter.summonAbilities.meterThreshold });
  } else if (fighter.priestAbilities) {
    extraLabel = t('hud.target_marks');
    extraValue = number(target?.priestMarks ?? 0);
    status = fighter.prayer ? t('battle.praying', { seconds: Math.max(0, fighter.prayer.startedAt + fighter.priestAbilities.prayerDuration - now).toFixed(1) }) : t('hud.priest');
  }
  if (fighter.health <= 0) status = t('hud.defeated');
  else if (fighter.rootUntil > now) status = t('battle.rooted', { seconds: (fighter.rootUntil - now).toFixed(1) });
  const attackState = battle.phase === 'finished' || fighter.health <= 0 ? t('hud.duel_over') :
    battle.phase !== 'running' ? t('hud.preparing') : fighter.attack ? t('hud.attacking') :
    progress >= 1 ? t('battle.cooldown_ready') : t('hud.next_attack', { seconds: ((cooldown - fighter.cooldownElapsed) / haste).toFixed(1) });
  return {
    health: number(fighter.health), maximum: number(fighter.maxHealth), healthRatio: clamp(fighter.health / fighter.maxHealth),
    extraLabel, extraValue, extraRatio, status, attackState, progress,
    attack: number(fighter.attack?.damage ?? (fighter.priestAbilities ? 0 : fighter.mageCycle ? fighter.mageAbilities.cycles[fighter.mageCycle][fighter.mageSpellIndex].damage : modeValue(fighter.attackValues, fighter.attackMode))),
    cooldown: `${(cooldown / haste).toFixed(1)} s`,
    speed: number(fighter.movementSpeed * movementFactor(fighter, now, battle.zones)),
    defeated: fighter.health <= 0
  };
}

export function battleEventText(event, t) {
  const name = fighter => fighter?.character ? t(fighter.character.nameKey) : fighter?.owner
    ? t(fighter.kind === 'companion' ? 'battle.companion_name' : 'battle.pack_wolf') : '';
  const parameters = { name: name(event.fighter), target: name(event.target), amount: number(event.amount ?? 0) };
  const keys = {
    'shield-damaged': 'hud.event_shield', 'shield-broken': 'hud.event_break',
    damage: 'hud.event_damage', 'damage-over-time': 'hud.event_dot', healed: 'hud.event_heal',
    'flail-landed': 'hud.event_land', 'flail-returning': 'hud.event_return',
    'vines-applied': 'hud.event_vines', 'prayer-started': 'hud.event_prayer',
    'prayer-completed': 'hud.event_judgment', 'prayer-interrupted': 'hud.event_interrupt'
  };
  if (event.type === 'finished') return event.winner ? t('battle.winner', { name: name(event.winner) }) : t('battle.draw');
  if (event.type === 'launched') return t('hud.event_start');
  if (event.type === 'attack-released' && event.fighter.guardian?.shield > 0) return t('hud.event_charge', parameters);
  if (!keys[event.type] || (['damage', 'damage-over-time', 'shield-damaged', 'healed'].includes(event.type) && !(event.amount > 0))) return null;
  return t(keys[event.type], parameters);
}

const portraitLines = '<svg class="duel-portrait-lines" viewBox="0 0 260 350" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".7"><path d="M10 18 244 327M252 20 20 327M20 80V330"/><circle cx="128" cy="101" r="66"/><circle cx="128" cy="101" r="85"/></g><path d="m20 67 5 5-5 5-5-5Z"/></svg>';
const setText = (element, value) => { if (element.textContent !== value) element.textContent = value; };

export function createBattleHud(elements, i18n) {
  const views = new Map();
  let latestEvent = null;
  let latestAt = -Infinity;
  let endedAt = null;
  const t = (key, parameters) => i18n.t(key, parameters);
  elements['duel-corners'].innerHTML = ['tl', 'tr', 'bl', 'br'].map(frameCorner).join('');

  function build(fighter) {
    const { character, side } = fighter;
    const element = elements[`duel-${side}`];
    element.dataset.fighterKind = character.id;
    element.innerHTML = '<div class="duel-side-tag"><b>' + (side === 'left' ? '01' : '02') + '</b><span data-field="side"></span><i></i></div>' +
      '<div class="duel-portrait-window">' + portraitLines + '<img class="duel-portrait" alt="" draggable="false"></div>' +
      '<div class="duel-identity"><img class="duel-avatar" alt=""><div><h3 data-field="name"></h3><p data-field="trait"></p></div><span aria-hidden="true">◆</span></div>' +
      '<div class="duel-vital"><div><span data-field="healthLabel"></span><strong><span data-field="health"></span> <small>/ <span data-field="maximum"></span></small></strong></div>' +
      '<div class="duel-meter duel-health" role="progressbar" aria-valuemin="0"><i></i></div></div>' +
      '<div class="duel-vital"><div><span data-field="extraLabel"></span><strong data-field="extraValue"></strong></div><div class="duel-meter duel-extra"><i></i></div></div>' +
      '<dl class="duel-mini-stats"><div><dt data-field="attackLabel"></dt><dd data-field="attack"></dd></div><div><dt data-field="cooldownLabel"></dt><dd data-field="cooldown"></dd></div><div><dt data-field="speedLabel"></dt><dd data-field="speed"></dd></div></dl>' +
      '<div class="duel-ability"><span aria-hidden="true">◇</span><div><b data-field="status"></b><p data-field="attackState"></p></div></div>';
    const view = { element, fields: Object.fromEntries([...element.querySelectorAll('[data-field]')].map(node => [node.dataset.field, node])),
      health: element.querySelector('.duel-health'), healthFill: element.querySelector('.duel-health i'),
      extra: element.querySelector('.duel-extra'), extraFill: element.querySelector('.duel-extra i') };
    const portrait = element.querySelector('.duel-portrait');
    const avatar = element.querySelector('.duel-avatar');
    if (character.art) { portrait.src = character.art.portrait; avatar.src = character.art.avatar; }
    else { portrait.hidden = true; avatar.hidden = true; }
    views.set(fighter, view);
    localize(fighter, view);
  }

  function localize(fighter, view) {
    const name = t(fighter.character.nameKey);
    const labels = { name, side: t(`side.${fighter.side}`) + ' · ' + t(`category.${kinds[fighter.character.id] ?? fighter.character.category}`),
      trait: t(fighter.trait?.nameKey ?? 'trait.none'), healthLabel: t('hud.health'),
      attackLabel: t('hud.attack'), cooldownLabel: t('hud.interval'), speedLabel: t('hud.speed') };
    for (const [key, value] of Object.entries(labels)) setText(view.fields[key], value);
    view.element.setAttribute('aria-label', t(`accessibility.side_${fighter.side}`));
    view.element.querySelector('.duel-portrait').alt = t('accessibility.portrait', { name });
    view.fields.trait.dataset.tooltip = fighter.trait?.descriptionKey ? t(fighter.trait.descriptionKey) : '';
    view.health.setAttribute('aria-label', t('accessibility.health', { name }));
    view.health.setAttribute('aria-valuemax', String(fighter.maxHealth));
    setText(elements[`duel-name-${fighter.side}`], name);
  }

  function render(battle) {
    setText(elements['duel-clock'], battleTime(endedAt ?? battle.elapsed));
    setText(elements['duel-speed'], `${number(battle.rules.timeScale)} ×`);
    const phaseKey = battle.phase === 'finished' ? 'hud.duel_over' : battle.phase === 'running' ? 'hud.running' : 'hud.preparing';
    setText(elements['duel-phase'], t(phaseKey));
    const result = battle.phase === 'finished' ? (battle.winner ? t('battle.winner', { name: t(battle.winner.character.nameKey) }) : t('battle.draw')) : t(battle.phase === 'running' ? 'hud.undecided' : 'hud.preparing');
    setText(elements['duel-result'], result);
    for (const fighter of battle.fighters) {
      const view = views.get(fighter);
      if (!view) continue;
      const state = fighterHudState(fighter, battle, t);
      for (const key of ['health', 'maximum', 'extraLabel', 'extraValue', 'attack', 'cooldown', 'speed', 'status', 'attackState']) setText(view.fields[key], state[key]);
      view.health.setAttribute('aria-valuenow', String(fighter.health));
      view.healthFill.style.width = `${state.healthRatio * 100}%`;
      view.extra.dataset.empty = String(state.extraRatio === null);
      view.extraFill.style.width = `${(state.extraRatio ?? 0) * 100}%`;
      view.element.dataset.defeated = String(state.defeated);
    }
    setText(elements['duel-event-time'], latestEvent ? battleTime(latestAt) : '');
    setText(elements['duel-event'], latestEvent ? battleEventText(latestEvent, t) : t('hud.event_ready'));
  }

  function reset(battle) {
    latestEvent = null; latestAt = -Infinity; endedAt = null;
    views.clear();
    battle.fighters.forEach(build);
    render(battle);
  }

  function handleEvent(event) {
    if (endedAt !== null && event.type !== 'finished') return;
    if (event.type === 'finished') endedAt = event.battle.elapsed;
    if (!battleEventText(event, t)) return;
    // Avoid replacing important events with a stream of damage-over-time ticks.
    if (event.type === 'damage-over-time' && event.battle.elapsed - latestAt < 1) return;
    if (['damage', 'shield-damaged'].includes(event.type) && event.battle.elapsed - latestAt < .3) return;
    latestEvent = event;
    latestAt = event.battle.elapsed;
  }

  function refreshLocalization(battle) {
    battle.fighters.forEach(fighter => { const view = views.get(fighter); if (view) localize(fighter, view); });
    render(battle);
  }
  return { reset, render, handleEvent, refreshLocalization };
}
