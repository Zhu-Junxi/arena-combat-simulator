import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_BY_ID, CHARACTERS } from '../src/scripts/config/characters.js';
import { createCombatEngine, createFighter } from '../src/scripts/battle/combat-engine.js';
import { WAR_COMBAT, warSwordPose, warSweepTouches, beginWarAttack, stopWarCharge } from '../src/scripts/battle/war-combat.js';
import { WEAPON_DEFINITIONS } from '../src/scripts/config/weapons.js';
import { createFlail } from '../src/scripts/battle/guardian.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import { MATCH_SETTINGS_VERSION, WAR_ABILITY_CONTROLS } from '../src/scripts/config/customization.js';
import { createSettingsView } from '../src/scripts/customization/settings-view.js';
import { createCharacterDefault, parseCharacterDefault } from '../src/scripts/data/character-default-codec.js';
import { createDuelRecipe, parseDuelRecipe } from '../src/scripts/share/duel-share-codec.js';

const near = (actual, expected, epsilon = 1e-5) => assert.ok(Math.abs(actual - expected) < epsilon, `${actual} != ${expected}`);
const releaseCharge = engine => engine.step(5);
function fixture(right = 'archer', rules = {}) {
  const events = [];
  const engine = createCombatEngine({ rules, random: () => .2, onEvent: e => events.push({ ...e, time: e.battle.elapsed }) });
  engine.reset({ left: CHARACTER_BY_ID.war, right: CHARACTER_BY_ID[right] });
  engine.launch();
  const [war, target] = engine.state.fighters;
  const launchSpeed = Math.hypot(war.vx, war.vy);
  Object.assign(war, { x: 180, prevX: 180, y: 500, prevY: 500, vx: 0, vy: 0 });
  Object.assign(target, { x: 800, prevX: 800, y: 500, prevY: 500, vx: 0, vy: 0, health: 500, maxHealth: 500, cooldownElapsed: -1000 });
  return { engine, war, target, events, launchSpeed };
}

test('War launches at normal movement speed and moves for five seconds before locking a target', () => {
  const { engine, war, target, events, launchSpeed } = fixture();
  near(launchSpeed, 220);
  war.vy = 220;
  engine.step(1);
  near(war.x, 180); near(war.y, 720);
  engine.step(3.99);
  assert.equal(war.attack, null);
  assert.equal(war.war.phase, 'move');
  assert.equal(war.war.targetPoint, null);
  near(warSwordPose(war, engine.state.elapsed).angle, Math.atan2(target.y - war.y, target.x - war.x) - Math.PI / 2);
  engine.step(.01);
  assert.ok(war.war.charge);
  near(war.war.angle, Math.atan2(target.y - war.y, target.x - war.x));
  near(events.find(e => e.type === 'war-charge-started').time, 5);
});

test('charge snapshots the target only after waiting and does not steer with a moving enemy', () => {
  const { engine, war, target } = fixture();
  engine.step(2);
  target.y = 250;
  engine.step(3);
  const angle = Math.atan2(-250, 620);
  near(war.war.angle, angle);
  assert.deepEqual(war.war.targetPoint, { x: 800, y: 250 });
  target.x = 70; target.y = 800;
  engine.step(.15);
  near(war.war.angle, angle);
  near(war.x, 180 + Math.cos(angle) * 880 * .15);
  near(war.y, 500 + Math.sin(angle) * 880 * .15);
  assert.equal(target.health, 500);
  const sideAngle = angle - Math.PI / 2;
  assert.ok(warSwordPose(war, engine.state.elapsed).angle > sideAngle);
  assert.ok(warSwordPose(war, engine.state.elapsed).angle - sideAngle < WAR_COMBAT.slowArc);
});

