import type { PartyRank, ParliamentRank, CareerState } from '../types/career';
import { PARTY_RANKS, PARLIAMENT_RANKS, getPartyRankLabel } from '../types/career';
import type { MPPersonality } from '../types/mp';
import type { Party, Government, Committee, CabinetPost } from '../types/game';
import { PROMOTION_THRESHOLDS } from '../config/gameBalance';

/**
 * Career Engine — 双轨制职业系统
 *
 * Phase G Q2：党内 8 级（删青年局干部，新增政策委员会委员长）+ 国会 9 级（保留政务官）。
 * 党派别名通过 getPartyRankLabel(partyId, rank) 应用（如 ULP 的"主席"）。
 *
 * 晋升阈值（Phase G 第十章）：
 *   - 党内：loyalty > 70 + capital > 30 + 党龄 > 6 回合
 *   - 国会：资历 > 8 回合 + 委员会成绩 > 60
 */

/** 初始化议员职业状态 */
export function initializeCareer(
  mp: MPPersonality,
  party: Party,
  government: Government | null,
  committees: Committee[],
): CareerState {
  const personName = mp.personName;

  // === 党内路线（新 8 级） ===
  // 0=普通党员, 1=党务干部, 2=政策委员会委员, 3=政策委员会委员长,
  // 4=副干事长, 5=干事长, 6=副党首, 7=党首
  let partyRankIndex = 0;
  if (personName === party.leader) {
    partyRankIndex = PARTY_RANKS.length - 1; // 党首
  } else if (party.members.includes(personName)) {
    // 核心成员：根据野心/谈判力/忠诚度分流
    if (mp.ambition > 75 && mp.negotiationSkill > 70) {
      partyRankIndex = 5; // 干事长
    } else if (mp.ambition > 60) {
      partyRankIndex = 4; // 副干事长
    } else if (mp.loyalty > 70 && mp.mediaSkill > 60) {
      partyRankIndex = 3; // 政策委员会委员长
    } else if (mp.mediaSkill > 60 && mp.ambition > 50) {
      partyRankIndex = 2; // 政策委员会委员
    } else if (mp.loyalty > 70) {
      partyRankIndex = 1; // 党务干部（忠诚度较高的基础成员）
    } else {
      partyRankIndex = 0; // 普通党员（数据偏低）
    }
  } else {
    // 普通党员：根据忠诚度分流
    if (mp.loyalty > 70 && mp.ambition > 50) {
      partyRankIndex = 1; // 党务干部
    } else {
      partyRankIndex = 0; // 普通党员
    }
  }

  // === 国会路线（保留 9 级） ===
  let parliamentRankIndex = 0;

  // 检查是否为总理大臣
  if (government && government.primeMinisterName === personName) {
    parliamentRankIndex = PARLIAMENT_RANKS.length - 1; // 内阁总理大臣
  }
  // 检查是否为大臣
  else if (government && government.ministers.some(m => m.personName === personName)) {
    const minister = government.ministers.find(m => m.personName === personName)!;
    parliamentRankIndex = getMinisterRankIndex(minister.post);
  }
  // 检查是否为委员长
  else {
    for (const c of committees) {
      if (c.chairman.personName === personName) {
        parliamentRankIndex = 3; // 委员长
        break;
      }
      if (c.viceChairman?.personName === personName) {
        parliamentRankIndex = 2; // 副委员长
        break;
      }
    }
  }

  return {
    partyRank: PARTY_RANKS[partyRankIndex],
    partyRankIndex,
    parliamentRank: PARLIAMENT_RANKS[parliamentRankIndex],
    parliamentRankIndex,
  };
}

/**
 * 获取党内职位在该党派下的显示名称（含别名）。
 *
 * 例如：ULP 的"党首"显示为"主席"；改革民主党的"政策委员会委员长"显示为"政调会长"。
 * 未配置别名时返回 PartyRank 原文。
 */
