import type { Party, District, ElectionResult, PartyElectionResult, GameState } from '../types';
import type { MPPersonality } from '../types/mp';
import {
  ELECTION_CONFIG,
  DIRECT_SEATS_PER_BLOCK,
  PROPORTIONAL_SEATS_TOTAL,
  PROPORTIONAL_THRESHOLD_PERCENT,
} from '../config/electionConfig';

/**
 * 选举引擎（Phase G Q1：并行制 110 直接 + N 全国比例代表 = 总席位）
 *
 * 直接层（110 席 = 11 大选区 × 10 直接席）：
 *   - 每块内使用 D'Hondt 按 supportByParty 比例分配 10 席
 *
 * 比例层（可配置席位数 = totalSeats − 110）：
 *   - 全国政党票 = Σ(voterCount[block] × supportByParty[block][party]) for each block
 *   - 5% 阈值过滤
 *   - D'Hondt 法在合格政党之间分配
 *
 * 合并：
 *   partyResults.seats = 直接席 + 比例席
 *   electionResult.nationalProportionalResults = { partyId: 比例席数 }
 */

/** 直接席总席位数（11 × 10 = 110） */
export const CONSTITUENCY_SEATS = DIRECT_SEATS_PER_BLOCK * 11;
/** 全国比例代表席位数（90） */
export const PROPORTIONAL_SEATS = PROPORTIONAL_SEATS_TOTAL;

/** 选举竞选期间倍率 — 从配置派生 */
export const CAMPAIGN_MEDIA_MULTIPLIER = ELECTION_CONFIG.campaignMediaMultiplier;
export const CAMPAIGN_VOLATILITY_MULTIPLIER = ELECTION_CONFIG.campaignVolatilityMultiplier;

/** 竞选行动类型 */
export type CampaignAction = 'campaign' | 'media_attack' | 'policy_announcement' | 'coalition_signal' | 'debate';

// ============================================================================
// V1 兼容接口（旧 D'Hondt，向后保留）
// ============================================================================

/**
 * 执行选举 (V1 原版 D'Hondt，向后兼容)
 *
 * 注意：V1 不区分直接/比例层，一次性按 D'Hondt 分配所有席位。
 * 新代码应使用 runElectionV2。
 */
export function runElection(
  parties: Party[],
  districts: District[],
  totalSeats: number,
  majorityThreshold: number,
): ElectionResult {
  const districtResults: Record<string, Record<string, number>> = {};
  const seatTotals: Record<string, number> = {};
  for (const p of parties) seatTotals[p.id] = 0;

  for (const district of districts) {
    const allocated = dhondt(parties, district.supportByParty, district.totalSeats);
    districtResults[district.id] = allocated;
    for (const [pid, seats] of Object.entries(allocated)) {
      seatTotals[pid] = (seatTotals[pid] ?? 0) + seats;
    }
  }

  const totalSupport = parties.reduce((s, p) => s + p.currentSupport, 0);
  const partyResults: PartyElectionResult[] = parties
    .map((p) => ({
      partyId: p.id,
      seats: seatTotals[p.id] ?? 0,
      supportPercent: totalSupport > 0 ? (p.currentSupport / totalSupport) * 100 : 0,
    }))
    .sort((a, b) => b.seats - a.seats);

  const majorityParty = partyResults.find((r) => r.seats >= majorityThreshold) ?? null;

  return {
    partyResults,
    hasMajority: majorityParty !== null,
    majorityPartyId: majorityParty?.partyId ?? null,
    totalSeats,
    majorityThreshold,
    districtResults,
  };
}

// ============================================================================
// V2 并行制（Phase G Q1 决策）
// ============================================================================

/**
 * 执行选举 V2（并行制 110 直接 + 90 全国比例代表）
 *
 * 使用确定性种子保证每次初始化结果相同。
 *
 * @param parties                     参选党派
 * @param districts                   11 个大选区（每个 totalSeats = 10）
 * @param totalSeats                  总席位数（200）
 * @param majorityThreshold           过半阈值（101）
 * @param candidatePopularity         候选人个人支持度（personName -> 0-100）
 * @param isElectionCampaign          是否处于竞选期（应用波动倍率）
 * @returns                           选举结果（含 nationalProportionalResults）
 */
