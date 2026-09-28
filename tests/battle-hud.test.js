import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createI18n } from '../src/scripts/i18n/i18n.js';
import { CHARACTERS } from '../src/scripts/config/characters.js';
import { createCombatEngine } from '../src/scripts/battle/combat-engine.js';
import { grantStarPassive } from '../src/scripts/battle/star-passive.js';
import { battleTime, fighterHudState, battleEventText } from '../src/scripts/battle/battle-hud.js';

const i18n = createI18n({ source: await readFile(new URL('../src/locales/translations.csv', import.meta.url), 'utf8'), browserLanguages: ['en'], storage: null });
const t = (key, parameters) => i18n.t(key, parameters);
function fixture(left, right = 'archer') {
  const engine = createCombatEngine();
  engine.reset({ left: CHARACTERS.find(c => c.id === left), right: CHARACTERS.find(c => c.id === right) });
  engine.state.phase = 'running';
  return { battle: engine.state, fighter: engine.state.fighters[0], target: engine.state.fighters[1] };
}

test('HUD reads guardian durability and every flail phase from the current battle', () => {
  const { battle, fighter } = fixture('guardian');
  fighter.guardian.shield = 17;
  let hud = fighterHudState(fighter, battle, t);
  assert.equal(hud.extraValue, '17 / 40');
  assert.equal(hud.extraRatio, 17 / 40);
  assert.equal(hud.status, 'Shield charge');
  fighter.guardian.shield = 0;
  fighter.guardian.flail = { phase: 'grounded', expiresAt: 8 };
  battle.elapsed = 5;
  hud = fighterHudState(fighter, battle, t);
  assert.equal(hud.extraValue, '3.0s');
  assert.equal(hud.extraRatio, .6);
  assert.equal(hud.status, 'Chain blocks passage');
  fighter.guardian.flail.phase = 'returning';
  assert.equal(fighterHudState(fighter, battle, t).status, 'Retrieving flail');
  fighter.guardian.flail.phase = 'outbound';
  assert.equal(fighterHudState(fighter, battle, t).status, 'Throwing flail');
});

test('HUD uses edited health and vine settings and live movement controls', () => {
  const { battle, fighter } = fixture('archer');
  Object.assign(fighter, { health: 125, maxHealth: 250, movementSpeed: 320, attacksFired: 5 });
  fighter.trait.every = 6;
  let hud = fighterHudState(fighter, battle, t);
  assert.equal(hud.healthRatio, .5);
  assert.equal(hud.extraValue, '5 / 6');
  assert.equal(hud.status, 'Next arrow: vines');
  assert.equal(hud.speed, '320');
  fighter.rootUntil = 2;
  assert.equal(fighterHudState(fighter, battle, t).speed, '0');
  battle.elapsed = 2;
  assert.equal(fighterHudState(fighter, battle, t).speed, '320');
});

test('star haste updates attack interval and readiness then expires without stale bonus', () => {
  const { battle, fighter } = fixture('dongfang-changfan');
  grantStarPassive(fighter, 'enemy-attack', 0);
  grantStarPassive(fighter, 'enemy-hurt', 0);
  let hud = fighterHudState(fighter, battle, t);
  assert.equal(hud.extraValue, '2 / 3');
  assert.equal(hud.cooldown, '0.4 s');
  assert.equal(hud.status, 'Attack speed +400%');
  assert.equal(hud.attackState, 'Ready in 0.4s');
  battle.elapsed = 2;
  hud = fighterHudState(fighter, battle, t);
  assert.equal(hud.extraValue, '0 / 3');
  assert.equal(hud.cooldown, '2.0 s');
});

test('priest shows marks on the opponent and mage shows damage for the active spell', () => {
  const { battle, fighter, target } = fixture('priest', 'mage');
  target.priestMarks = 7;
  fighter.priestMarks = 2;
  assert.equal(fighterHudState(fighter, battle, t).extraValue, '7');
  assert.equal(fighterHudState(fighter, battle, t).attack, '0');
  target.mageCycle = 'fire';
  target.mageSpellIndex = 1;
  target.mageAbilities.cycles.fire[1].damage = 27;
  assert.equal(fighterHudState(target, battle, t).attack, '27');
  assert.equal(fighterHudState(target, battle, t).extraValue, 'Fire');
});

test('battle ticker translates event roles correctly and hides empty damage', () => {
  const { battle, fighter, target } = fixture('guardian');
  assert.equal(battleEventText({ type: 'shield-broken', fighter }, t), 'Guardian\'s shield breaks');
  assert.match(battleEventText({ type: 'shield-damaged', fighter: target, target: fighter, amount: 5 }, t), /Guardian.*5/);
  assert.equal(battleEventText({ type: 'damage', fighter, target, amount: 0 }, t), null);
  assert.equal(battleTime(125.9), '02:05');
  assert.equal(battleTime(-3), '00:00');
  battle.phase = 'finished';
  assert.equal(fighterHudState(fighter, battle, t).attackState, 'Duel complete');
  i18n.setLocale('zh-CN');
  for (const type of ['shield-broken', 'shield-damaged', 'damage', 'healed', 'flail-landed', 'prayer-started', 'finished']) {
    const text = battleEventText({ type, battle, fighter, target, winner: fighter, amount: 5 }, t);
    assert.ok(text && !text.includes('[') && !text.includes('{'), `${type}: ${text}`);
  }
  i18n.setLocale('en');
});
