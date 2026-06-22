import type {
  Party,
  RelationEntry,
  ElectionResult,
  Government,
  CoalitionOffer,
  Minister,
  CabinetPost,
  Ideology,
  CoalitionAgreement,
  NoConfidenceMotion,
} from '../types';
import { CABINET_POST_LABELS } from '../types';
import {
  createCoalitionAgreement,
  validateCoalitionAgreement,
  createNoConfidenceMotion,
  validateNoConfidenceMotion,
  NO_CONFIDENCE_THRESHOLD,
} from './rulesEngine';

/**
 * 政府组建引擎
 *
 * 核心规则：
 * 1. 内阁成员不能重复（每人最多一个职位）
 * 2. 内阁成员由首相指定（根据关系远近及利益输送）
 * 3. 初始执政联盟只有改革民主党，其它均为在野势力
 * 4. 游戏中可通过 recruitToCoalition 拉拢其他党派
 */

// ===== 意识形态距离 =====

const IDEOLOGY_ORDER: Ideology[] = [
  'far-left', 'left', 'center-left', 'center', 'center-right', 'right', 'far-right',
];

function ideologyDistance(a: Ideology, b: Ideology): number {
  return Math.abs(IDEOLOGY_ORDER.indexOf(a) - IDEOLOGY_ORDER.indexOf(b));
}

// ===== 全部内阁职位（按重要性排序） =====

const ALL_CABINET_POSTS: CabinetPost[] = [
  'prime_minister',
  'chief_secretary',
  'finance_minister',
  'foreign_minister',
  'defense_minister',
  'health_minister',
  'economy_minister',
];

/** 除首相外的内阁职位 */
const NON_PM_POSTS: CabinetPost[] = ALL_CABINET_POSTS.filter((p) => p !== 'prime_minister');

// ===== 工具：从党派花名册中挑选唯一成员 =====

/**
 * 从党派中选出一个尚未使用的成员名
 * 优先选 leader（适用于联盟伙伴的第一个职位），然后按 members 顺序
 */
function pickUniqueMember(party: Party, usedNames: Set<string>, preferLeader = false): string {
  const candidates = preferLeader
    ? [party.leader, ...party.members]
    : [...party.members, party.leader];

  for (const name of candidates) {
    if (!usedNames.has(name)) return name;
  }
  // 兜底：生成一个不重复的名字
  return `${party.leader}·代理人${usedNames.size}`;
}

// ===== 首相指名选举 =====

/**
 * 首相指名：执政联盟中席位最多的政党领袖出任首相
 */
export function electPrimeMinister(
  rulingCoalitionIds: string[],
  parties: Party[],
  electionResult: ElectionResult,
): { partyId: string; personName: string } {
  // 在执政联盟内找席位最多的党
  const coalitionResults = electionResult.partyResults
    .filter((r) => rulingCoalitionIds.includes(r.partyId))
    .sort((a, b) => b.seats - a.seats);

  const largestId = coalitionResults[0]?.partyId ?? rulingCoalitionIds[0];
  const party = parties.find((p) => p.id === largestId)!;
  return { partyId: party.id, personName: party.leader };
}

// ===== 联盟意愿计算 =====

/**
 * 计算某个政党加入执政联盟的意愿分数 (0-100)
 *
 * 考虑因素（加权）：
 * - 意识形态距离 (30%)：距离越近越愿意
 * - 双边关系 (35%)：关系分越高越愿意
 * - 职位诱惑 (25%)：能获得的内阁职位越多越愿意
 * - 席位杠杆 (10%)：自身席位能否帮联盟过半
 */
