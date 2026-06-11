/** 出身背景 */
export type FamilyOrigin =
  | 'political_family'    // 政治世家
  | 'bureaucrat_family'   // 官僚世家
  | 'business_family'     // 企业家家族
  | 'union_cadre'         // 工会干部
  | 'lawyer'              // 律师
  | 'professor'           // 教授
  | 'journalist'          // 记者
  | 'grassroots_activist' // 基层活动家
  | 'salaryman'           // 普通上班族
  | 'other';              // 其他

/** 学历 */
export type Education =
  | 'top_university'      // 东京大学/京都大学级别
  | 'private_elite'       // 早稻田/庆应级别
  | 'national_university' // 国立大学
  | 'regional_university' // 地方大学
  | 'other';

/** 社会阶层 */
export type SocialClass =
  | 'upper'         // 上层
  | 'upper_middle'  // 中上
  | 'middle'        // 中间
  | 'lower_middle'  // 中下
  | 'working';      // 工人阶级

/** 背景修正值 */
export interface BackgroundModifiers {
  /** 派系接纳度加成: -20 ~ +20 */
  factionAcceptanceBonus: number;
  /** 推荐人获取加成: -20 ~ +20 */
  recommendationBonus: number;
  /** 媒体关注度加成: -20 ~ +20 */
  mediaAttentionBonus: number;
  /** 募款效率加成: -20 ~ +20 */
  fundraisingBonus: number;
  /** 丑闻风险修正: -20 ~ +20 (正=更易丑闻) */
  scandalRiskModifier: number;
  /** 亲民形象加成: -20 ~ +20 */
  populistAppealBonus: number;
  /** 基层支持率加成: -20 ~ +20 */
  grassrootsSupportBonus: number;
  /** 建派系速度: 0.5 ~ 2.0 (倍率) */
  factionBuildingSpeed: number;
}

/** 议员背景档案 */
export interface MPBackground {
  familyOrigin: FamilyOrigin;
  education: Education;
  /** 前职业(自由文本) */
  career: string;
  socialClass: SocialClass;
  hometown: string;
  connections: string[];
  /** 预计算的修正值 */
  modifiers: BackgroundModifiers;
}
