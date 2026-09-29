import test from 'node:test';
import assert from 'node:assert/strict';
import { stat } from 'node:fs/promises';
import { CHARACTER_BY_ID } from '../src/scripts/config/characters.js';
import { createCombatEngine } from '../src/scripts/battle/combat-engine.js';
import { createBattleRuntime } from '../src/scripts/battle/combat-renderer.js';
import { WAR_ENTRANCE_STAGES, WAR_ENTRANCE_DURATION, warEntranceFrame, warRiftFrame, roarDisplacement, riftGeometry, riftPath } from '../src/scripts/battle/war-entrance.js';
import { BATTLE_RULES } from '../src/scripts/config/combat.js';

test('entrance cuts a seam, withdraws the blade, opens the rift, emerges, then roars and mounts', () => {
  let time = 0;
  assert.deepEqual(WAR_ENTRANCE_STAGES.map(s => s.name), ['pierce', 'hold', 'slash', 'withdraw', 'open', 'emerge', 'roar', 'horse', 'mount']);
  for (const stage of WAR_ENTRANCE_STAGES) {
    assert.equal(warEntranceFrame(time).name, stage.name);
    assert.equal(warEntranceFrame(time + stage.duration - .01).name, stage.name);
    time += stage.duration;
  }
  assert.equal(WAR_ENTRANCE_STAGES.find(s => s.name === 'roar').duration, 2000);
  assert.equal(warEntranceFrame(WAR_ENTRANCE_DURATION).name, 'complete');
  assert.equal(warEntranceFrame(-50).progress, 0);
});

test('blade clears the screen before widening; no character or black portal appears during the cut', () => {
  let start = 0;
  let previousCut = 0;
  for (const stage of WAR_ENTRANCE_STAGES) {
    for (const p of [0, .25, .5, .75, .999]) {
      const r = warRiftFrame(warEntranceFrame(start + p * stage.duration));
      if (['pierce', 'hold', 'slash', 'withdraw'].includes(stage.name)) {
        assert.equal(r.interior, 0, 'screen interior remains concealed before opening');
        assert.equal(r.opening, .018, 'the slash only lengthens a narrow seam');
        assert.equal(r.emerge, 0);
      }
      if (stage.name === 'slash') {
        assert.ok(r.cut >= previousCut);
        previousCut = r.cut;
        assert.equal(r.bladeDepth, 1);
      }
      if (stage.name === 'open') {
        assert.equal(r.bladeDepth, 0);
        assert.equal(r.bladeOpacity, 0);
        assert.equal(r.cut, 1);
        assert.equal(r.emerge, 0);
      }
      if (stage.name === 'emerge') {
        assert.equal(r.opening, 1);
        assert.equal(r.interior, 1);
        assert.equal(r.bladeOpacity, 0);
      }
    }
    start += stage.duration;
  }
  assert.equal(warRiftFrame(warEntranceFrame(0)).bladeDepth, 0, 'no steel is visible before puncture');
});

function runtimeFixture(t, left = 'war', right = 'archer') {
  let callback = null, now = 100, start = 0, stops = 0, launches = 0;
  const oldRaf = globalThis.requestAnimationFrame, oldCancel = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = fn => { callback = fn; return 1; };
  globalThis.cancelAnimationFrame = () => { callback = null; };
  t.after(() => {
    if (oldRaf) globalThis.requestAnimationFrame = oldRaf; else delete globalThis.requestAnimationFrame;
    if (oldCancel) globalThis.cancelAnimationFrame = oldCancel; else delete globalThis.cancelAnimationFrame;
  });
  t.mock.method(performance, 'now', () => now);
  const engine = createCombatEngine({ random: () => .2, onEvent: e => { if (e.type === 'launched') launches++; } });
  const node = () => ({ dataset: {}, hidden: false, textContent: '' });
  const elements = { battlefield: node(), countdown: node(), 'battle-note': node(), status: node() };
  const entrance = {
    begin: battle => { start = now; return battle.fighters.some(f => f.character.id === 'war'); },
    update: time => time - start >= WAR_ENTRANCE_DURATION,
    stop: () => { stops++; }
  };
  const runtime = createBattleRuntime({ engine, renderer: { render() {} }, elements, entrance, i18n: { t: key => key }, getAppPhase: () => 'arena' });
  const selected = { left: CHARACTER_BY_ID[left], right: CHARACTER_BY_ID[right] };
  const advance = milliseconds => { now += milliseconds; const fn = callback; callback = null; fn?.(now); };
  return { runtime, engine, selected, advance, launches: () => launches, stops: () => stops };
}

