import type { GameState } from '../types/game';

/** 解散众议院 */
export function dissolveLowerHouse(
  state: GameState,
  _reason: 'voluntary' | 'no_confidence' | 'crisis' | 'coalition_collapse',
): GameState {
  if (!state.government) return state;

  // 所有法案自动失效（撤回）
  const withdrawnBills = state.bills.map(b =>
    (b.status === 'passed' || b.status === 'implemented')
      ? b
      : { ...b, status: 'withdrawn' as const, committeeNote: (b.committeeNote || '') + ' [众议院解散，法案自动撤回]' }
  );

  // 委员会停止运作
  const stoppedCommittees = state.committees.map(c => ({
    ...c,
    presentMembers: [],
    efficiency: 0,
  }));

  // 内阁转入看守状态
  const caretakerGovernment = {
    ...state.government,
    isCaretaker: true,
  };

  return {
    ...state,
    bills: withdrawnBills,
    committees: stoppedCommittees,
    government: caretakerGovernment,
    isElectionCampaign: true,
    turnsUntilElection: 0,
  };
}

/** 计算 AI 首相的解散意愿 (0-100) */
export function calculateDissolutionWillingness(state: GameState): number {
  if (!state.government) return 0;

  const gov = state.government;
  const coalitionSeats = gov.rulingCoalition.reduce((sum, pid) => {
    const r = gov.electionResult.partyResults.find(er => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  const pmParty = state.parties.find(p => p.id === gov.primeMinisterPartyId);
  const pmSupport = pmParty?.currentSupport ?? 0;

  // 因子: 政府支持率 (0-40)
  const approvalScore = Math.min(40, pmSupport * 0.9);

  // 因子: 联盟强度 (0-30)
  const majorityThreshold = state.metrics.majorityThreshold;
  const coalitionStrength = coalitionSeats >= majorityThreshold
    ? 20 + Math.min(10, (coalitionSeats - majorityThreshold) * 0.5)
    : Math.max(0, 10 - (majorityThreshold - coalitionSeats) * 0.3);

  // 因子: 经济 (0-15)
  const economyScore = Math.min(15, state.metrics.economicIndex / 7);

  // 因子: 反对党分散度 (0-15)
  const oppositionParties = state.parties.filter(p => !gov.rulingCoalition.includes(p.id));
  const maxOpposition = Math.max(...oppositionParties.map(p => p.currentSupport), 0);
  const oppositionFragmentation = Math.max(0, 15 - maxOpposition * 0.5);

  // 稳定度惩罚
  const stabilityPenalty = (100 - gov.stability) * 0.2;

  // 支持率 > 45% 且反对党分散 → 提高解散概率
  const bonus = (pmSupport > 45 && maxOpposition < 25) ? 15 : 0;

  return Math.round(
    Math.max(0, Math.min(100,
      approvalScore + coalitionStrength + economyScore + oppositionFragmentation + bonus - stabilityPenalty
    ))
  );
}

/** 触发法定大选（任期届满） */
export function triggerMandatoryElection(state: GameState): GameState {
  return {
    ...state,
    isElectionCampaign: true,
    turnsUntilElection: 0,
  };
}

/** 判断任期是否已届满 */
export function isTermExpired(state: GameState): boolean {
  return (state.turnsUntilElection ?? 48) <= 0;
}