export function runElectionV2(
  parties: Party[],
  districts: District[],
  totalSeats: number,
  majorityThreshold: number,
  candidatePopularity: Record<string, number>,
  isElectionCampaign: boolean = false,
): ElectionResult {
  // 确定性随机源
  let seed: number = ELECTION_CONFIG.electionSeed;
  const deterministicRandom = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // === 直接层：11 块 × 10 席 ===
  const directResults = allocateDirectSeats(
    parties, districts, candidatePopularity, isElectionCampaign, deterministicRandom,
  );

  // === 比例层：D'Hondt（席位数 = totalSeats - 110 直接席） ===
  const proportionalSeats = totalSeats - CONSTITUENCY_SEATS;
  const proportionalResults = allocateProportionalSeats(
    parties, districts, isElectionCampaign, deterministicRandom, proportionalSeats,
  );

  // === 合并 ===
  const seatTotals: Record<string, number> = {};
  for (const p of parties) seatTotals[p.id] = 0;
  for (const [pid, seats] of Object.entries(directResults.totals)) {
    seatTotals[pid] = (seatTotals[pid] ?? 0) + seats;
  }
  for (const [pid, seats] of Object.entries(proportionalResults.allocation)) {
    seatTotals[pid] = (seatTotals[pid] ?? 0) + seats;
  }

  // 汇总
  const totalSupport = parties.reduce((s, p) => s + p.currentSupport, 0);
  const partyResults: PartyElectionResult[] = parties
    .map((p) => ({
      partyId: p.id,
      seats: seatTotals[p.id] ?? 0,
      supportPercent: totalSupport > 0 ? (p.currentSupport / totalSupport) * 100 : 0,
    }))
    .sort((a, b) => b.seats - a.seats);

  const majorityParty = partyResults.find((r) => r.seats >= majorityThreshold) ?? null;

  return {
    partyResults,
    hasMajority: majorityParty !== null,
    majorityPartyId: majorityParty?.partyId ?? null,
    totalSeats,
    majorityThreshold,
    districtResults: directResults.byBlock,
    nationalProportionalResults: proportionalResults.allocation,
  };
}

// ============================================================================
// 直接层（110 席 = 11 × 10）
// ============================================================================

/**
 * 分配直接层席位。
 *
 * Phase G 修复 #8：直接层从"候选人 top-10 赢者通吃"改为"块内 D'Hondt 比例分配"。
 * 原算法每个块内得分最高的党独揽全部 10 席，导致席位分布严重偏离目标值。
 *
 * 新算法：
 *   1. 每个块内使用 D'Hondt 按 supportByParty 值分配 10 席
 *   2. 与比例代表层 D'Hondt 一致，符合复数选区比例分配逻辑
 *   3. 候选人列表仍生成（buildCandidateListForParty），供后续竞选/排序使用
 */
function allocateDirectSeats(
  parties: Party[],
  districts: District[],
  _candidatePopularity: Record<string, number>,
  _isElectionCampaign: boolean,
  _rng: () => number,
): { totals: Record<string, number>; byBlock: Record<string, Record<string, number>> } {
  const totals: Record<string, number> = {};
  for (const p of parties) totals[p.id] = 0;

  const byBlock: Record<string, Record<string, number>> = {};

  for (const district of districts) {
    const directSeats = Math.min(DIRECT_SEATS_PER_BLOCK, district.totalSeats);

    // 块内 D'Hondt：按 supportByParty 分配 directSeats 席
    const blockResult = dhondt(parties, district.supportByParty, directSeats);

    for (const p of parties) {
      const seats = blockResult[p.id] ?? 0;
      totals[p.id] = (totals[p.id] ?? 0) + seats;
    }
    byBlock[district.id] = blockResult;
  }

  return { totals, byBlock };
}

/**
 * 为某党在某块构造候选人名单。
 *
 * - 优先排 leader
 * - 其次排 members（按知名度降序）
 * - 不足 10 人用"后排候选人 N"填充（占位符）
 */
function buildCandidateListForParty(party: Party, count: number): string[] {
  const candidates: string[] = [party.leader];
  for (const m of party.members) {
    if (candidates.length >= count) break;
    if (!candidates.includes(m)) candidates.push(m);
  }
  // 后排填充（确保每党 10 候选人，跨块独立）
  let filler = 1;
  while (candidates.length < count) {
    candidates.push(`${party.id}-后排候选人${filler}`);
    filler++;
  }
  return candidates.slice(0, count);
}

// ============================================================================
// 比例层（90 全国 D'Hondt）
// ============================================================================

