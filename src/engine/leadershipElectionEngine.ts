/**
 * Leadership Election Engine — 党首选举触发与执行（Phase G 第七章）
 *
 * 5 个触发条件：
 *   1. 党首辞职（玩家选择或 AI 决策）
 *   2. 重大丑闻（media_scandal 事件后支持率 < 20%）
 *   3. 大选惨败（选后席位 < 选举前 50%）
 *   4. 派阀挑战成功（factionEngine.canChallengeLeader 返回 true + 投票胜出）
 *   5. 连续低支持率（连续 6 回合 < 25%）
 *
 * 触发后调用 runLeadershipVote 选举新党首。
 */

import type { GameState, Party, AIIntent, ElectionResult } from '../types';
import type { MPPersonality } from '../types/mp';
import { LEADERSHIP_ELECTION_TRIGGERS } from '../config/gameBalance';
import { canChallengeLeader } from './factionEngine';

// ============================================================================
// 触发条件检测
// ============================================================================

export type LeadershipTriggerReason =
  | 'resignation'             // 1. 党首辞职
  | 'major_scandal'           // 2. 重大丑闻后支持率 < 20%
  | 'election_defeat'         // 3. 大选惨败
  | 'faction_challenge'       // 4. 派阀挑战成功
  | 'prolonged_low_support';  // 5. 连续 6 回合 < 25%

export interface LeadershipTrigger {
  partyId: string;
  reason: LeadershipTriggerReason;
  details: string;
}

/**
 * 检查所有党派的党首选举触发条件。
 *
 * Phase G 第七章 5 触发条件统一入口。
 *
 * @param state                 当前 GameState
 * @param recentElectionResult  最近一次选举结果（条件 3 用）
 * @returns                     待触发的党首选举列表
 */
export function checkLeadershipTriggers(
  state: GameState,
  recentElectionResult?: ElectionResult,
): LeadershipTrigger[] {
  const triggers: LeadershipTrigger[] = [];

  for (const party of state.parties) {
    // 条件 1：党首辞职 — 由调用方（玩家/AI）主动传入，此处不检查

    // 条件 2：重大丑闻 — media_scandal 事件后支持率 < 20%
    // 检查最近事件中是否有 media_scandal
    const recentScandal = hasRecentScandalEvent(state, party.id);
    if (recentScandal && party.currentSupport < LEADERSHIP_ELECTION_TRIGGERS.scandalSupportThreshold) {
      triggers.push({
        partyId: party.id,
        reason: 'major_scandal',
        details: `丑闻后支持率 ${party.currentSupport.toFixed(0)}% < ${LEADERSHIP_ELECTION_TRIGGERS.scandalSupportThreshold}%`,
      });
      continue;  // 一个党一次只触发一个条件
    }

    // 条件 3：大选惨败 — 选后席位 < 选举前 50%
    if (recentElectionResult) {
      const currentSeats = party.projectedSeats;
      const preElectionSeats = recentElectionResult.partyResults.find(
        r => r.partyId === party.id,
      )?.seats;
      if (preElectionSeats !== undefined && preElectionSeats > 0) {
        const ratio = currentSeats / preElectionSeats;
        if (ratio < LEADERSHIP_ELECTION_TRIGGERS.electionDefeatRatio) {
          triggers.push({
            partyId: party.id,
            reason: 'election_defeat',
            details: `席位 ${currentSeats} < 选举前 ${preElectionSeats} 的 ${LEADERSHIP_ELECTION_TRIGGERS.electionDefeatRatio * 100}%`,
          });
          continue;
        }
      }
    }

    // 条件 4：派阀挑战 — factionEngine.canChallengeLeader
    if (party.factions && party.factions.length > 0) {
      try {
        const challengeable = canChallengeLeader(party, party.factions);
        if (challengeable) {
          triggers.push({
            partyId: party.id,
            reason: 'faction_challenge',
            details: `派阀可挑战党首（忠诚度低 + 派阀规模 ≥ 25%）`,
          });
          continue;
        }
      } catch {
        // canChallengeLeader 可能因数据缺失失败，忽略
      }
    }

    // 条件 5：连续低支持率（连续 6 回合 < 25%）
    // 仅跟踪玩家所在党
    const playerPartyId = state.playerConfig?.partyId;
    if (playerPartyId === party.id) {
      const consecutiveLow = state.consecutiveLowSupportTurns ?? 0;
      if (consecutiveLow >= LEADERSHIP_ELECTION_TRIGGERS.consecutiveLowSupportTurns) {
        triggers.push({
          partyId: party.id,
          reason: 'prolonged_low_support',
          details: `连续 ${consecutiveLow} 回合支持率 < ${LEADERSHIP_ELECTION_TRIGGERS.consecutiveLowSupportThreshold}%`,
        });
        continue;
      }
    }
  }

  return triggers;
}

/**
 * 检查最近事件中是否有针对某党的 media_scandal。
 *
 * 规则：仅当事件的 impact 显式包含 partyId（明确针对该党）时才算数。
 * 空影响事件不算（避免误伤）。
 */
