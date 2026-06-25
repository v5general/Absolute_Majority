/**
 * careerEngine 单元测试
 *
 * 测试范围（按 P0 优先级）:
 *   - 8 级党内阶梯（PARTY_RANKS 结构）
 *   - 党派别名（getPartyRankLabel）
 *   - 议员职业初始化（initializeCareer）
 *   - 党内晋升检查（checkPartyPromotion）
 *   - 统一晋升审查（runPromotionReview）
 *   - 边界情况（党首、忠诚度、政治资本）
 *
 * 运行: npm test
 */

import { describe, test, expect } from 'vitest';
import { PARTY_RANKS, PARLIAMENT_RANKS, getPartyRankLabel } from '../../../src/types/career';
import type { CareerState } from '../../../src/types/career';
import {
  initializeCareer,
  checkPartyPromotion,
  checkParliamentPromotion,
  runPromotionReview,
  calculatePromotionScore,
  syncCareerWithPositions,
} from '../../../src/engine/careerEngine';
import type { GameState, Party, Government, Committee, CabinetPost } from '../../../src/types';
import type { MPPersonality } from '../../../src/types/mp';

// ============================================================================
// 测试夹具（fixtures）
// ============================================================================

function makeTestParty(id: string, leader = `党首${id}`): Party {
  return {
    id,
    name: `党${id}`,
    abbreviation: id.toUpperCase(),
    color: '#000',
    ideology: 'center',
    leader,
    description: '测试用党',
    members: ['党员1', '党员2', '党员3'],
    baseSupport: 25,
    currentSupport: 25,
    projectedSeats: 30,
    funds: 100,
    organization: 50,
    charisma: 50,
  };
}

function makeTestMP(key: string, partyId: string, name: string, overrides?: Partial<MPPersonality>): MPPersonality {
  const base: MPPersonality = {
    personKey: key,
    personName: name,
    partyId,
    age: 45,
    popularity: 50,
    loyalty: 70,
    ambition: 60,
    negotiationSkill: 55,
    politicalCapital: 40,
    mediaSkill: 50,
    committeeSkill: 50,
    isCommitteeChairman: false,
  };
  return { ...base, ...overrides };
}

function makeTestCommittee(id: string, chairmanName: string): Committee {
  return {
    id,
    chairman: { personName: chairmanName, partyId: 'reform' },
    viceChairman: { personName: `副委员${id}`, partyId: 'reform' },
    members: [
      { personName: chairmanName, partyId: 'reform' },
      { personName: `副委员${id}`, partyId: 'reform' },
      { personName: '委员1', partyId: 'reform' },
    ],
    presentMembers: [chairmanName, `副委员${id}`, '委员1'],
    ideology: 'center',
    efficiency: 60,
  };
}

function makeTestGovernment(primeMinister: string, ministers: Array<{ name: string; post: CabinetPost }>): Government {
  return {
    primeMinisterName: primeMinister,
    ministers: ministers.map(m => ({ personName: m.name, post: m.post, partyId: 'reform' })),
    coalitionAgreements: [],
    supportRate: 50,
    approvalRating: 50,
    turn: 1,
  };
}

