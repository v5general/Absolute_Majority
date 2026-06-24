import type { Party, District, ElectionResult, PartyElectionResult, GameState } from '../types';
import type { MPPersonality } from '../types/mp';
import {
  ELECTION_CONFIG,
  DIRECT_SEATS_PER_BLOCK,
  PROPORTIONAL_SEATS_TOTAL,
  PROPORTIONAL_THRESHOLD_PERCENT,
} from '../config/electionConfig';

/**
 * 选举引擎（Phase G Q1：并行制 110 直接 + 90 全国比例代表 = 200 席）
 *
 * 直接层（110 席 = 11 大选区 × 10 直接席）：
 *   - 每党在每块派出 10 候选人（leader + 核心成员 + 后排填充）
 *   - 候选人层面得分 = 0.4×partySupport + 0.3×candidatePopularity
 *                      + 0.2×districtLeaning + 0.1×random
 *   - 跨党派合并，按得分排序取 top 10 → 直接议席
 *
 * 比例层（90 席）：
 *   - 全国政党票 = Σ(voterCount[block] × supportByParty[block][party]) for each block
 *   - 5% 阈值过滤
 *   - D'Hondt 法在合格政党之间分 90 席
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

/** 候选人得分上下文（直接层候选人评估用） */
interface CandidateScore {
  partyId: string;
  candidateName: string;
  score: number;
}

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

  // === 比例层：90 全国 D'Hondt ===
  const proportionalResults = allocateProportionalSeats(
    parties, districts, isElectionCampaign, deterministicRandom,
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
 * 算法：
 *   1. 每个块内，为每党生成 10 候选人（leader + members + 后排填充）
 *   2. 候选人得分 = 0.4×partySupport + 0.3×candidatePopularity
 *                    + 0.2×districtLeaning + 0.1×random
 *   3. 跨党派合并，取 top 10 → 直接议席
 */
function allocateDirectSeats(
  parties: Party[],
  districts: District[],
  candidatePopularity: Record<string, number>,
  isElectionCampaign: boolean,
  rng: () => number,
): { totals: Record<string, number>; byBlock: Record<string, Record<string, number>> } {
  const totals: Record<string, number> = {};
  for (const p of parties) totals[p.id] = 0;

  const byBlock: Record<string, Record<string, number>> = {};
  const weights = ELECTION_CONFIG.electionWeights;

  for (const district of districts) {
    const directSeats = Math.min(DIRECT_SEATS_PER_BLOCK, district.totalSeats);
    const candidates: CandidateScore[] = [];

    for (const party of parties) {
      const partySupport = district.supportByParty[party.id] ?? 0;
      const districtLeaning = district.supportByParty[party.id] ?? partySupport;

      // 为该党在 该块 生成 10 候选人
      const partyCandidates = buildCandidateListForParty(party, directSeats);
      for (let i = 0; i < partyCandidates.length; i++) {
        const candidateName = partyCandidates[i];
        const basePopularity = candidatePopularity[candidateName]
          ?? fallbackCandidatePopularity(party, candidateName, i, rng);
        const candidateScore = applyCampaignCandidateBoost(basePopularity, isElectionCampaign);
        const randomFactor = rng() * 10;

        const score =
          partySupport * weights.partySupport +
          candidateScore * weights.candidateScore +
          districtLeaning * weights.districtLeaning +
          randomFactor * weights.randomFactor;

        candidates.push({ partyId: party.id, candidateName, score });
      }
    }

    // 跨党派合并，取 top 10
    candidates.sort((a, b) => b.score - a.score);
    const winners = candidates.slice(0, directSeats);

    const blockResult: Record<string, number> = {};
    for (const p of parties) blockResult[p.id] = 0;
    for (const w of winners) {
      blockResult[w.partyId] = (blockResult[w.partyId] ?? 0) + 1;
      totals[w.partyId] = (totals[w.partyId] ?? 0) + 1;
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

/** 候选人个人支持度兜底：基于党派 charisma + 序号衰减 */
function fallbackCandidatePopularity(
  party: Party,
  _name: string,
  index: number,
  rng: () => number,
): number {
  const base = party.charisma;
  // 后排候选人（index >= 1）有衰减
  const decay = Math.max(0, 1 - index * 0.15);
  const noise = (rng() - 0.5) * 10;
  return Math.max(5, Math.min(95, base * decay + noise));
}

/** 竞选期间候选人曝光度提升 */
function applyCampaignCandidateBoost(score: number, isCampaign: boolean): number {
  if (!isCampaign) return score;
  return score * CAMPAIGN_MEDIA_MULTIPLIER * ELECTION_CONFIG.campaignExposureBoost;
}

// ============================================================================
// 比例层（90 全国 D'Hondt）
// ============================================================================

/**
 * 分配全国比例代表层 90 席。
 *
 * 算法：
 *   1. 全国政党票 = Σ(voterCount[block] × supportByParty[block][party]) for each block
 *   2. 5% 阈值过滤（得票率 < 5% 的政党不参与分配）
 *   3. D'Hondt 法在合格政党之间分 90 席
 */
function allocateProportionalSeats(
  parties: Party[],
  districts: District[],
  isElectionCampaign: boolean,
  rng: () => number,
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
  const allocation = dhondt(qualifiedParties, nationalVotes, PROPORTIONAL_SEATS_TOTAL);
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