function hasRecentScandalEvent(state: GameState, partyId: string): boolean {
  const recent = state.events.slice(-3);
  return recent.some(e =>
    (e.title.includes('丑闻') || e.title.includes('scandal') || e.title.includes('媒体曝光')) &&
    e.impact[partyId] !== undefined,
  );
}

// ============================================================================
// 党首选举执行
// ============================================================================

export interface LeadershipVoteResult {
  partyId: string;
  winnerKey: string;
  winnerName: string;
  votes: Record<string, number>;
  candidates: string[];
  reason: LeadershipTriggerReason;
}

/**
 * 执行党首选举。
 *
 * 候选人 = 现任党首 + 派阀领袖 + 核心成员（野心 > 60）
 * 投票权重：影响力 + 人气 + 谈判力 + 政治资本 + 派阀背书
 *
 * 缺失 MP 数据的候选人 votes[key] = 0，不会成为获胜者。
 *
 * @returns   选举结果（含获胜者 mpKey）
 */
export function runLeadershipVote(
  state: GameState,
  party: Party,
  candidates: string[],
  reason: LeadershipTriggerReason,
): LeadershipVoteResult {
  if (candidates.length === 0) {
    throw new Error('runLeadershipVote: candidates cannot be empty');
  }

  const votes: Record<string, number> = {};

  for (const candidateKey of candidates) {
    const mp = state.mpPersonalities[candidateKey];
    if (!mp) {
      // 缺失数据：votes 记为 0，保留候选位
      votes[candidateKey] = 0;
      continue;
    }

    const capital = mp.politicalCapital ?? 30;
    const factionBacking = getFactionBacking(state, party, candidateKey);

    votes[candidateKey] =
      mp.popularity * 0.3 +
      mp.negotiationSkill * 0.2 +
      mp.ambition * 0.1 +
      capital * 0.3 +
      factionBacking * 0.1;
  }

  // 找出获胜者（只在有 MP 数据的候选人中选）
  let winnerKey = candidates[0];
  let maxVotes = -Infinity;
  for (const [key, v] of Object.entries(votes)) {
    if (v > maxVotes && state.mpPersonalities[key]) {
      maxVotes = v;
      winnerKey = key;
    }
  }

  const winnerMP = state.mpPersonalities[winnerKey];

  return {
    partyId: party.id,
    winnerKey,
    winnerName: winnerMP?.personName ?? winnerKey,
    votes,
    candidates,
    reason,
  };
}

/** 计算候选人的派阀背书分（候选人所属派阀规模 * 忠诚度） */
function getFactionBacking(
  state: GameState,
  party: Party,
  candidateKey: string,
): number {
  if (!party.factions) return 0;
  for (const faction of party.factions) {
    if (faction.members.includes(candidateKey)) {
      return faction.members.length * (faction.loyalty / 100);
    }
  }
  return 0;
}

// ============================================================================
// 触发党首选举（统一入口）
// ============================================================================

/**
 * 触发某党的党首选举流程。
 *
 * 生成 leadership_campaign intent 并加入 pendingIntents（供 LLM 生成辩论事件），
 * 同时执行 runLeadershipVote 决定获胜者。
 *
 * @returns   新的 GameState（含 intent 和获胜者更新）
 */
export function triggerPartyLeadershipElection(
  state: GameState,
  partyId: string,
  reason: LeadershipTriggerReason,
): { state: GameState; result: LeadershipVoteResult | null } {
  const party = state.parties.find(p => p.id === partyId);
  if (!party) return { state, result: null };

  // 收集候选人：现任党首 + 派阀领袖 + 野心 > 60 的核心成员
  const currentLeaderKey = `${partyId}:${party.leader}`;
  const candidates = new Set<string>();
  candidates.add(currentLeaderKey);

  // 派阀领袖
  if (party.factions) {
    for (const faction of party.factions) {
      if (faction.members.length > 0) {
        // 派阀领袖通常是第一个 member（简化策略）
        candidates.add(faction.members[0]);
      }
    }
  }

  // 野心 > 60 的核心成员
  for (const memberName of party.members) {
    const key = `${partyId}:${memberName}`;
    const mp = state.mpPersonalities[key];
    if (mp && mp.ambition > 60) {
      candidates.add(key);
    }
  }

  const candidateList = Array.from(candidates);
  // 全部候选人都缺 MP 数据时无法选举
  const hasAnyMP = candidateList.some(k => state.mpPersonalities[k]);
  if (!hasAnyMP || candidateList.length === 0) return { state, result: null };

  // 执行投票（即使部分候选人缺数据，也能继续）
  const result = runLeadershipVote(state, party, candidateList, reason);

  // 生成 leadership_campaign intent
  const intent: AIIntent = {
    id: `intent-leadership-${partyId}-${Date.now()}`,
    type: 'leadership_campaign',
    source: `leadership-trigger-${reason}`,
    payload: {
      partyId,
      challengerId: result.winnerKey,
      currentLeaderId: currentLeaderKey,
      factionBacking: candidateList,
      reason,
    },
    turn: state.turn,
  };

  const newState: GameState = {
    ...state,
    pendingIntents: [...state.pendingIntents, intent],
  };

  return { state: newState, result };
}
