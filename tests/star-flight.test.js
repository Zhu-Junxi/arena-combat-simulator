import test from 'node:test';
import assert from 'node:assert/strict';
import { createStarLaunch, createStarFlight, advanceStarFlight } from '../src/scripts/battle/star-flight.js';

function makeStar(angle = 0, lateralRandom = 0.5, distanceRandom = 0.5) {
  const owner = { x: 300, y: 300, prevX: 300, prevY: 300, projectileSpeed: 560 };
  const target = { x: 300 + 500 * Math.cos(angle), y: 300 + 500 * Math.sin(angle) };
  Object.assign(target, { prevX: target.x, prevY: target.y });
  const rules = { fighterSize: 100, projectileSpeedScale: 1 };
  const samples = [lateralRandom, distanceRandom];
  const starFlight = createStarFlight(owner, target, rules, createStarLaunch(rules, () => samples.shift()));
  return { owner, target, starFlight, x: starFlight.x, y: starFlight.y, angle: starFlight.angle };
}

test('random spawn stays behind the caster within bounded angles and distance at any facing', () => {
  for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 3]) {
    for (const lateral of [0, 0.25, 0.5, 0.75, 1]) for (const distance of [0, 0.5, 1]) {
      const star = makeStar(angle, lateral, distance);
      const dx = star.x - star.owner.x, dy = star.y - star.owner.y;
      const radius = Math.hypot(dx, dy);
      const rear = -(dx * Math.cos(angle) + dy * Math.sin(angle));
      assert.ok(radius >= 115 - 1e-8 && radius <= 145 + 1e-8);
      assert.ok(rear >= radius * Math.cos(Math.PI / 7) - 1e-8);
      const sideOffset = dy * Math.cos(angle) - dx * Math.sin(angle);
      if (lateral !== 0.5) assert.equal(Math.sign(sideOffset), Math.sign(lateral - 0.5));
    }
  }
});

test('stars reach the flank before launching, accelerating continuously', () => {
  const star = makeStar();
  const flight = star.starFlight;
  assert.equal(flight.acceleration, 1344);
  const time = 2 * flight.orbitRadius * flight.arcAngle /
    (Math.sqrt(flight.speed ** 2 + 2 * flight.acceleration * flight.orbitRadius * flight.arcAngle) + flight.speed);
  advanceStarFlight(star, time);
  assert.equal(flight.phase, 'flying');
  assert.ok(Math.abs(star.x - star.owner.x) < 1e-8);
  assert.ok(Math.abs(star.y - star.owner.y - flight.orbitRadius) < 1e-8);
  const speed = flight.speed;
  advanceStarFlight(star, 0.1);
  assert.ok(star.x > star.owner.x);
  assert.ok(flight.speed > speed);
});

test('flight is independent of frame size across the flank transition', () => {
  const whole = makeStar(0, 0.2), frames = makeStar(0, 0.2);
  advanceStarFlight(whole, 1);
  for (let i = 0; i < 100; i++) advanceStarFlight(frames, 0.01);
  assert.ok(Math.abs(whole.x - frames.x) < 1e-7);
  assert.ok(Math.abs(whole.y - frames.y) < 1e-7);
  assert.ok(Math.abs(whole.starFlight.speed - frames.starFlight.speed) < 1e-7);
});

test('flanking stars follow the moving caster', () => {
  const still = makeStar(), moving = makeStar();
  moving.owner.x += 20;
  advanceStarFlight(still, 0.1);
  advanceStarFlight(moving, 0.1);
  assert.ok(Math.abs(moving.x - still.x - 20) < 1e-8);
});
