import { WAR_VISUAL_SCALE, warBodyMarkup } from './war-visuals.js';

export const WAR_ENTRANCE_STAGES = Object.freeze([
  ['pierce', 650], ['hold', 700], ['slash', 1050], ['withdraw', 350], ['open', 650], ['emerge', 1350],
  ['roar', 2000], ['horse', 1450], ['mount', 650]
].map(([name, duration]) => Object.freeze({ name, duration })));
export const WAR_ENTRANCE_DURATION = WAR_ENTRANCE_STAGES.reduce((sum, stage) => sum + stage.duration, 0);
const STAGE_INDEX = Object.fromEntries(WAR_ENTRANCE_STAGES.map((stage, index) => [stage.name, index]));
const ROAR_START = WAR_ENTRANCE_STAGES.slice(0, STAGE_INDEX.roar).reduce((sum, stage) => sum + stage.duration, 0);
const ROAR_SECONDS = WAR_ENTRANCE_STAGES[STAGE_INDEX.roar].duration / 1000;
const clamp = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp(x); return x * x * (3 - 2 * x); };
const mix = (a, b, p) => a + (b - a) * p;

export function warEntranceFrame(elapsed) {
  let start = 0;
  for (const [index, stage] of WAR_ENTRANCE_STAGES.entries()) {
    if (elapsed < start + stage.duration) return { ...stage, index, progress: clamp((elapsed - start) / stage.duration), elapsed: Math.max(0, elapsed), start };
    start += stage.duration;
  }
  return { name: 'complete', index: WAR_ENTRANCE_STAGES.length, progress: 1, elapsed, start };
}

// Cutting only lengthens the seam. Its dark interior opens after the blade is gone.
export function warRiftFrame({ name, index, progress: p }) {
  const closing = name === 'roar' ? 1 - ease(p * 3) : index > STAGE_INDEX.roar ? 0 : 1;
  const bladeDepth = name === 'pierce' ? 1 - (1 - clamp((p - .15) / .7)) ** 3
    : name === 'withdraw' ? 1 - ease(p) : index < STAGE_INDEX.withdraw ? 1 : 0;
  return {
    cut: index < STAGE_INDEX.slash ? 0 : name === 'slash' ? ease(p) : 1,
    opening: index < STAGE_INDEX.open ? .018 : name === 'open' ? mix(.018, 1, ease(p)) : closing,
    interior: name === 'open' ? ease(p) : index > STAGE_INDEX.open ? closing : 0,
    riftOpacity: index < STAGE_INDEX.slash ? 0 : closing,
    bladeDepth,
    bladeOpacity: bladeDepth > 0 ? (name === 'withdraw' ? 1 - ease(p) : 1) : 0,
    seamOpacity: index <= STAGE_INDEX.withdraw ? Math.min(1, bladeDepth * 5) : 0,
    emerge: index < STAGE_INDEX.emerge ? 0 : name === 'emerge' ? ease(p) : 1
  };
}

// Deliberately varies frequency, phase and amplitude for every HUD element.
export function roarDisplacement(index, seconds, strength = 1) {
  const phase = index * 2.399963;
  return {
    x: Math.sin(seconds * (35 + index % 9 * 3.7) + phase) * (2.2 + index % 5) * strength,
    y: Math.cos(seconds * (43 + index % 7 * 4.1) + phase * 1.7) * (1.6 + index % 4) * strength,
    rotation: Math.sin(seconds * (27 + index % 6 * 5.1) + phase) * (.25 + index % 3 * .18) * strength
  };
}

export function riftGeometry(fighter, rules) {
  const unit = rules.fighterSize;
  const x = Math.max(unit * 1.5, Math.min(rules.size - unit * 3, fighter.x - unit * .1));
  const y = Math.max(unit * .6, Math.min(rules.size - unit * 3.3, fighter.y - unit * 2.9));
  return { x, y, dx: unit * .35, dy: unit * 3, width: unit * .9, unit };
}

