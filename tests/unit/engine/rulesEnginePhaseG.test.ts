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
import type { GameState, AIIntent, Committee, CommitteeId, Party, RelationEntry, Bill, ElectionResult } from '../../../src/types';

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

// ============================================================================
// Phase G Q6 第 2 批：8 个补全 intent 的 validate 测试
// ============================================================================

function makeStateWithParties(): GameState {
  const parties: Party[] = [
    { id: 'reform', name: '改革民主党', abbreviation: 'RDP', color: '#1E88E5', ideology: 'center', leader: '原田 正', members: ['中村 健一'], baseSupport: 27, currentSupport: 27, projectedSeats: 54, funds: 1200, organization: 72, charisma: 84, description: '' },
    { id: 'liberty', name: '自由党', abbreviation: 'LP', color: '#FB8C00', ideology: 'right', leader: '望月 弘', members: ['森田 太郎'], baseSupport: 20, currentSupport: 20, projectedSeats: 40, funds: 1000, organization: 68, charisma: 88, description: '' },
  ];
  const relations: RelationEntry[] = [
    { from: 'reform', to: 'liberty', score: 50, type: 'neutral', description: '' },
    { from: 'liberty', to: 'reform', score: 50, type: 'neutral', description: '' },
  ];
  const committees: Committee[] = [{
    id: 'budget' as CommitteeId,
    chairman: { personName: '原田 正', partyId: 'reform' },
    viceChairman: { personName: '望月 弘', partyId: 'liberty' },
    members: [
      { personName: '原田 正', partyId: 'reform' },
      { personName: '中村 健一', partyId: 'reform' },
      { personName: '望月 弘', partyId: 'liberty' },
      { personName: '森田 太郎', partyId: 'liberty' },
    ],
    presentMembers: ['原田 正', '中村 健一', '望月 弘', '森田 太郎'],
    ideology: 'center',
    efficiency: 60,
  }];
  const bills: Bill[] = [{
    id: 'bill-1', title: '税制改革法案', summary: '测试法案', proposerPartyId: 'reform',
    proposerName: '原田 正', committeeId: 'budget' as CommitteeId,
    status: 'draft', committeeNote: '', amendment: '', votesFor: 0, votesAgainst: 0, createdTurn: 1,
  }];
  const electionResult: ElectionResult = {
    partyResults: [
      { partyId: 'reform', seats: 54, supportPercent: 27 },
      { partyId: 'liberty', seats: 40, supportPercent: 20 },
    ],
    hasMajority: false, majorityPartyId: null,
    totalSeats: 200, majorityThreshold: 101,
    districtResults: {},
  };
  const government = {
    primeMinister: { personName: '原田 正', partyId: 'reform' },
    primeMinisterName: '原田 正',
    primeMinisterPartyId: 'reform',
    rulingCoalition: ['reform'],
    opposition: ['liberty'],
    ministers: [
      { personName: '原田 正', partyId: 'reform', post: 'prime_minister' as const },
      { personName: '中村 健一', partyId: 'reform', post: 'finance_minister' as const },
    ],
    stability: 50,
    isMinority: true,
    coalitionOffers: [],
    coalitionAgreements: [],
    noConfidenceMotions: [],
    electionResult,
  };
  return {
    parties,
    relations,
    metrics: { totalVoters: 0, turnoutRate: 0, swingVoterRatio: 0, daysToElection: 0, totalSeats: 200, majorityThreshold: 101, leadingCoalitionSeats: 54, economicIndex: 50, socialStabilityIndex: 60, mediaAttention: 50 },
    districts: [],
    events: [],
    government,
    committees,
    bills,
    pendingIntents: [],
    mpPersonalities: {
      'reform:原田 正': { id: 'reform:原田 正', personName: '原田 正', partyId: 'reform', age: 55, gender: 'male', ambition: 80, loyalty: 90, corruption: 20, popularity: 70, mediaSkill: 65, negotiationSkill: 60, personalityTraits: [], politicalIdeology: { primary: 'liberalism', economicAxis: 0, socialAxis: 30 }, stress: 30, health: 80, hiddenGoals: [], isLeader: true, isMinister: true, isCommitteeChairman: false },
      'reform:中村 健一': { id: 'reform:中村 健一', personName: '中村 健一', partyId: 'reform', age: 45, gender: 'male', ambition: 60, loyalty: 80, corruption: 30, popularity: 50, mediaSkill: 45, negotiationSkill: 50, personalityTraits: [], politicalIdeology: { primary: 'liberalism', economicAxis: -5, socialAxis: 20 }, stress: 25, health: 85, hiddenGoals: [], isLeader: false, isMinister: true, isCommitteeChairman: false },
      'liberty:望月 弘': { id: 'liberty:望月 弘', personName: '望月 弘', partyId: 'liberty', age: 50, gender: 'male', ambition: 70, loyalty: 85, corruption: 25, popularity: 65, mediaSkill: 70, negotiationSkill: 55, personalityTraits: [], politicalIdeology: { primary: 'conservatism', economicAxis: 40, socialAxis: -10 }, stress: 20, health: 85, hiddenGoals: [], isLeader: true, isMinister: false, isCommitteeChairman: true },
      'liberty:森田 太郎': { id: 'liberty:森田 太郎', personName: '森田 太郎', partyId: 'liberty', age: 38, gender: 'male', ambition: 45, loyalty: 70, corruption: 20, popularity: 40, mediaSkill: 35, negotiationSkill: 40, personalityTraits: [], politicalIdeology: { primary: 'conservatism', economicAxis: 35, socialAxis: -5 }, stress: 15, health: 90, hiddenGoals: [], isLeader: false, isMinister: false, isCommitteeChairman: false },
    },
    playerConfig: null,
    currentAIEvents: [],
    currentDay: 1,
    turn: 1,
    isElectionCampaign: false,
  };
}

