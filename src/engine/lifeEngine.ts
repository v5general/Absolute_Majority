/**
 * 生老病死引擎
 *
 * 管理 NPC 议员的死亡检测、死亡处理、职位递补。
 * 所有概率基于 seededRandom(mpKey + turn) 确保确定性。
 */

import type {
  GameState,
  Party,
  Committee,
  Government,
  PoliticalEvent,
  CommitteeMember,
} from '../types';
import type { MPPersonality } from '../types/mp';

// ===== 确定性随机数生成器（与 politicalAIEngine 相同） =====

function seedFromName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return hash;
}

function seededRandom(seed: number): () => number {
  let s = Math.abs(seed) + 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ===== 类型 =====

/** 死亡原因 */
export type DeathCause = 'illness' | 'old_age' | 'accident' | 'suicide' | 'stress_collapse';

/** 死亡事件 */
export interface DeathEvent {
  /** 议员人格 key: "partyId:personName" */
  mpKey: string;
  /** 议员姓名 */
  mpName: string;
  /** 所属政党 ID */
  partyId: string;
  /** 死亡原因 */
  cause: DeathCause;
  /** 死亡年龄 */
  age: number;
  /** 替换者姓名（如有） */
  replacement?: string;
}

/** 生死检查结果 */
export interface LifeEventResult {
  /** 更新后的议员人格 */
  updatedPersonalities: Record<string, MPPersonality>;
  /** 本回合发生的死亡事件 */
  deathEvents: DeathEvent[];
  /** 供 UI 显示的政治事件 */
  politicalEvents: PoliticalEvent[];
  /** 更新后的政党 */
  updatedParties: Party[];
  /** 更新后的委员会 */
  updatedCommittees: Committee[];
  /** 更新后的政府 */
  updatedGovernment: Government | null;
  /** 玩家是否死亡 */
  isPlayerDead?: boolean;
  /** 玩家死亡原因 */
  playerDeathCause?: DeathCause;
  /** 更新后的玩家健康 */
  updatedPlayerHealth?: number;
  /** 更新后的玩家压力 */
  updatedPlayerStress?: number;
}

// ===== 死亡叙事模板 =====

const DEATH_NARRATIVES: Record<DeathCause, (name: string, age: number, partyName: string) => string> = {
  illness: (name, age, partyName) =>
    `${age}岁的${partyName}议员${name}因长期患病，医治无效去世。党内同僚纷纷表示哀悼。`,
  old_age: (name, age, partyName) =>
    `${age}岁的${partyName}议员${name}因年事已高，在睡梦中安详离世。这位资深议员为党派贡献了多年心血。`,
  accident: (name, age, partyName) =>
    `${age}岁的${partyName}议员${name}因意外事故不幸身亡。这突如其来的噩耗震惊了整个国会。`,
  suicide: (name, age, partyName) =>
    `${age}岁的${partyName}议员${name}因不堪长期压力选择了极端方式结束生命。这一悲剧引发了人们对议员心理健康问题的关注。`,
  stress_collapse: (name, age, partyName) =>
    `${age}岁的${partyName}议员${name}因身心崩溃，在工作岗位上倒下后再未醒来。过度劳累夺走了这位政治家的生命。`,
};

const CAUSE_LABELS: Record<DeathCause, string> = {
  illness: '疾病',
  old_age: '年老',
  accident: '意外事故',
  suicide: '自杀',
  stress_collapse: '过劳猝死',
};

// ===== 核心函数 =====

/**
 * 处理本回合所有生死事件
 *
 * 遍历所有议员，跳过已死亡的，检测死亡条件。
 * 对死亡的议员执行职位递补，生成通知事件。
 * 同时检查玩家健康和死亡。
 */
export function processLifeEvents(state: GameState): LifeEventResult {
  const deathEvents: DeathEvent[] = [];
  const politicalEvents: PoliticalEvent[] = [];
  let updatedPersonalities = { ...state.mpPersonalities };
  let updatedParties = [...state.parties];
  let updatedCommittees = state.committees.map(c => ({ ...c }));
  let updatedGovernment = state.government ? { ...state.government, ministers: [...state.government.ministers] } : null;

  // === NPC 议员生死检查 ===
  for (const [key, mp] of Object.entries(state.mpPersonalities)) {
    // 跳过已死亡的
    if (mp.deceased) continue;

    const death = checkDeath(mp, state.turn);
    if (!death) continue;

    deathEvents.push(death);

    // 标记死亡
    updatedPersonalities[key] = {
      ...updatedPersonalities[key],
      deceased: true,
      deathCause: death.cause,
      deathTurn: state.turn,
    };

    // 处理职位递补
    const replacementResult = handleDeath(
      death,
      updatedPersonalities,
      updatedParties,
      updatedCommittees,
      updatedGovernment,
    );

    updatedParties = replacementResult.updatedParties;
    updatedCommittees = replacementResult.updatedCommittees;
    updatedGovernment = replacementResult.updatedGovernment;
    if (replacementResult.updatedPersonalities) {
      updatedPersonalities = replacementResult.updatedPersonalities;
    }

    // 生成政治事件通知
    const party = updatedParties.find(p => p.id === death.partyId);
    const partyName = party?.name ?? '未知党派';

    politicalEvents.push(createDeathEvent(death, partyName, state.turn));
  }

  // === 玩家生死检查 ===
  let isPlayerDead = state.isPlayerDead ?? false;
  let playerDeathCause: DeathCause | undefined = undefined;
  let playerHealth = state.playerHealth ?? 85;
  let playerStress = state.playerStress ?? 15;

  if (!isPlayerDead && state.playerConfig) {
    // 更新玩家健康/压力
    const healthUpdate = updatePlayerHealth(state, playerHealth, playerStress);
    playerHealth = healthUpdate.health;
    playerStress = healthUpdate.stress;

    // 检测玩家死亡
    const playerDeath = checkPlayerDeath(state, playerHealth, playerStress);
    if (playerDeath) {
      isPlayerDead = true;
      playerDeathCause = playerDeath;

      // 生成玩家死亡游戏结束事件
      const playerName = `${state.playerConfig.lastName} ${state.playerConfig.firstName}`;
      const party = updatedParties.find(p => p.id === state.playerConfig!.partyId);
      const partyName = party?.name ?? '未知党派';

      politicalEvents.unshift(createPlayerDeathEvent(
        playerName,
        state.playerConfig.age,
        partyName,
        playerDeath,
        state.turn,
      ));
    }
  }

  return {
    updatedPersonalities,
    deathEvents,
    politicalEvents,
    updatedParties,
    updatedCommittees,
    updatedGovernment,
    isPlayerDead,
    playerDeathCause,
    updatedPlayerHealth: playerHealth,
    updatedPlayerStress: playerStress,
  };
}

/**
 * 检测单个议员是否死亡
 *
 * 返回 DeathEvent 或 null。所有概率基于 seededRandom 确定性。
 */
export function checkDeath(mp: MPPersonality, turn: number): DeathEvent | null {
  const seed = seedFromName(mp.id) + turn * 997;
  const rng = seededRandom(seed);
  const roll = rng();

  // 1. health <= 0 → illness 死亡（100%）
  if (mp.health <= 0) {
    return {
      mpKey: mp.id,
      mpName: mp.personName,
      partyId: mp.partyId,
      cause: 'illness',
      age: mp.age,
    };
  }

  // 2. age > 80 AND health < 15 → old_age（40%）
  if (mp.age > 80 && mp.health < 15 && roll < 0.40) {
    return {
      mpKey: mp.id,
      mpName: mp.personName,
      partyId: mp.partyId,
      cause: 'old_age',
      age: mp.age,
    };
  }

  // 3. age > 75 AND health < 25 → old_age（15%）
  if (mp.age > 75 && mp.health < 25 && roll < 0.15) {
    return {
      mpKey: mp.id,
      mpName: mp.personName,
      partyId: mp.partyId,
      cause: 'old_age',
      age: mp.age,
    };
  }

  // 4. age > 70 AND health < 10 → old_age（25%）
  if (mp.age > 70 && mp.health < 10 && roll < 0.25) {
    return {
      mpKey: mp.id,
      mpName: mp.personName,
      partyId: mp.partyId,
      cause: 'old_age',
      age: mp.age,
    };
  }

  // 5. stress > 95 AND health < 15 → suicide（20%）
  if (mp.stress > 95 && mp.health < 15 && roll < 0.20) {
    return {
      mpKey: mp.id,
      mpName: mp.personName,
      partyId: mp.partyId,
      cause: 'suicide',
      age: mp.age,
    };
  }

  // 6. 通用随机意外：0.05% 概率
  if (roll < 0.0005) {
    return {
      mpKey: mp.id,
      mpName: mp.personName,
      partyId: mp.partyId,
      cause: 'accident',
      age: mp.age,
    };
  }

  return null;
}

/**
 * 处理死亡后的职位递补
 *
 * 1. 如果是党首 → 党首替换（从 members[0] 继任）
 * 2. 如果是大臣 → 从同党 roster 选替换
 * 3. 如果是委员长 → 从委员会成员中选替换
 * 4. 从所有委员会成员列表中移除死亡议员
 */
export function handleDeath(
  death: DeathEvent,
  personalities: Record<string, MPPersonality>,
  parties: Party[],
  committees: Committee[],
  government: Government | null,
): {
  updatedParties: Party[];
  updatedCommittees: Committee[];
  updatedGovernment: Government | null;
  updatedPersonalities?: Record<string, MPPersonality>;
} {
  let updatedParties = parties.map(p => ({ ...p }));
  let updatedCommittees = committees.map(c => ({
    ...c,
    members: [...c.members],
  }));
  let updatedGovernment = government;
  let updatedPersonalities = { ...personalities };

  const deadKey = death.mpKey;
  const deadName = death.mpName;
  const deadPartyId = death.partyId;

  // === 1. 党首替换 ===
  const party = updatedParties.find(p => p.id === deadPartyId);
  if (party && party.leader === deadName) {
    // 从 members 中找到第一个非死亡成员继任
    const successor = party.members.find(memberName => {
      const memberKey = `${deadPartyId}:${memberName}`;
      const memberMp = updatedPersonalities[memberKey];
      return memberMp && !memberMp.deceased;
    });

    if (successor) {
      party.leader = successor;
      // 更新继任者的人格标记
      const successorKey = `${deadPartyId}:${successor}`;
      if (updatedPersonalities[successorKey]) {
        updatedPersonalities[successorKey] = {
          ...updatedPersonalities[successorKey],
          isLeader: true,
        };
      }
      death.replacement = successor;
    }
  }

  // === 2. 大臣替换 ===
  if (updatedGovernment) {
    const deadMinister = updatedGovernment.ministers.find(m => m.personName === deadName);
    if (deadMinister) {
      // 从同党议员中找一个非死亡的替代
      const replacement = findReplacementFromParty(
        deadPartyId,
        deadName,
        updatedPersonalities,
        updatedGovernment,
      );

      if (replacement) {
        updatedGovernment = {
          ...updatedGovernment,
          ministers: updatedGovernment.ministers.map(m =>
            m.personName === deadName
              ? { ...m, personName: replacement }
              : m,
          ),
        };
        // 更新替代者的人格标记
        const replacementKey = `${deadPartyId}:${replacement}`;
        if (updatedPersonalities[replacementKey]) {
          updatedPersonalities[replacementKey] = {
            ...updatedPersonalities[replacementKey],
            isMinister: true,
          };
        }
        death.replacement = replacement;
      }
    }
  }

  // === 3. 委员长/副委员长替换 ===
  for (const committee of updatedCommittees) {
    if (committee.chairman.personName === deadName) {
      const newChair = findCommitteeReplacement(committee, deadName, updatedPersonalities);
      if (newChair) {
        committee.chairman = newChair;
        const newChairKey = `${newChair.partyId}:${newChair.personName}`;
        if (updatedPersonalities[newChairKey]) {
          updatedPersonalities[newChairKey] = {
            ...updatedPersonalities[newChairKey],
            isCommitteeChairman: true,
          };
        }
        death.replacement = death.replacement ?? newChair.personName;
      }
    }

    if (committee.viceChairman.personName === deadName) {
      const newVice = findCommitteeReplacement(committee, deadName, updatedPersonalities);
      if (newVice) {
        committee.viceChairman = newVice;
      }
    }

    // === 4. 从委员会成员列表中移除死亡议员 ===
    committee.members = committee.members.filter(m => m.personName !== deadName);
    committee.presentMembers = committee.presentMembers.filter(n => n !== deadName);
  }

  return {
    updatedParties,
    updatedCommittees,
    updatedGovernment,
    updatedPersonalities,
  };
}

/**
 * 从同党议员中找一个非死亡的替代（排除已担任大臣的）
 */
function findReplacementFromParty(
  partyId: string,
  deadName: string,
  personalities: Record<string, MPPersonality>,
  government: Government | null,
): string | null {
  const ministerNames = new Set(government?.ministers.map(m => m.personName) ?? []);

  for (const [key, mp] of Object.entries(personalities)) {
    if (mp.partyId !== partyId) continue;
    if (mp.deceased) continue;
    if (mp.personName === deadName) continue;
    if (ministerNames.has(mp.personName)) continue;
    if (mp.isLeader) continue;
    // 选一个健康的、有能力的替代
    if (mp.health > 20) return mp.personName;
  }

  // 退而求其次：任何非死亡的
  for (const [key, mp] of Object.entries(personalities)) {
    if (mp.partyId !== partyId) continue;
    if (mp.deceased) continue;
    if (mp.personName === deadName) continue;
    return mp.personName;
  }

  return null;
}

/**
 * 从委员会成员中找一个替换委员长/副委员长
 */
function findCommitteeReplacement(
  committee: Committee,
  deadName: string,
  personalities: Record<string, MPPersonality>,
): CommitteeMember | null {
  for (const member of committee.members) {
    if (member.personName === deadName) continue;
    const key = `${member.partyId}:${member.personName}`;
    const mp = personalities[key];
    if (mp && !mp.deceased && mp.health > 20) {
      return { ...member };
    }
  }
  // 退而求其次
  for (const member of committee.members) {
    if (member.personName === deadName) continue;
    const key = `${member.partyId}:${member.personName}`;
    const mp = personalities[key];
    if (mp && !mp.deceased) {
      return { ...member };
    }
  }
  return null;
}

/**
 * 创建死亡通知政治事件
 */
function createDeathEvent(death: DeathEvent, partyName: string, turn: number): PoliticalEvent {
  const narrative = DEATH_NARRATIVES[death.cause](death.mpName, death.age, partyName);
  const causeLabel = CAUSE_LABELS[death.cause];

  return {
    id: `death_${death.mpKey}_${turn}`,
    title: `讣告：${death.mpName}`,
    summary: `${death.age}岁的${partyName}议员${death.mpName}因${causeLabel}去世。`,
    dialogs: [
      {
        speaker: null,
        text: narrative,
      },
      ...(death.replacement
        ? [{
            speaker: null as string | null,
            text: `${death.replacement}将接替${death.mpName}的职位。`,
          }]
        : []),
    ],
    choices: [
      {
        id: 'acknowledge',
        text: '默哀',
        effects: {},
      },
    ],
    severity: death.cause === 'accident' ? 4 : 3,
    intentType: 'mp_death',
  };
}

// ===== 玩家生死系统 =====

/**
 * 更新玩家健康和压力
 *
 * 基于与 NPC 类似的规则：党派支持率、回合进度、年龄等影响。
 */
function updatePlayerHealth(
  state: GameState,
  currentHealth: number,
  currentStress: number,
): { health: number; stress: number } {
  let stressDelta = 0;
  let healthDelta = 0;

  // 党派支持率下降 → 压力增加
  const party = state.parties.find(p => p.id === state.playerConfig?.partyId);
  if (party) {
    const trend = party.currentSupport - party.baseSupport;
    if (trend < -5) stressDelta += 5;
    else if (trend > 5) stressDelta -= 2;
  }

  // 后期回合压力增加
  if (state.turn > 36) stressDelta += 1;

  // 压力自然衰减
  stressDelta -= 2;

  // 健康受压力影响
  if (currentStress > 80) healthDelta -= 2;
  else if (currentStress < 30) healthDelta += 1;

  // 衰老健康损失
  if (state.playerConfig) {
    // 每 12 回合（1 年）增加年龄，但这里用当前回合计算实际年龄
    const effectiveAge = state.playerConfig.age + Math.floor(state.turn / 12);
    if (effectiveAge > 80) {
      healthDelta -= 4;
    } else if (effectiveAge > 75) {
      healthDelta -= 2;
    }
  }

  return {
    health: clamp(currentHealth + healthDelta),
    stress: clamp(currentStress + stressDelta),
  };
}

/**
 * 检测玩家是否死亡
 *
 * 使用与 NPC 相同的规则表，但概率略低（玩家有主角光环）。
 */
function checkPlayerDeath(
  state: GameState,
  playerHealth: number,
  playerStress: number,
): DeathCause | null {
  if (!state.playerConfig) return null;

  const age = state.playerConfig.age + Math.floor(state.turn / 12);
  const seed = seedFromName(`player_${state.playerConfig.lastName}${state.playerConfig.firstName}`) + state.turn * 997;
  const rng = seededRandom(seed);
  const roll = rng();

  // health <= 0 → illness（100%）
  if (playerHealth <= 0) return 'illness';

  // age > 80 AND health < 15 → old_age（40%）
  if (age > 80 && playerHealth < 15 && roll < 0.40) return 'old_age';

  // age > 75 AND health < 25 → old_age（15%）
  if (age > 75 && playerHealth < 25 && roll < 0.15) return 'old_age';

  // age > 70 AND health < 10 → old_age（25%）
  if (age > 70 && playerHealth < 10 && roll < 0.25) return 'old_age';

  // stress > 95 AND health < 15 → suicide（20%）
  if (playerStress > 95 && playerHealth < 15 && roll < 0.20) return 'suicide';

  // 通用随机意外：0.05% 概率
  if (roll < 0.0005) return 'accident';

  return null;
}

/**
 * 创建玩家死亡游戏结束事件
 */
function createPlayerDeathEvent(
  playerName: string,
  baseAge: number,
  partyName: string,
  cause: DeathCause,
  turn: number,
): PoliticalEvent {
  const effectiveAge = baseAge + Math.floor(turn / 12);
  const causeLabel = CAUSE_LABELS[cause];
  const narrative = DEATH_NARRATIVES[cause](playerName, effectiveAge, partyName);

  return {
    id: `player_death_${turn}`,
    title: '游戏结束 — 你的政治生涯落幕了',
    summary: `${effectiveAge}岁的${partyName}议员${playerName}因${causeLabel}去世。你的政治生涯就此画上句号。`,
    dialogs: [
      {
        speaker: null,
        text: narrative,
      },
      {
        speaker: null,
        text: `在第${turn}回合，你的人生旅程走到了终点。${partyName}失去了一位议员，国会中少了一个声音。`,
      },
      {
        speaker: null,
        text: '历史会记住你留下的政治遗产——或者不会。这就是权力的游戏。',
      },
    ],
    choices: [
      {
        id: 'game_over',
        text: '结束游戏',
        effects: {},
      },
    ],
    severity: 5,
    intentType: 'player_death',
  };
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}