test('combat, cooldowns and damage remain frozen until the entire entrance completes even at high battle speed', t => {
  const f = runtimeFixture(t);
  f.runtime.begin(f.selected, { arena: { timeScale: 8, launchDelay: 0 } });
  const original = f.engine.state.fighters.map(({ x, y, health, cooldownElapsed }) => ({ x, y, health, cooldownElapsed }));
  f.advance(WAR_ENTRANCE_DURATION - 1);
  assert.equal(f.engine.state.phase, 'waiting');
  assert.equal(f.engine.state.elapsed, 0);
  assert.deepEqual(f.engine.state.fighters.map(({ x, y, health, cooldownElapsed }) => ({ x, y, health, cooldownElapsed })), original);
  f.advance(1);
  assert.equal(f.launches(), 1);
  assert.equal(f.engine.state.phase, 'running');
  assert.equal(f.engine.state.elapsed, 0, 'entrance time must not become combat catch-up');
  f.advance(50);
  assert.ok(f.engine.state.elapsed > 0);
  assert.equal(f.launches(), 1);
});

test('return cancels pending launch and a new match replays the full entrance', t => {
  const f = runtimeFixture(t, 'archer', 'war');
  f.runtime.begin(f.selected);
  f.advance(4000);
  f.runtime.stop();
  f.advance(WAR_ENTRANCE_DURATION);
  assert.equal(f.launches(), 0);
  f.runtime.begin(f.selected);
  f.advance(WAR_ENTRANCE_DURATION - 1);
  assert.equal(f.launches(), 0);
  f.advance(1);
  assert.equal(f.launches(), 1);
  assert.ok(f.stops() >= 3);
});

test('two Wars share one entrance barrier and a match without War keeps its normal countdown', t => {
  const f = runtimeFixture(t, 'war', 'war');
  f.runtime.begin(f.selected);
  f.advance(WAR_ENTRANCE_DURATION);
  assert.equal(f.launches(), 1);
  f.runtime.begin({ left: CHARACTER_BY_ID.warrior, right: CHARACTER_BY_ID.archer });
  f.advance(1999);
  assert.equal(f.launches(), 1);
  f.advance(1);
  assert.equal(f.launches(), 2);
});

test('HUD tremor has independent phases and returns exactly to rest', () => {
  const values = Array.from({ length: 30 }, (_, i) => roarDisplacement(i, .7));
  assert.equal(new Set(values.map(d => d.x.toFixed(4))).size, 30);
  for (const i of [0, 8, 45]) for (const value of Object.values(roarDisplacement(i, 2, 0))) assert.equal(Math.abs(value), 0);
});

test('portals cut mainly downward on either side and retain finite geometry at every phase', () => {
  for (const x of [50, 250, 750, 950]) {
    const g = riftGeometry({ x, y: 500 }, BATTLE_RULES);
    assert.ok(g.dx > 0 && g.dy > 0);
    assert.ok(g.dy > g.dx * 5);
    assert.ok(g.width * 2 > BATTLE_RULES.fighterSize * 1.6);
    for (const cut of [0, .5, 1]) assert.doesNotMatch(riftPath(g, cut, cut), /NaN|Infinity/);
  }
});

test('all accepted War art is shipped locally', async () => {
  for (const file of Object.values(CHARACTER_BY_ID.war.art)) assert.ok((await stat(new URL('../' + file, import.meta.url))).size > 0);
});
