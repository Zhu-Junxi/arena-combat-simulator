const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const withBaseKind = character => deepFreeze({ ...character, category: 'base' });

export const CHARACTER_KINDS = Object.freeze(['melee', 'ranged', 'special', 'defense', 'healing', 'summon', 'control', 'mobility']);
export const CHARACTER_CATEGORIES = Object.freeze(['base', ...CHARACTER_KINDS]);

export const CHARACTERS = Object.freeze([
  {
    id: 'warrior',
    nameKey: 'character.warrior.name',
    trait: { id: 'plate', nameKey: 'trait.plate.name', descriptionKey: 'trait.plate.description', reduction: 1 },
    art: {
      portrait: 'assets/characters/warrior/portrait-color.png',
      avatar: 'assets/characters/warrior/avatar-color.png',
      battle: 'assets/characters/warrior/battle-orb-color.png'
    },
    stats: { attack: 5, attackCD: 1, speed: 5, health: 100 }
  },
  {
    id: 'archer',
    nameKey: 'character.archer.name',
    trait: {
      id: 'vine', nameKey: 'trait.vine.name', descriptionKey: 'trait.vine.description',
      every: 4, rootDuration: 2, slowDuration: 3, slowFactor: 0.5
    },
    art: {
      portrait: 'assets/characters/archer/portrait.png',
      avatar: 'assets/characters/archer/avatar.png',
      battle: 'assets/characters/archer/battle.png'
    },
    stats: { attack: 5, attackCD: 2.5, speed: 3, health: 80 }
  },
  { id: 'guardian', nameKey: 'character.guardian.name', stats: { attack: 8, attackCD: 5, speed: 1.5, health: 100 } },
  { id: 'mage', nameKey: 'character.mage.name', stats: { attack: [1, 2, 3], attackCD: [2, 2, 2], speed: 3, health: 80 } },
  { id: 'priest', nameKey: 'character.priest.name', stats: { attack: 5, attackCD: 3, speed: 3, health: 50 } }
].map(withBaseKind));

export const CHARACTER_BY_ID = Object.freeze(Object.fromEntries(CHARACTERS.map(character => [character.id, character])));
