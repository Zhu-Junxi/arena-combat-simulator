import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTERS } from '../src/scripts/config/characters.js';
import { createCombatEngine, canAttack } from '../src/scripts/battle/combat-engine.js';
import { GUARDIAN_RULES, createFlail, sweptChainContact, sweptHeadHit } from '../src/scripts/battle/guardian.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import { MATCH_SETTINGS_STORAGE_KEY, MATCH_SETTINGS_VERSION } from '../src/scripts/config/customization.js';
import { defaultFighterSettings } from '../src/scripts/config/customization.js';

const guardianCharacter = CHARACTERS.find(character => character.id === 'guardian');
const archerCharacter = CHARACTERS.find(character => character.id === 'archer');
const near = (a, b, tolerance = 1e-5) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

function fixture(options = {}) {
  const events = [];
  const engine = createCombatEngine({ ...options, onEvent: event => events.push(event) });
  engine.reset({ left: guardianCharacter, right: archerCharacter });
  engine.state.phase = 'running';
  const [guardian, target] = engine.state.fighters;
  Object.assign(guardian, { x: 200, prevX: 200, y: 500, prevY: 500, cooldownElapsed: -1000 });
  Object.assign(target, { x: 600, prevX: 600, y: 500, prevY: 500, cooldownElapsed: -1000, health: 300, maxHealth: 300 });
  return { engine, guardian, target, events };
}

function release(engine, guardian, target, broken = false) {
  if (broken) guardian.guardian.shield = 0;
  const attack = engine.startAttack(guardian, target);
  engine.state.elapsed = attack.startedAt + guardian.weapon.windup;
  engine.updateAttacks();
  return attack;
}

function incoming(engine, guardian, target, damage) {
  engine.state.projectiles.push({ owner: target, target: guardian, damage, x: guardian.x + 120, y: guardian.y, vx: -1000, vy: 0, radius: 5, age: 0 });
  engine.updateProjectiles(0.2);
}

function flailTick(engine, seconds) {
  engine.state.elapsed += seconds;
  engine.updateGuardianFlails(seconds);
}

function grounded(guardian, target, now = 0) {
  const flail = createFlail(guardian, target, 10);
  Object.assign(flail, { x: 800, y: 500, phase: 'grounded', landedAt: now, expiresAt: now + 5 });
  guardian.guardian.shield = 0;
  guardian.guardian.flail = flail;
  return flail;
}

test('guardian has a persistent 40-point shield, absorbs damage and switches permanently on break', () => {
  const { engine, guardian, target, events } = fixture();
  assert.equal(guardian.guardian.shield, 40);
  assert.equal(guardian.attackCooldown, 4);
  assert.equal(guardian.attackValues, 10);
  engine.step(10);
  assert.equal(guardian.guardian.shield, 40);
  incoming(engine, guardian, target, 30);
  assert.equal(guardian.guardian.shield, 10);
  assert.equal(guardian.health, 100);
  incoming(engine, guardian, target, 25);
  assert.equal(guardian.guardian.shield, 0);
  assert.equal(guardian.health, 85);
  incoming(engine, guardian, target, 10);
  assert.equal(guardian.health, 75);
  assert.equal(events.filter(event => event.type === 'shield-broken').length, 1);
  engine.step(20);
  assert.equal(guardian.guardian.shield, 0);
  release(engine, guardian, target);
  assert.equal(guardian.guardian.flail.phase, 'outbound');
  engine.reset({ left: guardianCharacter, right: archerCharacter });
  assert.equal(engine.state.fighters[0].guardian.shield, 40);
  assert.equal(engine.state.fighters[0].guardian.flail, null);
});

test('shield also absorbs damage-over-time without converting tiny ticks to whole damage', () => {
  const { engine, guardian } = fixture();
  guardian.burn = { dps: 2, expiresAt: 3 };
  engine.step(0.1);
  near(guardian.guardian.shield, 39.8);
  assert.equal(guardian.health, 100);
  guardian.guardian.shield = 0.1;
  engine.step(0.1);
  near(guardian.health, 99.9);
  assert.equal(guardian.guardian.shield, 0);
});

test('charge starts after a 4-second cooldown and deals one 10-point collision hit', () => {
  const { engine, guardian, target, events } = fixture();
  target.x = target.prevX = 550;
  guardian.cooldownElapsed = 0;
  engine.step(3.99);
  assert.equal(guardian.attack, null);
  engine.step(0.01);
  assert.ok(guardian.attack);
  engine.step(guardian.weapon.windup);
  assert.ok(guardian.guardian.dash);
  engine.step(0.5);
  assert.equal(target.health, 290);
  assert.equal(guardian.guardian.dash, null);
  assert.equal(events.filter(event => event.type === 'damage' && event.target === target).length, 1);
  near(guardian.x, 450);
});

