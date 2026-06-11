/**
 * 选举规则配置
 * 所有选举相关的参数都应提取到这里
 * 与 districtConfig.ts 的 11 比例代表区块保持一致
 */

import { TOTAL_NPC_SEATS } from './districtConfig';

/** 选举系统参数 */
export const ELECTION_CONFIG = {
  /** NPC 席位数（由 11 比例代表区块席位合计得出） */
  get constituencySeats(): number {
    return TOTAL_NPC_SEATS;
  },
  /** 比例代表席位数（已整合进区块，保留兼容字段 = 0） */
  proportionalSeats: 0,
  /** 总席位数（NPC + 1 玩家） */
  get totalSeats(): number {
    return TOTAL_NPC_SEATS + 1;
  },
  /** 过半门槛 */
  get majorityThreshold(): number {
    return Math.floor(this.totalSeats / 2) + 1;
  },
  /** 三分之二门槛（修宪提案） */
  get superMajorityThreshold(): number {
    return Math.ceil(this.totalSeats * 2 / 3);
  },

  /** 竞选期间媒体倍率 */
  campaignMediaMultiplier: 2.0,
  /** 竞选期间波动倍率 */
  campaignVolatilityMultiplier: 1.5,

  /** 选举计算权重 */
  electionWeights: {
    partySupport: 0.4,       // 政党支持率权重
    candidateScore: 0.3,     // 候选人个人支持率权重
    districtLeaning: 0.2,    // 选区倾向权重
    randomFactor: 0.1,       // 随机因子权重
  },

  /** 候选人曝光度提升（竞选期间） */
  campaignExposureBoost: 0.5,

  /** 竞选行动的影响范围 */
  campaignActions: {
    speech: {
      supportMin: -2,
      supportMax: 3,
      mediaMin: 1,
      mediaMax: 5,
    },
    interview: {
      supportMin: -1,
      supportMax: 2,
      mediaMin: 2,
      mediaMax: 4,
    },
    scandal: {
      supportMin: -5,
      supportMax: -1,
      mediaMin: 3,
      mediaMax: 8,
    },
  },

  /** 确定性随机种子 */
  electionSeed: 20258,
} as const;

/** 投票率和摇摆选民比例 */
export const VOTER_CONFIG = {
  /** 总选民数 */
  totalVoters: 98_500_000,
  /** 基础投票率（%） */
  baseTurnoutRate: 67.5,
  /** 摇摆选民比例（%） */
  swingVoterRatio: 18.2,
  /** 投票率波动范围（%） */
  turnoutVolatility: 15,
} as const;
