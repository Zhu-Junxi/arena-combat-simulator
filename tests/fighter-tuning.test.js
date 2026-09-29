import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_BY_ID, CHARACTERS } from '../src/scripts/config/characters.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import { createCombatEngine } from '../src/scripts/battle/combat-engine.js';
import { createDuelRecipe, parseDuelRecipe } from '../src/scripts/share/duel-share-codec.js';
import { grantStarPassive, starAttackSpeed } from '../src/scripts/battle/star-passive.js';
import { createFlail, advanceFlail } from '../src/scripts/battle/guardian.js';
import { createSettingsView } from '../src/scripts/customization/settings-view.js';

function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('both tuning tabs render their special numeric and rule controls', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  const content = { innerHTML: '' };
  const view = createSettingsView({ state: { left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID['dongfang-changfan'] },
    settings, elements: { 'settings-content': content, 'settings-tabs': { innerHTML: '' },
      'settings-reset-all': { textContent: '' }, 'advanced-tuning': { checked: false } }, i18n: { t: key => key } });
  view.renderContent();
  assert.match(content.innerHTML, /left-guardian-durability-range/);
  assert.match(content.innerHTML, /data-special-switch="chainBlocking"/);
  assert.match(content.innerHTML, /data-special-mode/);
  view.setActiveTab('right');
  assert.match(content.innerHTML, /right-star-hastePerStack-range/);
  assert.match(content.innerHTML, /data-special-switch="enemyHit"/);
});

test('special abilities persist independently by seat and travel in duel recipes', () => {
  const backing = storage();
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: backing });
  settings.setSpecialAbilityValue('left', 'guardian', 'durability', 75);
  settings.setSpecialAbilityValue('right', 'guardian', 'durability', 20);
  settings.setSpecialAbilityValue('left', 'guardian', 'autoSwitch', false);
  settings.setSpecialAbilityValue('left', 'guardian', 'startingMode', 'flail');
  settings.setSpecialAbilityValue('left', 'dongfang-changfan', 'starsPerAttack', 3);
  settings.setSpecialAbilityValue('left', 'dongfang-changfan', 'enemyHit', false);
  assert.equal(settings.getFighter('left', 'guardian').abilities.durability, 75);
  assert.equal(settings.getFighter('right', 'guardian').abilities.durability, 20);
  const restored = createMatchSettingsStore({ characters: CHARACTERS, storage: backing });
  assert.equal(restored.getFighter('left', 'guardian').abilities.startingMode, 'flail');
  assert.equal(restored.getFighter('left', 'dongfang-changfan').abilities.starsPerAttack, 3);
  const selected = { left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID.guardian };
  const recipe = createDuelRecipe({ selectedCharacters: selected, setup: restored.snapshot(selected) });
  const imported = parseDuelRecipe(JSON.stringify(recipe), { characters: CHARACTERS });
  assert.equal(imported.fighters.left.stats.abilities.durability, 75);
  assert.equal(imported.fighters.right.stats.abilities.durability, 20);
  restored.resetFighter('left', 'guardian');
  assert.equal(restored.getFighter('left', 'guardian').abilities.durability, 40);
});

test('Guardian settings change battle state and disabled modes use melee', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  settings.setSpecialAbilityValue('left', 'guardian', 'durability', 75);
  settings.setSpecialAbilityValue('left', 'guardian', 'chargeEnabled', false);
  const selected = { left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID.archer };
  const engine = createCombatEngine();
  engine.reset(selected, settings.snapshot(selected));
  const [guardian, target] = engine.state.fighters;
  assert.equal(guardian.guardian.shield, 75);
  target.x = guardian.x + 100;
  target.y = guardian.y;
  const attack = engine.startAttack(guardian, target);
  assert.equal(attack.guardianMode, 'melee');
  engine.state.elapsed = guardian.weapon.windup;
  engine.updateAttacks();
  assert.equal(guardian.guardian.dash, null);
  assert.equal(guardian.guardian.flail, null);
  assert.equal(target.health, 70);
});

test('Guardian charge and flail use tuned movement, damage and hitboxes', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  for (const [key, value] of Object.entries({ chargeSpeed: 800, chargeDistance: 120, chargeDamageFactor: 2,
    headRadius: 30, impactRadius: 60, groundDuration: 7, returnSpeed: 650 })) {
    settings.setSpecialAbilityValue('left', 'guardian', key, value);
  }
  const selected = { left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID.archer };
  const engine = createCombatEngine();
  engine.reset(selected, settings.snapshot(selected));
  const [guardian, target] = engine.state.fighters;
  const charge = engine.startAttack(guardian, target);
  assert.equal(charge.damage, 20);
  engine.state.elapsed = guardian.weapon.windup;
  engine.updateAttacks();
  assert.equal(guardian.guardian.dash.speed, 800);
  assert.equal(guardian.guardian.dash.remaining, 120);
  engine.reset(selected, settings.snapshot(selected));
  const [flailGuardian, flailTarget] = engine.state.fighters;
  flailGuardian.guardian.shield = 0;
  engine.startAttack(flailGuardian, flailTarget);
  engine.state.elapsed = flailGuardian.weapon.windup;
  engine.updateAttacks();
  assert.equal(flailGuardian.guardian.flail.radius, 30);
  assert.equal(flailGuardian.guardian.flail.impactRadius, 60);
  assert.equal(flailGuardian.guardianAbilities.returnSpeed, 650);
});

