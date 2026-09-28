const deepFreeze = value => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
};

export const WEAPON_SPRITES = deepFreeze({
  sword: { file: 'warrior-sword-color.png', source: [2172, 724], crop: [20, 112, 2118, 471], x: 28, width: 156, height: 34.69121813031161, y: -17.345609065155806 },
  bow: { file: 'archer-forest-bow.png', source: [724, 2172], crop: [201, 50, 328, 2017], x: 62, height: 144, width: 23.416955875061973, y: -72, string: { x: 62.7, top: -71, bottom: 71 } },
  shield: { file: 'guardian-shield-side.png', source: [1024, 1536], crop: [388, 39, 250, 1456], x: 50, width: 19.11509543088559, height: 111.32631578947368, y: -55.66315789473684 },
  staff: { file: 'mage-staff-ice-fire.png', source: [2172, 724], crop: [17, 73, 2141, 585], x: 24, width: 112, focus: 123, height: 30.60252218589444, y: -13.91499299392807 },
  scepter: { file: 'priest-scepter-sacred.png', source: [2172, 724], crop: [9, 41, 2155, 657], x: 24, width: 112, focus: 124, height: 34.14570765661253, y: -14.8 }
});

export const ARROW_SPRITE = deepFreeze({ file: 'archer-forest-arrow.png', source: [2172, 724], crop: [52, 252, 2070, 205] });

export const WEAPON_DEFINITIONS = deepFreeze({
  'dongfang-changfan': { type: 'ranged', art: 'star-thought', muzzle: 64, windup: 0.28, duration: 0.76, projectileSpeed: 560, radius: 7 },
  warrior: { type: 'melee', art: 'sword', mount: 50, length: 134, width: 12, windup: 0.2, active: 0.2, duration: 0.7 },
  guardian: { type: 'melee', art: 'shield', mount: 50, length: 72, width: 111.32631578947368, windup: 0.22, active: 0.18, duration: 0.68 },
  archer: { type: 'ranged', art: 'bow', muzzle: WEAPON_SPRITES.bow.x + WEAPON_SPRITES.bow.width + 8, windup: 0.26, duration: 0.68, projectileSpeed: 1240, radius: 5 },
  mage: { type: 'ranged', art: 'staff', muzzle: 144, windup: 0.28, duration: 0.76, projectileSpeed: 560, radius: 9 },
  priest: { type: 'ranged', art: 'scepter', muzzle: 144, windup: 0.32, duration: 0.82, projectileSpeed: 540, radius: 8 }
});