test('entering blade range releases a fast half-turn, deals exactly 10 once, and strongly knocks the enemy back', () => {
  const { engine, war, target, events } = fixture();
  target.x = 620;
  engine.step(5.42);
  const hit = events.filter(e => e.type === 'war-sweep-hit');
  assert.equal(hit.length, 1);
  assert.equal(hit[0].amount, 10);
  assert.equal(target.health, 490);
  assert.ok(target.x > 800, 'knockback should visibly displace the victim');
  const release = events.find(e => e.type === 'war-swing');
  assert.ok(release.time > 5 && release.time < 5 + WAR_COMBAT.chargeDistance / 880);
  assert.ok(war.war.charge, 'an early swing does not turn or cancel the straight charge');
  engine.step(.3);
  assert.equal(target.health, 490, 'body contact and lingering trail cannot deal a second hit');
  assert.equal(events.filter(e => e.type === 'war-sweep-hit').length, 1);
});

test('a missed charge finishes the half-turn then keeps moving while the same five-second cooldown elapses', () => {
  const { engine, war, target, events } = fixture();
  releaseCharge(engine);
  target.x = 100; target.y = 100;
  engine.step(WAR_COMBAT.chargeDistance / 880);
  near(war.x, 780);
  assert.equal(war.war.charge, null);
  assert.equal(war.war.phase, 'recover');
  assert.ok(war.war.swing);
  assert.equal(events.filter(e => e.type === 'war-swing').length, 1);
  const end = war.war.swing.to;
  near(end - (war.war.angle - Math.PI / 2), Math.PI);
  engine.step(.3);
  assert.equal(war.war.phase, 'move');
  near(war.x, 846);
  near(Math.hypot(war.vx, war.vy), 220);
  engine.step(9.99 - engine.state.elapsed);
  assert.equal(war.war.phase, 'move');
  near(war.cooldownElapsed, 4.99);
  assert.equal(target.health, 500);
  engine.step(.01);
  assert.equal(war.war.phase, 'charge');
  const charges = events.filter(e => e.type === 'war-charge-started');
  assert.equal(charges.length, 2);
  near(charges[0].time, 5); near(charges[1].time, 10);
});

test('body collision stops the charge without impact damage, including a victim outside the sword arc', () => {
  const { engine, war, target } = fixture();
  war.x = 300;
  releaseCharge(engine);
  // Cross the charging body from directly behind its sword's forward half-plane.
  target.x = war.x - 101; target.y = war.y; target.vx = 1600;
  engine.advance(.05);
  assert.equal(war.war.charge, null);
  assert.equal(target.health, 500);
});

test('wall and grounded chain collisions end a charge and cannot redirect it or let it pass through', () => {
  const { engine, war, target } = fixture('guardian');
  releaseCharge(engine);
  war.x = 820;
  target.x = 100; target.y = 100;
  engine.step(.2);
  assert.ok(war.x < 950 && war.x > 900);
  assert.ok(war.vx < 0, 'normal movement resumes away from the wall');
  assert.equal(war.war.charge, null);
  assert.ok(war.war.swing);
  const second = fixture('guardian');
  releaseCharge(second.engine);
  second.target.x = 400; second.target.y = 900;
  const flail = createFlail(second.target, second.war, 10);
  Object.assign(flail, { x: 400, y: 200, phase: 'grounded', landedAt: 2, expiresAt: 20 });
  second.target.guardian.flail = flail;
  second.engine.step(.3);
  assert.equal(second.war.war.charge, null);
  assert.ok(second.war.x < 350);
});

test('the swept blade catches enemies crossed between frames while rejecting targets behind or beyond reach', () => {
  const { war, target } = fixture();
  target.x = war.x + 220; target.y = war.y;
  assert.ok(warSweepTouches(war, target, -Math.PI / 2, Math.PI / 2));
  assert.equal(warSweepTouches(war, target, -Math.PI / 2, -Math.PI / 2), false);
  target.x = war.x - 180;
  assert.equal(warSweepTouches(war, target, -Math.PI / 2, Math.PI / 2), false);
  target.x = war.x + 400;
  assert.equal(warSweepTouches(war, target, -Math.PI / 2, Math.PI / 2), false);
});

