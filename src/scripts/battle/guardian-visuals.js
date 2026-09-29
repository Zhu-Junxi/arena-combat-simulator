import { facingAngle, weaponPose } from './combat-engine.js';
import { GUARDIAN_RULES } from './guardian.js';
import { createSvgEffect, weaponMarkup } from './weapon-effects.js';

export const GUARDIAN_VISUAL_SCALE = 1.5;

export function createGuardianVisual(fighter, layer) {
  const impactRadius = Math.max(1, Math.min(10000, fighter.guardianAbilities?.impactRadius ?? GUARDIAN_RULES.impactRadius));
  const element = createSvgEffect('guardian-equipment',
    '<g class="guardian-shield">' + weaponMarkup(fighter.weapon) + '</g>' +
    '<g class="guardian-flail" visibility="hidden">' +
    '<path class="guardian-chain-edge"/><path class="guardian-chain-links"/>' +
    '<g class="flail-ground-mark"><circle r="' + impactRadius + '"/></g>' +
    '<g class="flail-head"><path class="flail-spikes" d="M-13-17 -16-28 -3-23 13-17 27-16 22-3 17 13 16 28 3 23-13 17-27 16-22 3Z"/>' +
    '<path class="flail-steel" d="M-14-20 14-20 22-12 22 12 14 20-14 20-22 12-22-12Z"/>' +
    '<path class="flail-bevel" d="M-14-20 14-20 22-12 12-8-12-8-22-12Z"/>' +
    '<path class="flail-core" d="M-10-8H10V10H-10Z"/>' +
    '<path class="flail-band" d="M-22-3H22M-22 5H22"/></g></g>', layer);
  element.dataset.owner = fighter.side;
  return {
    element,
    shield: element.querySelector('.guardian-shield'),
    flail: element.querySelector('.guardian-flail'),
    head: element.querySelector('.flail-head'),
    chain: [...element.querySelectorAll('.guardian-chain-edge, .guardian-chain-links')],
    ground: element.querySelector('.flail-ground-mark')
  };
}

export function renderGuardianVisual(view, fighter, target, now) {
  const { guardian } = fighter;
  const scale = Math.max(0.05, Math.min(100, fighter.guardianAbilities?.equipmentScale ?? GUARDIAN_VISUAL_SCALE));
  const melee = fighter.attack?.guardianMode === 'melee';
  const shift = melee ? weaponPose(fighter, now).shift : 0;
  view.element.setAttribute('opacity', fighter.health > 0 ? '1' : '0.3');
  view.shield.setAttribute('visibility', guardian.shield > 0 || melee ? 'visible' : 'hidden');
  view.shield.setAttribute('transform', `translate(${fighter.x} ${fighter.y}) rotate(${facingAngle(fighter, target) * 180 / Math.PI}) translate(${shift} 0) scale(${scale})`);
  view.shield.dataset.hit = String(now < guardian.shieldHitUntil);
  view.shield.dataset.charging = String(Boolean(guardian.dash));
  view.shield.dataset.durability = String(guardian.shield);
  view.shield.querySelector('.shield-impact').setAttribute('opacity', guardian.dash || (melee && fighter.attack.released) ? '0.8' : '0');
  const { flail } = guardian;
  view.flail.setAttribute('visibility', flail ? 'visible' : 'hidden');
  if (!flail) return;
  view.flail.dataset.phase = flail.phase;
  view.flail.dataset.targetX = String(flail.targetX);
  view.flail.dataset.targetY = String(flail.targetY);
  const dx = flail.x - fighter.x;
  const dy = flail.y - fighter.y;
  const length = Math.hypot(dx, dy);
  const grip = Math.min(fighter.bodySize * 0.4 * scale, length);
  const x = fighter.x + (length ? dx / length * grip : 0);
  const y = fighter.y + (length ? dy / length * grip : 0);
  // Scale the links and their spacing while keeping both world-space endpoints attached.
  view.chain.forEach(path => {
    path.setAttribute('d', `M${x / scale} ${y / scale}L${flail.x / scale} ${flail.y / scale}`);
    path.setAttribute('transform', `scale(${scale})`);
  });
  const chainWidth = Math.max(0.1, Math.min(10000, fighter.guardianAbilities?.chainWidth ?? GUARDIAN_RULES.chainWidth));
  view.chain[0].style.strokeWidth = String(chainWidth * (flail.phase === 'grounded' ? 9 / 8 : 1));
  view.chain[1].style.strokeWidth = String(chainWidth / 2);
  view.head.setAttribute('transform', `translate(${flail.x} ${flail.y}) rotate(${flail.angle * 180 / Math.PI}) scale(${scale * flail.radius / GUARDIAN_RULES.headRadius})`);
  view.ground.setAttribute('transform', `translate(${flail.x} ${flail.y}) scale(${scale})`);
  view.ground.setAttribute('visibility', flail.phase === 'grounded' ? 'visible' : 'hidden');
}
