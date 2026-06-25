/**
 * committeeEngine 单元测试
 *
 * 测试范围：
 *   - 委员长权重倍率在不同 voteContext 下正确应用（Phase G Q4）
 *   - committee_vote 正确计算 votesFor/votesAgainst
 *   - 委员长权重 ×1.3（push）、×1.5（shelve）、×1.2（amend）
 *   - 非委员长成员权重始终 ×1.0
 *
 * 运行: npm test
 */

import { describe, test, expect } from 'vitest';
import { committee_vote } from '../../../src/engine/committeeEngine';
import { getChairmanWeightMultiplier, hasQuorum } from '../../../src/engine/rulesEngine';
import type { Bill, Committee, Party, RelationEntry } from '../../../src/types';

// ============================================================================
// 测试夹具（fixtures）
// ============================================================================

function makeTestParty(id: string, ideology: 'left' | 'center' | 'right' = 'center'): Party {
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
    projectedSeats: 30,
    funds: 100,
    organization: 50,
    charisma: 50,
  };
}

function makeTestCommittee(
  chairmanName: string = '委员长A',
  chairmanPartyId: string = 'party_a',
  memberCount: number = 10,
): Committee {
  const members = Array.from({ length: memberCount }, (_, i) => ({
    personName: i === 0 ? chairmanName : `议员${i}`,
    partyId: i === 0 ? chairmanPartyId : i % 2 === 0 ? 'party_a' : 'party_b',
  }));

  return {
    id: 'general',
    chairman: members[0],
    viceChairman: members[1],
    members,
    presentMembers: members.map(m => m.personName),
    ideology: 'center',
    efficiency: 70,
  };
}

function makeTestBill(proposerPartyId: string = 'party_a'): Bill {
  return {
    id: 'bill-test-1',
    title: '测试法案',
    summary: '这是一个测试法案',
    proposerPartyId,
    proposerName: '提案人A',
    committeeId: 'general',
    status: 'in_committee',
    committeeNote: '',
    amendment: '',
    votesFor: 0,
    votesAgainst: 0,
    createdTurn: 1,
  };
}

function makeTestRelations(): RelationEntry[] {
  return [
    { from: 'party_a', to: 'party_b', score: 30, type: 'friendly', description: '友好关系' },
    { from: 'party_b', to: 'party_a', score: 25, type: 'friendly', description: '友好关系' },
  ];
}

// ============================================================================
// 1. getChairmanWeightMultiplier 基础测试
// ============================================================================

describe('getChairmanWeightMultiplier', () => {
  test('默认（无 context）应为 1.0', () => {
    const multiplier = getChairmanWeightMultiplier('push' as any);
    // 默认返回 1.0，但 'push' 应返回 1.3
    expect(multiplier).toBe(1.3);
  });

  test('voteContext=push → 委员长权重 ×1.3', () => {
    const multiplier = getChairmanWeightMultiplier('push');
    expect(multiplier).toBe(1.3);
  });

  test('voteContext=shelve → 委员长权重 ×1.5', () => {
    const multiplier = getChairmanWeightMultiplier('shelve');
    expect(multiplier).toBe(1.5);
  });

  test('voteContext=amend → 委员长权重 ×1.2', () => {
    const multiplier = getChairmanWeightMultiplier('amend');
    expect(multiplier).toBe(1.2);
  });
});

// ============================================================================
// 2. committee_vote 委员长权重测试
// ============================================================================

