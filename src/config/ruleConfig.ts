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

// ===== 游戏起始时间 =====

/** 游戏起始时间配置（回合1对应的年月） */
export const GAME_START_TIME = {
  /** 起始年份 */
  startYear: 2058,
  /** 起始月份（回合1 = 1月，对应国会预算决战期起始） */
  startMonth: 1,
} as const;

// ===== 国会年度会期规则（按月份分段） =====

/** 国会年度会期规则条目 */
export interface CongressSessionRule {
  /** 会期名称 */
  name: string;
  /** 月份范围（闭区间 [起始月, 结束月]） */
  months: [number, number];
  /** 国会状态 */
  status: string;
  /** 核心玩法与 AI 涌现倾向 */
  gameplay: string;
}

/**
 * 国会年度会期规则
 *
 * 来源：rules.txt「回合段-国会状态-核心玩法」表
 * 游戏起始月份为 1 月，1 回合 = 1 个月，会期决定该月的核心玩法和 AI 涌现倾向。
 */
export const CONGRESS_SESSION_RULES: readonly CongressSessionRule[] = [
  {
    name: '预算决战期',
    months: [1, 3],
    status: '通常国会',
    gameplay:
      '必须在这 3 回合内强行通过"新年度财政预算案"。在野党会在【预算委员会】揪住首相丑闻不放以拖延时间。若 3 月底前预算未通过，经济景气指数将雪崩式下跌。',
  },
  {
    name: '法案攻坚期',
    months: [4, 6],
    status: '通常国会',
    gameplay:
      '预算通过后开始审议各种普通法案。在野党若认为局势有利，会在 5-6 月会期结束前集结所有力量发起"内阁不信任动议（倒阁）"。',
  },
  {
    name: '地方基本盘维护期',
    months: [7, 9],
    status: '国会闭会',
    gameplay:
      '国会放假。玩家与 NPC 议员回到选区修选区、拉赞助。这是通过媒体拉拢中间选民、或暗中搜集政敌黑料的黄金时期。',
  },
  {
    name: '临时国会期',
    months: [10, 12],
    status: '临时国会',
    gameplay:
      '内阁根据下半年突发事件（天灾、国际局势危机等）决定是否召开。会期较短，AI 倾向在此期间生成追加预算案或突发政治丑闻事件。',
  },
] as const;

/**
 * 根据月份（1-12）获取当前所处的国会会期规则
 *
 * 跨年时（如 12 月→1 月）自动回绕，因为会期表覆盖完整自然年。
 */
export function getCongressSessionByMonth(month: number): CongressSessionRule {
  const m = ((month - 1) % 12 + 12) % 12 + 1; // 规范化到 1-12
  return (
    CONGRESS_SESSION_RULES.find(s => m >= s.months[0] && m <= s.months[1])
    ?? CONGRESS_SESSION_RULES[0]
  );
}

/** 根据回合数计算月份（1-12） */
export function getMonthFromTurn(turn: number): number {
  const { startMonth } = GAME_START_TIME;
  const totalMonths = startMonth - 1 + (turn - 1);
  return (totalMonths % 12) + 1;
}

/** 根据回合数计算年份 */
export function getYearFromTurn(turn: number): number {
  const { startYear, startMonth } = GAME_START_TIME;
  const totalMonths = startMonth - 1 + (turn - 1);
  return startYear + Math.floor(totalMonths / 12);
}