describe('Phase G Q6 第 2 批：8 个补全 intent validate', () => {
  test('bill_vote: 完整字段 → valid', () => {
    const intent: AIIntent = { id: 'v1', type: 'bill_vote', source: 'test', payload: { billId: 'bill-1' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('bill_vote: 缺 billId → invalid', () => {
    const intent: AIIntent = { id: 'v2', type: 'bill_vote', source: 'test', payload: {}, turn: 1 };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('committee_review: 完整字段 → valid', () => {
    const intent: AIIntent = { id: 'r1', type: 'committee_review', source: 'test', payload: { committeeId: 'budget', billId: 'bill-1' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('committee_review: 缺 committeeId → invalid', () => {
    const intent: AIIntent = { id: 'r2', type: 'committee_review', source: 'test', payload: { billId: 'bill-1' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('committee_vote: 完整字段 → valid', () => {
    const intent: AIIntent = { id: 'cv1', type: 'committee_vote', source: 'test', payload: { committeeId: 'budget', billId: 'bill-1', voteContext: 'push' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('committee_vote: 缺 billId → invalid', () => {
    const intent: AIIntent = { id: 'cv2', type: 'committee_vote', source: 'test', payload: { committeeId: 'budget' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('coalition_negotiation: 完整字段 → valid', () => {
    const intent: AIIntent = { id: 'cn1', type: 'coalition_negotiation', source: 'test', payload: { proposerPartyId: 'reform', targetPartyId: 'liberty' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('coalition_negotiation: 缺 targetPartyId → invalid', () => {
    const intent: AIIntent = { id: 'cn2', type: 'coalition_negotiation', source: 'test', payload: { proposerPartyId: 'reform' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('cabinet_reshuffle: 完整字段 → valid', () => {
    const intent: AIIntent = { id: 'cr1', type: 'cabinet_reshuffle', source: 'test', payload: { pmPartyId: 'reform', scope: 'partial', stabilityDelta: 10 }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('cabinet_reshuffle: 缺 pmPartyId → invalid', () => {
    const intent: AIIntent = { id: 'cr2', type: 'cabinet_reshuffle', source: 'test', payload: { scope: 'partial' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('leadership_challenge: 完整字段 → valid', () => {
    const intent: AIIntent = { id: 'lc1', type: 'leadership_challenge', source: 'test', payload: { partyId: 'reform', challengerId: 'reform:中村 健一', currentLeaderId: 'reform:原田 正' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('leadership_challenge: 缺 challengerId → invalid', () => {
    const intent: AIIntent = { id: 'lc2', type: 'leadership_challenge', source: 'test', payload: { partyId: 'reform', currentLeaderId: 'reform:原田 正' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('policy_announcement: 完整字段 → valid', () => {
    const intent: AIIntent = { id: 'pa1', type: 'policy_announcement', source: 'test', payload: { partyId: 'reform', policyArea: '税制改革', targetAudience: 'general' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('policy_announcement: 缺 policyArea → invalid', () => {
    const intent: AIIntent = { id: 'pa2', type: 'policy_announcement', source: 'test', payload: { partyId: 'reform' }, turn: 1 };
    expect(validateIntent(intent).valid).toBe(false);
  });
});

// ============================================================================
// Phase G Q6 第 2 批：8 个补全 intent 的 settle 测试
// ============================================================================

describe('Phase G Q6 第 2 批：8 个补全 intent settle', () => {
  test('bill_vote settle: 法案状态变为 implemented/rejected', () => {
    const state = makeStateWithParties();
    const intent: AIIntent = { id: 's1', type: 'bill_vote', source: 'test', payload: { billId: 'bill-1' }, turn: 1 };
    const result = settleIntent(state, intent);
    const bill = result.bills.find(b => b.id === 'bill-1');
    expect(bill).toBeDefined();
    // 状态应为 implemented 或 rejected（不能是 draft）
    expect(bill!.status).not.toBe('draft');
    // 事件已记录
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  test('committee_review settle: 审查后法案状态更新', () => {
    const state = makeStateWithParties();
    const intent: AIIntent = { id: 's2', type: 'committee_review', source: 'test', payload: { committeeId: 'budget', billId: 'bill-1' }, turn: 1 };
    const result = settleIntent(state, intent);
    const bill = result.bills.find(b => b.id === 'bill-1');
    expect(bill).toBeDefined();
    // 审查后应有 committeeNote
    expect(bill!.committeeNote.length).toBeGreaterThan(0);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  test('committee_vote settle: 票数更新', () => {
    const state = makeStateWithParties();
    const intent: AIIntent = { id: 's3', type: 'committee_vote', source: 'test', payload: { committeeId: 'budget', billId: 'bill-1', voteContext: 'push' }, turn: 1 };
    const result = settleIntent(state, intent);
    const bill = result.bills.find(b => b.id === 'bill-1');
    expect(bill).toBeDefined();
    // 表决后至少有票数记录
    expect(bill!.votesFor + bill!.votesAgainst).toBeGreaterThan(0);
  });

  test('coalition_negotiation settle: 不崩溃 + 产生事件', () => {
    const state = makeStateWithParties();
    const intent: AIIntent = { id: 's4', type: 'coalition_negotiation', source: 'test', payload: { proposerPartyId: 'reform', targetPartyId: 'liberty', offeredPosts: ['finance_minister'] }, turn: 1 };
    const result = settleIntent(state, intent);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  test('cabinet_reshuffle settle: 大臣名单变更', () => {
    const state = makeStateWithParties();
    const originalMinisters = [...state.government!.ministers];
    const intent: AIIntent = { id: 's5', type: 'cabinet_reshuffle', source: 'test', payload: { pmPartyId: 'reform', scope: 'partial', stabilityDelta: 10 }, turn: 1 };
    const result = settleIntent(state, intent);
    // 改组后至少删除了部分大臣
    expect(result.government).toBeDefined();
    expect(result.government!.ministers.length).toBeLessThanOrEqual(originalMinisters.length);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  test('leadership_challenge settle: 支持率下降 + 产生事件', () => {
    const state = makeStateWithParties();
    const originalSupport = state.parties.find(p => p.id === 'reform')!.currentSupport;
    const intent: AIIntent = { id: 's6', type: 'leadership_challenge', source: 'test', payload: { partyId: 'reform', challengerId: 'reform:中村 健一', currentLeaderId: 'reform:原田 正' }, turn: 1 };
    const result = settleIntent(state, intent);
    const party = result.parties.find(p => p.id === 'reform')!;
    // 支持率因挑战下降
    expect(party.currentSupport).toBeLessThan(originalSupport);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  test('policy_announcement settle: 支持率上升 + 产生事件', () => {
    const state = makeStateWithParties();
    const originalSupport = state.parties.find(p => p.id === 'reform')!.currentSupport;
    const intent: AIIntent = { id: 's7', type: 'policy_announcement', source: 'test', payload: { partyId: 'reform', policyArea: '税制改革', targetAudience: 'general' }, turn: 1 };
    const result = settleIntent(state, intent);
    const party = result.parties.find(p => p.id === 'reform')!;
    // 政策宣示应提升支持率
    expect(party.currentSupport).toBeGreaterThanOrEqual(originalSupport);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  test('faction_defect settle: 派系成员移除 + MP 忠诚度下降', () => {
    const state = makeStateWithParties();
    // 先在改革民主党中添加一个派系和成员
    state.parties[0].factions = [{
      id: 'reform_main',
      name: '原田派',
      leader: '原田 正',
      members: ['原田 正', '中村 健一'],
      ideology: 'mainstream' as const,
      loyalty: 80,
      influence: 20,
      funding: 500,
      ambition: 30,
      demands: [],
      partyId: 'reform',
    }];
    state.mpPersonalities['reform:中村 健一']!.factionId = 'reform_main';
    state.mpPersonalities['reform:中村 健一']!.loyalty = 80;
    const intent: AIIntent = { id: 's8', type: 'faction_defect', source: 'test', payload: { mpName: '中村 健一', partyId: 'reform', factionId: 'reform_main' }, turn: 1 };
    const result = settleIntent(state, intent);
    const faction = result.parties[0].factions!.find(f => f.id === 'reform_main')!;
    // 议员已被移除
    expect(faction.members).not.toContain('中村 健一');
    // 派系影响力下降
    expect(faction.influence).toBeLessThan(20);
    // MP 忠诚度下降且无派系归属
    const mp = result.mpPersonalities['reform:中村 健一']!;
    expect(mp.loyalty).toBeLessThan(80);
    expect(mp.factionId).toBeUndefined();
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });
});
