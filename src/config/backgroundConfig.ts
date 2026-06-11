/**
 * 角色背景生成配置
 *
 * 包含出身修正值、教育/职业/社会阶层映射、各党派出身权重等。
 * 所有数值均可根据剧情推进调整。
 */

import type { FamilyOrigin, Education, SocialClass, BackgroundModifiers } from '../types/background';

// ===== 职业映射（按出身类型） =====

export const CAREERS_BY_ORIGIN: Record<FamilyOrigin, string[]> = {
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

// ===== 教育映射（按出身类型） =====

export const EDUCATION_BY_ORIGIN: Record<FamilyOrigin, Education[]> = {
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

// ===== 社会阶层映射（按出身类型） =====

export const SOCIAL_BY_ORIGIN: Record<FamilyOrigin, SocialClass> = {
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

// ===== 出身修正值（游戏平衡核心数据） =====

export const BACKGROUND_MODIFIERS: Record<FamilyOrigin, BackgroundModifiers> = {
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

// ===== 各党派出身权重 =====

export const ORIGIN_WEIGHTS_BY_PARTY: Record<string, Record<FamilyOrigin, number>> = {
  reform: { political_family: 3, bureaucrat_family: 3, business_family: 2, lawyer: 2, professor: 2, salaryman: 2, journalist: 1, grassroots_activist: 1, union_cadre: 0, other: 1 },
  justice: { political_family: 2, bureaucrat_family: 2, business_family: 1, lawyer: 2, professor: 3, salaryman: 2, journalist: 1, grassroots_activist: 2, union_cadre: 0, other: 1 },
  liberty: { political_family: 3, business_family: 4, bureaucrat_family: 2, lawyer: 2, salaryman: 2, professor: 1, journalist: 1, grassroots_activist: 0, union_cadre: 0, other: 1 },
  renewal: { political_family: 2, business_family: 2, lawyer: 2, journalist: 3, professor: 1, salaryman: 2, grassroots_activist: 1, bureaucrat_family: 1, union_cadre: 0, other: 2 },
  peoples: { political_family: 1, grassroots_activist: 4, union_cadre: 3, salaryman: 2, journalist: 1, professor: 1, lawyer: 0, business_family: 0, bureaucrat_family: 0, other: 2 },
  solidarity: { union_cadre: 5, grassroots_activist: 3, salaryman: 3, political_family: 0, bureaucrat_family: 0, business_family: 0, lawyer: 0, professor: 0, journalist: 0, other: 1 },
};

// ===== 背景叙事标签 =====

export const BACKGROUND_METADATA = {
  originLabels: {
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
  } as Record<string, string>,
  eduLabels: {
    top_university: '毕业于东京大学级别名校',
    private_elite: '毕业于早稻田/庆应级别名校',
    national_university: '国立大学毕业',
    regional_university: '地方大学毕业',
    other: '其他学历',
  } as Record<string, string>,
};

// ===== 出身基础能力修正（用于角色初始生成） =====

export const ORIGIN_ABILITY_MODIFIERS: Record<FamilyOrigin, {
  ambition: number;
  loyalty: number;
  corruption: number;
  popularity: number;
  funds?: number;
}> = {
  political_family: { ambition: 8, loyalty: 5, corruption: 2, popularity: 10 },
  bureaucrat_family: { ambition: 5, loyalty: 8, corruption: 3, popularity: 5 },
  business_family: { ambition: 7, loyalty: 3, corruption: 5, popularity: 8, funds: 100 },
  union_cadre: { ambition: 6, loyalty: 6, corruption: 1, popularity: 7 },
  lawyer: { ambition: 5, loyalty: 4, corruption: 1, popularity: 6 },
  professor: { ambition: 4, loyalty: 5, corruption: 0, popularity: 5 },
  journalist: { ambition: 6, loyalty: 3, corruption: 1, popularity: 8 },
  grassroots_activist: { ambition: 5, loyalty: 7, corruption: 0, popularity: 6 },
  salaryman: { ambition: 3, loyalty: 6, corruption: 0, popularity: 4 },
  other: { ambition: 2, loyalty: 4, corruption: 0, popularity: 3 },
};

/** 学历对能力的修正 */
export const EDUCATION_ABILITY_MODIFIERS: Record<Education, {
  ambition: number;
  mediaSkill: number;
  negotiationSkill: number;
}> = {
  top_university: { ambition: 3, mediaSkill: 5, negotiationSkill: 4 },
  private_elite: { ambition: 2, mediaSkill: 3, negotiationSkill: 5 },
  national_university: { ambition: 1, mediaSkill: 2, negotiationSkill: 2 },
  regional_university: { ambition: 0, mediaSkill: 1, negotiationSkill: 1 },
  other: { ambition: 0, mediaSkill: 0, negotiationSkill: 0 },
};

// ===== 议员连接数配置 =====

export const CONNECTION_CONFIG = {
  /** 最少连接数 */
  minConnections: 1,
  /** 最多连接数 */
  maxConnections: 4,
  /** 各出身增加连接的概率 */
  connectionBonus: {
    political_family: 0.8,
    bureaucrat_family: 0.7,
    business_family: 0.9,
    professor: 0.6,
    journalist: 0.7,
  },
} as const;

// ===== 能力值生成范围 =====

export const ABILITY_RANGES = {
  ambition: { min: 20, max: 95 },
  loyalty: { min: 10, max: 95 },
  corruption: { min: 0, max: 80 },
  popularity: { min: 5, max: 90 },
  mediaSkill: { min: 10, max: 95 },
  negotiationSkill: { min: 10, max: 95 },
} as const;

// ===== 年龄配置 =====

export const AGE_CONFIG = {
  /** 后排议员最小年龄 */
  backbencherMin: 25,
  /** 后排议员最大年龄 */
  backbencherMax: 75,
  /** 党首年龄范围 */
  leaderMin: 40,
  leaderMax: 70,
  /** 大臣年龄范围 */
  ministerMin: 38,
  ministerMax: 68,
  /** 委员长年龄范围 */
  chairmanMin: 35,
  chairmanMax: 70,
  /** 年龄老化效果 */
  agingEffect: {
    /** 老化开始年龄 */
    threshold: 75,
    /** 老化加速年龄 */
    severeThreshold: 80,
    /** 每回合健康损失（75岁以上） */
    healthLossPerTurn: 1,
    /** 每回合健康损失（80岁以上） */
    healthLossPerTurnSevere: 3,
  },
} as const;
