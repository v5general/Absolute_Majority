/**
 * rulesEngine 扩展测试（Phase G Q4 + Q6 + balance-check）
 *
 * 测试范围：
 *   - isBudgetMultiplierActive（4 种组合）
 *   - applyCampaignMultipliers
 *   - getChairmanWeightMultiplier
 *   - 6 个新 intent 的 validate + settle
 *
 * 运行: npm test
 */

import { describe, test, expect } from 'vitest';
import {
  validateIntent,
  settleIntent,
  isBudgetMultiplierActive,
  applyCampaignMultipliers,
  getChairmanWeightMultiplier,
  isStrongRelationCapped,
} from '../../../src/engine/rulesEngine';
import { COMMITTEE_CHAIRMAN_BONUSES } from '../../../src/config/gameBalance';
import type { GameState, AIIntent, Committee, CommitteeId } from '../../../src/types';

// ============================================================================
// Fixtures
// ============================================================================

function makeBudgetCommitteeState(turn: number, hasBudget: boolean): GameState {
  const committees: Committee[] = hasBudget
    ? [{
        id: 'budget' as CommitteeId,
        chairman: { personName: 'chair', partyId: 'reform' },
        viceChairman: { personName: 'vice', partyId: 'reform' },
        members: [{ personName: 'm1', partyId: 'reform' }],
        presentMembers: ['m1'],
        ideology: 'center',
        efficiency: 50,
      }]
    : [];
  return {
    parties: [],
    relations: [],
    metrics: {
      totalVoters: 0, turnoutRate: 0, swingVoterRatio: 0,
      daysToElection: 0, totalSeats: 200, majorityThreshold: 101,
      leadingCoalitionSeats: 0, economicIndex: 50,
      socialStabilityIndex: 60, mediaAttention: 50,
    },
    districts: [],
    events: [],
    government: null,
    committees,
    bills: [],
    pendingIntents: [],
    mpPersonalities: {},
    playerConfig: null,
    currentAIEvents: [],
    currentDay: 1,
    turn,
    isElectionCampaign: false,
  };
}

// ============================================================================
// Phase G Q4：isBudgetMultiplierActive
// ============================================================================

describe('isBudgetMultiplierActive 4 种组合', () => {
  test('1-3 月 + 有预算委员会 → true', () => {
    const state = makeBudgetCommitteeState(2, true); // 2 月
    expect(isBudgetMultiplierActive(state)).toBe(true);
  });

  test('1-3 月 + 无预算委员会 → false', () => {
    const state = makeBudgetCommitteeState(2, false);
    expect(isBudgetMultiplierActive(state)).toBe(false);
  });

  test('非 1-3 月 + 有预算委员会 → false', () => {
    const state = makeBudgetCommitteeState(6, true); // 6 月
    expect(isBudgetMultiplierActive(state)).toBe(false);
  });

  test('非 1-3 月 + 无预算委员会 → false', () => {
    const state = makeBudgetCommitteeState(6, false);
    expect(isBudgetMultiplierActive(state)).toBe(false);
  });

  test('指定 committeeId="budget" 在 1-3 月 → true', () => {
    const state = makeBudgetCommitteeState(3, true);
    expect(isBudgetMultiplierActive(state, 'budget')).toBe(true);
  });

  test('指定 committeeId="general" 在 1-3 月 → false', () => {
    const state = makeBudgetCommitteeState(3, true);
    expect(isBudgetMultiplierActive(state, 'general')).toBe(false);
  });
});

// ============================================================================
// applyCampaignMultipliers
// ============================================================================