export function calcCoalitionWillingness(
  party: Party,
  primeMinisterParty: Party,
  relations: RelationEntry[],
  offeredPosts: CabinetPost[],
  totalCoalitionSeats: number,
  majorityThreshold: number,
): number {
  // 1. 意识形态距离 (0-6) -> 分数
  const idDist = ideologyDistance(party.ideology, primeMinisterParty.ideology);
  const ideologyScore = Math.max(0, 60 - idDist * 10);

  // 2. 双边关系 (-100~100) -> 分数
  const relation = relations.find(
    (r) => r.from === party.id && r.to === primeMinisterParty.id,
  );
  const relationScore = relation ? (relation.score + 100) / 2 : 50;

  // 3. 职位诱惑
  const postScore = Math.min(60, offeredPosts.length * 15);

  // 4. 席位杠杆
  const seatsNeeded = majorityThreshold - totalCoalitionSeats;
  const leverageScore = seatsNeeded > 0 && party.projectedSeats >= seatsNeeded
    ? 20
    : 5;

  const raw = ideologyScore * 0.3 + relationScore * 0.35 + postScore * 0.25 + leverageScore * 0.1;
  return Math.round(Math.max(0, Math.min(100, raw)));
}

// ===== 内阁组建（首相指定） =====

/**
 * 组建内阁
 *
 * 规则：
 * - 首相 (prime_minister) 由执政联盟最大党领袖担任
 * - 官房长官 (chief_secretary) 由首相党成员担任（最亲信）
 * - 其余职位由首相按关系远近分配：
 *   - 联盟内其他党按 (对首相党的关系分 + 席位权重) 排序
 *   - 关系最近、席位最多的党优先获得重要职位
 *   - 每个联盟党按席位比例获得一定数量的职位
 * - 每个职位由不同的人担任（不重复）
 * - 剩余职位由首相党成员填充
 */
export function formCabinet(
  parties: Party[],
  rulingCoalitionIds: string[],
  electionResult: ElectionResult,
  relations: RelationEntry[],
): Minister[] {
  const ministers: Minister[] = [];
  const usedNames = new Set<string>();

  // 确定首相党
  const pmResult = electPrimeMinister(rulingCoalitionIds, parties, electionResult);
  const pmPartyId = pmResult.partyId;
  const pmParty = parties.find((p) => p.id === pmPartyId)!;

  // 1. 首相
  ministers.push({ post: 'prime_minister', partyId: pmPartyId, personName: pmParty.leader });
  usedNames.add(pmParty.leader);

  // 2. 官房长官 — 始终由首相党的亲信担任
  const csName = pickUniqueMember(pmParty, usedNames);
  ministers.push({ post: 'chief_secretary', partyId: pmPartyId, personName: csName });
  usedNames.add(csName);

  // 3. 其余 5 个职位
  const remainingPosts: CabinetPost[] = [
    'finance_minister',
    'foreign_minister',
    'defense_minister',
    'health_minister',
    'economy_minister',
  ];

  // 计算联盟内各党席位
  const coalitionSeats: Record<string, number> = {};
  let totalCoalitionSeats = 0;
  for (const pid of rulingCoalitionIds) {
    const r = electionResult.partyResults.find((er) => er.partyId === pid);
    coalitionSeats[pid] = r?.seats ?? 0;
    totalCoalitionSeats += r?.seats ?? 0;
  }

  // 联盟伙伴（不含首相党），按关系远近 + 席位排序
  const partners = rulingCoalitionIds
    .filter((id) => id !== pmPartyId)
    .map((pid) => {
      const party = parties.find((p) => p.id === pid)!;
      const rel = relations.find((r) => r.from === pid && r.to === pmPartyId);
      const relScore = rel ? rel.score : 0;
      return { partyId: pid, party, seats: coalitionSeats[pid], relScore };
    })
    .sort((a, b) => {
      // 关系优先，席位次之
      const scoreA = a.relScore * 0.6 + a.seats * 0.4;
      const scoreB = b.relScore * 0.6 + b.seats * 0.4;
      return scoreB - scoreA;
    });

  let postIdx = 0;

  // 联盟伙伴按关系远近分配职位
  for (const partner of partners) {
    const count = Math.max(
      1,
      Math.round((partner.seats / totalCoalitionSeats) * remainingPosts.length),
    );
    // 第一个职位优先用党首（作为利益输送的核心）
    let usedLeader = false;
    for (let i = 0; i < count && postIdx < remainingPosts.length; i++) {
      const name = pickUniqueMember(partner.party, usedNames, !usedLeader);
      usedLeader = usedLeader || name === partner.party.leader;
      ministers.push({
        post: remainingPosts[postIdx],
        partyId: partner.partyId,
        personName: name,
      });
      usedNames.add(name);
      postIdx++;
    }
  }

  // 剩余职位由首相党成员填充
  while (postIdx < remainingPosts.length) {
    const name = pickUniqueMember(pmParty, usedNames);
    ministers.push({
      post: remainingPosts[postIdx],
      partyId: pmPartyId,
      personName: name,
    });
    usedNames.add(name);
    postIdx++;
  }

  return ministers;
}

