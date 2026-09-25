import { BATTLE_RULES } from '../config/combat.js';
import { WEAPON_DEFINITIONS } from '../config/weapons.js';

export function healthRatio(health, maxHealth) {
  return maxHealth > 0 ? Math.max(0, Math.min(1, health / maxHealth)) : 0;
}

export function healthBand(ratio) {
  return ratio >= 0.5 ? 'healthy' : ratio >= 0.2 ? 'wounded' : 'critical';
}

export function cooldownProgress(elapsed, duration) {
  return duration > 0 ? Math.max(0, Math.min(1, elapsed / duration)) : 1;
}

export function modeValue(value, mode) {
  return Array.isArray(value) ? value[mode % value.length] : value;
}

export function facingAngle(fighter, target) {
  return Math.atan2(target.y - fighter.y, target.x - fighter.x);
}

export function smoothStep(value) {
  const bounded = Math.max(0, Math.min(1, value));
  return bounded * bounded * (3 - 2 * bounded);
}

export function weaponPose(fighter, elapsed) {
  const { attack, weapon } = fighter;
  const age = Math.max(0, elapsed - attack.startedAt);
  const prepare = smoothStep(age / weapon.windup);
  const recovery = Math.max(0, Math.min(1, (age - weapon.windup - 0.04) / (weapon.duration - weapon.windup - 0.04)));
  let angle = attack.angle;
  let shift = 0;
  if (weapon.art === 'sword') {
    angle += age < weapon.windup ? -1 + 0.22 * prepare : -0.78 + 1.65 * smoothStep((age - weapon.windup) / weapon.active);
  } else if (weapon.art === 'shield') {
    shift = age < weapon.windup ? -24 * (1 - prepare) : -18 * smoothStep(recovery);
  } else if (weapon.art === 'bow') {
    shift = age < weapon.windup ? -6 * prepare : -5 * Math.sin(recovery * Math.PI) * Math.exp(-recovery * 2);
  } else if (weapon.art === 'staff') {
    angle += age < weapon.windup ? -0.16 * (1 - prepare) : 0.08 * Math.sin(recovery * Math.PI);
    shift = age < weapon.windup ? -12 * (1 - prepare) : -9 * Math.sin(recovery * Math.PI);
  } else {
    angle += age < weapon.windup ? -0.32 * (1 - prepare) : 0.22 * Math.sin(recovery * Math.PI);
    shift = age < weapon.windup ? -8 * (1 - prepare) : -8 * smoothStep(recovery);
  }
  return { angle, shift, age };
}

export function muzzlePoint(fighter, pose) {
  const distance = fighter.weapon.muzzle + pose.shift;
  return {
    x: fighter.x + Math.cos(pose.angle) * distance,
    y: fighter.y + Math.sin(pose.angle) * distance
  };
}

export function weaponIntersectsTarget(fighter, target, pose, rules = BATTLE_RULES) {
  const { weapon } = fighter;
  const cosine = Math.cos(pose.angle);
  const sine = Math.sin(pose.angle);
  const halfLength = weapon.length / 2;
  const halfWidth = weapon.width / 2;
  const centerDistance = weapon.mount + halfLength + pose.shift;
  const dx = target.x - fighter.x - cosine * centerDistance;
  const dy = target.y - fighter.y - sine * centerDistance;
  const halfFighter = rules.fighterSize / 2;
  const targetProjection = halfFighter * (Math.abs(cosine) + Math.abs(sine));
  return Math.abs(dx) <= halfFighter + Math.abs(cosine) * halfLength + Math.abs(sine) * halfWidth &&
    Math.abs(dy) <= halfFighter + Math.abs(sine) * halfLength + Math.abs(cosine) * halfWidth &&
    Math.abs(dx * cosine + dy * sine) <= halfLength + targetProjection &&
    Math.abs(-dx * sine + dy * cosine) <= halfWidth + targetProjection;
}

export function canAttack(fighter, target, rules = BATTLE_RULES) {
  if (!target || fighter.health <= 0 || target.health <= 0) return false;
  return fighter.weapon.type === 'ranged' || weaponIntersectsTarget(
    fighter,
    target,
    { angle: facingAngle(fighter, target), shift: 0 },
    rules
  );
}

