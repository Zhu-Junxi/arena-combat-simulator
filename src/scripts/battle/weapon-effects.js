import { ARROW_SPRITE, WEAPON_SPRITES } from '../config/weapons.js';
import { muzzlePoint, weaponPose } from './combat-engine.js';

export function createSvgEffect(className, markup, layer) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  element.setAttribute('class', className);
  element.innerHTML = markup;
  layer.appendChild(element);
  return element;
}

function arrowSpriteMarkup(x, width) {
  const sprite = ARROW_SPRITE;
  const height = Math.max(6, width * sprite.crop[3] / sprite.crop[2]);
  return '<svg class="arrow-sprite" x="' + x + '" y="' + (-height / 2) + '" width="' + width + '" height="' + height +
    '" viewBox="' + sprite.crop.join(' ') + '" preserveAspectRatio="none"><image href="assets/weapons/' + sprite.file +
    '" width="' + sprite.source[0] + '" height="' + sprite.source[1] + '"/></svg>';
}

function vineTrailMarkup() {
  return '<path class="vine-trail-line" d="M-30 -4Q-18 -10-8 1T12 3" fill="none" stroke="currentColor" stroke-width="2.5"/>' +
    '<path class="vine-trail-leaf" d="M-20-6q-5-10-10-5 0 7 10 5M-3 2q0 9 8 7-1-6-8-7" stroke="currentColor" stroke-width="1"/>';
}

export function weaponMarkup(weapon, empowered = false) {
  const sprite = WEAPON_SPRITES[weapon.art];
  const image = '<svg class="weapon-sprite" x="' + sprite.x + '" y="' + sprite.y + '" width="' + sprite.width + '" height="' + sprite.height +
    '" viewBox="' + sprite.crop.join(' ') + '" overflow="hidden"><image href="assets/weapons/' + sprite.file +
    '" x="0" y="0" width="' + sprite.source[0] + '" height="' + sprite.source[1] + '"/></svg>';
  if (weapon.art === 'bow') {
    const arrowLength = weapon.muzzle - (sprite.string.x - 24);
    return image + '<path class="bow-string" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
      '<g class="nocked-arrow">' + arrowSpriteMarkup(0, arrowLength) +
      (empowered ? '<g transform="translate(' + (arrowLength / 2) + ' 0)">' + vineTrailMarkup() + '</g>' : '') + '</g>';
  }
  if (weapon.art === 'sword') {
    return '<path class="sword-trail" d="M126 -66Q176 -43 185 -5" fill="none" stroke="currentColor" stroke-width="2" opacity="0"/>' + image;
  }
  if (weapon.art === 'shield') {
    return image + '<path class="shield-impact" d="M129 -21l12 -7M132 0h16M129 21l12 7" fill="none" stroke="currentColor" stroke-width="2" opacity="0"/>';
  }
  return image + '<g class="cast-charge" opacity="0"><circle class="charge-ring" cx="' + sprite.focus +
    '" cy="0" r="12" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="charge-rays" d="M-20 0H-13M13 0H20M0 -20V-13M0 13V20" fill="none" stroke="currentColor" stroke-width="2"/></g>' +
    '<circle class="release-ring" cx="' + weapon.muzzle + '" cy="0" r="3" fill="none" stroke="currentColor" stroke-width="1.4" opacity="0"/>';
}

export function projectileMarkup(fighter, mode, empowered = false) {
  if (fighter.weapon.art === 'bow') return (empowered ? vineTrailMarkup() : '') + arrowSpriteMarkup(-46, 56);
  if (fighter.weapon.art === 'staff') {
    return [
      '<circle r="9" fill="var(--color-effect-fill)" stroke="currentColor" stroke-width="3"/>',
      '<path d="M-10 0 0 -10 10 0 0 10Z" fill="var(--color-effect-fill)" stroke="currentColor" stroke-width="3"/>',
      '<path d="M11 0 -8 -10 -8 10Z" fill="var(--color-effect-fill)" stroke="currentColor" stroke-width="3"/>'
    ][mode % 3];
  }
  return '<path d="M-9 -3H-3V-9H3V-3H9V3H3V9H-3V3H-9Z" fill="var(--color-effect-fill)" stroke="currentColor" stroke-width="2"/>';
}

export function updateWeaponVisual(element, fighter, elapsed) {
  const { attack, weapon } = fighter;
  const pose = weaponPose(fighter, elapsed);
  const sprite = WEAPON_SPRITES[weapon.art];
  const prepare = Math.max(0, Math.min(1, pose.age / weapon.windup));
  const afterRelease = Math.max(0, pose.age - weapon.windup);
  const recovery = Math.max(0, Math.min(1, afterRelease / (weapon.duration - weapon.windup)));
  element.setAttribute('transform', `translate(${fighter.x} ${fighter.y}) rotate(${pose.angle * 180 / Math.PI}) translate(${pose.shift} 0)`);
  element.setAttribute('opacity', String(Math.min(1, Math.max(0, (weapon.duration - pose.age) / 0.12))));
  if (weapon.type === 'ranged') {
    const muzzle = muzzlePoint(fighter, pose);
    element.setAttribute('data-muzzle-x', String(muzzle.x));
    element.setAttribute('data-muzzle-y', String(muzzle.y));
  }
  if (weapon.art === 'bow') {
    const string = sprite.string;
    const pull = attack.released ? string.x + Math.sin(afterRelease * 55) * 5 * Math.exp(-afterRelease * 14) : string.x - 24 * prepare * prepare * (3 - 2 * prepare);
    element.querySelector('.bow-string').setAttribute('d', `M${string.x} ${string.top}L${pull} 0L${string.x} ${string.bottom}`);
    const arrow = element.querySelector('.nocked-arrow');
    arrow.setAttribute('transform', `translate(${pull} 0)`);
    arrow.setAttribute('opacity', attack.released ? '0' : String(Math.min(1, prepare * 3)));
  } else if (weapon.art === 'sword') {
    const swing = Math.max(0, Math.min(1, afterRelease / weapon.active));
    element.querySelector('.sword-trail').setAttribute('opacity', String(attack.released ? Math.sin(swing * Math.PI) * 0.45 : 0));
  } else if (weapon.art === 'shield') {
    element.querySelector('.shield-impact').setAttribute('opacity', String(attack.released ? Math.max(0, 1 - afterRelease / 0.18) * 0.8 : 0));
  } else {
    const charge = element.querySelector('.cast-charge');
    charge.setAttribute('opacity', attack.released ? '0' : String(prepare * 0.8));
    element.querySelector('.charge-ring').setAttribute('r', String(7 + prepare * (weapon.art === 'staff' ? 12 : 16)));
    element.querySelector('.charge-rays').setAttribute('transform', `translate(${sprite.focus} 0) rotate(${weapon.art === 'staff' ? prepare * 100 : 0}) scale(${0.5 + prepare * 0.7})`);
    const ring = element.querySelector('.release-ring');
    ring.setAttribute('r', String(3 + recovery * (weapon.art === 'staff' ? 28 : 36)));
    ring.setAttribute('opacity', attack.released ? String((1 - recovery) * 0.65) : '0');
  }
}
