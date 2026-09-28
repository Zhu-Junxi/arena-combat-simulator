import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatEngine, weaponPose } from '../src/scripts/battle/combat-engine.js';
import { CHARACTER_BY_ID } from '../src/scripts/config/characters.js';
import { STAR_PASSIVE_SOURCES, activeStarPassives, grantStarPassive, starAttackSpeed, starCooldownAdvance } from '../src/scripts/battle/star-passive.js';

const starCharacter = CHARACTER_BY_ID['dongfang-changfan'];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function setup(starSide = 'left', enemy = CHARACTER_BY_ID.archer, random = () => 0.5) {
  const engine = createCombatEngine({ random });
  engine.reset(starSide === 'left' ? { left: starCharacter, right: enemy } : { left: enemy, right: starCharacter });
  engine.state.phase = 'running';
  const star = engine.state.fighters.find(f => f.side === starSide);
  const opponent = engine.state.fighters.find(f => f !== star);
  return { engine, star, opponent };
}

function landAttack(engine, attacker, target) {
  const attack = engine.startAttack(attacker, target);
  engine.state.elapsed += attacker.weapon.windup;
  engine.updateAttacks();
  const shot = engine.state.projectiles.find(p => p.owner === attacker);
  assert.ok(shot);
  if (shot.starFlight) Object.assign(shot.starFlight, { phase: 'flying', speed: 1000 });
  Object.assign(shot, { x: target.x - 80, y: target.y, angle: 0, vx: 1000, vy: 0 });
  engine.updateProjectiles(0.1);
  return attack;
}

test('three independent sources give additive haste and never refresh before their own expiry', () => {
  const { star } = setup();
  STAR_PASSIVE_SOURCES.forEach((source, index) => {
    assert.equal(grantStarPassive(star, source, index * 0.2), true);
    assert.equal(starAttackSpeed(star, index * 0.2), 1 + (index + 1) * 2);
  });
  assert.equal(starAttackSpeed(star, 1), 7);
  for (const source of STAR_PASSIVE_SOURCES) assert.equal(grantStarPassive(star, source, 1.9), false);
  near(star.starPassive['enemy-attack'], 2);
  near(star.starPassive['enemy-hurt'], 2.2);
  near(star.starPassive['enemy-hit'], 2.4);
  assert.equal(starAttackSpeed(star, 2), 5);
  assert.equal(grantStarPassive(star, 'enemy-attack', 2), true);
  near(star.starPassive['enemy-attack'], 4);
  assert.equal(grantStarPassive(star, 'enemy-hurt', 2), false);
  assert.equal(starAttackSpeed(star, 4), 1);
});

test('haste counts only active time and preserves accumulated cooldown when it expires', () => {
  const { engine, star, opponent } = setup();
  grantStarPassive(star, 'enemy-attack', 0);
  grantStarPassive(star, 'enemy-hurt', 0);
  near(starCooldownAdvance(star, 1.5, 1), 3);
  near(starCooldownAdvance(star, 2, 1), 1);
  star.cooldownElapsed = -10;
  opponent.cooldownElapsed = -10;
  engine.state.elapsed = 1.5;
  engine.step(1);
  near(star.cooldownElapsed, -7);
  near(opponent.cooldownElapsed, -9);
  engine.step(0.5);
  near(star.cooldownElapsed, -6.5);
});

test('enemy attacks, enemy hurt and enemy hits trigger their respective source on either side', () => {
  for (const side of ['left', 'right']) {
    const { engine, star, opponent } = setup(side);
    engine.startAttack(opponent, star);
    assert.deepEqual(activeStarPassives(star, engine.state.elapsed), ['enemy-attack']);
    const expiry = star.starPassive['enemy-attack'];
    landAttack(engine, star, opponent);
    assert.ok(star.starPassive['enemy-hurt'] > engine.state.elapsed);
    assert.equal(star.starPassive['enemy-hit'], undefined);
    landAttack(engine, opponent, star);
    assert.equal(activeStarPassives(star, engine.state.elapsed).length, 3);
    assert.equal(star.starPassive['enemy-attack'], expiry);
    assert.deepEqual(opponent.starPassive, {});
  }
});

test('damage-over-time on the enemy triggers hurt; damage on Dong Fang does not repeat enemy-hit', () => {
  const { engine, star, opponent } = setup();
  star.cooldownElapsed = opponent.cooldownElapsed = -10;
  opponent.burn = { dps: 2, expiresAt: 5 };
  star.burn = { dps: 2, expiresAt: 5 };
  engine.step(0.1);
  assert.deepEqual(activeStarPassives(star, engine.state.elapsed), ['enemy-hurt']);
  near(star.cooldownElapsed, -9.9); // A new stack cannot accelerate the preceding step.
  const expiry = star.starPassive['enemy-hurt'];
  engine.step(0.1);
  assert.equal(star.starPassive['enemy-hurt'], expiry);
  engine.state.elapsed = expiry;
  engine.step(0.1);
  assert.ok(star.starPassive['enemy-hurt'] > expiry);
});

