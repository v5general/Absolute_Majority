/**
 * 游戏平衡配置
 * 所有影响游戏平衡的数值都应提取到这里
 * 便于根据剧情推进进行调整
 */

/** 事件影响值的平衡配置 */
export const EVENT_BALANCE = {
  /** 支持率变化的合理范围 */
  supportDelta: {
    min: -5,
    max: 5,
    significant: 3,  // 超过此值视为重大影响
  },
  /** 关系变化的合理范围 */
  relationDelta: {
    min: -30,
    max: 30,
    significant: 15,  // 超过此值视为重大关系变化
  },
  /** 资金变化的合理范围 */
  fundsDelta: {
    min: -500,
    max: 500,
    significant: 200,  // 超过此值视为重大资金变化
  },
  /** 指标变化的合理范围 */
  metricsDelta: {
    min: -15,
    max: 15,
    significant: 8,  // 超过此值视为重大指标变化
  },
  /** 媒体关注度的最大值 */
  mediaAttention: {
    min: 0,
    max: 100,
  },
} as const;

/** 根据事件严重程度调整影响上限 */
export function getSeverityMultiplier(severity: number): number {
  switch (severity) {
    case 1: return 0.5;
    case 2: return 0.8;
    case 3: return 1.0;
    case 4: return 1.5;
    case 5: return 2.0;
    default: return 1.0;
  }
}

// ============================================================================
// Phase G Q4 — 委员长细分权重 + 预算委员会倍率
// ============================================================================

/**
 * 委员长在不同审议动作下的额外权重（叠加到基础 1.0 之上）。
 *
 * Phase G 决策：废除原硬编码的 1.5× 统一倍率，按动作类型细分：
 *   - 推进法案（push）：+30%
 *   - 搁置法案（shelve）：+50%
 *   - 修正法案（amend）：+20%
 *
 * 搁置权重最高，反映委员长在阻挠议程上的不对称权力。
 */
export const COMMITTEE_CHAIRMAN_BONUSES = {
  pushForward: 0.3,
  shelve: 0.5,
  amendment: 0.2,
} as const;

/** 委员长审议动作类型 */
export type ChairmanVoteContext = 'push' | 'shelve' | 'amend';

/**
 * 预算委员会 + 1-3 月预算决战期 的双重触发倍率。
 *
 * Phase G Q4：必须同时满足
 *   1. 当前月份 ∈ [1, 3]（预算决战期会期）
 *   2. 委员会为 `budget`
 * 才应用此倍率。任一条件不满足都不应用。
 */
export const BUDGET_COMMITTEE_MULTIPLIERS = {
  supportVolatility: 1.5,   // 支持率波动放大
  scandalExposure: 1.5,     // 丑闻曝光概率放大
  mediaInfluence: 1.5,      // 媒体影响放大
  debateVisibility: 1.5,    // 辩论可见度放大
} as const;

/**
 * 竞选期间倍率应用开关。
 *
 * Phase G content-audit PARTIAL：原代码定义了 campaignMediaMultiplier=2.0 /
 * campaignVolatilityMultiplier=1.5 但从未在 settleIntent 中应用。
 * 设为 true 后，applyCampaignMultipliers 会在 settleIntent 入口对
 * supportDelta ×1.5、metricsDelta.mediaAttention ×2.0。
 */
export const CAMPAIGN_MULTIPLIERS_APPLIED_AT_SETTLEMENT = true;

// ============================================================================
// Phase G 第十章 — 党首选举 & 晋升运行时触发阈值
// ============================================================================

/** 党首选举 5 触发条件的量化阈值（Phase G 第七章） */
export const LEADERSHIP_ELECTION_TRIGGERS = {
  /** 重大丑闻阈值：media_scandal 后支持率跌破此值 */
  scandalSupportThreshold: 20,
  /** 大选惨败：选后席位 < 选举前席位的此比例 */
  electionDefeatRatio: 0.5,
  /** 连续低支持率阈值 */
  consecutiveLowSupportThreshold: 25,
  /** 连续低支持率持续回合计数 */
  consecutiveLowSupportTurns: 6,
} as const;

