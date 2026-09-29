import { createGuardianState, absorbShieldDamage, beginCharge, createFlail, advanceFlail, resolveChainWalls } from './guardian.js';
import { createWarState, warSwordPose, warSweepTouches, beginWarAttack, beginWarSwing, stopWarCharge, resetWarCycle } from './war-combat.js';
import { BATTLE_RULES } from '../config/combat.js';
import { createStarLaunch, createStarFlight, advanceStarFlight } from './star-flight.js';
import { grantStarPassive, starCooldownAdvance } from './star-passive.js';
import { WEAPON_DEFINITIONS } from '../config/weapons.js';
import { defaultMageAbilities, defaultPriestAbilities, defaultSummonAbilities, defaultGuardianAbilities, defaultStarAbilities, defaultWarAbilities } from '../config/customization.js';
import { COMBAT_RESOLUTION, removeCombatHealth, restoreCombatHealth, roundCombat } from './combat-precision.js';

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
  if (fighter.war) return warSwordPose(fighter, elapsed);
  const { attack, weapon } = fighter;
  const age = Math.max(0, elapsed - attack.startedAt + (attack.hasteAgeBonus ?? 0));
  const prepare = smoothStep(age / Math.max(0.001, weapon.windup));
  const recovery = Math.max(0, Math.min(1, (age - weapon.windup - 0.04) / Math.max(0.001, weapon.duration - weapon.windup - 0.04)));
  let angle = attack.angle;
  let shift = 0;
  if (weapon.art === 'sword' || weapon.art === 'war-sword') {
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
  if (fighter.war) return fighter.war.phase === 'move';
  if (fighter.guardian) {
    if (fighter.guardian.flail || fighter.guardian.dash) return false;
    const abilities = fighter.guardianAbilities ?? defaultGuardianAbilities();
    const mode = abilities.autoSwitch ? (fighter.guardian.shield > 0 ? 'charge' : 'flail') : abilities.startingMode;
    if (abilities[`${mode}Enabled`]) return true;
  }
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
  const damage = Math.max(COMBAT_RESOLUTION, roundCombat(amount - reduction));
  return removeCombatHealth(target, damage, elapsed);
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

function sourceMarks(target, source) {
  target.marks[source] ??= Object.fromEntries(MAGE_CYCLES.map(theme => [theme, []]));
  return target.marks[source];
}

export function activeMarks(target, source, theme, now) {
  // Retain the former public call shape for older integrations.
  if (now == null) { now = theme; theme = source; source = 'legacy'; }
  const marks = sourceMarks(target, source);
  marks[theme] = marks[theme].filter(expiresAt => expiresAt > now + 1e-9);
  return marks[theme].length;
}

export function applyMark(target, source, theme, abilities, elapsed = 0) {
  if (typeof theme !== 'string') { elapsed = abilities ?? 0; abilities = theme; theme = source; source = 'legacy'; }
  const marks = sourceMarks(target, source);
  activeMarks(target, source, theme, elapsed);
  if (marks[theme].length < abilities.effects.maxMarks) marks[theme].push(elapsed + abilities.effects.markDuration);
  return marks[theme].length;
}

export function consumeMarks(target, source, theme, elapsed = 0) {
  if (typeof theme !== 'string') { elapsed = theme ?? 0; theme = source; source = 'legacy'; }
  const count = activeMarks(target, source, theme, elapsed);
  sourceMarks(target, source)[theme] = [];
  return count;
}

function priestRecord(target, source) {
  target.priestMarksBySource ??= {};
  target.priestMarksBySource[source] ??= { count: 0, decayAt: null, effects: null };
  return target.priestMarksBySource[source];
}

function syncLegacyPriestMarks(target) {
  const records = Object.values(target.priestMarksBySource ?? {});
  target.priestMarks = records.reduce((total, record) => total + record.count, 0);
}

// Saved/replayed two-fighter battles used these fields before marks became
// source-owned.  Treat a direct legacy value as the sole source record only
// while there is one (or no) owner; never merge it into a multi-Priest target.
function ownedPriestRecord(target, source, effects = null) {
  const record = priestRecord(target, source);
  const records = Object.keys(target.priestMarksBySource);
  if (records.length <= 1 && Number.isFinite(target.priestMarks) && target.priestMarks !== record.count) {
    record.count = Math.max(0, target.priestMarks);
    record.decayAt ??= target.priestMarkDecayAt ?? null;
  }
  record.effects ??= effects ?? target.priestMarkEffects ?? null;
  return record;
}

export function applyPriestMark(target, source, abilities, elapsed = 0) {
  if (typeof source !== 'string') { elapsed = abilities ?? 0; abilities = source; source = 'legacy'; }
  const record = priestRecord(target, source);
  record.count += 1;
  record.effects = abilities;
  if (record.count > abilities.decayFloor && record.decayAt == null) {
    record.decayAt = elapsed + abilities.decayInterval;
  }
  syncLegacyPriestMarks(target);
  return record.count;
}

export function consumePriestMarks(target, source = 'legacy') {
  const record = priestRecord(target, source);
  const count = record.count;
  record.count = 0;
  record.decayAt = null;
  record.effects = null;
  syncLegacyPriestMarks(target);
  return count;
}

export function priestMarkMovementFactor(fighter) {
  const records = Object.values(fighter.priestMarksBySource ?? {});
  if (!records.length && fighter.priestMarkEffects) return Math.max(0.1, 1 - fighter.priestMarks * fighter.priestMarkEffects.markMoveSlowPerMark);
  return records.reduce((factor, record) =>
    record.effects ? factor * Math.max(0.1, 1 - record.count * record.effects.markMoveSlowPerMark) : factor, 1);
}

export function priestMarkAttackCooldownFactor(fighter) {
  const records = Object.values(fighter.priestMarksBySource ?? {});
  if (!records.length && fighter.priestMarkEffects) return 1 + fighter.priestMarks * fighter.priestMarkEffects.markAttackSlowPerMark;
  return records.reduce((factor, record) =>
    record.effects ? factor * (1 + record.count * record.effects.markAttackSlowPerMark) : factor, 1);
}

export function healFighter(fighter, amount) {
  return restoreCombatHealth(fighter, amount);
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
  const health = roundCombat(settings?.health ?? character.stats.health);
  const attackValues = settings?.attack ?? character.stats.attack;
  const attackCooldownValues = settings?.attackCD ?? character.stats.attackCD;
  const movementSpeed = settings?.movementSpeed ?? rules.speed;
  const mageAbilities = character.trait?.id === 'elemental-cycles' ? settings?.abilities ?? defaultMageAbilities() : null;
  const priestAbilities = character.trait?.id === 'prayer' ? settings?.abilities ?? defaultPriestAbilities() : null;
  const summonAbilities = character.trait?.id === 'beastmaster' ? settings?.abilities ?? defaultSummonAbilities() : null;
  const guardianAbilities = character.id === 'guardian' ? { ...defaultGuardianAbilities(), ...settings?.abilities } : null;
  const starAbilities = character.id === 'dongfang-changfan' ? { ...defaultStarAbilities(), ...settings?.abilities } : null;
  const warAbilities = character.id === 'war' ? { ...defaultWarAbilities(), ...settings?.abilities } : null;
  const tunedWeapon = guardianAbilities ? { ...weapon, windup: Math.max(0.001, guardianAbilities.windup), active: Math.max(0.001, guardianAbilities.active), duration: Math.max(0.002, guardianAbilities.duration) } :
    starAbilities ? { ...weapon, windup: Math.max(0.001, starAbilities.windup), duration: Math.max(0.002, starAbilities.duration), radius: Math.max(0.1, Math.min(10000, starAbilities.radius)) } :
      settings?.weapon ? { ...weapon, ...settings.weapon } : weapon;
  const x = rules.size / 2 + (index === 0 ? -1 : 1) * rules.startingDistance / 2;
  return {
    side,
    character,
    trait: { ...character.trait, ...settings?.trait },
    weapon: tunedWeapon,
    bodySize: rules.fighterSize,
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
    starPassive: {},
    war: character.id === 'war' ? createWarState(side) : null,
    warAbilities,
    knockback: null,
    guardian: guardianAbilities ? createGuardianState(guardianAbilities) : null,
    guardianAbilities,
    starAbilities,
    marks: {},
    mageCycle: null,
    mageSpellIndex: 0,
    mageAbilities,
    priestAbilities,
    summonAbilities,
    summonMeter: 0,
    packCooldownUntil: 0,
    companionRespawnAt: 0,
    prayer: null,
    prayerCooldownUntil: 0,
    prayerInterruptedUntil: 0,
    priestMarks: 0,
    priestMarksBySource: {},
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

export function advanceMovement(fighters, seconds, now, rules = BATTLE_RULES, zones = [], onContact = () => {}) {
  const half = rules.fighterSize / 2;
  const min = half;
  const max = rules.size - half;
  const epsilon = 1e-8;
  let elapsed = 0;
  const factor = fighter => movementFactor(fighter, now + elapsed, zones);
  const velocity = (fighter, axis) => {
    if (fighter.knockback) return (axis === 'x' ? Math.cos(fighter.knockback.angle) : Math.sin(fighter.knockback.angle)) * fighter.knockback.speed;
    const dash = fighter.war?.charge ?? fighter.guardian?.dash;
    const speed = dash ? (axis === 'x' ? Math.cos(dash.angle) : Math.sin(dash.angle)) * dash.speed : fighter[`v${axis}`];
    return speed * factor(fighter);
  };
  let remaining = seconds;
  let zeroTimeEvents = 0;
  const maxZeroTimeEvents = Math.max(16, fighters.length * fighters.length * 8);

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

    if (rules.collisionMode !== 'pass' || fighters.some(fighter => fighter.guardian?.dash)) {
      for (let a = 0; a < fighters.length; a += 1) for (let b = a + 1; b < fighters.length; b += 1) {
        const first = fighters[a];
        const second = fighters[b];
        const charging = first.guardian?.dash || second.guardian?.dash;
        if (rules.collisionMode === 'pass' && !charging) continue;
        if (charging && Math.abs(first.x - second.x) <= rules.fighterSize + epsilon &&
            Math.abs(first.y - second.y) <= rules.fighterSize + epsilon) {
          consider(0, { type: 'fighters', first, second });
        }
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
        if (possible && entry >= -epsilon && entry <= exit + epsilon && exit > epsilon) consider(entry, { type: 'fighters', first, second });
      }
    }

    fighters.forEach(fighter => {
      fighter.x += velocity(fighter, 'x') * nextTime;
      fighter.y += velocity(fighter, 'y') * nextTime;
    });
    remaining -= nextTime;
    elapsed += nextTime;
    if (!contacts.length) break;

    for (const contact of contacts) onContact(contact);
    // Multiple collisions can legitimately share a timestamp. A degenerate
    // geometry must still never monopolize the animation frame with an endless
    // sequence of zero-time events.
    zeroTimeEvents = nextTime <= epsilon ? zeroTimeEvents + 1 : 0;
    if (zeroTimeEvents > maxZeroTimeEvents) {
      fighters.forEach(fighter => {
        for (const axis of ['x', 'y']) {
          fighter[axis] = Math.max(min, Math.min(max, fighter[axis]));
          if ((fighter[axis] <= min + epsilon && fighter[`v${axis}`] < 0) ||
              (fighter[axis] >= max - epsilon && fighter[`v${axis}`] > 0)) fighter[`v${axis}`] *= -1;
        }
      });
      break;
    }

    // Resolve walls first. Pair responses below then use velocities that are
    // already directed back into the arena rather than outward through a wall.
    for (const { fighter, axis } of contacts.filter(contact => contact.type === 'wall')) {
      if (factor(fighter) > 0 && (
        (fighter[axis] <= min + epsilon && fighter[`v${axis}`] < 0) ||
        (fighter[axis] >= max - epsilon && fighter[`v${axis}`] > 0)
      )) fighter[`v${axis}`] *= -1;
    }

    for (const contact of contacts.filter(contact => contact.type === 'fighters')) {
      const { first, second } = contact;
      if (rules.collisionMode === 'stop') {
        const stopUntil = now + elapsed + (rules.contactStopDuration ?? BATTLE_RULES.contactStopDuration);
        [first, second].forEach(fighter => {
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
          [first, second].forEach(fighter => { fighter.vx *= -1; fighter.vy *= -1; });
        }
      } else {
        [first, second].forEach(fighter => {
          if (factor(fighter) > 0) {
            fighter.vx *= -1;
            fighter.vy *= -1;
          }
        });
      }
      // Exchanging directions at unequal speeds can leave an overtaking pair
      // still closing, repeating the same zero-time collision indefinitely.
      for (const axis of ['x', 'y']) {
        const separation = second[axis] - first[axis];
        if (Math.abs(separation) >= rules.fighterSize - epsilon &&
            separation * (velocity(second, axis) - velocity(first, axis)) < -epsilon) {
          [first, second].forEach((fighter, index) => {
            const speed = Math.hypot(fighter.vx, fighter.vy);
            fighter[`v${axis}`] = Math.abs(fighter[`v${axis}`]) * Math.sign(separation) * (index === 0 ? -1 : 1);
            if ((fighter[axis] <= min + epsilon && fighter[`v${axis}`] < 0) ||
                (fighter[axis] >= max - epsilon && fighter[`v${axis}`] > 0)) {
              // A wall-pinned rear fighter exits along the wall instead of
              // bouncing straight back into the slower fighter at time zero.
              const tangent = axis === 'x' ? 'y' : 'x';
              fighter[`v${axis}`] = 0;
              fighter[`v${tangent}`] = (Math.sign(fighter[`v${tangent}`]) || 1) * speed;
            }
          });
        }
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
  const battle = { phase: 'idle', elapsed: 0, fighters: [], summons: [], projectiles: [], zones: [], winner: null, rules: baseRules };
  const emit = (type, detail = {}) => onEvent({ type, battle, ...detail });

  function reset(selectedCharacters, matchSetup = null) {
    battle.phase = 'idle';
    battle.elapsed = 0;
    battle.projectiles = [];
    battle.zones = [];
    battle.summons = [];
    battle.winner = null;
    battle.rules = Object.freeze({ ...baseRules, ...matchSetup?.arena });
    const slots = Object.keys(selectedCharacters).filter(side => selectedCharacters[side]);
    battle.fighters = slots.map((side, index) => {
      const character = selectedCharacters[side];
      return createFighter(side, character, weapons[character.id], index, matchSetup?.fighters?.[side], battle.rules);
    });
    const count = battle.fighters.length;
    if (count === 2) {
      // Preserve the familiar legacy duel layout exactly.
      battle.fighters.forEach((fighter, index) => {
        fighter.x = fighter.prevX = battle.rules.size / 2 + (index === 0 ? -1 : 1) * battle.rules.startingDistance / 2;
        fighter.y = fighter.prevY = battle.rules.size / 2;
      });
    } else {
      // The chord between adjacent seats is the configured starting distance.
      const radius = battle.rules.startingDistance / (2 * Math.sin(Math.PI / count));
      battle.fighters.forEach((fighter, index) => {
        const angle = -Math.PI / 2 + index * Math.PI * 2 / count;
        fighter.x = fighter.prevX = battle.rules.size / 2 + Math.cos(angle) * radius;
        fighter.y = fighter.prevY = battle.rules.size / 2 + Math.sin(angle) * radius;
      });
    }
    battle.fighters.filter(isBeastmaster).forEach(spawnCompanion);
    emit('reset');
    return battle;
  }

  function isElementalMage(fighter) {
    return fighter.trait?.id === 'elemental-cycles';
  }

  function isPriest(fighter) {
    return fighter.trait?.id === 'prayer';
  }

  function isBeastmaster(fighter) {
    return fighter.trait?.id === 'beastmaster';
  }

  function summonState(owner, overrides = {}) {
    return {
      owner, target: null, bodySize: battle.rules.fighterSize, x: owner.x, y: owner.y, prevX: owner.x, prevY: owner.y,
      health: 1, maxHealth: 1, hitUntil: 0, marks: {}, priestMarks: 0, priestMarksBySource: {},
      rootUntil: 0, slowUntil: 0, slowFactor: 1, burn: null, bleed: null,
      targetable: false, ...overrides
    };
  }

  function spawnCompanion(owner) {
    if (!owner.summonAbilities || owner.health <= 0 || battle.summons.some(summon => summon.owner === owner && summon.kind === 'companion' && summon.health > 0)) return;
    const abilities = owner.summonAbilities;
    const angle = (owner.side.length * 1.7) % (Math.PI * 2);
    const summon = summonState(owner, {
      kind: 'companion', targetable: true, health: roundCombat(abilities.companionHealth), maxHealth: roundCombat(abilities.companionHealth),
      x: owner.x + Math.cos(angle) * 32, y: owner.y + Math.sin(angle) * 32,
      speed: abilities.companionSpeed, biteElapsed: abilities.biteCooldown,
      homeAngle: angle, state: 'ready'
    });
    summon.prevX = summon.x;
    summon.prevY = summon.y;
    battle.summons.push(summon);
    emit('summon-spawned', { summon, owner });
  }

  function removeSummon(summon, reason = 'expired') {
    const index = battle.summons.indexOf(summon);
    if (index >= 0) battle.summons.splice(index, 1);
    emit('summon-removed', { summon, reason });
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
    if (fighter.war) {
      if (fighter.war.phase !== 'move' || fighter.health <= 0 || target.health <= 0) return null;
      const attack = beginWarAttack(fighter, target, battle.elapsed, modeValue(fighter.attackValues, 0));
      grantStarPassive(target, 'enemy-attack', battle.elapsed);
      emit('attack-started', { fighter, attack });
      emit('war-charge-started', { fighter, attack });
      return attack;
    }
    if (fighter.guardian?.flail || fighter.guardian?.dash) return null;
    prepareMageCycle(fighter);
    const elemental = isElementalMage(fighter);
    const priest = isPriest(fighter);
    const spell = elemental ? fighter.mageAbilities.cycles[fighter.mageCycle][fighter.mageSpellIndex] : null;
    const attack = {
      target,
      guardianMode: fighter.guardian ? (() => {
        const abilities = fighter.guardianAbilities;
        const mode = abilities.autoSwitch ? (fighter.guardian.shield > 0 ? 'charge' : 'flail') : abilities.startingMode;
        return abilities[`${mode}Enabled`] ? mode : 'melee';
      })() : null,
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
    if (attack.guardianMode === 'charge') attack.damage *= Math.max(0, Math.min(1000, fighter.guardianAbilities.chargeDamageFactor));
    fighter.attack = attack;
    if (fighter.weapon.art === 'star-thought') attack.starLaunch = createStarLaunch(battle.rules, random, fighter.starAbilities);
    grantStarPassive(target, 'enemy-attack', battle.elapsed);
    emit('attack-started', { fighter, attack });
    return attack;
  }

  function spawnStar(projectile, launch = createStarLaunch(battle.rules, random, projectile.owner.starAbilities)) {
    const fighter = projectile.owner;
    const starFlight = createStarFlight(fighter, projectile.target, battle.rules, launch);
    const star = { ...projectile, starFlight, x: starFlight.x, y: starFlight.y,
      angle: starFlight.angle, vx: Math.cos(starFlight.angle) * starFlight.speed,
      vy: Math.sin(starFlight.angle) * starFlight.speed };
    battle.projectiles.push(star);
    emit('projectile-spawned', { fighter, projectile: star });
    return star;
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
    if (fighter.weapon.art === 'star-thought') {
      const count = Math.max(0, Math.min(10, Math.round(fighter.starAbilities.starsPerAttack)));
      const stars = [];
      for (let index = 0; index < count; index += 1) stars.push(spawnStar(projectile,
        index === 0 ? attack.starLaunch : createStarLaunch(battle.rules, random, fighter.starAbilities)));
      return stars[0] ?? null;
    }
    battle.projectiles.push(projectile);
    emit('projectile-spawned', { fighter, projectile });
    return projectile;
  }

  function selectTarget(fighter) {
    const candidates = [
      ...battle.fighters.filter(other => other !== fighter && other.health > 0),
      ...battle.summons.filter(summon => summon.targetable && summon.owner !== fighter && summon.health > 0)
    ];
    if (!candidates.length) return null;
    const strategy = battle.rules.targetStrategy ?? 'nearest';
    if (strategy !== 'nearest' && fighter.target && fighter.target.health > 0) return fighter.target;
    if (strategy === 'random') fighter.target = candidates[Math.floor(random() * candidates.length)];
    else fighter.target = candidates.reduce((closest, candidate) =>
      Math.hypot(candidate.x - fighter.x, candidate.y - fighter.y) < Math.hypot(closest.x - fighter.x, closest.y - fighter.y) ? candidate : closest);
    return fighter.target;
  }

  function updateAttacks() {
    const alive = battle.phase === 'running';
    battle.fighters.forEach(fighter => {
      const target = selectTarget(fighter);
      if (fighter.war) { updateWarAttack(fighter, target, alive); return; }
      if (!target) return;
      updatePrayer(fighter, target);
      if (!fighter.attack) prepareMageCycle(fighter);
      if (alive && !fighter.attack && fighter.cooldownElapsed >= fighter.attackCooldown * priestMarkAttackCooldownFactor(fighter) - 1e-9 && canAttack(fighter, target, battle.rules)) {
        startAttack(fighter, target);
      }
      const { attack } = fighter;
      if (!attack) return;
      if (fighter.guardian) { updateGuardianAttack(fighter, target, alive); return; }
      const { weapon } = fighter;
      const age = battle.elapsed - attack.startedAt + (attack.hasteAgeBonus ?? 0);
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

  function updateWarAttack(fighter, target, alive) {
    const w = fighter.war;
    const combat = fighter.warAbilities;
    if (!alive || fighter.health <= 0 || !target) {
      if (fighter.attack) emit('attack-ended', { fighter, attack: fighter.attack });
      resetWarCycle(fighter);
      return;
    }
    if (w.phase === 'move') {
      w.angle = facingAngle(fighter, target);
      if (!fighter.knockback && fighter.cooldownElapsed >= fighter.attackCooldown * priestMarkAttackCooldownFactor(fighter) - 1e-9) startAttack(fighter, target);
      else return;
    }
    const targets = [...battle.fighters.filter(other => other !== fighter && other.health > 0),
      ...battle.summons.filter(s => s.targetable && s.owner !== fighter && s.health > 0)];
    if (!w.swing && (!w.charge || targets.some(other => warSweepTouches(fighter, other,
      warSwordPose(fighter, battle.elapsed).angle, w.angle - w.side * Math.PI / 2)))) {
      beginWarSwing(fighter, battle.elapsed);
      emit('attack-released', { fighter, attack: fighter.attack });
      emit('war-swing', { fighter, attack: fighter.attack });
    }
    if (w.swing && !w.swing.finished) {
      const pose = warSwordPose(fighter, battle.elapsed);
      for (const other of targets) {
        if (fighter.attack.hitTargets.has(other) || !warSweepTouches(fighter, other, w.swing.previousAngle, pose.angle)) continue;
        fighter.attack.hitTargets.add(other);
        fighter.attack.hit = true;
        const amount = applyDirectDamage(fighter, other, fighter.attack.damage);
        if (other.health > 0) {
          const angle = facingAngle(fighter, other);
          stopWarCharge(other);
          endCharge(other);
          other.knockback = combat.knockbackDistance > 0 ? { angle, remaining: combat.knockbackDistance,
            speed: combat.knockbackDistance / combat.knockbackDuration } : null;
          const speed = other.movementSpeed ?? 0;
          other.vx = Math.cos(angle) * speed; other.vy = Math.sin(angle) * speed;
          if (other.kind) {
            const half = other.bodySize / 2;
            other.x = Math.max(half, Math.min(battle.rules.size - half, other.x + Math.cos(angle) * combat.knockbackDistance));
            other.y = Math.max(half, Math.min(battle.rules.size - half, other.y + Math.sin(angle) * combat.knockbackDistance));
            other.knockback = null;
          }
        }
        emit('war-sweep-hit', { fighter, target: other, amount });
      }
      w.swing.previousAngle = pose.angle;
      w.swing.finished = battle.elapsed >= w.swing.startedAt + combat.swingDuration - 1e-9;
    }
    if (!w.charge && w.swing?.finished && battle.elapsed >= w.swing.startedAt + combat.swingDuration + combat.recovery - 1e-9) {
      emit('attack-ended', { fighter, attack: fighter.attack });
      resetWarCycle(fighter, true);
    }
  }

  function endCharge(fighter, target = null) {
    const dash = fighter.guardian?.dash;
    if (!dash) return;
    fighter.guardian.dash = null;
    if (target && !dash.attack.hit && fighter.health > 0 && target.health > 0) {
      dash.attack.hit = true;
      applyDirectDamage(fighter, target, dash.attack.damage);
    }
    emit('charge-ended', { fighter, target });
  }

  function endGuardianAttack(fighter) {
    if (!fighter.attack) return;
    emit('attack-ended', { fighter, attack: fighter.attack });
    fighter.attack = null;
  }

  function updateGuardianAttack(fighter, target, alive) {
    const { attack, weapon, guardian } = fighter;
    if (!alive || fighter.health <= 0 || target.health <= 0) {
      guardian.dash = null;
      endGuardianAttack(fighter);
      return;
    }
    const age = battle.elapsed - attack.startedAt;
    if (!attack.released && age >= weapon.windup - 1e-9) {
      // Aim once on release. The shield continues facing the opponent independently.
      attack.angle = facingAngle(fighter, target);
      attack.released = true;
      fighter.cooldownElapsed = 0;
      fighter.attacksFired += 1;
      if (attack.guardianMode === 'charge') beginCharge(fighter, attack);
      else if (attack.guardianMode === 'flail') {
        guardian.flail = createFlail(fighter, target, modeValue(fighter.attackValues, fighter.attackMode));
        emit('flail-spawned', { fighter, flail: guardian.flail });
      }
      emit('attack-released', { fighter, attack });
    }
    if (attack.guardianMode === 'melee' && attack.released && !attack.hit && age <= weapon.windup + weapon.active &&
      weaponIntersectsTarget(fighter, target, weaponPose(fighter, battle.elapsed), battle.rules)) {
      applyDirectDamage(fighter, target, attack.damage);
      attack.hit = true;
    }
    if (attack.released && !guardian.dash && !guardian.flail && age >= weapon.duration) endGuardianAttack(fighter);
  }

  function updateGuardianFlails(seconds) {
    for (const fighter of battle.fighters) {
      const flail = fighter.guardian?.flail;
      if (!flail) continue;
      const done = advanceFlail(flail, seconds, battle.elapsed, (owner, target, damage, phase) => {
        const amount = applyDirectDamage(owner, target, damage);
        emit('flail-hit', { fighter: owner, target, amount, phase, flail });
      }, emit);
      if (done) {
        fighter.guardian.flail = null;
        emit('flail-removed', { fighter, flail });
        endGuardianAttack(fighter);
      }
    }
  }

  function absorbIncoming(fighter, target, amount, damageType = null) {
    const result = absorbShieldDamage(target, amount, battle.elapsed);
    if (result.absorbed) emit('shield-damaged', { fighter, target, amount: result.absorbed, damageType });
    if (result.broken) {
      endCharge(target);
      endGuardianAttack(target);
      emit('shield-broken', { fighter: target });
    }
    return result.remaining;
  }

  function updateProjectiles(seconds) {
    battle.projectiles = battle.projectiles.filter(projectile => {
      const { target } = projectile;
      const segment = projectile.starFlight ? advanceStarFlight(projectile, seconds) : {
        x: projectile.x, y: projectile.y,
        nextX: projectile.x + projectile.vx * seconds,
        nextY: projectile.y + projectile.vy * seconds, startFraction: 0
      };
      const nextX = segment?.nextX ?? projectile.x;
      const nextY = segment?.nextY ?? projectile.y;
      let hit = null;
      let hitTarget = null;
      if (segment) for (const candidate of [...battle.fighters, ...battle.summons.filter(summon => summon.targetable)]) {
        if (candidate === projectile.owner || candidate.owner === projectile.owner || candidate.health <= 0) continue;
        const startX = candidate.prevX + (candidate.x - candidate.prevX) * segment.startFraction;
        const startY = candidate.prevY + (candidate.y - candidate.prevY) * segment.startFraction;
        const candidateHit = segmentBoxTime(segment.x - startX, segment.y - startY,
          nextX - candidate.x, nextY - candidate.y, battle.rules.fighterSize / 2 + projectile.radius);
        if (candidateHit !== null && (hit === null || candidateHit < hit)) { hit = candidateHit; hitTarget = candidate; }
      }
      projectile.age += seconds;
      if (hit !== null) {
        const target = hitTarget;
        if (projectile.priestMark) {
          grantStarPassive(target, 'enemy-hit', battle.elapsed);
          const marks = applyPriestMark(target, projectile.owner.side, projectile.owner.priestAbilities, battle.elapsed);
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
            applyMark(target, projectile.owner.side, theme, abilities, battle.elapsed);
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
            const marks = consumeMarks(target, projectile.owner.side, theme, battle.elapsed);
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
        if (projectile.empowered && target.health > 0) {
          applyVines(target, projectile.owner.trait, battle.elapsed, battle.rules.controlDurationScale);
          emit('vines-applied', { fighter: projectile.owner, target, projectile });
        }
        emit('projectile-removed', { projectile, reason: 'hit' });
        return false;
      }
      projectile.x = nextX;
      projectile.y = nextY;
      const margin = (projectile.starFlight?.orbitRadius ?? 0) + 30;
      const outside = nextX < -margin || nextX > battle.rules.size + margin || nextY < -margin || nextY > battle.rules.size + margin;
      if (projectile.age > Math.max(0.001, projectile.owner.starAbilities?.lifetime ?? 5) || (projectile.starFlight?.phase !== 'flank' && outside)) {
        emit('projectile-removed', { projectile, reason: 'expired' });
        return false;
      }
      return true;
    });
  }

  function boundedSummonPosition(summon) {
    const half = battle.rules.fighterSize / 2;
    summon.x = Math.max(half, Math.min(battle.rules.size - half, summon.x));
    summon.y = Math.max(half, Math.min(battle.rules.size - half, summon.y));
  }

  function moveSummonTowards(summon, destination, speed, seconds, stopDistance = 0) {
    const dx = destination.x - summon.x;
    const dy = destination.y - summon.y;
    const distance = Math.hypot(dx, dy);
    const remaining = Math.max(0, distance - stopDistance);
    const travel = Math.min(remaining, speed * seconds);
    if (distance > 1e-9 && travel > 0) {
      summon.x += dx / distance * travel;
      summon.y += dy / distance * travel;
      boundedSummonPosition(summon);
    }
    return remaining <= speed * seconds + 1e-9;
  }

  function companionHome(summon) {
    return {
      x: summon.owner.x + Math.cos(summon.homeAngle) * 32,
      y: summon.owner.y + Math.sin(summon.homeAngle) * 32
    };
  }

  function firstPackWolfTarget(summon, nextX, nextY) {
    let best = null;
    let time = null;
    for (const target of [...battle.fighters, ...battle.summons.filter(candidate => candidate.targetable)]) {
      // A pack may be intercepted by any enemy fighter or permanent enemy
      // summon, but never by its Beastmaster or that Beastmaster's companion.
      if (target === summon.owner || target.owner === summon.owner || target.health <= 0) continue;
      const hit = segmentBoxTime(summon.x - target.prevX, summon.y - target.prevY, nextX - target.x, nextY - target.y, battle.rules.fighterSize / 2 + 10);
      if (hit !== null && (time === null || hit < time)) { time = hit; best = target; }
    }
    return best;
  }

  function spawnPack(owner, target) {
    const abilities = owner.summonAbilities;
    for (let index = 0; index < abilities.packSize; index += 1) {
      const burstAngle = facingAngle(owner, target) + index * Math.PI * 2 / abilities.packSize;
      const formationOffset = (index - (abilities.packSize - 1) / 2) * 18;
      const summon = summonState(owner, {
        // Pack members are short-lived summon actors, not projectiles. Each
        // wolf charges once, then leaves after its hit or lifetime expires.
        kind: 'pack-wolf', target, state: 'charging',
        x: owner.x + Math.cos(burstAngle) * 14,
        y: owner.y + Math.sin(burstAngle) * 14,
        angle: burstAngle, burstAngle, burstDistance: 72, burstTravelled: 0, formationOffset,
        vx: Math.cos(burstAngle) * abilities.chargeSpeed, vy: Math.sin(burstAngle) * abilities.chargeSpeed,
        damage: abilities.chargeDamage, expiresAt: battle.elapsed + abilities.chargeLifetime
      });
      battle.summons.push(summon);
      emit('summon-spawned', { summon, owner });
    }
    owner.summonMeter = 0;
    owner.packCooldownUntil = battle.elapsed + abilities.packCooldown;
    emit('pack-summoned', { fighter: owner, count: abilities.packSize });
  }

  function updateSummons(seconds) {
    for (const summon of [...battle.summons]) {
      summon.prevX = summon.x;
      summon.prevY = summon.y;
      const owner = summon.owner;
      if (owner.health <= 0) { removeSummon(summon, 'owner-defeated'); continue; }
      if (summon.kind === 'companion') {
        if (summon.health <= 0) {
          owner.companionRespawnAt ||= battle.elapsed + owner.summonAbilities.respawnDelay;
          removeSummon(summon, 'defeated');
          continue;
        }
        summon.biteElapsed += seconds;
        if (summon.state === 'returning') {
          if (moveSummonTowards(summon, companionHome(summon), summon.speed, seconds)) {
            summon.state = 'ready';
            summon.target = null;
          }
        } else if (summon.state === 'ready' && summon.biteElapsed >= owner.summonAbilities.biteCooldown - 1e-9) {
          const target = selectTarget(owner);
          if (target) {
            summon.target = target;
            summon.state = 'lunging';
          }
        } else if (summon.state === 'lunging') {
          const target = summon.target;
          if (!target || target.health <= 0) {
            summon.target = null;
            summon.state = 'returning';
            continue;
          }
          // A lunge stops at bite distance rather than occupying the target's
          // centre, leaving the companion exposed to normal enemy attacks.
          if (moveSummonTowards(summon, target, summon.speed * 2.2, seconds, owner.summonAbilities.biteRange)) {
            summon.biteElapsed = 0;
            const damage = applyDirectDamage(owner, target, owner.summonAbilities.biteDamage);
            if (damage > 0) {
              owner.summonMeter = Math.min(owner.summonAbilities.meterThreshold, owner.summonMeter + owner.summonAbilities.meterPerBite);
              emit('summon-bit', { summon, owner, target, damage, meter: owner.summonMeter });
            }
            summon.state = 'returning';
          }
        }
      } else if (summon.kind === 'pack-wolf') {
        if (battle.elapsed >= summon.expiresAt) { removeSummon(summon); continue; }
        let travelSeconds = seconds;
        if (summon.state === 'charging') {
          const speed = owner.summonAbilities.chargeSpeed;
          travelSeconds = Math.min(seconds, Math.max(0, summon.burstDistance - summon.burstTravelled) / speed);
          summon.angle = summon.burstAngle;
          summon.vx = Math.cos(summon.angle) * speed;
          summon.vy = Math.sin(summon.angle) * speed;
        } else if (summon.target?.health > 0) {
          // After the radial launch, wolves keep steering toward their assigned
          // target. Swept collision still awards the hit to the first enemy.
          const targetAngle = facingAngle(summon, summon.target);
          const distance = Math.hypot(summon.target.x - summon.x, summon.target.y - summon.y);
          // Spread while travelling so pack size is readable, then converge at
          // close range so every wolf remains a genuine target-seeking charge.
          const lateral = summon.formationOffset * Math.min(1, distance / 220);
          const destination = {
            x: summon.target.x - Math.sin(targetAngle) * lateral,
            y: summon.target.y + Math.cos(targetAngle) * lateral
          };
          summon.angle = facingAngle(summon, destination);
          summon.vx = Math.cos(summon.angle) * owner.summonAbilities.chargeSpeed;
          summon.vy = Math.sin(summon.angle) * owner.summonAbilities.chargeSpeed;
        }
        const nextX = summon.x + summon.vx * travelSeconds;
        const nextY = summon.y + summon.vy * travelSeconds;
        const target = firstPackWolfTarget(summon, nextX, nextY);
        if (target) {
          applyDirectDamage(owner, target, summon.damage);
          emit('pack-wolf-hit', { summon, owner, target });
          removeSummon(summon, 'hit');
        } else {
          summon.x = nextX;
          summon.y = nextY;
          if (summon.state === 'charging') {
            summon.burstTravelled += owner.summonAbilities.chargeSpeed * travelSeconds;
            if (summon.burstTravelled >= summon.burstDistance - 1e-9) summon.state = 'tracking';
          }
          if (nextX < -30 || nextX > battle.rules.size + 30 || nextY < -30 || nextY > battle.rules.size + 30) removeSummon(summon, 'expired');
        }
      }
    }
    for (const owner of battle.fighters.filter(isBeastmaster)) {
      const companion = battle.summons.find(summon => summon.owner === owner && summon.kind === 'companion');
      if (!companion && owner.companionRespawnAt && battle.elapsed >= owner.companionRespawnAt - 1e-9) {
        owner.companionRespawnAt = 0;
        spawnCompanion(owner);
      }
      if (companion && owner.summonMeter >= owner.summonAbilities.meterThreshold && battle.elapsed >= owner.packCooldownUntil - 1e-9) {
        const target = selectTarget(owner);
        if (target) spawnPack(owner, target);
      }
    }
  }

  function startPrayer(fighter, target) {
    fighter.prayer = { startedAt: battle.elapsed, target };
    grantStarPassive(target, 'enemy-attack', battle.elapsed);
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
    if (target.health <= 0 || amount <= 0) return 0;
    const incoming = Math.max(COMBAT_RESOLUTION, roundCombat(amount));
    const dealt = dealDamage(target, absorbIncoming(fighter, target, incoming), battle.elapsed);
    if (dealt > 0) {
      interruptPrayer(target);
      grantStarPassive(fighter, 'enemy-hurt', battle.elapsed);
      grantStarPassive(target, 'enemy-hit', battle.elapsed);
      emit('damage', { fighter, target, amount: dealt });
    }
    return dealt;
  }

  function updatePrayer(fighter, target) {
    if (!isPriest(fighter) || fighter.health <= 0) return;
    if (fighter.prayer) target = fighter.prayer.target;
    if (!target || target.health <= 0) { fighter.prayer = null; return; }
    const effects = fighter.priestAbilities;
    if (fighter.prayer && battle.elapsed >= fighter.prayer.startedAt + effects.prayerDuration - 1e-9) {
      const marks = consumePriestMarks(target, fighter.side);
      const healed = healFighter(fighter, effects.baseHeal + marks * effects.healPerMark);
      const damage = applyDirectDamage(fighter, target, effects.baseDamage + marks * effects.damagePerMark);
      fighter.prayer = null;
      fighter.prayerCooldownUntil = battle.elapsed + effects.prayerCooldown;
      if (healed) emit('healed', { fighter, amount: healed });
      emit('prayer-completed', { fighter, target, marks, healed, damage });
    }
    const marks = ownedPriestRecord(target, fighter.side, effects).count;
    if (!fighter.prayer && marks > 0 && battle.elapsed >= fighter.prayerCooldownUntil - 1e-9 &&
        battle.elapsed >= fighter.prayerInterruptedUntil - 1e-9) {
      startPrayer(fighter, target);
    }
  }

  function updatePriestMarkDecay() {
    battle.fighters.forEach(fighter => {
      if (!isPriest(fighter)) return;
      const effects = fighter.priestAbilities;
      battle.fighters.filter(target => target !== fighter).forEach(target => {
        const record = ownedPriestRecord(target, fighter.side, effects);
        let decayed = 0;
        while (record.count > effects.decayFloor && record.decayAt != null && battle.elapsed >= record.decayAt - 1e-9) {
          const next = Math.max(effects.decayFloor, record.count - effects.decayAmount);
          decayed += record.count - next;
          record.count = next;
          record.decayAt += effects.decayInterval;
        }
        if (record.count <= effects.decayFloor) record.decayAt = null;
        if (record.count === 0) record.effects = null;
        syncLegacyPriestMarks(target);
        if (decayed) emit('priest-marks-decayed', { fighter, target, amount: decayed, marks: record.count });
      });
    });
  }

  function advance(seconds) {
    const end = battle.elapsed + seconds;
    let now = battle.elapsed;
    while (now < end - 1e-10) {
      const hasSpecialMotion = battle.fighters.some(fighter => fighter.war?.charge || fighter.knockback || fighter.guardian?.dash || fighter.guardian?.flail?.phase === 'grounded');
      let until = hasSpecialMotion ? Math.min(end, now + 1 / 120) : end;
      battle.fighters.forEach(fighter => {
        const dash = fighter.knockback ?? fighter.war?.charge ?? fighter.guardian?.dash;
        const speed = dash ? dash.speed * (fighter.knockback ? 1 : movementFactor(fighter, now, battle.zones)) : 0;
        if (speed > 0) until = Math.min(until, now + dash.remaining / speed);
        for (const expiry of [fighter.rootUntil, fighter.slowUntil]) {
          if (expiry > now + 1e-9 && expiry < until) until = expiry;
        }
      });
      battle.zones.forEach(zone => {
        if (zone.expiresAt > now + 1e-9 && zone.expiresAt < until) until = zone.expiresAt;
      });
      const previous = new Map(battle.fighters.map(fighter => [fighter, { x: fighter.x, y: fighter.y }]));
      const dashDistances = new Map(battle.fighters.filter(fighter => fighter.guardian?.dash).map(fighter =>
        [fighter, fighter.guardian.dash.speed * movementFactor(fighter, now, battle.zones) * (until - now)]));
      const warDistances = new Map(battle.fighters.filter(f => f.war?.charge).map(f =>
        [f, f.war.charge.speed * movementFactor(f, now, battle.zones) * (until - now)]));
      const knockDistances = new Map(battle.fighters.filter(f => f.knockback).map(f => [f, f.knockback.speed * (until - now)]));
      advanceMovement(battle.fighters, until - now, now, battle.rules, battle.zones, contact => {
        if (contact.type === 'wall') { endCharge(contact.fighter); stopWarCharge(contact.fighter); contact.fighter.knockback = null; }
        if (contact.type === 'fighters') {
          const pair = [contact.first, contact.second];
          pair.forEach(fighter => { stopWarCharge(fighter); fighter.knockback = null; });
          const charging = pair.filter(fighter => fighter.guardian?.dash);
          // Resolve both impacts when two guardians charge into each other.
          const hits = charging.map(fighter => [fighter, pair.find(other => other !== fighter), fighter.guardian.dash.attack]);
          charging.forEach(fighter => endCharge(fighter));
          hits.forEach(([fighter, target, attack]) => {
            if (!attack.hit && fighter.health > 0 && target.health > 0) {
              attack.hit = true;
              applyDirectDamage(fighter, target, attack.damage);
            }
          });
        }
      });
      resolveChainWalls(battle.fighters, previous, battle.rules, now, fighter => { endCharge(fighter); stopWarCharge(fighter); fighter.knockback = null; });
      dashDistances.forEach((distance, fighter) => {
        const dash = fighter.guardian?.dash;
        if (!dash) return;
        dash.remaining -= distance;
        if (dash.remaining <= 1e-7) endCharge(fighter);
      });
      warDistances.forEach((distance, fighter) => {
        const dash = fighter.war.charge;
        if (!dash) return;
        fighter.war.travelled += distance;
        dash.remaining -= distance;
        if (dash.remaining <= 1e-7) stopWarCharge(fighter);
      });
      knockDistances.forEach((distance, fighter) => {
        if (!fighter.knockback) return;
        fighter.knockback.remaining -= distance;
        if (fighter.knockback.remaining <= 1e-7) fighter.knockback = null;
      });
      now = until;
    }
  }

  function applyDamageOverTime(seconds) {
    // Targetable permanent summons share the same ongoing-effect state as fighters.
    // Short-lived charge summons are deliberately excluded because they cannot be hit.
    [...battle.fighters, ...battle.summons.filter(summon => summon.targetable)].forEach(target => {
      for (const type of ['burn', 'bleed']) {
        const effect = target[type];
        if (!effect) continue;
        const activeSeconds = Math.max(0, Math.min(seconds, effect.expiresAt - (battle.elapsed - seconds)));
        if (activeSeconds > 0 && effect.dps > 0 && target.health > 0) {
          const attacker = battle.fighters.find(fighter => fighter !== target);
          const tick = roundCombat(effect.dps * activeSeconds);
          if (tick > 0) {
            const amount = removeCombatHealth(target, absorbIncoming(attacker, target, tick, type), battle.elapsed);
            if (amount > 0) {
              battle.fighters.filter(fighter => fighter !== target).forEach(fighter => grantStarPassive(fighter, 'enemy-hurt', battle.elapsed));
              emit('damage-over-time', { target, damageType: type, amount });
            }
          }
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
    battle.summons.slice().forEach(summon => removeSummon(summon, 'finished'));
    battle.fighters.forEach(fighter => {
      if (fighter.war) {
        if (fighter.attack) emit('attack-ended', { fighter, attack: fighter.attack });
        resetWarCycle(fighter);
      }
      fighter.knockback = null;
      if (fighter.guardian) {
        endCharge(fighter);
        if (fighter.guardian.flail) emit('flail-removed', { fighter, flail: fighter.guardian.flail });
        fighter.guardian.flail = null;
        endGuardianAttack(fighter);
      }
      fighter.vx = 0;
      fighter.vy = 0;
    });
    const winner = battle.fighters.find(fighter => fighter.health > 0);
    battle.winner = winner ?? null;
    emit('finished', { winner });
    return winner;
  }

  function stepSlice(seconds) {
    if (battle.phase !== 'running') return;
    battle.fighters.forEach(fighter => {
      fighter.prevX = fighter.x;
      fighter.prevY = fighter.y;
    });
    advance(seconds);
    battle.fighters.forEach(fighter => {
      const attackTime = starCooldownAdvance(fighter, battle.elapsed, seconds);
      fighter.cooldownElapsed += attackTime;
      if (fighter.weapon.art === 'star-thought' && fighter.attack) {
        // Casting and recovery keep pace with the cooldown, including stack expiry.
        fighter.attack.hasteAgeBonus = (fighter.attack.hasteAgeBonus ?? 0) + attackTime - seconds;
      }
    });
    battle.elapsed += seconds;
    updateZones();
    updatePriestMarkDecay();
    applyDamageOverTime(seconds);
    updateProjectiles(seconds);
    updateGuardianFlails(seconds);
    updateSummons(seconds);
    updateAttacks();
    if (battle.fighters.filter(fighter => fighter.health > 0).length <= 1) finish();
  }

  function step(seconds) {
    if (!battle.fighters.some(fighter => fighter.war)) { stepSlice(seconds); return; }
    // Fast half-turns and target-entry checks must not tunnel when a caller
    // advances a long replay frame or changes the battle time scale.
    let remaining = seconds;
    while (remaining > 1e-10 && battle.phase === 'running') {
      const slice = Math.min(remaining, 1 / 120);
      stepSlice(slice); remaining -= slice;
    }
  }

  function launch() {
    const firstAngle = random() * Math.PI * 2;
    const angles = battle.fighters.length === 2
      ? [firstAngle, firstAngle + Math.PI / 3 + random() * Math.PI * 4 / 3]
      : battle.fighters.map((fighter, index) => firstAngle + index * Math.PI * 2 / battle.fighters.length);
    battle.fighters.forEach((fighter, index) => {
      fighter.vx = Math.cos(angles[index]) * fighter.movementSpeed;
      fighter.vy = Math.sin(angles[index]) * fighter.movementSpeed;
      if (fighter.war) {
        const target = selectTarget(fighter);
        if (target) fighter.war.angle = facingAngle(fighter, target);
      }
    });
    battle.phase = 'running';
    emit('launched');
  }

  function stop() {
    battle.phase = 'idle';
    emit('stopped');
  }

  return { state: battle, reset, startAttack, updateAttacks, updateProjectiles, updateGuardianFlails, advance, step, launch, finish, stop };
}