test('the explosive sweep completes within 25ms and hits once even across a whole low-rate frame', () => {
  for (const side of [-1, 1]) {
    const { engine, war, target, events } = fixture();
    war.war.side = side;
    target.x = war.x + 220;
    releaseCharge(engine);
    const swing = war.war.swing;
    assert.ok(swing);
    assert.equal(swing.finished, false);
    engine.step(.025);
    assert.equal(swing.finished, true, 'the blade must already be at the opposite side after 25ms');
    near(warSwordPose(war, engine.state.elapsed).angle, swing.to);
    assert.equal(target.health, 490);
    assert.equal(events.filter(e => e.type === 'war-sweep-hit').length, 1);
    engine.step(1 / 30);
    assert.equal(target.health, 490, 'the fading arc cannot add another hit');
  }
});

test('a root freezes the charge but not its aim; knockback stays bounded by arena walls', () => {
  const { engine, war, target } = fixture();
  releaseCharge(engine);
  war.rootUntil = engine.state.elapsed + .4;
  const x = war.x;
  engine.step(.3);
  near(war.x, x);
  near(war.war.angle, 0);
  target.knockback = { angle: 0, remaining: 260, speed: 260 / .24 };
  target.x = 920;
  engine.step(.1);
  assert.ok(target.x <= 950);
  assert.equal(target.knockback, null);
});

test('large replay steps preserve the charge and sweep results and reset clears all motion', () => {
  const a = fixture(), b = fixture();
  a.target.x = b.target.x = 620;
  a.engine.step(5.6);
  for (let i = 0; i < 672; i++) b.engine.step(1 / 120);
  near(a.war.x, b.war.x); near(a.target.x, b.target.x);
  assert.equal(a.target.health, b.target.health);
  a.engine.finish();
  assert.equal(a.war.attack, null);
  assert.equal(a.war.war.charge, null);
  assert.equal(a.target.knockback, null);
  a.engine.reset({ left: CHARACTER_BY_ID.war, right: CHARACTER_BY_ID.war });
  assert.ok(a.engine.state.fighters.every(f => f.war.phase === 'move' && f.cooldownElapsed === 0 && !f.war.swing && !f.war.targetPoint));
});

test('charge begins immediately without any backward displacement regardless of rear-wall space', () => {
  for (const startX of [180, 75, 50]) {
    const { engine, war, target } = fixture();
    war.x = startX;
    engine.step(5);
    near(war.x, startX);
    assert.equal(target.health, 500);
    assert.equal(war.war.phase, 'charge');
    assert.equal(war.war.swing, null);
    let previous = war.x;
    for (let i = 0; i < 10; i++) {
      engine.step(1 / 120);
      assert.ok(war.x > previous);
      previous = war.x;
    }
  }
});

test('ordinary War movement respects wall reflection, roots and slows during cooldown', () => {
  const { engine, war } = fixture();
  war.x = 60; war.vx = -220;
  engine.step(.1);
  near(war.x, 62); near(war.vx, 220);
  war.rootUntil = .5;
  engine.step(.4);
  near(war.x, 62);
  war.slowUntil = 1; war.slowFactor = .5;
  engine.step(.2);
  near(war.x, 84);
  assert.equal(war.war.phase, 'move');
  assert.equal(war.war.targetPoint, null);
});

test('saved placeholder War defaults upgrade without overwriting custom combat values', () => {
  const old = { attack: [5], attackCD: [1], attackRange: 134, health: 177, movementSpeed: 220 };
  const source = { version: MATCH_SETTINGS_VERSION, characterDefaults: { war: old }, fighters: { left: { war: { ...old, attack: [17] } }, right: { war: old } } };
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: { getItem: () => JSON.stringify(source), setItem() {} } });
  assert.deepEqual(store.getFighter('right', 'war').attack, [10]);
  assert.deepEqual(store.getFighter('right', 'war').attackCD, [5]);
  assert.equal(store.getFighter('right', 'war').attackRange, 220);
  assert.equal(store.getFighter('right', 'war').health, 177);
  assert.deepEqual(store.getFighter('left', 'war').attack, [17]);
});

