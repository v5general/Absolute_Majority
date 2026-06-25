/**
 * Parliamentary Group Engine — 会派系统（Phase G Q5）
 *
 * 会派不完全等于政党：多个小党可组成共同会派。
 * 会派规模决定：委员会席位分配权、国会质询时间、法案优先权、国会发言权。
 *
 * 党首辩论时间按会派席位比例分配（180 分钟，最小保障 5 分钟）。
 */

import type { GameState, Party, ParliamentaryGroup, ElectionResult } from '../types';

// ============================================================================
// 常量
// ============================================================================

/** 党首辩论每月总时长（分钟） */
export const TOTAL_DEBATE_TIME_PER_MONTH = 180;

/** 每会派最小保障质询时间（分钟） */
export const MIN_DEBATE_TIME_PER_GROUP = 5;

// ============================================================================
// 初始化
// ============================================================================

/**
 * 基于选举结果初始化会派列表。
 *
 * 简化策略：
 *   - 默认每个党独立成会派（即使小党也独立）
 *   - 若执政联盟 ≥ 2 党，可选择合并为"执政联盟"共同会派（暂不启用）
 *   - 若在野党有 <= 3 席的小党，依附最近意识形态的大党（暂不启用）
 *
 * 真实政治中"共同会派"需要党际协商，本系统暂以"每党一会派"为基础。
 */
export function initializeParliamentaryGroups(
  parties: Party[],
  _electionResult: ElectionResult,
): ParliamentaryGroup[] {
  const groups: ParliamentaryGroup[] = [];

  for (const party of parties) {
    const seats = party.projectedSeats;
    if (seats <= 0) continue;

    groups.push({
      id: `group-${party.id}`,
      name: `${party.name}会派`,
      memberPartyIds: [party.id],
      totalSeats: seats,
    });
  }

  // 按 totalSeats 降序
  groups.sort((a, b) => b.totalSeats - a.totalSeats);
  return groups;
}

// ============================================================================
// 质询时间分配（180 分钟按比例 + 最小保障 5 分钟）
// ============================================================================

export interface QuestionTimeAllocation {
  groupId: string;
  groupName: string;
  minutes: number;
  /** 占总时间的百分比 */
  share: number;
}

/**
 * 按会派席位比例分配党首辩论时间（180 分钟，最小保障 5 分钟）。
 *
 * 算法：
 *   1. 每会派初始分配 = totalSeats / Σ(totalSeats) × 180
 *   2. 若分配 < 5 分钟，提升到 5 分钟（最小保障）
 *   3. 从大会派扣除多分配给小会派的时间
 *   4. 钳制总和到 totalTime（避免四舍五入溢出）
 */
export function getQuestionTimeAllocation(groups: ParliamentaryGroup[]): QuestionTimeAllocation[] {
  const totalSeats = groups.reduce((s, g) => s + g.totalSeats, 0);
  if (totalSeats <= 0 || groups.length === 0) return [];

  const totalTime = TOTAL_DEBATE_TIME_PER_MONTH;
  const minTime = MIN_DEBATE_TIME_PER_GROUP;

  // 初始按比例分配
  const rawAllocations = groups.map(g => ({
    groupId: g.id,
    groupName: g.name,
    minutes: (g.totalSeats / totalSeats) * totalTime,
  }));

  // 应用最小保障
  const minAllocations = rawAllocations.map(a => ({
    ...a,
    minutes: Math.max(a.minutes, minTime),
  }));

  // 计算超额分配量，从大会派扣除
  const totalAfterMin = minAllocations.reduce((s, a) => s + a.minutes, 0);
  const overflow = totalAfterMin - totalTime;

  if (overflow > 0) {
    const bigGroups = minAllocations.filter(a => a.minutes > minTime);
    const bigTotal = bigGroups.reduce((s, a) => s + a.minutes, 0);
    if (bigTotal > 0) {
      for (const a of minAllocations) {
        if (a.minutes > minTime) {
          const deduction = overflow * (a.minutes / bigTotal);
          a.minutes = Math.max(minTime, a.minutes - deduction);
        }
      }
    }
  }

  // 取整并修正：将取整误差从最大会派中扣除/补足，确保 sum(minutes) == totalTime
  const rounded = minAllocations.map(a => ({
    groupId: a.groupId,
    groupName: a.groupName,
    minutes: Math.round(a.minutes),
    share: totalTime > 0 ? a.minutes / totalTime : 0,
  }));

  const roundedSum = rounded.reduce((s, a) => s + a.minutes, 0);
  const diff = roundedSum - totalTime;
  if (diff !== 0 && rounded.length > 0) {
    // 找到最大会派，从中扣除/补足 diff
    const maxIdx = rounded.reduce((best, a, i) =>
      a.minutes > rounded[best].minutes ? i : best, 0);
    rounded[maxIdx].minutes = Math.max(minTime, rounded[maxIdx].minutes - diff);
  }

  return rounded;
}

// ============================================================================
// 工具
// ============================================================================

/** 根据 partyId 查找所属会派 */
export function getGroupByParty(
  partyId: string,
  groups: ParliamentaryGroup[],
): ParliamentaryGroup | null {
  return groups.find(g => g.memberPartyIds.includes(partyId)) ?? null;
}

/** 重新计算所有会派的 totalSeats（席位变化后调用） */
export function recalcGroupSeats(
  groups: ParliamentaryGroup[],
  parties: Party[],
): ParliamentaryGroup[] {
  return groups.map(g => {
    const totalSeats = g.memberPartyIds.reduce((sum, pid) => {
      const party = parties.find(p => p.id === pid);
      return sum + (party?.projectedSeats ?? 0);
    }, 0);
    return { ...g, totalSeats };
  });
}

// ============================================================================
// 月度辩论事件触发检测
// ============================================================================

/**
 * 检查本月是否已生成党首辩论事件。
 *
 * @param state   当前 GameState
 * @returns       true = 本月已生成；false = 未生成（应触发）
 */
export function hasDebateThisMonth(state: GameState): boolean {
  const currentMonth = getMonthFromState(state);
  return state.lastDebateMonth === currentMonth;
}

/**
 * 标记本月已生成辩论事件。
 *
 * 返回新的 GameState（不可变更新）。
 */
export function markDebateGenerated(state: GameState): GameState {
  const currentMonth = getMonthFromState(state);
  if (state.lastDebateMonth === currentMonth) return state;
  return { ...state, lastDebateMonth: currentMonth };
}

/** 从 state.turn 派生月份（1-12），考虑起始月份 */
function getMonthFromState(state: GameState): number {
  // 简化：turn % 12 + 1；真实应使用 getMonthFromTurn(state.turn)
  // 但 useGameState 已有 turn，可避免循环依赖
  if (!state.playerConfig) {
    return ((state.turn - 1) % 12) + 1;
  }
  return ((state.turn - 1) % 12) + 1;
}

// ============================================================================
// 注入到 state 的便利函数
// ============================================================================

/**
 * 在 state 中初始化 parliamentaryGroups（若未存在）。
 *
 * 返回新的 GameState。
 */
export function ensureParliamentaryGroups(state: GameState): GameState {
  if (state.parliamentaryGroups && state.parliamentaryGroups.length > 0) {
    return state;
  }
  const groups = initializeParliamentaryGroups(state.parties, state.government?.electionResult ?? {
    partyResults: [],
    hasMajority: false,
    majorityPartyId: null,
    totalSeats: state.metrics.totalSeats,
    majorityThreshold: state.metrics.majorityThreshold,
    districtResults: {},
  });
  return { ...state, parliamentaryGroups: groups };
}
