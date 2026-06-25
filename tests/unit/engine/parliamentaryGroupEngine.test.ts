/**
 * parliamentaryGroupEngine 单元测试
 *
 * 测试范围：
 *   - initializeParliamentaryGroups 创建 6 个会派（每党一会派）
 *   - 每个会派的总席位数匹配党派席位数
 *   - getQuestionTimeAllocation 时间分配算法（180 分钟，最小保障 5 分钟）
 *   - getGroupByParty 正确查找会派
 *   - recalcGroupSeats 重新计算总席位数
 *
 * 运行: npm test
 */

import { describe, test, expect } from 'vitest';
import {
  initializeParliamentaryGroups,
  getQuestionTimeAllocation,
  getGroupByParty,
  recalcGroupSeats,
  TOTAL_DEBATE_TIME_PER_MONTH,
  MIN_DEBATE_TIME_PER_GROUP,
} from '../../../src/engine/parliamentaryGroupEngine';
import type { Party, ParliamentaryGroup, ElectionResult } from '../../../src/types';

// ============================================================================
// 测试夹具（fixtures）
// ============================================================================

function makeTestParty(
  id: string,
  seats: number,
  ideology: 'left' | 'center' | 'right' = 'center',
): Party {
  return {
    id,
    name: `党${id}`,
    abbreviation: id.toUpperCase(),
    color: '#000',
    ideology,
    leader: `党首${id}`,
    description: '测试用党',
    members: [],
    baseSupport: 20,
    currentSupport: 20,
    projectedSeats: seats,
    funds: 100,
    organization: 50,
    charisma: 50,
  };
}

function makeTestElectionResult(partyResults: { partyId: string; seats: number }[]): ElectionResult {
  const totalSeats = partyResults.reduce((sum, r) => sum + r.seats, 0);
  const majorityThreshold = Math.floor(totalSeats / 2) + 1;

  return {
    partyResults,
    hasMajority: partyResults.some(r => r.seats >= majorityThreshold),
    majorityPartyId: partyResults.find(r => r.seats >= majorityThreshold)?.partyId ?? null,
    totalSeats,
    majorityThreshold,
    districtResults: {},
  };
}

// ============================================================================
// 1. 常量测试
// ============================================================================

describe('常量定义', () => {
  test('TOTAL_DEBATE_TIME_PER_MONTH 应为 180 分钟', () => {
    expect(TOTAL_DEBATE_TIME_PER_MONTH).toBe(180);
  });

  test('MIN_DEBATE_TIME_PER_GROUP 应为 5 分钟', () => {
    expect(MIN_DEBATE_TIME_PER_GROUP).toBe(5);
  });
});

// ============================================================================
// 2. initializeParliamentaryGroups 测试
// ============================================================================