export function getPartyRankDisplayName(partyId: string, rank: PartyRank): string {
  return getPartyRankLabel(partyId, rank);
}

/** 根据内阁职位获取国会路线等级 */
function getMinisterRankIndex(post: CabinetPost): number {
  switch (post) {
    case 'prime_minister': return 8;    // 内阁总理大臣
    case 'chief_secretary': return 7;    // 内阁官房长官
    case 'finance_minister': return 6;   // 国务大臣
    case 'foreign_minister': return 6;
    case 'defense_minister': return 6;
    case 'health_minister': return 6;
    case 'economy_minister': return 6;
    default: return 5;                   // 副大臣
  }
}

// ============================================================================
// 晋升检查（Phase G 第十章量化阈值）
// ============================================================================

/** 检查党内晋升资格 */
export function checkPartyPromotion(
  mp: MPPersonality,
  career: CareerState,
  party: Party,
): { eligible: boolean; nextRank: PartyRank | null; reason?: string } {
  if (career.partyRankIndex >= PARTY_RANKS.length - 1) {
    return { eligible: false, nextRank: null, reason: '已是党首' };
  }

  const partyAgeTurns = (mp.career ? career.partyRankIndex : 0) >= 0 ? estimatePartyAgeTurns(mp) : 0;
  const capital = mp.politicalCapital ?? 30;
  const thresholds = PROMOTION_THRESHOLDS.party;

  // 量化阈值：loyalty > 70 + capital > 30 + 党龄 > 6 回合
  const loyaltyPass = mp.loyalty > thresholds.loyalty;
  const capitalPass = capital > thresholds.capital;
  const agePass = partyAgeTurns > thresholds.partyAgeTurns;

  if (!loyaltyPass) return { eligible: false, nextRank: PARTY_RANKS[career.partyRankIndex + 1], reason: `忠诚度 ${mp.loyalty.toFixed(0)} ≤ ${thresholds.loyalty}` };
  if (!capitalPass) return { eligible: false, nextRank: PARTY_RANKS[career.partyRankIndex + 1], reason: `政治资本 ${capital.toFixed(0)} ≤ ${thresholds.capital}` };
  if (!agePass) return { eligible: false, nextRank: PARTY_RANKS[career.partyRankIndex + 1], reason: `党龄 ${partyAgeTurns} ≤ ${thresholds.partyAgeTurns}` };

  return { eligible: true, nextRank: PARTY_RANKS[career.partyRankIndex + 1] };
}

/** 检查国会晋升资格（资历 > 8 回合 + 委员会成绩 > 60） */
export function checkParliamentPromotion(
  mp: MPPersonality,
  career: CareerState,
  government: Government | null,
  committees: Committee[],
): { eligible: boolean; nextRank: ParliamentRank | null; reason?: string } {
  if (career.parliamentRankIndex >= PARLIAMENT_RANKS.length - 1) {
    return { eligible: false, nextRank: null, reason: '已是内阁总理大臣' };
  }

  // 国会晋升由实际职位决定（委员长、大臣等），不主动晋升普通议员
  // 但若满足条件，可标记为"具备晋升潜力"
  const seniorityTurns = estimateSeniorityTurns(mp);
  const committeePerformance = estimateCommitteePerformance(mp, committees);
  const thresholds = PROMOTION_THRESHOLDS.parliament;

  const seniorityPass = seniorityTurns > thresholds.seniorityTurns;
  const performancePass = committeePerformance > thresholds.committeePerformance;

  // 国会路线主要是职位驱动，资格检查仅返回"是否准备好下一级"
  if (career.parliamentRankIndex < 3 && seniorityPass && performancePass) {
    return {
      eligible: true,
      nextRank: PARLIAMENT_RANKS[Math.min(career.parliamentRankIndex + 1, PARLIAMENT_RANKS.length - 1)],
    };
  }

  return { eligible: false, nextRank: null };
}

