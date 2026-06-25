/**
 * Economy Engine — 每回合资金 faucet/sink（Phase G Q7）
 *
 * 平衡型设计：每回合净 ±0
 *   Faucet：办公津贴 +30、委员会津贴 +20、派阀贡献 +10 = +60
 *   Sink：办公费 -30、员工薪资 -20、活动基金 -10 = -60
 *
 * 增长靠玩家主动行为：
 *   - 募款活动 +50（消耗 1 行动点）
 *   - 利益集团捐款事件 +100~300
 */

import type { GameState, AIIntent } from '../types';
import { FUNDS_FAUCET_SINK } from '../config/gameBalance';

// ============================================================================
// 每回合推进
// ============================================================================

/**
 * 每回合应用 faucet/sink 到所有党派资金。
 *
 * 平衡型：每党每回合净 ±0（除非有派阀 → +10 净增）
 *
 * @returns   新的 GameState
 */
export function advanceEconomyTurn(state: GameState): GameState {
  const newParties = state.parties.map(party => {
    // Faucet（基础，所有党派）
    let delta =
      FUNDS_FAUCET_SINK.officeAllowance +
      FUNDS_FAUCET_SINK.committeeAllowance +
      FUNDS_FAUCET_SINK.membershipDues;

    // 派阀额外贡献（仅派阀成员党派）
    if (party.factions && party.factions.length > 0) {
      delta += FUNDS_FAUCET_SINK.factionContribution;
    }

    // Sink
    delta += FUNDS_FAUCET_SINK.officeCost;
    delta += FUNDS_FAUCET_SINK.staffSalary;
    delta += FUNDS_FAUCET_SINK.activityFund;

    return {
      ...party,
      funds: Math.max(0, party.funds + delta),
    };
  });

  return { ...state, parties: newParties };
}

// ============================================================================
// 玩家主动募款
// ============================================================================

/**
 * 玩家发起募款活动。
 *
 * 消耗 1 行动点（由调用方追踪），增加党派资金 +50。
 * 派阀成员额外获得 +20% 加成（即总共 +60）。
 *
 * @returns   { state, intent } — 新的 GameState 和 fundraising intent
 */
export function runFundraising(
  state: GameState,
  mpKey: string,
): { state: GameState; intent: AIIntent } {
  const mp = state.mpPersonalities[mpKey];
  const partyId = mp?.partyId ?? '';
  const baseGain = FUNDS_FAUCET_SINK.fundraisingActionGain;

  // 派阀募款加成（如有）：+20%
  let totalGain = baseGain;
  if (mp?.factionId) {
    const bonus = Math.round(baseGain * 0.2);
    totalGain += bonus;
  }

  // 应用党派资金加成
  const newParties = state.parties.map(p => {
    if (p.id !== partyId) return p;
    return { ...p, funds: Math.max(0, p.funds + totalGain) };
  });

  // 生成 fundraising intent 供 narrativeEngine 记录事件
  const intent: AIIntent = {
    id: `intent-fundraising-${mpKey}-${Date.now()}`,
    type: 'fundraising',
    source: mpKey,
    payload: {
      mpKey,
      partyId,
      gain: totalGain,
    },
    turn: state.turn,
  };

  return {
    state: { ...state, parties: newParties },
    intent,
  };
}

// ============================================================================
// 利益集团捐款事件
// ============================================================================

/**
 * 触发利益集团捐款事件。
 *
 * 在事件系统中作为 random event 调用，给某党派 +100~300 资金。
 */
export function applyDonationEvent(
  state: GameState,
  partyId: string,
  amount?: number,
): { state: GameState; donation: number } {
  const [min, max] = FUNDS_FAUCET_SINK.donationEventRange;
  const donation = amount ?? Math.round(min + Math.random() * (max - min));

  const newParties = state.parties.map(p => {
    if (p.id !== partyId) return p;
    return { ...p, funds: Math.max(0, p.funds + donation) };
  });

  return {
    state: { ...state, parties: newParties },
    donation,
  };
}

// ============================================================================
// 调试 / 验证
// ============================================================================

/**
 * 计算每回合净 faucet/sink（无派阀=0；有派阀=+10）。
 *
 * 用于测试验证平衡性。
 */
export function getNetFaucetSinkPerTurn(hasFaction: boolean): number {
  let net = 0;
  net += FUNDS_FAUCET_SINK.officeAllowance;
  net += FUNDS_FAUCET_SINK.committeeAllowance;
  net += FUNDS_FAUCET_SINK.membershipDues;  // 基础
  if (hasFaction) net += FUNDS_FAUCET_SINK.factionContribution;
  net += FUNDS_FAUCET_SINK.officeCost;
  net += FUNDS_FAUCET_SINK.staffSalary;
  net += FUNDS_FAUCET_SINK.activityFund;
  return net;
}