test('old two-second War cooldown migrates once while other customized cooldowns remain intact', () => {
  const old = { attack: [10], attackCD: [2], attackRange: 220, health: 177, movementSpeed: 220 };
  const source = { version: MATCH_SETTINGS_VERSION, warCombatVersion: 1, characterDefaults: { war: old }, fighters: { left: { war: old }, right: { war: { ...old, attackCD: [3] } } } };
  let saved;
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: { getItem: () => JSON.stringify(source), setItem: (_key, value) => { saved = value; } } });
  assert.deepEqual(store.getFighter('left', 'war').attackCD, [5]);
  assert.deepEqual(store.getFighter('right', 'war').attackCD, [3]);
  store.setFighterValue('left', 'war', 'attackCD', 2);
  const reload = createMatchSettingsStore({ characters: CHARACTERS, storage: { getItem: () => saved } });
  assert.deepEqual(reload.getFighter('left', 'war').attackCD, [2], 'new deliberate edits must not migrate again');
});

test('War tuning persists and shares damage, charge cooldown and sweep reach with observable combat effects', () => {
  let saved = null;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  for (const [key, value] of Object.entries({ attack: 17, attackCD: .5, attackRange: 60 })) store.setFighterValue('left', 'war', key, value);
  const reload = createMatchSettingsStore({ characters: CHARACTERS, storage });
  const selected = { left: CHARACTER_BY_ID.war, right: CHARACTER_BY_ID.archer };
  const recipe = createDuelRecipe({ selectedCharacters: selected, setup: reload.snapshot(selected) });
  const imported = parseDuelRecipe(JSON.stringify(recipe), { characters: CHARACTERS });
  assert.deepEqual(imported.fighters.left.stats, reload.getFighter('left', 'war'));
  const invalid = structuredClone(recipe); invalid.fighters.left.stats.attackRange = -1;
  assert.throws(() => parseDuelRecipe(JSON.stringify(invalid), { characters: CHARACTERS }));
  const engine = createCombatEngine({ random: () => .2 });
  engine.reset(selected, reload.snapshot(selected)); engine.launch();
  const [war, target] = engine.state.fighters;
  Object.assign(war, { x: 200, y: 500, vx: 0, vy: 0 });
  Object.assign(target, { x: 400, y: 500, vx: 0, vy: 0, cooldownElapsed: -100 });
  engine.step(.49); assert.equal(war.attack, null);
  engine.step(.01); assert.ok(war.war.charge);
  assert.equal(war.war.swing, null, 'shortened reach waits until the enemy is closer');
  assert.ok(warSweepTouches({ ...war, attackRange: 220 }, target, -Math.PI / 2, Math.PI / 2));
  engine.step(.1); assert.equal(target.health, 63, 'tuned damage is consumed by the fast sweep');
  reload.resetFighter('left', 'war');
  assert.deepEqual(reload.getFighter('left', 'war').attackCD, [5]);
  assert.equal(reload.getFighter('left', 'war').attackRange, 220);
});

test('War detailed controls render below five primary controls and survive rerenders', () => {
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: { getItem: () => null, setItem() {} } });
  const content = { innerHTML: '' };
  const view = createSettingsView({ state: { left: CHARACTER_BY_ID.war, right: CHARACTER_BY_ID.archer }, settings: store,
    elements: { 'settings-content': content }, i18n: { t: key => key } });
  view.renderContent();
  const primary = content.innerHTML.split('<details')[0];
  assert.equal((primary.match(/data-setting-row=/g) ?? []).length, 5);
  for (const key of Object.keys(WAR_ABILITY_CONTROLS)) {
    assert.doesNotMatch(primary, new RegExp(`left-war-${key}`));
    assert.match(content.innerHTML, new RegExp(`left-war-${key}-range`));
  }
  assert.match(content.innerHTML, /left-weapon-width-range/);
  content.querySelector = () => ({ dataset: { detailKey: 'left:war' }, open: true });
  view.renderContent();
  assert.match(content.innerHTML, /data-detail-key="left:war" open>/);
});

