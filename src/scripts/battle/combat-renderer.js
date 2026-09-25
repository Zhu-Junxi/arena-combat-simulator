import { BATTLE_RULES } from '../config/combat.js';
import { cooldownProgress, healthBand, healthRatio } from './combat-engine.js';
import { createSvgEffect, projectileMarkup, updateWeaponVisual, weaponMarkup } from './weapon-effects.js';

export function createCombatRenderer(elements, rules = BATTLE_RULES) {
  const fighterElements = new Map();
  const attackElements = new WeakMap();
  const projectileElements = new WeakMap();

  function buildFighterElement(fighter) {
    const element = elements[`fighter-${fighter.side}`];
    const { character } = fighter;
    element.classList.toggle('has-art', Boolean(character.art));
    element.innerHTML = (character.art ? `<img class="fighter-art" src="${character.art.battle}" alt="" draggable="false">` : '') +
      '<span class="fighter-name"></span><span class="control-label" hidden></span><div class="fighter-status">' +
      '<div class="fighter-meter health-bar" role="progressbar" aria-valuemin="0"><span class="fighter-meter-fill"></span></div>' +
      '<div class="fighter-meter cooldown-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"><span class="fighter-meter-fill"></span></div></div>';
    element.querySelector('.fighter-name').textContent = character.name;
    const view = {
      element,
      controlLabel: element.querySelector('.control-label'),
      healthBar: element.querySelector('.health-bar'),
      healthFill: element.querySelector('.health-bar .fighter-meter-fill'),
      cooldownBar: element.querySelector('.cooldown-bar'),
      cooldownFill: element.querySelector('.cooldown-bar .fighter-meter-fill')
    };
    view.healthBar.setAttribute('aria-label', `${character.name}血量`);
    view.healthBar.setAttribute('aria-valuemax', String(character.stats.health));
    view.cooldownBar.setAttribute('aria-label', `${character.name}攻击CD`);
    fighterElements.set(fighter, view);
  }

  function renderFighter(fighter, elapsed) {
    const view = fighterElements.get(fighter);
    const ratio = healthRatio(fighter.health, fighter.maxHealth);
    const progress = cooldownProgress(fighter.cooldownElapsed, fighter.attackCooldown);
    const currentHealth = Math.max(0, Math.min(fighter.maxHealth, fighter.health));
    view.element.style.left = `${fighter.x / rules.size * 100}%`;
    view.element.style.top = `${fighter.y / rules.size * 100}%`;
    view.element.dataset.defeated = String(fighter.health <= 0);
    view.element.dataset.hit = String(elapsed < fighter.hitUntil);
    view.element.dataset.attacking = String(Boolean(fighter.attack));
    const control = elapsed < fighter.rootUntil ? 'rooted' : elapsed < fighter.slowUntil ? 'slowed' : '';
    view.element.dataset.control = control;
    view.controlLabel.hidden = !control || fighter.health <= 0;
    view.controlLabel.textContent = control ? `${control === 'rooted' ? '禁锢 ' : '减速 '}${Math.max(0, (control === 'rooted' ? fighter.rootUntil : fighter.slowUntil) - elapsed).toFixed(1)}s` : '';
    view.healthBar.dataset.band = healthBand(ratio);
    view.healthBar.setAttribute('aria-valuenow', String(currentHealth));
    view.healthBar.setAttribute('aria-valuetext', `${currentHealth} / ${fighter.maxHealth}`);
    view.healthFill.style.transform = `scaleX(${ratio})`;
    view.cooldownBar.dataset.ready = String(progress >= 1);
    view.cooldownBar.setAttribute('aria-valuenow', String(Math.round(progress * 100)));
    view.cooldownBar.setAttribute('aria-valuetext', progress >= 1 ? '攻击就绪' : `${fighter.cooldownElapsed.toFixed(1)} / ${fighter.attackCooldown} 秒`);
    view.cooldownFill.style.transform = `scaleX(${progress})`;
    if (fighter.attack) updateWeaponVisual(attackElements.get(fighter.attack), fighter, elapsed);
  }

  function render(battle) {
    battle.fighters.forEach(fighter => renderFighter(fighter, battle.elapsed));
    battle.projectiles.forEach(projectile => {
      projectileElements.get(projectile)?.setAttribute('transform', `translate(${projectile.x} ${projectile.y}) rotate(${projectile.angle * 180 / Math.PI})`);
    });
  }

  function reset(battle) {
    elements['weapon-effects'].replaceChildren();
    elements['projectile-effects'].replaceChildren();
    fighterElements.clear();
    battle.fighters.forEach(buildFighterElement);
    elements.battlefield.dataset.battlePhase = 'idle';
    elements.countdown.hidden = true;
    elements.countdown.textContent = '';
    elements['battle-note'].textContent = '准备入场';
    render(battle);
  }

  function handleEvent(event) {
    const { type } = event;
    if (type === 'reset') reset(event.battle);
    if (type === 'attack-started') {
      const element = createSvgEffect('weapon', weaponMarkup(event.fighter.weapon, event.attack.empowered), elements['weapon-effects']);
      element.dataset.owner = event.fighter.side;
      element.dataset.kind = event.fighter.weapon.art;
      attackElements.set(event.attack, element);
    }
    if (type === 'attack-ended') attackElements.get(event.attack)?.remove();
    if (type === 'projectile-spawned') {
      const { projectile, fighter } = event;
      const element = createSvgEffect('projectile', projectileMarkup(fighter, projectile.mode, projectile.empowered), elements['projectile-effects']);
      Object.assign(element.dataset, {
        owner: fighter.side,
        mode: String(projectile.mode + 1),
        empowered: String(projectile.empowered),
        shot: String(projectile.shot),
        spawnX: String(projectile.x),
        spawnY: String(projectile.y)
      });
      projectileElements.set(projectile, element);
    }
    if (type === 'projectile-removed') projectileElements.get(event.projectile)?.remove();
    if (type === 'launched') {
      elements.battlefield.dataset.battlePhase = 'running';
      elements.countdown.hidden = true;
      elements['battle-note'].textContent = '战斗中 · 攻击就绪且目标在范围内时出手';
      elements.status.textContent = '双方已出发 · 可随时返回选角';
    }
    if (type === 'finished') {
      elements.battlefield.dataset.battlePhase = 'finished';
      elements.countdown.textContent = event.result;
      elements.countdown.hidden = false;
      elements['battle-note'].textContent = '对决结束 · 返回选角可重新开始';
      elements.status.textContent = event.result;
    }
  }

  return { handleEvent, render, reset };
}

