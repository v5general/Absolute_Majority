/**
 * rulesEngine 单元测试
 *
 * 测试范围（按 P0 优先级）:
 *   - 不信任案阈值（NO_CONFIDENCE_THRESHOLD）
 *   - 委员会法定人数（QUORUM_RATIO）
 *   - 联盟协议校验
 *   - AI 意图校验（validateIntent 各分支）
 *   - 意图结算（settleIntent 数值边界）
 *   - 席位重算（recalcSeats 总和守恒）
 *
 * 运行: npm test
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  NO_CONFIDENCE_THRESHOLD,
  QUORUM_RATIO,
  createNoConfidenceMotion,
  validateNoConfidenceMotion,
  hasQuorum,
  validateCommitteeVote,
  initializeCommitteeAttendance,
  setCommitteeAttendance,
  createCoalitionAgreement,
  validateCoalitionAgreement,
  createIntentFromEffects,
  validateIntent,
  settleIntent,
  settleIntents,
  recalcSeats,
} from '../../../src/engine/rulesEngine';
import type {
  GameState,
  NoConfidenceMotion,
  Committee,
  AIIntent,
  Party,
  ElectionResult,
} from '../../../src/types';

// ============================================================================
// 测试夹具（fixtures）
// ============================================================================

function makeTestParty(id: string, support = 25, seats = 30): Party {
  return {
    id,
    name: `党${id}`,
    abbreviation: id.toUpperCase(),
    color: '#000',
    ideology: 'center',
    leader: `党首${id}`,
    description: '测试用党',
    members: [],
    baseSupport: support,
    currentSupport: support,
    projectedSeats: seats,
    funds: 100,
    organization: 50,
    charisma: 50,
  };
}

function makeTestCommittee(memberCount: number, presentCount: number): Committee {
  const members = Array.from({ length: memberCount }, (_, i) => ({
    personName: `议员${i}`,
    partyId: 'reform',
  }));
  const presentMembers = members.slice(0, presentCount).map(m => m.personName);
  return {
    id: 'general',
    chairman: members[0],
    viceChairman: members[1],
    members,
    presentMembers,
    ideology: 'center',
    efficiency: 50,
  };
}

function makeTestState(parties?: Party[]): GameState {
  const base: GameState = {
    parties: parties ?? [
      makeTestParty('reform', 25, 50),
      makeTestParty('liberty', 20, 40),
      makeTestParty('conservative', 18, 35),
      makeTestParty('progressive', 15, 30),
      makeTestParty('populist', 12, 25),
      makeTestParty('solidarity', 10, 20),
    ],
    relations: [
      { from: 'reform', to: 'liberty', score: 30, type: 'friendly', description: 'test' },
    ],
    metrics: {
      totalVoters: 100000000,
      turnoutRate: 60,
      swingVoterRatio: 20,
      daysToElection: 1440,
      totalSeats: 200,
      majorityThreshold: 101,
      leadingCoalitionSeats: 100,
      economicIndex: 50,
      socialStabilityIndex: 60,
      mediaAttention: 50,
    },
    districts: [],
    events: [],
    government: null,
    committees: [],
    bills: [],
    pendingIntents: [],
    mpPersonalities: {},
    playerConfig: null,
    currentAIEvents: [],
    currentDay: 1,
    turn: 1,
    turnsUntilElection: 48,
    isElectionCampaign: false,
  };
  return base;
}

// ============================================================================
// 1. 不信任案规则
// ============================================================================

describe('不信任案规则', () => {
  test('NO_CONFIDENCE_THRESHOLD 应为 20（CONSTITUTION 第 243 行）', () => {
    expect(NO_CONFIDENCE_THRESHOLD).toBe(20);
  });

  test('createNoConfidenceMotion 在联署 ≥ 20 时 meetsThreshold = true', () => {
    const signatories = Array.from({ length: 20 }, (_, i) => `mp-${i}`);
    const motion = createNoConfidenceMotion(signatories, 'progressive', 5);
    expect(motion.meetsThreshold).toBe(true);
    expect(motion.SIGNATURE_THRESHOLD).toBe(20);
  });

  test('createNoConfidenceMotion 在联署 < 20 时 meetsThreshold = false', () => {
    const signatories = Array.from({ length: 19 }, (_, i) => `mp-${i}`);
    const motion = createNoConfidenceMotion(signatories, 'progressive', 5);
    expect(motion.meetsThreshold).toBe(false);
  });

  test('validateNoConfidenceMotion 在联署不足时返回 invalid', () => {
    const signatories = Array.from({ length: 15 }, (_, i) => `mp-${i}`);
    const motion = createNoConfidenceMotion(signatories, 'progressive', 5);
    const result = validateNoConfidenceMotion(motion);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('20');
  });

  test('validateNoConfidenceMotion 在联署足够时返回 valid', () => {
    const signatories = Array.from({ length: 25 }, (_, i) => `mp-${i}`);
    const motion = createNoConfidenceMotion(signatories, 'progressive', 5);
    const result = validateNoConfidenceMotion(motion);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  test('临界值：恰好 20 人联署应通过', () => {
    const signatories = Array.from({ length: 20 }, (_, i) => `mp-${i}`);
    const motion = createNoConfidenceMotion(signatories, 'progressive', 5);
    expect(validateNoConfidenceMotion(motion).valid).toBe(true);
  });
});

// ============================================================================
// 2. 委员会法定人数
// ============================================================================

describe('委员会法定人数', () => {
  test('QUORUM_RATIO 应为 ≥ 0.5（"过半数"用 Math.floor() + 1 实现 strictly-greater）', () => {
    // CONSTITUTION 第 244 行：出席委员必须超过半数（strictly greater）
    // 实现方式：requiredMembers = Math.floor(N * QUORUM_RATIO) + 1
    // 所以 QUORUM_RATIO = 0.5 是正确的（20 委员需 11 出席，30 委员需 16 出席）
    expect(QUORUM_RATIO).toBeGreaterThanOrEqual(0.5);
  });

  test('hasQuorum 在出席过半时返回 true', () => {
    const committee = makeTestCommittee(20, 11); // 20 委员，11 出席
    expect(hasQuorum(committee)).toBe(true);
  });

  test('hasQuorum 在出席不过半时返回 false', () => {
    const committee = makeTestCommittee(20, 10); // 20 委员，10 出席（恰好一半）
    expect(hasQuorum(committee)).toBe(false);
  });

  test('hasQuorum 在最低边界时正确（30 委员需 16 出席）', () => {
    expect(hasQuorum(makeTestCommittee(30, 15))).toBe(false);
    expect(hasQuorum(makeTestCommittee(30, 16))).toBe(true);
  });

  test('validateCommitteeVote 在法定人数不足时拒绝', () => {
    const committee = makeTestCommittee(20, 5);
    const result = validateCommitteeVote(committee);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('法定人数');
  });

  test('initializeCommitteeAttendance 默认全部出席', () => {
    const committee = makeTestCommittee(20, 0);
    const initialized = initializeCommitteeAttendance(committee);
    expect(initialized.presentMembers.length).toBe(20);
    expect(hasQuorum(initialized)).toBe(true);
  });

  test('setCommitteeAttendance 过滤非成员名字', () => {
    const committee = makeTestCommittee(20, 0);
    const result = setCommitteeAttendance(committee, ['议员0', '议员1', '入侵者']);
    expect(result.presentMembers).toEqual(['议员0', '议员1']);
  });
});

// ============================================================================
// 3. 联盟协议规则
// ============================================================================

describe('联盟协议规则', () => {
  test('createCoalitionAgreement 创建合法协议', () => {
    const agreement = createCoalitionAgreement(
      ['reform', 'liberty'],
      [
        { partyId: 'reform', posts: ['prime_minister', 'finance_minister'] },
        { partyId: 'liberty', posts: ['chief_secretary'] },
      ],
      ['推进改革'],
      5,
    );
    expect(agreement.parties).toHaveLength(2);
    expect(agreement.signed).toBe(true);
    expect(agreement.signedTurn).toBe(5);
  });

  test('validateCoalitionAgreement 拒绝单党协议', () => {
    const agreement = createCoalitionAgreement(
      ['reform'],
      [{ partyId: 'reform', posts: ['prime_minister'] }],
      [],
      5,
    );
    const result = validateCoalitionAgreement(agreement);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('两个');
  });

  test('validateCoalitionAgreement 拒绝未签署协议', () => {
    const agreement = createCoalitionAgreement(
      ['reform', 'liberty'],
      [
        { partyId: 'reform', posts: ['prime_minister'] },
        { partyId: 'liberty', posts: ['chief_secretary'] },
      ],
      [],
      5,
    );
    agreement.signed = false;
    const result = validateCoalitionAgreement(agreement);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('签署');
  });

  test('validateCoalitionAgreement 拒绝参与方无职位分配', () => {
    const agreement = createCoalitionAgreement(
      ['reform', 'liberty', 'conservative'],
      [
        { partyId: 'reform', posts: ['prime_minister'] },
        { partyId: 'liberty', posts: ['chief_secretary'] },
        // conservative 没分配
      ],
      [],
      5,
    );
    const result = validateCoalitionAgreement(agreement);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('conservative');
  });
});

// ============================================================================
// 4. AI 意图生成
// ============================================================================

describe('createIntentFromEffects', () => {
  test('从 effects 生成 4 种意图', () => {
    const intents = createIntentFromEffects(
      'event-test',
      {
        supportDelta: { reform: 5 },
        relationDelta: { 'reform>liberty': 10 },
        fundsDelta: { reform: 50 },
        metricsDelta: { economicIndex: 3 },
      },
      5,
    );
    expect(intents).toHaveLength(4);
    expect(intents.map(i => i.type).sort()).toEqual([
      'funds_change',
      'metrics_change',
      'relation_change',
      'support_change',
    ]);
  });

  test('空 effects 不生成意图', () => {
    const intents = createIntentFromEffects('event-test', {}, 5);
    expect(intents).toHaveLength(0);
  });

  test('部分 effects 只生成对应意图', () => {
    const intents = createIntentFromEffects(
      'event-test',
      { supportDelta: { reform: 5 } },
      5,
    );
    expect(intents).toHaveLength(1);
    expect(intents[0].type).toBe('support_change');
  });
});

// ============================================================================
// 5. validateIntent 各分支
// ============================================================================

describe('validateIntent', () => {
  test('support_change 缺少 delta 时拒绝', () => {
    const intent: AIIntent = {
      id: 'test',
      type: 'support_change',
      source: 'test',
      payload: {},
      turn: 1,
    };
    const result = validateIntent(intent);
    expect(result.valid).toBe(false);
  });

  test('support_change 有 delta 时通过', () => {
    const intent: AIIntent = {
      id: 'test',
      type: 'support_change',
      source: 'test',
      payload: { supportDelta: { reform: 5 } },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('no_confidence 联署不足时拒绝（< 20）', () => {
    const intent: AIIntent = {
      id: 'test',
      type: 'no_confidence',
      source: 'test',
      payload: { signatories: Array.from({ length: 15 }, (_, i) => `mp-${i}`) },
      turn: 1,
    };
    const result = validateIntent(intent);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('20');
  });

  test('no_confidence 联署足够时通过（≥ 20）', () => {
    const intent: AIIntent = {
      id: 'test',
      type: 'no_confidence',
      source: 'test',
      payload: { signatories: Array.from({ length: 25 }, (_, i) => `mp-${i}`) },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('coalition_proposal 单党时拒绝', () => {
    const intent: AIIntent = {
      id: 'test',
      type: 'coalition_proposal',
      source: 'test',
      payload: { parties: ['reform'] },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('coalition_proposal 两党时通过', () => {
    const intent: AIIntent = {
      id: 'test',
      type: 'coalition_proposal',
      source: 'test',
      payload: { parties: ['reform', 'liberty'] },
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(true);
  });

  test('bill_proposal 缺少 title 时拒绝', () => {
    const intent: AIIntent = {
      id: 'test',
      type: 'bill_proposal',
      source: 'test',
      payload: {},
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });

  test('未知意图类型拒绝', () => {
    const intent: AIIntent = {
      id: 'test',
      type: 'unknown_type' as any,
      source: 'test',
      payload: {},
      turn: 1,
    };
    expect(validateIntent(intent).valid).toBe(false);
  });
});

// ============================================================================
// 6. settleIntent 数值结算
// ============================================================================

describe('settleIntent 数值结算', () => {
  test('support_change 在 [1, 50] 范围内 clamp', () => {
    const state = makeTestState();
    // 改革党现有 25 支持率，加 100 应被 clamp 到 50
    const intent: AIIntent = {
      id: 'test',
      type: 'support_change',
      source: 'test',
      payload: { supportDelta: { reform: 100 } },
      turn: 1,
    };
    const newState = settleIntent(state, intent);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.currentSupport).toBe(50);
  });

  test('support_change 不会降到 0 以下', () => {
    const state = makeTestState();
    const intent: AIIntent = {
      id: 'test',
      type: 'support_change',
      source: 'test',
      payload: { supportDelta: { reform: -100 } },
      turn: 1,
    };
    const newState = settleIntent(state, intent);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.currentSupport).toBeGreaterThanOrEqual(1);
  });

  test('funds_change 不会降到 0 以下', () => {
    const state = makeTestState();
    const intent: AIIntent = {
      id: 'test',
      type: 'funds_change',
      source: 'test',
      payload: { fundsDelta: { reform: -1000 } },
      turn: 1,
    };
    const newState = settleIntent(state, intent);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBeGreaterThanOrEqual(0);
  });

  test('relation_change clamp 在 [-100, 100]', () => {
    const state = makeTestState();
    const intent: AIIntent = {
      id: 'test',
      type: 'relation_change',
      source: 'test',
      payload: { relationDelta: { 'reform>liberty': 200 } },
      turn: 1,
    };
    const newState = settleIntent(state, intent);
    const relation = newState.relations.find(r => r.from === 'reform' && r.to === 'liberty');
    expect(relation?.score).toBeLessThanOrEqual(100);
  });

  test('metrics_change economicIndex clamp 在 [0, 100]', () => {
    const state = makeTestState();
    const intent: AIIntent = {
      id: 'test',
      type: 'metrics_change',
      source: 'test',
      payload: { metricsDelta: { economicIndex: 200 } },
      turn: 1,
    };
    const newState = settleIntent(state, intent);
    expect(newState.metrics.economicIndex).toBeLessThanOrEqual(100);
  });

  test('无效 intent 不修改 state', () => {
    const state = makeTestState();
    const intent: AIIntent = {
      id: 'test',
      type: 'support_change',
      source: 'test',
      payload: {}, // 无效
      turn: 1,
    };
    const newState = settleIntent(state, intent);
    expect(newState).toBe(state); // 应直接返回原 state
  });

  test('settleIntents 批量结算', () => {
    const state = makeTestState();
    const intents: AIIntent[] = [
      {
        id: 't1',
        type: 'support_change',
        source: 'test',
        payload: { supportDelta: { reform: 5 } },
        turn: 1,
      },
      {
        id: 't2',
        type: 'funds_change',
        source: 'test',
        payload: { fundsDelta: { reform: 50 } },
        turn: 1,
      },
    ];
    const newState = settleIntents(state, intents);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.currentSupport).toBe(30); // 25 + 5
    expect(reform?.funds).toBe(150); // 100 + 50
  });
});

// ============================================================================
// 7. recalcSeats 席位守恒
// ============================================================================

describe('recalcSeats 席位守恒', () => {
  test('6 党席位总和必须 = totalSeats (200)', () => {
    const state = makeTestState();
    recalcSeats(state);
    const sum = state.parties.reduce((s, p) => s + p.projectedSeats, 0);
    expect(sum).toBe(state.metrics.totalSeats);
  });

  test('极端支持率下席位总和仍守恒', () => {
    const state = makeTestState();
    // 一党独大
    state.parties[0].currentSupport = 90;
    state.parties[1].currentSupport = 2;
    state.parties[2].currentSupport = 2;
    state.parties[3].currentSupport = 2;
    state.parties[4].currentSupport = 2;
    state.parties[5].currentSupport = 2;
    recalcSeats(state);
    const sum = state.parties.reduce((s, p) => s + p.projectedSeats, 0);
    expect(sum).toBe(200);
  });

  test('高支持率党应获得最多席位', () => {
    const state = makeTestState();
    state.parties[0].currentSupport = 50;
    state.parties[1].currentSupport = 10;
    state.parties[2].currentSupport = 10;
    state.parties[3].currentSupport = 10;
    state.parties[4].currentSupport = 10;
    state.parties[5].currentSupport = 10;
    recalcSeats(state);
    expect(state.parties[0].projectedSeats).toBeGreaterThan(state.parties[1].projectedSeats);
  });
});
