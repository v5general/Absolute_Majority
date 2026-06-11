import type { MPBackground, FamilyOrigin, Education, SocialClass, BackgroundModifiers } from '../types/background';
import type { Party } from '../types/game';

const HOMETOWNS = [
  '东京', '大阪', '北海道', '神奈川', '爱知', '福冈', '冲绳',
  '京都', '兵库', '广岛', '宫城', '静冈', '长野', '茨城',
];

const CAREERS_BY_ORIGIN: Record<FamilyOrigin, string[]> = {
  political_family: ['国会议员秘书', '地方议会议员', '党务工作者'],
  bureaucrat_family: ['中央省厅官僚', '外交官', '自治体干部'],
  business_family: ['商社董事', '制造企业CEO', '金融业高管'],
  union_cadre: ['工会组织者', '劳动组合委员', '产业工会干部'],
  lawyer: ['律师事务所合伙人', '检察官', '法务顾问'],
  professor: ['大学副教授', '智库研究员', '政策学者'],
  journalist: ['政治记者', '新闻主播', '编辑委员'],
  grassroots_activist: ['市民运动组织者', 'NPO代表', '社区领袖'],
  salaryman: ['商社营业部长', 'IT企业项目经理', '银行支店长'],
  other: ['自卫队退役', '医生', '农业经营者'],
};

const EDUCATION_BY_ORIGIN: Record<FamilyOrigin, Education[]> = {
  political_family: ['top_university', 'private_elite', 'top_university'],
  bureaucrat_family: ['top_university', 'top_university', 'private_elite'],
  business_family: ['private_elite', 'top_university', 'national_university'],
  union_cadre: ['national_university', 'regional_university', 'national_university'],
  lawyer: ['top_university', 'private_elite', 'top_university'],
  professor: ['top_university', 'top_university', 'national_university'],
  journalist: ['private_elite', 'top_university', 'national_university'],
  grassroots_activist: ['regional_university', 'national_university', 'other'],
  salaryman: ['national_university', 'regional_university', 'private_elite'],
  other: ['regional_university', 'national_university', 'other'],
};

const SOCIAL_BY_ORIGIN: Record<FamilyOrigin, SocialClass> = {
  political_family: 'upper',
  bureaucrat_family: 'upper_middle',
  business_family: 'upper',
  union_cadre: 'working',
  lawyer: 'upper_middle',
  professor: 'middle',
  journalist: 'middle',
  grassroots_activist: 'lower_middle',
  salaryman: 'middle',
  other: 'middle',
};

const MODIFIERS_BY_ORIGIN: Record<FamilyOrigin, BackgroundModifiers> = {
  political_family: {
    factionAcceptanceBonus: 15,
    recommendationBonus: 15,
    mediaAttentionBonus: 10,
    fundraisingBonus: 12,
    scandalRiskModifier: 12,
    populistAppealBonus: -8,
    grassrootsSupportBonus: -10,
    factionBuildingSpeed: 1.5,
  },
  bureaucrat_family: {
    factionAcceptanceBonus: 8,
    recommendationBonus: 10,
    mediaAttentionBonus: 5,
    fundraisingBonus: 5,
    scandalRiskModifier: 3,
    populistAppealBonus: -3,
    grassrootsSupportBonus: -5,
    factionBuildingSpeed: 1.2,
  },
  business_family: {
    factionAcceptanceBonus: 5,
    recommendationBonus: 5,
    mediaAttentionBonus: 8,
    fundraisingBonus: 18,
    scandalRiskModifier: 8,
    populistAppealBonus: -10,
    grassrootsSupportBonus: -12,
    factionBuildingSpeed: 1.3,
  },
  union_cadre: {
    factionAcceptanceBonus: 10,
    recommendationBonus: 5,
    mediaAttentionBonus: 3,
    fundraisingBonus: -5,
    scandalRiskModifier: -5,
    populistAppealBonus: 10,
    grassrootsSupportBonus: 12,
    factionBuildingSpeed: 0.8,
  },
  lawyer: {
    factionAcceptanceBonus: 3,
    recommendationBonus: 8,
    mediaAttentionBonus: 5,
    fundraisingBonus: 5,
    scandalRiskModifier: 0,
    populistAppealBonus: 0,
    grassrootsSupportBonus: 0,
    factionBuildingSpeed: 1.0,
  },
  professor: {
    factionAcceptanceBonus: 0,
    recommendationBonus: 10,
    mediaAttentionBonus: 8,
    fundraisingBonus: -3,
    scandalRiskModifier: -3,
    populistAppealBonus: 5,
    grassrootsSupportBonus: 3,
    factionBuildingSpeed: 0.7,
  },
  journalist: {
    factionAcceptanceBonus: 0,
    recommendationBonus: 3,
    mediaAttentionBonus: 15,
    fundraisingBonus: 0,
    scandalRiskModifier: -2,
    populistAppealBonus: 8,
    grassrootsSupportBonus: 5,
    factionBuildingSpeed: 0.8,
  },
  grassroots_activist: {
    factionAcceptanceBonus: -5,
    recommendationBonus: -8,
    mediaAttentionBonus: 3,
    fundraisingBonus: -12,
    scandalRiskModifier: -8,
    populistAppealBonus: 15,
    grassrootsSupportBonus: 18,
    factionBuildingSpeed: 0.6,
  },
  salaryman: {
    factionAcceptanceBonus: -3,
    recommendationBonus: -5,
    mediaAttentionBonus: -5,
    fundraisingBonus: -8,
    scandalRiskModifier: -5,
    populistAppealBonus: 10,
    grassrootsSupportBonus: 8,
    factionBuildingSpeed: 0.5,
  },
  other: {
    factionAcceptanceBonus: 0,
    recommendationBonus: 0,
    mediaAttentionBonus: 0,
    fundraisingBonus: 0,
    scandalRiskModifier: 0,
    populistAppealBonus: 0,
    grassrootsSupportBonus: 0,
    factionBuildingSpeed: 1.0,
  },
};

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

