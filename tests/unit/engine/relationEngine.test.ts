/**
 * relationEngine 单元测试
 *
 * 测试范围（按 P1 优先级）:
 *   - advanceRelationDecay: 强关系（>60）每回合 -1
 *   - advanceRelationDecay: 关系 ≤60 不变
 *   - isStrongRelationCapped: ≤3 条强关系返回 false
 *   - isStrongRelationCapped: 4+ 条强关系返回 true
 *   - applyCapToNewRelation: capped 时钳制到 60
 *   - getGrindFactor: 强关系返回 0.5，否则 1.0
 *   - getRelationNetworkStats: 返回正确统计
 *
 * 运行: npm test
 */

import { describe, test, expect } from 'vitest';
import {
  advanceRelationDecay,
  isStrongRelationCapped,
  applyCapToNewRelation,
  getGrindFactor,
  getRelationNetworkStats,
} from '../../../src/engine/relationEngine';
import { RELATION_CAP } from '../../../src/config/gameBalance';
import type { GameState, RelationEntry, RelationType } from '../../../src/types';
import { makeTestMP, makeTestState as makeBaseState } from '../../helpers/fixtures';

// ============================================================================
// 测试夹具（fixtures）
// ============================================================================

function makeTestRelation(
  from: string,
  to: string,
  score: number,
  type: RelationType = 'friendly',
): RelationEntry {
  return {
    from,
    to,
    score,
    type,
    description: '测试关系',
  };
}

function makeTestState(relations?: RelationEntry[]): GameState {
  return {
    ...makeBaseState(),
    parties: [],
    relations: relations ?? [],
    mpPersonalities: {
      mp1: makeTestMP('mp1', { partyId: 'reform', loyalty: 50, ambition: 50, politicalCapital: 30 }),
      mp2: makeTestMP('mp2', { partyId: 'liberty', loyalty: 60, ambition: 40, politicalCapital: 25 }),
      mp3: makeTestMP('mp3', { partyId: 'conservative', loyalty: 70, ambition: 60, politicalCapital: 40 }),
      mp4: makeTestMP('mp4', { partyId: 'progressive', loyalty: 80, ambition: 30, politicalCapital: 35 }),
      mp5: makeTestMP('mp5', { partyId: 'populist', loyalty: 40, ambition: 70, politicalCapital: 45 }),
    },
  };
}

// ============================================================================
// 1. advanceRelationDecay 关系衰减
// ============================================================================

describe('advanceRelationDecay 关系衰减', () => {
  test('强关系（>60）每回合衰减 1', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
    ]);
    const newState = advanceRelationDecay(state);
    const relation = newState.relations.find(r => r.from === 'mp1' && r.to === 'mp2');
    expect(relation?.score).toBe(69); // 70 - 1
  });

  test('强关系多回合累积衰减', () => {
    let state = makeTestState([
      makeTestRelation('mp1', 'mp2', 80),
    ]);
    state = advanceRelationDecay(state); // 80 -> 79
    state = advanceRelationDecay(state); // 79 -> 78
    state = advanceRelationDecay(state); // 78 -> 77
    const relation = state.relations.find(r => r.from === 'mp1' && r.to === 'mp2');
    expect(relation?.score).toBe(77);
  });

  test('关系衰减到 60 后停止', () => {
    let state = makeTestState([
      makeTestRelation('mp1', 'mp2', 61),
    ]);
    state = advanceRelationDecay(state); // 61 -> 60
    state = advanceRelationDecay(state); // 应停止在 60
    const relation = state.relations.find(r => r.from === 'mp1' && r.to === 'mp2');
    expect(relation?.score).toBe(60);
  });

  test('中等关系（≤60）不衰减', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 60),
      makeTestRelation('mp1', 'mp3', 40),
      makeTestRelation('mp2', 'mp3', 20),
    ]);
    const newState = advanceRelationDecay(state);
    expect(newState.relations[0].score).toBe(60);
    expect(newState.relations[1].score).toBe(40);
    expect(newState.relations[2].score).toBe(20);
  });

  test('敌对关系（负数）不衰减', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', -30),
    ]);
    const newState = advanceRelationDecay(state);
    expect(newState.relations[0].score).toBe(-30);
  });

  test('无关系时不崩溃', () => {
    const state = makeTestState([]);
    const newState = advanceRelationDecay(state);
    expect(newState.relations).toHaveLength(0);
  });

  test('混合关系正确衰减', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 80),  // 强关系，应衰减
      makeTestRelation('mp1', 'mp3', 50),  // 中等，不变
      makeTestRelation('mp2', 'mp3', 70),  // 强关系，应衰减
      makeTestRelation('mp3', 'mp4', 20),  // 弱关系，不变
    ]);
    const newState = advanceRelationDecay(state);
    expect(newState.relations[0].score).toBe(79);
    expect(newState.relations[1].score).toBe(50);
    expect(newState.relations[2].score).toBe(69);
    expect(newState.relations[3].score).toBe(20);
  });

  test('恰好 60 的关系不再衰减', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 60),
    ]);
    const newState = advanceRelationDecay(state);
    expect(newState.relations[0].score).toBe(60);
  });

  test('极大值（100）关系衰减正确', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 100),
    ]);
    const newState = advanceRelationDecay(state);
    expect(newState.relations[0].score).toBe(99);
  });
});

