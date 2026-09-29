import { defaultGuardianAbilities, defaultStarAbilities } from '../config/customization.js';

export function fighterTraitDescription(character, settings, t) {
  if (!character.trait?.descriptionKey) return '';
  if (character.id === 'guardian') {
    const abilities = { ...defaultGuardianAbilities(), ...settings?.abilities };
    const mode = abilities.autoSwitch ? t('customization.guardian_auto_mode') : t(`customization.guardian_mode_${abilities.startingMode}`);
    return t('trait.shield_flail.tuned_description', {
      durability: abilities.durability, mode, chargeSpeed: abilities.chargeSpeed,
      chargeDistance: abilities.chargeDistance, groundDuration: abilities.groundDuration
    });
  }
  if (character.id === 'dongfang-changfan') {
    const abilities = { ...defaultStarAbilities(), ...settings?.abilities };
    const sources = ['enemyAttack', 'enemyHurt', 'enemyHit'].filter(key => abilities[key]).length;
    return t('trait.myriad_star_fireflies.tuned_description', {
      duration: abilities.stackDuration, bonus: Math.round(abilities.hastePerStack * 100),
      sources, stars: abilities.starsPerAttack
    });
  }
  return t(character.trait.descriptionKey);
}
