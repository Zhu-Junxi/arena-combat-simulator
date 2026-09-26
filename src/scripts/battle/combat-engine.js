import { BATTLE_RULES } from '../config/combat.js';
import { WEAPON_DEFINITIONS } from '../config/weapons.js';
import { defaultMageAbilities, defaultPriestAbilities } from '../config/customization.js';

export const MAGE_CYCLES = Object.freeze(['ice', 'fire', 'leech']);
export const MAGE_SPELLS = Object.freeze(['normal', 'theme', 'final']);

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
  const halfLength = (fighter.attackRange ?? weapon.length) / 2;
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
  const reduction = target.trait?.id === 'plate' ? target.trait.reduction : 0;
  const damage = Math.max(1, amount - reduction);
  const previousHealth = target.health;
  target.health = Math.max(0, target.health - damage);
  target.hitUntil = elapsed + 0.12;
  return previousHealth - target.health;
}

export function isVineShot(fighter, shotNumber) {
  const trait = fighter.trait;
  return trait?.id === 'vine' && shotNumber > 0 && shotNumber % trait.every === 0;
}

export function applyVines(target, trait, elapsed = 0, durationScale = 1) {
  if (target.health <= 0) return;
  target.rootUntil = Math.max(target.rootUntil, elapsed + trait.rootDuration * durationScale);
  target.slowUntil = Math.max(target.slowUntil, target.rootUntil + trait.slowDuration * durationScale);
  target.slowFactor = trait.slowFactor;
}

export function activeMarks(fighter, theme, now) {
  fighter.marks[theme] = fighter.marks[theme].filter(expiresAt => expiresAt > now + 1e-9);
  return fighter.marks[theme].length;
}

export function applyMark(target, theme, abilities, elapsed = 0) {
  activeMarks(target, theme, elapsed);
  if (target.marks[theme].length < abilities.effects.maxMarks) target.marks[theme].push(elapsed + abilities.effects.markDuration);
  return target.marks[theme].length;
}

export function consumeMarks(target, theme, elapsed = 0) {
  const count = activeMarks(target, theme, elapsed);
  target.marks[theme] = [];
  return count;
}

export function applyPriestMark(target, abilities, elapsed = 0) {
  target.priestMarks += 1;
  target.priestMarkEffects = abilities;
  if (target.priestMarks > abilities.decayFloor && target.priestMarkDecayAt == null) {
    target.priestMarkDecayAt = elapsed + abilities.decayInterval;
  }
  return target.priestMarks;
}

export function consumePriestMarks(target) {
  const count = target.priestMarks;
  target.priestMarks = 0;
  target.priestMarkDecayAt = null;
  target.priestMarkEffects = null;
  return count;
}

export function priestMarkMovementFactor(fighter) {
  const effects = fighter.priestMarkEffects;
  return effects ? Math.max(0.1, 1 - fighter.priestMarks * effects.markMoveSlowPerMark) : 1;
}

export function priestMarkAttackCooldownFactor(fighter) {
  const effects = fighter.priestMarkEffects;
  return effects ? 1 + fighter.priestMarks * effects.markAttackSlowPerMark : 1;
}

export function healFighter(fighter, amount) {
  const healed = Math.max(0, Math.min(amount, fighter.maxHealth - fighter.health));
  fighter.health += healed;
  return healed;
}

export function zoneSlowFactor(fighter, zones = [], now = 0) {
  return zones.reduce((factor, zone) => {
    if (zone.expiresAt <= now + 1e-9) return factor;
    return Math.hypot(fighter.x - zone.x, fighter.y - zone.y) <= zone.radius ? Math.min(factor, zone.slowFactor) : factor;
  }, 1);
}