/** 党派权重分配的出身比例 */
const ORIGIN_WEIGHTS_BY_PARTY_ID: Record<string, Record<FamilyOrigin, number>> = {
  reform: { political_family: 3, bureaucrat_family: 3, business_family: 2, lawyer: 2, professor: 2, salaryman: 2, journalist: 1, grassroots_activist: 1, union_cadre: 0, other: 1 },
  justice: { political_family: 2, bureaucrat_family: 2, business_family: 1, lawyer: 2, professor: 3, salaryman: 2, journalist: 1, grassroots_activist: 2, union_cadre: 0, other: 1 },
  liberty: { political_family: 3, business_family: 4, bureaucrat_family: 2, lawyer: 2, salaryman: 2, professor: 1, journalist: 1, grassroots_activist: 0, union_cadre: 0, other: 1 },
  renewal: { political_family: 2, business_family: 2, lawyer: 2, journalist: 3, professor: 1, salaryman: 2, grassroots_activist: 1, bureaucrat_family: 1, union_cadre: 0, other: 2 },
  peoples: { political_family: 1, grassroots_activist: 4, union_cadre: 3, salaryman: 2, journalist: 1, professor: 1, lawyer: 0, business_family: 0, bureaucrat_family: 0, other: 2 },
  solidarity: { union_cadre: 5, grassroots_activist: 3, salaryman: 3, political_family: 0, bureaucrat_family: 0, business_family: 0, lawyer: 0, professor: 0, journalist: 0, other: 1 },
};

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
  const rng = seededRandom(personName + partyId);
  const origins: FamilyOrigin[] = ['political_family', 'bureaucrat_family', 'business_family', 'union_cadre', 'lawyer', 'professor', 'journalist', 'grassroots_activist', 'salaryman', 'other'];
  const weights = ORIGIN_WEIGHTS_BY_PARTY_ID[partyId];
  const originWeights = origins.map(o => weights?.[o] ?? 1);
  const familyOrigin = weightedPick(origins, originWeights, rng);

  const eduOptions = EDUCATION_BY_ORIGIN[familyOrigin];
  const education = eduOptions[Math.floor(rng() * eduOptions.length)];
  const socialClass = SOCIAL_BY_ORIGIN[familyOrigin];
  const careerOptions = CAREERS_BY_ORIGIN[familyOrigin];
  const career = careerOptions[Math.floor(rng() * careerOptions.length)];
  const hometown = HOMETOWNS[Math.floor(rng() * HOMETOWNS.length)];
  const connections: string[] = [];
  const connCount = 1 + Math.floor(rng() * 3);
  for (let i = 0; i < connCount; i++) {
    connections.push(HOMETOWNS[Math.floor(rng() * HOMETOWNS.length)] + '政界');
  }

  return {
    familyOrigin,
    education,
    career,
    socialClass,
    hometown,
    connections,
    modifiers: MODIFIERS_BY_ORIGIN[familyOrigin],
  };
}

/** 计算背景修正值 */
export function calculateModifiers(background: MPBackground): BackgroundModifiers {
  return MODIFIERS_BY_ORIGIN[background.familyOrigin];
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
  const originLabels: Record<string, string> = {
    political_family: '政治世家出身',
    bureaucrat_family: '官僚世家出身',
    business_family: '企业家家族出身',
    union_cadre: '工会干部出身',
    lawyer: '律师出身',
    professor: '学者出身',
    journalist: '记者出身',
    grassroots_activist: '基层活动家出身',
    salaryman: '普通上班族出身',
    other: '其他背景',
  };
  const eduLabels: Record<string, string> = {
    top_university: '毕业于顶尖国立大学',
    private_elite: '毕业于知名私立大学',
    national_university: '国立大学毕业',
    regional_university: '地方大学毕业',
    other: '其他学历',
  };
  return `${originLabels[background.familyOrigin]}，${eduLabels[background.education]}，前职业: ${background.career}，来自${background.hometown}`;
}
