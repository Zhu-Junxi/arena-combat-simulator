import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS } from '../src/scripts/config/characters.js';
import {
  advanceMovement,
  activeMarks,
  applyVines,
  createCombatEngine,
  dealDamage,
  movementFactor,
  priestMarkAttackCooldownFactor
} from '../src/scripts/battle/combat-engine.js';

const selected = { left: CHARACTERS[0], right: CHARACTERS[1] };
const mageSelected = { left: CHARACTERS.find(character => character.id === 'mage'), right: CHARACTERS[1] };
const priestSelected = { left: CHARACTERS.find(character => character.id === 'priest'), right: CHARACTERS[1] };
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

function castMageSpell(engine, mage, target) {
  const attack = engine.startAttack(mage, target);
  engine.state.elapsed = attack.startedAt + mage.weapon.windup;
  engine.updateAttacks();
  const projectile = engine.state.projectiles[0];
  Object.assign(target, { x: 500, y: 500, prevX: 500, prevY: 500 });
  Object.assign(projectile, { x: 420, y: 500, vx: 620, vy: 0, age: 0 });
  engine.state.elapsed = attack.startedAt + 0.5;
  engine.updateProjectiles(0.2);
  engine.state.elapsed = attack.startedAt + mage.weapon.duration + 0.001;
  engine.updateAttacks();
  return attack;
}

function castMageSpellWithoutHit(engine, mage, target) {
  const attack = engine.startAttack(mage, target);
  engine.state.elapsed = attack.startedAt + mage.weapon.windup;
  engine.updateAttacks();
  engine.state.projectiles = [];
  engine.state.elapsed = attack.startedAt + mage.weapon.duration + 0.001;
  engine.updateAttacks();
  return attack;
}

test('plate armor reduces damage with a minimum of one', () => {
  const engine = createCombatEngine();
  engine.reset(selected);
  const [warrior, archer] = engine.state.fighters;
  for (const [input, expected] of [[8, 7], [5, 4], [2, 1], [1, 1]]) {
    warrior.health = 100;
    assert.equal(dealDamage(warrior, input), expected);
    assert.equal(warrior.health, 100 - expected);
  }
  archer.health = 80;
  assert.equal(dealDamage(archer, 5), 5);
  assert.equal(dealDamage(archer, 0), 0);
  warrior.health = 1;
  assert.equal(dealDamage(warrior, 8), 1);
  assert.equal(dealDamage(warrior, 8), 0);
});

test('match setup applies fighter values, arena geometry, and differentiated launch speeds', () => {
  const engine = createCombatEngine({ random: () => 0 });
  engine.reset(selected, {
    fighters: {
      left: { health: 175, attack: [12], attackCD: [0.5], movementSpeed: 220 },
      right: { health: 65, attack: [9], attackCD: [1.25], movementSpeed: 132, projectileSpeed: 800 }
    },
    arena: { size: 1200, fighterSize: 120, startingDistance: 600, projectileSpeedScale: 1.5, controlDurationScale: 2, collisionMode: 'bounce' }
  });
  const [warrior, archer] = engine.state.fighters;
  assert.equal(warrior.maxHealth, 175);
  assert.equal(warrior.x, 300);
  assert.equal(archer.x, 900);
  assert.equal(warrior.attackCooldown, 0.5);
  engine.launch();
  near(Math.hypot(warrior.vx, warrior.vy), 220);
  near(Math.hypot(archer.vx, archer.vy), 132);

  engine.startAttack(archer, warrior);
  engine.state.elapsed = archer.weapon.windup;
  engine.updateAttacks();
  near(Math.hypot(engine.state.projectiles[0].vx, engine.state.projectiles[0].vy), 800 * 1.5);
});

