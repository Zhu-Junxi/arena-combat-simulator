import { projectCatalog, readProjectJson } from '../data/project-files.js';

const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const withBaseKind = character => deepFreeze({ ...character, category: character.category ?? 'base' });

export const CHARACTER_KINDS = Object.freeze(['melee', 'ranged', 'special', 'defense', 'healing', 'summon', 'control', 'mobility']);
export const CHARACTER_CATEGORIES = Object.freeze(['base', ...CHARACTER_KINDS]);

const CHARACTER_METADATA = [
  {
    id: 'warrior',
    nameKey: 'character.warrior.name',
    trait: { id: 'plate', nameKey: 'trait.plate.name', descriptionKey: 'trait.plate.description' },
    art: {
      portrait: 'assets/characters/warrior/portrait-color.png',
      avatar: 'assets/characters/warrior/avatar-background.png',
      battle: 'assets/characters/warrior/battle-orb-color.png'
    }
  },
  {
    id: 'archer',
    nameKey: 'character.archer.name',
    trait: {
      id: 'vine', nameKey: 'trait.vine.name', descriptionKey: 'trait.vine.description'
    },
    art: {
      portrait: 'assets/characters/archer/portrait.png',
      avatar: 'assets/characters/archer/avatar-background.png',
      battle: 'assets/characters/archer/battle.png'
    }
  },
  {
    id: 'guardian', nameKey: 'character.guardian.name',
    trait: { id: 'shield-flail', nameKey: 'trait.shield_flail.name', descriptionKey: 'trait.shield_flail.description' },
    art: {
      portrait: 'assets/characters/guardian/portrait.png',
      avatar: 'assets/characters/guardian/avatar.png',
      battle: 'assets/characters/guardian/battle.png'
    },
  },
  {
    id: 'mage',
    nameKey: 'character.mage.name',
    art: {
      portrait: 'assets/characters/mage/portrait.png',
      avatar: 'assets/characters/mage/avatar.png',
      battle: 'assets/characters/mage/battle.png'
    },
    trait: {
      id: 'elemental-cycles', nameKey: 'trait.elemental_cycles.name', descriptionKey: 'trait.elemental_cycles.description'
    }
  },
  {
    id: 'priest',
    nameKey: 'character.priest.name',
    art: {
      portrait: 'assets/characters/priest/portrait.png',
      avatar: 'assets/characters/priest/avatar.png',
      battle: 'assets/characters/priest/battle.png'
    },
    trait: { id: 'prayer', nameKey: 'trait.prayer.name', descriptionKey: 'trait.prayer.description' }
  },
  {
    id: 'dongfang-changfan',
    nameKey: 'character.dongfang_changfan.name',
    trait: { id: 'myriad-star-fireflies', nameKey: 'trait.myriad_star_fireflies.name', descriptionKey: 'trait.myriad_star_fireflies.description' },
    category: 'mobility',
    art: {
      portrait: 'assets/characters/dongfang-changfan/portrait.png',
      avatar: 'assets/characters/dongfang-changfan/avatar.png',
      battle: 'assets/characters/dongfang-changfan/battle.png'
    }
  },
  {
    id: 'beastmaster', category: 'summon', nameKey: 'character.beastmaster.name',
    trait: { id: 'beastmaster', nameKey: 'trait.beastmaster.name', descriptionKey: 'trait.beastmaster.description' }
  },
  {
    id: 'necromancer', category: 'summon', locked: true, nameKey: 'character.necromancer.name', roleKey: 'character.necromancer.role',
    stats: { attack: 0, attackCD: 1, speed: 0, health: 0 }
  },
  {
    id: 'artificer', category: 'summon', locked: true, nameKey: 'character.artificer.name', roleKey: 'character.artificer.role',
    stats: { attack: 0, attackCD: 1, speed: 0, health: 0 }
  }
];

const playableIds = CHARACTER_METADATA.filter(character => !character.locked).map(character => character.id);
if (JSON.stringify(playableIds) !== JSON.stringify(projectCatalog.characters)) {
  throw new Error('Playable roster and data catalog do not match');
}

const factoryById = Object.fromEntries(await Promise.all(projectCatalog.characters.map(async id => {
  const data = await readProjectJson(`characters/factory/${id}.json`);
  if (data.format !== 'arena-duel.character-default' || data.version !== 1 || data.characterId !== id || !data.stats) {
    throw new Error(`Invalid factory character data: ${id}`);
  }
  return [id, data.stats];
})));

export const CHARACTERS = Object.freeze(CHARACTER_METADATA.map(character => {
  if (character.locked) return withBaseKind(character);
  const defaults = factoryById[character.id];
  if (!defaults) throw new Error(`Missing factory character data: ${character.id}`);
  const stats = { health: defaults.health, attack: defaults.attack.length === 1 ? defaults.attack[0] : [...defaults.attack],
    attackCD: defaults.attackCD.length === 1 ? defaults.attackCD[0] : [...defaults.attackCD], movementSpeed: defaults.movementSpeed,
    speed: defaults.movementSpeed / 44 };
  return withBaseKind({ ...character, stats, trait: { ...character.trait, ...defaults.trait }, defaultSettings: defaults });
}));

export const CHARACTER_BY_ID = Object.freeze(Object.fromEntries(CHARACTERS.map(character => [character.id, character])));
