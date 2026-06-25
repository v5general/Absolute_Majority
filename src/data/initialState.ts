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
import { createInitialMemory } from '../engine/worldMemory';
import { createInitialDramaState } from '../engine/dramaEngine';

/**
 * 生成初始游戏状态
 *
 * 完整集成所有系统：
 * - 选举 V2（110 直接 + 89 比例 = 199 NPC 席，玩家为第 200 席）
 * - 派阀初始化（除 ULP 外所有政党）
 * - 背景生成（每个议员）
 * - 职业初始化（双轨制）
 * - 背景修正应用到人格数据
 *
 * 初始设定：改革民主党单独执政（少数政府）
 * 其余五党均在野，游戏中可拉拢加入执政联盟
 *
 * 玩家选择党派后该党席位 +1（见 useGameState.setPlayerConfig）
 */
export function createInitialState(): GameState {
  // 深拷贝所有导入常量，防止 mutation 污染源数据
  const base: GameState = {
    parties: JSON.parse(JSON.stringify(initialParties)),
    relations: JSON.parse(JSON.stringify(initialRelations)),
    metrics: JSON.parse(JSON.stringify(initialMetrics)),
    districts: JSON.parse(JSON.stringify(initialDistricts)),
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
    worldMemory: createInitialMemory(),
    dramaState: createInitialDramaState(),
  };

  // 1. 执行选举 V2：199 NPC 席（110 直接 + 89 比例代表）
  //    玩家为第 200 席（占 1 个比例代表席），加入某党时该党 +1
  const npcSeats = base.metrics.totalSeats - 1; // 199
  const npcMajority = Math.floor(npcSeats / 2) + 1; // 100
  const electionResult = runElectionV2(
    base.parties,
    base.districts,
    npcSeats,
    npcMajority,
    {},
    false,
  );
  // 修正元数据为完整议会数值（200 席 / 101 过半），玩家席位由 setPlayerConfig 补足
  electionResult.totalSeats = base.metrics.totalSeats;           // 200
  electionResult.majorityThreshold = base.metrics.majorityThreshold; // 101

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
