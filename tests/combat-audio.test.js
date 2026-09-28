import test from 'node:test';
import assert from 'node:assert/strict';
import { createCombatAudio } from '../src/scripts/battle/combat-audio.js';
import { createCombatEngine } from '../src/scripts/battle/combat-engine.js';
import { CHARACTERS } from '../src/scripts/config/characters.js';

function setup() {
  const voices = [];
  const context = {
    state: 'running', currentTime: 0, destination: {},
    resume: async () => {}, decodeAudioData: async data => data,
    createGain: () => ({ gain: {}, connect() {}, disconnect() {} }),
    createBufferSource() {
      const voice = { playbackRate: { value: 1 }, connect() {}, disconnect() {}, start() { voices.push(this); }, stop() { this.stopped = true; this.onended?.(); } };
      return voice;
    }
  };
  const audio = createCombatAudio({ createContext: () => context, fetchAudio: async url => ({ ok: true, arrayBuffer: async () => {
    const buffer = new ArrayBuffer(1);
    buffer.sound = new URL(url).pathname.split('/').pop();
    return buffer;
  } }) });
  return { audio, context, voices };
}

test('audio follows warrior release and positive damage, never healing or unconfigured attacks', async () => {
  const { audio, voices } = setup();
  await audio.unlock();
  const fighter = { character: { id: 'warrior' } };
  audio.handleEvent({ type: 'attack-started', fighter });
  audio.handleEvent({ type: 'attack-released', fighter: { character: { id: 'mage' } } });
  audio.handleEvent({ type: 'healed', amount: 5 });
  audio.handleEvent({ type: 'damage', amount: 0, target: { side: 'right' } });
  assert.equal(voices.length, 0);
  audio.handleEvent({ type: 'attack-released', fighter });
  audio.handleEvent({ type: 'damage', amount: 4, target: { side: 'right' } });
  assert.equal(voices.length, 2);
});

test('continuous damage is throttled per target and resetting stops all voices', async () => {
  const { audio, context, voices } = setup();
  await audio.unlock();
  const hit = { type: 'damage-over-time', amount: 0.01, target: { side: 'left' } };
  for (let tick = 0; tick < 30; tick++) {
    context.currentTime = tick / 120;
    audio.handleEvent(hit);
  }
  assert.equal(voices.length, 1);
  context.currentTime = 0.36;
  audio.handleEvent(hit);
  assert.equal(voices.length, 2);
  audio.handleEvent({ type: 'reset' });
  assert.ok(voices.every(voice => voice.stopped));
  audio.handleEvent(hit);
  assert.equal(voices.length, 3);
});

test('real archer shots sound at release, with vines only on each fourth surviving hit', async () => {
  const { audio, context, voices } = setup();
  await audio.unlock();
  const events = [];
  const engine = createCombatEngine({ onEvent: event => { events.push(event); audio.handleEvent(event); } });
  engine.reset({ left: CHARACTERS.find(character => character.id === 'archer'), right: CHARACTERS.find(character => character.id === 'guardian') });
  const [archer, target] = engine.state.fighters;
  target.guardian.shield = 0; // Exercise health-hit audio after shield break.
  archer.x = 150; archer.y = 300;
  target.x = 450; target.y = 300;
  target.cooldownElapsed = -10000;
  engine.state.phase = 'running';
  const count = filename => voices.filter(voice => voice.buffer.sound === filename).length;
  for (let shot = 1; shot <= 8; shot++) {
    engine.startAttack(archer, target);
    assert.equal(count('archer-shot.mp3'), shot - 1, 'drawing the bow must be silent');
    for (let frame = 0; frame < 600 && (archer.attack || engine.state.projectiles.length); frame++) {
      context.currentTime += 1 / 120;
      engine.step(1 / 120);
    }
    assert.equal(count('archer-shot.mp3'), shot, 'one sound per released arrow');
    assert.equal(count('damage.mp3'), shot, 'normal hit audio must remain');
    assert.equal(count('archer-vines.mp3'), Math.floor(shot / 4));
    if (shot % 4 === 0) assert.ok(target.rootUntil > engine.state.elapsed);
  }
  assert.equal(events.filter(event => event.type === 'vines-applied').length, 2);
  audio.stop();
});