describe('initializeParliamentaryGroups', () => {
  test('6 个党创建 6 个会派（每个党独立成派）', () => {
    const parties = [
      makeTestParty('reform', 50),
      makeTestParty('liberty', 40),
      makeTestParty('conservative', 35),
      makeTestParty('progressive', 30),
      makeTestParty('populist', 25),
      makeTestParty('solidarity', 20),
    ];

    const electionResult = makeTestElectionResult([
      { partyId: 'reform', seats: 50 },
      { partyId: 'liberty', seats: 40 },
      { partyId: 'conservative', seats: 35 },
      { partyId: 'progressive', seats: 30 },
      { partyId: 'populist', seats: 25 },
      { partyId: 'solidarity', seats: 20 },
    ]);

    const groups = initializeParliamentaryGroups(parties, electionResult);

    expect(groups).toHaveLength(6);
  });

  test('每个会派只包含一个党（memberPartyIds 长度为 1）', () => {
    const parties = [
      makeTestParty('reform', 50),
      makeTestParty('liberty', 40),
      makeTestParty('conservative', 35),
    ];

    const electionResult = makeTestElectionResult([
      { partyId: 'reform', seats: 50 },
      { partyId: 'liberty', seats: 40 },
      { partyId: 'conservative', seats: 35 },
    ]);

    const groups = initializeParliamentaryGroups(parties, electionResult);

    for (const group of groups) {
      expect(group.memberPartyIds).toHaveLength(1);
    }
  });

  test('每个会派的 totalSeats 匹配对应党的 projectedSeats', () => {
    const parties = [
      makeTestParty('reform', 50),
      makeTestParty('liberty', 40),
      makeTestParty('conservative', 35),
      makeTestParty('progressive', 30),
      makeTestParty('populist', 25),
      makeTestParty('solidarity', 20),
    ];

    const electionResult = makeTestElectionResult([
      { partyId: 'reform', seats: 50 },
      { partyId: 'liberty', seats: 40 },
      { partyId: 'conservative', seats: 35 },
      { partyId: 'progressive', seats: 30 },
      { partyId: 'populist', seats: 25 },
      { partyId: 'solidarity', seats: 20 },
    ]);

    const groups = initializeParliamentaryGroups(parties, electionResult);

    for (const group of groups) {
      const partyId = group.memberPartyIds[0];
      const party = parties.find(p => p.id === partyId);
      expect(group.totalSeats).toBe(party?.projectedSeats);
    }
  });

  test('会派按 totalSeats 降序排列', () => {
    const parties = [
      makeTestParty('reform', 30),
      makeTestParty('liberty', 50),
      makeTestParty('conservative', 20),
    ];

    const electionResult = makeTestElectionResult([
      { partyId: 'reform', seats: 30 },
      { partyId: 'liberty', seats: 50 },
      { partyId: 'conservative', seats: 20 },
    ]);

    const groups = initializeParliamentaryGroups(parties, electionResult);

    // 检查降序
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1].totalSeats).toBeGreaterThanOrEqual(groups[i].totalSeats);
    }
  });

  test('零席位的党不创建会派', () => {
    const parties = [
      makeTestParty('reform', 50),
      makeTestParty('liberty', 0), // 零席位
      makeTestParty('conservative', 35),
    ];

    const electionResult = makeTestElectionResult([
      { partyId: 'reform', seats: 50 },
      { partyId: 'liberty', seats: 0 },
      { partyId: 'conservative', seats: 35 },
    ]);

    const groups = initializeParliamentaryGroups(parties, electionResult);

    expect(groups).toHaveLength(2);
    expect(groups.every(g => g.totalSeats > 0)).toBe(true);
  });

  test('会派命名格式为「{党名}会派」', () => {
    const parties = [makeTestParty('reform', 50)];

    const electionResult = makeTestElectionResult([{ partyId: 'reform', seats: 50 }]);

    const groups = initializeParliamentaryGroups(parties, electionResult);

    expect(groups[0].name).toBe('党reform会派');
  });
});

// ============================================================================
// 3. getQuestionTimeAllocation 测试
// ============================================================================

