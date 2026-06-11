import type { Government, ElectionResult, Bill, BillStatus, RuleValidationResult } from '../types/game';

/** 绝对多数门槛: 200席的2/3 = 134席 */
export const CONSTITUTIONAL_MAJORITY_THRESHOLD = 134;

/** 判断执政联盟是否拥有绝对多数 */
export function hasConstitutionalMajority(government: Government, electionResult: ElectionResult): boolean {
  const seats = government.rulingCoalition.reduce((sum, pid) => {
    const r = electionResult.partyResults.find(er => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);
  return seats >= CONSTITUTIONAL_MAJORITY_THRESHOLD;
}

/** 绝对多数权力集 */
export interface ConstitutionalPowers {
  canProposeAmendment: boolean;
  canSkipObstruction: boolean;
  canForceStopDelay: boolean;
  canFastTrack: boolean;
  disciplineVotingBonus: number;
  committeeSeatAdvantage: number;
}

/** 获取绝对多数权力 */
export function getConstitutionalPowers(hasMajority: boolean): ConstitutionalPowers {
  if (!hasMajority) {
    return {
      canProposeAmendment: false,
      canSkipObstruction: false,
      canForceStopDelay: false,
      canFastTrack: false,
      disciplineVotingBonus: 0,
      committeeSeatAdvantage: 0,
    };
  }
  return {
    canProposeAmendment: true,
    canSkipObstruction: true,
    canForceStopDelay: true,
    canFastTrack: true,
    disciplineVotingBonus: 10,
    committeeSeatAdvantage: 5, // 百分比
  };
}

/** 强制终止委员会搁置（绝对多数权力） */
export function forceStopCommitteeDelay(bill: Bill, hasMajority: boolean): Bill {
  if (!hasMajority) return bill;
  if (bill.status !== 'delayed') return bill;
  return { ...bill, status: 'revised', committeeNote: '绝对多数行使权力，强制终止搁置' };
}

/** 应用 Fast Track Legislation（跳过委员会阶段） */
export function fastTrackBill(bill: Bill, hasMajority: boolean): Bill {
  if (!hasMajority) return bill;
  if (bill.status !== 'in_committee' && bill.status !== 'delayed') return bill;
  return { ...bill, status: 'voting', committeeNote: '绝对多数启动 Fast Track' };
}

/** 校验修宪法案 */
export function validateConstitutionalBill(
  bill: Bill,
  government: Government,
  electionResult: ElectionResult,
): RuleValidationResult {
  const hasSuper = hasConstitutionalMajority(government, electionResult);
  if (!hasSuper) {
    return { valid: false, reason: '执政联盟未达到绝对多数(134席)，无法提出修宪法案' };
  }
  if (!bill.isConstitutionalAmendment) {
    return { valid: false, reason: '该法案未被标记为修宪法案' };
  }
  return { valid: true };
}

/** 判定法案表决结果（含修宪门槛） */
export function resolveBillStatus(
  votesFor: number,
  votesAgainst: number,
  isConstitutionalAmendment: boolean,
  totalSeats: number,
): BillStatus {
  if (isConstitutionalAmendment) {
    // 修宪法案需要 2/3 以上赞成
    return votesFor >= Math.ceil(totalSeats * 2 / 3) ? 'passed' : 'rejected';
  }
  // 普通法案: 出席过半
  return votesFor > votesAgainst ? 'passed' : 'rejected';
}

/** 计算绝对多数纪律投票加成 */
export function calculateDisciplineBonus(hasMajority: boolean): number {
  return hasMajority ? 10 : 0;
}

/** 计算委员会席位分配优势 */
export function getCommitteeSeatAdvantage(hasMajority: boolean): number {
  return hasMajority ? 5 : 0; // 百分比加成
}