test('charge is fast, finite and straight even when the enemy moves aside', () => {
  const { engine, guardian, target } = fixture();
  release(engine, guardian, target);
  target.x = target.prevX = 850;
  target.y = target.prevY = 800;
  engine.advance(0.1);
  near(guardian.x, 315);
  near(guardian.y, 500);
  engine.advance(0.5);
  near(guardian.x, 470);
  near(guardian.y, 500);
  assert.equal(target.health, 300);
  assert.equal(guardian.guardian.dash, null);
});

test('after a missed charge, normal movement follows its locked heading at the original speed', () => {
  const { engine, guardian, target } = fixture();
  guardian.vx = -66;
  target.y = target.prevY = 800;
  release(engine, guardian, target);
  Object.assign(target, { x: 900, prevX: 900, y: 100, prevY: 100 });
  engine.advance(GUARDIAN_RULES.chargeDistance / GUARDIAN_RULES.chargeSpeed);
  assert.equal(guardian.guardian.dash, null);
  near(guardian.x, 416);
  near(guardian.y, 662);
  near(guardian.vx, 52.8);
  near(guardian.vy, 39.6);
  engine.advance(0.25);
  near(guardian.x, 429.2);
  near(guardian.y, 671.9);
  near(Math.hypot(guardian.vx, guardian.vy), 66);
});

test('a charge hitting a wall reflects its new heading and resumes at normal speed', () => {
  const { engine, guardian, target } = fixture();
  Object.assign(guardian, { x: 850, prevX: 850, vy: 66 });
  target.x = target.prevX = 900;
  release(engine, guardian, target);
  Object.assign(target, { x: 600, prevX: 600, y: 800, prevY: 800 });
  engine.advance(100 / GUARDIAN_RULES.chargeSpeed);
  assert.equal(guardian.guardian.dash, null);
  near(guardian.x, 950);
  near(guardian.vx, -66);
  near(guardian.vy, 0);
  engine.advance(0.2);
  near(guardian.x, 936.8);
  near(guardian.y, 500);
});

test('a charge hitting an opponent keeps the collision response instead of the pre-charge heading', () => {
  const { engine, guardian, target } = fixture();
  guardian.vy = 66;
  target.x = target.prevX = 550;
  release(engine, guardian, target);
  engine.advance(0.5);
  assert.equal(guardian.guardian.dash, null);
  assert.equal(target.health, 290);
  near(guardian.vx, -66);
  near(guardian.vy, 0);
  near(guardian.x, 450 - (0.5 - 250 / GUARDIAN_RULES.chargeSpeed) * 66);
  near(guardian.y, 500);
});

test('charge stops at arena walls and hits in pass-through collision mode too', () => {
  const { engine, guardian, target } = fixture({ rules: { collisionMode: 'pass' } });
  target.x = target.prevX = 550;
  release(engine, guardian, target);
  engine.advance(0.5);
  assert.equal(target.health, 290);
  assert.equal(guardian.guardian.dash, null);
  guardian.attack = null;
  guardian.x = 850;
  target.x = 950; target.y = 800;
  release(engine, guardian, target);
  guardian.guardian.dash.angle = 0;
  engine.advance(0.5);
  near(guardian.x, 950);
  assert.equal(guardian.guardian.dash, null);
});

test('breaking the shield during a charge cancels it and removes its old attack', () => {
  const { engine, guardian, target, events } = fixture();
  const attack = release(engine, guardian, target);
  incoming(engine, guardian, target, 40);
  assert.equal(guardian.guardian.dash, null);
  assert.equal(guardian.attack, null);
  assert.ok(events.some(event => event.type === 'attack-ended' && event.attack === attack));
});

test('a flail locks the position at release and never follows a dodging opponent', () => {
  const { engine, guardian, target } = fixture();
  guardian.guardian.shield = 0;
  engine.startAttack(guardian, target);
  target.x = target.prevX = 650;
  engine.state.elapsed = guardian.weapon.windup;
  engine.updateAttacks();
  const flail = guardian.guardian.flail;
  assert.equal(flail.targetX, 650);
  target.x = target.prevX = 900;
  target.y = target.prevY = 850;
  flailTick(engine, 1.1);
  assert.equal(flail.phase, 'grounded');
  near(flail.x, 650);
  near(flail.y, 500);
  assert.equal(target.health, 300);
  assert.equal(canAttack(guardian, target), false);
  assert.equal(engine.startAttack(guardian, target), null);
});