test('missed shots trigger only enemy-attack; harmless Priest marks still count as enemy hits', () => {
  const { engine, star, opponent } = setup();
  engine.startAttack(opponent, star);
  engine.state.elapsed = opponent.weapon.windup;
  engine.updateAttacks();
  const projectile = engine.state.projectiles[0];
  Object.assign(projectile, { x: 10, y: 10, vx: -1000, vy: 0 });
  engine.updateProjectiles(0.5);
  assert.deepEqual(activeStarPassives(star, engine.state.elapsed), ['enemy-attack']);
  const priestMatch = setup('left', CHARACTER_BY_ID.priest);
  const health = priestMatch.star.health;
  landAttack(priestMatch.engine, priestMatch.opponent, priestMatch.star);
  assert.equal(priestMatch.star.health, health);
  assert.deepEqual(activeStarPassives(priestMatch.star, priestMatch.engine.state.elapsed), ['enemy-attack', 'enemy-hit']);
});

test('stacked haste causes attacks sooner and reset clears all sources', () => {
  const { engine, star, opponent } = setup();
  STAR_PASSIVE_SOURCES.forEach(source => grantStarPassive(star, source, 0));
  opponent.cooldownElapsed = -100;
  const readyAt = star.attackCooldown / 7;
  engine.step(readyAt - 0.01);
  assert.equal(star.attack, null);
  engine.step(0.01);
  assert.ok(star.attack);
  near(star.attack.startedAt, readyAt);
  engine.reset({ left: starCharacter, right: CHARACTER_BY_ID.archer });
  assert.deepEqual(engine.state.fighters[0].starPassive, {});
});

test('every attack creates exactly one one-damage star at zero through three stacks', () => {
  for (const side of ['left', 'right']) for (let stacks = 0; stacks <= 3; stacks++) {
    const { engine, star, opponent } = setup(side);
    STAR_PASSIVE_SOURCES.slice(0, stacks).forEach(source => grantStarPassive(star, source, 0));
    const attack = engine.startAttack(star, opponent);
    engine.state.elapsed = attack.startedAt + star.weapon.windup;
    engine.updateAttacks();
    assert.equal(engine.state.projectiles.length, 1);
    for (let frame = 0; frame < 5; frame++) {
      engine.state.elapsed += 0.12;
      engine.updateAttacks();
      assert.equal(engine.state.projectiles.length, 1);
    }
    const projectile = engine.state.projectiles[0];
    assert.equal(star.attacksFired, 1);
    assert.equal(projectile.damage, 1);
    const health = opponent.health;
    for (let frame = 0; frame < 300 && engine.state.projectiles.length; frame++) engine.updateProjectiles(1 / 120);
    assert.equal(opponent.health, health - 1);
    assert.equal(engine.state.projectiles.length, 0);
  }
});

test('gaining or losing stacks during casting never creates extra stars', () => {
  for (const expired of [true, false]) {
    const { engine, star, opponent } = setup();
    if (expired) {
      STAR_PASSIVE_SOURCES.forEach(source => grantStarPassive(star, source, 0));
      engine.state.elapsed = 1.9;
    }
    const attack = engine.startAttack(star, opponent);
    if (!expired) STAR_PASSIVE_SOURCES.forEach(source => grantStarPassive(star, source, 0.1));
    engine.state.elapsed = attack.startedAt + star.weapon.windup;
    engine.updateAttacks();
    for (let index = 0; index < 5; index++) {
      engine.state.elapsed += 0.12;
      engine.updateAttacks();
    }
    assert.equal(engine.state.projectiles.length, 1);
  }
});

test('actual star firing cadence follows 200% haste per stack without an animation bottleneck', () => {
  for (let stacks = 1; stacks <= 3; stacks++) {
    const shots = [];
    const engine = createCombatEngine({ random: () => 0.5, onEvent: event => {
      if (event.type === 'projectile-spawned' && event.fighter.side === 'left') shots.push({ time: event.battle.elapsed, shot: event.projectile.shot });
    } });
    engine.reset({ left: starCharacter, right: CHARACTER_BY_ID.archer });
    engine.state.phase = 'running';
    const [star, opponent] = engine.state.fighters;
    opponent.cooldownElapsed = -100;
    star.projectileSpeed = 0; // Prevent hits from adding a new passive source during this timing check.
    STAR_PASSIVE_SOURCES.slice(0, stacks).forEach(source => grantStarPassive(star, source, 0));
    for (let frame = 0; frame < 1800 && shots.length < 2; frame++) engine.step(0.001);
    assert.equal(shots.length, 2);
    assert.deepEqual(shots.map(shot => shot.shot), [1, 2]);
    const interval = (star.attackCooldown + star.weapon.windup) / (1 + stacks * 2);
    assert.ok(Math.abs(shots[1].time - shots[0].time - interval) < 0.004);
  }
});

test('casting animation keeps accrued haste when a stack expires mid-cast', () => {
  const { engine, star, opponent } = setup();
  grantStarPassive(star, 'enemy-attack', 0);
  opponent.cooldownElapsed = -100;
  engine.state.elapsed = 1.95;
  const attack = engine.startAttack(star, opponent);
  engine.step(0.1);
  near(weaponPose(star, engine.state.elapsed).age, 0.2);
  assert.equal(attack.released, false);
  engine.step(0.08);
  assert.equal(attack.released, true);
  assert.equal(engine.state.projectiles.length, 1);
});