test('missed, lethal and reset empowered arrows never play a vine effect', async () => {
  for (const outcome of ['miss', 'lethal', 'reset']) {
    const { audio, context, voices } = setup();
    await audio.unlock();
    const engine = createCombatEngine({ onEvent: audio.handleEvent });
    const selection = { left: CHARACTERS.find(character => character.id === 'archer'), right: CHARACTERS.find(character => character.id === 'guardian') };
    engine.reset(selection);
    const [archer, target] = engine.state.fighters;
  target.guardian.shield = 0; // Exercise health-hit audio after shield break.
    archer.x = 150; archer.y = 300;
    target.x = target.prevX = 450; target.y = target.prevY = 300;
    archer.attacksFired = 3;
    target.cooldownElapsed = -10000;
    if (outcome === 'lethal') target.health = 1;
    engine.state.phase = 'running';
    engine.startAttack(archer, target);
    engine.state.elapsed = archer.weapon.windup;
    engine.updateAttacks();
    assert.equal(voices.length, 1);
    assert.equal(voices[0].buffer.sound, 'archer-shot.mp3');
    assert.equal(engine.state.projectiles[0].empowered, true);
    if (outcome === 'reset') {
      engine.reset(selection);
      assert.ok(voices.every(voice => voice.stopped));
      assert.equal(engine.state.projectiles.length, 0);
    } else {
      if (outcome === 'miss') target.y = target.prevY = 900;
      for (let frame = 0; frame < 720 && engine.state.projectiles.length; frame++) {
        context.currentTime += 1 / 120;
        engine.updateProjectiles(1 / 120);
      }
      assert.equal(engine.state.projectiles.length, 0);
      if (outcome === 'lethal') assert.equal(target.health, 0);
    }
    assert.equal(voices.filter(voice => voice.buffer.sound === 'archer-vines.mp3').length, 0, outcome);
    audio.stop();
  }
});

test('real attacks from every class play hurt audio against every receiver class', async () => {
  for (const attacker of CHARACTERS.filter(character => !character.locked)) for (const receiver of CHARACTERS.filter(character => !character.locked)) {
    const { audio, context, voices } = setup();
    await audio.unlock();
    let hit = false;
    const label = `${attacker.id} -> ${receiver.id}`;
    const engine = createCombatEngine({ random: () => 0, onEvent: event => {
      const before = voices.length;
      audio.handleEvent(event);
      if (event.type === 'damage' && (event.target.side === 'right' || event.target.owner?.side === 'right')) {
        assert.ok(event.amount > 0);
        // Simultaneous stars share the existing per-target audio throttle.
        if (!hit) assert.equal(voices.length, before + 1, `${label}: missing hurt sound`);
        hit = true;
      }
    } });
    engine.reset({ left: attacker, right: receiver });
    const [a, b] = engine.state.fighters;
    if (b.guardian) b.guardian.shield = 0;
    a.x = 150; a.y = 300;
    b.x = a.weapon.type === 'melee' ? 240 : 450; b.y = 300;
    b.cooldownElapsed = -10000;
    engine.state.summons.filter(summon => summon.owner === b).forEach(summon => { summon.biteElapsed = -10000; });
    a.cooldownElapsed = a.attackCooldown;
    engine.state.phase = 'running';
    // Let real melee, projectile or Priest prayer damage resolve, without retaliation.
    for (let frame = 1; frame < 3600 && !hit; frame++) {
      context.currentTime = frame / 120;
      engine.step(1 / 120);
    }
    assert.ok(hit, `${label}: attack did not resolve`);
    audio.stop();
  }
});

test('real burn and bleed damage play hurt audio for every class on either side', async () => {
  for (const receiver of CHARACTERS.filter(character => !character.locked)) for (const side of ['left', 'right']) for (const effect of ['burn', 'bleed']) {
    const { audio, context, voices } = setup();
    await audio.unlock();
    const damageEvents = [];
    const engine = createCombatEngine({ onEvent: event => {
      audio.handleEvent(event);
      if (event.type === 'damage-over-time') damageEvents.push(event);
    } });
    engine.reset({ left: receiver, right: receiver });
    engine.state.phase = 'running';
    engine.state.fighters.forEach(fighter => { fighter.cooldownElapsed = -10000; });
    const target = engine.state.fighters.find(fighter => fighter.side === side);
    if (target.guardian) target.guardian.shield = 0;
    target[effect] = { dps: 2, expiresAt: 2 };
    context.currentTime = 0.1;
    engine.step(0.1);
    assert.equal(voices.length, 1, `${receiver.id} ${side} ${effect}: missing hurt sound`);
    assert.equal(damageEvents[0].damageType, effect);
    assert.equal(damageEvents[0].amount, 0.2);
    audio.stop();
  }
});

test('lethal ongoing damage reports actual health lost without a second hit on a defeated target', () => {
  const events = [];
  const engine = createCombatEngine({ onEvent: event => events.push(event) });
  engine.reset({ left: CHARACTERS[0], right: CHARACTERS[1] });
  const target = engine.state.fighters[0];
  target.health = 0.1;
  target.burn = { dps: 2, expiresAt: 2 };
  target.bleed = { dps: 2, expiresAt: 2 };
  engine.state.phase = 'running';
  engine.step(0.1);
  const damage = events.filter(event => event.type === 'damage-over-time');
  assert.equal(damage.length, 1);
  assert.equal(damage[0].amount, 0.1);
  assert.equal(target.health, 0);
});

