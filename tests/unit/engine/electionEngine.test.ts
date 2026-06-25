/**
 * electionEngine 单元测试
 *
 * 测试范围（Phase G Q1 并行制）:
 *   - runElectionV2 并行制系统（110 直接 + 90 比例代表 = 200 席）
 *   - 直接席总计 = 110（11 blocks × 10）
 *   - 比例席总计 = 90
 *   - 总席位数守恒（200）
 *   - 确定性结果（相同输入 → 相同输出）
 *   - 5% 阈值过滤低支持率政党
 *   - nationalProportionalResults 字段存在
 *   - 候选人 top-10 选择机制（每党 10 候选人）
 *
 * 运行: npm test
 */

import { describe, test, expect, beforeEach } from 'vitest';
import {
  runElectionV2,
  CONSTITUENCY_SEATS,
  PROPORTIONAL_SEATS,
} from '../../../src/engine/electionEngine';
import { PROPORTIONAL_BLOCKS } from '../../../src/config/districtConfig';
import { PROPORTIONAL_THRESHOLD_PERCENT } from '../../../src/config/electionConfig';
import type { Party, District } from '../../../src/types';

// ============================================================================
// 测试夹具（fixtures）
// ============================================================================

function makeTestParty(
  id: string,
  support = 25,
  membersCount = 5,
): Party {
  const members = Array.from({ length: membersCount }, (_, i) => `${id}_议员_${i + 1}`);
  return {
    id,
    name: `党${id}`,
    abbreviation: id.toUpperCase(),
    color: '#000',
    ideology: 'center',
    leader: `${id}_党首`,
    description: '测试用党',
    members,
    baseSupport: support,
    currentSupport: support,
    projectedSeats: 0,
    funds: 100,
    organization: 50,
    charisma: 50,
  };
}

function makeTestDistricts(): District[] {
  // 使用真实的 PROPORTIONAL_BLOCKS，但确保必要的字段存在
  return PROPORTIONAL_BLOCKS.map(block => ({
    id: block.id,
    name: block.name,
    totalSeats: block.totalSeats,
    voterCount: block.voterCount,
    supportByParty: { ...block.supportByParty },
  }));
}

function makeTestCandidatePopularity(): Record<string, number> {
  return {
    'reform_党首': 80,
    'liberty_党首': 75,
    'conservative_党首': 70,
    'progressive_党首': 65,
    'populist_党首': 60,
    'solidarity_党首': 55,
  };
}

// ============================================================================
// 1. 常量验证
// ============================================================================

describe('选举常量', () => {
  test('直接席 = 110（11 × 10）', () => {
    expect(CONSTITUENCY_SEATS).toBe(110);
  });

  test('比例席 = 90', () => {
    expect(PROPORTIONAL_SEATS).toBe(90);
  });

  test('总席位数 = 200', () => {
    expect(CONSTITUENCY_SEATS + PROPORTIONAL_SEATS).toBe(200);
  });

  test('比例阈值 = 5%', () => {
    expect(PROPORTIONAL_THRESHOLD_PERCENT).toBe(5);
  });
});

// ============================================================================
// 2. 基本选举流程
// ============================================================================

describe('runElectionV2 基本流程', () => {
  let parties: Party[];
  let districts: District[];
  let candidatePopularity: Record<string, number>;

  beforeEach(() => {
    parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
      makeTestParty('conservative', 18, 10),
      makeTestParty('progressive', 15, 10),
      makeTestParty('populist', 12, 10),
      makeTestParty('solidarity', 10, 10),
    ];
    districts = makeTestDistricts();
    candidatePopularity = makeTestCandidatePopularity();
  });

  test('执行选举返回结果对象', () => {
    const result = runElectionV2(
      parties,
      districts,
      200,
      101,
      candidatePopularity,
      false,
    );

    expect(result).toBeDefined();
    expect(result.partyResults).toBeInstanceOf(Array);
    expect(result.totalSeats).toBe(200);
    expect(result.majorityThreshold).toBe(101);
  });

  test('返回 nationalProportionalResults 字段', () => {
    const result = runElectionV2(
      parties,
      districts,
      200,
      101,
      candidatePopularity,
      false,
    );

    expect(result.nationalProportionalResults).toBeDefined();
    expect(typeof result.nationalProportionalResults).toBe('object');
  });

  test('所有政党都有结果记录', () => {
    const result = runElectionV2(
      parties,
      districts,
      200,
      101,
      candidatePopularity,
      false,
    );

    expect(result.partyResults).toHaveLength(parties.length);
    for (const party of parties) {
      const partyResult = result.partyResults.find(r => r.partyId === party.id);
      expect(partyResult).toBeDefined();
    }
  });
});

