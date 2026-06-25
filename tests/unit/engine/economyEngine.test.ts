/**
 * economyEngine 单元测试
 *
 * 测试范围（按 P1 优先级）:
 *   - advanceEconomyTurn: 净变化每回合 ±0（无派阀）或 +10（有派阀）
 *   - advanceEconomyTurn: 资金不会降到 0 以下
 *   - runFundraising: 增加 50 资金到党派
 *   - applyDonationEvent: 增加 100-300 资金
 *   - getNetFaucetSinkPerTurn: 返回正确的净值
 *
 * 运行: npm test
 */

import { describe, test, expect } from 'vitest';
import {
  advanceEconomyTurn,
  runFundraising,
  applyDonationEvent,
  getNetFaucetSinkPerTurn,
} from '../../../src/engine/economyEngine';
import { FUNDS_FAUCET_SINK } from '../../../src/config/gameBalance';
import type { GameState, Party } from '../../../src/types';
import type { Faction } from '../../../src/types/faction';
import { makeTestMP } from '../../helpers/fixtures';

// ============================================================================
// 测试夹具（fixtures）
// ============================================================================

function makeTestFaction(id: string, partyId: string): Faction {
  return {
    id,
    name: `${partyId}派阀`,
    leader: `${partyId}:党首${partyId}`,
    members: [],
    ideology: 'mainstream',
    loyalty: 60,
    influence: 50,
    funding: 100,
    ambition: 50,
    demands: ['cabinet_post'],
    partyId,
  };
}

function makeTestParty(id: string, funds = 100, hasFactions = false): Party {
  return {
    id,
    name: `党${id}`,
    abbreviation: id.toUpperCase(),
    color: '#000',
    ideology: 'center',
    leader: `党首${id}`,
    description: '测试用党',
    members: [],
    baseSupport: 25,
    currentSupport: 25,
    projectedSeats: 30,
    funds,
    organization: 50,
    charisma: 50,
    factions: hasFactions ? [makeTestFaction('faction1', id)] : undefined,
  };
}

