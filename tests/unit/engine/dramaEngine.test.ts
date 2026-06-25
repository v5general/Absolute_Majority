/**
 * dramaEngine 单元测试（扩展）
 *
 * Phase G 第十二章：戏剧曲线与选举周期对齐
 *   - turn 44 强制 election_earthquake
 *   - 不信任案通过触发 dissolution_crisis
 *
 * 运行: npm test
 */

import { describe, test, expect } from 'vitest';
import {
  createInitialDramaState,
  checkArcTrigger,
  triggerArc,
  advanceDramaTurn,
} from '../../../src/engine/dramaEngine';
import type { GameState, Party } from '../../../src/types';

// ============================================================================
// Fixtures
// ============================================================================

function makeParty(id: string, support = 25, seats = 30): Party {
  return {
    id,
    name: `党${id}`,
    abbreviation: id.toUpperCase(),
    color: '#000',
    ideology: 'center',
    leader: `党首${id}`,
    description: 'test',
    members: [],
    baseSupport: support,
    currentSupport: support,
    projectedSeats: seats,
    funds: 100,
    organization: 50,
    charisma: 50,
  };
}

function makeTestState(turn: number, overrides: Partial<GameState> = {}): GameState {
  return {
    parties: [
      makeParty('reform', 30, 60),
      makeParty('liberty', 20, 35),
      makeParty('conservative', 18, 30),
      makeParty('progressive', 15, 25),
      makeParty('populist', 10, 25),
      makeParty('solidarity', 7, 25),
    ],
    relations: [],
    metrics: {
      totalVoters: 100_000_000,
      turnoutRate: 60,
      swingVoterRatio: 20,
      daysToElection: 1440,
      totalSeats: 200,
      majorityThreshold: 101,
      leadingCoalitionSeats: 60,
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
    turn,
    turnsUntilElection: 48 - turn,
    isElectionCampaign: false,
    ...overrides,
  };
}

// ============================================================================
// Phase G 第十二章：turn-based 强制规则
// ============================================================================

describe('Phase G 第十二章：戏剧曲线与选举周期对齐', () => {
  test('turn < 44 且无活跃 arc 时不强制 election_earthquake', () => {
    const drama = createInitialDramaState();
    const state = makeTestState(20);
    // tension 低时返回 null
    const arc = checkArcTrigger({ ...drama, turnsSinceCrisis: 20 }, state);
    expect(arc).not.toBe('election_earthquake');
  });

  test('turn = 44 且无 activeArc 时强制 election_earthquake', () => {
    const drama = createInitialDramaState();
    const state = makeTestState(44);
    const arc = checkArcTrigger(drama, state);
    expect(arc).toBe('election_earthquake');
  });

  test('turn > 44 且无 activeArc 时强制 election_earthquake', () => {
    const drama = createInitialDramaState();
    const state = makeTestState(46);
    const arc = checkArcTrigger(drama, state);
    expect(arc).toBe('election_earthquake');
  });

  test('已完成的 election_earthquake arc 不再强制触发', () => {
    const drama = createInitialDramaState();
    drama.completedArcs = [
      { type: 'election_earthquake', startedTurn: 40, endedTurn: 44 },
    ];
    const state = makeTestState(44);
    const arc = checkArcTrigger(drama, state);
    // 已完成 → 不强制；返回 null 或其他候选
    if (arc !== null) {
      expect(arc).not.toBe('election_earthquake');
    }
  });

  test('已有活跃 arc 时不强制 election_earthquake（继续推进当前 arc）', () => {
    const drama = createInitialDramaState();
    drama.activeArc = {
      type: 'coalition_collapse',
      startedTurn: 30,
      act: 2,
      eventsTriggered: 2,
      expectedEndTurn: 36,
    };
    const state = makeTestState(44);
    const arc = checkArcTrigger(drama, state);
    // 应返回 coalition_collapse（推进）而非 election_earthquake
    expect(arc === 'coalition_collapse' || arc === null).toBe(true);
    if (arc !== null) {
      expect(arc).not.toBe('election_earthquake');
    }
  });
});

// ============================================================================
// triggerArc dissolution_crisis
// ============================================================================

describe('triggerArc 强制启动 dissolution_crisis', () => {
  test('triggerArc 创建 activeArc 并提高 tension', () => {
    const drama = createInitialDramaState();
    const newDrama = triggerArc(drama, 'dissolution_crisis', 10);
    expect(newDrama.activeArc).not.toBeNull();
    expect(newDrama.activeArc?.type).toBe('dissolution_crisis');
    expect(newDrama.activeArc?.act).toBe(1);
    expect(newDrama.tension).toBeGreaterThanOrEqual(70); // CRISIS_THRESHOLD
  });

  test('triggerArc 保留其他 arc 类型', () => {
    const drama = createInitialDramaState();
    const newDrama = triggerArc(drama, 'faction_revolt', 5);
    expect(newDrama.activeArc?.type).toBe('faction_revolt');
  });
});

// ============================================================================
// advanceDramaTurn 基础推进
// ============================================================================

describe('advanceDramaTurn 基础推进', () => {
  test('每回合 tension +5（基础增量 + sessionBoost）', () => {
    const drama = createInitialDramaState();
    drama.tension = 30;
    // turn 10 → month 10 → 临时国会期（sessionBoost = 1）
    // 实际增量 = 5（基础）+ 1（sessionBoost）= 6
    const state = makeTestState(10);
    const newDrama = advanceDramaTurn(drama, state);
    expect(newDrama.tension).toBe(36); // 30 + 5 + 1
  });

  test('法案攻坚期（4-6 月）sessionBoost = 0', () => {
    const drama = createInitialDramaState();
    drama.tension = 30;
    // turn 4 → month 4 → 法案攻坚期
    const state = makeTestState(4);
    const newDrama = advanceDramaTurn(drama, state);
    expect(newDrama.tension).toBe(35); // 30 + 5 + 0
  });

  test('预算决战期 tension +8（基础 5 + 3）', () => {
    const drama = createInitialDramaState();
    drama.tension = 30;
    const state = makeTestState(2); // 2 月 → 预算决战期
    const newDrama = advanceDramaTurn(drama, state);
    expect(newDrama.tension).toBe(38);
  });

  test('冷却期 tension 不上升', () => {
    const drama = createInitialDramaState();
    drama.tension = 30;
    drama.cooldownRemaining = 2;
    const state = makeTestState(10);
    const newDrama = advanceDramaTurn(drama, state);
    expect(newDrama.tension).toBe(30);
    expect(newDrama.cooldownRemaining).toBe(1);
  });

  test('turnsSinceCrisis 每回合 +1', () => {
    const drama = createInitialDramaState();
    drama.turnsSinceCrisis = 5;
    const state = makeTestState(10);
    const newDrama = advanceDramaTurn(drama, state);
    expect(newDrama.turnsSinceCrisis).toBe(6);
  });
});
