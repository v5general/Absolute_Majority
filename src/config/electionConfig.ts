/**
 * 选举规则配置
 *
 * Phase G Q1 决策：并行制 110 直接 + 90 全国比例代表 = 200 席
 *   - 直接层：11 大选区 × 10 直接席 = 110
 *   - 比例层：全国单一选区 D'Hondt（5% 阈值）= 90
 *
 * 与 districtConfig.ts 的 11 比例代表区块保持一致。
 */

import { TOTAL_NPC_SEATS } from './districtConfig';

/** 每个大选区（区块）分配的直接席位数 */
export const DIRECT_SEATS_PER_BLOCK = 10;

/** 全国比例代表层总席位数 */
export const PROPORTIONAL_SEATS_TOTAL = 90;

/** 进入全国比例代表分配的政党门槛（得票率） */
export const PROPORTIONAL_THRESHOLD_PERCENT = 5;

/** 选举系统参数 */
export const ELECTION_CONFIG = {
  /**
   * 直接席总 数 = 11 区块 × DIRECT_SEATS_PER_BLOCK
   * 与 districtConfig 的 PROPORTIONAL_BLOCKS 共同定义选举层结构。
   */
  get directSeatsTotal(): number {
    return DIRECT_SEATS_PER_BLOCK * 11;
  },
  /** NPC 席位数（兼容旧字段：= directSeatsTotal + proportionalSeatsTotal - 1 玩家席） */
  get constituencySeats(): number {
    return TOTAL_NPC_SEATS;
  },
  /**
   * 全国比例代表总席位数。
   *
   * Phase G Q1：语义已改变 — 不再是 0（已整合进区块），
   * 而是 90 席的全国比例代表层。
   */
  proportionalSeats: PROPORTIONAL_SEATS_TOTAL,
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

