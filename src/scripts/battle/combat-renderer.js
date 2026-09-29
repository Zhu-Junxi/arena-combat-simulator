import { createGuardianVisual, renderGuardianVisual, GUARDIAN_VISUAL_SCALE } from './guardian-visuals.js';
import { createBattleHud } from './battle-hud.js';
import { createWarEntrance } from './war-entrance.js';
import { WAR_VISUAL_SCALE, warBodyMarkup, createWarCombatVisual, renderWarCombatVisual } from './war-visuals.js';
import { clearResultReveal, showResultReveal } from './result-reveal.js';
import { BATTLE_RULES } from '../config/combat.js';
import { activeStarPassives, starAttackSpeed } from './star-passive.js';
import { fighterTraitDescription } from '../customization/trait-description.js';
import { formatCombat, roundCombat } from './combat-precision.js';
import { cooldownProgress, healthBand, healthRatio, priestMarkAttackCooldownFactor, zoneSlowFactor } from './combat-engine.js';
import { createSvgEffect, explosionMarkup, frostRuneMarkup, prayerMarkup, projectileMarkup, updateWeaponVisual, weaponMarkup } from './weapon-effects.js';

export function createCombatRenderer(elements, i18n, initialRules = BATTLE_RULES) {
  const hud = createBattleHud(elements, i18n);
  const fighterElements = new Map();
  const guardianElements = new Map();
  const warElements = new Map();
  const attackElements = new WeakMap();
  const projectileElements = new WeakMap();
  const zoneElements = new WeakMap();
  const summonElements = new Map();
  let rules = initialRules;

  function buildFighterElement(fighter) {
    let element = elements.battlefield.querySelector(`#fighter-${fighter.side}`);
    if (!element) {
      element = document.createElement('div');
      element.className = `fighter ${fighter.side}`;
      element.id = `fighter-${fighter.side}`;
      elements.battlefield.append(element);
    }
    const { character } = fighter;
    element.dataset.fighterCharacter = character.id;
    if (character.id === 'war') {
      element.dataset.arrived = 'false';
      element.style.setProperty('--war-seat', '0');
      element.style.setProperty('--war-facing', fighter.side === 'right' ? '-1' : '1');
      element.style.setProperty('--war-rider-x', fighter.side === 'right' ? '22%' : '14%');
    }
    element.classList.toggle('has-art', Boolean(character.art));
    element.innerHTML = (character.id === 'war' ? warBodyMarkup(character.art) : character.art ? `<img class="fighter-art" src="${character.art.battle}" alt="" draggable="false">` : '') +
      '<span class="fighter-name"></span><span class="control-label" hidden></span><span class="arcane-marks" hidden></span><span class="star-passive" hidden></span><span class="guardian-state" hidden></span><span class="summon-command" hidden></span><div class="fighter-status">' +
      '<div class="fighter-meter health-bar" role="progressbar" aria-valuemin="0"><span class="fighter-meter-fill"></span></div>' +
      '<div class="fighter-meter shield-bar" role="progressbar" aria-valuemin="0" hidden><span class="fighter-meter-fill"></span></div>' +
      '<div class="fighter-meter cooldown-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="fighter-meter-fill"></span></div></div>';
    const name = i18n.t(character.nameKey);
    element.querySelector('.fighter-name').textContent = name;
    const view = {
      element,
      controlLabel: element.querySelector('.control-label'),
      arcaneMarks: element.querySelector('.arcane-marks'),
      starPassive: element.querySelector('.star-passive'),
      guardianState: element.querySelector('.guardian-state'),
      shieldBar: element.querySelector('.shield-bar'),
      shieldFill: element.querySelector('.shield-bar .fighter-meter-fill'),
      summonCommand: element.querySelector('.summon-command'),
      healthBar: element.querySelector('.health-bar'),
      healthFill: element.querySelector('.health-bar .fighter-meter-fill'),
      cooldownBar: element.querySelector('.cooldown-bar'),
      cooldownFill: element.querySelector('.cooldown-bar .fighter-meter-fill')
    };
    view.healthBar.setAttribute('aria-label', i18n.t('accessibility.health', { name }));
    view.healthBar.setAttribute('aria-valuemax', formatCombat(fighter.maxHealth));
    view.cooldownBar.setAttribute('aria-label', i18n.t('accessibility.cooldown', { name }));
    fighterElements.set(fighter, view);
    if (fighter.guardian) guardianElements.set(fighter, createGuardianVisual(fighter, elements['weapon-effects']));
    if (fighter.war) warElements.set(fighter, createWarCombatVisual(fighter, elements['weapon-effects']));
  }

  function renderFighter(fighter, battle) {
    const { elapsed } = battle;
    const view = fighterElements.get(fighter);
    const ratio = healthRatio(fighter.health, fighter.maxHealth);
    if (fighter.war) {
      renderWarCombatVisual(warElements.get(fighter), fighter, battle);
      const w = fighter.war;
      view.element.dataset.warPhase = w.swing && !w.swing.finished ? 'swing' : w.phase;
      view.element.style.setProperty('--war-facing', Math.cos(w.angle) < 0 ? '-1' : '1');
      const moving = battle.phase === 'running' && elapsed >= fighter.rootUntil && Math.hypot(fighter.vx, fighter.vy) > 0;
      const bob = moving ? Math.sin(elapsed * (w.charge ? 42 : 18)) * (w.charge ? 1.7 : .6) : 0;
      view.element.querySelector('.war-body').style.transform = `translateY(${bob}%)`;
    }
    if (fighter.guardian) {
      const { guardian } = fighter;
      const target = battle.fighters.find(other => other !== fighter);
      renderGuardianVisual(guardianElements.get(fighter), fighter, target, elapsed);
      view.shieldBar.hidden = guardian.shield <= 0;
      view.shieldBar.setAttribute('aria-label', i18n.t('battle.guardian_shield'));
      view.shieldBar.setAttribute('aria-valuenow', formatCombat(guardian.shield));
      view.shieldBar.setAttribute('aria-valuemax', formatCombat(guardian.maxShield));
      view.shieldFill.style.transform = `scaleX(${guardian.maxShield > 0 ? guardian.shield / guardian.maxShield : 0})`;
      const status = guardian.shield > 0 ? i18n.t('battle.shield_durability', { value: formatCombat(guardian.shield), maximum: formatCombat(guardian.maxShield) }) :
        guardian.flail?.phase === 'grounded' ? i18n.t('battle.flail_grounded', { seconds: Math.max(0, guardian.flail.expiresAt - elapsed).toFixed(1) }) :
        i18n.t(guardian.flail?.phase === 'returning' ? 'battle.flail_returning' : guardian.flail ? 'battle.flail_outbound' : 'battle.shield_broken');
      view.guardianState.hidden = fighter.health <= 0;
      view.guardianState.textContent = status;
      view.guardianState.dataset.tooltip = fighterTraitDescription(fighter.character, { abilities: fighter.guardianAbilities }, i18n.t);
      view.shieldBar.dataset.tooltip = status;
    }
    const effectiveCooldown = fighter.attackCooldown * priestMarkAttackCooldownFactor(fighter);
    const progress = cooldownProgress(fighter.cooldownElapsed, effectiveCooldown);
    const currentHealth = roundCombat(Math.max(0, Math.min(fighter.maxHealth, fighter.health)));
    const starSources = activeStarPassives(fighter, elapsed);
    view.starPassive.hidden = !starSources.length || fighter.health <= 0;
    view.starPassive.textContent = starSources.length ? `✦ ×${starSources.length}` : '';
    const starStatus = i18n.t('battle.star_passive', { count: starSources.length, bonus: Math.round((starAttackSpeed(fighter, elapsed) - 1) * 100) });
    view.starPassive.setAttribute('aria-label', starStatus);
    view.starPassive.dataset.tooltip = starStatus + '\n' + starSources.map(source =>
      i18n.t(`battle.star_${source}`, { seconds: Math.max(0, fighter.starPassive[source] - elapsed).toFixed(1) })).join(' · ');
    view.element.style.left = `${fighter.x / rules.size * 100}%`;
    view.element.style.top = `${fighter.y / rules.size * 100}%`;
    view.element.dataset.defeated = String(fighter.health <= 0);
    view.element.dataset.hit = String(elapsed < fighter.hitUntil);
    view.element.dataset.attacking = String(Boolean(fighter.attack));
    const zoneFactor = zoneSlowFactor(fighter, battle.zones, elapsed);
    const control = fighter.prayer ? 'praying' : elapsed < fighter.prayerInterruptedUntil ? 'prayer_interrupted' :
      elapsed < fighter.rootUntil ? 'rooted' : (elapsed < fighter.slowUntil || zoneFactor < 1) ? 'slowed' : fighter.burn?.expiresAt > elapsed ? 'burning' : fighter.bleed?.expiresAt > elapsed ? 'bleeding' : '';
    view.element.dataset.control = control;
    view.controlLabel.hidden = !control || fighter.health <= 0;
    const zoneExpiry = battle.zones.filter(zone => Math.hypot(fighter.x - zone.x, fighter.y - zone.y) <= zone.radius)
      .reduce((latest, zone) => Math.max(latest, zone.expiresAt), 0);
    view.controlLabel.textContent = control ? i18n.t(`battle.${control}`, {
      seconds: Math.max(0, (control === 'praying' ? fighter.prayer.startedAt + fighter.priestAbilities.prayerDuration : control === 'prayer_interrupted' ? fighter.prayerInterruptedUntil : control === 'rooted' ? fighter.rootUntil : control === 'burning' ? fighter.burn.expiresAt : control === 'bleeding' ? fighter.bleed.expiresAt : Math.max(fighter.slowUntil, zoneExpiry)) - elapsed).toFixed(1)
    }) : '';
    view.controlLabel.dataset.tooltip = control ? i18n.t('tooltip.status', { status: view.controlLabel.textContent }) : '';
    const marksByTheme = {};
    Object.values(fighter.marks).forEach(source => Object.entries(source).forEach(([theme, marks]) => {
      marksByTheme[theme] = (marksByTheme[theme] ?? []).concat(marks.filter(expiresAt => expiresAt > elapsed + 1e-9));
    }));
    const markEntries = Object.entries(marksByTheme).filter(([, marks]) => marks.length);
    const priestMarks = fighter.priestMarks ?? 0;
    view.arcaneMarks.hidden = (markEntries.length === 0 && priestMarks === 0) || fighter.health <= 0;
    view.arcaneMarks.innerHTML = markEntries.map(([theme, marks]) => `<span data-theme="${theme}">✦${marks.length}</span>`).join('') +
      (priestMarks ? `<span data-theme="prayer">✟${priestMarks}</span>` : '');
    view.arcaneMarks.setAttribute('aria-label', [...markEntries.map(([theme, marks]) => i18n.t('battle.element_marks', { theme: i18n.t(`battle.theme_${theme}`), count: marks.length })),
      ...(priestMarks ? [i18n.t('battle.priest_marks', { count: priestMarks })] : [])].join(', '));
    view.arcaneMarks.dataset.tooltip = priestMarks ? i18n.t('tooltip.priest_marks', { count: priestMarks }) :
      markEntries.length ? i18n.t('tooltip.element_marks', { count: markEntries.reduce((total, [, marks]) => total + marks.length, 0) }) : '';
    const command = fighter.summonAbilities;
    view.summonCommand.hidden = !command || fighter.health <= 0;
    if (command) {
      const text = `🐺 ${fighter.summonMeter}/${command.meterThreshold}`;
      view.summonCommand.textContent = text;
      view.summonCommand.setAttribute('aria-label', i18n.t('battle.command_meter', { current: fighter.summonMeter, maximum: command.meterThreshold }));
      view.summonCommand.dataset.tooltip = i18n.t('battle.command_meter', { current: fighter.summonMeter, maximum: command.meterThreshold });
    }
    view.healthBar.dataset.band = healthBand(ratio);
    view.healthBar.setAttribute('aria-valuenow', formatCombat(currentHealth));
    view.healthBar.setAttribute('aria-valuetext', `${formatCombat(currentHealth)} / ${formatCombat(fighter.maxHealth)}`);
    view.healthBar.dataset.tooltip = i18n.t('tooltip.health_state', { current: formatCombat(currentHealth), maximum: formatCombat(fighter.maxHealth) });
    view.healthFill.style.transform = `scaleX(${ratio})`;
    view.cooldownBar.dataset.ready = String(progress >= 1);
    view.cooldownBar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    view.cooldownBar.setAttribute('aria-valuetext', progress >= 1 ? i18n.t('battle.cooldown_ready') : i18n.t('battle.cooldown_progress', {
      elapsed: fighter.cooldownElapsed.toFixed(1),
      duration: effectiveCooldown
    }));
    view.cooldownBar.dataset.tooltip = progress >= 1 ? i18n.t('tooltip.cooldown_ready') : i18n.t('tooltip.cooldown_state', {
      elapsed: fighter.cooldownElapsed.toFixed(1), duration: effectiveCooldown
    });
    view.cooldownFill.style.transform = `scaleX(${progress})`;
    if (fighter.attack && !fighter.guardian && !fighter.war) updateWeaponVisual(attackElements.get(fighter.attack), fighter, elapsed);
  }

  function buildSummonElement(summon) {
    const element = document.createElement('div');
    element.className = `summon summon-${summon.kind}`;
    element.innerHTML = summon.kind === 'companion'
      ? '<span class="summon-glyph">🐺</span><div class="summon-meter"><span></span></div>'
      : '<span class="summon-glyph">🐺</span>';
    elements.battlefield.append(element);
    summonElements.set(summon, element);
  }

  function renderSummon(summon) {
    if (!summonElements.has(summon)) buildSummonElement(summon);
    const element = summonElements.get(summon);
    element.style.left = `${summon.x / rules.size * 100}%`;
    element.style.top = `${summon.y / rules.size * 100}%`;
    element.dataset.hit = String(summon.hitUntil > 0);
    element.dataset.state = summon.state ?? '';
    if (summon.kind === 'companion') {
      const ratio = healthRatio(summon.health, summon.maxHealth);
      element.querySelector('.summon-meter span').style.transform = `scaleX(${ratio})`;
      element.setAttribute('aria-label', i18n.t('battle.companion_health', { current: formatCombat(summon.health), maximum: formatCombat(summon.maxHealth) }));
    } else if (summon.kind === 'pack-wolf') {
      element.setAttribute('aria-label', i18n.t('battle.pack_wolf'));
    }
  }

  function render(battle) {
    hud.render(battle);
    battle.fighters.forEach(fighter => renderFighter(fighter, battle));
    battle.summons.forEach(renderSummon);
    battle.projectiles.forEach(projectile => {
      projectileElements.get(projectile)?.setAttribute('transform', `translate(${projectile.x} ${projectile.y}) rotate(${projectile.angle * 180 / Math.PI})`);
    });
  }

  function reset(battle) {
    rules = battle.rules ?? initialRules;
    elements['weapon-effects'].replaceChildren();
    elements['projectile-effects'].replaceChildren();
    elements['zone-effects'].replaceChildren();
    elements['combat-effects'].setAttribute('viewBox', `0 0 ${rules.size} ${rules.size}`);
    fighterElements.clear();
    guardianElements.clear();
    warElements.clear();
    summonElements.clear();
    elements.battlefield.querySelectorAll('.fighter').forEach(element => element.remove());
    elements.battlefield.querySelectorAll('.summon').forEach(element => element.remove());
    battle.fighters.forEach(buildFighterElement);
    const fighterPercent = rules.fighterSize / rules.size * 100;
    battle.fighters.forEach(fighter => {
      const element = fighterElements.get(fighter).element;
      const visualPercent = fighterPercent * (fighter.guardian ? Math.max(0.05, Math.min(100, fighter.guardianAbilities?.equipmentScale ?? GUARDIAN_VISUAL_SCALE)) : fighter.war ? WAR_VISUAL_SCALE : 1);
      element.style.width = `${visualPercent}%`;
      element.style.height = `${visualPercent}%`;
    });
    battle.summons.forEach(buildSummonElement);
    elements.battlefield.dataset.battlePhase = 'idle';
    clearResultReveal(elements.arena);
    elements.countdown.hidden = true;
    elements.countdown.textContent = '';
    elements['battle-note'].textContent = i18n.t('battle.ready');
    hud.reset(battle);
    render(battle);
  }

  function handleEvent(event) {
    const { type } = event;
    if (type === 'reset') reset(event.battle);
    else hud.handleEvent(event);
    if (type === 'attack-started' && !event.fighter.guardian && !event.fighter.war) {
      const element = createSvgEffect('weapon', weaponMarkup(event.fighter.weapon, event.attack.empowered), elements['weapon-effects']);
      element.dataset.owner = event.fighter.side;
      element.dataset.kind = event.fighter.weapon.art;
      attackElements.set(event.attack, element);
    }
    if (type === 'attack-ended') attackElements.get(event.attack)?.remove();
    if (type === 'projectile-spawned') {
      const { projectile, fighter } = event;
      const element = createSvgEffect('projectile', projectileMarkup(fighter, projectile.mode, projectile.empowered, projectile.spell), elements['projectile-effects']);
      if (fighter.starAbilities) element.querySelector('.star-thought-projectile')?.setAttribute('transform', `scale(${Math.max(0.05, Math.min(100, fighter.starAbilities.visualScale))})`);
      Object.assign(element.dataset, {
        owner: fighter.side,
        mode: String(projectile.mode + 1),
        spell: projectile.spell ?? '',
        empowered: String(projectile.empowered),
        shot: String(projectile.shot),
        spawnX: String(projectile.x),
        spawnY: String(projectile.y)
      });
      projectileElements.set(projectile, element);
    }
    if (type === 'projectile-removed') projectileElements.get(event.projectile)?.remove();
    if (type === 'summon-spawned') buildSummonElement(event.summon);
    if (type === 'summon-removed') {
      summonElements.get(event.summon)?.remove();
      summonElements.delete(event.summon);
    }
    if (type === 'zone-created') {
      const element = createSvgEffect('frost-rune', frostRuneMarkup(event.zone.radius), elements['zone-effects']);
      element.setAttribute('transform', `translate(${event.zone.x} ${event.zone.y})`);
      zoneElements.set(event.zone, element);
    }
    if (type === 'zone-removed') zoneElements.get(event.zone)?.remove();
    if (type === 'explosion') {
      const element = createSvgEffect('mage-explosion', explosionMarkup(event.radius, event.theme), elements['projectile-effects']);
      element.setAttribute('transform', `translate(${event.x} ${event.y})`);
      setTimeout(() => element.remove(), 420);
    }
    if (type === 'flail-landed') {
      const element = createSvgEffect('flail-impact', `<circle r="${event.flail.impactRadius}"/>`, elements['projectile-effects']);
      element.setAttribute('transform', `translate(${event.flail.x} ${event.flail.y}) scale(${GUARDIAN_VISUAL_SCALE})`);
      setTimeout(() => element.remove(), 360);
    }
    if (type === 'prayer-completed') {
      const element = createSvgEffect('prayer-effect', prayerMarkup(), elements['projectile-effects']);
      element.setAttribute('transform', `translate(${event.fighter.x} ${event.fighter.y})`);
      setTimeout(() => element.remove(), 620);
    }
    if (type === 'launched') {
      elements.battlefield.dataset.battlePhase = 'running';
      elements.countdown.hidden = true;
      elements['battle-note'].textContent = i18n.t('battle.running');
      elements.status.textContent = i18n.t('battle.status_running');
    }
    if (type === 'finished') {
      elements.battlefield.dataset.battlePhase = 'finished';
      showResultReveal(elements.arena, event.winner);
      elements.countdown.textContent = event.winner ? i18n.t('battle.winner', { name: i18n.t(event.winner.character.nameKey) }) : i18n.t('battle.draw');
      elements.countdown.hidden = false;
      elements['battle-note'].textContent = i18n.t('battle.finished');
      elements.status.textContent = elements.countdown.textContent;
    }
  }

  function refreshLocalization(battle) {
    hud.refreshLocalization(battle);
    battle.fighters.forEach(fighter => {
      const view = fighterElements.get(fighter);
      if (!view) return;
      const name = i18n.t(fighter.character.nameKey);
      view.element.querySelector('.fighter-name').textContent = name;
      view.healthBar.setAttribute('aria-label', i18n.t('accessibility.health', { name }));
      view.cooldownBar.setAttribute('aria-label', i18n.t('accessibility.cooldown', { name }));
    });
    if (battle.phase === 'idle') elements['battle-note'].textContent = i18n.t('battle.ready');
    if (battle.phase === 'waiting') {
      elements['battle-note'].textContent = i18n.t('battle.waiting', { seconds: Math.ceil(battle.rules.launchDelay / 1000) });
      elements.status.textContent = i18n.t('battle.status_waiting');
    }
    if (battle.phase === 'running') {
      elements['battle-note'].textContent = i18n.t('battle.running');
      elements.status.textContent = i18n.t('battle.status_running');
    }
    if (battle.phase === 'finished') {
      const result = battle.winner ? i18n.t('battle.winner', { name: i18n.t(battle.winner.character.nameKey) }) : i18n.t('battle.draw');
      elements.countdown.textContent = result;
      elements['battle-note'].textContent = i18n.t('battle.finished');
      elements.status.textContent = result;
    }
    render(battle);
  }

  return { handleEvent, render, reset, refreshLocalization };
}