// ============================================================================
// 2. RELATION_CAP 配置值
// ============================================================================

describe('RELATION_CAP 配置值', () => {
  test('每议员强关系上限应为 4', () => {
    expect(RELATION_CAP.strongRelationsPerMP).toBe(4);
  });

  test('强关系阈值应为 60', () => {
    expect(RELATION_CAP.strongRelationScoreThreshold).toBe(60);
  });

  test('衰减回合阈值应为 5', () => {
    expect(RELATION_CAP.decayTurnsThreshold).toBe(5);
  });

  test('每回合衰减量应为 1', () => {
    expect(RELATION_CAP.decayPerTurn).toBe(1);
  });

  test('刷关系回合阈值应为 3', () => {
    expect(RELATION_CAP.grindTurnsThreshold).toBe(3);
  });

  test('刷关系衰减因子应为 0.5', () => {
    expect(RELATION_CAP.grindDiminishingFactor).toBe(0.5);
  });
});

// ============================================================================
// 3. isStrongRelationCapped 上限检测
// ============================================================================

describe('isStrongRelationCapped 上限检测', () => {
  test('0 条强关系返回 false', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 40),
      makeTestRelation('mp1', 'mp3', 30),
    ]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(false);
  });

  test('1 条强关系返回 false', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 40),
    ]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(false);
  });

  test('3 条强关系返回 false', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 40),
    ]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(false);
  });

  test('4 条强关系返回 true', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 75),
    ]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(true);
  });

  test('5 条强关系返回 true', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 75),
      makeTestRelation('mp1', 'mp1', 90), // 自我关系也算
    ]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(true);
  });

  test('恰好 60 分不算强关系', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 60),
      makeTestRelation('mp1', 'mp3', 60),
      makeTestRelation('mp1', 'mp4', 60),
      makeTestRelation('mp1', 'mp5', 60),
    ]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(false);
  });

  test('61 分算强关系', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 61),
      makeTestRelation('mp1', 'mp3', 61),
      makeTestRelation('mp1', 'mp4', 61),
      makeTestRelation('mp1', 'mp5', 61),
    ]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(true);
  });

  test('不同议员的关系独立计数', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 70),
      makeTestRelation('mp2', 'mp3', 70),
      makeTestRelation('mp2', 'mp4', 70),
      makeTestRelation('mp2', 'mp5', 70),
      makeTestRelation('mp2', 'mp6', 70),
    ]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(false); // mp1 只有 2 条
    expect(isStrongRelationCapped(state, 'mp2')).toBe(true);  // mp2 有 4 条
  });

  test('没有关系的议员返回 false', () => {
    const state = makeTestState([]);
    expect(isStrongRelationCapped(state, 'mp1')).toBe(false);
  });
});