/** 计算晋升综合评分 */
export function calculatePromotionScore(
  mp: MPPersonality,
  factors: {
    loyalty: number;
    factionSupport: number;
    politicalCapital: number;
    partyReputation: number;
    electionPerformance: number;
  },
): number {
  return (
    factors.loyalty * 0.25 +
    factors.factionSupport * 0.25 +
    factors.politicalCapital * 0.2 +
    factors.partyReputation * 0.15 +
    factors.electionPerformance * 0.15
  );
}

/** 估算党龄（回合）— 基于年龄、职业等级、是否有 career 数据 */
function estimatePartyAgeTurns(mp: MPPersonality): number {
  // 静态估算：年龄 - 25（假设 25 岁入党）的 1/3 作为党龄回合代理
  // 实际游戏中应由 useGameState 跟踪 mp.partyJoinedTurn
  const estimate = Math.max(0, Math.floor((mp.age - 25) / 3));
  return Math.min(48, estimate); // 上限 48 回合（一届任期）
}

/** 估算资历（回合）— 与党龄类似但更注重大选次数 */
function estimateSeniorityTurns(mp: MPPersonality): number {
  return estimatePartyAgeTurns(mp);
}

/** 估算委员会成绩 — 基于谈判力、知名度、是否为委员长 */
function estimateCommitteePerformance(mp: MPPersonality, committees: Committee[]): number {
  let score = mp.negotiationSkill * 0.4 + mp.popularity * 0.3;
  if (mp.isCommitteeChairman) score += 30;
  // 在任何委员会任职加分
  for (const c of committees) {
    if (c.members.some(m => m.personName === mp.personName)) {
      score += 10;
      break;
    }
  }
  return Math.min(100, score);
}

// ============================================================================
// 统一晋升审查入口（Phase G 第十章）
// ============================================================================

export interface PromotionReviewResult {
  mpKey: string;
  partyPromotion: { eligible: boolean; nextRank: PartyRank | null; reason?: string };
  parliamentPromotion: { eligible: boolean; nextRank: ParliamentRank | null };
}

/**
 * 运行所有议员的晋升审查。
 *
 * Phase G 第十章：每回合调用，检测所有 NPC / 玩家的晋升资格。
 * 仅返回审查结果，实际晋升由调用方（useGameState）应用。
 *
 * 注：不直接修改状态以保持纯函数特性；UI 层可基于结果展示晋升通知，
 *    rulesEngine 后续负责实际数值变更。
 */
export function runPromotionReview(state: import('../types').GameState): PromotionReviewResult[] {
  const results: PromotionReviewResult[] = [];

  for (const [mpKey, mp] of Object.entries(state.mpPersonalities)) {
    if (mp.deceased) continue;
    if (!mp.career) continue;

    const party = state.parties.find(p => p.id === mp.partyId);
    if (!party) continue;

    const partyPromotion = checkPartyPromotion(mp, mp.career, party);
    const parliamentPromotion = checkParliamentPromotion(
      mp, mp.career, state.government, state.committees,
    );

    if (partyPromotion.eligible || parliamentPromotion.eligible) {
      results.push({ mpKey, partyPromotion, parliamentPromotion });
    }
  }

  return results;
}

/**
 * 实际应用晋升结果到 GameState。
 *
 * Phase G 修复 #3：此前 runPromotionReview 结果仅被 console.log。
 * 党内路线：将 partyRankIndex 提升 1（上限为党首前一级，不得越过实际党首）。
 * 国会路线：保留职位驱动语义（委员长/大臣等由实际任命决定），不在此自动晋升，
 *          但若已在普通议员区且满足资历，则升为委员会理事（index 1）以反映资历。
 *
 * 返回新的 GameState（不可变）。
 */