test('outbound and landing each deal 10, holding does not repeat damage, return deals 10 once', () => {
  const { engine, guardian, target, events } = fixture();
  release(engine, guardian, target, true);
  const flail = guardian.guardian.flail;
  const flightTime = Math.hypot(flail.targetX - flail.x, flail.targetY - flail.y) / GUARDIAN_RULES.throwSpeed;
  const startX = flail.x;
  flailTick(engine, 0.1);
  near(flail.x, startX + 38);
  flailTick(engine, flightTime - 0.1);
  assert.equal(flail.phase, 'grounded');
  assert.equal(target.health, 280);
  flailTick(engine, 4.999);
  assert.equal(flail.phase, 'grounded');
  assert.equal(target.health, 280);
  flailTick(engine, 0.001);
  assert.equal(flail.phase, 'returning');
  assert.equal(target.health, 280);
  flailTick(engine, 0.01);
  near(flail.x, flail.targetX - 5);
  assert.equal(target.health, 270);
  flailTick(engine, 1);
  assert.equal(target.health, 270);
  assert.equal(guardian.guardian.flail, null);
  assert.equal(guardian.attack, null);
  assert.deepEqual(events.filter(event => event.type === 'flail-hit').map(event => event.phase), ['outbound', 'landing', 'return']);
});

test('ground contact deals 5 per entry and never 5 on every simulation frame', () => {
  const { engine, guardian, target, events } = fixture();
  const flail = grounded(guardian, target);
  target.x = target.prevX = 650;
  flailTick(engine, 0.01);
  target.x = 750;
  flailTick(engine, 0.1);
  assert.equal(target.health, 295);
  target.prevX = target.x;
  flailTick(engine, 1);
  assert.equal(target.health, 295);
  target.x = 650;
  flailTick(engine, 0.1);
  assert.equal(flail.touching, false);
  target.prevX = 650; target.x = 750;
  flailTick(engine, 0.1);
  assert.equal(target.health, 290);
  assert.equal(events.filter(event => event.type === 'flail-hit').length, 2);
});

test('landing damage reaches the small surrounding ring and misses beyond it', () => {
  for (const [offset, expected] of [[85, 290], [100, 300]]) {
    const { engine, guardian, target } = fixture();
    release(engine, guardian, target, true);
    target.y = target.prevY = 500 + offset;
    flailTick(engine, 1);
    assert.equal(target.health, expected);
  }
});

test('swept head collision catches fast fly-throughs but rejects rounded-box corner misses', () => {
  assert.equal(sweptHeadHit(-500, 0, 500, 0, 50, 24), true);
  assert.equal(sweptHeadHit(73, 73, 73, 73, 50, 24), false);
  assert.equal(sweptHeadHit(-500, 90, 500, 90, 50, 24), false);
});

test('grounded chain is a wall in every body-collision mode and retracting chain is passable', () => {
  for (const collisionMode of ['bounce', 'stop', 'pass']) {
    const { engine, guardian, target } = fixture({ rules: { collisionMode } });
    const flail = grounded(guardian, target);
    Object.assign(target, { x: 500, prevX: 500, y: 300, prevY: 300, vx: 0, vy: 800 });
    engine.advance(0.6);
    assert.ok(target.y <= 446 + 1e-3, `${collisionMode}: crossed chain at ${target.y}`);
    assert.ok(target.vy < 0);
    Object.assign(target, { x: 500, y: 300, vx: 0, vy: 800 });
    flail.phase = 'returning';
    engine.advance(0.5);
    near(target.y, 700);
  }
});

test('moving and diagonal chains catch crossings without extending beyond their endpoints', () => {
  assert.ok(sweptChainContact({ x: 500, y: 200 }, { x: 500, y: 800 }, { x: 200, y: 300 }, { x: 200, y: 350 }, { x: 800, y: 700 }, 54));
  assert.equal(sweptChainContact({ x: 950, y: 200 }, { x: 950, y: 800 }, { x: 200, y: 500 }, { x: 200, y: 500 }, { x: 800, y: 500 }, 54), null);
  const { engine, guardian, target } = fixture();
  grounded(guardian, target);
  Object.assign(guardian, { vy: 220 });
  Object.assign(target, { x: 500, y: 600, vx: 0, vy: -600 });
  engine.advance(0.15);
  const chainY = guardian.y + (500 - guardian.x) / (800 - guardian.x) * (500 - guardian.y);
  assert.ok(target.y > chainY + 50);
});

