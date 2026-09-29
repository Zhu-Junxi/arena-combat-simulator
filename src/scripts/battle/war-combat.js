import { defaultWarAbilities } from '../config/customization.js';

export const WAR_COMBAT = Object.freeze({ ...defaultWarAbilities(), slowArc: Math.PI / 15 });

const clamp = (n, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));
const ease = n => { n = clamp(n); return n * n * (3 - 2 * n); };
const tau = Math.PI * 2;

export function createWarState(side) {
  return { phase: 'move', angle: side === 'right' ? Math.PI : 0, side: -1,
    charge: null, swing: null, travelled: 0, targetPoint: null };
}

export function warSwordPose(fighter, now) {
  const w = fighter.war;
  const combat = fighter.warAbilities ?? WAR_COMBAT;
  let angle = w.angle + w.side * Math.PI / 2;
  if (w.swing) {
    const p = ease((now - w.swing.startedAt) / combat.swingDuration);
    angle = w.swing.from + (w.swing.to - w.swing.from) * p;
  } else if (w.phase !== 'move') {
    angle -= w.side * WAR_COMBAT.slowArc * clamp(w.travelled / combat.chargeDistance);
  }
  return { angle, shift: 0, age: fighter.attack ? now - fighter.attack.startedAt : 0 };
}

// Distance to a swept radial blade, including both end caps. This checks every
// angle crossed by a fast frame, rather than just the blade's final position.
export function warSweepTouches(fighter, target, from, to) {
  const dx = target.x - fighter.x, dy = target.y - fighter.y;
  const distance = Math.hypot(dx, dy);
  const near = fighter.weapon.mount, far = near + fighter.attackRange;
  const radius = (target.bodySize ?? 100) / 2 + fighter.weapon.width / 2;
  const direction = to >= from ? 1 : -1;
  const span = Math.abs(to - from);
  const bearing = ((Math.atan2(dy, dx) - from) * direction % tau + tau) % tau;
  if (distance <= radius && near <= radius + distance) return true;
  if (bearing <= span + 1e-9) return Math.abs(distance - clamp(distance, near, far)) <= radius;
  return [from, to].some(angle => {
    const x = Math.cos(angle), y = Math.sin(angle);
    const projection = clamp(dx * x + dy * y, near, far);
    return Math.hypot(dx - x * projection, dy - y * projection) <= radius;
  });
}

export function beginWarAttack(fighter, target, now, damage) {
  const w = fighter.war;
  const combat = fighter.warAbilities ?? WAR_COMBAT;
  w.angle = Math.atan2(target.y - fighter.y, target.x - fighter.x);
  w.targetPoint = { x: target.x, y: target.y };
  w.travelled = 0;
  w.swing = null;
  w.phase = 'charge';
  w.charge = { angle: w.angle, remaining: combat.chargeDistance,
    speed: fighter.movementSpeed * combat.speedMultiplier };
  // Continue along the new heading at ordinary speed once the charge ends;
  // wall/chain collision responses can then reflect that heading normally.
  fighter.vx = Math.cos(w.angle) * fighter.movementSpeed;
  fighter.vy = Math.sin(w.angle) * fighter.movementSpeed;
  fighter.cooldownElapsed = 0;
  fighter.attack = { target, angle: w.angle, startedAt: now, damage, mode: 0,
    released: false, hit: false, hitTargets: new Set(), war: true };
  return fighter.attack;
}

export function beginWarSwing(fighter, now) {
  const w = fighter.war;
  const from = warSwordPose(fighter, now).angle;
  w.swing = { startedAt: now, from, to: w.angle - w.side * Math.PI / 2,
    previousAngle: from, finished: false };
  fighter.attack.released = true;
  fighter.attacksFired++;
}

export function stopWarCharge(fighter) {
  if (!fighter.war?.charge) return;
  fighter.war.charge = null;
  fighter.war.phase = 'recover';
}

export function resetWarCycle(fighter, resumeMovement = false) {
  const w = fighter.war;
  if (w.swing) w.side *= -1;
  w.phase = 'move'; w.charge = null; w.swing = null; w.travelled = 0; w.targetPoint = null;
  fighter.attack = null;
  if (!resumeMovement) {
    fighter.cooldownElapsed = 0;
    fighter.vx = fighter.vy = 0;
  }
}