describe('applyCampaignMultipliers', () => {
  test('supportDelta × 1.5', () => {
    const intent: AIIntent = {
      id: 'test-1',
      type: 'support_change',
      source: 'test',
      payload: { supportDelta: { reform: 10 } },
      turn: 1,
    };
    const scaled = applyCampaignMultipliers(intent);
    expect(scaled.payload.supportDelta).toEqual({ reform: 15 });
  });

  test('metricsDelta.mediaAttention × 2.0', () => {
    const intent: AIIntent = {
      id: 'test-2',
      type: 'metrics_change',
      source: 'test',
      payload: { metricsDelta: { mediaAttention: 5 } },
      turn: 1,
    };
    const scaled = applyCampaignMultipliers(intent);
    expect(scaled.payload.metricsDelta).toEqual({ mediaAttention: 10 });
  });

  test('无 supportDelta 时不添加该字段', () => {
    const intent: AIIntent = {
      id: 'test-3',
      type: 'metrics_change',
      source: 'test',
      payload: { metricsDelta: { economicIndex: 1 } },
      turn: 1,
    };
    const scaled = applyCampaignMultipliers(intent);
    expect(scaled.payload.supportDelta).toBeUndefined();
  });

  test('保留原 intent 不变（不可变）', () => {
    const intent: AIIntent = {
      id: 'test-4',
      type: 'support_change',
      source: 'test',
      payload: { supportDelta: { reform: 10 } },
      turn: 1,
    };
    applyCampaignMultipliers(intent);
    expect(intent.payload.supportDelta).toEqual({ reform: 10 }); // 不变
  });
});

// ============================================================================
// getChairmanWeightMultiplier
// ============================================================================

describe('getChairmanWeightMultiplier', () => {
  test('push → 1.3', () => {
    expect(getChairmanWeightMultiplier('push'))
      .toBe(1.0 + COMMITTEE_CHAIRMAN_BONUSES.pushForward);
    expect(getChairmanWeightMultiplier('push')).toBe(1.3);
  });

  test('shelve → 1.5', () => {
    expect(getChairmanWeightMultiplier('shelve'))
      .toBe(1.0 + COMMITTEE_CHAIRMAN_BONUSES.shelve);
    expect(getChairmanWeightMultiplier('shelve')).toBe(1.5);
  });

  test('amend → 1.2', () => {
    expect(getChairmanWeightMultiplier('amend'))
      .toBe(1.0 + COMMITTEE_CHAIRMAN_BONUSES.amendment);
    expect(getChairmanWeightMultiplier('amend')).toBe(1.2);
  });
});

// ============================================================================
// 6 个程序性 intent 校验
// ============================================================================