// ============================================================================
// 4. applyCapToNewRelation 钳制新关系
// ============================================================================

describe('applyCapToNewRelation 钳制新关系', () => {
  test('未达上限时返回原始分数', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
    ]);
    const cappedScore = applyCapToNewRelation(state, 'mp1', 75);
    expect(cappedScore).toBe(75); // 只有 2 条强关系，未达上限
  });

  test('达上限时钳制到 60', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 75),
    ]);
    const cappedScore = applyCapToNewRelation(state, 'mp1', 90);
    expect(cappedScore).toBe(60); // 已有 4 条强关系，钳制到 60
  });

  test('原始分数 ≤60 时不变（即使已达上限）', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 75),
    ]);
    const cappedScore = applyCapToNewRelation(state, 'mp1', 50);
    expect(cappedScore).toBe(50); // 原始分数 ≤60，不钳制
  });

  test('恰好 60 的分数不变', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 75),
    ]);
    const cappedScore = applyCapToNewRelation(state, 'mp1', 60);
    expect(cappedScore).toBe(60);
  });

  test('极大值（100）在达上限时钳制到 60', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 75),
    ]);
    const cappedScore = applyCapToNewRelation(state, 'mp1', 100);
    expect(cappedScore).toBe(60);
  });

  test('0 条关系时返回原始分数', () => {
    const state = makeTestState([]);
    const cappedScore = applyCapToNewRelation(state, 'mp1', 80);
    expect(cappedScore).toBe(80);
  });

  test('负数分数不变（不算强关系）', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 75),
    ]);
    const cappedScore = applyCapToNewRelation(state, 'mp1', -30);
    expect(cappedScore).toBe(-30);
  });
});

// ============================================================================
// 5. getGrindFactor 防刷关系系数
// ============================================================================

describe('getGrindFactor 防刷关系系数', () => {
  test('无关系时返回 1.0', () => {
    const state = makeTestState([]);
    const factor = getGrindFactor(state, 'mp1', 'mp2');
    expect(factor).toBe(1.0);
  });

  test('弱关系（≤60）返回 1.0', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 50),
    ]);
    const factor = getGrindFactor(state, 'mp1', 'mp2');
    expect(factor).toBe(1.0);
  });

  test('强关系（>60）返回 0.5', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
    ]);
    const factor = getGrindFactor(state, 'mp1', 'mp2');
    expect(factor).toBe(0.5);
  });

  test('恰好 60 的关系返回 1.0', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 60),
    ]);
    const factor = getGrindFactor(state, 'mp1', 'mp2');
    expect(factor).toBe(1.0);
  });

  test('61 分的关系返回 0.5', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 61),
    ]);
    const factor = getGrindFactor(state, 'mp1', 'mp2');
    expect(factor).toBe(0.5);
  });

  test('不同议员对返回不同系数', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 40),
    ]);
    expect(getGrindFactor(state, 'mp1', 'mp2')).toBe(0.5);
    expect(getGrindFactor(state, 'mp1', 'mp3')).toBe(1.0);
  });

  test('关系是单向的（from→to 与 to→from 独立）', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
    ]);
    expect(getGrindFactor(state, 'mp1', 'mp2')).toBe(0.5);
    expect(getGrindFactor(state, 'mp2', 'mp1')).toBe(1.0); // 反向无关系
  });

  test('极大值（100）关系返回 0.5', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 100),
    ]);
    const factor = getGrindFactor(state, 'mp1', 'mp2');
    expect(factor).toBe(0.5);
  });

  test('敌对关系（负数）返回 1.0', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', -30),
    ]);
    const factor = getGrindFactor(state, 'mp1', 'mp2');
    expect(factor).toBe(1.0);
  });
});