export function dealDamage(target, amount, elapsed = 0) {
  if (target.health <= 0 || amount <= 0) return 0;
  const reduction = target.character.trait?.id === 'plate' ? target.character.trait.reduction : 0;
  const damage = Math.max(1, amount - reduction);
  const previousHealth = target.health;
  target.health = Math.max(0, target.health - damage);
  target.hitUntil = elapsed + 0.12;
  return previousHealth - target.health;
}

export function isVineShot(fighter, shotNumber) {
  const trait = fighter.character.trait;
  return trait?.id === 'vine' && shotNumber > 0 && shotNumber % trait.every === 0;
}

export function applyVines(target, trait, elapsed = 0) {
  if (target.health <= 0) return;
  target.rootUntil = Math.max(target.rootUntil, elapsed + trait.rootDuration);
  target.slowUntil = Math.max(target.slowUntil, target.rootUntil + trait.slowDuration);
  target.slowFactor = trait.slowFactor;
}

export function movementFactor(fighter, now) {
  if (now < fighter.rootUntil - 1e-9) return 0;
  return now < fighter.slowUntil - 1e-9 ? fighter.slowFactor : 1;
}

export function segmentBoxTime(x0, y0, x1, y1, half) {
  let enter = 0;
  let exit = 1;
  for (const [origin, delta] of [[x0, x1 - x0], [y0, y1 - y0]]) {
    if (Math.abs(delta) < 1e-9) {
      if (Math.abs(origin) > half) return null;
    } else {
      const first = (-half - origin) / delta;
      const second = (half - origin) / delta;
      enter = Math.max(enter, Math.min(first, second));
      exit = Math.min(exit, Math.max(first, second));
      if (enter > exit) return null;
    }
  }
  return enter;
}

export function createFighter(side, character, weapon, index) {
  const x = index === 0 ? 250 : 750;
  return {
    side,
    character,
    weapon,
    health: character.stats.health,
    maxHealth: character.stats.health,
    attackMode: 0,
    attackCooldown: modeValue(character.stats.attackCD, 0),
    cooldownElapsed: 0,
    attack: null,
    hitUntil: 0,
    attacksFired: 0,
    rootUntil: 0,
    slowUntil: 0,
    slowFactor: 1,
    x,
    y: 500,
    prevX: x,
    prevY: 500,
    vx: 0,
    vy: 0
  };
}

export function advanceMovement(fighters, seconds, now, rules = BATTLE_RULES) {
  const half = rules.fighterSize / 2;
  const min = half;
  const max = rules.size - half;
  const epsilon = 1e-8;
  const factor = fighter => movementFactor(fighter, now);
  const velocity = (fighter, axis) => fighter[`v${axis}`] * factor(fighter);
  let remaining = seconds;

  while (remaining > epsilon) {
    let nextTime = remaining;
    let contacts = [];
    const consider = (time, contact) => {
      if (time < -epsilon || time > nextTime + epsilon) return;
      const boundedTime = Math.max(0, time);
      if (boundedTime < nextTime - epsilon) {
        nextTime = boundedTime;
        contacts = [];
      }
      contacts.push(contact);
    };

    fighters.forEach(fighter => {
      for (const axis of ['x', 'y']) {
        const speed = velocity(fighter, axis);
        if (Math.abs(speed) > epsilon) {
          consider(((speed > 0 ? max : min) - fighter[axis]) / speed, { type: 'wall', fighter, axis });
        }
      }
    });

    const [first, second] = fighters;
    let entry = -Infinity;
    let exit = Infinity;
    let possible = true;
    for (const axis of ['x', 'y']) {
      const distance = second[axis] - first[axis];
      const relative = velocity(second, axis) - velocity(first, axis);
      if (Math.abs(relative) < epsilon) {
        if (Math.abs(distance) >= rules.fighterSize - epsilon) possible = false;
      } else {
        const firstTime = (-rules.fighterSize - distance) / relative;
        const secondTime = (rules.fighterSize - distance) / relative;
        entry = Math.max(entry, Math.min(firstTime, secondTime));
        exit = Math.min(exit, Math.max(firstTime, secondTime));
      }
    }
    if (possible && entry >= -epsilon && entry <= exit + epsilon && exit > epsilon) {
      consider(entry, { type: 'fighters' });
    }

    fighters.forEach(fighter => {
      fighter.x += velocity(fighter, 'x') * nextTime;
      fighter.y += velocity(fighter, 'y') * nextTime;
    });
    remaining -= nextTime;
    if (!contacts.length) break;

    if (contacts.some(contact => contact.type === 'fighters')) {
      if (Math.abs(factor(first) - factor(second)) < epsilon) {
        [first.vx, second.vx] = [second.vx, first.vx];
        [first.vy, second.vy] = [second.vy, first.vy];
      } else {
        fighters.forEach(fighter => {
          if (factor(fighter) > 0) {
            fighter.vx *= -1;
            fighter.vy *= -1;
          }
        });
      }
    }

    fighters.forEach(fighter => {
      for (const axis of ['x', 'y']) {
        fighter[axis] = Math.max(min, Math.min(max, fighter[axis]));
        if (factor(fighter) > 0 && (
          (fighter[axis] <= min + epsilon && fighter[`v${axis}`] < 0) ||
          (fighter[axis] >= max - epsilon && fighter[`v${axis}`] > 0)
        )) {
          fighter[`v${axis}`] *= -1;
        }
      }
    });
  }
}