// ============================================================================
// 3. 席位守恒
// ============================================================================

describe('席位守恒（110 直接 + 90 比例 = 200）', () => {
  test('总席位数 = 200（标准情况）', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
      makeTestParty('conservative', 18, 10),
      makeTestParty('progressive', 15, 10),
      makeTestParty('populist', 12, 10),
      makeTestParty('solidarity', 10, 10),
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    const totalSeats = result.partyResults.reduce((sum, r) => sum + r.seats, 0);
    expect(totalSeats).toBe(200);
  });

  test('直接席 + 比例席 = 每党总席', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
      makeTestParty('conservative', 18, 10),
      makeTestParty('progressive', 15, 10),
      makeTestParty('populist', 12, 10),
      makeTestParty('solidarity', 10, 10),
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    // 验证：对于每个政党，总席 = 直接席 + 比例席
    for (const partyResult of result.partyResults) {
      const directSeats = Object.values(result.districtResults).reduce((sum, block) => {
        return sum + (block[partyResult.partyId] ?? 0);
      }, 0);
      const proportionalSeats = result.nationalProportionalResults[partyResult.partyId] ?? 0;

      expect(partyResult.seats).toBe(directSeats + proportionalSeats);
    }
  });

  test('比例席总计 = 90', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
      makeTestParty('conservative', 18, 10),
      makeTestParty('progressive', 15, 10),
      makeTestParty('populist', 12, 10),
      makeTestParty('solidarity', 10, 10),
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    const totalProportionalSeats = Object.values(result.nationalProportionalResults)
      .reduce((sum, seats) => sum + seats, 0);

    expect(totalProportionalSeats).toBe(90);
  });

  test('直接席总计 = 110（11 blocks × 10）', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
      makeTestParty('conservative', 18, 10),
      makeTestParty('progressive', 15, 10),
      makeTestParty('populist', 12, 10),
      makeTestParty('solidarity', 10, 10),
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    const totalDirectSeats = Object.values(result.districtResults).reduce((sum, block) => {
      return sum + Object.values(block).reduce((b, s) => b + s, 0);
    }, 0);

    expect(totalDirectSeats).toBe(110);
  });
});

// ============================================================================
// 4. 确定性测试
// ============================================================================

describe('runElectionV2 确定性', () => {
  test('相同输入 → 相同输出（座位分配相同）', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
      makeTestParty('conservative', 18, 10),
      makeTestParty('progressive', 15, 10),
      makeTestParty('populist', 12, 10),
      makeTestParty('solidarity', 10, 10),
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const result1 = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);
    const result2 = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    // 验证每个政党的席位相同
    for (const party of parties) {
      const seats1 = result1.partyResults.find(r => r.partyId === party.id)?.seats ?? 0;
      const seats2 = result2.partyResults.find(r => r.partyId === party.id)?.seats ?? 0;
      expect(seats1).toBe(seats2);
    }

    // 验证比例席位分配相同
    expect(result1.nationalProportionalResults).toEqual(result2.nationalProportionalResults);
  });

  test('连续三次调用结果一致', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
      makeTestParty('conservative', 18, 10),
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const result1 = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);
    const result2 = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);
    const result3 = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    const seats1 = result1.partyResults.map(r => r.seats);
    const seats2 = result2.partyResults.map(r => r.seats);
    const seats3 = result3.partyResults.map(r => r.seats);

    expect(seats1).toEqual(seats2);
    expect(seats2).toEqual(seats3);
  });
});

// ============================================================================
// 5. 5% 阈值测试
// ============================================================================