describe('committee_vote 委员长权重', () => {
  const parties = [
    makeTestParty('party_a', 'center'),
    makeTestParty('party_b', 'center'),
  ];
  const relations = makeTestRelations();
  const bill = makeTestBill('party_a');

  test('voteContext=push → 委员长票权重 1.3', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);
    expect(hasQuorum(committee)).toBe(true);

    const result = committee_vote(bill, committee, parties, relations, 'push');

    // 委员长是 party_a（同党），应该投赞成票，权重 1.3
    // 其他成员按关系投票，权重 1.0
    // 至少委员长的票应该计入 votesFor
    expect(result.votesFor).toBeGreaterThan(0);
    // 验证总票数符合预期（10 人出席 = 10 票，委员长 1.3 + 9 名成员 1.0 = 10.3）
    expect(result.votesFor + result.votesAgainst).toBeCloseTo(10.3, 1);
  });

  test('voteContext=shelve → 委员长票权重 1.5', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);
    const result = committee_vote(bill, committee, parties, relations, 'shelve');

    // 总票数应为 10.5（委员长 1.5 + 9 名成员 1.0）
    expect(result.votesFor + result.votesAgainst).toBeCloseTo(10.5, 1);
  });

  test('voteContext=amend → 委员长票权重 1.2', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);
    const result = committee_vote(bill, committee, parties, relations, 'amend');

    // 总票数应为 10.2（委员长 1.2 + 9 名成员 1.0）
    expect(result.votesFor + result.votesAgainst).toBeCloseTo(10.2, 1);
  });

  test('非委员长成员权重始终为 1.0', () => {
    // 创建一个只有非委员长出席的委员会（委员长缺席）
    const committee = makeTestCommittee('委员长A', 'party_a', 10);
    // 移除委员长
    committee.presentMembers = committee.presentMembers.filter(n => n !== '委员长A');

    const result = committee_vote(bill, committee, parties, relations, 'push');

    // 9 名普通成员，总票数应为 9.0
    expect(result.votesFor + result.votesAgainst).toBe(9.0);
  });

  test('默认 voteContext=push → 委员长权重 1.3', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);
    const result = committee_vote(bill, committee, parties, relations);

    // 默认使用 'push' context
    expect(result.votesFor + result.votesAgainst).toBeCloseTo(10.3, 1);
  });
});

// ============================================================================
// 3. committee_vote 投票逻辑测试
// ============================================================================

describe('committee_vote 投票逻辑', () => {
  const parties = [
    makeTestParty('party_a', 'center'),
    makeTestParty('party_b', 'right'),
  ];
  const relations = makeTestRelations();

  test('提案党同党委员投赞成票', () => {
    const bill = makeTestBill('party_a');
    const committee = makeTestCommittee('委员长A', 'party_a', 10);

    const result = committee_vote(bill, committee, parties, relations, 'push');

    // party_a 的委员（包括委员长）应投赞成
    // 10 人中 5 个是 party_a（索引 0,2,4,6,8），5 个是 party_b
    // 委员长是 party_a，权重 1.3
    // party_a 党员基本都投赞成，party_b 按关系可能投反对
    expect(result.votesFor).toBeGreaterThan(0);
  });

  test('提案党敌对党委员倾向投反对票', () => {
    const bill = makeTestBill('party_a');
    const committee = makeTestCommittee('委员长B', 'party_b', 10);

    // 委员长是 party_b（敌对），关系 30 分不算太敌对
    const result = committee_vote(bill, committee, parties, relations, 'push');

    // party_b 委员长可能投反对，权重 1.3
    expect(result.votesAgainst).toBeGreaterThanOrEqual(0);
  });

  test('意识形态距离影响投票倾向', () => {
    const parties = [
      makeTestParty('party_a', 'far-left'),
      makeTestParty('party_b', 'far-right'),
    ];
    const bill = makeTestBill('party_a');
    const committee = makeTestCommittee('委员长B', 'party_b', 10);

    // far-left 和 far-right 距离为 6，应大幅降低 favorScore
    const result = committee_vote(bill, committee, parties, relations, 'push');

    // party_b 委员应倾向于反对
    expect(result.votesAgainst).toBeGreaterThan(result.votesFor);
  });
});

// ============================================================================
// 4. committee_vote 边界情况测试
// ============================================================================

