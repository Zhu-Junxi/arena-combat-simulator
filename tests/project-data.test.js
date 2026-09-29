import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
async function copyFixture(directory) {
  await mkdir(join(directory, 'src'), { recursive: true });
  await cp(join(project, 'src/scripts'), join(directory, 'src/scripts'), { recursive: true });
  await mkdir(join(directory, 'data/characters'), { recursive: true });
  await mkdir(join(directory, 'data/presets'), { recursive: true });
  await mkdir(join(directory, 'data/settings'), { recursive: true });
  await cp(join(project, 'data/catalog.json'), join(directory, 'data/catalog.json'));
  await cp(join(project, 'data/characters/factory'), join(directory, 'data/characters/factory'), { recursive: true });
  await cp(join(project, 'data/presets/builtin'), join(directory, 'data/presets/builtin'), { recursive: true });
  await cp(join(project, 'data/settings/factory-arena.json'), join(directory, 'data/settings/factory-arena.json'));
  await writeFile(join(directory, 'package.json'), '{"type":"module"}\n');
}
async function isolated(t) {
  const directory = await mkdtemp(join(tmpdir(), 'arena-duel-data-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await copyFixture(directory);
  const source = pathToFileURL(join(directory, 'src/scripts/data/project-data-service.js')).href;
  return { directory, service: await import(source), characters: await import(pathToFileURL(join(directory, 'src/scripts/config/characters.js')).href),
    settings: await import(pathToFileURL(join(directory, 'src/scripts/customization/settings-store.js')).href) };
}

test('factory JSON is the runtime character source and built-in recipes stay importable', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'arena-duel-factory-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await copyFixture(directory);
  const file = join(directory, 'data/characters/factory/warrior.json');
  const factory = JSON.parse(await readFile(file, 'utf8'));
  factory.stats.attack[0] = 7;
  await writeFile(file, JSON.stringify(factory));
  const characters = await import(pathToFileURL(join(directory, 'src/scripts/config/characters.js')).href);
  const { createMatchSettingsStore } = await import(pathToFileURL(join(directory, 'src/scripts/customization/settings-store.js')).href);
  const { parseDuelRecipe } = await import(pathToFileURL(join(directory, 'src/scripts/share/duel-share-codec.js')).href);
  const { createCombatEngine } = await import(pathToFileURL(join(directory, 'src/scripts/battle/combat-engine.js')).href);
  assert.equal(characters.CHARACTER_BY_ID.warrior.stats.attack, 7);
  const store = createMatchSettingsStore({ characters: characters.CHARACTERS, storage: { getItem: () => null, setItem() {} } });
  assert.equal(store.getFighter('left', 'warrior').attack[0], 7);
  const engine = createCombatEngine();
  engine.reset({ left: characters.CHARACTER_BY_ID.warrior, right: characters.CHARACTER_BY_ID.archer },
    { fighters: { left: store.getFighter('left', 'warrior'), right: store.getFighter('right', 'archer') } });
  assert.equal(engine.state.fighters[0].attackValues[0], 7);
  for (const id of ['warrior-archer', 'guardian-mage', 'priest-beastmaster']) {
    const text = await readFile(join(directory, `data/presets/builtin/${id}.json`), 'utf8');
    assert.ok(parseDuelRecipe(text, { characters: characters.CHARACTERS }).fighters.left);
  }
});

test('pre-War match files and backups add War defaults without replacing existing fighter settings', async t => {
  const { directory, service, characters, settings } = await isolated(t);
  const store = settings.createMatchSettingsStore({ characters: characters.CHARACTERS, storage: { getItem: () => null, setItem() {} } });
  store.setFighterValue('left', 'guardian', 'health', 177);
  const legacy = store.exportData();
  legacy.version = 4;
  delete legacy.warCombatVersion;
  delete legacy.characterDefaults.war;
  for (const seat of Object.values(legacy.fighters)) delete seat.war;
  const match = { ...legacy }; delete match.characterDefaults;
  await writeFile(join(directory, 'data/settings/match.json'), JSON.stringify(match));
  const before = await service.bootstrapData();
  assert.equal(before.settings.fighters.left.guardian.health, 177);
  assert.deepEqual(before.settings.fighters.left.war.attackCD, [5]);
  assert.equal(before.settings.version, 5);
  assert.equal(before.settings.fighters.left.war.abilities.chargeDistance, 600);
  const imported = await service.importBackup({ format: 'arena-duel.backup', version: 1, settings: legacy, presets: null }, before.revisions);
  assert.equal(imported.settings.fighters.left.guardian.health, 177);
  assert.equal(imported.settings.characterDefaults.war.attackRange, 220);
  const malformed = structuredClone(legacy); malformed.fighters.left.war = null;
  await assert.rejects(service.saveSettings(malformed, imported.revisions.settings));
});

test('settings and presets write atomically with stale-revision rejection and backup round trip', async t => {
  const { directory, service, characters, settings } = await isolated(t);
  const initial = await service.bootstrapData();
  assert.equal(initial.settings, null);
  const store = settings.createMatchSettingsStore({ characters: characters.CHARACTERS,
    storage: { getItem: () => null, setItem() {} } });
  store.setFighterValue('left', 'warrior', 'health', 137);
  store.setCharacterDefault('left', 'warrior');
  const revision = await service.saveSettings(store.exportData(), initial.revisions.settings);
  assert.notEqual(revision, initial.revisions.settings);
  await assert.rejects(service.saveSettings(store.exportData(), initial.revisions.settings), { status: 409 });
  const saved = await service.bootstrapData();
  assert.equal(saved.settings.characterDefaults.warrior.health, 137);
  assert.equal(saved.settings.fighters.right.warrior.health, 137);
  const override = JSON.parse(await readFile(join(directory, 'data/characters/overrides/warrior.json'), 'utf8'));
  assert.equal(override.format, 'arena-duel.character-default');
  assert.equal(override.stats.health, 137);
  const recipe = JSON.parse(await readFile(join(directory, 'data/presets/builtin/warrior-archer.json'), 'utf8'));
  const personal = { version: 1, entries: [{ id: 'mine', name: 'My duel', updatedAt: 123, recipe }] };
  await service.savePresets(personal, initial.revisions.presets);
  const files = await readdir(join(directory, 'data/presets/personal'));
  assert.ok(files.includes('index.json'));
  assert.equal(files.filter(file => file.endsWith('.json')).length, 2);
  const backup = await service.exportBackup();
  assert.equal(backup.settings.characterDefaults.warrior.health, 137);
  assert.deepEqual(backup.presets, personal);
  const after = await service.importBackup(backup, (await service.bootstrapData()).revisions);
  assert.equal(after.settings.characterDefaults.warrior.health, 137);
  assert.deepEqual(after.presets, personal);
  await assert.rejects(service.savePresets(personal, initial.revisions.presets), { status: 409 });
  assert.equal((await readdir(join(directory, 'data/characters/overrides'))).some(file => file.endsWith('.tmp')), false);
});

test('server validation rejects malformed character and preset data', async t => {
  const { service, characters, settings } = await isolated(t);
  const base = await service.bootstrapData();
  const store = settings.createMatchSettingsStore({ characters: characters.CHARACTERS,
    storage: { getItem: () => null, setItem() {} } });
  const bad = store.exportData();
  bad.characterDefaults.warrior.health = -1;
  await assert.rejects(service.saveSettings(bad, base.revisions.settings));
  await assert.rejects(service.savePresets({ version: 1, entries: [{ id: '../escape', name: 'Bad', updatedAt: 1, recipe: {} }] }, base.revisions.presets));
  assert.equal((await service.bootstrapData()).settings, null);
});

test('an override file is the reset default on both sides even without a match file', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'arena-duel-override-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await copyFixture(directory);
  const file = join(directory, 'data/characters/factory/warrior.json');
  const override = JSON.parse(await readFile(file, 'utf8'));
  override.stats.health = 155;
  await mkdir(join(directory, 'data/characters/overrides'), { recursive: true });
  await writeFile(join(directory, 'data/characters/overrides/warrior.json'), JSON.stringify(override));
  const service = await import(pathToFileURL(join(directory, 'src/scripts/data/project-data-service.js')).href);
  const data = await service.bootstrapData();
  assert.equal(data.settings.characterDefaults.warrior.health, 155);
  assert.equal(data.settings.fighters.left.warrior.health, 155);
  assert.equal(data.settings.fighters.right.warrior.health, 155);
});