test('control duration scale and all collision modes behave independently', () => {
  const engine = createCombatEngine();
  engine.reset(selected);
  const [warrior] = engine.state.fighters;
  applyVines(warrior, CHARACTERS[1].trait, 10, 2);
  near(warrior.rootUntil, 14);
  near(warrior.slowUntil, 20);

  const makeFighters = () => [
    { x: 400, y: 500, vx: 100, vy: 0, rootUntil: 0, slowUntil: 0, slowFactor: 1 },
    { x: 600, y: 500, vx: -100, vy: 0, rootUntil: 0, slowUntil: 0, slowFactor: 1 }
  ];
  const stop = makeFighters();
  advanceMovement(stop, 1, 0, { size: 1000, fighterSize: 100, collisionMode: 'stop', contactStopDuration: 0.5 });
  assert.deepEqual(stop.map(fighter => fighter.vx), [-100, 100]);
  near(stop[0].x, 450);
  near(stop[1].x, 550);

  const briefStop = makeFighters();
  advanceMovement(briefStop, 1, 0, { size: 1000, fighterSize: 100, collisionMode: 'stop', contactStopDuration: 0.25 });
  near(briefStop[0].x, 425);
  near(briefStop[1].x, 575);

  const pass = makeFighters();
  advanceMovement(pass, 1, 0, { size: 1000, fighterSize: 100, collisionMode: 'pass' });
  near(pass[0].x, 500);
  near(pass[1].x, 500);

  const bounce = makeFighters();
  advanceMovement(bounce, 1, 0, { size: 1000, fighterSize: 100, collisionMode: 'bounce' });
  assert.deepEqual(bounce.map(fighter => fighter.vx), [-100, 100]);

  const unequal = makeFighters();
  unequal[1].vx = -50;
  advanceMovement(unequal, 1, 0, { size: 1000, fighterSize: 100, collisionMode: 'bounce' });
  near(Math.hypot(unequal[0].vx, unequal[0].vy), 100);
  near(Math.hypot(unequal[1].vx, unequal[1].vy), 50);
});

test('every fourth fired arrow is empowered and a miss consumes its count', () => {
  const engine = createCombatEngine();
  engine.reset(selected);
  const [warrior, archer] = engine.state.fighters;
  engine.state.phase = 'running';
  const fired = [];
  for (let number = 1; number <= 8; number += 1) {
    engine.startAttack(archer, warrior);
    engine.state.elapsed = archer.attack.startedAt + archer.weapon.windup;
    engine.updateAttacks();
    assert.equal(archer.attacksFired, number);
    const projectile = engine.state.projectiles.pop();
    assert.ok(projectile);
    assert.equal(projectile.empowered, number === 4 || number === 8);
    assert.equal(projectile.shot, number);
    fired.push(projectile);
    engine.state.elapsed = archer.attack.startedAt + archer.weapon.duration + 0.001;
    engine.updateAttacks();
    assert.equal(archer.attack, null);
  }
  assert.deepEqual(fired.filter(projectile => projectile.empowered).map(projectile => projectile.shot), [4, 8]);

  engine.state.elapsed = 10;
  const missed = fired[3];
  Object.assign(missed, { x: 995, y: 50, vx: 620, vy: 0, age: 0 });
  engine.state.projectiles = [missed];
  engine.updateProjectiles(0.2);
  assert.equal(engine.state.projectiles.length, 0);
  assert.equal(warrior.rootUntil, 0);
  assert.equal(warrior.slowUntil, 0);
});

test('empowered projectile applies damage, root, and slow through the real impact path', () => {
  const engine = createCombatEngine();
  engine.reset(selected);
  const [warrior, archer] = engine.state.fighters;
  engine.state.phase = 'running';
  archer.attacksFired = 7;
  engine.startAttack(archer, warrior);
  engine.state.elapsed = archer.weapon.windup;
  engine.updateAttacks();
  const projectile = engine.state.projectiles[0];
  Object.assign(warrior, { x: 500, y: 500, prevX: 500, prevY: 500, health: 100 });
  Object.assign(projectile, { x: 420, y: 500, vx: 620, vy: 0, age: 0 });
  engine.state.elapsed = 10;
  engine.updateProjectiles(0.2);
  assert.equal(warrior.health, 96);
  near(warrior.rootUntil, 12);
  near(warrior.slowUntil, 15);
  near(movementFactor(warrior, 11.999), 0);
  near(movementFactor(warrior, 12), 0.5);
  near(movementFactor(warrior, 14.999), 0.5);
  near(movementFactor(warrior, 15), 1);
});

test('mage randomly selects themed cycles and each cycle keeps its three spell order', () => {
  const first = createCombatEngine({ random: () => 0 });
  first.reset(mageSelected);
  first.state.phase = 'running';
  const [firstMage, firstTarget] = first.state.fighters;
  const firstModes = [
    castMageSpell(first, firstMage, firstTarget).mode,
    castMageSpell(first, firstMage, firstTarget).mode,
    castMageSpell(first, firstMage, firstTarget).mode
  ];
  assert.deepEqual(firstModes, [0, 1, 2]);
  assert.equal(firstMage.mageCycle, null);

  const second = createCombatEngine({ random: () => 0.5 });
  second.reset(mageSelected);
  second.state.phase = 'running';
  const [secondMage, secondTarget] = second.state.fighters;
  const secondModes = [
    castMageSpell(second, secondMage, secondTarget).mode,
    castMageSpell(second, secondMage, secondTarget).mode,
    castMageSpell(second, secondMage, secondTarget).mode
  ];
  assert.deepEqual(secondModes, [0, 1, 2]);
});