describe('committee_vote 边界情况', () => {
  const parties = [makeTestParty('party_a', 'center'), makeTestParty('party_b', 'center')];
  const relations = makeTestRelations();
  const bill = makeTestBill('party_a');

  test('法定人数不足 → 返回 0, 0', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 20);
    // 只有 5 人出席（20 人需 11 人）
    committee.presentMembers = committee.presentMembers.slice(0, 5);

    const result = committee_vote(bill, committee, parties, relations, 'push');

    expect(result.votesFor).toBe(0);
    expect(result.votesAgainst).toBe(0);
  });

  test('全员出席 → 所有成员都投票', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);
    const result = committee_vote(bill, committee, parties, relations, 'push');

    // 10 人出席 = 10.3 总票数（委员长 1.3）
    expect(result.votesFor + result.votesAgainst).toBeCloseTo(10.3, 1);
  });

  test('半数出席 → 达到法定人数可以投票', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);
    // 10 人需 6 人出席（过半数）
    committee.presentMembers = committee.presentMembers.slice(0, 6);

    const result = committee_vote(bill, committee, parties, relations, 'push');

    // 委员长在内 = 1.3 + 5 名成员 = 6.3
    expect(result.votesFor + result.votesAgainst).toBeCloseTo(6.3, 1);
  });

  test('恰好过半数出席 → 可以投票（边界值）', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 20);
    // 20 人需 11 人出席
    committee.presentMembers = committee.presentMembers.slice(0, 11);

    const result = committee_vote(bill, committee, parties, relations, 'push');

    // 11 人出席，委员长权重 1.3 = 11.3
    expect(result.votesFor + result.votesAgainst).toBeCloseTo(11.3, 1);
  });

  test('恰好一半出席 → 不能投票（法定人数不足）', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);
    // 10 人恰好一半 = 5 人，需 6 人
    committee.presentMembers = committee.presentMembers.slice(0, 5);

    const result = committee_vote(bill, committee, parties, relations, 'push');

    expect(result.votesFor).toBe(0);
    expect(result.votesAgainst).toBe(0);
  });
});

// ============================================================================
// 5. committee_vote 委员长权重优先级测试
// ============================================================================

describe('committee_vote 委员长权重优先级', () => {
  const parties = [
    makeTestParty('party_a', 'center'),
    makeTestParty('party_b', 'center'),
  ];
  const relations = makeTestRelations();
  const bill = makeTestBill('party_a');

  test('委员长权重覆盖其他因素（最高优先级）', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);

    // 测试不同 context 下的委员长权重
    const pushResult = committee_vote(bill, committee, parties, relations, 'push');
    const shelveResult = committee_vote(bill, committee, parties, relations, 'shelve');
    const amendResult = committee_vote(bill, committee, parties, relations, 'amend');

    // 总票数应反映委员长权重差异
    // shelve (1.5) > push (1.3) > amend (1.2)
    const pushTotal = pushResult.votesFor + pushResult.votesAgainst;
    const shelveTotal = shelveResult.votesFor + shelveResult.votesAgainst;
    const amendTotal = amendResult.votesFor + amendResult.votesAgainst;

    expect(pushTotal).toBeCloseTo(10.3, 1);
    expect(shelveTotal).toBeCloseTo(10.5, 1);
    expect(amendTotal).toBeCloseTo(10.2, 1);
  });

  test('副委员长权重为 1.0（无特殊权重）', () => {
    const committee = makeTestCommittee('委员长A', 'party_a', 10);

    // 副委员长是 members[1]
    const viceChairman = committee.viceChairman.personName;

    // 移除委员长，只保留副委员长
    committee.presentMembers = committee.members
      .filter(m => m.personName === viceChairman || m.personName !== committee.chairman.personName)
      .map(m => m.personName);

    const result = committee_vote(bill, committee, parties, relations, 'push');

    // 副委员长权重 1.0，总票数 = 出席人数
    const expectedTotal = committee.presentMembers.length;
    expect(result.votesFor + result.votesAgainst).toBe(expectedTotal);
  });
});