export function movementFactor(fighter, now, zones = []) {
  if (now < fighter.rootUntil - 1e-9) return 0;
  const timedFactor = now < fighter.slowUntil - 1e-9 ? fighter.slowFactor : 1;
  const prayerFactor = fighter.prayer ? fighter.priestAbilities.prayerMoveFactor : 1;
  return Math.min(timedFactor, zoneSlowFactor(fighter, zones, now)) * prayerFactor * priestMarkMovementFactor(fighter);
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

export function createFighter(side, character, weapon, index, settings = null, rules = BATTLE_RULES) {
  const health = settings?.health ?? character.stats.health;
  const attackValues = settings?.attack ?? character.stats.attack;
  const attackCooldownValues = settings?.attackCD ?? character.stats.attackCD;
  const movementSpeed = settings?.movementSpeed ?? rules.speed;
  const mageAbilities = character.trait?.id === 'elemental-cycles' ? settings?.abilities ?? defaultMageAbilities() : null;
  const priestAbilities = character.trait?.id === 'prayer' ? settings?.abilities ?? defaultPriestAbilities() : null;
  const x = rules.size / 2 + (index === 0 ? -1 : 1) * rules.startingDistance / 2;
  return {
    side,
    character,
    trait: { ...character.trait, ...settings?.trait },
    weapon,
    health,
    maxHealth: health,
    attackValues,
    attackCooldownValues,
    movementSpeed,
    projectileSpeed: settings?.projectileSpeed ?? weapon.projectileSpeed,
    attackRange: settings?.attackRange ?? weapon.length,
    attackMode: 0,
    attackCooldown: priestAbilities?.markCooldown ?? modeValue(attackCooldownValues, 0),
    cooldownElapsed: 0,
    attack: null,
    hitUntil: 0,
    attacksFired: 0,
    marks: Object.fromEntries(MAGE_CYCLES.map(theme => [theme, []])),
    mageCycle: null,
    mageSpellIndex: 0,
    mageAbilities,
    priestAbilities,
    prayer: null,
    prayerCooldownUntil: 0,
    prayerInterruptedUntil: 0,
    priestMarks: 0,
    priestMarkDecayAt: null,
    priestMarkEffects: null,
    burn: null,
    bleed: null,
    rootUntil: 0,
    slowUntil: 0,
    slowFactor: 1,
    x,
    y: rules.size / 2,
    prevX: x,
    prevY: rules.size / 2,
    vx: 0,
    vy: 0
  };
}

export function advanceMovement(fighters, seconds, now, rules = BATTLE_RULES, zones = []) {
  const half = rules.fighterSize / 2;
  const min = half;
  const max = rules.size - half;
  const epsilon = 1e-8;
  let elapsed = 0;
  const factor = fighter => movementFactor(fighter, now + elapsed, zones);
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
      if (fighter.rootUntil > now + elapsed + epsilon) {
        consider(fighter.rootUntil - (now + elapsed), { type: 'root-expiry' });
      }
    });

    const [first, second] = fighters;
    if (rules.collisionMode !== 'pass') {
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
    }

    fighters.forEach(fighter => {
      fighter.x += velocity(fighter, 'x') * nextTime;
      fighter.y += velocity(fighter, 'y') * nextTime;
    });
    remaining -= nextTime;
    elapsed += nextTime;
    if (!contacts.length) break;

    if (contacts.some(contact => contact.type === 'fighters')) {
      if (rules.collisionMode === 'stop') {
        const stopUntil = now + elapsed + (rules.contactStopDuration ?? BATTLE_RULES.contactStopDuration);
        fighters.forEach(fighter => {
          fighter.rootUntil = Math.max(fighter.rootUntil, stopUntil);
          // Resume away from the contact once the pause ends, avoiding another immediate stop.
          fighter.vx *= -1;
          fighter.vy *= -1;
        });
      } else if (Math.abs(factor(first) - factor(second)) < epsilon) {
        const firstSpeed = Math.hypot(first.vx, first.vy);
        const secondSpeed = Math.hypot(second.vx, second.vy);
        if (firstSpeed > epsilon && secondSpeed > epsilon) {
          const firstVelocity = { x: first.vx, y: first.vy };
          first.vx = second.vx / secondSpeed * firstSpeed;
          first.vy = second.vy / secondSpeed * firstSpeed;
          second.vx = firstVelocity.x / firstSpeed * secondSpeed;
          second.vy = firstVelocity.y / firstSpeed * secondSpeed;
        } else {
          fighters.forEach(fighter => { fighter.vx *= -1; fighter.vy *= -1; });
        }
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
  const baseRules = Object.freeze({ ...BATTLE_RULES, ...rules });
  const battle = { phase: 'idle', elapsed: 0, fighters: [], projectiles: [], zones: [], winner: null, rules: baseRules };
  const emit = (type, detail = {}) => onEvent({ type, battle, ...detail });

  function reset(selectedCharacters, matchSetup = null) {
    battle.phase = 'idle';
    battle.elapsed = 0;
    battle.projectiles = [];
    battle.zones = [];
    battle.winner = null;
    battle.rules = Object.freeze({ ...baseRules, ...matchSetup?.arena });
    battle.fighters = ['left', 'right'].map((side, index) => {
      const character = selectedCharacters[side];
      return createFighter(side, character, weapons[character.id], index, matchSetup?.fighters?.[side], battle.rules);
    });
    emit('reset');
    return battle;
  }

  function isElementalMage(fighter) {
    return fighter.trait?.id === 'elemental-cycles';
  }

  function isPriest(fighter) {
    return fighter.trait?.id === 'prayer';
  }

  function prepareMageCycle(fighter) {
    if (!isElementalMage(fighter) || fighter.mageCycle) return;
    fighter.mageCycle = MAGE_CYCLES[Math.min(MAGE_CYCLES.length - 1, Math.floor(random() * MAGE_CYCLES.length))];
    fighter.mageSpellIndex = 0;
    fighter.attackMode = 0;
    fighter.attackCooldown = fighter.mageAbilities.cycles[fighter.mageCycle][0].cooldown;
  }

  function advanceAttackMode(fighter, attack) {
    if (isPriest(fighter)) {
      fighter.attackCooldown = fighter.priestAbilities.markCooldown;
      return;
    }
    if (!isElementalMage(fighter)) {
      const modeCount = Array.isArray(fighter.attackValues) ? fighter.attackValues.length : 1;
      fighter.attackMode = (attack.mode + 1) % modeCount;
      fighter.attackCooldown = modeValue(fighter.attackCooldownValues, fighter.attackMode);
      return;
    }
    fighter.mageSpellIndex += 1;
    if (fighter.mageSpellIndex < MAGE_SPELLS.length) {
      fighter.attackMode = fighter.mageSpellIndex;
      fighter.attackCooldown = fighter.mageAbilities.cycles[fighter.mageCycle][fighter.mageSpellIndex].cooldown;
    } else {
      fighter.mageCycle = null;
      fighter.mageSpellIndex = 0;
      fighter.attackCooldown = attack.cooldown;
    }
  }

  function startAttack(fighter, target) {
    prepareMageCycle(fighter);
    const elemental = isElementalMage(fighter);
    const priest = isPriest(fighter);
    const spell = elemental ? fighter.mageAbilities.cycles[fighter.mageCycle][fighter.mageSpellIndex] : null;
    const attack = {
      target,
      startedAt: battle.elapsed,
      angle: facingAngle(fighter, target),
      empowered: isVineShot(fighter, fighter.attacksFired + 1),
      mode: fighter.attackMode,
      spell: elemental ? `${fighter.mageCycle}-${MAGE_SPELLS[fighter.mageSpellIndex]}` : priest ? 'priest-mark' : null,
      theme: elemental ? fighter.mageCycle : null,
      slot: elemental ? fighter.mageSpellIndex : fighter.attackMode,
      cooldown: elemental ? spell.cooldown : priest ? fighter.priestAbilities.markCooldown : modeValue(fighter.attackCooldownValues, fighter.attackMode),
      damage: priest ? 0 : elemental ? spell.damage : modeValue(fighter.attackValues, fighter.attackMode),
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
      spell: attack.spell,
      theme: attack.theme,
      slot: attack.slot,
      shot: fighter.attacksFired,
      empowered: Boolean(attack.empowered),
      priestMark: isPriest(fighter),
      x: muzzle.x,
      y: muzzle.y,
      angle: pose.angle,
      vx: Math.cos(pose.angle) * fighter.projectileSpeed * battle.rules.projectileSpeedScale,
      vy: Math.sin(pose.angle) * fighter.projectileSpeed * battle.rules.projectileSpeedScale,
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
      updatePrayer(fighter, target);
      if (!fighter.attack) prepareMageCycle(fighter);
      if (alive && !fighter.attack && fighter.cooldownElapsed >= fighter.attackCooldown * priestMarkAttackCooldownFactor(fighter) - 1e-9 && canAttack(fighter, target, battle.rules)) {
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
          advanceAttackMode(fighter, attack);
          emit('attack-released', { fighter, attack });
        }
      }
      if (alive && attack.released && !attack.hit && fighter.health > 0 && target.health > 0 &&
          weapon.type === 'melee' && age <= weapon.windup + weapon.active &&
          weaponIntersectsTarget(fighter, target, weaponPose(fighter, battle.elapsed), battle.rules)) {
        applyDirectDamage(fighter, target, attack.damage);
        attack.hit = true;
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
        battle.rules.fighterSize / 2 + projectile.radius
      ) : null;
      projectile.age += seconds;
      if (hit !== null) {
        if (projectile.priestMark) {
          const marks = applyPriestMark(target, projectile.owner.priestAbilities, battle.elapsed);
          emit('priest-marked', { fighter: projectile.owner, target, marks });
          emit('projectile-removed', { projectile, reason: 'hit' });
          return false;
        }
        let damage = projectile.damage;
        const trait = projectile.owner.trait;
        const abilities = projectile.owner.mageAbilities;
        if (trait?.id === 'elemental-cycles' && abilities) {
          const { theme, slot } = projectile;
          if (slot < 2) {
            applyMark(target, theme, abilities, battle.elapsed);
            if (slot === 1) {
              const effects = abilities.effects;
              if (theme === 'ice') {
                target.slowUntil = Math.max(target.slowUntil, battle.elapsed + effects.iceSlowDuration);
                target.slowFactor = effects.iceSlowFactor;
              }
              if (theme === 'fire') target.burn = { dps: effects.fireBurnDamage, expiresAt: battle.elapsed + effects.fireBurnDuration };
              if (theme === 'leech') target.bleed = { dps: effects.leechBleedDamage, expiresAt: battle.elapsed + effects.leechBleedDuration };
            }
          } else {
            const marks = consumeMarks(target, theme, battle.elapsed);
            const effects = abilities.effects;
            damage += marks * effects.damagePerMark;
            if (theme === 'ice') {
              target.rootUntil = Math.max(target.rootUntil, battle.elapsed + effects.iceFreezeBase + marks * effects.iceFreezePerMark);
              if (marks === effects.maxMarks) damage += effects.iceBurstDamage;
            }
            if (theme === 'fire' && marks === effects.maxMarks) target.burn = { dps: effects.fireMaxBurnDamage, expiresAt: battle.elapsed + effects.fireMaxBurnDuration };
            if (theme === 'leech') {
              const healed = healFighter(projectile.owner, effects.leechHealBase + marks * effects.leechHealPerMark);
              if (healed) emit('healed', { fighter: projectile.owner, amount: healed });
              if (marks === effects.maxMarks) target.bleed = { dps: effects.leechMaxBleedDamage, expiresAt: battle.elapsed + effects.leechMaxBleedDuration };
            }
            if (theme === 'fire') emit('explosion', { x: target.x, y: target.y, radius: effects.fireExplosionRadius, theme });
            if (theme === 'ice' && marks === effects.maxMarks) emit('explosion', { x: target.x, y: target.y, radius: effects.iceBurstRadius, theme });
          }
        }
        applyDirectDamage(projectile.owner, target, damage);
        if (projectile.empowered) applyVines(target, projectile.owner.trait, battle.elapsed, battle.rules.controlDurationScale);
        emit('projectile-removed', { projectile, reason: 'hit' });
        return false;
      }
      projectile.x = nextX;
      projectile.y = nextY;
      if (projectile.age > 5 || nextX < -30 || nextX > battle.rules.size + 30 || nextY < -30 || nextY > battle.rules.size + 30) {
        emit('projectile-removed', { projectile, reason: 'expired' });
        return false;
      }
      return true;
    });
  }

  function startPrayer(fighter, target) {
    fighter.prayer = { startedAt: battle.elapsed, target };
    emit('prayer-started', { fighter, target });
  }

  function interruptPrayer(target) {
    if (!target.prayer || !target.priestAbilities) return false;
    target.prayer = null;
    target.prayerInterruptedUntil = battle.elapsed + target.priestAbilities.interruptLockout;
    emit('prayer-interrupted', { fighter: target });
    return true;
  }

  function applyDirectDamage(fighter, target, amount) {
    const dealt = dealDamage(target, amount, battle.elapsed);
    if (dealt > 0) {
      interruptPrayer(target);
      emit('damage', { fighter, target, amount: dealt });
    }
    return dealt;
  }

  function updatePrayer(fighter, target) {
    if (!isPriest(fighter) || fighter.health <= 0 || target.health <= 0) return;
    const effects = fighter.priestAbilities;
    if (fighter.prayer && battle.elapsed >= fighter.prayer.startedAt + effects.prayerDuration - 1e-9) {
      const marks = consumePriestMarks(target);
      const healed = healFighter(fighter, effects.baseHeal + marks * effects.healPerMark);
      const damage = applyDirectDamage(fighter, target, effects.baseDamage + marks * effects.damagePerMark);
      fighter.prayer = null;
      fighter.prayerCooldownUntil = battle.elapsed + effects.prayerCooldown;
      if (healed) emit('healed', { fighter, amount: healed });
      emit('prayer-completed', { fighter, target, marks, healed, damage });
    }
    if (!fighter.prayer && target.priestMarks > 0 && battle.elapsed >= fighter.prayerCooldownUntil - 1e-9 &&
        battle.elapsed >= fighter.prayerInterruptedUntil - 1e-9) {
      startPrayer(fighter, target);
    }
  }

  function updatePriestMarkDecay() {
    battle.fighters.forEach((fighter, index) => {
      if (!isPriest(fighter)) return;
      const target = battle.fighters[1 - index];
      const effects = fighter.priestAbilities;
      let decayed = 0;
      while (target.priestMarks > effects.decayFloor && target.priestMarkDecayAt != null &&
             battle.elapsed >= target.priestMarkDecayAt - 1e-9) {
        const next = Math.max(effects.decayFloor, target.priestMarks - effects.decayAmount);
        decayed += target.priestMarks - next;
        target.priestMarks = next;
        target.priestMarkDecayAt += effects.decayInterval;
      }
      if (target.priestMarks <= effects.decayFloor) target.priestMarkDecayAt = null;
      if (target.priestMarks === 0) target.priestMarkEffects = null;
      if (decayed) emit('priest-marks-decayed', { fighter, target, amount: decayed, marks: target.priestMarks });
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
      battle.zones.forEach(zone => {
        if (zone.expiresAt > now + 1e-9 && zone.expiresAt < until) until = zone.expiresAt;
      });
      advanceMovement(battle.fighters, until - now, now, battle.rules, battle.zones);
      now = until;
    }
  }

  function applyDamageOverTime(seconds) {
    battle.fighters.forEach(target => {
      for (const type of ['burn', 'bleed']) {
        const effect = target[type];
        if (!effect) continue;
        const activeSeconds = Math.max(0, Math.min(seconds, effect.expiresAt - (battle.elapsed - seconds)));
        if (activeSeconds > 0 && effect.dps > 0) {
          const amount = effect.dps * activeSeconds;
          target.health = Math.max(0, target.health - amount);
          target.hitUntil = battle.elapsed + 0.12;
          emit('damage-over-time', { target, type, amount });
        }
        if (effect.expiresAt <= battle.elapsed + 1e-9) target[type] = null;
      }
    });
  }

  function updateZones() {
    battle.zones = battle.zones.filter(zone => {
      if (zone.expiresAt > battle.elapsed + 1e-9) return true;
      emit('zone-removed', { zone });
      return false;
    });
  }

  function finish() {
    battle.phase = 'finished';
    battle.projectiles.forEach(projectile => emit('projectile-removed', { projectile, reason: 'finished' }));
    battle.projectiles = [];
    battle.zones.forEach(zone => emit('zone-removed', { zone }));
    battle.zones = [];
    battle.fighters.forEach(fighter => {
      fighter.vx = 0;
      fighter.vy = 0;
    });
    const winner = battle.fighters.find(fighter => fighter.health > 0);
    battle.winner = winner ?? null;
    emit('finished', { winner });
    return winner;
  }

  function step(seconds) {
    if (battle.phase !== 'running') return;
    battle.fighters.forEach(fighter => {
      fighter.prevX = fighter.x;
      fighter.prevY = fighter.y;
    });
    advance(seconds);
    battle.elapsed += seconds;
    updateZones();
    updatePriestMarkDecay();
    applyDamageOverTime(seconds);
    battle.fighters.forEach(fighter => {
      fighter.cooldownElapsed += seconds;
    });
    updateProjectiles(seconds);
    updateAttacks();
    if (battle.fighters.some(fighter => fighter.health <= 0)) finish();
  }

  function launch() {
    const firstAngle = random() * Math.PI * 2;
    const angles = [firstAngle, firstAngle + Math.PI / 3 + random() * Math.PI * 4 / 3];
    battle.fighters.forEach((fighter, index) => {
      fighter.vx = Math.cos(angles[index]) * fighter.movementSpeed;
      fighter.vy = Math.sin(angles[index]) * fighter.movementSpeed;
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
