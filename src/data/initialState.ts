import type { GameState } from '../types';
import { initialParties } from './parties';
import { initialRelations } from './relations';
import { initialMetrics, initialDistricts } from './market';
import {
  runElectionV2,
  formGovernment,
  initializeCommittees,
  generatePersonalities,
  generateCandidatePopularity,
  initializeFactions,
} from '../engine';

/**
 * 生成初始游戏状态
 *
 * 完整集成所有系统：
 * - 选举 V2（120选区 + 80比例代表）
 * - 派阀初始化（除 ULP 外所有政党）
 * - 背景生成（每个议员）
 * - 职业初始化（双轨制）
 * - 背景修正应用到人格数据
 *
 * 初始设定：改革民主党单独执政（少数政府）
 * 其余五党均在野，游戏中可拉拢加入执政联盟
 */
export function createInitialState(): GameState {
  const base: GameState = {
    parties: initialParties,
    relations: initialRelations,
    metrics: initialMetrics,
    districts: initialDistricts,
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

  // 1. 执行选举 V2（规则.txt 公式：120选区 + 80比例代表）
  const electionResult = runElectionV2(
    base.parties,
    base.districts,
    base.metrics.totalSeats,
    base.metrics.majorityThreshold,
    {}, // 初始无候选人个人支持率，使用默认值
    false,
  );

  // 更新各党 projectedSeats 为实际选举结果
  for (const pr of electionResult.partyResults) {
    const party = base.parties.find((p) => p.id === pr.partyId);
    if (party) party.projectedSeats = pr.seats;
  }

  // 2. 组建政府：只有改革民主党执政，其余在野
  base.government = formGovernment(
    ['reform'],
    base.parties,
    base.relations,
    electionResult,
    base.turn,
  );

  // 3. 初始化 9 个委员会
  base.committees = initializeCommittees(
    base.parties,
    base.relations,
    electionResult,
    base.government.rulingCoalition,
  );

  // 4. 为所有 199 名 NPC 议员生成政治人格（含背景 + 职业）
  base.mpPersonalities = generatePersonalities(
    base.parties,
    base.committees,
    electionResult,
    base.government,
  );

  // 5. 初始化派阀系统（除 ULP/solidarity 外）
  const factionsByParty = initializeFactions(base.parties, base.mpPersonalities, base.government);

  // 将派阀数据写入各党
  for (const party of base.parties) {
    party.factions = factionsByParty[party.id] ?? [];
  }

  // 将派阀成员身份写入各议员的 mpPersonality
  for (const party of base.parties) {
    const factions = party.factions;
    if (!factions) continue;
    for (const faction of factions) {
      for (const memberKey of faction.members) {
        const mp = base.mpPersonalities[memberKey];
        if (mp) {
          mp.factionId = faction.id;
        }
      }
    }
  }

  // 6. 更新大盘领先联盟席位
  base.metrics.leadingCoalitionSeats = base.government.rulingCoalition.reduce((sum, pid) => {
    const r = electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  return base;
}
