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
  shield: { file: 'guardian-shield.png', source: [1144, 1375], crop: [145, 23, 855, 1322], x: 50, width: 72, height: 111.32631578947368, y: -55.66315789473684 },
  staff: { file: 'mage-staff.png', source: [2172, 724], crop: [41, 173, 2090, 377], x: 24, width: 112, focus: 118, height: 20.20287081339713, y: -10.101435406698565 },
  scepter: { file: 'priest-scepter.png', source: [1774, 887], crop: [5, 215, 1768, 450], x: 24, width: 112, focus: 122, height: 28.506787330316744, y: -14.253393665158372 }
});

export const ARROW_SPRITE = deepFreeze({ file: 'archer-forest-arrow.png', source: [2172, 724], crop: [52, 252, 2070, 205] });

export const WEAPON_DEFINITIONS = deepFreeze({
  warrior: { type: 'melee', art: 'sword', mount: 50, length: 134, width: 12, windup: 0.2, active: 0.2, duration: 0.7 },
  guardian: { type: 'melee', art: 'shield', mount: 50, length: 72, width: 111.32631578947368, windup: 0.22, active: 0.18, duration: 0.68 },
  archer: { type: 'ranged', art: 'bow', muzzle: WEAPON_SPRITES.bow.x + WEAPON_SPRITES.bow.width + 8, windup: 0.26, duration: 0.68, projectileSpeed: 620, radius: 5 },
  mage: { type: 'ranged', art: 'staff', muzzle: 144, windup: 0.28, duration: 0.76, projectileSpeed: 560, radius: 9 },
  priest: { type: 'ranged', art: 'scepter', muzzle: 144, windup: 0.32, duration: 0.82, projectileSpeed: 540, radius: 8 }
});
