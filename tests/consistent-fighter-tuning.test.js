import test from 'node:test';
import assert from 'node:assert/strict';

import { CHARACTERS, CHARACTER_BY_ID } from '../src/scripts/config/characters.js';
import { MATCH_SETTINGS_STORAGE_KEY } from '../src/scripts/config/customization.js';
import { WEAPON_DEFINITIONS } from '../src/scripts/config/weapons.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import { createSettingsView } from '../src/scripts/customization/settings-view.js';
import { createCombatEngine, createFighter, weaponIntersectsTarget } from '../src/scripts/battle/combat-engine.js';
import { createDuelRecipe, parseDuelRecipe } from '../src/scripts/share/duel-share-codec.js';

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('every playable fighter shows five primary controls and a closed detailed section', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  const content = { innerHTML: '' };
  const state = { left: CHARACTER_BY_ID.warrior, right: CHARACTER_BY_ID.archer };
  const view = createSettingsView({ state, settings, elements: { 'settings-content': content }, i18n: { t: key => key } });
  const signatureRows = {
    warrior: ['left-attack-0', 'left-cooldown-0', 'left-trait-reduction'],
    war: ['left-attack-0', 'left-cooldown-0', 'left-attackRange'],
    archer: ['left-attack-0', 'left-cooldown-0', 'left-trait-every'],
    guardian: ['left-attack-0', 'left-cooldown-0', 'left-guardian-durability'],
    mage: ['left-mage-markDuration', 'left-mage-maxMarks', 'left-mage-damagePerMark'],
    priest: ['left-priest-markCooldown', 'left-priest-baseHeal', 'left-priest-baseDamage'],
    'dongfang-changfan': ['left-attack-0', 'left-cooldown-0', 'left-star-starsPerAttack'],
    beastmaster: ['left-summon-companionHealth', 'left-summon-biteDamage', 'left-summon-packSize']
  };
  for (const character of CHARACTERS.filter(item => !item.locked)) {
    state.left = character;
    view.renderContent();
    const primary = content.innerHTML.split('<details')[0];
    assert.equal((primary.match(/data-setting-row=/g) ?? []).length, 5, character.id);
    for (const id of signatureRows[character.id]) assert.ok(primary.includes(`data-setting-row="${id}"`), `${character.id}: ${id}`);
    assert.match(content.innerHTML, /<details class="fighter-details" data-detail-key="left:[^"]+">/);
  }
  state.left = CHARACTER_BY_ID.warrior;
  view.renderContent();
  assert.match(content.innerHTML, /left-weapon-width-range/);
  assert.match(content.innerHTML, /left-weapon-active-range/);
  content.querySelector = () => ({ dataset: { detailKey: 'left:warrior' }, open: true });
  view.renderContent();
  assert.match(content.innerHTML, /data-detail-key="left:warrior" open>/);
  delete content.querySelector;
  state.left = CHARACTER_BY_ID.archer;
  view.renderContent();
  assert.match(content.innerHTML, /left-weapon-radius-range/);
  assert.match(content.innerHTML, /left-weapon-windup-range/);
});

test('weapon settings persist, reset, migrate, and round trip through duel recipes', () => {
  const backing = storage();
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: backing });
  settings.setWeaponValue('left', 'warrior', 'width', 30);
  settings.setWeaponValue('left', 'warrior', 'active', 0.4);
  settings.setWeaponValue('right', 'archer', 'radius', 15);
  settings.setWeaponValue('right', 'archer', 'windup', 0.5);
  const selected = { left: CHARACTER_BY_ID.warrior, right: CHARACTER_BY_ID.archer };
  const recipe = createDuelRecipe({ selectedCharacters: selected, setup: settings.snapshot(selected) });
  const parsed = parseDuelRecipe(JSON.stringify(recipe), { characters: CHARACTERS });
  assert.deepEqual(parsed.fighters.left.stats.weapon, { width: 30, active: 0.4 });
  assert.deepEqual(parsed.fighters.right.stats.weapon, { radius: 15, windup: 0.5 });

  const restored = createMatchSettingsStore({ characters: CHARACTERS, storage: backing });
  assert.deepEqual(restored.getFighter('left', 'warrior').weapon, { width: 30, active: 0.4 });
  restored.setAdvanced(true);
  restored.setWeaponValue('left', 'warrior', 'active', 2);
  restored.setWeaponValue('left', 'warrior', 'width', -10);
  restored.setWeaponValue('right', 'archer', 'windup', 2);
  assert.equal(restored.getFighter('left', 'warrior').weapon.active, 0.5);
  assert.equal(restored.getFighter('left', 'warrior').weapon.width, 4);
  assert.equal(restored.getFighter('right', 'archer').weapon.windup, 0.6);
  restored.setAdvanced(false);
  restored.resetFighter('left', 'warrior');
  assert.deepEqual(restored.getFighter('left', 'warrior').weapon, { width: 12, active: 0.2 });
  restored.setWeaponValue('left', 'warrior', 'width', 28);
  restored.setCharacterDefault('left', 'warrior');
  restored.setWeaponValue('right', 'warrior', 'width', 10);
  restored.resetFighter('right', 'warrior');
  assert.equal(restored.getFighter('right', 'warrior').weapon.width, 28);

  const oldRecipe = structuredClone(recipe);
  oldRecipe.version = 12;
  delete oldRecipe.fighters.left.stats.weapon;
  delete oldRecipe.fighters.right.stats.weapon;
  const migrated = parseDuelRecipe(JSON.stringify(oldRecipe), { characters: CHARACTERS });
  assert.deepEqual(migrated.fighters.left.stats.weapon, { width: 12, active: 0.2 });
  assert.deepEqual(migrated.fighters.right.stats.weapon, { radius: 5, windup: 0.26 });

  const oldStorage = storage({ [MATCH_SETTINGS_STORAGE_KEY]: JSON.stringify({ version: 3,
    fighters: { left: { warrior: { health: 145 } } }
  }) });
  const oldStore = createMatchSettingsStore({ characters: CHARACTERS, storage: oldStorage });
  assert.equal(oldStore.getFighter('left', 'warrior').health, 145);
  assert.deepEqual(oldStore.getFighter('left', 'warrior').weapon, { width: 12, active: 0.2 });

  const invalid = structuredClone(recipe);
  invalid.fighters.right.stats.weapon.windup = 0.67;
  assert.throws(() => parseDuelRecipe(JSON.stringify(invalid), { characters: CHARACTERS }), /weapon windup/);
});