/**
 * 分配全国比例代表层席位。
 *
 * 算法：
 *   1. 全国政党票 = Σ(voterCount[block] × supportByParty[block][party]) for each block
 *   2. 5% 阈值过滤（得票率 < 5% 的政党不参与分配）
 *   3. D'Hondt 法在合格政党之间分 proportionalSeats 席
 */
function allocateProportionalSeats(
  parties: Party[],
  districts: District[],
  isElectionCampaign: boolean,
  rng: () => number,
  proportionalSeats: number = PROPORTIONAL_SEATS_TOTAL,
): { allocation: Record<string, number> } {
  // 1. 计算全国政党票
  const nationalVotes: Record<string, number> = {};
  for (const p of parties) nationalVotes[p.id] = 0;

  for (const district of districts) {
    for (const party of parties) {
      const support = district.supportByParty[party.id] ?? 0;
      nationalVotes[party.id] += district.voterCount * support;
    }
  }

  // 竞选期间波动：每党票数 ±10%
  if (isElectionCampaign) {
    for (const pid of Object.keys(nationalVotes)) {
      const wobble = 1 + (rng() - 0.5) * 0.1 * CAMPAIGN_VOLATILITY_MULTIPLIER;
      nationalVotes[pid] = Math.max(0, nationalVotes[pid] * wobble);
    }
  }

  // 2. 5% 阈值
  const totalVotes = Object.values(nationalVotes).reduce((s, v) => s + v, 0);
  const qualifiedParties = parties.filter(p => {
    if (totalVotes <= 0) return false;
    return (nationalVotes[p.id] ?? 0) / totalVotes * 100 >= PROPORTIONAL_THRESHOLD_PERCENT;
  });

  // 3. D'Hondt 分配
  const allocation = dhondt(qualifiedParties, nationalVotes, proportionalSeats);
  return { allocation };
}

// ============================================================================
// 竞选行动（用于 processCampaignAction）
// ============================================================================

/** 处理竞选行动 */
export function processCampaignAction(
  state: GameState,
  partyId: string,
  _action: CampaignAction,
): GameState {
  const party = state.parties.find(p => p.id === partyId);
  if (!party) return state;

  const updatedParties = state.parties.map(p => {
    if (p.id !== partyId) return p;

    let supportDelta = 0;
    switch (_action) {
      case 'campaign': supportDelta = 0.5 + Math.random() * 1.5; break;
      case 'media_attack': supportDelta = -1 + Math.random() * 3; break;
      case 'policy_announcement': supportDelta = 0.3 + Math.random() * 1; break;
      case 'coalition_signal': supportDelta = 0.2 + Math.random() * 0.5; break;
      case 'debate': supportDelta = -0.5 + Math.random() * 2.5; break;
    }

    // 竞选期间倍率
    supportDelta *= CAMPAIGN_VOLATILITY_MULTIPLIER;

    return {
      ...p,
      currentSupport: Math.max(1, Math.min(60, p.currentSupport + supportDelta)),
    };
  });

  return { ...state, parties: updatedParties };
}

/** 生成候选人个人支持率 (基于人格数据) */
export function generateCandidatePopularity(
  mpPersonalities: Record<string, MPPersonality>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, mp] of Object.entries(mpPersonalities)) {
    if (mp.isLeader) {
      result[mp.personName] = mp.popularity * 0.6 + mp.mediaSkill * 0.3 + mp.negotiationSkill * 0.1;
    }
  }
  return result;
}

// ============================================================================
// D'Hondt 共享算法
// ============================================================================

/**
 * D'Hondt 最高均数法分配席位
 */
function dhondt(
  parties: Party[],
  supportByParty: Record<string, number>,
  seatsAvailable: number,
): Record<string, number> {
  const allocated: Record<string, number> = {};
  for (const p of parties) allocated[p.id] = 0;

  for (let i = 0; i < seatsAvailable; i++) {
    let bestPartyId = '';
    let bestQuotient = -1;

    for (const p of parties) {
      const votes = supportByParty[p.id] ?? 0;
      if (votes <= 0) continue;
      const quotient = votes / (allocated[p.id] + 1);
      if (quotient > bestQuotient) {
        bestQuotient = quotient;
        bestPartyId = p.id;
      }
    }

    if (bestPartyId) allocated[bestPartyId]++;
  }

  return allocated;
}