export function createCombatEngine({
  rules = BATTLE_RULES,
  weapons = WEAPON_DEFINITIONS,
  random = Math.random,
  onEvent = () => {}
} = {}) {
  const battle = { phase: 'idle', elapsed: 0, fighters: [], projectiles: [] };
  const emit = (type, detail = {}) => onEvent({ type, battle, ...detail });

  function reset(selectedCharacters) {
    battle.phase = 'idle';
    battle.elapsed = 0;
    battle.projectiles = [];
    battle.fighters = ['left', 'right'].map((side, index) => {
      const character = selectedCharacters[side];
      return createFighter(side, character, weapons[character.id], index);
    });
    emit('reset');
    return battle;
  }

  function startAttack(fighter, target) {
    const attack = {
      target,
      startedAt: battle.elapsed,
      angle: facingAngle(fighter, target),
      empowered: isVineShot(fighter, fighter.attacksFired + 1),
      mode: fighter.attackMode,
      damage: modeValue(fighter.character.stats.attack, fighter.attackMode),
      released: false,
      hit: false
    };
    fighter.attack = attack;
    emit('attack-started', { fighter, attack });
    return attack;
  }

  function spawnProjectile(fighter) {
    const { attack } = fighter;
    const pose = weaponPose(fighter, battle.elapsed);
    const muzzle = muzzlePoint(fighter, pose);
    const projectile = {
      owner: fighter,
      target: attack.target,
      damage: attack.damage,
      mode: attack.mode,
      shot: fighter.attacksFired,
      empowered: Boolean(attack.empowered),
      x: muzzle.x,
      y: muzzle.y,
      angle: pose.angle,
      vx: Math.cos(pose.angle) * fighter.weapon.projectileSpeed,
      vy: Math.sin(pose.angle) * fighter.weapon.projectileSpeed,
      radius: fighter.weapon.radius,
      age: 0
    };
    battle.projectiles.push(projectile);
    emit('projectile-spawned', { fighter, projectile });
    return projectile;
  }

  function updateAttacks() {
    const alive = battle.phase === 'running';
    battle.fighters.forEach((fighter, index) => {
      const target = battle.fighters[1 - index];
      if (alive && !fighter.attack && fighter.cooldownElapsed >= fighter.attackCooldown - 1e-9 && canAttack(fighter, target, rules)) {
        startAttack(fighter, target);
      }
      const { attack } = fighter;
      if (!attack) return;
      const { weapon } = fighter;
      const age = battle.elapsed - attack.startedAt;
      if (alive && !attack.released && fighter.health > 0 && target.health > 0) {
        attack.angle = facingAngle(fighter, target);
        if (age >= weapon.windup - 1e-9) {
          attack.released = true;
          fighter.cooldownElapsed = 0;
          fighter.attacksFired += 1;
          attack.empowered = isVineShot(fighter, fighter.attacksFired);
          if (weapon.type === 'ranged') spawnProjectile(fighter);
          const modeCount = Array.isArray(fighter.character.stats.attack) ? fighter.character.stats.attack.length : 1;
          fighter.attackMode = (attack.mode + 1) % modeCount;
          fighter.attackCooldown = modeValue(fighter.character.stats.attackCD, fighter.attackMode);
          emit('attack-released', { fighter, attack });
        }
      }
      if (alive && attack.released && !attack.hit && fighter.health > 0 && target.health > 0 &&
          weapon.type === 'melee' && age <= weapon.windup + weapon.active &&
          weaponIntersectsTarget(fighter, target, weaponPose(fighter, battle.elapsed), rules)) {
        dealDamage(target, attack.damage, battle.elapsed);
        attack.hit = true;
        emit('damage', { fighter, target, amount: attack.damage });
      }
      if (age >= weapon.duration) {
        emit('attack-ended', { fighter, attack });
        fighter.attack = null;
      }
    });
  }

  function updateProjectiles(seconds) {
    battle.projectiles = battle.projectiles.filter(projectile => {
      const { target } = projectile;
      const nextX = projectile.x + projectile.vx * seconds;
      const nextY = projectile.y + projectile.vy * seconds;
      const hit = target.health > 0 ? segmentBoxTime(
        projectile.x - target.prevX,
        projectile.y - target.prevY,
        nextX - target.x,
        nextY - target.y,
        rules.fighterSize / 2 + projectile.radius
      ) : null;
      projectile.age += seconds;
      if (hit !== null) {
        dealDamage(target, projectile.damage, battle.elapsed);
        if (projectile.empowered) applyVines(target, projectile.owner.character.trait, battle.elapsed);
        emit('projectile-removed', { projectile, reason: 'hit' });
        emit('damage', { fighter: projectile.owner, target, amount: projectile.damage });
        return false;
      }
      projectile.x = nextX;
      projectile.y = nextY;
      if (projectile.age > 5 || nextX < -30 || nextX > rules.size + 30 || nextY < -30 || nextY > rules.size + 30) {
        emit('projectile-removed', { projectile, reason: 'expired' });
        return false;
      }
      return true;
    });
  }

  function advance(seconds) {
    const end = battle.elapsed + seconds;
    let now = battle.elapsed;
    while (now < end - 1e-10) {
      let until = end;
      battle.fighters.forEach(fighter => {
        for (const expiry of [fighter.rootUntil, fighter.slowUntil]) {
          if (expiry > now + 1e-9 && expiry < until) until = expiry;
        }
      });
      advanceMovement(battle.fighters, until - now, now, rules);
      now = until;
    }
  }

  function finish() {
    battle.phase = 'finished';
    battle.projectiles.forEach(projectile => emit('projectile-removed', { projectile, reason: 'finished' }));
    battle.projectiles = [];
    battle.fighters.forEach(fighter => {
      fighter.vx = 0;
      fighter.vy = 0;
    });
    const winner = battle.fighters.find(fighter => fighter.health > 0);
    const result = winner ? `${winner.character.name} 获胜` : '平局';
    emit('finished', { winner, result });
    return result;
  }

  function step(seconds) {
    if (battle.phase !== 'running') return;
    battle.fighters.forEach(fighter => {
      fighter.prevX = fighter.x;
      fighter.prevY = fighter.y;
    });
    advance(seconds);
    battle.elapsed += seconds;
    battle.fighters.forEach(fighter => {
      fighter.cooldownElapsed = Math.min(fighter.attackCooldown, fighter.cooldownElapsed + seconds);
    });
    updateProjectiles(seconds);
    updateAttacks();
    if (battle.fighters.some(fighter => fighter.health <= 0)) finish();
  }

  function launch() {
    const firstAngle = random() * Math.PI * 2;
    const angles = [firstAngle, firstAngle + Math.PI / 3 + random() * Math.PI * 4 / 3];
    battle.fighters.forEach((fighter, index) => {
      fighter.vx = Math.cos(angles[index]) * rules.speed;
      fighter.vy = Math.sin(angles[index]) * rules.speed;
    });
    battle.phase = 'running';
    emit('launched');
  }

  function stop() {
    battle.phase = 'idle';
    emit('stopped');
  }

  return { state: battle, reset, startAttack, updateAttacks, updateProjectiles, advance, step, launch, finish, stop };
}