test('large flail steps preserve its five-second hold and clean up after retrieval', () => {
  const { engine, guardian, target, events } = fixture();
  release(engine, guardian, target, true);
  flailTick(engine, 10);
  assert.equal(guardian.guardian.flail, null);
  assert.equal(guardian.attack, null);
  assert.equal(events.filter(event => event.type === 'flail-landed').length, 1);
  assert.equal(events.filter(event => event.type === 'flail-returning').length, 1);
  assert.equal(events.filter(event => event.type === 'flail-removed').length, 1);
});

test('finishing a match removes the chain wall and active charge', () => {
  const { engine, guardian, target } = fixture();
  release(engine, guardian, target, true);
  flailTick(engine, 1);
  engine.finish();
  assert.equal(guardian.guardian.flail, null);
  assert.equal(guardian.guardian.dash, null);
  assert.equal(guardian.attack, null);
});

test('saved old guardian defaults migrate to 10 damage and 4 seconds while custom values remain', () => {
  const value = { version: MATCH_SETTINGS_VERSION,
    characterDefaults: { guardian: { attack: [8], attackCD: [5] } },
    fighters: { left: { guardian: { attack: [8], attackCD: [5] } }, right: { guardian: { attack: [17], attackCD: [2.5] } } } };
  const storage = { getItem: key => key === MATCH_SETTINGS_STORAGE_KEY ? JSON.stringify(value) : null };
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  assert.deepEqual(store.getFighter('left', 'guardian').attack, [10]);
  assert.deepEqual(store.getFighter('left', 'guardian').attackCD, [4]);
  assert.deepEqual(store.getFighter('right', 'guardian').attack, [17]);
  assert.deepEqual(store.getFighter('right', 'guardian').attackCD, [2.5]);
});

test('guardians on either side complete real battles without invalid positions or duplicate flails', () => {
  let randomState = 271828;
  const random = () => ((randomState = (randomState * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const opponent of CHARACTERS.filter(character => !character.locked)) for (const side of ['left', 'right']) {
    let spawned = 0;
    let removed = 0;
    const engine = createCombatEngine({ random, onEvent: event => {
      if (event.fighter?.side !== side) return;
      if (event.type === 'flail-spawned') { spawned += 1; assert.equal(spawned - removed, 1); }
      if (event.type === 'flail-removed') removed += 1;
    } });
    const selected = side === 'left' ? { left: guardianCharacter, right: opponent } : { left: opponent, right: guardianCharacter };
    engine.reset(selected, { fighters: Object.fromEntries(Object.entries(selected).map(([key, character]) => [key, defaultFighterSettings(character)])) });
    engine.launch();
    for (let frame = 0; frame < 120 * 180 && engine.state.phase === 'running'; frame += 1) {
      engine.step(1 / 120);
      for (const fighter of engine.state.fighters) {
        assert.ok(Number.isFinite(fighter.x) && Number.isFinite(fighter.y));
        assert.ok(fighter.x >= 50 - 1e-5 && fighter.x <= 950 + 1e-5);
        assert.ok(fighter.y >= 50 - 1e-5 && fighter.y <= 950 + 1e-5);
      }
    }
    engine.finish();
    assert.equal(spawned, removed);
  }
});

test('a faster fighter overtaking a slower guardian bounces apart without a zero-time collision loop', () => {
  const { engine, guardian, target } = fixture();
  Object.assign(guardian, { x: 266.5863641096655, y: 473.7041682311045, vx: 39.02741145637729, vy: 53.2246292144401 });
  Object.assign(target, { x: 213.45132959448, y: 373.7041682311045, vx: 11.219967937905828, vy: 131.52228829925505 });
  engine.advance(0.01);
  assert.ok(guardian.y - target.y > 100);
  near(Math.hypot(guardian.vx, guardian.vy), 66);
  near(Math.hypot(target.vx, target.vy), 132);
});

test('a faster fighter pinned against a wall exits sideways after contacting the guardian', () => {
  const { engine, guardian, target } = fixture();
  Object.assign(guardian, { x: 163.5233182830496, y: 150.00000000897305, vx: 39.02741145637729, vy: 53.2246292144401 });
  Object.assign(target, { x: 202.0784627972703, y: 50.00000000897305, vx: 11.219967937905828, vy: 131.52228829925505 });
  engine.advance(0.1);
  assert.ok(guardian.y - target.y > 100);
  assert.ok(target.x > 202.1);
  near(Math.hypot(guardian.vx, guardian.vy), 66);
  near(Math.hypot(target.vx, target.vy), 132);
});
