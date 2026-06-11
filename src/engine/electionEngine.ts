import type { Party, District, ElectionResult, PartyElectionResult, GameState } from '../types';
import type { MPPersonality } from '../types/mp';
import { ELECTION_CONFIG } from '../config/electionConfig';

/**
 * 选举引擎
 *
 * 支持 V1 (D'Hondt 原版) 和 V2 (规则.txt 定义的公式)。
 * V2: 用 V2 公式计算各党各选区得分，再用 D'Hondt 分配选区席位
 * 公式: 40%政党支持率 + 30%候选人个人支持率 + 20%地方倾向 + 10%随机波动
 *
 * 选区总席位 = 199 NPC + 1 玩家 = 200
 */

/** 选区总席位数 (NPC) — 从配置派生 */
export const CONSTITUENCY_SEATS = ELECTION_CONFIG.constituencySeats;
/** 比例代表席位数（已整合入选区，保留常量兼容） */
export const PROPORTIONAL_SEATS = ELECTION_CONFIG.proportionalSeats;

/** 选举竞选期间倍率 — 从配置派生 */
export const CAMPAIGN_MEDIA_MULTIPLIER = ELECTION_CONFIG.campaignMediaMultiplier;
export const CAMPAIGN_VOLATILITY_MULTIPLIER = ELECTION_CONFIG.campaignVolatilityMultiplier;

/** 竞选行动类型 */
export type CampaignAction = 'campaign' | 'media_attack' | 'policy_announcement' | 'coalition_signal' | 'debate';

/**
 * 执行选举 (V1 原版 D'Hondt，向后兼容)
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

/**
 * 执行选举 V2（规则.txt 公式）
 * 公式: 40%政党支持率 + 30%候选人个人支持率 + 20%地方倾向 + 10%随机波动
 * 用 V2 公式计算各党各选区得分，再用 D'Hondt 法分配席位
 * 使用确定性种子，确保每次刷新结果一致
 */
export function runElectionV2(
  parties: Party[],
  districts: District[],
  totalSeats: number,
  majorityThreshold: number,
  candidatePopularity: Record<string, number>,
  isElectionCampaign: boolean = false,
): ElectionResult {
  const districtResults: Record<string, Record<string, number>> = {};
  const seatTotals: Record<string, number> = {};
  for (const p of parties) seatTotals[p.id] = 0;

  // 确定性随机：固定种子保证每次初始化结果相同
  let _seed = ELECTION_CONFIG.electionSeed;
  const deterministicRandom = () => {
    _seed = (_seed * 1103515245 + 12345) & 0x7fffffff;
    return _seed / 0x7fffffff;
  };

  const weights = ELECTION_CONFIG.electionWeights;

  // === 选区选举: V2 公式计算得分 + D'Hondt 分配席位 ===
  for (const district of districts) {
    const districtSeats = district.totalSeats;

    // 用 V2 公式计算各党在该选区的得分
    const scoresByParty: Record<string, number> = {};
    for (const party of parties) {
      const partySupport = district.supportByParty[party.id] ?? 0;
      const candidateScore = getCandidateScoreForDistrict(party, district, candidatePopularity, isElectionCampaign);
      const districtLeaning = district.supportByParty[party.id] ?? partySupport;
      // 用确定性随机替代 Math.random()
      const randomFactor = deterministicRandom() * 10;

      scoresByParty[party.id] =
        partySupport * weights.partySupport +
        candidateScore * weights.candidateScore +
        districtLeaning * weights.districtLeaning +
        randomFactor * weights.randomFactor;
    }

    // 用 D'Hondt 法按得分分配该选区的全部席位
    const allocated = dhondt(parties, scoresByParty, districtSeats);

    districtResults[district.id] = allocated;
    for (const [pid, seats] of Object.entries(allocated)) {
      seatTotals[pid] = (seatTotals[pid] ?? 0) + seats;
    }
  }

  // === 比例代表选举（当前 PROPORTIONAL_SEATS = 0，保留框架） ===
  if (PROPORTIONAL_SEATS > 0) {
    const nationalSupport: Record<string, number> = {};
    for (const party of parties) {
      let support = party.currentSupport;
      if (isElectionCampaign) {
        support = Math.max(0, support + (Math.random() - 0.5) * support * CAMPAIGN_VOLATILITY_MULTIPLIER * 0.1);
      }
      nationalSupport[party.id] = support;
    }
    const proportionalAllocated = dhondt(parties, nationalSupport, PROPORTIONAL_SEATS);
    for (const [pid, seats] of Object.entries(proportionalAllocated)) {
      seatTotals[pid] = (seatTotals[pid] ?? 0) + seats;
    }
  }

  // 汇总结果
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

/** 计算候选人在某选区的个人得分 */
function getCandidateScoreForDistrict(
  party: Party,
  district: District,
  candidatePopularity: Record<string, number>,
  isCampaign: boolean,
): number {
  // 党首作为该党在该选区的候选人
  const basePopularity = candidatePopularity[party.leader] ?? party.charisma;
  let score = basePopularity;
  if (isCampaign) {
    // 竞选期间候选人曝光度提升
    score *= CAMPAIGN_MEDIA_MULTIPLIER * ELECTION_CONFIG.campaignExposureBoost;
  }
  return score;
}

/** 生成候选人个人支持率 (基于人格数据) */
export function generateCandidatePopularity(
  mpPersonalities: Record<string, MPPersonality>,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, mp] of Object.entries(mpPersonalities)) {
    if (mp.isLeader) {
      result[mp.personName] = mp.popularity * 0.6 + mp.mediaSkill * 0.3 + mp.charisma * 0.1;
    }
  }
  return result;
}

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
