import type { Bill, BillStatus, Committee, Party, RelationEntry, GameState } from '../types/game';
import type { MPPersonality } from '../types/mp';
import { resolveBillStatus } from './constitutionEngine';

/** 默认法案决策期限（回合数） */
export const DEFAULT_BILL_DEADLINE = 6;

/** 最小质询保障时间（分钟） */
export const MINIMUM_QUESTION_TIME = 5;

/** 判断法案是否已过期 */
export function isBillExpired(bill: Bill, currentTurn: number): boolean {
  const deadline = bill.decisionDeadline ?? (bill.createdTurn + DEFAULT_BILL_DEADLINE);
  return currentTurn >= deadline;
}

/** 过期法案自动表决 */
export function autoVoteBill(bill: Bill, state: GameState): Bill {
  if (bill.status === 'passed' || bill.status === 'rejected' || bill.status === 'implemented' || bill.status === 'withdrawn') {
    return bill;
  }

  // 基于当前支持率模拟自动表决
  const proposingParty = state.parties.find(p => p.id === bill.proposerPartyId);
  const isRuling = state.government?.rulingCoalition.includes(bill.proposerPartyId) ?? false;

  // 简单模拟: 执政党法案通过率高
  const baseChance = isRuling ? 0.6 : 0.35;
  const bonus = (proposingParty?.currentSupport ?? 20) / 200; // 支持率加成
  const passed = Math.random() < (baseChance + bonus);

  const totalSeats = state.metrics.totalSeats;
  const votesFor = passed ? Math.floor(totalSeats * (0.5 + Math.random() * 0.15)) : Math.floor(totalSeats * (0.3 + Math.random() * 0.15));
  const votesAgainst = totalSeats - votesFor;

  return {
    ...bill,
    status: passed ? 'passed' : 'rejected',
    votesFor,
    votesAgainst,
    committeeNote: (bill.committeeNote || '') + ' [自动表决：决策期限已过]',
  };
}

/** 推进法案决策链 */
export function advanceBillChain(
  bill: Bill,
  _committee: Committee,
  _parties: Party[],
  _relations: RelationEntry[],
  _mpPersonalities: Record<string, MPPersonality>,
): Bill {
  switch (bill.status) {
    case 'draft':
      return { ...bill, status: 'in_committee' };
    case 'in_committee':
      return bill; // 等待 committee_review / committee_vote
    case 'revised':
      return { ...bill, status: 'voting' };
    case 'voting': {
      // 已在投票中，等待结果
      return bill;
    }
    default:
      return bill;
  }
}

/** 计算委员会质询时间分配 */
export function calculateQuestionTime(
  committee: Committee,
  parties: Party[],
  totalTimeMinutes: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  const partySeats: Record<string, number> = {};
  let totalSeats = 0;

  for (const member of committee.members) {
    const pid = member.partyId;
    partySeats[pid] = (partySeats[pid] || 0) + 1;
    totalSeats++;
  }

  if (totalSeats === 0) return result;

  // 按比例分配，但保证最小时间
  const partiesWithSeats = Object.entries(partySeats);
  const smallParties = partiesWithSeats.filter(([, seats]) => seats / totalSeats < 0.1);

  // 先扣除最小保障时间
  let remainingTime = totalTimeMinutes;
  for (const [pid] of smallParties) {
    result[pid] = MINIMUM_QUESTION_TIME;
    remainingTime -= MINIMUM_QUESTION_TIME;
  }

  // 剩余时间按比例分配给所有党派
  if (remainingTime > 0) {
    for (const [pid, seats] of partiesWithSeats) {
      const proportion = seats / totalSeats;
      const allocated = Math.round(remainingTime * proportion);
      result[pid] = (result[pid] || 0) + allocated;
    }
  }

  return result;
}

/** 处理委员会质询阶段 */
export function processCommitteeQuestioning(
  committee: Committee,
  parties: Party[],
  totalTimeMinutes: number = 180,
): { timeAllocations: Record<string, number>; complete: boolean } {
  const timeAllocations = calculateQuestionTime(committee, parties, totalTimeMinutes);
  return { timeAllocations, complete: true };
}
