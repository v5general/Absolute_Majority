import type { MPBackground, FamilyOrigin, Education, SocialClass, BackgroundModifiers } from '../types/background';
import type { Party } from '../types/game';
import { BACKGROUND_MODIFIERS, ORIGIN_WEIGHTS_BY_PARTY, BACKGROUND_METADATA, CAREERS_BY_ORIGIN, EDUCATION_BY_ORIGIN, SOCIAL_BY_ORIGIN } from '../config/backgroundConfig';
import { PROPORTIONAL_BLOCKS } from '../config/districtConfig';
import { findPersonPreset } from '../data/keyPeoplePresets';

/** 所有的都道府县名称列表（从选区配置自动收集） */
const ALL_PREFECTURES = PROPORTIONAL_BLOCKS.flatMap(b => b.prefectures);

/** 基于名称的确定性伪随机 */
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (h * 1664525 + 1013904223) | 0;
    return (h >>> 0) / 4294967296;
  };
}

function weightedPick<T>(items: T[], weights: number[], rng: () => number): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** 为议员生成背景 */
export function generateBackground(personName: string, partyId: string, _party: Party): MPBackground {
  // 检查是否有预设数据
  const preset = findPersonPreset(partyId, personName);

  const rng = seededRandom(personName + partyId);
  const origins: FamilyOrigin[] = ['political_family', 'bureaucrat_family', 'business_family', 'union_cadre', 'lawyer', 'professor', 'journalist', 'grassroots_activist', 'salaryman', 'other'];
  const weights = ORIGIN_WEIGHTS_BY_PARTY[partyId];
  const originWeights = origins.map(o => weights?.[o] ?? 1);
  const familyOrigin = preset ? preset.familyOrigin : weightedPick(origins, originWeights, rng);

  const eduOptions = EDUCATION_BY_ORIGIN[familyOrigin];
  const education = preset ? preset.education : eduOptions[Math.floor(rng() * eduOptions.length)];
  const socialClass = SOCIAL_BY_ORIGIN[familyOrigin];
  const careerOptions = CAREERS_BY_ORIGIN[familyOrigin];
  const career = preset ? preset.career : careerOptions[Math.floor(rng() * careerOptions.length)];
  const hometown = preset ? preset.hometown : ALL_PREFECTURES[Math.floor(rng() * ALL_PREFECTURES.length)];
  const connections: string[] = [];
  const connCount = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < connCount; i++) {
    connections.push(ALL_PREFECTURES[Math.floor(rng() * ALL_PREFECTURES.length)] + '政界');
  }

  return {
    familyOrigin,
    education,
    career,
    socialClass,
    hometown,
    connections,
    modifiers: BACKGROUND_MODIFIERS[familyOrigin],
  };
}

/** 计算背景修正值 */
export function calculateModifiers(background: MPBackground): BackgroundModifiers {
  return BACKGROUND_MODIFIERS[background.familyOrigin];
}

/** 将背景修正应用到人格数据 */
export function applyBackgroundToPersonality<T extends { popularity: number; mediaSkill: number; corruption: number; negotiationSkill: number }>(
  personality: T,
  background: MPBackground,
): T {
  const m = background.modifiers;
  return {
    ...personality,
    popularity: Math.max(0, Math.min(100, personality.popularity + m.populistAppealBonus * 0.3)),
    mediaSkill: Math.max(0, Math.min(100, personality.mediaSkill + m.mediaAttentionBonus * 0.5)),
    corruption: Math.max(0, Math.min(100, personality.corruption + m.scandalRiskModifier * 0.2)),
    negotiationSkill: Math.max(0, Math.min(100, personality.negotiationSkill + m.recommendationBonus * 0.3)),
  };
}

/** 获取背景的叙事描述（供LLM提示词使用） */
export function getBackgroundNarrative(background: MPBackground): string {
  const { originLabels, eduLabels } = BACKGROUND_METADATA;
  return `${originLabels[background.familyOrigin]}，${eduLabels[background.education]}，前职业: ${background.career}，来自${background.hometown}`;
}