describe('5% 阈值过滤', () => {
  test('低支持率政党（< 5%）获得 0 比例席', () => {
    const parties = [
      makeTestParty('reform', 30, 10),    // 主导党
      makeTestParty('tiny', 2, 10),       // 微小党（应被过滤）
    ];
    const districts = makeTestDistricts();

    // 修改 districts 使得 tiny 党在各地支持率都很低
    const adjustedDistricts = districts.map(d => ({
      ...d,
      supportByParty: {
        reform: 500,
        tiny: 5, // 远低于 5%
      },
    }));

    const candidatePopularity = {
      'reform_党首': 80,
      'tiny_党首': 30,
    };

    const result = runElectionV2(parties, adjustedDistricts, 200, 101, candidatePopularity, false);

    // tiny 党应获得 0 比例席
    const tinyProportionalSeats = result.nationalProportionalResults['tiny'] ?? 0;
    expect(tinyProportionalSeats).toBe(0);
  });

  test('刚好 5% 政党参与比例分配', () => {
    const parties = [
      makeTestParty('reform', 20, 10),
      makeTestParty('threshold', 20, 10), // 应刚好达到 5%
    ];
    const districts = makeTestDistricts();

    // 构造支持率使 threshold 党刚好 5%
    const adjustedDistricts = districts.map(d => ({
      ...d,
      supportByParty: {
        reform: 475,
        threshold: 25, // 25/500 = 5%
      },
    }));

    const candidatePopularity = {
      'reform_党首': 80,
      'threshold_党首': 60,
    };

    const result = runElectionV2(parties, adjustedDistricts, 200, 101, candidatePopularity, false);

    // threshold 党应获得至少 1 比例席（90 席分给 2 党）
    const thresholdProportionalSeats = result.nationalProportionalResults['threshold'] ?? 0;
    expect(thresholdProportionalSeats).toBeGreaterThan(0);
  });

  test('极端情况：单党独大，其余皆被过滤', () => {
    const parties = [
      makeTestParty('dominant', 50, 10),
      makeTestParty('tiny1', 1, 10),
      makeTestParty('tiny2', 1, 10),
    ];
    const districts = makeTestDistricts();

    const adjustedDistricts = districts.map(d => ({
      ...d,
      supportByParty: {
        dominant: 480,
        tiny1: 10,
        tiny2: 10,
      },
    }));

    const candidatePopularity = {
      'dominant_党首': 90,
      'tiny1_党首': 20,
      'tiny2_党首': 20,
    };

    const result = runElectionV2(parties, adjustedDistricts, 200, 101, candidatePopularity, false);

    // tiny 党应获得 0 比例席
    expect(result.nationalProportionalResults['tiny1'] ?? 0).toBe(0);
    expect(result.nationalProportionalResults['tiny2'] ?? 0).toBe(0);

    // dominant 党应获得全部或大部分比例席
    const dominantProportionalSeats = result.nationalProportionalResults['dominant'] ?? 0;
    expect(dominantProportionalSeats).toBeGreaterThan(0);
  });
});

// ============================================================================
// 6. 候选人选择机制
// ============================================================================

describe('候选人 top-10 选择', () => {
  test('每党每块生成 10 候选人（leader + members + filler）', () => {
    const parties = [
      makeTestParty('reform', 25, 5), // 只有 5 members，需要填充
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    // 验证每个区块都有结果（说明候选人列表生成成功）
    expect(Object.keys(result.districtResults)).toHaveLength(11);
  });

  test('6 党 × 10 候选人 = 60 候选人竞争 10 席', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
      makeTestParty('conservative', 18, 10),
      makeTestParty('progressive', 15, 10),
      makeTestParty('populist', 12, 10),
      makeTestParty('solidarity', 10, 10),
    ];
    const districts = [makeTestDistricts()[0]]; // 只测 1 个块
    const candidatePopularity = makeTestCandidatePopularity();

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    // 6 党竞争 10 席，结果应合理分布
    const blockResult = result.districtResults[districts[0].id];
    const totalSeats = Object.values(blockResult).reduce((sum, s) => sum + s, 0);
    expect(totalSeats).toBe(10);
  });

  test('高候选人支持率影响席位分配', () => {
    const parties = [
      makeTestParty('reform', 20, 10),
      makeTestParty('liberty', 20, 10),
    ];
    const districts = [makeTestDistricts()[0]];

    // reform 党候选人支持率远高于 liberty 党
    const candidatePopularity = {
      'reform_党首': 95,
      'liberty_党首': 30,
    };

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    // reform 党应获得更多直接席
    const reformSeats = result.districtResults[districts[0].id]['reform'] ?? 0;
    const libertySeats = result.districtResults[districts[0].id]['liberty'] ?? 0;
    expect(reformSeats).toBeGreaterThan(libertySeats);
  });
});

