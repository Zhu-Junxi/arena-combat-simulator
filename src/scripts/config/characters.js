const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

const withBaseKind = character => deepFreeze({ ...character, kind: '基础' });

export const CHARACTER_KINDS = Object.freeze(['近战', '远程', '特殊', '防御', '治疗', '召唤', '控制', '机动']);
export const CHARACTER_CATEGORIES = Object.freeze(['基础', ...CHARACTER_KINDS]);

export const CHARACTERS = Object.freeze([
  {
    id: 'warrior',
    name: '战士',
    trait: { id: 'plate', name: '板甲', reduction: 1, description: '每次受到的伤害减少 1 点，实际伤害最低为 1 点。' },
    art: {
      portrait: 'assets/characters/warrior/portrait-color.png',
      avatar: 'assets/characters/warrior/avatar-color.png',
      battle: 'assets/characters/warrior/battle-orb-color.png'
    },
    stats: { attack: 5, attackCD: 1, speed: 5, health: 100 }
  },
  {
    id: 'archer',
    name: '弓箭手',
    trait: {
      id: 'vine', name: '藤箭', every: 4, rootDuration: 2, slowDuration: 3, slowFactor: 0.5,
      description: '每发射 4 支箭，第 4 支强化为藤箭。命中后禁锢目标 2 秒，随后移动速度降低 50%，持续 3 秒。禁锢期间仍可攻击。'
    },
    art: {
      portrait: 'assets/characters/archer/portrait.png',
      avatar: 'assets/characters/archer/avatar.png',
      battle: 'assets/characters/archer/battle.png'
    },
    stats: { attack: 5, attackCD: 2.5, speed: 3, health: 80 }
  },
  { id: 'guardian', name: '盾卫士', stats: { attack: 8, attackCD: 5, speed: 1.5, health: 100 } },
  { id: 'mage', name: '法师', stats: { attack: [1, 2, 3], attackCD: [2, 2, 2], speed: 3, health: 80 } },
  { id: 'priest', name: '牧师', stats: { attack: 5, attackCD: 3, speed: 3, health: 50 } }
].map(withBaseKind));

export const CHARACTER_BY_ID = Object.freeze(Object.fromEntries(CHARACTERS.map(character => [character.id, character])));