test('War detailed values save, reset, migrate, and validate in recipes and character defaults', () => {
  let saved = null;
  const storage = { getItem: () => saved, setItem: (_key, value) => { saved = value; } };
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage });
  const changes = { chargeDistance: 700, speedMultiplier: 3, swingDuration: .05,
    recovery: .4, knockbackDistance: 180, knockbackDuration: .5 };
  for (const [key, value] of Object.entries(changes)) store.setSpecialAbilityValue('left', 'war', key, value);
  store.setWeaponValue('left', 'war', 'width', 60);
  const selected = { left: CHARACTER_BY_ID.war, right: CHARACTER_BY_ID.archer };
  const reload = createMatchSettingsStore({ characters: CHARACTERS, storage });
  assert.deepEqual(reload.getFighter('left', 'war').abilities, changes);
  assert.equal(reload.getFighter('left', 'war').weapon.width, 60);
  const recipe = createDuelRecipe({ selectedCharacters: selected, setup: reload.snapshot(selected) });
  assert.equal(recipe.version, 14);
  assert.deepEqual(parseDuelRecipe(JSON.stringify(recipe), { characters: CHARACTERS }).fighters.left.stats, reload.getFighter('left', 'war'));
  for (const key of Object.keys(changes)) {
    const invalid = structuredClone(recipe);
    invalid.fighters.left.stats.abilities[key] = -1;
    assert.throws(() => parseDuelRecipe(JSON.stringify(invalid), { characters: CHARACTERS }), key);
  }
  const invalidWidth = structuredClone(recipe);
  invalidWidth.fighters.left.stats.weapon.width = -1;
  assert.throws(() => parseDuelRecipe(JSON.stringify(invalidWidth), { characters: CHARACTERS }));
  const oldRecipe = structuredClone(recipe);
  oldRecipe.version = 13;
  delete oldRecipe.fighters.left.stats.abilities;
  delete oldRecipe.fighters.left.stats.weapon;
  const oldParsed = parseDuelRecipe(JSON.stringify(oldRecipe), { characters: CHARACTERS });
  assert.deepEqual(oldParsed.fighters.left.stats.abilities, CHARACTER_BY_ID.war.defaultSettings.abilities);
  assert.deepEqual(oldParsed.fighters.left.stats.weapon, CHARACTER_BY_ID.war.defaultSettings.weapon);
  const oldDefault = createCharacterDefault('war', reload.getFighter('left', 'war'));
  oldDefault.version = 1;
  delete oldDefault.stats.abilities;
  delete oldDefault.stats.weapon;
  const migratedDefault = parseCharacterDefault(oldDefault);
  assert.equal(migratedDefault.version, 2);
  assert.deepEqual(migratedDefault.stats.abilities, CHARACTER_BY_ID.war.defaultSettings.abilities);
  assert.equal(migratedDefault.stats.attackRange, 220);
  reload.resetFighter('left', 'war');
  assert.deepEqual(reload.getFighter('left', 'war').abilities, CHARACTER_BY_ID.war.defaultSettings.abilities);
  assert.equal(reload.getFighter('left', 'war').weapon.width, 32);
  for (const [key, value] of Object.entries(changes)) reload.setSpecialAbilityValue('left', 'war', key, value);
  reload.setWeaponValue('left', 'war', 'width', 60);
  reload.setCharacterDefault('left', 'war');
  reload.resetFighter('right', 'war');
  assert.deepEqual(reload.getFighter('right', 'war').abilities, changes);
  reload.resetAll();
  assert.deepEqual(reload.getFighter('left', 'war').abilities, changes);
  assert.equal(reload.getFighter('left', 'war').weapon.width, 60);
  reload.setAdvanced(true);
  for (const key of ['chargeDistance', 'speedMultiplier', 'swingDuration', 'recovery', 'knockbackDuration']) {
    reload.setSpecialAbilityValue('left', 'war', key, -100);
    assert.ok(reload.getFighter('left', 'war').abilities[key] > 0, key);
  }
  reload.setWeaponValue('left', 'war', 'width', -100);
  assert.equal(reload.getFighter('left', 'war').weapon.width, 4);
  const legacy = structuredClone(store.exportData());
  legacy.version = 4;
  delete legacy.characterDefaults.war.abilities;
  delete legacy.characterDefaults.war.weapon;
  for (const side of Object.keys(legacy.fighters)) {
    delete legacy.fighters[side].war.abilities;
    delete legacy.fighters[side].war.weapon;
  }
  const oldStore = createMatchSettingsStore({ characters: CHARACTERS,
    storage: { getItem: () => JSON.stringify(legacy), setItem() {} } });
  assert.deepEqual(oldStore.getFighter('left', 'war').abilities, CHARACTER_BY_ID.war.defaultSettings.abilities);
  assert.equal(oldStore.getFighter('left', 'war').attackRange, 220);
});

