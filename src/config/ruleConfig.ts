/**
 * 游戏规则配置
 * 议会程序、表决门槛等规则参数
 */

/** 议会程序规则 */
export const PARLIAMENT_RULES = {
  /** 不信任案联署门槛（议员人数） */
  noConfidenceThreshold: 20,
  /** 委员会法定人数比例 */
  quorumRatio: 0.5,
  /** 宪法绝对多数门槛（席位数） */
  constitutionalMajorityThreshold: 134,

  /** 委员会审查时限（回合） */
  committeeReviewDeadline: 8,
  /** 法案决策链每步时限（回合） */
  decisionChainStepDeadline: 6,

  /** 表决门槛 */
  votingThresholds: {
    /** 委员会表决：过半数 */
    committee: 'majority',
    /** 全院普通法案：过半数 */
    fullHouse: 'majority',
    /** 不信任案：全体议员过半 */
    noConfidence: 'majority_absolute',
    /** 修宪法案：三分之二 */
    constitutional: 'supermajority',
  },
} as const;

/** 数值限制范围 */
export const VALUE_LIMITS = {
  /** 支持率范围 */
  support: { min: 0, max: 100 },
  /** 关系值范围 */
  relation: { min: -100, max: 100 },
  /** 资金范围（最小值0） */
  funds: { min: 0, max: 10000 },
  /** 压力指数范围 */
  stress: { min: 0, max: 100 },
  /** 健康指数范围 */
  health: { min: 0, max: 100 },
  /** 野心范围 */
  ambition: { min: 0, max: 100 },
  /** 忠诚度范围 */
  loyalty: { min: 0, max: 100 },
  /** 腐败倾向范围 */
  corruption: { min: 0, max: 100 },
  /** 知名度范围 */
  popularity: { min: 0, max: 100 },
  /** 媒体技巧范围 */
  mediaSkill: { min: 0, max: 100 },
  /** 谈判技巧范围 */
  negotiationSkill: { min: 0, max: 100 },
} as const;

/** 关系类型判断阈值 */
export const RELATION_THRESHOLDS = {
  alliance: 60,
  friendly: 20,
  neutral_low: -20,
  neutral_high: 20,
  tense: -50,
  hostile: -100,
} as const;

/** 内阁稳定性判断阈值 */
export const CABINET_STABILITY = {
  /** 稳定 */
  stable: 70,
  /** 不稳定 */
  unstable: 40,
  /** 危机 */
  crisis: 20,
} as const;

/** 派阀忠诚度判断阈值 */
export const FACTION_LOYALTY = {
  /** 坚定支持 */
  solid: 70,
  /** 观望 */
  waver: 40,
  /** 可能逼宫 */
  challenge: 20,
  /** 可能脱党 */
  defect: 10,
} as const;