export function createBattleRuntime({ engine, renderer, elements, getAppPhase, i18n, entrance = createWarEntrance({ elements, i18n }) }) {
  let frame = 0;
  let launchAt = 0;
  let lastTime = 0;
  let accumulator = 0;
  let entering = false;

  function stop() {
    entrance.stop();
    entering = false;
    cancelAnimationFrame(frame);
    frame = 0;
    launchAt = 0;
    lastTime = 0;
    accumulator = 0;
  }

  function tick(now) {
    frame = 0;
    if (getAppPhase() !== 'arena' || engine.state.phase === 'idle') return;
    if (engine.state.phase === 'waiting') {
      if (entering) {
        if (entrance.update(now)) {
          entering = false;
          engine.launch();
          lastTime = now;
        }
      } else if (now < launchAt) {
        elements.countdown.textContent = String(Math.ceil((launchAt - now) / 1000));
      } else {
        engine.launch();
        lastTime = launchAt;
      }
    }
    if (engine.state.phase === 'running') {
      const seconds = Math.min(0.25, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      accumulator += seconds * engine.state.rules.timeScale;
      while (accumulator >= engine.state.rules.step && engine.state.phase === 'running') {
        engine.step(engine.state.rules.step);
        accumulator -= engine.state.rules.step;
      }
      renderer.render(engine.state);
    } else if (engine.state.phase === 'finished') {
      engine.state.elapsed += Math.min(0.1, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      engine.updateAttacks();
      renderer.render(engine.state);
    }
    if (engine.state.phase !== 'finished' || engine.state.fighters.some(fighter => fighter.attack)) {
      frame = requestAnimationFrame(tick);
    }
  }

  function begin(selectedCharacters, matchSetup = null) {
    stop();
    engine.reset(selectedCharacters, matchSetup);
    engine.state.phase = 'waiting';
    entering = entrance.begin(engine.state);
    if (entering) {
      elements.battlefield.dataset.battlePhase = 'entrance';
      frame = requestAnimationFrame(tick);
      return;
    }
    launchAt = performance.now() + engine.state.rules.launchDelay;
    elements.battlefield.dataset.battlePhase = 'waiting';
    elements.countdown.textContent = String(Math.ceil(engine.state.rules.launchDelay / 1000));
    elements.countdown.hidden = false;
    elements['battle-note'].textContent = i18n.t('battle.waiting', { seconds: Math.ceil(engine.state.rules.launchDelay / 1000) });
    elements.status.textContent = i18n.t('battle.status_waiting');
    frame = requestAnimationFrame(tick);
  }

  return { begin, stop };
}