export function applyPromotions(
  state: import('../types').GameState,
  results: PromotionReviewResult[],
): import('../types').GameState {
  if (results.length === 0) return state;

  const newPersonalities = { ...state.mpPersonalities };
  const events = [...state.events];

  for (const r of results) {
    const mp = newPersonalities[r.mpKey];
    if (!mp || !mp.career) continue;

    let changed = false;

    // 党内晋升：+1 级，上限 PARTY_RANKS.length - 2（不得自动升党首，党首由选举决定）
    if (r.partyPromotion.eligible && r.partyPromotion.nextRank) {
      const maxIndex = PARTY_RANKS.length - 2;
      const newIndex = Math.min(maxIndex, mp.career.partyRankIndex + 1);
      if (newIndex > mp.career.partyRankIndex) {
        mp.career = {
          ...mp.career,
          partyRank: PARTY_RANKS[newIndex],
          partyRankIndex: newIndex,
        };
        changed = true;
      }
    }

    // 国会晋升：仅当仍在 index 0（普通议员）且满足资历时，升为委员会理事（index 1）
    if (r.parliamentPromotion.eligible && mp.career.parliamentRankIndex === 0) {
      mp.career = {
        ...mp.career,
        parliamentRank: PARLIAMENT_RANKS[1],
        parliamentRankIndex: 1,
      };
      changed = true;
    }

    if (changed) {
      events.push({
        id: `evt-promo-${r.mpKey}-${Date.now()}`,
        day: state.currentDay,
        title: '议员晋升',
        description: `${mp.personName} 晋升为${mp.career.partyRank}。`,
        impact: {},
      });
    }
  }

  return { ...state, mpPersonalities: newPersonalities, events };
}

// ============================================================================
// 党首选举（保留原接口，扩展由 leadershipElectionEngine 处理）
// ============================================================================

/** 运行党首选举 */
export function runPartyLeadershipElection(
  party: Party,
  _factions: unknown,
  mpPersonalities: Record<string, MPPersonality>,
  candidates: string[],
): { winner: string; votes: Record<string, number> } {
  const votes: Record<string, number> = {};

  for (const candidateId of candidates) {
    const mp = mpPersonalities[candidateId];
    if (!mp) continue;
    // 投票权重: 影响力+人气+谈判力+政治资本
    const capital = mp.politicalCapital ?? 30;
    votes[candidateId] = mp.popularity + mp.negotiationSkill * 0.5 + mp.ambition * 0.3 + capital * 0.4;
  }

  let winner = candidates[0];
  let maxVotes = 0;
  for (const [id, v] of Object.entries(votes)) {
    if (v > maxVotes) {
      maxVotes = v;
      winner = id;
    }
  }

  return { winner, votes };
}

/** 检查党首选举触发条件（已扩展至 5 触发条件，详见 leadershipElectionEngine） */
export function checkLeadershipElectionTriggers(
  party: Party,
  _recentElectionResult?: unknown,
): boolean {
  // 旧接口保留：党首支持率 < 25% 时可能触发
  return party.currentSupport < 25;
}

/** 同步职业状态与实际职位 */
export function syncCareerWithPositions(
  career: CareerState,
  isLeader: boolean,
  isMinister: boolean,
  ministerPost: CabinetPost | null,
  isCommitteeChairman: boolean,
): CareerState {
  let partyRankIndex = career.partyRankIndex;
  let parliamentRankIndex = career.parliamentRankIndex;

  if (isLeader) partyRankIndex = PARTY_RANKS.length - 1;
  if (ministerPost) parliamentRankIndex = getMinisterRankIndex(ministerPost);
  else if (isCommitteeChairman) parliamentRankIndex = 3;
  else if (isMinister) parliamentRankIndex = Math.max(parliamentRankIndex, 4);

  return {
    partyRank: PARTY_RANKS[partyRankIndex],
    partyRankIndex,
    parliamentRank: PARLIAMENT_RANKS[parliamentRankIndex],
    parliamentRankIndex,
  };
}