describe('getQuestionTimeAllocation', () => {
  test('空会派列表返回空数组', () => {
    const allocation = getQuestionTimeAllocation([]);
    expect(allocation).toEqual([]);
  });

  test('总时间固定为 180 分钟', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '会派1', memberPartyIds: ['p1'], totalSeats: 100 },
      { id: 'g2', name: '会派2', memberPartyIds: ['p2'], totalSeats: 50 },
      { id: 'g3', name: '会派3', memberPartyIds: ['p3'], totalSeats: 50 },
    ];

    const allocation = getQuestionTimeAllocation(groups);
    const totalMinutes = allocation.reduce((sum, a) => sum + a.minutes, 0);

    expect(totalMinutes).toBe(180);
  });

  test('最小保障：每个会派至少 5 分钟', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '大党', memberPartyIds: ['p1'], totalSeats: 150 },
      { id: 'g2', name: '小党', memberPartyIds: ['p2'], totalSeats: 1 }, // 极小党
    ];

    const allocation = getQuestionTimeAllocation(groups);

    // 极小党应获得至少 5 分钟
    const smallParty = allocation.find(a => a.groupId === 'g2');
    expect(smallParty?.minutes).toBeGreaterThanOrEqual(5);
  });

  test('大党获得更多时间（按席位比例）', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '大党', memberPartyIds: ['p1'], totalSeats: 120 },
      { id: 'g2', name: '小党', memberPartyIds: ['p2'], totalSeats: 40 },
      { id: 'g3', name: '中党', memberPartyIds: ['p3'], totalSeats: 40 },
    ];

    const allocation = getQuestionTimeAllocation(groups);

    const bigParty = allocation.find(a => a.groupId === 'g1');
    const smallParty = allocation.find(a => a.groupId === 'g2');
    const midParty = allocation.find(a => a.groupId === 'g3');

    // 大党时间 > 中党时间 = 小党时间（中党和小党因最小保障都 5 分钟）
    expect(bigParty!.minutes).toBeGreaterThan(midParty!.minutes);
    expect(midParty!.minutes).toBe(smallParty!.minutes);
  });

  test('6 个党平均分配时，每党约 30 分钟', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '党1', memberPartyIds: ['p1'], totalSeats: 34 },
      { id: 'g2', name: '党2', memberPartyIds: ['p2'], totalSeats: 33 },
      { id: 'g3', name: '党3', memberPartyIds: ['p3'], totalSeats: 33 },
      { id: 'g4', name: '党4', memberPartyIds: ['p4'], totalSeats: 34 },
      { id: 'g5', name: '党5', memberPartyIds: ['p5'], totalSeats: 33 },
      { id: 'g6', name: '党6', memberPartyIds: ['p6'], totalSeats: 33 },
    ];

    const allocation = getQuestionTimeAllocation(groups);

    // 每党约 30 分钟（允许 ±1 分钟的取整误差）
    for (const a of allocation) {
      expect(a.minutes).toBeGreaterThanOrEqual(29);
      expect(a.minutes).toBeLessThanOrEqual(31);
    }
    // 总分钟数精确等于 180
    const total = allocation.reduce((s, a) => s + a.minutes, 0);
    expect(total).toBe(180);
  });

  test('极端席位分布：一党独大，其余极小', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '大党', memberPartyIds: ['p1'], totalSeats: 190 },
      { id: 'g2', name: '微型党1', memberPartyIds: ['p2'], totalSeats: 2 },
      { id: 'g3', name: '微型党2', memberPartyIds: ['p3'], totalSeats: 2 },
      { id: 'g4', name: '微型党3', memberPartyIds: ['p4'], totalSeats: 2 },
      { id: 'g5', name: '微型党4', memberPartyIds: ['p5'], totalSeats: 2 },
      { id: 'g6', name: '微型党5', memberPartyIds: ['p6'], totalSeats: 2 },
    ];

    const allocation = getQuestionTimeAllocation(groups);

    // 大党应获得大部分时间（180 - 5*5 = 155）
    const bigParty = allocation.find(a => a.groupId === 'g1');
    expect(bigParty!.minutes).toBeGreaterThan(150);

    // 微型党都应获得最小保障 5 分钟
    const smallParties = allocation.filter(a => a.groupId !== 'g1');
    for (const sp of smallParties) {
      expect(sp.minutes).toBeGreaterThanOrEqual(5);
    }
  });

  test('share 百分比总和应为 1.0', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '党1', memberPartyIds: ['p1'], totalSeats: 100 },
      { id: 'g2', name: '党2', memberPartyIds: ['p2'], totalSeats: 50 },
      { id: 'g3', name: '党3', memberPartyIds: ['p3'], totalSeats: 30 },
    ];

    const allocation = getQuestionTimeAllocation(groups);
    const totalShare = allocation.reduce((sum, a) => sum + a.share, 0);

    expect(totalShare).toBeCloseTo(1.0, 2);
  });

  test('单个会派独占全部 180 分钟', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '唯一党', memberPartyIds: ['p1'], totalSeats: 200 },
    ];

    const allocation = getQuestionTimeAllocation(groups);

    expect(allocation).toHaveLength(1);
    expect(allocation[0].minutes).toBe(180);
    expect(allocation[0].share).toBe(1.0);
  });
});

// ============================================================================
// 4. getGroupByParty 测试
// ============================================================================

describe('getGroupByParty', () => {
  test('返回正确会派（partyId 存在）', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '党1会派', memberPartyIds: ['party_a'], totalSeats: 50 },
      { id: 'g2', name: '党2会派', memberPartyIds: ['party_b'], totalSeats: 40 },
    ];

    const group = getGroupByParty('party_a', groups);

    expect(group).not.toBeNull();
    expect(group?.id).toBe('g1');
  });

  test('不存在 partyId 时返回 null', () => {
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '党1会派', memberPartyIds: ['party_a'], totalSeats: 50 },
    ];

    const group = getGroupByParty('nonexistent', groups);

    expect(group).toBeNull();
  });

  test('空会派列表返回 null', () => {
    const group = getGroupByParty('party_a', []);
    expect(group).toBeNull();
  });
});

// ============================================================================
// 5. recalcGroupSeats 测试
// ============================================================================