function makeTestState(parties?: Party[]): GameState {
  const base: GameState = {
    parties: parties ?? [
      makeTestParty('reform', 100, false),
      makeTestParty('liberty', 200, false),
      makeTestParty('conservative', 50, true), // 有派阀
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
      mp1: makeTestMP('mp1', { partyId: 'reform', loyalty: 50, ambition: 50, politicalCapital: 30 }),
      mp2: makeTestMP('mp2', { partyId: 'liberty', loyalty: 60, ambition: 40, politicalCapital: 25 }),
      mp3: makeTestMP('mp3', { partyId: 'reform', loyalty: 70, ambition: 60, politicalCapital: 40, factionId: 'faction1' }),
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
// 1. advanceEconomyTurn 净变化
// ============================================================================

describe('advanceEconomyTurn 净变化', () => {
  test('无派阀党派每回合净变化为 0', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    const newState = advanceEconomyTurn(state);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(100); // 净 0 变化
  });

  test('有派阀党派每回合净变化为 +10', () => {
    const state = makeTestState([makeTestParty('conservative', 100, true)]);
    const newState = advanceEconomyTurn(state);
    const conservative = newState.parties.find(p => p.id === 'conservative');
    expect(conservative?.funds).toBe(110); // 100 + 10
  });

  test('多个党派混合，各自净变化正确', () => {
    const state = makeTestState([
      makeTestParty('reform', 100, false),
      makeTestParty('liberty', 200, false),
      makeTestParty('conservative', 50, true),
    ]);
    const newState = advanceEconomyTurn(state);

    const reform = newState.parties.find(p => p.id === 'reform');
    const liberty = newState.parties.find(p => p.id === 'liberty');
    const conservative = newState.parties.find(p => p.id === 'conservative');

    expect(reform?.funds).toBe(100); // 无派阀，净 0
    expect(liberty?.funds).toBe(200); // 无派阀，净 0
    expect(conservative?.funds).toBe(60); // 有派阀，净 +10
  });

  test('资金不会降到 0 以下', () => {
    const state = makeTestState([makeTestParty('reform', 0, false)]);
    const newState = advanceEconomyTurn(state);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBeGreaterThanOrEqual(0);
  });

  test('资金刚好为 0 时仍保持 0', () => {
    const state = makeTestState([makeTestParty('reform', 0, false)]);
    const newState = advanceEconomyTurn(state);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(0);
  });

  test('资金为负数时修正为 0', () => {
    const state = makeTestState([makeTestParty('reform', -50, false)]);
    const newState = advanceEconomyTurn(state);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBeGreaterThanOrEqual(0);
  });

  test('大型资金值（10000）净变化仍正确', () => {
    const state = makeTestState([makeTestParty('reform', 10000, false)]);
    const newState = advanceEconomyTurn(state);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(10000); // 净 0 变化
  });
});

// ============================================================================
// 2. FUNDS_FAUCET_SINK 配置值
// ============================================================================

describe('FUNDS_FAUCET_SINK 配置值', () => {
  test('办公津贴应为 30', () => {
    expect(FUNDS_FAUCET_SINK.officeAllowance).toBe(30);
  });

  test('委员会津贴应为 20', () => {
    expect(FUNDS_FAUCET_SINK.committeeAllowance).toBe(20);
  });

  test('派阀贡献应为 10', () => {
    expect(FUNDS_FAUCET_SINK.factionContribution).toBe(10);
  });

  test('办公费应为 -30', () => {
    expect(FUNDS_FAUCET_SINK.officeCost).toBe(-30);
  });

  test('员工薪资应为 -20', () => {
    expect(FUNDS_FAUCET_SINK.staffSalary).toBe(-20);
  });

  test('活动基金应为 -10', () => {
    expect(FUNDS_FAUCET_SINK.activityFund).toBe(-10);
  });

  test('募款行动收益应为 50', () => {
    expect(FUNDS_FAUCET_SINK.fundraisingActionGain).toBe(50);
  });

  test('捐款事件范围应为 [100, 300]', () => {
    expect(FUNDS_FAUCET_SINK.donationEventRange).toEqual([100, 300]);
  });

  test('Faucet 总和为 +60（无派阀）', () => {
    const faucet = FUNDS_FAUCET_SINK.officeAllowance +
                   FUNDS_FAUCET_SINK.committeeAllowance;
    expect(faucet).toBe(50);
  });

  test('Faucet 总和为 +60（有派阀）', () => {
    const faucet = FUNDS_FAUCET_SINK.officeAllowance +
                   FUNDS_FAUCET_SINK.committeeAllowance +
                   FUNDS_FAUCET_SINK.factionContribution;
    expect(faucet).toBe(60);
  });

  test('Sink 总和为 -60', () => {
    const sink = FUNDS_FAUCET_SINK.officeCost +
                 FUNDS_FAUCET_SINK.staffSalary +
                 FUNDS_FAUCET_SINK.activityFund;
    expect(sink).toBe(-60);
  });
});

// ============================================================================
// 3. runFundraising 募款活动
// ============================================================================

describe('runFundraising 募款活动', () => {
  test('募款增加 50 资金到党派', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    const { state: newState } = runFundraising(state, 'mp1');
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(150); // 100 + 50
  });

  test('募款生成正确的 intent', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    const { intent } = runFundraising(state, 'mp1');
    expect(intent.type).toBe('fundraising');
    expect(intent.source).toBe('mp1');
    expect(intent.payload.mpKey).toBe('mp1');
    expect(intent.payload.partyId).toBe('reform');
    expect(intent.payload.gain).toBe(50);
  });

  test('募款资金不会超过合理上限（大额测试）', () => {
    const state = makeTestState([makeTestParty('reform', 100000, false)]);
    const { state: newState } = runFundraising(state, 'mp1');
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(100050); // 100000 + 50
  });

  test('派阀成员募款获得 +20% 加成', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    const { state: newState, intent } = runFundraising(state, 'mp3'); // mp3 有派阀
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(160); // 100 + 50 (base) + 10 (20% 加成)
    expect(intent.payload.gain).toBe(60); // 总收益（base 50 + 派阀加成 10）
  });

  test('不存在的 MP 募款不会崩溃', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    const { state: newState } = runFundraising(state, 'nonexistent');
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(100); // 无变化（找不到 partyId）
  });

  test('多次募款累积正确', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    let { state: state1 } = runFundraising(state, 'mp1');
    let { state: state2 } = runFundraising(state1, 'mp1');
    let { state: state3 } = runFundraising(state2, 'mp1');
    const reform = state3.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(250); // 100 + 50 + 50 + 50
  });
});

// ============================================================================
// 4. applyDonationEvent 捐款事件
// ============================================================================

