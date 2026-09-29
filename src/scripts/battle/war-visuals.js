import { WAR_COMBAT, warSwordPose } from './war-combat.js';

export const WAR_VISUAL_SCALE = 1.6;

// Both the entrance actor and the live fighter use the same two independent layers.
export function warBodyMarkup(art) {
  return `<div class="war-body"><img class="war-horse" src="${art.horse}" alt="" draggable="false"><img class="war-rider" src="${art.battle}" alt="" draggable="false"></div>`;
}

export function createWarCombatVisual(fighter, layer) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'war-combat-weapon');
  group.dataset.owner = fighter.side;
  const length = fighter.weapon.mount + fighter.attackRange;
  group.innerHTML = '<path class="war-cleave-trail" opacity="0"/>' +
    `<g class="war-held-sword"><g transform="translate(10 0) rotate(-90)"><image href="${fighter.character.art.weapon}" x="${-length / 4}" y="0" width="${length / 2}" height="${length}"/></g></g>`;
  layer.append(group);
  return { group, sword: group.querySelector('.war-held-sword'), trail: group.querySelector('.war-cleave-trail') };
}

export function renderWarCombatVisual(view, fighter, battle) {
  const w = fighter.war, now = battle.elapsed;
  view.group.style.display = battle.phase === 'running' && fighter.health > 0 ? '' : 'none';
  const phase = w.swing && !w.swing.finished ? 'swing' : w.phase;
  view.group.dataset.phase = phase;
  view.group.setAttribute('transform', `translate(${fighter.x} ${fighter.y})`);
  const pose = warSwordPose(fighter, now);
  view.sword.setAttribute('transform', `rotate(${pose.angle * 180 / Math.PI})`);
  if (!w.swing) { view.trail.setAttribute('opacity', '0'); return; }
  const age = now - w.swing.startedAt;
  const fade = Math.max(0, 1 - Math.max(0, age - WAR_COMBAT.swingDuration) / WAR_COMBAT.recovery);
  const radius = fighter.weapon.mount + fighter.attackRange;
  const from = w.swing.from, to = pose.angle;
  const sweep = to > from ? 1 : 0;
  const point = (r, a) => `${Math.cos(a) * r} ${Math.sin(a) * r}`;
  view.trail.setAttribute('d', `M${point(radius, from)} A${radius} ${radius} 0 0 ${sweep} ${point(radius, to)}`);
  view.trail.setAttribute('opacity', String(Math.min(1, age / .025) * fade * .65));
}
