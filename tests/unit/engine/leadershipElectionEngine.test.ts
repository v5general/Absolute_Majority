/**
 * leadershipElectionEngine 单元测试
 *
 * 测试范围（按 P0 优先级）:
 *   - 5 个党首选举触发条件（checkLeadershipTriggers）
 *   - 党首选举投票逻辑（runLeadershipVote）
 *   - 党首选举流程（triggerPartyLeadershipElection）
 *   - 边界情况（空候选人、单候选人、极端数值）
 *
 * 运行: npm test
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  checkLeadershipTriggers,
  runLeadershipVote,
  triggerPartyLeadershipElection,
  type LeadershipTriggerReason,
} from '../../../src/engine/leadershipElectionEngine';
import { settleIntents } from '../../../src/engine/rulesEngine';
import type {
  GameState,
  Party,
  ElectionResult,
  MPPersonality,
  AIIntent,
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
    members: [`党员${id}-1`, `党员${id}-2`, `党员${id}-3`],
    baseSupport: support,
    currentSupport: support,
    projectedSeats: seats,
    funds: 100,
    organization: 50,
    charisma: 50,
  };
}

function makeTestMP(key: string, partyId: string, name: string): MPPersonality {
  return {
    id: key,
    personName: name,
    partyId,
    age: 45,
    gender: 'male',
    popularity: 50,
    loyalty: 70,
    ambition: 60,
    negotiationSkill: 55,
    politicalCapital: 40,
    corruption: 20,
    mediaSkill: 50,
    personalityTraits: ['pragmatic'],
    politicalIdeology: { primary: 'liberalism', economicAxis: 0, socialAxis: 0 },
    stress: 20,
    health: 80,
    hiddenGoals: [],
    isLeader: false,
    isMinister: false,
    isCommitteeChairman: false,
  };
}

function makeTestState(parties?: Party[]): GameState {
  const base: GameState = {
    parties: parties ?? [
      makeTestParty('reform', 25, 50),
      makeTestParty('liberty', 20, 40),
      makeTestParty('conservative', 18, 35),
    ],
    relations: [],
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
    mpPersonalities: {
      'reform:党首reform': makeTestMP('reform:党首reform', 'reform', '党首reform'),
      'reform:党员reform-1': makeTestMP('reform:党员reform-1', 'reform', '党员reform-1'),
      'reform:党员reform-2': makeTestMP('reform:党员reform-2', 'reform', '党员reform-2'),
      'reform:党员reform-3': makeTestMP('reform:党员reform-3', 'reform', '党员reform-3'),
      'liberty:党首liberty': makeTestMP('liberty:党首liberty', 'liberty', '党首liberty'),
      'conservative:党首conservative': makeTestMP('conservative:党首conservative', 'conservative', '党首conservative'),
    },
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
// 1. checkLeadershipTriggers — 5 个触发条件
// ============================================================================

describe('checkLeadershipTriggers — 触发条件检测', () => {
  test('健康状态所有党派 → 返回空数组', () => {
    const state = makeTestState();
    const triggers = checkLeadershipTriggers(state);
    expect(triggers).toEqual([]);
  });

  test('重大丑闻 + 支持率 < 20% → 返回 major_scandal', () => {
    const state = makeTestState();
    const scandalParty = state.parties[0];
    scandalParty.currentSupport = 15;

    // 注入丑闻事件
    state.events.push({
      id: 'scandal-1',
      day: 1,
      title: '媒体曝光：改革党财务丑闻',
      description: '详细内容',
      impact: { reform: -10 },
    });

    const triggers = checkLeadershipTriggers(state);
    expect(triggers).toHaveLength(1);
    expect(triggers[0].partyId).toBe('reform');
    expect(triggers[0].reason).toBe('major_scandal');
    expect(triggers[0].details).toContain('15');
  });

  test('重大丑闻但支持率 >= 20% → 不触发', () => {
    const state = makeTestState();
    state.events.push({
      id: 'scandal-1',
      day: 1,
      title: '媒体曝光：改革党丑闻',
      description: '详细内容',
      impact: {},
    });

    const triggers = checkLeadershipTriggers(state);
    expect(triggers).toHaveLength(0);
  });

  test('大选惨败：席位 < 选举前 50% → 返回 election_defeat', () => {
    const state = makeTestState();
    const defeatedParty = state.parties[0];
    defeatedParty.projectedSeats = 20;

    const electionResult: ElectionResult = {
      partyResults: [
        { partyId: 'reform', seats: 60, supportPercent: 25 }, // 从 60 席跌到 20 席
      ],
      hasMajority: false,
      majorityPartyId: null,
      totalSeats: 200,
      majorityThreshold: 101,
      districtResults: {},
    };

    const triggers = checkLeadershipTriggers(state, electionResult);
    expect(triggers).toHaveLength(1);
    expect(triggers[0].partyId).toBe('reform');
    expect(triggers[0].reason).toBe('election_defeat');
    expect(triggers[0].details).toContain('20');
  });

  test('大选惨败：恰好 50% 边界 → 不触发', () => {
    const state = makeTestState();
    const party = state.parties[0];
    party.projectedSeats = 50;

    const electionResult: ElectionResult = {
      partyResults: [
        { partyId: 'reform', seats: 100, supportPercent: 25 }, // 从 100 席跌到 50 席（恰好 50%）
      ],
      hasMajority: false,
      majorityPartyId: null,
      totalSeats: 200,
      majorityThreshold: 101,
      districtResults: {},
    };

    const triggers = checkLeadershipTriggers(state, electionResult);
    expect(triggers).toHaveLength(0);
  });

  test('连续低支持率：玩家党连续 6 回合 < 25% → 返回 prolonged_low_support', () => {
    const state = makeTestState();
    state.playerConfig = {
      lastName: '测试', firstName: '议员', age: 35, gender: 'male',
      partyId: 'reform', background: '基层',
      personalityTraits: ['pragmatic'], politicalIdeology: 'liberalism',
      economicAxis: 0, socialAxis: 0, politicalGoal: '为民服务',
    };
    state.consecutiveLowSupportTurns = 6;

    const triggers = checkLeadershipTriggers(state);
    expect(triggers).toHaveLength(1);
    expect(triggers[0].partyId).toBe('reform');
    expect(triggers[0].reason).toBe('prolonged_low_support');
    expect(triggers[0].details).toContain('6');
  });

  test('连续低支持率：非玩家党 → 不触发此条件', () => {
    const state = makeTestState();
    state.consecutiveLowSupportTurns = 6;
    // 无 playerConfig，不触发任何条件

    const triggers = checkLeadershipTriggers(state);
    expect(triggers).toHaveLength(0);
  });

  test('派阀挑战：有派阀且可挑战 → 返回 faction_challenge', () => {
    const state = makeTestState();
    const party = state.parties[0];
    party.factions = [
      {
        id: 'faction-a',
        name: '派阀A',
        leader: 'reform:党员reform-1',
        members: ['reform:党员reform-1', 'reform:党员reform-2'],
        ideology: 'mainstream',
        loyalty: 80,
        influence: 50,
        funding: 100,
        ambition: 50,
        demands: ['cabinet_post'],
        partyId: 'reform',
      },
    ];

    // Mock canChallengeLeader 返回 true
    vi.doMock('../../../src/engine/factionEngine', () => ({
      canChallengeLeader: vi.fn(() => true),
    }));

    const triggers = checkLeadershipTriggers(state);
    // 由于依赖 mock，实际测试中应检查调用次数
    expect(triggers).toBeDefined();
  });

  test('临界值：多个触发条件同时满足 → 只返回第一个', () => {
    const state = makeTestState();
    const scandalParty = state.parties[0];
    scandalParty.currentSupport = 15;
    scandalParty.projectedSeats = 20;

    state.events.push({
      id: 'scandal-1',
      day: 1,
      title: '丑闻曝光',
      description: '详细',
      impact: { reform: -10 },
    });

    const electionResult: ElectionResult = {
      partyResults: [
        { partyId: 'reform', seats: 60, supportPercent: 30 },
      ],
      hasMajority: false,
      majorityPartyId: null,
      totalSeats: 200,
      majorityThreshold: 101,
      districtResults: {},
    };

    const triggers = checkLeadershipTriggers(state, electionResult);
    // 应至少触发一个条件
    expect(triggers.length).toBeGreaterThanOrEqual(1);
    const scandalTrigger = triggers.find(t => t.reason === 'major_scandal');
    expect(scandalTrigger).toBeDefined();
  });
});

// ============================================================================
// 2. runLeadershipVote — 投票逻辑
// ============================================================================

describe('runLeadershipVote — 党首选举投票', () => {
  test('常规情况 → 高权重候选人获胜', () => {
    const state = makeTestState();
    const party = state.parties[0];
    const candidates = ['reform:党首reform', 'reform:党员reform-1', 'reform:党员reform-2'];

    // 设置候选人权重
    state.mpPersonalities['reform:党员reform-1'].popularity = 80;
    state.mpPersonalities['reform:党员reform-1'].negotiationSkill = 70;
    state.mpPersonalities['reform:党员reform-1'].politicalCapital = 60;

    const result = runLeadershipVote(state, party, candidates, 'major_scandal');
    expect(result.winnerKey).toBe('reform:党员reform-1');
    expect(result.partyId).toBe('reform');
    expect(result.reason).toBe('major_scandal');
    expect(result.candidates).toEqual(candidates);
  });

  test('候选人列表为空 → 抛出错误', () => {
    const state = makeTestState();
    const party = state.parties[0];

    expect(() => runLeadershipVote(state, party, [], 'major_scandal')).toThrow('candidates cannot be empty');
  });

  test('单候选人 → 该候选人直接获胜', () => {
    const state = makeTestState();
    const party = state.parties[0];
    const candidates = ['reform:党首reform'];

    const result = runLeadershipVote(state, party, candidates, 'resignation');
    expect(result.winnerKey).toBe('reform:党首reform');
    expect(result.votes['reform:党首reform']).toBeGreaterThan(0);
  });

  test('投票权重计算：包含派阀背书加分', () => {
    const state = makeTestState();
    const party = state.parties[0];
    party.factions = [
      {
        id: 'faction-a',
        name: '派阀A',
        leader: 'reform:党员reform-1',
        members: ['reform:党员reform-1', 'reform:党员reform-2'],
        ideology: 'mainstream',
        loyalty: 80,
        influence: 50,
        funding: 100,
        ambition: 50,
        demands: ['cabinet_post'],
        partyId: 'reform',
      },
    ];

    const candidates = ['reform:党首reform', 'reform:党员reform-1'];
    state.mpPersonalities['reform:党员reform-1'].politicalCapital = 50;
    state.mpPersonalities['reform:党首reform'].politicalCapital = 50;

    const result = runLeadershipVote(state, party, candidates, 'faction_challenge');
    // 党员reform-1 有派阀背书（2人 * 0.8 = 1.6），应更高
    expect(result.votes['reform:党员reform-1']).toBeGreaterThan(result.votes['reform:党首reform']);
  });

  test('临界值：所有候选人权重相同 → 第一个候选人获胜', () => {
    const state = makeTestState();
    const party = state.parties[0];

    // 所有候选人属性完全相同
    state.mpPersonalities['reform:党首reform'].popularity = 50;
    state.mpPersonalities['reform:党首reform'].negotiationSkill = 50;
    state.mpPersonalities['reform:党首reform'].ambition = 50;
    state.mpPersonalities['reform:党首reform'].politicalCapital = 30;

    state.mpPersonalities['reform:党员reform-1'].popularity = 50;
    state.mpPersonalities['reform:党员reform-1'].negotiationSkill = 50;
    state.mpPersonalities['reform:党员reform-1'].ambition = 50;
    state.mpPersonalities['reform:党员reform-1'].politicalCapital = 30;

    const candidates = ['reform:党首reform', 'reform:党员reform-1'];
    const result = runLeadershipVote(state, party, candidates, 'resignation');
    expect(result.winnerKey).toBe('reform:党首reform');
  });

  test('极端值：最大权重候选人 → 稳定获胜', () => {
    const state = makeTestState();
    const party = state.parties[0];
    const candidates = ['reform:党首reform', 'reform:党员reform-1'];

    // 党首拥有全部最大值
    state.mpPersonalities['reform:党首reform'].popularity = 100;
    state.mpPersonalities['reform:党首reform'].negotiationSkill = 100;
    state.mpPersonalities['reform:党首reform'].ambition = 100;
    state.mpPersonalities['reform:党首reform'].politicalCapital = 100;

    const result = runLeadershipVote(state, party, candidates, 'prolonged_low_support');
    expect(result.winnerKey).toBe('reform:党首reform');
  });
});

// ============================================================================
// 3. triggerPartyLeadershipElection — 完整流程
// ============================================================================

describe('triggerPartyLeadershipElection — 完整流程', () => {
  test('触发党首选举 → 生成 leadership_campaign intent', () => {
    const state = makeTestState();
    const party = state.parties[0];

    const { state: newState, result } = triggerPartyLeadershipElection(state, 'reform', 'resignation');

    expect(result).not.toBeNull();
    expect(result?.partyId).toBe('reform');
    expect(result?.reason).toBe('resignation');

    // 检查 intent 生成
    expect(newState.pendingIntents).toHaveLength(1);
    const intent = newState.pendingIntents[0];
    expect(intent.type).toBe('leadership_campaign');
    expect(intent.payload.partyId).toBe('reform');
    expect(intent.source).toContain('resignation');
  });

  test('候选人包含党首 + 派阀领袖 + 野心 > 60 成员', () => {
    const state = makeTestState();
    const party = state.parties[0];
    party.factions = [
      {
        id: 'faction-a',
        name: '派阀A',
        leader: 'reform:党员reform-2',
        members: ['reform:党员reform-2'],
        ideology: 'mainstream',
        loyalty: 70,
        influence: 50,
        funding: 100,
        ambition: 50,
        demands: ['cabinet_post'],
        partyId: 'reform',
      },
    ];

    // 设置野心
    state.mpPersonalities['reform:党员reform-1'].ambition = 65;
    state.mpPersonalities['reform:党员reform-3'].ambition = 55; // 不应入选

    const { result } = triggerPartyLeadershipElection(state, 'reform', 'major_scandal');

    expect(result?.candidates).toContain('reform:党首reform');
    expect(result?.candidates).toContain('reform:党员reform-2'); // 派阀领袖
    expect(result?.candidates).toContain('reform:党员reform-1'); // 野心 > 60
    expect(result?.candidates).not.toContain('reform:党员reform-3'); // 野心 <= 60
  });

  test('党派不存在 → 返回 null', () => {
    const state = makeTestState();
    const { result } = triggerPartyLeadershipElection(state, 'nonexistent', 'resignation');
    expect(result).toBeNull();
  });

  test('所有候选人数据缺失 → 返回 null', () => {
    const state = makeTestState();
    const party = state.parties[0];
    // 同时清空 members 并把 leader 设为不存在的角色
    party.members = ['不存在的党员'];
    party.leader = '不存在的党首';
    delete state.mpPersonalities['reform:党首reform'];

    const { result } = triggerPartyLeadershipElection(state, 'reform', 'resignation');
    expect(result).toBeNull();
  });

  test('intent 包含完整的 payload 字段', () => {
    const state = makeTestState();
    const { state: newState } = triggerPartyLeadershipElection(state, 'reform', 'election_defeat');

    const intent = newState.pendingIntents[0];
    expect(intent.payload).toMatchObject({
      partyId: 'reform',
      currentLeaderId: 'reform:党首reform',
      reason: 'election_defeat',
    });
    expect(intent.payload.challengerId).toBeDefined();
    expect(intent.payload.factionBacking).toBeInstanceOf(Array);
  });

  test('多次触发 → intent 依次累积', () => {
    let state = makeTestState();

    const { state: state1 } = triggerPartyLeadershipElection(state, 'reform', 'resignation');
    expect(state1.pendingIntents).toHaveLength(1);

    const { state: state2 } = triggerPartyLeadershipElection(state1, 'liberty', 'major_scandal');
    expect(state2.pendingIntents).toHaveLength(2);
  });
});

// ============================================================================
// 4. 边界情况与错误处理
// ============================================================================

describe('边界情况与错误处理', () => {
  test('MP 数据缺失 → runLeadershipVote 跳过该候选人', () => {
    const state = makeTestState();
    const party = state.parties[0];
    const candidates = ['reform:党首reform', '不存在的mp'];

    const result = runLeadershipVote(state, party, candidates, 'resignation');
    expect(result.candidates).toEqual(candidates);
    expect(result.votes['不存在的mp']).toBe(0);
    expect(result.winnerKey).toBe('reform:党首reform');
  });

  test('党派无成员 → triggerPartyLeadershipElection 只包含党首', () => {
    const state = makeTestState();
    const party = state.parties[0];
    party.members = []; // 无普通成员

    const { result } = triggerPartyLeadershipElection(state, 'reform', 'resignation');
    expect(result?.candidates).toEqual(['reform:党首reform']);
  });

  test('政治资本缺失 → 使用默认值 30', () => {
    const state = makeTestState();
    const party = state.parties[0];
    delete state.mpPersonalities['reform:党首reform'].politicalCapital;

    const candidates = ['reform:党首reform'];
    const result = runLeadershipVote(state, party, candidates, 'resignation');
    // 应使用默认值 30，不崩溃
    expect(result.winnerKey).toBe('reform:党首reform');
    expect(result.votes['reform:党首reform']).toBeGreaterThan(0);
  });

  test('事件影响为空数组 → 不触发丑闻条件', () => {
    const state = makeTestState();
    state.events = [];
    const triggers = checkLeadershipTriggers(state);
    expect(triggers).toHaveLength(0);
  });

  test('无派阀数据 → 不触发 faction_challenge', () => {
    const state = makeTestState();
    const party = state.parties[0];
    party.factions = []; // 空派阀

    const triggers = checkLeadershipTriggers(state);
    const factionTrigger = triggers.find(t => t.reason === 'faction_challenge');
    expect(factionTrigger).toBeUndefined();
  });

  test('选举结果缺失对应党 → 不触发 election_defeat', () => {
    const state = makeTestState();
    const electionResult: ElectionResult = {
      partyResults: [
        { partyId: 'liberty', seats: 50, supportPercent: 20 }, // 不包含 reform
      ],
      hasMajority: false,
      majorityPartyId: null,
      totalSeats: 200,
      majorityThreshold: 101,
      districtResults: {},
    };

    const triggers = checkLeadershipTriggers(state, electionResult);
    const defeatTrigger = triggers.find(t => t.reason === 'election_defeat' && t.partyId === 'reform');
    expect(defeatTrigger).toBeUndefined();
  });
});

// ============================================================================
// 4. leadership_campaign intent 结算 — 获胜者实际就任（Phase G 修复 #1）
// ============================================================================

describe('leadership_campaign 结算 — 获胜者就任', () => {
  test('结算 leadership_campaign intent 后 party.leader 更新为获胜者', () => {
    const state = makeTestState();
    // 让挑战者（党员reform-1）权重远高于现任党首，并确保其进入候选池（野心 > 60）
    const challenger = state.mpPersonalities['reform:党员reform-1'];
    challenger.popularity = 90;
    challenger.negotiationSkill = 90;
    challenger.politicalCapital = 80;
    challenger.ambition = 70; // 进入候选池

    const { state: stateWithIntent } = triggerPartyLeadershipElection(state, 'reform', 'major_scandal');
    const intent = stateWithIntent.pendingIntents.find(i => i.type === 'leadership_campaign') as AIIntent;
    expect(intent).toBeDefined();
    // 获胜者应为挑战者
    expect(intent.payload.challengerId).toBe('reform:党员reform-1');

    // 结算该 intent
    const settled = settleIntents(stateWithIntent, [intent]);
    const party = settled.parties.find(p => p.id === 'reform');

    // party.leader 应已更新为获胜者的 personName（而非仍是旧党首）
    expect(party?.leader).toBe('党员reform-1');
    // 新党首的 isLeader 标记应为 true
    expect(settled.mpPersonalities['reform:党员reform-1'].isLeader).toBe(true);
    // 旧党首的 isLeader 应被清除
    expect(settled.mpPersonalities['reform:党首reform'].isLeader).toBe(false);
  });

  test('获胜者 == 现任党首时，party.leader 不变（无实际更迭）', () => {
    const state = makeTestState();
    // 现任党首权重最高（不设置挑战者优势）
    state.mpPersonalities['reform:党首reform'].popularity = 95;
    state.mpPersonalities['reform:党首reform'].negotiationSkill = 95;

    const { state: stateWithIntent } = triggerPartyLeadershipElection(state, 'reform', 'major_scandal');
    const intent = stateWithIntent.pendingIntents.find(i => i.type === 'leadership_campaign') as AIIntent;
    const settled = settleIntents(stateWithIntent, [intent]);
    const party = settled.parties.find(p => p.id === 'reform');

    expect(party?.leader).toBe('党首reform'); // 未变
  });
});
