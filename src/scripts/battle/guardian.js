// Guardian's shield, charge and tethered flail share one per-fighter state.
import { defaultGuardianAbilities } from '../config/customization.js';
import { roundCombat } from './combat-precision.js';
export const GUARDIAN_RULES = Object.freeze({
  durability: 40, chargeSpeed: 1150, chargeDistance: 270,
  throwSpeed: 380, returnSpeed: 500, headRadius: 24,
  impactRadius: 44, groundDuration: 5, contactDamage: 5, chainWidth: 8
});

const EPSILON = 1e-7;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createGuardianState(abilities = defaultGuardianAbilities()) {
  const durability = roundCombat(Math.max(0, abilities.durability));
  return { shield: durability, maxShield: durability,
    shieldHitUntil: 0, dash: null, flail: null };
}

export function absorbShieldDamage(fighter, amount, now) {
  const guardian = fighter.guardian;
  const incoming = roundCombat(Math.max(0, amount));
  if (!guardian || guardian.shield <= 0 || incoming <= 0) return { absorbed: 0, remaining: incoming, broken: false };
  const absorbed = Math.min(incoming, roundCombat(guardian.shield));
  guardian.shield = roundCombat(guardian.shield - absorbed);
  guardian.shieldHitUntil = now + Math.max(0, fighter.guardianAbilities?.shieldFlashDuration ?? 0.15);
  return { absorbed, remaining: roundCombat(incoming - absorbed), broken: guardian.shield <= 0 };
}

export function beginCharge(fighter, attack) {
  // Keep the new heading after the dash, at normal movement speed. Collision
  // responses can then reflect this velocity without restoring the old heading.
  const movementSpeed = Math.hypot(fighter.vx, fighter.vy);
  fighter.vx = Math.cos(attack.angle) * movementSpeed;
  fighter.vy = Math.sin(attack.angle) * movementSpeed;
  fighter.guardian.dash = {
    angle: attack.angle, remaining: Math.max(0.001, fighter.guardianAbilities?.chargeDistance ?? GUARDIAN_RULES.chargeDistance),
    speed: Math.max(1, Math.min(100000, fighter.guardianAbilities?.chargeSpeed ?? GUARDIAN_RULES.chargeSpeed)), attack
  };
}

export function createFlail(fighter, target, damage) {
  const abilities = fighter.guardianAbilities ?? defaultGuardianAbilities();
  const dx = target.x - fighter.x;
  const dy = target.y - fighter.y;
  const distance = Math.hypot(dx, dy);
  const start = Math.min(distance, fighter.bodySize / 2 + 12);
  const angle = Math.atan2(dy, dx);
  return {
    owner: fighter, target, damage, phase: 'outbound',
    x: fighter.x + Math.cos(angle) * start, y: fighter.y + Math.sin(angle) * start,
    targetX: target.x, targetY: target.y, angle,
    radius: Math.max(1, Math.min(10000, abilities.headRadius)), impactRadius: Math.max(1, Math.min(10000, abilities.impactRadius)),
    outboundHit: false, returningHit: false, touching: false,
    landedAt: null, expiresAt: null
  };
}

export function circleTouchesFighter(x, y, radius, fighter, half = fighter.bodySize / 2) {
  const dx = Math.max(0, Math.abs(x - fighter.x) - half);
  const dy = Math.max(0, Math.abs(y - fighter.y) - half);
  return dx * dx + dy * dy <= radius * radius + EPSILON;
}

// Moving point against a rounded box: exact circular head vs square fighter.
export function sweptHeadHit(x0, y0, x1, y1, half, radius) {
  const distance = t => {
    const dx = Math.max(0, Math.abs(x0 + (x1 - x0) * t) - half);
    const dy = Math.max(0, Math.abs(y0 + (y1 - y0) * t) - half);
    return Math.hypot(dx, dy);
  };
  const speed = Math.hypot(x1 - x0, y1 - y0);
  let t = 0;
  for (let i = 0; i < 80; i += 1) {
    const gap = distance(t) - radius;
    if (gap <= EPSILON) return true;
    if (speed <= EPSILON) return false;
    t += Math.max(EPSILON, gap / speed);
    if (t > 1 + EPSILON) return false;
  }
  return false;
}