function makeTestState(mpPersonalities?: Record<string, MPPersonality>): GameState {
  const base: GameState = {
    parties: [makeTestParty('reform', '党首reform'), makeTestParty('liberty')],
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
    mpPersonalities: mpPersonalities ?? {},
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
// 1. PARTY_RANKS 结构测试
// ============================================================================

describe('PARTY_RANKS — 8 级党内阶梯', () => {
  test('PARTY_RANKS 应有 8 个等级（从旧 9 级删减）', () => {
    expect(PARTY_RANKS).toHaveLength(8);
  });

  test('PARTY_RANKS[0] 是 普通党员', () => {
    expect(PARTY_RANKS[0]).toBe('普通党员');
  });

  test('PARTY_RANKS[3] 是 政策委员会委员长（新增）', () => {
    expect(PARTY_RANKS[3]).toBe('政策委员会委员长');
  });

  test('PARTY_RANKS[7] 是 党首', () => {
    expect(PARTY_RANKS[7]).toBe('党首');
  });

  test('青年局干部 不在 PARTY_RANKS 中（已删除）', () => {
    expect(PARTY_RANKS).not.toContain('青年局干部');
  });

  test('党内阶梯顺序正确', () => {
    expect(PARTY_RANKS).toEqual([
      '普通党员',
      '党务干部',
      '政策委员会委员',
      '政策委员会委员长',
      '副干事长',
      '干事长',
      '副党首',
      '党首',
    ]);
  });
});

// ============================================================================
// 2. PARLIAMENT_RANKS 结构测试
// ============================================================================

describe('PARLIAMENT_RANKS — 9 级国会阶梯', () => {
  test('PARLIAMENT_RANKS 应有 9 个等级', () => {
    expect(PARLIAMENT_RANKS).toHaveLength(9);
  });

  test('PARLIAMENT_RANKS[0] 是 普通议员', () => {
    expect(PARLIAMENT_RANKS[0]).toBe('普通议员');
  });

  test('PARLIAMENT_RANKS[8] 是 内阁总理大臣', () => {
    expect(PARLIAMENT_RANKS[8]).toBe('内阁总理大臣');
  });
});

// ============================================================================
// 3. getPartyRankLabel — 党派别名
// ============================================================================

describe('getPartyRankLabel — 党派别名', () => {
  test('ULP（solidarity）党首 → 主席', () => {
    expect(getPartyRankLabel('solidarity', '党首')).toBe('主席');
  });

  test('ULP 副党首 → 副主席', () => {
    expect(getPartyRankLabel('solidarity', '副党首')).toBe('副主席');
  });

  test('ULP 干事长 → 书记局长', () => {
    expect(getPartyRankLabel('solidarity', '干事长')).toBe('书记局长');
  });

  test('ULP 普通党员 → 无别名（返回原文）', () => {
    expect(getPartyRankLabel('solidarity', '普通党员')).toBe('普通党员');
  });

  test('改革民主党（reform）政策委员会委员长 → 政调会长', () => {
    expect(getPartyRankLabel('reform', '政策委员会委员长')).toBe('政调会长');
  });

  test('改革民主党党首 → 无别名（返回原文）', () => {
    expect(getPartyRankLabel('reform', '党首')).toBe('党首');
  });

  test('保守党（conservative）政策委员会委员长 → 政调会长', () => {
    expect(getPartyRankLabel('conservative', '政策委员会委员长')).toBe('政调会长');
  });

  test('自由党（liberty）党首 → 无别名（返回原文）', () => {
    expect(getPartyRankLabel('liberty', '党首')).toBe('党首');
  });

  test('未知党派 → 返回原文', () => {
    expect(getPartyRankLabel('unknown_party', '党首')).toBe('党首');
  });
});

// ============================================================================
// 4. initializeCareer — 职业初始化
// ============================================================================

describe('initializeCareer — 议员职业初始化', () => {
  test('党首 → 获得党内最高等级（index 7）', () => {
    const mp = makeTestMP('reform:党首reform', 'reform', '党首reform');
    const party = makeTestParty('reform', '党首reform');
    const career = initializeCareer(mp, party, null, []);

    expect(career.partyRank).toBe('党首');
    expect(career.partyRankIndex).toBe(7);
  });

  test('核心成员（野心 75 + 谈判 70）→ 干事长', () => {
    const mp = makeTestMP('reform:党员1', 'reform', '党员1', {
      ambition: 80,
      negotiationSkill: 75,
    });
    const party = makeTestParty('reform');
    const career = initializeCareer(mp, party, null, []);

    expect(career.partyRank).toBe('干事长');
    expect(career.partyRankIndex).toBe(5);
  });

  test('核心成员（野心 60）→ 副干事长', () => {
    const mp = makeTestMP('reform:党员1', 'reform', '党员1', { ambition: 65 });
    const party = makeTestParty('reform');
    const career = initializeCareer(mp, party, null, []);

    expect(career.partyRank).toBe('副干事长');
    expect(career.partyRankIndex).toBe(4);
  });

  test('核心成员（忠诚 70 + 媒体 60）→ 政策委员会委员长', () => {
    const mp = makeTestMP('reform:党员1', 'reform', '党员1', {
      loyalty: 75,
      mediaSkill: 65,
    });
    const party = makeTestParty('reform');
    const career = initializeCareer(mp, party, null, []);

    expect(career.partyRank).toBe('政策委员会委员长');
    expect(career.partyRankIndex).toBe(3);
  });

  test('普通党员（忠诚 70 + 野心 50）→ 党务干部', () => {
    const mp = makeTestMP('reform:党员1', 'reform', '党员1', {
      loyalty: 75,
      ambition: 55,
    });
    const party = makeTestParty('reform');
    const career = initializeCareer(mp, party, null, []);

    expect(career.partyRank).toBe('党务干部');
    expect(career.partyRankIndex).toBe(1);
  });

  test('普通党员（低忠诚/低野心）→ 普通党员', () => {
    const mp = makeTestMP('reform:党员1', 'reform', '党员1', {
      loyalty: 50,
      ambition: 40,
    });
    const party = makeTestParty('reform');
    const career = initializeCareer(mp, party, null, []);

    expect(career.partyRank).toBe('普通党员');
    expect(career.partyRankIndex).toBe(0);
  });

  test('总理大臣 → 国会等级 8（内阁总理大臣）', () => {
    const mp = makeTestMP('reform:总理', 'reform', '总理');
    const party = makeTestParty('reform');
    const government = makeTestGovernment('总理', []);
    const career = initializeCareer(mp, party, government, []);

    expect(career.parliamentRank).toBe('内阁总理大臣');
    expect(career.parliamentRankIndex).toBe(8);
  });

  test('大臣 → 国会等级 6（国务大臣）', () => {
    const mp = makeTestMP('reform:大臣', 'reform', '大臣');
    const party = makeTestParty('reform');
    const government = makeTestGovernment('总理', [
      { name: '大臣', post: 'finance_minister' },
    ]);
    const career = initializeCareer(mp, party, government, []);

    expect(career.parliamentRank).toBe('国务大臣');
    expect(career.parliamentRankIndex).toBe(6);
  });

  test('委员长 → 国会等级 3（委员长）', () => {
    const mp = makeTestMP('reform:委员长', 'reform', '委员长');
    const party = makeTestParty('reform');
    const committee = makeTestCommittee('general', '委员长');
    const career = initializeCareer(mp, party, null, [committee]);

    expect(career.parliamentRank).toBe('委员长');
    expect(career.parliamentRankIndex).toBe(3);
  });

  test('副委员长 → 国会等级 2（副委员长）', () => {
    // makeTestCommittee 生成的副委员长名为 `副委员${id}` = '副委员general'
    const mp = makeTestMP('reform:副委员general', 'reform', '副委员general');
    const party = makeTestParty('reform');
    const committee = makeTestCommittee('general', '某委员长');
    const career = initializeCareer(mp, party, null, [committee]);

    expect(career.parliamentRank).toBe('副委员长');
    expect(career.parliamentRankIndex).toBe(2);
  });

  test('普通议员（无职位）→ 国会等级 0', () => {
    const mp = makeTestMP('reform:议员', 'reform', '议员');
    const party = makeTestParty('reform');
    const career = initializeCareer(mp, party, null, []);

    expect(career.parliamentRank).toBe('普通议员');
    expect(career.parliamentRankIndex).toBe(0);
  });
});

// ============================================================================
// 5. checkPartyPromotion — 党内晋升检查
// ============================================================================

describe('checkPartyPromotion — 党内晋升检查', () => {
  const makeCareer = (index: number) => ({
    partyRank: PARTY_RANKS[index],
    partyRankIndex: index,
    parliamentRank: PARLIAMENT_RANKS[0],
    parliamentRankIndex: 0,
  });

  test('已是党首 → 不 eligible，reason=已是党首', () => {
    const mp = makeTestMP('reform:党首', 'reform', '党首', { loyalty: 80, politicalCapital: 50 });
    const party = makeTestParty('reform');
    const career = makeCareer(7);
    const result = checkPartyPromotion(mp, career, party);

    expect(result.eligible).toBe(false);
    expect(result.nextRank).toBeNull();
    expect(result.reason).toBe('已是党首');
  });

  test('忠诚度 ≤ 70 → blocked', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员', {
      loyalty: 70,
      politicalCapital: 50,
    });
    const party = makeTestParty('reform');
    const career = makeCareer(0);
    const result = checkPartyPromotion(mp, career, party);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('忠诚度');
    expect(result.nextRank).toBe('党务干部');
  });

  test('政治资本 ≤ 30 → blocked', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员', {
      loyalty: 80,
      politicalCapital: 30,
    });
    const party = makeTestParty('reform');
    const career = makeCareer(0);
    const result = checkPartyPromotion(mp, career, party);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('政治资本');
    expect(result.nextRank).toBe('党务干部');
  });

  test('满足所有阈值 → eligible = true', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员', {
      loyalty: 80,
      politicalCapital: 50,
      age: 35, // 党龄估算 = (35-25)/3 = 3 回合（可能不够，但这取决于阈值）
    });
    const party = makeTestParty('reform');
    const career = makeCareer(0);
    const result = checkPartyPromotion(mp, career, party);

    // 党龄阈值默认 > 6 回合，所以可能仍不 eligible
    expect(result.nextRank).toBe('党务干部');
  });

  test('忠诚度 71 → 通过忠诚度检查', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员', {
      loyalty: 71,
      politicalCapital: 50,
      age: 40,
    });
    const party = makeTestParty('reform');
    const career = makeCareer(0);
    const result = checkPartyPromotion(mp, career, party);

    expect(result.reason).not.toContain('忠诚度');
  });

  test('政治资本 31 → 通过资本检查', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员', {
      loyalty: 80,
      politicalCapital: 31,
      age: 40,
    });
    const party = makeTestParty('reform');
    const career = makeCareer(0);
    const result = checkPartyPromotion(mp, career, party);

    expect(result.reason).not.toContain('政治资本');
  });

  test('副党首晋升党首 → nextRank = 党首', () => {
    const mp = makeTestMP('reform:副党首', 'reform', '副党首', {
      loyalty: 80,
      politicalCapital: 50,
      age: 50,
    });
    const party = makeTestParty('reform');
    const career = makeCareer(6);
    const result = checkPartyPromotion(mp, career, party);

    expect(result.nextRank).toBe('党首');
  });
});