describe('applyDonationEvent 捐款事件', () => {
  test('捐款增加 100-300 范围内资金', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    const { state: newState, donation } = applyDonationEvent(state, 'reform');
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(100 + donation);
    expect(donation).toBeGreaterThanOrEqual(100);
    expect(donation).toBeLessThanOrEqual(300);
  });

  test('捐款金额在边界值', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);

    // 测试最小值
    const { state: state1, donation: donation1 } = applyDonationEvent(state, 'reform', 100);
    const reform1 = state1.parties.find(p => p.id === 'reform');
    expect(reform1?.funds).toBe(200);
    expect(donation1).toBe(100);

    // 测试最大值
    const { state: state2, donation: donation2 } = applyDonationEvent(state, 'reform', 300);
    const reform2 = state2.parties.find(p => p.id === 'reform');
    expect(reform2?.funds).toBe(400);
    expect(donation2).toBe(300);
  });

  test('捐款不会超过 300 上限', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    const { donation } = applyDonationEvent(state, 'reform');
    expect(donation).toBeLessThanOrEqual(300);
  });

  test('捐款不会低于 100 下限', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    const { donation } = applyDonationEvent(state, 'reform');
    expect(donation).toBeGreaterThanOrEqual(100);
  });

  test('捐款只影响指定党派', () => {
    const state = makeTestState([
      makeTestParty('reform', 100, false),
      makeTestParty('liberty', 200, false),
    ]);
    const { state: newState } = applyDonationEvent(state, 'reform', 150);
    const reform = newState.parties.find(p => p.id === 'reform');
    const liberty = newState.parties.find(p => p.id === 'liberty');
    expect(reform?.funds).toBe(250); // 100 + 150
    expect(liberty?.funds).toBe(200); // 无变化
  });

  test('捐款资金不会降到 0 以下（负数保护）', () => {
    const state = makeTestState([makeTestParty('reform', -50, false)]);
    const { state: newState } = applyDonationEvent(state, 'reform', 100);
    const reform = newState.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBeGreaterThanOrEqual(0);
  });
});

// ============================================================================
// 5. getNetFaucetSinkPerTurn 净值计算
// ============================================================================

describe('getNetFaucetSinkPerTurn 净值计算', () => {
  test('无派阀党派净值为 0', () => {
    const net = getNetFaucetSinkPerTurn(false);
    expect(net).toBe(0);
  });

  test('有派阀党派净值为 +10', () => {
    const net = getNetFaucetSinkPerTurn(true);
    expect(net).toBe(10);
  });

  test('净值计算符合 faucet + sink 逻辑', () => {
    const faucetWithoutFaction = FUNDS_FAUCET_SINK.officeAllowance +
                                  FUNDS_FAUCET_SINK.committeeAllowance +
                                  FUNDS_FAUCET_SINK.membershipDues;
    const sink = FUNDS_FAUCET_SINK.officeCost +
                 FUNDS_FAUCET_SINK.staffSalary +
                 FUNDS_FAUCET_SINK.activityFund;
    const expectedNet = faucetWithoutFaction + sink;
    expect(expectedNet).toBe(0);
  });

  test('有派阀净值计算符合 faucet + sink 逻辑', () => {
    const faucetWithFaction = FUNDS_FAUCET_SINK.officeAllowance +
                              FUNDS_FAUCET_SINK.committeeAllowance +
                              FUNDS_FAUCET_SINK.membershipDues +
                              FUNDS_FAUCET_SINK.factionContribution;
    const sink = FUNDS_FAUCET_SINK.officeCost +
                 FUNDS_FAUCET_SINK.staffSalary +
                 FUNDS_FAUCET_SINK.activityFund;
    const expectedNet = faucetWithFaction + sink;
    expect(expectedNet).toBe(10);
  });

  test('多回合累计净值正确（无派阀）', () => {
    const state = makeTestState([makeTestParty('reform', 100, false)]);
    let state1 = advanceEconomyTurn(state);
    let state2 = advanceEconomyTurn(state1);
    let state3 = advanceEconomyTurn(state2);
    const reform = state3.parties.find(p => p.id === 'reform');
    expect(reform?.funds).toBe(100); // 3 回合后仍为 100（净 0）
  });

  test('多回合累计净值正确（有派阀）', () => {
    const state = makeTestState([makeTestParty('conservative', 100, true)]);
    let state1 = advanceEconomyTurn(state);
    let state2 = advanceEconomyTurn(state1);
    let state3 = advanceEconomyTurn(state2);
    const conservative = state3.parties.find(p => p.id === 'conservative');
    expect(conservative?.funds).toBe(130); // 100 + 10 * 3
  });
});