export function advanceFlail(flail, seconds, now, hit, emit) {
  const { owner, target } = flail;
  const abilities = owner.guardianAbilities ?? defaultGuardianAbilities();
  let remaining = seconds;
  let time = now - seconds;
  const half = target.bodySize / 2;
  const targetAt = timestamp => {
    const t = seconds > 0 ? clamp((timestamp - (now - seconds)) / seconds, 0, 1) : 1;
    return { x: target.prevX + (target.x - target.prevX) * t,
      y: target.prevY + (target.y - target.prevY) * t };
  };
  const sweep = (x, y, nextX, nextY, startTime, endTime) => {
    const start = targetAt(startTime);
    const end = targetAt(endTime);
    return target.health > 0 && sweptHeadHit(x - start.x, y - start.y, nextX - end.x, nextY - end.y, half, flail.radius);
  };

  // Consume phase boundaries exactly, including a large step spanning the full hold.
  for (let phaseChanges = 0; phaseChanges < 5; phaseChanges += 1) {
    if (flail.phase === 'grounded') {
      const duration = Math.min(remaining, Math.max(0, flail.expiresAt - time));
      const end = targetAt(time + duration);
      if (abilities.contactEnabled && !flail.touching && sweep(flail.x, flail.y, flail.x, flail.y, time, time + duration)) {
        hit(owner, target, Math.max(0, abilities.contactDamage), 'contact');
      }
      flail.touching = circleTouchesFighter(flail.x, flail.y, flail.radius, { ...target, ...end }, half);
      time += duration;
      remaining -= duration;
      if (time < flail.expiresAt - EPSILON) return false;
      flail.phase = 'returning';
      emit('flail-returning', { fighter: owner, flail });
      if (remaining <= EPSILON) return false;
      continue;
    }

    const returning = flail.phase === 'returning';
    const destination = returning ? owner : { x: flail.targetX, y: flail.targetY };
    const dx = destination.x - flail.x;
    const dy = destination.y - flail.y;
    const distance = Math.hypot(dx, dy);
    const speed = Math.max(1, Math.min(100000, returning ? abilities.returnSpeed : abilities.throwSpeed));
    const duration = Math.min(remaining, distance / speed);
    const ratio = distance > EPSILON ? Math.min(1, speed * duration / distance) : 1;
    const nextX = flail.x + dx * ratio;
    const nextY = flail.y + dy * ratio;
    const hitKey = returning ? 'returningHit' : 'outboundHit';
    if ((returning ? abilities.returnEnabled : abilities.outboundEnabled) && !flail[hitKey] && sweep(flail.x, flail.y, nextX, nextY, time, time + duration)) {
      flail[hitKey] = true;
      hit(owner, target, flail.damage * Math.max(0, Math.min(1000, returning ? abilities.returnDamageFactor : abilities.outboundDamageFactor)), returning ? 'return' : 'outbound');
    }
    flail.angle = Math.atan2(dy, dx);
    flail.x = nextX;
    flail.y = nextY;
    time += duration;
    remaining -= duration;
    if (ratio < 1 - EPSILON) return false;
    if (returning) return true;
    flail.phase = 'grounded';
    flail.landedAt = time;
    flail.expiresAt = time + Math.max(0, abilities.groundDuration);
    const landingTarget = { ...target, ...targetAt(time) };
    if (abilities.landingEnabled && target.health > 0 && circleTouchesFighter(flail.x, flail.y, flail.impactRadius, landingTarget, half)) {
      hit(owner, target, flail.damage * Math.max(0, Math.min(1000, abilities.landingDamageFactor)), 'landing');
    }
    // Landing has its own damage; staying inside the head does not add contact damage.
    flail.touching = circleTouchesFighter(flail.x, flail.y, flail.radius, landingTarget, half);
    emit('flail-landed', { fighter: owner, flail });
    if (remaining <= EPSILON) return false;
  }
  return false;
}

export function closestOnSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared > EPSILON ? clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1) : 0;
  return { x: start.x + dx * t, y: start.y + dy * t, t };
}

// Conservative advancement handles both a moving fighter and a moving chain end.
export function sweptChainContact(from, to, anchorFrom, anchorTo, head, radius) {
  const speed = Math.hypot(to.x - from.x, to.y - from.y) + Math.hypot(anchorTo.x - anchorFrom.x, anchorTo.y - anchorFrom.y);
  let t = 0;
  for (let index = 0; index < 100; index += 1) {
    const point = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    const anchor = { x: anchorFrom.x + (anchorTo.x - anchorFrom.x) * t, y: anchorFrom.y + (anchorTo.y - anchorFrom.y) * t };
    const nearest = closestOnSegment(point, anchor, head);
    const dx = point.x - nearest.x;
    const dy = point.y - nearest.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= radius + EPSILON) {
      const length = Math.hypot(head.x - anchor.x, head.y - anchor.y) || 1;
      const normal = distance > EPSILON ? { x: dx / distance, y: dy / distance } :
        { x: -(head.y - anchor.y) / length, y: (head.x - anchor.x) / length };
      const approach = (to.x - from.x - (anchorTo.x - anchorFrom.x) * (1 - nearest.t)) * normal.x +
        (to.y - from.y - (anchorTo.y - anchorFrom.y) * (1 - nearest.t)) * normal.y;
      if (t === 0 && distance >= radius - EPSILON && approach >= 0) return null;
      return { ...point, t, normal };
    }
    if (speed <= EPSILON) return null;
    t += Math.max(EPSILON, (distance - radius) / speed);
    if (t > 1 + EPSILON) return null;
  }
  return null;
}

export function resolveChainWalls(fighters, previous, rules, now, onContact) {
  for (const owner of fighters) {
    const flail = owner.guardian?.flail;
    if (flail?.phase !== 'grounded' || owner.guardianAbilities?.chainBlocking === false || now >= flail.expiresAt - EPSILON) continue;
    for (const fighter of fighters) {
      if (fighter === owner || fighter.health <= 0) continue;
      const radius = rules.fighterSize / 2 + Math.max(0, Math.min(10000, owner.guardianAbilities?.chainWidth ?? GUARDIAN_RULES.chainWidth)) / 2;
      const contact = sweptChainContact(previous.get(fighter), fighter, previous.get(owner), owner, flail, radius);
      if (!contact) continue;
      const nearest = closestOnSegment(contact, owner, flail);
      fighter.x = nearest.x + contact.normal.x * (radius + 0.01);
      fighter.y = nearest.y + contact.normal.y * (radius + 0.01);
      const dot = fighter.vx * contact.normal.x + fighter.vy * contact.normal.y;
      if (dot < 0) {
        fighter.vx -= 2 * dot * contact.normal.x;
        fighter.vy -= 2 * dot * contact.normal.y;
      }
      const half = rules.fighterSize / 2;
      fighter.x = clamp(fighter.x, half, rules.size - half);
      fighter.y = clamp(fighter.y, half, rules.size - half);
      onContact(fighter, owner, flail);
    }
  }
}