test('sword width and arrow radius and windup affect combat', () => {
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  const warrior = CHARACTER_BY_ID.warrior;
  const normal = createFighter('left', warrior, WEAPON_DEFINITIONS.warrior, 0, settings.getFighter('left', warrior.id));
  const target = { x: normal.x + 100, y: normal.y + 60 };
  assert.equal(weaponIntersectsTarget(normal, target, { angle: 0, shift: 0 }), false);
  settings.setWeaponValue('left', warrior.id, 'width', 40);
  settings.setWeaponValue('left', warrior.id, 'active', 0.4);
  const tuned = createFighter('left', warrior, WEAPON_DEFINITIONS.warrior, 0, settings.getFighter('left', warrior.id));
  assert.equal(weaponIntersectsTarget(tuned, target, { angle: 0, shift: 0 }), true);
  assert.equal(tuned.weapon.active, 0.4);

  const lateHit = active => {
    settings.setWeaponValue('left', warrior.id, 'width', 12);
    settings.setWeaponValue('left', warrior.id, 'active', active);
    const selected = { left: warrior, right: CHARACTER_BY_ID.archer };
    const engine = createCombatEngine();
    engine.reset(selected, settings.snapshot(selected));
    engine.state.phase = 'running';
    const [attacker, defender] = engine.state.fighters;
    defender.x = attacker.x + 500;
    engine.startAttack(attacker, defender);
    engine.state.elapsed = 0.2;
    engine.updateAttacks();
    defender.x = attacker.x + 100;
    engine.state.elapsed = 0.5;
    engine.updateAttacks();
    return defender.health;
  };
  assert.ok(lateHit(0.4) < lateHit(0.2));

  settings.setWeaponValue('left', 'archer', 'radius', 15);
  settings.setWeaponValue('left', 'archer', 'windup', 0.5);
  const selected = { left: CHARACTER_BY_ID.archer, right: CHARACTER_BY_ID.warrior };
  const engine = createCombatEngine();
  engine.reset(selected, settings.snapshot(selected));
  engine.state.phase = 'running';
  const [archer, opponent] = engine.state.fighters;
  engine.startAttack(archer, opponent);
  engine.state.elapsed = 0.3;
  engine.updateAttacks();
  assert.equal(engine.state.projectiles.length, 0);
  engine.state.elapsed = 0.5;
  engine.updateAttacks();
  assert.equal(engine.state.projectiles[0].radius, 15);
  const offCenterHit = radius => {
    settings.setWeaponValue('left', 'archer', 'radius', radius);
    const trial = createCombatEngine();
    trial.reset(selected, settings.snapshot(selected));
    trial.state.phase = 'running';
    const [shooter, victim] = trial.state.fighters;
    trial.startAttack(shooter, victim);
    trial.state.elapsed = shooter.weapon.windup;
    trial.updateAttacks();
    const arrow = trial.state.projectiles[0];
    Object.assign(victim, { x: 500, y: 500, prevX: 500, prevY: 500 });
    Object.assign(arrow, { x: 420, y: 560, vx: 620, vy: 0 });
    trial.updateProjectiles(0.2);
    return victim.health;
  };
  assert.ok(offCenterHit(15) < offCenterHit(5));
});