test('shield absorption plays metal hits, then health hits only after durability is gone', async () => {
  const { audio, context, voices } = setup();
  await audio.unlock();
  const engine = createCombatEngine({ onEvent: audio.handleEvent });
  engine.reset({ left: CHARACTERS.find(c => c.id === 'guardian'), right: CHARACTERS.find(c => c.id === 'archer') });
  const [guardian, archer] = engine.state.fighters;
  Object.assign(guardian, { x: 300, prevX: 300, y: 500, prevY: 500 });
  const hit = damage => {
    context.currentTime += 0.2;
    engine.state.projectiles.push({ owner: archer, target: guardian, damage, x: 420, y: 500, vx: -1000, vy: 0, radius: 5, age: 0 });
    engine.updateProjectiles(0.2);
  };
  hit(10);
  assert.equal(guardian.health, 100);
  assert.deepEqual(voices.map(v => v.buffer.sound), ['guardian-shield-hit.wav']);
  hit(35);
  assert.equal(guardian.guardian.shield, 0);
  assert.equal(guardian.health, 95);
  assert.deepEqual(voices.slice(1).map(v => v.buffer.sound), ['guardian-shield-hit.wav', 'damage.mp3']);
  hit(5);
  assert.equal(voices.at(-1).buffer.sound, 'damage.mp3');
  assert.equal(voices.filter(v => v.buffer.sound === 'guardian-shield-hit.wav').length, 2);
});

test('burning a shield throttles metal hits and resets its throttle with a new match', async () => {
  const { audio, context, voices } = setup();
  await audio.unlock();
  const engine = createCombatEngine({ onEvent: audio.handleEvent });
  const selection = { left: CHARACTERS.find(c => c.id === 'guardian'), right: CHARACTERS.find(c => c.id === 'archer') };
  engine.reset(selection);
  engine.state.phase = 'running';
  engine.state.fighters.forEach(fighter => { fighter.cooldownElapsed = -1000; });
  engine.state.fighters[0].burn = { dps: 2, expiresAt: 2 };
  for (let tick = 0; tick < 90; tick++) {
    context.currentTime = tick / 120;
    engine.step(1 / 120);
  }
  assert.equal(voices.length, 3);
  assert.ok(voices.every(v => v.buffer.sound === 'guardian-shield-hit.wav'));
  engine.reset(selection);
  assert.ok(voices.every(v => v.stopped));
  engine.state.phase = 'running';
  engine.state.fighters[0].burn = { dps: 2, expiresAt: 2 };
  engine.step(1 / 120);
  assert.equal(voices.length, 4);
});

test('real flail flight, landing and retrieval synchronize chain loops and a single ground impact', async () => {
  const { audio, voices } = setup();
  await audio.unlock();
  const engine = createCombatEngine({ onEvent: audio.handleEvent });
  engine.reset({ left: CHARACTERS.find(c => c.id === 'guardian'), right: CHARACTERS.find(c => c.id === 'archer') });
  engine.state.phase = 'running';
  const [guardian, target] = engine.state.fighters;
  Object.assign(guardian, { x: 200, y: 500 });
  Object.assign(target, { x: 600, y: 500 });
  guardian.guardian.shield = 0;
  engine.startAttack(guardian, target);
  assert.equal(voices.length, 0);
  engine.state.elapsed = guardian.weapon.windup;
  engine.updateAttacks();
  const outbound = voices[0];
  assert.equal(outbound.buffer.sound, 'guardian-chain.wav');
  assert.equal(outbound.loop, true);
  Object.assign(target, { x: 850, prevX: 850, y: 850, prevY: 850 });
  const tick = seconds => { engine.state.elapsed += seconds; engine.updateGuardianFlails(seconds); };
  const flail = guardian.guardian.flail;
  tick((flail.targetX - flail.x) / 380);
  assert.equal(flail.phase, 'grounded');
  assert.equal(outbound.stopped, true);
  assert.equal(voices[1].buffer.sound, 'guardian-hammer-land.wav');
  assert.equal(voices[1].loop, false);
  tick(4.9);
  assert.equal(voices.length, 2, 'grounded chain is quiet');
  tick(0.1);
  const returning = voices[2];
  assert.equal(returning.buffer.sound, 'guardian-chain.wav');
  assert.equal(returning.loop, true);
  tick(1);
  assert.equal(returning.stopped, true);
  assert.equal(guardian.guardian.flail, null);
  assert.equal(voices.length, 3);
});

test('chain audio is independent for both guardians and never survives reset or match completion', async () => {
  const { audio, voices } = setup();
  await audio.unlock();
  const engine = createCombatEngine({ onEvent: audio.handleEvent });
  const guardian = CHARACTERS.find(c => c.id === 'guardian');
  const selection = { left: guardian, right: guardian };
  for (const end of ['finish', 'reset']) {
    engine.reset(selection);
    engine.state.phase = 'running';
    const [left, right] = engine.state.fighters;
    for (const fighter of [left, right]) fighter.guardian.shield = 0;
    engine.startAttack(left, right);
    engine.startAttack(right, left);
    engine.state.elapsed = left.weapon.windup;
    engine.updateAttacks();
    const chains = voices.slice(-2);
    assert.ok(chains.every(v => v.loop && !v.stopped));
    if (end === 'finish') engine.finish(); else engine.reset(selection);
    assert.ok(chains.every(v => v.stopped));
  }
});