/** 党内 / 国会晋升阈值（Phase G 第十章） */
export const PROMOTION_THRESHOLDS = {
  party: {
    loyalty: 70,        // loyalty > 70
    capital: 30,        // politicalCapital > 30
    partyAgeTurns: 6,   // 党龄 > 6 回合
  },
  parliament: {
    seniorityTurns: 8,        // 资历 > 8 回合
    committeePerformance: 60, // 委员会成绩 > 60
  },
} as const;

// ============================================================================
// Phase G Q7 — Funds faucet/sink 平衡配置
// ============================================================================

/**
 * 每回合资金 faucet/sink 平衡型配置（净 ±0）。
 *
 * Faucet：办公津贴 +30、委员会津贴 +20、派阀贡献 +10 = +60
 * Sink：办公费 -30、员工薪资 -20、活动基金 -10 = -60
 *
 * 增长靠玩家主动行为：
 *   - 募款活动 +50（消耗 1 行动点）
 *   - 利益集团捐款事件 +100~300
 */
export const FUNDS_FAUCET_SINK = {
  officeAllowance: 30,         // 每回合办公津贴（+）
  committeeAllowance: 20,      // 委员会津贴（+）
  factionContribution: 10,     // 派阀贡献（+，仅派阀成员）
  officeCost: -30,             // 办公费（-）
  staffSalary: -20,            // 员工薪资（-）
  activityFund: -10,           // 活动基金（-）
  fundraisingActionGain: 50,   // 玩家主动募款行动 +
  donationEventRange: [100, 300] as const, // 利益集团捐款事件区间
} as const;

// ============================================================================
// Phase G balance-check — NPC 关系网密度平衡
// ============================================================================

/**
 * NPC 关系网密度限制（防"刷关系"）。
 *
 * - strongRelationsPerMP：每议员最多 N 条"强关系"（score > 60），超出后
 *   新关系上限被钳制为 60。
 * - decayTurnsThreshold：N 回合无互动后开始衰减。
 * - decayPerTurn：每回合衰减量。
 * - grindDiminishingFactor：连续 3 回合对同一 NPC 送礼，第 3 回合效果
 *   乘以此因子（0.5 = 减半）。
 */
export const RELATION_CAP = {
  strongRelationsPerMP: 4,
  strongRelationScoreThreshold: 60,
  decayTurnsThreshold: 5,
  decayPerTurn: 1,
  grindTurnsThreshold: 3,
  grindDiminishingFactor: 0.5,
} as const;

// ============================================================================
// Phase G Q3 — 政治资本（Political Capital）规则
// ============================================================================

/**
 * 政治资本变化规则。
 *
 * 范围 0-100，初始 30，每回合自动变化上限 ±15。
 *
 * Faucet（自动获得）：
 *   - 法案通过 +5、成功质询 +3、媒体正面 +2、委员会成绩 +2、派阀支持 +1
 *
 * Sink（自动消耗）：
 *   - 争议法案 -10、组阁/改组 -20、派系协调 -5、提前解散 -15、修宪 -25
 *
 * 不足 20 时所有政治行动成功率 ×0.7。
 */
export const POLITICAL_CAPITAL_RULES = {
  initialValue: 30,
  minValue: 0,
  maxValue: 100,
  perTurnChangeCap: 15,
  lowCapitalThreshold: 20,
  lowCapitalSuccessMultiplier: 0.7,

  // Faucet
  billPassed: 5,
  successfulQuestioning: 3,
  positiveMedia: 2,
  committeePerformance: 2,
  factionBacking: 1,

  // Sink
  controversialBill: -10,
  cabinetFormation: -20,
  factionCoordination: -5,
  earlyDissolution: -15,
  constitutionalAmendment: -25,

  // 出身背景修正
  backgroundBonus: {
    political_dynasty: 10,   // 政治世家 +10
    union_cadre: 5,          // 工会干部 +5
    grassroots: 8,           // 基层 +8
  },
} as const;