test('manual flail mode works while the shield is intact', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  settings.setSpecialAbilityValue('left', 'guardian', 'autoSwitch', false);
  settings.setSpecialAbilityValue('left', 'guardian', 'startingMode', 'flail');
  const selected = { left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID.archer };
  const engine = createCombatEngine();
  engine.reset(selected, settings.snapshot(selected));
  const [guardian, target] = engine.state.fighters;
  const attack = engine.startAttack(guardian, target);
  assert.equal(attack.guardianMode, 'flail');
  engine.state.elapsed = guardian.weapon.windup;
  engine.updateAttacks();
  assert.equal(guardian.guardian.shield, 40);
  assert.ok(guardian.guardian.flail);
});

test('Guardian can disable each flail damage phase', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  for (const key of ['outboundEnabled', 'landingEnabled', 'returnEnabled', 'contactEnabled']) {
    settings.setSpecialAbilityValue('left', 'guardian', key, false);
  }
  const selected = { left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID.archer };
  const engine = createCombatEngine();
  engine.reset(selected, settings.snapshot(selected));
  const [guardian, target] = engine.state.fighters;
  const flail = createFlail(guardian, target, 10);
  const hits = [];
  advanceFlail(flail, 8, 8, (...args) => hits.push(args), () => {});
  assert.deepEqual(hits, []);
});

test('star settings change trigger, haste and count of independent projectiles', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  settings.setSpecialAbilityValue('left', 'dongfang-changfan', 'stackDuration', 4);
  settings.setSpecialAbilityValue('left', 'dongfang-changfan', 'hastePerStack', 3);
  settings.setSpecialAbilityValue('left', 'dongfang-changfan', 'enemyHit', false);
  settings.setSpecialAbilityValue('left', 'dongfang-changfan', 'starsPerAttack', 3);
  settings.setSpecialAbilityValue('left', 'dongfang-changfan', 'initialSpeedFactor', 0.5);
  settings.setSpecialAbilityValue('left', 'dongfang-changfan', 'accelerationFactor', 3);
  const selected = { left: CHARACTER_BY_ID['dongfang-changfan'], right: CHARACTER_BY_ID.archer };
  const engine = createCombatEngine({ random: () => 0.5 });
  engine.reset(selected, settings.snapshot(selected));
  const [star, opponent] = engine.state.fighters;
  assert.equal(grantStarPassive(star, 'enemy-hit', 0), false);
  assert.equal(grantStarPassive(star, 'enemy-attack', 0), true);
  assert.equal(star.starPassive['enemy-attack'], 4);
  assert.equal(starAttackSpeed(star, 0), 4);
  engine.startAttack(star, opponent);
  engine.state.elapsed = star.weapon.windup;
  engine.updateAttacks();
  assert.equal(engine.state.projectiles.length, 3);
  assert.equal(new Set(engine.state.projectiles.map(projectile => projectile.starFlight)).size, 3);
  assert.ok(engine.state.projectiles.every(projectile => projectile.radius === 7));
  assert.ok(engine.state.projectiles.every(projectile => projectile.starFlight.speed === 280));
  assert.ok(engine.state.projectiles.every(projectile => projectile.starFlight.acceleration === 1680));
});

test('older share recipes receive original special ability defaults', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  const selected = { left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID['dongfang-changfan'] };
  const recipe = createDuelRecipe({ selectedCharacters: selected, setup: settings.snapshot(selected) });
  recipe.version = 11;
  delete recipe.fighters.left.stats.abilities;
  delete recipe.fighters.right.stats.abilities;
  const imported = parseDuelRecipe(JSON.stringify(recipe), { characters: CHARACTERS });
  assert.equal(imported.fighters.left.stats.abilities.durability, 40);
  assert.equal(imported.fighters.right.stats.abilities.hastePerStack, 2);
  assert.equal(imported.fighters.right.stats.abilities.rearSpreadDegrees, 180 / 7);
});

test('share import rejects malformed special rules and advanced values clamp on exit', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  const selected = { left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID['dongfang-changfan'] };
  const recipe = createDuelRecipe({ selectedCharacters: selected, setup: settings.snapshot(selected) });
  recipe.fighters.left.stats.abilities.chargeEnabled = 'yes';
  assert.throws(() => parseDuelRecipe(JSON.stringify(recipe), { characters: CHARACTERS }), /chargeEnabled/);
  settings.setAdvanced(true);
  settings.setSpecialAbilityValue('left', 'guardian', 'chargeSpeed', 2500);
  assert.equal(settings.getFighter('left', 'guardian').abilities.chargeSpeed, 2500);
  settings.setAdvanced(false);
  assert.equal(settings.getFighter('left', 'guardian').abilities.chargeSpeed, 2000);
});