test('each War detailed control changes combat state', () => {
  const defaults = CHARACTER_BY_ID.war.defaultSettings;
  const tuned = { ...defaults.abilities, chargeDistance: 300, speedMultiplier: 2, swingDuration: .1,
    recovery: .6, knockbackDistance: 100, knockbackDuration: .5 };
  const war = createFighter('left', CHARACTER_BY_ID.war, WEAPON_DEFINITIONS.war, 0,
    { ...defaults, abilities: tuned, weapon: { width: 60 } });
  const target = { x: war.x + 400, y: war.y, bodySize: 100 };
  beginWarAttack(war, target, 0, 10);
  assert.equal(war.war.charge.remaining, 300);
  assert.equal(war.war.charge.speed, war.movementSpeed * 2);
  war.war.swing = { startedAt: 0, from: 0, to: Math.PI };
  near(warSwordPose(war, .1).angle, Math.PI);
  const edgeTarget = { x: 170, y: 25, bodySize: 10 };
  const blade = { ...war, x: 0, y: 0, attackRange: 200, weapon: { mount: 0, width: 60 } };
  assert.ok(warSweepTouches(blade, edgeTarget, 0, 0));
  assert.equal(warSweepTouches({ ...blade, weapon: { mount: 0, width: 4 } }, edgeTarget, 0, 0), false);
  const selected = { left: CHARACTER_BY_ID.war, right: CHARACTER_BY_ID.archer };
  const store = createMatchSettingsStore({ characters: CHARACTERS, storage: { getItem: () => null, setItem() {} } });
  for (const [key, value] of Object.entries(tuned)) store.setSpecialAbilityValue('left', 'war', key, value);
  const engine = createCombatEngine({ random: () => .2 });
  engine.reset(selected, store.snapshot(selected)); engine.launch();
  const [attacker, victim] = engine.state.fighters;
  Object.assign(attacker, { x: 180, y: 500, vx: 0, vy: 0 });
  Object.assign(victim, { x: 460, y: 500, vx: 0, vy: 0, health: 500, maxHealth: 500, cooldownElapsed: -1000 });
  engine.step(5.3);
  assert.equal(victim.knockback?.speed, 200, 'distance and duration determine knockback speed');
  assert.ok(victim.knockback.remaining <= 100);
  stopWarCharge(attacker);
  engine.step(.2);
  assert.equal(attacker.war.phase, 'recover', 'longer recovery keeps War in recovery');
  engine.step(.7);
  assert.equal(attacker.war.phase, 'move');
  store.setSpecialAbilityValue('left', 'war', 'knockbackDistance', 0);
  engine.reset(selected, store.snapshot(selected)); engine.launch();
  const [noPushWar, noPushTarget] = engine.state.fighters;
  Object.assign(noPushWar, { x: 180, y: 500, vx: 0, vy: 0 });
  Object.assign(noPushTarget, { x: 460, y: 500, vx: 0, vy: 0, health: 500, maxHealth: 500, cooldownElapsed: -1000 });
  engine.step(5.3);
  assert.equal(noPushTarget.knockback, null);
});
