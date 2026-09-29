import test from 'node:test';
import assert from 'node:assert/strict';
import { CHARACTER_BY_ID, CHARACTERS } from '../src/scripts/config/characters.js';
import { FIGHTER_CONTROLS, SUMMON_ABILITY_CONTROLS, MATCH_SETTINGS_STORAGE_KEY, MATCH_SETTINGS_VERSION } from '../src/scripts/config/customization.js';
import { createMatchSettingsStore } from '../src/scripts/customization/settings-store.js';
import { createCombatEngine, dealDamage, healFighter } from '../src/scripts/battle/combat-engine.js';
import { formatCombat } from '../src/scripts/battle/combat-precision.js';
import { absorbShieldDamage } from '../src/scripts/battle/guardian.js';
import { battleEventText, fighterHudState } from '../src/scripts/battle/battle-hud.js';
import { createDuelRecipe, parseDuelRecipe } from '../src/scripts/share/duel-share-codec.js';

function storage(initial = []) {
  const data = new Map(initial);
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}

test('direct hits use 0.001 HP resolution and never leave floating-point residue', () => {
  const target = { health: 100, maxHealth: 100, trait: null };
  for (let index = 0; index < 1000; index += 1) assert.equal(dealDamage(target, 0.001), 0.001);
  assert.equal(target.health, 99);
  target.trait = { id: 'plate', reduction: 1 };
  assert.equal(dealDamage(target, 1), 0.001);
  assert.equal(target.health, 98.999);
  target.trait = null;
  target.health = 10;
  assert.equal(dealDamage(target, 1.23456), 1.235);
  assert.equal(target.health, 8.765);
  target.health = 0.001;
  assert.equal(dealDamage(target, 0.0001), 0.001);
  assert.equal(target.health, 0);
});

test('healing rounds to 0.001 and caps at maximum HP', () => {
  const fighter = { health: 4.998, maxHealth: 5 };
  assert.equal(healFighter(fighter, 0.0004), 0);
  assert.equal(fighter.health, 4.998);
  assert.equal(healFighter(fighter, 0.0015), 0.002);
  assert.equal(fighter.health, 5);
  assert.equal(healFighter(fighter, 1), 0);
});

test('shield absorption and overflow stay on the same HP grid', () => {
  const guardian = { guardian: { shield: 0.333 }, guardianAbilities: { shieldFlashDuration: 0.15 } };
  assert.deepEqual(absorbShieldDamage(guardian, 0.5, 0), { absorbed: 0.333, remaining: 0.167, broken: true });
  assert.equal(guardian.guardian.shield, 0);
  const engine = createCombatEngine();
  engine.reset({ left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID.archer });
  const [fighter, attacker] = engine.state.fighters;
  fighter.guardian.shield = 0.333;
  engine.state.projectiles.push({ owner: attacker, target: fighter, damage: 0.5,
    x: fighter.x + 120, y: fighter.y, vx: -1000, vy: 0, radius: 5, age: 0 });
  engine.updateProjectiles(0.2);
  assert.equal(fighter.guardian.shield, 0);
  assert.equal(fighter.health, 99.833);
});

test('sub-thousandth damage-over-time ticks round independently and still expire', () => {
  const engine = createCombatEngine();
  engine.reset({ left: CHARACTER_BY_ID.archer, right: CHARACTER_BY_ID.warrior });
  engine.state.phase = 'running';
  const [target] = engine.state.fighters;
  target.burn = { dps: 0.004, expiresAt: 0.1 };
  engine.step(0.1);
  assert.equal(target.health, 80);
  assert.equal(target.burn, null);
  target.burn = { dps: 0.005, expiresAt: 0.2 };
  engine.step(0.1);
  assert.equal(target.health, 79.999);
});

test('companion HP and tuning inputs accept 0.001', () => {
  assert.equal(FIGHTER_CONTROLS.attack.min, 0.001);
  assert.equal(FIGHTER_CONTROLS.health.min, 0.001);
  assert.equal(SUMMON_ABILITY_CONTROLS.companionHealth.min, 0.001);
  const settings = createMatchSettingsStore({ characters: CHARACTERS, storage: storage() });
  settings.setFighterValue('left', 'beastmaster', 'health', 0.001);
  settings.setFighterValue('left', 'beastmaster', 'attack', 0.001);
  settings.setSummonAbilityValue('left', 'beastmaster', 'companionHealth', 0.001);
  const selected = { left: CHARACTER_BY_ID.beastmaster, right: CHARACTER_BY_ID.archer };
  const setup = settings.snapshot(selected);
  const parsed = parseDuelRecipe(JSON.stringify(createDuelRecipe({ selectedCharacters: selected, setup })), { characters: CHARACTERS });
  assert.equal(parsed.fighters.left.stats.health, 0.001);
  assert.deepEqual(parsed.fighters.left.stats.attack, [0.001]);
  assert.equal(parsed.fighters.left.stats.abilities.companionHealth, 0.001);
  const engine = createCombatEngine();
  engine.reset(selected, setup);
  const companion = engine.state.summons.find(summon => summon.kind === 'companion');
  assert.equal(companion.health, 0.001);
  assert.equal(dealDamage(companion, 0.001), 0.001);
  assert.equal(companion.health, 0);
});

test('previous saved stats and duel recipes retain their original values', () => {
  const prior = { version: MATCH_SETTINGS_VERSION, fighters: { left: { warrior: { health: 25, attack: [1] } } } };
  const settings = createMatchSettingsStore({ characters: CHARACTERS,
    storage: storage([[MATCH_SETTINGS_STORAGE_KEY, JSON.stringify(prior)]]) });
  assert.equal(settings.getFighter('left', 'warrior').health, 25);
  assert.deepEqual(settings.getFighter('left', 'warrior').attack, [1]);
  const selected = { left: CHARACTER_BY_ID.warrior, right: CHARACTER_BY_ID.archer };
  const recipe = createDuelRecipe({ selectedCharacters: selected, setup: settings.snapshot(selected) });
  recipe.version = 11;
  delete recipe.fighters.left.stats.weapon;
  delete recipe.fighters.right.stats.weapon;
  const parsed = parseDuelRecipe(JSON.stringify(recipe), { characters: CHARACTERS });
  assert.equal(parsed.fighters.left.stats.health, 25);
  assert.deepEqual(parsed.fighters.left.stats.attack, [1]);
});

test('HUD and events show up to three combat decimals', () => {
  assert.deepEqual([0.001, 5.2, 5].map(formatCombat), ['0.001', '5.2', '5']);
  const engine = createCombatEngine();
  engine.reset({ left: CHARACTER_BY_ID.guardian, right: CHARACTER_BY_ID.archer });
  const [fighter] = engine.state.fighters;
  fighter.health = 5.237;
  fighter.guardian.shield = 0.001;
  const t = (key, parameters) => key === 'hud.event_damage' ? parameters.amount : key;
  const hud = fighterHudState(fighter, engine.state, t);
  assert.equal(hud.health, '5.237');
  assert.equal(hud.extraValue, '0.001 / 40');
  for (const [amount, expected] of [[0.001, '0.001'], [5.2, '5.2'], [5, '5']]) {
    assert.equal(battleEventText({ type: 'damage', fighter, amount }, t), expected);
  }
});