describe('6 个程序性 intent 的 validate', () => {
  test('political_capital_change: 有 delta → valid', () => {
    const intent: AIIntent = {
      id: '1', type: 'political_capital_change', source: 'test',
      payload: { capitalDelta: { 'reform:mp1': 5 } }, turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('political_capital_change: 缺 delta → invalid', () => {
    const intent: AIIntent = {
      id: '2', type: 'political_capital_change', source: 'test',
      payload: {}, turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('fundraising: 有 mpKey → valid', () => {
    const intent: AIIntent = {
      id: '3', type: 'fundraising', source: 'test',
      payload: { mpKey: 'reform:mp1' }, turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('fundraising: 缺 mpKey → invalid', () => {
    const intent: AIIntent = {
      id: '4', type: 'fundraising', source: 'test',
      payload: {}, turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('no_confidence_proposal: 联署 ≥ 20 → valid', () => {
    const intent: AIIntent = {
      id: '5', type: 'no_confidence_proposal', source: 'test',
      payload: {
        proposingPartyId: 'progressive',
        signatories: Array.from({ length: 20 }, (_, i) => `mp${i}`),
      },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('no_confidence_proposal: 联署 < 20 → invalid', () => {
    const intent: AIIntent = {
      id: '6', type: 'no_confidence_proposal', source: 'test',
      payload: {
        proposingPartyId: 'progressive',
        signatories: Array.from({ length: 15 }, (_, i) => `mp${i}`),
      },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('dissolution_decision: 有 pmPartyId → valid', () => {
    const intent: AIIntent = {
      id: '7', type: 'dissolution_decision', source: 'test',
      payload: { pmPartyId: 'reform', willingness: 0.7 }, turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('leadership_campaign: 完整字段 → valid', () => {
    const intent: AIIntent = {
      id: '8', type: 'leadership_campaign', source: 'test',
      payload: {
        partyId: 'reform',
        challengerId: 'reform:mp1',
        currentLeaderId: 'reform:leader',
      },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('leadership_campaign: 缺 challengerId → invalid', () => {
    const intent: AIIntent = {
      id: '9', type: 'leadership_campaign', source: 'test',
      payload: { partyId: 'reform', currentLeaderId: 'reform:leader' },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('bill_draft: 完整字段 → valid', () => {
    const intent: AIIntent = {
      id: '10', type: 'bill_draft', source: 'test',
      payload: {
        title: '测试法案',
        proposerPartyId: 'reform',
        targetCommitteeId: 'budget',
        summary: '...',
      },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('bill_draft: 缺 targetCommitteeId → invalid', () => {
    const intent: AIIntent = {
      id: '11', type: 'bill_draft', source: 'test',
      payload: { title: '测试法案', proposerPartyId: 'reform' },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('parliament_questioning: 完整字段 → valid', () => {
    const intent: AIIntent = {
      id: '12', type: 'parliament_questioning', source: 'test',
      payload: {
        questionerPartyId: 'progressive',
        targetMinisterName: '财务大臣',
        topic: '预算问题',
        questionTime: 15,
      },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('committee_deliberation: 完整字段 → valid', () => {
    const intent: AIIntent = {
      id: '13', type: 'committee_deliberation', source: 'test',
      payload: {
        committeeId: 'budget',
        billId: 'bill-1',
        deliberationType: 'push',
        outcome: '推进审议',
      },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('committee_deliberation: 缺 deliberationType → invalid', () => {
    const intent: AIIntent = {
      id: '14', type: 'committee_deliberation', source: 'test',
      payload: { committeeId: 'budget' },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });
});

// ============================================================================
// isStrongRelationCapped
// ============================================================================

describe('isStrongRelationCapped', () => {
  test('无强关系 → false', () => {
    const state: GameState = {
      ...makeBudgetCommitteeState(1, false),
      relations: [
        { from: 'reform', to: 'liberty', score: 50, type: 'neutral', description: '' },
      ],
    };
    expect(isStrongRelationCapped(state, 'reform')).toBe(false);
  });

  test('4 条强关系 → true', () => {
    const state: GameState = {
      ...makeBudgetCommitteeState(1, false),
      relations: [
        { from: 'reform', to: 'liberty', score: 80, type: 'alliance', description: '' },
        { from: 'reform', to: 'conservative', score: 75, type: 'alliance', description: '' },
        { from: 'reform', to: 'progressive', score: 70, type: 'alliance', description: '' },
        { from: 'reform', to: 'populist', score: 65, type: 'alliance', description: '' },
      ],
    };
    expect(isStrongRelationCapped(state, 'reform')).toBe(true);
  });

  test('仅统计 from 匹配的关系', () => {
    const state: GameState = {
      ...makeBudgetCommitteeState(1, false),
      relations: [
        { from: 'reform', to: 'liberty', score: 80, type: 'alliance', description: '' },
        { from: 'liberty', to: 'conservative', score: 80, type: 'alliance', description: '' },
        { from: 'liberty', to: 'progressive', score: 80, type: 'alliance', description: '' },
        { from: 'liberty', to: 'populist', score: 80, type: 'alliance', description: '' },
        { from: 'liberty', to: 'solidarity', score: 80, type: 'alliance', description: '' },
      ],
    };
    // liberty 已达上限（4 条强关系）
    expect(isStrongRelationCapped(state, 'liberty')).toBe(true);
    // reform 只有 1 条
    expect(isStrongRelationCapped(state, 'reform')).toBe(false);
  });
});
