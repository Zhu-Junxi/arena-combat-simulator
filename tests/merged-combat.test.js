import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CHARACTERS } from '../src/scripts/config/characters.js';
import { createCombatEngine } from '../src/scripts/battle/combat-engine.js';
import { fighterHudState, battleEventText } from '../src/scripts/battle/battle-hud.js';
import { createI18n } from '../src/scripts/i18n/i18n.js';

const character = id => CHARACTERS.find(value => value.id === id);
const i18n = createI18n({ source: await readFile(new URL('../src/locales/translations.csv', import.meta.url), 'utf8'), browserLanguages: ['en'], storage: null });
const t = (key, parameters) => i18n.t(key, parameters);

test('new battle HUD handles Beastmaster summon damage alongside mage, stars and flail combat', () => {
  let summonDamage = 0;
  for (const id of ['mage', 'dongfang-changfan', 'guardian', 'archer']) {
    let seed = 91;
    const engine = createCombatEngine({
      random: () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296),
      onEvent: event => {
        assert.doesNotThrow(() => battleEventText(event, t));
        if (event.type === 'damage' && event.target.owner) summonDamage += 1;
      }
    });
    engine.reset({ left: character(id), right: character('beastmaster') });
    if (engine.state.fighters[0].guardian) engine.state.fighters[0].guardian.shield = 0;
    engine.launch();
    for (let frame = 0; frame < 60 * 120 && engine.state.phase === 'running'; frame += 1) {
      engine.step(1 / 120);
      for (const fighter of engine.state.fighters) {
        const hud = fighterHudState(fighter, engine.state, t);
        assert.ok(Number.isFinite(fighter.x) && Number.isFinite(fighter.y));
        assert.ok(!hud.extraValue.includes('NaN'));
      }
    }
    const beastmaster = engine.state.fighters[1];
    const hud = fighterHudState(beastmaster, engine.state, t);
    assert.equal(hud.extraLabel, t('trait.beastmaster.name'));
    assert.match(hud.extraValue, /\d+ \/ \d+/);
  }
  assert.ok(summonDamage > 0, 'targetable wolves take real combat damage');
});

test('a guardian charge hits its actual contact pair in a multi-fighter match', () => {
  const engine = createCombatEngine();
  engine.reset({ left: character('guardian'), right: character('archer'), third: character('priest') });
  const [guardian, far, near] = engine.state.fighters;
  Object.assign(guardian, { x: 200, y: 300, vx: 0, vy: 0 });
  Object.assign(far, { x: 800, y: 800, vx: 0, vy: 0 });
  Object.assign(near, { x: 360, y: 300, vx: 0, vy: 0 });
  const attack = { angle: 0, damage: 10, hit: false };
  guardian.guardian.dash = { angle: 0, speed: 1150, remaining: 270, attack };
  engine.state.phase = 'running';
  engine.advance(.1);
  assert.equal(near.health, near.maxHealth - 10);
  assert.equal(far.health, far.maxHealth);
  assert.equal(guardian.guardian.dash, null);
});