// ===== 稳定度计算 =====

/**
 * 内阁稳定度 (0-100)
 *
 * 考虑因素：
 * - 席位裕度 (0-40分)：少数政府严重扣分
 * - 联盟内关系 (0-40分)：盟友间关系越好越稳定
 * - 意识形态跨度 (0-20分)：跨度越大越不稳定
 */
export function calcCabinetStability(
  parties: Party[],
  relations: RelationEntry[],
  rulingCoalitionIds: string[],
  electionResult: ElectionResult,
): number {
  const coalitionSeats = rulingCoalitionIds.reduce((sum, pid) => {
    const r = electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  const margin = coalitionSeats - electionResult.majorityThreshold;

  // 1. 席位裕度 (0-40分)
  let seatScore: number;
  if (margin < 0) {
    // 少数政府：距过半越远越不稳定
    seatScore = Math.max(0, 15 - Math.abs(margin));
  } else {
    seatScore = Math.min(40, margin * 2);
  }

  // 2. 联盟内关系 (0-40分)
  let relationTotal = 0;
  let relationPairs = 0;
  for (let i = 0; i < rulingCoalitionIds.length; i++) {
    for (let j = i + 1; j < rulingCoalitionIds.length; j++) {
      const rel = relations.find(
        (r) => r.from === rulingCoalitionIds[i] && r.to === rulingCoalitionIds[j],
      );
      if (rel) {
        relationTotal += rel.score;
        relationPairs++;
      }
    }
  }
  let relationScore: number;
  if (relationPairs === 0) {
    // 单党政府：无内部摩擦，但也无盟友支撑
    relationScore = 15;
  } else {
    const avgRelation = relationTotal / relationPairs;
    relationScore = Math.max(0, Math.min(40, (avgRelation + 100) / 200 * 40));
  }

  // 3. 意识形态跨度 (0-20分)
  const ideologies = rulingCoalitionIds.map((pid) => {
    const p = parties.find((pp) => pp.id === pid);
    return p ? IDEOLOGY_ORDER.indexOf(p.ideology) : 3;
  });
  const span = Math.max(...ideologies) - Math.min(...ideologies);
  const ideologyScore = Math.max(0, 20 - span * 4);

  return Math.round(Math.max(0, Math.min(100, seatScore + relationScore + ideologyScore)));
}

// ===== 政府组建 =====

/**
 * 组建政府
 *
 * 规则约束：任何联盟成立必须签署联盟协议（规则 #3）
 *
 * @param rulingCoalitionIds 执政联盟成员 ID 列表
 * @param parties 全部党派
 * @param relations 关系矩阵
 * @param electionResult 选举结果
 * @param turn 当前回合
 */
export function formGovernment(
  rulingCoalitionIds: string[],
  parties: Party[],
  relations: RelationEntry[],
  electionResult: ElectionResult,
  turn: number = 1,
): Government {
  const pm = electPrimeMinister(rulingCoalitionIds, parties, electionResult);

  const coalitionSeats = rulingCoalitionIds.reduce((sum, pid) => {
    const r = electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  const opposition = parties
    .map((p) => p.id)
    .filter((pid) => !rulingCoalitionIds.includes(pid));

  const ministers = formCabinet(parties, rulingCoalitionIds, electionResult, relations);
  const stability = calcCabinetStability(parties, relations, rulingCoalitionIds, electionResult);

  // 规则 #3：任何联盟成立必须签署联盟协议
  const coalitionAgreements: CoalitionAgreement[] = [];
  if (rulingCoalitionIds.length > 1) {
    // 多党联盟需要签署联盟协议
    const cabinetAllocation = buildCabinetAllocation(ministers, rulingCoalitionIds);
    const agreement = createCoalitionAgreement(
      rulingCoalitionIds,
      cabinetAllocation,
      ['维持联合政府运作', '共同推进执政纲领'],
      turn,
    );
    coalitionAgreements.push(agreement);
  }

  return {
    primeMinisterPartyId: pm.partyId,
    primeMinisterName: pm.personName,
    rulingCoalition: rulingCoalitionIds,
    opposition,
    ministers,
    stability,
    isMinority: coalitionSeats < electionResult.majorityThreshold,
    electionResult,
    coalitionOffers: [],
    coalitionAgreements,
    noConfidenceMotions: [],
  };
}

/** 从内阁成员列表构建职位分配方案 */
function buildCabinetAllocation(
  ministers: Minister[],
  coalitionIds: string[],
): { partyId: string; posts: CabinetPost[] }[] {
  const allocation: Record<string, CabinetPost[]> = {};
  for (const pid of coalitionIds) {
    allocation[pid] = [];
  }
  for (const m of ministers) {
    if (allocation[m.partyId]) {
      allocation[m.partyId].push(m.post);
    }
  }
  return Object.entries(allocation).map(([partyId, posts]) => ({ partyId, posts }));
}

// ===== 招募政党加入执政联盟 =====

/**
 * 招募结果
 */
export interface RecruitmentResult {
  success: boolean;
  willingness: number;
  newGovernment: Government;
}

/**
 * 尝试招募一个在野党加入执政联盟
 *
 * 流程：
 * 1. 计算目标政党的加入意愿
 * 2. 如果意愿 >= 45，目标政党加入执政联盟
 * 3. 签署联盟协议（规则 #3：任何联盟成立必须签署联盟协议）
 * 4. 将被招募者的代表（优先党首）安插到 offeredPosts 指定的职位
 * 5. 被替换的职位原持有人卸任
 * 6. 重新计算稳定度
 *
 * @param government 当前政府
 * @param parties 全部党派
 * @param relations 关系矩阵
 * @param targetPartyId 目标政党 ID
 * @param offeredPosts 向目标政党提供的内阁职位
 * @param turn 当前回合
 */
export function recruitToCoalition(
  government: Government,
  parties: Party[],
  relations: RelationEntry[],
  targetPartyId: string,
  offeredPosts: CabinetPost[],
  turn: number = 1,
): RecruitmentResult {
  const pmParty = parties.find((p) => p.id === government.primeMinisterPartyId)!;
  const targetParty = parties.find((p) => p.id === targetPartyId)!;

  // 安全检查：不能招募已在联盟中的政党
  if (government.rulingCoalition.includes(targetPartyId)) {
    return { success: false, willingness: 0, newGovernment: government };
  }

  // 安全检查：不能让出首相职位
  const safePosts = offeredPosts.filter((p) => p !== 'prime_minister');

  // 计算当前联盟席位
  const coalitionSeats = government.rulingCoalition.reduce((sum, pid) => {
    const r = government.electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  const willingness = calcCoalitionWillingness(
    targetParty,
    pmParty,
    relations,
    safePosts,
    coalitionSeats,
    government.electionResult.majorityThreshold,
  );

  if (willingness < 45) {
    return { success: false, willingness, newGovernment: government };
  }

  // --- 招募成功 ---

  // 新执政联盟
  const newRulingCoalition = [...government.rulingCoalition, targetPartyId];
  const newOpposition = government.opposition.filter((id) => id !== targetPartyId);

  // 替换内阁成员：将 offeredPosts 对应的职位交给目标政党
  const usedNames = new Set<string>();

  // 先收集所有不被替换的部长名字
  const survivingMinisters = government.ministers.filter(
    (m) => !(safePosts as readonly CabinetPost[]).includes(m.post),
  );
  for (const m of survivingMinisters) {
    usedNames.add(m.personName);
  }

  // 为目标政党分配 offered 的职位
  const newMinisters = [...survivingMinisters];
  // 第一个职位优先给党首（利益输送的核心）
  let usedLeader = false;
  for (const post of safePosts) {
    const name = pickUniqueMember(targetParty, usedNames, !usedLeader);
    usedLeader = usedLeader || name === targetParty.leader;
    newMinisters.push({
      post,
      partyId: targetPartyId,
      personName: name,
    });
    usedNames.add(name);
  }

  // 按职位重要性排序
  newMinisters.sort(
    (a, b) => ALL_CABINET_POSTS.indexOf(a.post) - ALL_CABINET_POSTS.indexOf(b.post),
  );

  const newStability = calcCabinetStability(
    parties, relations, newRulingCoalition, government.electionResult,
  );

  const newCoalitionSeats = newRulingCoalition.reduce((sum, pid) => {
    const r = government.electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  const offer: CoalitionOffer = {
    partyId: targetPartyId,
    accepted: true,
    willingness,
    demandedPosts: safePosts,
  };

  const newGovernment: Government = {
    ...government,
    rulingCoalition: newRulingCoalition,
    opposition: newOpposition,
    ministers: newMinisters,
    stability: newStability,
    isMinority: newCoalitionSeats < government.electionResult.majorityThreshold,
    coalitionOffers: [...government.coalitionOffers, offer],
    coalitionAgreements: [
      ...government.coalitionAgreements,
      // 规则 #3：新成员加入必须签署联盟协议
      createCoalitionAgreement(
        newRulingCoalition,
        buildCabinetAllocation(newMinisters, newRulingCoalition),
        [`${targetParty.name} 加入执政联盟`, `获得内阁职位: ${safePosts.map((p) => CABINET_POST_LABELS[p]).join(', ')}`],
        turn,
      ),
    ],
    noConfidenceMotions: government.noConfidenceMotions,
  };

  return { success: true, willingness, newGovernment };
}

// ===== 工具函数 =====

/** 获取阁僚职位中文名 */
export function getPostLabel(post: CabinetPost): string {
  return CABINET_POST_LABELS[post];
}

// ===== 不信任案 =====

/**
 * 提出不信任案
 *
 * 规则约束：至少 20 名议员联署（规则 #1）
 *
 * @param government 当前政府
 * @param signatories 联署议员姓名列表
 * @param proposingPartyId 发起党派 ID
 * @param turn 当前回合
 * @returns 更新后的政府（包含新的不信任案）
 */
export function proposeNoConfidence(
  government: Government,
  signatories: string[],
  proposingPartyId: string,
  turn: number,
): { government: Government; valid: boolean; reason?: string } {
  const motion = createNoConfidenceMotion(signatories, proposingPartyId, turn);
  const validation = validateNoConfidenceMotion(motion);

  const newGovernment: Government = {
    ...government,
    noConfidenceMotions: [...government.noConfidenceMotions, motion],
  };

  return {
    government: newGovernment,
    valid: validation.valid,
    reason: validation.reason,
  };
}

/**
 * 对不信任案进行表决
 *
 * 规则约束：联署必须达到 20 人门槛才能表决（规则 #1）
 * 简化处理：以执政联盟 vs 在野联盟的席位对比决定结果
 *
 * @param government 当前政府
 * @param motionId 不信任案 ID
 * @param parties 全部党派
 * @param relations 关系矩阵
 * @returns 表决结果
 */
export function voteOnNoConfidence(
  government: Government,
  motionId: string,
  parties: Party[],
  relations: RelationEntry[],
): { passed: boolean; votesFor: number; votesAgainst: number; newGovernment: Government } {
  const motion = government.noConfidenceMotions.find((m) => m.id === motionId);

  // 规则 #1：联署门槛校验
  if (!motion || !motion.meetsThreshold) {
    return {
      passed: false,
      votesFor: 0,
      votesAgainst: 0,
      newGovernment: government,
    };
  }

  // 计算在野 vs 执政的席位数
  const rulingSeats = government.rulingCoalition.reduce((sum, pid) => {
    const r = government.electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  const oppositionSeats = government.opposition.reduce((sum, pid) => {
    const r = government.electionResult.partyResults.find((er) => er.partyId === pid);
    return sum + (r?.seats ?? 0);
  }, 0);

  // 不信任案通过需要过半数赞成
  const votesFor = oppositionSeats;
  const votesAgainst = rulingSeats;
  const passed = votesFor > votesAgainst;

  return {
    passed,
    votesFor,
    votesAgainst,
    newGovernment: government, // 如果通过，政府倒台，需要重新选举（由上层处理）
  };
}