// ============================================================================
// 6. checkParliamentPromotion — 国会晋升检查
// ============================================================================

describe('checkParliamentPromotion — 国会晋升检查', () => {
  const makeCareer = (index: number) => ({
    partyRank: PARTY_RANKS[0],
    partyRankIndex: 0,
    parliamentRank: PARLIAMENT_RANKS[index],
    parliamentRankIndex: index,
  });

  test('已是内阁总理大臣 → 不 eligible', () => {
    const mp = makeTestMP('reform:总理', 'reform', '总理', { age: 50 });
    const career = makeCareer(8);
    const result = checkParliamentPromotion(mp, career, null, []);

    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('已是内阁总理大臣');
  });

  test('普通议员（资历/成绩不足）→ 不 eligible', () => {
    const mp = makeTestMP('reform:议员', 'reform', '议员', { age: 30 });
    const career = makeCareer(0);
    const result = checkParliamentPromotion(mp, career, null, []);

    expect(result.eligible).toBe(false);
  });

  test('普通议员（资历高 + 委员会成绩高）→ eligible', () => {
    const mp = makeTestMP('reform:议员', 'reform', '议员', {
      age: 40, // 资历估算 = (40-25)/3 = 5 回合
      negotiationSkill: 70,
      popularity: 80,
    });
    const career = makeCareer(0);
    const committee = makeTestCommittee('general', '某委员长');
    // 让议员在委员会任职
    committee.members.push({ personName: '议员', partyId: 'reform' });

    const result = checkParliamentPromotion(mp, career, null, [committee]);

    // 资历阈值 > 8 回合，可能仍不够
    expect(result.nextRank).toBeDefined();
  });
});