export function createBattleRuntime({ engine, renderer, elements, getAppPhase }) {
  let frame = 0;
  let launchAt = 0;
  let lastTime = 0;
  let accumulator = 0;

  function stop() {
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
      if (now < launchAt) {
        elements.countdown.textContent = String(Math.ceil((launchAt - now) / 1000));
      } else {
        engine.launch();
        lastTime = launchAt;
      }
    }
    if (engine.state.phase === 'running') {
      const seconds = Math.min(0.25, Math.max(0, (now - lastTime) / 1000));
      lastTime = now;
      accumulator += seconds;
      while (accumulator >= BATTLE_RULES.step && engine.state.phase === 'running') {
        engine.step(BATTLE_RULES.step);
        accumulator -= BATTLE_RULES.step;
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

  function begin(selectedCharacters) {
    stop();
    engine.reset(selectedCharacters);
    engine.state.phase = 'waiting';
    launchAt = performance.now() + BATTLE_RULES.launchDelay;
    elements.battlefield.dataset.battlePhase = 'waiting';
    elements.countdown.textContent = '2';
    elements.countdown.hidden = false;
    elements['battle-note'].textContent = '准备 · 2 秒后随机方向出发';
    elements.status.textContent = '竖板已移开 · 等待双方出发';
    frame = requestAnimationFrame(tick);
  }

  return { begin, stop };
}