// ============================================================================
// 6. getRelationNetworkStats 关系网统计
// ============================================================================

describe('getRelationNetworkStats 关系网统计', () => {
  test('无关系时返回全 0 统计', () => {
    const state = makeTestState([]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.fromId).toBe('mp1');
    expect(stats.totalRelations).toBe(0);
    expect(stats.strongRelations).toBe(0);
    expect(stats.weakRelations).toBe(0);
    expect(stats.hostileRelations).toBe(0);
    expect(stats.capped).toBe(false);
  });

  test('正确统计强关系（>60）', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
    ]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.totalRelations).toBe(3);
    expect(stats.strongRelations).toBe(3);
    expect(stats.weakRelations).toBe(0);
    expect(stats.hostileRelations).toBe(0);
  });

  test('正确统计弱关系（0-60）', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 40),
      makeTestRelation('mp1', 'mp3', 20),
      makeTestRelation('mp1', 'mp4', 60),
    ]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.totalRelations).toBe(3);
    expect(stats.strongRelations).toBe(0);
    expect(stats.weakRelations).toBe(3);
    expect(stats.hostileRelations).toBe(0);
  });

  test('正确统计敌对关系（<0）', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', -30),
      makeTestRelation('mp1', 'mp3', -50),
    ]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.totalRelations).toBe(2);
    expect(stats.strongRelations).toBe(0);
    expect(stats.weakRelations).toBe(0);
    expect(stats.hostileRelations).toBe(2);
  });

  test('混合关系正确分类统计', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),   // 强关系
      makeTestRelation('mp1', 'mp3', 40),   // 弱关系
      makeTestRelation('mp1', 'mp4', -20),  // 敌对
      makeTestRelation('mp1', 'mp5', 60),   // 弱关系（恰好 60）
    ]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.totalRelations).toBe(4);
    expect(stats.strongRelations).toBe(1);
    expect(stats.weakRelations).toBe(2);
    expect(stats.hostileRelations).toBe(1);
  });

  test('capped 标志在强关系 ≥4 时为 true', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
      makeTestRelation('mp1', 'mp5', 75),
    ]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.capped).toBe(true);
  });

  test('capped 标志在强关系 <4 时为 false', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp1', 'mp3', 80),
      makeTestRelation('mp1', 'mp4', 65),
    ]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.capped).toBe(false);
  });

  test('只统计指定议员的关系（from 方向）', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 70),
      makeTestRelation('mp2', 'mp1', 80),
      makeTestRelation('mp1', 'mp3', 60),
      makeTestRelation('mp3', 'mp1', 50),
    ]);
    const stats1 = getRelationNetworkStats(state, 'mp1');
    const stats2 = getRelationNetworkStats(state, 'mp2');
    expect(stats1.totalRelations).toBe(2); // mp1->mp2, mp1->mp3
    expect(stats2.totalRelations).toBe(1); // mp2->mp1
  });

  test('0 分关系归类为弱关系', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 0),
    ]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.weakRelations).toBe(1);
    expect(stats.hostileRelations).toBe(0);
  });

  test('关系 61 分归类为强关系', () => {
    const state = makeTestState([
      makeTestRelation('mp1', 'mp2', 61),
    ]);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.strongRelations).toBe(1);
    expect(stats.weakRelations).toBe(0);
  });

  test('极大关系数统计正确', () => {
    const relations: RelationEntry[] = [];
    for (let i = 0; i < 20; i++) {
      relations.push(makeTestRelation('mp1', `mp${i + 2}`, 70 + i));
    }
    const state = makeTestState(relations);
    const stats = getRelationNetworkStats(state, 'mp1');
    expect(stats.totalRelations).toBe(20);
    expect(stats.strongRelations).toBe(20);
    expect(stats.capped).toBe(true);
  });
});