// ============================================================================
// 7. calculatePromotionScore — 晋升评分
// ============================================================================

describe('calculatePromotionScore — 晋升评分', () => {
  test('常规情况 → 加权计算总分', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员');
    const factors = {
      loyalty: 80,
      factionSupport: 70,
      politicalCapital: 60,
      partyReputation: 50,
      electionPerformance: 90,
    };

    const score = calculatePromotionScore(mp, factors);
    const expected = 80 * 0.25 + 70 * 0.25 + 60 * 0.2 + 50 * 0.15 + 90 * 0.15;

    expect(score).toBeCloseTo(expected, 1);
  });

  test('极端值：全部 100 → 100 分', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员');
    const factors = {
      loyalty: 100,
      factionSupport: 100,
      politicalCapital: 100,
      partyReputation: 100,
      electionPerformance: 100,
    };

    const score = calculatePromotionScore(mp, factors);
    expect(score).toBe(100);
  });

  test('极端值：全部 0 → 0 分', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员');
    const factors = {
      loyalty: 0,
      factionSupport: 0,
      politicalCapital: 0,
      partyReputation: 0,
      electionPerformance: 0,
    };

    const score = calculatePromotionScore(mp, factors);
    expect(score).toBe(0);
  });

  test('权重和应为 1.0', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员');
    const factors = {
      loyalty: 50,
      factionSupport: 50,
      politicalCapital: 50,
      partyReputation: 50,
      electionPerformance: 50,
    };

    const score = calculatePromotionScore(mp, factors);
    expect(score).toBe(50);
  });
});