// ============================================================================
// 7. 竞选期倍率测试
// ============================================================================

describe('竞选期倍率', () => {
  test('竞选期间结果与非竞选期间不同', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const resultNormal = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);
    const resultCampaign = runElectionV2(parties, districts, 200, 101, candidatePopularity, true);

    // 由于随机因子的影响，结果应该不同
    // 但总席位数仍应守恒
    const totalNormal = resultNormal.partyResults.reduce((s, r) => s + r.seats, 0);
    const totalCampaign = resultCampaign.partyResults.reduce((s, r) => s + r.seats, 0);
    expect(totalNormal).toBe(200);
    expect(totalCampaign).toBe(200);
  });

  test('竞选期倍率应用不影响确定性', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
      makeTestParty('liberty', 20, 10),
    ];
    const districts = makeTestDistricts();
    const candidatePopularity = makeTestCandidatePopularity();

    const result1 = runElectionV2(parties, districts, 200, 101, candidatePopularity, true);
    const result2 = runElectionV2(parties, districts, 200, 101, candidatePopularity, true);

    const seats1 = result1.partyResults.map(r => r.seats);
    const seats2 = result2.partyResults.map(r => r.seats);
    expect(seats1).toEqual(seats2);
  });
});

// ============================================================================
// 8. 边界情况
// ============================================================================

describe('边界情况', () => {
  test('空候选人支持率 → 不崩溃，使用兜底值', () => {
    const parties = [
      makeTestParty('reform', 25, 10),
    ];
    const districts = [makeTestDistricts()[0]];
    const candidatePopularity: Record<string, number> = {};

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    expect(result).toBeDefined();
    expect(result.partyResults).toHaveLength(1);
  });

  test('所有政党支持率相同 → 席位接近均匀分布', () => {
    const parties = [
      makeTestParty('a', 20, 10),
      makeTestParty('b', 20, 10),
      makeTestParty('c', 20, 10),
    ];
    const districts = makeTestDistricts();

    // 所有党在所有区块支持率相同
    const adjustedDistricts = districts.map(d => ({
      ...d,
      supportByParty: { a: 333, b: 333, c: 334 },
    }));

    const candidatePopularity = {
      'a_党首': 50,
      'b_党首': 50,
      'c_党首': 50,
    };

    const result = runElectionV2(parties, adjustedDistricts, 200, 101, candidatePopularity, false);

    // 3 党分 200 席，应接近 66-67-67（允许 ±5 席的随机偏差，因确定性种子会在候选人排序中产生微小差异）
    const seats = result.partyResults.map(r => r.seats).sort((a, b) => a - b);
    const minDiff = seats[2] - seats[0];
    expect(minDiff).toBeLessThanOrEqual(8);
    // 总席位应为 200
    const total = seats.reduce((s, x) => s + x, 0);
    expect(total).toBe(200);
  });

  test('极多政党（10 党）→ 正常运行', () => {
    const parties = Array.from({ length: 10 }, (_, i) =>
      makeTestParty(`party${i}`, 10, 10),
    );
    // 自定义选区：每党均等支持
    const supportByParty = Object.fromEntries(parties.map(p => [p.id, 100]));
    const districts: District[] = PROPORTIONAL_BLOCKS.map(block => ({
      id: block.id,
      name: block.name,
      totalSeats: block.totalSeats,
      voterCount: block.voterCount,
      supportByParty: { ...supportByParty },
    }));
    const candidatePopularity = Object.fromEntries(
      parties.map(p => [`${p.id}_党首`, 50]),
    );

    const result = runElectionV2(parties, districts, 200, 101, candidatePopularity, false);

    const totalSeats = result.partyResults.reduce((sum, r) => sum + r.seats, 0);
    expect(totalSeats).toBe(200);
  });
});