describe('recalcGroupSeats', () => {
  test('重新计算后 totalSeats 匹配成员党席位数总和', () => {
    const parties = [
      makeTestParty('party_a', 50),
      makeTestParty('party_b', 40),
      makeTestParty('party_c', 35),
    ];

    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '党1会派', memberPartyIds: ['party_a'], totalSeats: 999 }, // 旧值
      { id: 'g2', name: '党2会派', memberPartyIds: ['party_b'], totalSeats: 888 },
      { id: 'g3', name: '党3会派', memberPartyIds: ['party_c'], totalSeats: 777 },
    ];

    const recalculated = recalcGroupSeats(groups, parties);

    expect(recalculated[0].totalSeats).toBe(50);
    expect(recalculated[1].totalSeats).toBe(40);
    expect(recalculated[2].totalSeats).toBe(35);
  });

  test('多党会派（如共同会派）总席位为各党席位数之和', () => {
    const parties = [
      makeTestParty('party_a', 30),
      makeTestParty('party_b', 25),
      makeTestParty('party_c', 20),
    ];

    const groups: ParliamentaryGroup[] = [
      {
        id: 'g-coalition',
        name: '共同会派',
        memberPartyIds: ['party_a', 'party_b'], // 两党一会派
        totalSeats: 0,
      },
      {
        id: 'g-single',
        name: '单独会派',
        memberPartyIds: ['party_c'],
        totalSeats: 0,
      },
    ];

    const recalculated = recalcGroupSeats(groups, parties);

    expect(recalculated[0].totalSeats).toBe(55); // 30 + 25
    expect(recalculated[1].totalSeats).toBe(20);
  });

  test('党派席位数变化后正确更新', () => {
    const parties = [
      makeTestParty('party_a', 60), // 从 50 增至 60
      makeTestParty('party_b', 30), // 从 40 减至 30
    ];

    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '党1会派', memberPartyIds: ['party_a'], totalSeats: 50 },
      { id: 'g2', name: '党2会派', memberPartyIds: ['party_b'], totalSeats: 40 },
    ];

    const recalculated = recalcGroupSeats(groups, parties);

    expect(recalculated[0].totalSeats).toBe(60);
    expect(recalculated[1].totalSeats).toBe(30);
  });

  test('不修改原数组（返回新数组）', () => {
    const parties = [makeTestParty('party_a', 50)];
    const groups: ParliamentaryGroup[] = [
      { id: 'g1', name: '党1会派', memberPartyIds: ['party_a'], totalSeats: 50 },
    ];

    const originalTotalSeats = groups[0].totalSeats;
    const recalculated = recalcGroupSeats(groups, parties);

    // 原数组不应被修改
    expect(groups[0].totalSeats).toBe(originalTotalSeats);
    // 新数组应包含新值
    expect(recalculated).not.toBe(groups);
  });

  test('成员党不存在时 totalSeats 为 0', () => {
    const parties = [makeTestParty('party_a', 50)];

    const groups: ParliamentaryGroup[] = [
      {
        id: 'g1',
        name: '党1会派',
        memberPartyIds: ['nonexistent'], // 党不存在
        totalSeats: 999,
      },
    ];

    const recalculated = recalcGroupSeats(groups, parties);

    expect(recalculated[0].totalSeats).toBe(0);
  });
});

// ============================================================================
// 6. 综合场景测试
// ============================================================================

describe('综合场景', () => {
  test('完整流程：初始化会派 → 分配时间 → 验证约束', () => {
    // 1. 初始化 6 个党
    const parties = [
      makeTestParty('reform', 60),
      makeTestParty('liberty', 45),
      makeTestParty('conservative', 35),
      makeTestParty('progressive', 25),
      makeTestParty('populist', 20),
      makeTestParty('solidarity', 15),
    ];

    const electionResult = makeTestElectionResult([
      { partyId: 'reform', seats: 60 },
      { partyId: 'liberty', seats: 45 },
      { partyId: 'conservative', seats: 35 },
      { partyId: 'progressive', seats: 25 },
      { partyId: 'populist', seats: 20 },
      { partyId: 'solidarity', seats: 15 },
    ]);

    // 2. 初始化会派
    const groups = initializeParliamentaryGroups(parties, electionResult);
    expect(groups).toHaveLength(6);

    // 3. 分配质询时间
    const allocation = getQuestionTimeAllocation(groups);
    const totalMinutes = allocation.reduce((sum, a) => sum + a.minutes, 0);
    expect(totalMinutes).toBe(180);

    // 4. 验证最小保障
    for (const a of allocation) {
      expect(a.minutes).toBeGreaterThanOrEqual(5);
    }

    // 5. 验证时间与席位成正比（大致）
    const reformTime = allocation.find(a => a.groupId === 'group-reform')!.minutes;
    const solidarityTime = allocation.find(a => a.groupId === 'group-solidarity')!.minutes;
    expect(reformTime).toBeGreaterThan(solidarityTime);

    // 6. 测试查找功能
    const reformGroup = getGroupByParty('reform', groups);
    expect(reformGroup?.totalSeats).toBe(60);

    // 7. 测试席位重算
    parties[0].projectedSeats = 70; // 改革党席位增至 70
    const recalculated = recalcGroupSeats(groups, parties);
    expect(recalculated[0].totalSeats).toBe(70);
  });
});