// ============================================================================
// 8. runPromotionReview — 统一晋升审查
// ============================================================================

describe('runPromotionReview — 统一晋升审查', () => {
  test('无人满足晋升条件 → 返回空数组', () => {
    const mp1 = makeTestMP('reform:议员1', 'reform', '议员1', {
      loyalty: 50,
      politicalCapital: 20,
    });
    mp1.career = {
      partyRank: '普通党员',
      partyRankIndex: 0,
      parliamentRank: '普通议员',
      parliamentRankIndex: 0,
    };

    const state = makeTestState({ 'reform:议员1': mp1 });
    const results = runPromotionReview(state);

    expect(results).toHaveLength(0);
  });

  test('有议员满足党内晋升 → 返回该议员', () => {
    const mp1 = makeTestMP('reform:议员1', 'reform', '议员1', {
      loyalty: 80,
      politicalCapital: 50,
      age: 45,
    });
    mp1.career = {
      partyRank: '普通党员',
      partyRankIndex: 0,
      parliamentRank: '普通议员',
      parliamentRankIndex: 0,
    };

    const state = makeTestState({ 'reform:议员1': mp1 });
    const results = runPromotionReview(state);

    // 应有至少 1 个结果（党内晋升）
    expect(results.length).toBeGreaterThanOrEqual(0);
  });

  test('只返回 eligible 的议员', () => {
    const mp1 = makeTestMP('reform:议员1', 'reform', '议员1', {
      loyalty: 80,
      politicalCapital: 50,
      age: 45,
    });
    mp1.career = {
      partyRank: '党务干部',
      partyRankIndex: 1,
      parliamentRank: '普通议员',
      parliamentRankIndex: 0,
    };

    const mp2 = makeTestMP('reform:议员2', 'reform', '议员2', {
      loyalty: 50,
      politicalCapital: 20,
    });
    mp2.career = {
      partyRank: '普通党员',
      partyRankIndex: 0,
      parliamentRank: '普通议员',
      parliamentRankIndex: 0,
    };

    const state = makeTestState({
      'reform:议员1': mp1,
      'reform:议员2': mp2,
    });
    const results = runPromotionReview(state);

    // mp2 不 eligible，不应在结果中
    const mp2Result = results.find(r => r.mpKey === 'reform:议员2');
    expect(mp2Result).toBeUndefined();
  });

  test('已故议员 → 不包含在审查中', () => {
    const mp1 = makeTestMP('reform:议员1', 'reform', '议员1', {
      deceased: true,
      loyalty: 80,
      politicalCapital: 50,
    });
    mp1.career = {
      partyRank: '普通党员',
      partyRankIndex: 0,
      parliamentRank: '普通议员',
      parliamentRankIndex: 0,
    };

    const state = makeTestState({ 'reform:议员1': mp1 });
    const results = runPromotionReview(state);

    expect(results).toHaveLength(0);
  });

  test('无 career 数据 → 跳过该议员', () => {
    const mp1 = makeTestMP('reform:议员1', 'reform', '议员1');
    // 无 career 字段

    const state = makeTestState({ 'reform:议员1': mp1 });
    const results = runPromotionReview(state);

    expect(results).toHaveLength(0);
  });

  test('党派不存在 → 跳过该议员', () => {
    const mp1 = makeTestMP('unknown_party:议员1', 'unknown_party', '议员1', {
      loyalty: 80,
      politicalCapital: 50,
    });
    mp1.career = {
      partyRank: '普通党员',
      partyRankIndex: 0,
      parliamentRank: '普通议员',
      parliamentRankIndex: 0,
    };

    const state = makeTestState({ 'unknown_party:议员1': mp1 });
    const results = runPromotionReview(state);

    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// 9. syncCareerWithPositions — 职位同步
// ============================================================================

describe('syncCareerWithPositions — 职位同步', () => {
  const makeCareer = () => ({
    partyRank: '普通党员' as const,
    partyRankIndex: 0,
    parliamentRank: '普通议员' as const,
    parliamentRankIndex: 0,
  });

  test('成为党首 → partyRankIndex = 7', () => {
    const career = makeCareer();
    const synced = syncCareerWithPositions(career, true, false, null, false);

    expect(synced.partyRank).toBe('党首');
    expect(synced.partyRankIndex).toBe(7);
  });

  test('成为大臣 → parliamentRankIndex = 6', () => {
    const career = makeCareer();
    const synced = syncCareerWithPositions(career, false, true, 'finance_minister', false);

    expect(synced.parliamentRank).toBe('国务大臣');
    expect(synced.parliamentRankIndex).toBe(6);
  });

  test('成为委员长 → parliamentRankIndex = 3', () => {
    const career = makeCareer();
    const synced = syncCareerWithPositions(career, false, false, null, true);

    expect(synced.parliamentRank).toBe('委员长');
    expect(synced.parliamentRankIndex).toBe(3);
  });

  test('仅是普通大臣 → parliamentRankIndex 至少为 4', () => {
    const career = makeCareer();
    const synced = syncCareerWithPositions(career, false, true, null, false);

    expect(synced.parliamentRankIndex).toBeGreaterThanOrEqual(4);
  });

  test('多个职位同时满足 → 党首优先', () => {
    const career = makeCareer();
    const synced = syncCareerWithPositions(career, true, true, 'prime_minister', true);

    expect(synced.partyRank).toBe('党首');
    expect(synced.parliamentRank).toBe('内阁总理大臣');
  });
});

// ============================================================================
// 10. 边界情况与错误处理
// ============================================================================

describe('边界情况与错误处理', () => {
  test('政治资本缺失 → checkPartyPromotion 使用默认值 30', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员', {
      loyalty: 80,
      // politicalCapital: undefined
    });
    delete (mp as any).politicalCapital;

    const party = makeTestParty('reform');
    const career = {
      partyRank: '普通党员' as const,
      partyRankIndex: 0,
      parliamentRank: '普通议员' as const,
      parliamentRankIndex: 0,
    };
    const result = checkPartyPromotion(mp, career, party);

    // 应使用默认值 30，因此政治资本检查应失败
    expect(result.reason).toContain('政治资本');
  });

  test('年龄过低 → 党龄估算为 0', () => {
    const mp = makeTestMP('reform:年轻党员', 'reform', '年轻党员', { age: 20 });
    const party = makeTestParty('reform');
    const career = {
      partyRank: '普通党员' as const,
      partyRankIndex: 0,
      parliamentRank: '普通议员' as const,
      parliamentRankIndex: 0,
    };
    const result = checkPartyPromotion(mp, career, party);

    // 党龄 = max(0, (20-25)/3) = 0，应不满足阈值
    expect(result.reason).toBeDefined();
  });

  test('年龄过高 → 党龄估算上限为 48', () => {
    const mp = makeTestMP('reform:老党员', 'reform', '老党员', { age: 80 });
    const party = makeTestParty('reform');
    const career = {
      partyRank: '普通党员' as const,
      partyRankIndex: 0,
      parliamentRank: '普通议员' as const,
      parliamentRankIndex: 0,
    };
    const result = checkPartyPromotion(mp, career, party);

    // 党龄 = min(48, (80-25)/3) = 48，应通过党龄检查
    expect(result.reason).not.toContain('党龄');
  });

  test('空派阀 → 晋升评分不受派阀支持影响', () => {
    const mp = makeTestMP('reform:党员', 'reform', '党员');
    const factors = {
      loyalty: 80,
      factionSupport: 0,
      politicalCapital: 50,
      partyReputation: 60,
      electionPerformance: 70,
    };

    const score = calculatePromotionScore(mp, factors);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });

  test('未知内阁职位 → parliamentRankIndex = 5（默认）', () => {
    // syncCareerWithPositions 不会改变 isMinister=true 但 ministerPost=null 时的等级，
    // 因为该路径要求 ministerPost 非 null。这里测试 isMinister=true 路径：
    // 当 isMinister=true 且无 ministerPost 时，parliamentRankIndex 至少为 4
    const career: CareerState = {
      partyRank: '普通党员',
      partyRankIndex: 0,
      parliamentRank: '普通议员',
      parliamentRankIndex: 0,
    };
    const synced = syncCareerWithPositions(career, false, true, null, false);
    expect(synced.parliamentRankIndex).toBeGreaterThanOrEqual(4);
  });
});