test('mage marks are typed, expire, and power only their matching finisher', () => {
  const engine = createCombatEngine({ random: () => 0 });
  engine.reset(mageSelected);
  engine.state.phase = 'running';
  const [mage, archer] = engine.state.fighters;
  castMageSpell(engine, mage, archer);
  castMageSpell(engine, mage, archer);
  castMageSpell(engine, mage, archer);
  assert.equal(archer.maxHealth - archer.health, 15);
  assert.equal(activeMarks(archer, 'ice', engine.state.elapsed), 0);
});

test('mage finisher still resolves after missed setup spells with reduced damage', () => {
  const partial = createCombatEngine({ random: () => 0 });
  partial.reset(mageSelected);
  partial.state.phase = 'running';
  const [partialMage, partialTarget] = partial.state.fighters;
  castMageSpell(partial, partialMage, partialTarget);
  castMageSpellWithoutHit(partial, partialMage, partialTarget);
  castMageSpell(partial, partialMage, partialTarget);
  assert.equal(partialTarget.maxHealth - partialTarget.health, 9);

  const missed = createCombatEngine({ random: () => 0 });
  missed.reset(mageSelected);
  missed.state.phase = 'running';
  const [missedMage, missedTarget] = missed.state.fighters;
  castMageSpellWithoutHit(missed, missedMage, missedTarget);
  castMageSpellWithoutHit(missed, missedMage, missedTarget);
  castMageSpell(missed, missedMage, missedTarget);
  assert.equal(missedTarget.maxHealth - missedTarget.health, 5);
});

test('priest mark shots deal no damage and Prayer consumes marks for scaled healing and damage', () => {
  const engine = createCombatEngine();
  engine.reset(priestSelected);
  engine.state.phase = 'running';
  const [priest, target] = engine.state.fighters;
  const attack = engine.startAttack(priest, target);
  engine.state.elapsed = priest.weapon.windup;
  engine.updateAttacks();
  const projectile = engine.state.projectiles[0];
  Object.assign(target, { x: 500, y: 500, prevX: 500, prevY: 500, health: 80 });
  Object.assign(projectile, { x: 420, y: 500, vx: 620, vy: 0, age: 0 });
  engine.updateProjectiles(0.2);
  assert.equal(target.health, 80);
  assert.equal(target.priestMarks, 1);
  assert.equal(priest.attackCooldown, 1);

  priest.health = 20;
  target.priestMarks = 3;
  engine.state.elapsed = 3;
  engine.updateAttacks();
  assert.ok(priest.prayer);
  near(movementFactor(priest, 3), 0.55);
  engine.state.elapsed = 5;
  engine.updateAttacks();
  assert.equal(priest.prayer, null);
  assert.equal(target.priestMarks, 0);
  assert.equal(priest.health, 30);
  assert.equal(target.health, 71);
  near(priest.prayerCooldownUntil, 11);
});

test('direct hits interrupt Prayer while mark decay preserves the configured floor', () => {
  const engine = createCombatEngine();
  engine.reset(priestSelected);
  engine.state.phase = 'running';
  const [priest, archer] = engine.state.fighters;
  archer.priestMarks = 5;
  archer.priestMarkDecayAt = 2;
  engine.state.elapsed = 0;
  engine.updateAttacks();
  assert.ok(priest.prayer);

  Object.assign(priest, { x: 500, y: 500, prevX: 500, prevY: 500 });
  engine.state.projectiles = [{ owner: archer, target: priest, damage: 5, x: 420, y: 500, vx: 620, vy: 0, radius: 5, age: 0 }];
  engine.state.elapsed = 0.5;
  engine.updateProjectiles(0.2);
  assert.equal(priest.prayer, null);
  near(priest.prayerInterruptedUntil, 2);
  assert.equal(priest.prayerCooldownUntil, 0);
  priest.prayerCooldownUntil = Infinity;

  engine.state.elapsed = 2;
  engine.step(0);
  assert.equal(archer.priestMarks, 4);
  engine.state.elapsed = 8;
  engine.step(0);
  assert.equal(archer.priestMarks, 3);
});