export function riftPath(g, cut, opening) {
  const dx = g.dx * cut, dy = g.dy * cut, w = g.width * opening;
  const px = dy / (Math.hypot(dx, dy) || 1), py = -dx / (Math.hypot(dx, dy) || 1);
  const point = (t, side, jag = 1) => `${g.x + dx * t + px * w * side * jag},${g.y + dy * t + py * w * side * jag}`;
  return `M${point(0, 0)} L${point(.16, -1, .2)} ${point(.23, -1, .56)} ${point(.32, -1, .47)} ${point(.46, -1, .95)} ${point(.53, -1, .82)} ${point(.66, -1, .8)} ${point(.76, -1, .35)} ${point(.86, -1, .31)} ${point(1, 0)} ${point(.84, 1, .22)} ${point(.75, 1, .6)} ${point(.64, 1, .54)} ${point(.52, 1, 1)} ${point(.4, 1, .7)} ${point(.32, 1, .79)} ${point(.23, 1, .35)} ${point(.13, 1, .21)} Z`;
}

const svgNode = (tag, attributes = {}) => {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
};
const setPosition = (node, x, y, size) => { node.style.left = `${x / size * 100}%`; node.style.top = `${y / size * 100}%`; };

export function createWarEntrance({ elements, i18n }) {
  let layer = null, entries = [], shaking = [], ready = false, elapsed = 0, lastTick = null, generation = 0, previousPhase = '';
  const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  function restoreShake() {
    for (const { node, translate, rotate } of shaking) { node.style.translate = translate; node.style.rotate = rotate; }
  }

  function stop() {
    generation++;
    restoreShake();
    shaking = [];
    layer?.remove(); layer = null;
    for (const entry of entries) delete entry.live.dataset.introHidden;
    entries = []; ready = false; elapsed = 0; lastTick = null; previousPhase = '';
    delete elements.battlefield.dataset.entrancePhase;
    delete elements.arena.dataset.warRoaring;
  }

  function begin(battle) {
    stop();
    const fighters = battle.fighters.filter(f => f.character.id === 'war');
    if (!fighters.length) return false;
    const token = generation;
    const size = battle.rules.size;
    layer = document.createElement('div');
    layer.className = 'war-entrance';
    layer.setAttribute('aria-hidden', 'true');
    const svg = svgNode('svg', { viewBox: `0 0 ${size} ${size}`, class: 'war-entrance-effects' });
    layer.append(svg);
    elements.battlefield.append(layer);
    for (const fighter of fighters) {
      const art = fighter.character.art, g = riftGeometry(fighter, battle.rules);
      const live = elements.battlefield.querySelector(`#fighter-${fighter.side}`);
      live.dataset.introHidden = 'true';
      const tear = svgNode('path', { class: 'war-rift' });
      const seam = svgNode('path', { class: 'war-puncture', d: `M${-g.unit * .37} 2l${g.unit * .15} -5 ${g.unit * .22} 3 ${g.unit * .17} -3 ${g.unit * .2} 4` });
      const sword = svgNode('g', { class: 'war-piercing-sword' });
      const clipId = `war-blade-front-${fighter.side}`;
      const clip = svgNode('clipPath', { id: clipId, clipPathUnits: 'userSpaceOnUse' });
      clip.append(svgNode('rect', { x: -g.unit * 1.5, y: 0, width: g.unit * 3, height: g.unit * 2.3 }));
      const defs = svgNode('defs'); defs.append(clip); svg.append(defs);
      const exposedBlade = svgNode('g', { 'clip-path': `url(#${clipId})` });
      const blade = svgNode('image', { href: art.weapon, x: -g.unit * 1.3, width: g.unit * 2.6, height: g.unit * 5.2, preserveAspectRatio: 'none' });
      exposedBlade.append(blade); sword.append(exposedBlade);
      // The near lip overlays the blade's base: the rest of the sword stays behind the screen.
      const lip = svgNode('path', { class: 'war-puncture-lip', d: `M${-g.unit * .36} 0l${g.unit * .14} 8 ${g.unit * .22} -5 ${g.unit * .2} 5 ${g.unit * .16} -8` });
      const flaps = svgNode('path', { class: 'war-puncture-flaps', d: `M${-g.unit * .37} 0l${-g.unit * .18} 18 ${g.unit * .27} -8 Z M${g.unit * .37} 0l${g.unit * .16} 16 ${-g.unit * .25} -7 Z` });
      sword.append(flaps, lip);
      const waves = Array.from({ length: Math.ceil(ROAR_SECONDS / .34) }, () => svgNode('circle', { class: 'war-pressure-wave', cx: fighter.x, cy: fighter.y, r: 0, opacity: 0 }));
      svg.append(tear, sword, seam, ...waves);
      const actor = document.createElement('div');
      actor.className = 'war-entrance-actor';
      actor.innerHTML = warBodyMarkup(art);
      actor.style.width = actor.style.height = `${battle.rules.fighterSize * WAR_VISUAL_SCALE / size * 100}%`;
      const horse = document.createElement('div');
      horse.className = 'war-arriving-horse';
      horse.innerHTML = `<img src="${art.horse}" alt="" draggable="false">`;
      horse.style.width = horse.style.height = actor.style.width;
      layer.append(horse, actor);
      entries.push({ fighter, live, g, tear, seam, sword, blade, waves, actor, horse, size });
    }
    // Never select the battlefield or any ancestor of it; layout remains steady.
    const selectors = '.duel-side-tag > *, .duel-portrait-window, .duel-avatar, .duel-identity h3, .duel-identity p, .duel-identity > span, .duel-vital > div > span, .duel-vital strong, .duel-meter, .duel-mini-stats dt, .duel-mini-stats dd, .duel-ability > span, .duel-ability b, .duel-ability p, .duel-back, .duel-title, .duel-clock > *, .duel-caption > *, .duel-arena-bottom > *, .duel-footer > *, #duel-corners > *, .page > header > *, .page > footer > *';
    shaking = [...document.querySelectorAll(selectors)].filter(node => !elements.battlefield.contains(node) && !node.contains(elements.battlefield)).map(node => ({ node, translate: node.style.translate, rotate: node.style.rotate }));
    const urls = [...new Set(fighters.flatMap(f => [f.character.art.battle, f.character.art.horse, f.character.art.weapon]))];
    Promise.all(urls.map(src => new Promise(resolve => {
      const img = new Image(); img.onload = img.onerror = resolve; img.src = src;
      if (img.complete) resolve();
    }))).then(() => { if (generation === token) ready = true; });
    elements.countdown.hidden = true;
    elements.battlefield.dataset.entrancePhase = 'loading';
    renderFrame(warEntranceFrame(0));
    return true;
  }

  function renderFrame(frame) {
    const { name, index, progress: p } = frame;
    if (name !== previousPhase) {
      elements.battlefield.dataset.entrancePhase = name;
      const text = i18n.t(`battle.war_${name}`);
      elements['battle-note'].textContent = text;
      elements.status.textContent = text;
      elements['duel-phase'].textContent = i18n.t('battle.war_entrance');
      elements['duel-event'].textContent = text;
      previousPhase = name;
    }
    const roaring = name === 'roar';
    elements.arena.dataset.warRoaring = String(roaring);
    const intensity = roaring ? Math.min(1, p * 12, (1 - p) * 8) * (reducedMotion() ? .15 : 1) : 0;
    if (roaring) shaking.forEach(({ node }, i) => {
      const d = roarDisplacement(i, p * ROAR_SECONDS, intensity);
      node.style.translate = `${d.x.toFixed(2)}px ${d.y.toFixed(2)}px`;
      node.style.rotate = `${d.rotation.toFixed(3)}deg`;
    });
    else restoreShake();
    for (const entry of entries) {
      const { fighter: f, g, size, actor, horse, sword, blade, tear, seam, waves } = entry;
      const rift = warRiftFrame(frame);
      tear.setAttribute('d', riftPath(g, rift.cut, rift.opening));
      tear.setAttribute('fill-opacity', String(rift.interior));
      tear.style.opacity = String(rift.riftOpacity);
      // Only the tip crosses the plane initially. Translation through a fixed mask
      // reveals more steel without scaling a whole floating sword into the scene.
      const bladeTransform = `translate(${g.x + g.dx * rift.cut} ${g.y + g.dy * rift.cut}) rotate(${f.side === 'right' ? 48 : -48})`;
      sword.setAttribute('transform', bladeTransform);
      blade.setAttribute('y', String(g.unit * (2 * rift.bladeDepth - 5.2 * .963)));
      sword.style.opacity = String(rift.bladeOpacity);
      seam.setAttribute('transform', bladeTransform);
      seam.style.opacity = String(rift.seamOpacity);
      const emerge = rift.emerge;
      const mount = name === 'mount' ? ease(p) : 0;
      const originX = g.x + g.dx * .48, originY = g.y + g.dy * .52;
      setPosition(actor, mix(originX, f.x, emerge), mix(originY, f.y, emerge), size);
      actor.style.opacity = String(emerge);
      actor.style.clipPath = emerge < 1 ? `inset(${(1 - emerge) * 85}% 0 0)` : 'none';
      actor.style.filter = `brightness(${mix(.08, 1, emerge)})`;
      const breath = roaring ? Math.sin(p * ROAR_SECONDS * 32) * .012 * intensity : 0;
      actor.style.transform = `translate(-50%, -50%) scale(${mix(.4, 1, emerge) + breath})`;
      actor.style.setProperty('--war-seat', String(mount));
      actor.style.setProperty('--war-facing', f.side === 'right' ? '-1' : '1');
      actor.style.setProperty('--war-rider-x', f.side === 'right' ? '22%' : '14%');
      const running = name === 'horse';
      const horseP = running ? ease(p) : name === 'mount' ? 1 : 0;
      const fromX = f.side === 'right' ? size * 1.2 : -size * .2;
      const phase = p * 20 * Math.PI;
      // Match the horse's final position inside war-body exactly at the handoff.
      const bodySize = g.unit * WAR_VISUAL_SCALE;
      const endX = f.x + bodySize * .07, endY = f.y + bodySize * .2;
      setPosition(horse, mix(fromX, endX, horseP), endY - (running ? Math.abs(Math.sin(phase)) * g.unit * .055 * (1 - p) : 0), size);
      horse.style.opacity = running ? '1' : name === 'mount' ? String(1 - mount) : '0';
      horse.style.transform = `translate(-50%, -50%) scale(.9) scaleX(${f.side === 'right' ? -1 : 1}) rotate(${running ? Math.sin(phase) * 3 * (1 - p) : 0}deg)`;
      for (const [i, wave] of waves.entries()) {
        const age = (frame.elapsed - ROAR_START) / 1000 - i * .34;
        const life = clamp(age / 1.2);
        const visible = age >= 0 && age < 1.2 && index >= STAGE_INDEX.roar;
        wave.setAttribute('r', String(g.unit * (.55 + life * 5.6)));
        wave.setAttribute('stroke-width', String(2.5 + (1 - life) * 8));
        wave.setAttribute('opacity', String(visible ? (1 - life) ** 2 * (reducedMotion() ? .3 : .75) : 0));
      }
    }
  }

  function update(now) {
    if (!layer) return true;
    if (!ready) return false;
    lastTick ??= now;
    const delta = Math.min(100, Math.max(0, now - lastTick));
    lastTick = now;
    if (document.hidden) return false;
    // Returning to a backgrounded tab must not skip the roar or the horse's arrival.
    elapsed += delta;
    const frame = warEntranceFrame(elapsed);
    if (frame.name !== 'complete') { renderFrame(frame); return false; }
    for (const entry of entries) {
      entry.live.dataset.arrived = 'true';
      entry.live.style.setProperty('--war-seat', '1');
    }
    stop();
    return true;
  }
  return { begin, update, stop };
}
