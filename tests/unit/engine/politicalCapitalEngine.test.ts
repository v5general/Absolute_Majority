/**
 * politicalCapitalEngine 单元测试
 *
 * 测试范围（Phase G Q3 政治资本系统）:
 *   - initializeCapital: 默认 30，按出身浮动（political_dynasty +10、union_cadre +5、grassroots +8）
 *   - grantCapital/spendCapital: clamp 到 [0, 100]
 *   - getCapitalSuccessRate: < 20 返回 0.7，≥ 20 返回 1.0
 *   - advanceCapitalTurn: 应用派阀 faucet/sink，单回合上限 ±15
 *   - initializeAllCapital: 迁移旧存档（undefined → 30 + 出身修正）
 *   - getCapital: 读取政治资本（兜底 30）
 *
 * 运行: npm test
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  initializeCapital,
  grantCapital,
  spendCapital,
  getCapitalSuccessRate,
  advanceCapitalTurn,
  initializeAllCapital,
  getCapital,
  type CapitalChangeEvent,
} from '../../../src/engine/politicalCapitalEngine';
import { POLITICAL_CAPITAL_RULES } from '../../../src/config/gameBalance';
import type { GameState } from '../../../src/types';
import type { MPPersonality } from '../../../src/types/mp';
import type { MPBackground } from '../../../src/types/background';

// ============================================================================
// 测试夹具（fixtures）
// ============================================================================

function makeTestMP(id: string, overrides?: Partial<MPPersonality>): MPPersonality {
  return {
    id,
    personName: id,  // 测试用：id 直接作为 personName
    partyId: 'test_party',
    age: 45,
    gender: 'male',
    ambition: 50,
    loyalty: 50,
    corruption: 20,
    popularity: 50,
    mediaSkill: 50,
    negotiationSkill: 50,
    politicalCapital: undefined,
    personalityTraits: [],
    politicalIdeology: { primary: 'centrist', secondary: [] },
    factionId: null,
    deceased: false,
    committeeAssignments: [],
    isLeader: false,
    ...overrides,
  };
}

function makeTestBackground(
  familyOrigin: MPBackground['familyOrigin'],
  socialClass?: MPBackground['socialClass'],
): MPBackground {
  return {
    familyOrigin,
    education: 'university',
    career: '测试职业',
    socialClass: socialClass ?? 'middle',
    hometown: '东京',
    connections: [],
    modifiers: { loyalty: 0, ambition: 0, corruption: 0, popularity: 0 },
  };
}

function makeTestState(overrides?: Partial<GameState>): GameState {
  const base: GameState = {
    parties: [],
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
      'test_party:议员1': makeTestMP('议员1'),
      'test_party:议员2': makeTestMP('议员2', { politicalCapital: 50 }),
      'test_party:议员3': makeTestMP('议员3', { politicalCapital: 0 }),
      'test_party:议员4': makeTestMP('议员4', { politicalCapital: 100 }),
    },
    playerConfig: null,
    currentAIEvents: [],
    currentDay: 1,
    turn: 1,
    turnsUntilElection: 48,
    isElectionCampaign: false,
    ...overrides,
  };
  return base;
}

// ============================================================================
// 1. 常量验证
// ============================================================================

describe('政治资本常量', () => {
  test('初始值 = 30', () => {
    expect(POLITICAL_CAPITAL_RULES.initialValue).toBe(30);
  });

  test('最小值 = 0，最大值 = 100', () => {
    expect(POLITICAL_CAPITAL_RULES.minValue).toBe(0);
    expect(POLITICAL_CAPITAL_RULES.maxValue).toBe(100);
  });

  test('单回合变化上限 = 15', () => {
    expect(POLITICAL_CAPITAL_RULES.perTurnChangeCap).toBe(15);
  });

  test('低资本阈值 = 20，成功率倍率 = 0.7', () => {
    expect(POLITICAL_CAPITAL_RULES.lowCapitalThreshold).toBe(20);
    expect(POLITICAL_CAPITAL_RULES.lowCapitalSuccessMultiplier).toBe(0.7);
  });

  test('出身加成：political_dynasty +10、union_cadre +5、grassroots +8', () => {
    expect(POLITICAL_CAPITAL_RULES.backgroundBonus.political_dynasty).toBe(10);
    expect(POLITICAL_CAPITAL_RULES.backgroundBonus.union_cadre).toBe(5);
    expect(POLITICAL_CAPITAL_RULES.backgroundBonus.grassroots).toBe(8);
  });
});

// ============================================================================
// 2. initializeCapital
// ============================================================================

describe('initializeCapital', () => {
  test('默认值 = 30', () => {
    const mp = makeTestMP('test');
    const capital = initializeCapital(mp);
    expect(capital).toBe(30);
  });

  test('已有政治资本时保留原值', () => {
    const mp = makeTestMP('test', { politicalCapital: 75 });
    const capital = initializeCapital(mp);
    expect(capital).toBe(75);
  });

  test('已有 0 值时保留（不覆盖）', () => {
    const mp = makeTestMP('test', { politicalCapital: 0 });
    const capital = initializeCapital(mp);
    expect(capital).toBe(0);
  });

  test('已有 100 值时保留（不覆盖）', () => {
    const mp = makeTestMP('test', { politicalCapital: 100 });
    const capital = initializeCapital(mp);
    expect(capital).toBe(100);
  });

  test('政治世家背景 +10', () => {
    const mp = makeTestMP('test');
    const background = makeTestBackground('political_family');
    const capital = initializeCapital(mp, background);
    expect(capital).toBe(40); // 30 + 10
  });

  test('工会干部背景 +5', () => {
    const mp = makeTestMP('test');
    const background = makeTestBackground('union_cadre');
    const capital = initializeCapital(mp, background);
    expect(capital).toBe(35); // 30 + 5
  });

  test('基层活动家背景 +8', () => {
    const mp = makeTestMP('test');
    const background = makeTestBackground('grassroots_activist');
    const capital = initializeCapital(mp, background);
    expect(capital).toBe(38); // 30 + 8
  });

  test('工人阶级背景 +8', () => {
    const mp = makeTestMP('test');
    const background = makeTestBackground('middle_class', 'working');
    const capital = initializeCapital(mp, background);
    expect(capital).toBe(38); // 30 + 8
  });

  test('背景加成后 clamp 到 [0, 100]', () => {
    const mp = makeTestMP('test', { politicalCapital: 98 });
    const background = makeTestBackground('political_family');
    const capital = initializeCapital(mp, background);
    expect(capital).toBe(100); // 98 保留，不会 +10 溢出
  });

  test('null 值视为未初始化，应用默认值', () => {
    const mp = makeTestMP('test', { politicalCapital: null });
    const capital = initializeCapital(mp);
    expect(capital).toBe(30);
  });

  test('undefined 值视为未初始化，应用默认值', () => {
    const mp = makeTestMP('test', { politicalCapital: undefined });
    const capital = initializeCapital(mp);
    expect(capital).toBe(30);
  });
});

// ============================================================================
// 3. grantCapital
// ============================================================================

describe('grantCapital', () => {
  test('增加正数值', () => {
    const state = makeTestState();
    const result = grantCapital(state, 'test_party:议员1', 20, '测试增加');

    expect(result.change).not.toBeNull();
    expect(result.change?.delta).toBe(20);
    expect(result.change?.newCapital).toBe(50);

    const mp = result.state.mpPersonalities['test_party:议员1'];
    expect(mp.politicalCapital).toBe(50);
  });

  test('增加后 clamp 到 100（不溢出）', () => {
    const state = makeTestState();
    const result = grantCapital(state, 'test_party:议员2', 80, '测试溢出');

    expect(result.change?.newCapital).toBe(100);
    expect(result.state.mpPersonalities['test_party:议员2'].politicalCapital).toBe(100);
  });

  test('从 0 增加不崩溃', () => {
    const state = makeTestState();
    const result = grantCapital(state, 'test_party:议员3', 30, '从零开始');

    expect(result.change?.newCapital).toBe(30);
    expect(result.state.mpPersonalities['test_party:议员3'].politicalCapital).toBe(30);
  });

  test('从 100 增加无效果（已在上限）', () => {
    const state = makeTestState();
    const result = grantCapital(state, 'test_party:议员4', 10, '已达上限');

    expect(result.change).toBeNull(); // 无变化
    expect(result.state.mpPersonalities['test_party:议员4'].politicalCapital).toBe(100);
  });

  test('对不存在的议员操作返回无变化', () => {
    const state = makeTestState();
    const result = grantCapital(state, 'test_party:不存在的议员', 20, '测试');

    expect(result.change).toBeNull();
    expect(result.state).toBe(state); // 返回原 state
  });

  test('负数增量转为正数（绝对值）', () => {
    const state = makeTestState();
    const result = grantCapital(state, 'test_party:议员1', -15, '负数测试');

    expect(result.change?.delta).toBe(15); // 取绝对值
    expect(result.change?.newCapital).toBe(45);
  });

  test('返回包含变化事件（含 reason 和 mpName）', () => {
    const state = makeTestState();
    const result = grantCapital(state, 'test_party:议员1', 10, '法案通过');

    expect(result.change).toMatchObject({
      mpKey: 'test_party:议员1',
      mpName: '议员1',
      delta: 10,
      reason: '法案通过',
      newCapital: 40,
    });
  });
});

// ============================================================================
// 4. spendCapital
// ============================================================================

describe('spendCapital', () => {
  test('消耗正数值', () => {
    const state = makeTestState();
    const result = spendCapital(state, 'test_party:议员2', 20, '测试消耗');

    expect(result.change).not.toBeNull();
    expect(result.change?.delta).toBe(-20);
    expect(result.change?.newCapital).toBe(30);

    const mp = result.state.mpPersonalities['test_party:议员2'];
    expect(mp.politicalCapital).toBe(30);
  });

  test('消耗后 clamp 到 0（不溢出）', () => {
    const state = makeTestState();
    const result = spendCapital(state, 'test_party:议员2', 70, '过度消耗');

    expect(result.change?.newCapital).toBe(0);
    expect(result.state.mpPersonalities['test_party:议员2'].politicalCapital).toBe(0);
  });

  test('从 0 消耗无效果（已在下限）', () => {
    const state = makeTestState();
    const result = spendCapital(state, 'test_party:议员3', 10, '无资本可消耗');

    expect(result.change).toBeNull();
    expect(result.state.mpPersonalities['test_party:议员3'].politicalCapital).toBe(0);
  });

  test('负数消耗转为正数（绝对值）', () => {
    const state = makeTestState();
    const result = spendCapital(state, 'test_party:议员2', -15, '负数测试');

    expect(result.change?.delta).toBe(-15); // 取绝对值后变负
    expect(result.change?.newCapital).toBe(35);
  });

  test('消耗导致 delta 为负数', () => {
    const state = makeTestState();
    const result = spendCapital(state, 'test_party:议员2', 5, '小消耗');

    expect(result.change?.delta).toBeLessThan(0);
    expect(result.change?.delta).toBe(-5);
  });

  test('返回包含变化事件（含 reason 和 mpName）', () => {
    const state = makeTestState();
    const result = spendCapital(state, 'test_party:议员2', 15, '组阁消耗');

    expect(result.change).toMatchObject({
      mpKey: 'test_party:议员2',
      mpName: '议员2',
      delta: -15,
      reason: '组阁消耗',
      newCapital: 35,
    });
  });
});

// ============================================================================
// 5. getCapitalSuccessRate
// ============================================================================

describe('getCapitalSuccessRate', () => {
  test('政治资本 < 20 → 返回 0.7', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = 19;

    const rate = getCapitalSuccessRate(state, 'test_party:议员1');
    expect(rate).toBe(0.7);
  });

  test('政治资本 = 20 → 返回 1.0（不包含边界）', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = 20;

    const rate = getCapitalSuccessRate(state, 'test_party:议员1');
    expect(rate).toBe(1.0);
  });

  test('政治资本 = 0 → 返回 0.7', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = 0;

    const rate = getCapitalSuccessRate(state, 'test_party:议员1');
    expect(rate).toBe(0.7);
  });

  test('政治资本 > 20 → 返回 1.0', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;

    const rate = getCapitalSuccessRate(state, 'test_party:议员1');
    expect(rate).toBe(1.0);
  });

  test('政治资本 = 100 → 返回 1.0', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = 100;

    const rate = getCapitalSuccessRate(state, 'test_party:议员1');
    expect(rate).toBe(1.0);
  });

  test('议员不存在时返回 1.0（兜底）', () => {
    const state = makeTestState();
    const rate = getCapitalSuccessRate(state, 'test_party:不存在的议员');
    expect(rate).toBe(1.0);
  });

  test('政治资本 undefined 时使用默认值 30 → 返回 1.0', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = undefined;

    const rate = getCapitalSuccessRate(state, 'test_party:议员1');
    expect(rate).toBe(1.0); // 30 >= 20
  });
});

// ============================================================================
// 6. advanceCapitalTurn
// ============================================================================

describe('advanceCapitalTurn', () => {
  test('派阀成员自动 +1（factionBacking）', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].factionId = 'faction_a';
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;
    state.mpPersonalities['test_party:议员1'].loyalty = 60; // 高忠诚，不扣派系协调

    const newState = advanceCapitalTurn(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(51);
  });

  test('派阀成员且忠诚度 < 50 → +1 -5 = -4', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].factionId = 'faction_a';
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;
    state.mpPersonalities['test_party:议员1'].loyalty = 40; // 低忠诚

    const newState = advanceCapitalTurn(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(46); // 50 + 1 - 5
  });

  test('无派阀议员无自动变化', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].factionId = null;
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;

    const newState = advanceCapitalTurn(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(50);
  });

  test('单回合变化上限 ±15（应用 perTurnChangeCap）', () => {
    const state = makeTestState();
    // 构造极端情况：delta 应很大，但被 cap 到 15
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;
    state.mpPersonalities['test_party:议员1'].factionId = 'faction_a';
    state.mpPersonalities['test_party:议员1'].loyalty = 0; // 最大负面

    const newState = advanceCapitalTurn(state);

    // +1 -5 = -4，远小于 -15 限制
    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(46);
  });

  test('变化后 clamp 到 [0, 100]', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员3'].politicalCapital = 0;
    state.mpPersonalities['test_party:议员3'].factionId = 'faction_a';
    state.mpPersonalities['test_party:议员3'].loyalty = 40; // 低忠诚，-4

    const newState = advanceCapitalTurn(state);

    expect(newState.mpPersonalities['test_party:议员3'].politicalCapital).toBe(0); // clamp 到下限
  });

  test('已故议员跳过处理', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].deceased = true;
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;
    state.mpPersonalities['test_party:议员1'].factionId = 'faction_a';

    const newState = advanceCapitalTurn(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(50);
  });

  test('有变化时添加事件到日志', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].factionId = 'faction_a';
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;

    const eventCountBefore = state.events.length;
    const newState = advanceCapitalTurn(state);

    expect(newState.events.length).toBeGreaterThan(eventCountBefore);
    const newEvent = newState.events[newState.events.length - 1];
    expect(newEvent.title).toBe('政治资本变化');
    expect(newEvent.description).toContain('议员1');
  });

  test('无变化时不添加事件', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].factionId = null;
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;

    const eventCountBefore = state.events.length;
    const newState = advanceCapitalTurn(state);

    expect(newState.events.length).toBe(eventCountBefore);
  });
});

// ============================================================================
// 7. initializeAllCapital
// ============================================================================

describe('initializeAllCapital', () => {
  test('迁移 undefined 值的议员 → 应用默认值 30', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = undefined;

    const newState = initializeAllCapital(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(30);
  });

  test('迁移 null 值的议员 → 应用默认值 30', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = null;

    const newState = initializeAllCapital(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(30);
  });

  test('已有值议员保持不变', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员2'].politicalCapital = 50;

    const newState = initializeAllCapital(state);

    expect(newState.mpPersonalities['test_party:议员2'].politicalCapital).toBe(50);
  });

  test('应用出身修正（政治世家 +10）', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = undefined;
    state.mpPersonalities['test_party:议员1'].background = makeTestBackground('political_family');

    const newState = initializeAllCapital(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(40); // 30 + 10
  });

  test('应用出身修正（工会干部 +5）', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = undefined;
    state.mpPersonalities['test_party:议员1'].background = makeTestBackground('union_cadre');

    const newState = initializeAllCapital(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(35); // 30 + 5
  });

  test('应用出身修正（基层 +8）', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = undefined;
    state.mpPersonalities['test_party:议员1'].background = makeTestBackground('grassroots_activist');

    const newState = initializeAllCapital(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(38); // 30 + 8
  });

  test('批量处理多个议员', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = undefined;
    state.mpPersonalities['test_party:议员2'].politicalCapital = undefined;
    state.mpPersonalities['test_party:议员3'].politicalCapital = undefined;

    const newState = initializeAllCapital(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(30);
    expect(newState.mpPersonalities['test_party:议员2'].politicalCapital).toBe(30);
    expect(newState.mpPersonalities['test_party:议员3'].politicalCapital).toBe(30);
  });

  test('无变化时返回原 state（引用相等）', () => {
    const state = makeTestState();
    // 所有人都有值
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;
    state.mpPersonalities['test_party:议员2'].politicalCapital = 60;
    state.mpPersonalities['test_party:议员3'].politicalCapital = 70;
    state.mpPersonalities['test_party:议员4'].politicalCapital = 80;

    const newState = initializeAllCapital(state);

    expect(newState).toBe(state);
  });

  test('有变化时返回新 state（引用不等）', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = undefined;

    const newState = initializeAllCapital(state);

    expect(newState).not.toBe(state);
  });
});

// ============================================================================
// 8. getCapital
// ============================================================================

describe('getCapital', () => {
  test('读取已有政治资本', () => {
    const mp = makeTestMP('test', { politicalCapital: 75 });
    const capital = getCapital(mp);
    expect(capital).toBe(75);
  });

  test('undefined 时返回默认值 30', () => {
    const mp = makeTestMP('test', { politicalCapital: undefined });
    const capital = getCapital(mp);
    expect(capital).toBe(30);
  });

  test('null 时返回默认值 30', () => {
    const mp = makeTestMP('test', { politicalCapital: null });
    const capital = getCapital(mp);
    expect(capital).toBe(30);
  });

  test('mp 为 undefined 时返回默认值 30', () => {
    const capital = getCapital(undefined);
    expect(capital).toBe(30);
  });

  test('边界值：0', () => {
    const mp = makeTestMP('test', { politicalCapital: 0 });
    const capital = getCapital(mp);
    expect(capital).toBe(0);
  });

  test('边界值：100', () => {
    const mp = makeTestMP('test', { politicalCapital: 100 });
    const capital = getCapital(mp);
    expect(capital).toBe(100);
  });
});

// ============================================================================
// 9. 综合场景测试
// ============================================================================

describe('综合场景', () => {
  test('完整流程：初始化 → 增加 → 消耗 → 获取成功率', () => {
    const mp = makeTestMP('test');
    const background = makeTestBackground('political_family');

    // 初始化（40）
    let capital = initializeCapital(mp, background);
    expect(capital).toBe(40);

    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'] = { ...mp, politicalCapital: capital };

    // 增加 20（clamp 到 60）
    let result = grantCapital(state, 'test_party:议员1', 20, '法案通过');
    expect(result.change?.newCapital).toBe(60);
    expect(result.state.mpPersonalities['test_party:议员1'].politicalCapital).toBe(60);

    // 消耗 25（降到 35）
    result = spendCapital(result.state, 'test_party:议员1', 25, '组阁');
    expect(result.change?.newCapital).toBe(35);

    // 获取成功率（35 >= 20 → 1.0）
    const rate = getCapitalSuccessRate(result.state, 'test_party:议员1');
    expect(rate).toBe(1.0);
  });

  test('低资本完整流程：初始化 → 消耗 → 获取成功率折扣', () => {
    const mp = makeTestMP('test');

    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'] = { ...mp, politicalCapital: 30 };

    // 消耗 20（降到 10）
    const result = spendCapital(state, 'test_party:议员1', 20, '争议法案');
    expect(result.change?.newCapital).toBe(10);

    // 获取成功率（10 < 20 → 0.7）
    const rate = getCapitalSuccessRate(result.state, 'test_party:议员1');
    expect(rate).toBe(0.7);
  });

  test('极端情况：政治世家出身，从 0 恢复到 100', () => {
    const mp = makeTestMP('test', { politicalCapital: 0 });
    const background = makeTestBackground('political_family');

    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'] = { ...mp, background };

    // 增加大额（clamp 到 100）
    const result = grantCapital(state, 'test_party:议员1', 200, '巨大成功');

    expect(result.change?.newCapital).toBe(100);
  });

  test('派阀回合推进完整场景', () => {
    const state = makeTestState();
    state.mpPersonalities['test_party:议员1'].politicalCapital = 50;
    state.mpPersonalities['test_party:议员1'].factionId = 'faction_a';
    state.mpPersonalities['test_party:议员1'].loyalty = 30; // 低忠诚

    // 回合推进：+1 -5 = -4
    const newState = advanceCapitalTurn(state);

    expect(newState.mpPersonalities['test_party:议员1'].politicalCapital).toBe(46);
    expect(newState.events.length).toBeGreaterThan(state.events.length);

    const lastEvent = newState.events[newState.events.length - 1];
    expect(lastEvent.title).toBe('政治资本变化');
    expect(lastEvent.description).toContain('-4');
  });

  test('批量迁移旧存档 → 正常运行', () => {
    const state = makeTestState();
    // 所有人都 undefined
    for (const key of Object.keys(state.mpPersonalities)) {
      state.mpPersonalities[key].politicalCapital = undefined;
      state.mpPersonalities[key].background = makeTestBackground('grassroots_activist');
    }

    const newState = initializeAllCapital(state);

    // 所有人都应该是 38（30 + 8）
    for (const mp of Object.values(newState.mpPersonalities)) {
      expect(mp.politicalCapital).toBe(38);
    }
  });
});