test('Priest marks stack movement and attack-speed penalties that clear when consumed', () => {
  const engine = createCombatEngine();
  engine.reset(priestSelected);
  const [priest, archer] = engine.state.fighters;
  archer.priestMarks = 3;
  archer.priestMarkEffects = priest.priestAbilities;
  near(movementFactor(archer, 0), 0.85);
  near(priestMarkAttackCooldownFactor(archer), 1.15);
  archer.cooldownElapsed = archer.attackCooldown;
  assert.ok(archer.cooldownElapsed < archer.attackCooldown * priestMarkAttackCooldownFactor(archer));
  archer.priestMarks = 0;
  archer.priestMarkEffects = null;
  near(movementFactor(archer, 0), 1);
  near(priestMarkAttackCooldownFactor(archer), 1);
});

test('mage full-combo sustained damage remains between archer and warrior baselines', () => {
  const mage = mageSelected.left;
  const archer = CHARACTERS[1];
  const warrior = CHARACTERS[0];
  const mageDamagePerSecond = (mage.stats.attack[0] + mage.stats.attack[1] + mage.stats.attack[2] + 5) /
    (mage.stats.attackCD[0] + mage.stats.attackCD[1] + mage.stats.attackCD[2]);
  const archerDamagePerSecond = archer.stats.attack / archer.stats.attackCD;
  const warriorDamagePerSecond = warrior.stats.attack / warrior.stats.attackCD;
  near(mageDamagePerSecond, 15 / 6);
  assert.ok(mageDamagePerSecond > archerDamagePerSecond);
  assert.ok(mageDamagePerSecond < warriorDamagePerSecond);
});


test('movement splits at control expiry boundaries and preserves rooted fighters', () => {
  const engine = createCombatEngine();
  engine.reset(selected);
  let [warrior, archer] = engine.state.fighters;
  Object.assign(warrior, { x: 250, y: 200, vx: 100, vy: 0, rootUntil: 2, slowUntil: 5, slowFactor: 0.5 });
  Object.assign(archer, { x: 750, y: 800, vx: 0, vy: 0 });
  engine.advance(6);
  near(warrior.x, 500);
  near(warrior.vx, 100);

  engine.reset(selected);
  [warrior, archer] = engine.state.fighters;
  Object.assign(warrior, { x: 500, y: 500, vx: -220, vy: 0, rootUntil: 20, slowUntil: 23, slowFactor: 0.5 });
  Object.assign(archer, { x: 350, y: 500, vx: 220, vy: 0 });
  engine.advance(1);
  near(warrior.x, 500);
  near(warrior.vx, -220);
  near(archer.x, 230);
  near(archer.vx, -220);
});

test('long movement remains inside the arena without overlap or speed loss', () => {
  const engine = createCombatEngine();
  engine.reset(selected);
  const [warrior, archer] = engine.state.fighters;
  Object.assign(warrior, { x: 500, y: 400, vx: 132, vy: 176, rootUntil: 2, slowUntil: 5, slowFactor: 0.5 });
  Object.assign(archer, { x: 200, y: 200, vx: 176, vy: 132 });
  for (let index = 0; index < 2400; index += 1) {
    advanceMovement(engine.state.fighters, 1 / 120, engine.state.elapsed);
    engine.state.elapsed += 1 / 120;
    for (const fighter of engine.state.fighters) {
      assert.ok(fighter.x >= 50 - 1e-5 && fighter.x <= 950 + 1e-5);
      assert.ok(fighter.y >= 50 - 1e-5 && fighter.y <= 950 + 1e-5);
      near(Math.hypot(fighter.vx, fighter.vy), 220);
    }
    assert.ok(Math.abs(warrior.x - archer.x) >= 100 - 1e-5 || Math.abs(warrior.y - archer.y) >= 100 - 1e-5);
  }
});

test('launch uses injected randomness and reset clears all transient combat state', () => {
  const values = [0, 0];
  const engine = createCombatEngine({ random: () => values.shift() ?? 0 });
  engine.reset(selected);
  engine.launch();
  const [warrior, archer] = engine.state.fighters;
  near(warrior.vx, 220);
  near(warrior.vy, 0);
  near(archer.vx, 110);
  near(archer.vy, 220 * Math.sin(Math.PI / 3));

  Object.assign(warrior, { health: 10, attacksFired: 4, rootUntil: 8, slowUntil: 11, cooldownElapsed: 1 });
  engine.state.projectiles = [{ placeholder: true }];
  engine.reset(selected);
  for (const fighter of engine.state.fighters) {
    assert.equal(fighter.health, fighter.maxHealth);
    assert.equal(fighter.attacksFired, 0);
    assert.equal(fighter.rootUntil, 0);
    assert.equal(fighter.slowUntil, 0);
    assert.equal(fighter.cooldownElapsed, 0);
  }
  assert.equal(engine.state.projectiles.length, 0);
});
