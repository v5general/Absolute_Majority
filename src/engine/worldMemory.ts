/**
 * World Memory — 跨回合世界状态记忆
 *
 * 解决 LLM 推演游戏的核心瓶颈：跨回合一致性漂移。
 *
 * ActiveEvent.conversationHistory 只在单事件内累积，事件结束后历史就丢。
 * WorldMemory 是跨事件的长期记忆，每次事件生成前注入到 LLM prompt，
 * 事件结束后根据玩家选择更新。
 *
 * 核心三段式：
 *   1. 事件生成前：renderMemoryForPrompt() 注入到 LLM prompt
 *   2. LLM 生成事件
 *   3. 玩家做出选择后：updateMemoryOnEvent() 累积到 memory
 *
 * 设计原则：
 *   - 纯函数 + 不可变更新（每次返回新对象）
 *   - 0 副作用，不依赖 React/DOM/localStorage
 *   - 序列化友好（可直接 JSON.stringify 存档）
 *   - 渐进式：未启用时返回空快照，narrativeEngine 可无缝降级
 */

import type {
  GameState,
  PoliticalEvent,
  EventChoice,
  ChoiceEffect,
} from '../types';

// ============================================================================
// 数据结构
// ============================================================================

/** 玩家声誉画像（-100 ~ +100，0 = 中性） */
export interface PlayerReputation {
  /** 诚信：承诺兑现为正，违约为负 */
  honor: number;
  /** 激进/温和：激进取正，温和取负 */
  radicalism: number;
  /** 党派忠诚：跟党走为正，倒戈为负 */
  loyalty: number;
  /** 能力评价：施政有效为正，失职为负 */
  competence: number;
}

/** 玩家承诺记录 */
export interface PlayerPromise {
  id: string;
  /** 一句话承诺描述 */
  description: string;
  /** 承诺回合 */
  madeAt: number;
  /** 承诺对象（NPC key 或 partyId） */
  to: string;
  /** 兑现状态：null = 未到兑现期，true = 已兑现，false = 已违背 */
  kept: boolean | null;
  /** 兑现/违背回合 */
  resolvedTurn?: number;
}

/** 玩家丑闻 / 把柄 */
export interface PlayerScandal {
  id: string;
  description: string;
  /** 严重度 1-5 */
  severity: number;
  /** 发生回合 */
  turn: number;
  /** 是否已被公开（公开后才能被对手利用） */
  exposed: boolean;
  exposedAtTurn?: number;
}

/** 玩家档案（累积画像） */
export interface PlayerMemory {
  reputation: PlayerReputation;
  promises: PlayerPromise[];
  scandals: PlayerScandal[];
  /** 盟友 NPC keys（"partyId:personName"） */
  allies: string[];
  /** 对手 NPC keys */
  rivals: string[];
  /** 玩家当前所属的故事线标签（让 LLM 知道玩家走的是哪条路线） */
  arcs: PlayerArc[];
}

/** 玩家故事线（让 LLM 知道玩家是什么样的政客） */
export interface PlayerArc {
  /** 标签：reformist/conservative/maverick/populist/backroom_dealer/ideologue 等 */
  type: string;
  startedTurn: number;
  /** 累积强度 0-100，超过阈值后 LLM 应明确呼应这条故事线 */
  strength: number;
  active: boolean;
}

/** NPC 对玩家的关系 */
export interface NPCRelationship {
  /** NPC key："partyId:personName" */
  npcKey: string;
  /** 关系类型 */
  relationship: 'ally' | 'rival' | 'mentor' | 'protege' | 'neutral';
  /** -100 ~ +100 */
  score: number;
  /** 关键事件摘要（最近 3-5 条，每条一句话） */
  keyEvents: string[];
  lastInteractionTurn: number;
}

/** 重大事件时间线条目（只保留最重要的） */
export interface MajorEventEntry {
  turn: number;
  /** 一句话摘要，例 "T5: 揭露民自党献金丑闻，党首被迫辞职" */
  summary: string;
  significance: 'critical' | 'major' | 'notable';
  /** 标签：['scandal', 'election', 'coalition', 'bill', 'no_confidence', ...] */
  tags: string[];
}

/** 未解决的伏笔 */
export interface OpenThread {
  id: string;
  description: string;
  startedTurn: number;
  urgency: 'low' | 'medium' | 'high';
  /** 已解决回合（undefined = 仍未解决） */
  resolvedTurn?: number;
}

/** 完整的世界状态记忆 */
export interface WorldMemory {
  /** 数据结构版本（用于存档兼容性） */
  version: number;
  /** 最后更新的回合 */
  lastUpdatedTurn: number;
  /** 玩家档案 */
  player: PlayerMemory;
  /** NPC 对玩家的关系（按 NPC key 索引） */
  npcRelationships: NPCRelationship[];
  /** 重大事件时间线（按回合排序，最多保留 30 条） */
  majorEvents: MajorEventEntry[];
  /** 未解决的伏笔 */
  openThreads: OpenThread[];
}

// ============================================================================
// 常量
// ============================================================================

const MEMORY_VERSION = 1;

/** 时间线上限（FIFO，超过则丢掉最老的 notable 级别） */
const MAX_MAJOR_EVENTS = 30;

/** 未解决伏笔上限 */
const MAX_OPEN_THREADS = 12;

/** 单 NPC 关键事件上限 */
const MAX_NPC_KEY_EVENTS = 5;

/** 声誉变化步长（每次事件调整幅度） */
const REPUTATION_STEP = 8;

/** 故事线强度阈值：超过则 LLM 应明确呼应 */
const ARC_STRENGTH_THRESHOLD = 40;

/** 触发故事线的累积行为次数 */
const ARC_TRIGGER_COUNT = 3;

// ============================================================================
// 创建与初始化
// ============================================================================

/** 创建空白 WorldMemory（游戏开始时用） */
export function createInitialMemory(): WorldMemory {
  return {
    version: MEMORY_VERSION,
    lastUpdatedTurn: 0,
    player: {
      reputation: {
        honor: 0,
        radicalism: 0,
        loyalty: 0,
        competence: 0,
      },
      promises: [],
      scandals: [],
      allies: [],
      rivals: [],
      arcs: [],
    },
    npcRelationships: [],
    majorEvents: [],
    openThreads: [],
  };
}

// ============================================================================
// 渲染为 LLM prompt 字符串
// ============================================================================

/**
 * 将 WorldMemory 渲染为可注入到 LLM prompt 的字符串。
 *
 * 设计：
 *   - 紧凑（不浪费 token）
 *   - 按重要性过滤（只暴露 LLM 当前应该知道的事）
 *   - 顺序：声誉 → 故事线 → NPC 关系 → 近期大事 → 未解决伏笔
 *   - null/undefined 安全：旧存档或游戏初期会传 null，直接返回空字符串
 *
 * @param memory WorldMemory（可为 null/undefined）
 * @param state  当前 GameState（用于查 NPC 名字、玩家身份）
 * @param turn   当前回合（用于过滤过期信息）
 * @returns      渲染后的字符串块；空 memory 返回空字符串
 */
export function renderMemoryForPrompt(
  memory: WorldMemory | null | undefined,
  state: GameState,
  turn: number,
): string {
  if (!memory || memory.lastUpdatedTurn === 0) {
    return '';
  }

  const sections: string[] = [];

  // --- 1. 玩家声誉画像 ---
  const rep = memory.player.reputation;
  const repHasData = rep.honor !== 0 || rep.radicalism !== 0 || rep.loyalty !== 0 || rep.competence !== 0;
  if (repHasData) {
    sections.push(`=== 玩家历史画像（基于过往行为累积） ===
诚信: ${formatScore(rep.honor)} | ${describeHonor(rep.honor)}
激进度: ${formatScore(rep.radicalism)} | ${describeRadicalism(rep.radicalism)}
党派忠诚: ${formatScore(rep.loyalty)} | ${describeLoyalty(rep.loyalty)}
能力评价: ${formatScore(rep.competence)} | ${describeCompetence(rep.competence)}`);
  }

  // --- 2. 活跃故事线 ---
  const activeArcs = memory.player.arcs.filter(a => a.active && a.strength >= ARC_STRENGTH_THRESHOLD);
  if (activeArcs.length > 0) {
    sections.push(`=== 玩家当前政治路线（必须在剧情中呼应） ===
${activeArcs.map(a => `- ${describeArc(a.type)}（强度 ${a.strength}/100，始于 T${a.startedTurn}）`).join('\n')}

→ 玩家已经被塑造成这种类型的政客，新事件的角色评价、媒体描述、对手攻讦应保持一致。`);
  }

  // --- 3. 关键 NPC 关系 ---
  const recentNPCs = memory.npcRelationships
    .filter(r => turn - r.lastInteractionTurn <= 12) // 最近 12 回合有互动
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 8); // 最多 8 个最显著的
  if (recentNPCs.length > 0) {
    sections.push(`=== 玩家与关键 NPC 的过往关系 ===
${recentNPCs.map(r => {
  const npcName = resolveNPCName(r.npcKey, state);
  const recentEvent = r.keyEvents[r.keyEvents.length - 1];
  return `- ${npcName}：${describeRelation(r.relationship)}（${formatScore(r.score)}）${recentEvent ? `；最近：${recentEvent}` : ''}`;
}).join('\n')}

→ 这些 NPC 出场时必须延续既有关系设定，不能凭空变成陌生人。`);
  }

  // --- 4. 近期重大事件时间线 ---
  const recentMajor = memory.majorEvents
    .filter(e => turn - e.turn <= 24) // 最近 24 回合（2 年）
    .slice(-10); // 最近 10 条
  if (recentMajor.length > 0) {
    sections.push(`=== 近期重大事件（剧情应可引用） ===
${recentMajor.map(e => `- T${e.turn}: ${e.summary} [${e.significance}]`).join('\n')}

→ 这些是已发生的事，NPC 和媒体可以回忆、引用、利用它们。不能假装没发生。`);
  }

  // --- 5. 未解决的伏笔 ---
  const activeThreads = memory.openThreads.filter(t => t.resolvedTurn === undefined);
  if (activeThreads.length > 0) {
    const sorted = [...activeThreads].sort((a, b) => {
      const urgencyRank = { high: 0, medium: 1, low: 2 };
      return urgencyRank[a.urgency] - urgencyRank[b.urgency];
    }).slice(0, 5);
    sections.push(`=== 未解决的伏笔（应在合适时机回收） ===
${sorted.map(t => `- [${t.urgency.toUpperCase()}] T${t.startedTurn} 至今: ${t.description}`).join('\n')}

→ 这些是悬而未决的政治线，当剧情自然涉及时应推进或回收。`);
  }

  // --- 6. 未兑现的承诺 ---
  const openPromises = memory.player.promises.filter(p => p.kept === null);
  if (openPromises.length > 0) {
    sections.push(`=== 玩家未兑现的承诺 ===
${openPromises.slice(0, 5).map(p => `- T${p.madeAt} 对 ${resolveTargetName(p.to, state)}: "${p.description}"`).join('\n')}

→ 兑现期临近时相关 NPC 可催促；违背后关系恶化。`);
  }

  // --- 7. 已被公开的丑闻 ---
  const exposedScandals = memory.player.scandals.filter(s => s.exposed);
  if (exposedScandals.length > 0) {
    sections.push(`=== 玩家已被公开的把柄 ===
${exposedScandals.map(s => `- T${s.turn}${s.exposedAtTurn ? `（T${s.exposedAtTurn}曝光）` : ''}: ${s.description} [严重度 ${s.severity}]`).join('\n')}

→ 对手可以在合适时机重提这些丑闻攻击玩家；媒体可深挖；盟友可能因此疏远。`);
  }

  if (sections.length === 0) return '';

  return `\n\n=== 世界记忆（你必须延续以下设定） ===
${sections.join('\n\n')}

=== 世界记忆结束 ===
记住：以上是你必须延续的剧情基础，不是建议。违反世界记忆等于剧情崩坏。`;
}

// ============================================================================
// 事件结束后更新 memory
// ============================================================================

/**
 * 玩家做完选择后，把这次事件的影响累积到 memory。
 *
 * 调用时机：
 *   - 玩家点了选项 / 提交了自由文本
 *   - effects 已经被 rulesEngine 结算（这里不重复结算数值，只更新记忆）
 *
 * @param memory    当前 memory（不会被修改）
 * @param state     结算后的 GameState（用于解析 NPC 名）
 * @param event     本次事件
 * @param choice    玩家的选择
 * @returns         新的 memory（不可变更新）
 */
export function updateMemoryOnEvent(
  memory: WorldMemory,
  state: GameState,
  event: PoliticalEvent,
  choice: EventChoice,
): WorldMemory {
  const turn = state.turn;
  const next: WorldMemory = {
    ...memory,
    lastUpdatedTurn: turn,
    player: { ...memory.player },
  };

  // --- 1. 累积声誉 ---
  const effects = choice.effects ?? {};
  next.player.reputation = applyEffectsToReputation(
    memory.player.reputation,
    effects,
    event,
    choice,
  );

  // --- 2. 派生故事线（累积到阈值则激活） ---
  next.player.arcs = updateArcs(memory.player.arcs, event, choice, turn);

  // --- 3. 处理 sourceParty 的 NPC 关系 ---
  // 事件通常有一个 sourceParty（发起方），更新该党党首与玩家的关系
  if (event.sourceParty) {
    next.npcRelationships = updatePartyLeaderRelationship(
      memory.npcRelationships,
      state,
      event.sourceParty,
      effects,
      event.title,
      turn,
    );
  }

  // --- 4. 重大事件入时间线 ---
  if (event.severity >= 4) {
    next.majorEvents = appendMajorEvent(
      memory.majorEvents,
      {
        turn,
        summary: `${event.title} — 玩家${describeChoiceStance(choice)}`,
        significance: event.severity >= 5 ? 'critical' : 'major',
        tags: deriveEventTags(event, effects),
      },
    );
  }

  // --- 5. 从 effect 派生伏笔（如显著的关系恶化） ---
  next.openThreads = deriveThreadsFromEffects(
    memory.openThreads,
    effects,
    event,
    state,
    turn,
  );

  return next;
}

// ============================================================================
// 时间衰减（每回合调用一次，让旧记忆淡化）
// ============================================================================

/**
 * 每回合开始时调用，让旧记忆自然淡化。
 * 不删除记录，只调整"显著度"（影响 renderMemoryForPrompt 的过滤）。
 */
export function decayMemory(memory: WorldMemory, turn: number): WorldMemory {
  // 当前简化版：不做主动衰减，靠 renderMemoryForPrompt 的时间窗口过滤。
  // 后续可加入：NPC 关系 score 向 0 拉回、过期 promises 自动标记为 broken 等。
  return { ...memory, lastUpdatedTurn: turn };
}

// ============================================================================
// 内部工具函数
// ============================================================================

function formatScore(n: number): string {
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(0)}`;
}

function describeHonor(score: number): string {
  if (score >= 40) return '有口皆碑的诚信';
  if (score >= 15) return '说话算数';
  if (score <= -40) return '不可信任';
  if (score <= -15) return '常出尔反尔';
  return '尚无明显评价';
}

function describeRadicalism(score: number): string {
  if (score >= 40) return '激进派';
  if (score >= 15) return '改革倾向';
  if (score <= -40) return '稳健保守';
  if (score <= -15) return '倾向维持现状';
  return '立场温和';
}

function describeLoyalty(score: number): string {
  if (score >= 40) return '党机器忠臣';
  if (score >= 15) return '跟党走';
  if (score <= -40) return '随时倒戈';
  if (score <= -15) return '游离分子';
  return '党性一般';
}

function describeCompetence(score: number): string {
  if (score >= 40) return '公认能干';
  if (score >= 15) return '办事得力';
  if (score <= -40) return '屡出昏招';
  if (score <= -15) return '能力存疑';
  return '中规中矩';
}

function describeArc(type: string): string {
  const map: Record<string, string> = {
    reformist: '改革先锋',
    conservative: '保守派',
    maverick: '独行侠',
    populist: '民粹煽动者',
    backroom_dealer: '密室交易者',
    ideologue: '意识形态死忠',
    media_darling: '媒体宠儿',
    scandal_ridden: '丑闻缠身',
    coalition_builder: '联盟缔造者',
    faction_heavy: '派阀操盘手',
  };
  return map[type] ?? type;
}

function describeRelation(r: NPCRelationship['relationship']): string {
  const map: Record<NPCRelationship['relationship'], string> = {
    ally: '盟友',
    rival: '对手',
    mentor: '导师',
    protege: '门生',
    neutral: '一般',
  };
  return map[r];
}

function describeChoiceStance(choice: EventChoice): string {
  const text = choice.text;
  if (text.length <= 12) return `选择"${text}"`;
  return `选择"${text.slice(0, 12)}…"`;
}

/** 解析 NPC key 为可读名字 */
function resolveNPCName(npcKey: string, state: GameState): string {
  const [partyId, personName] = npcKey.split(':');
  const party = state.parties.find(p => p.id === partyId);
  if (party) {
    return `${personName}（${party.abbreviation}）`;
  }
  return personName ?? npcKey;
}

function resolveTargetName(target: string, state: GameState): string {
  // target 可能是 partyId 或 npcKey
  if (target.includes(':')) {
    return resolveNPCName(target, state);
  }
  const party = state.parties.find(p => p.id === target);
  return party?.name ?? target;
}

function applyEffectsToReputation(
  rep: PlayerReputation,
  effects: ChoiceEffect,
  event: PoliticalEvent,
  choice: EventChoice,
): PlayerReputation {
  // 基础值（不可变，后续累加）
  let honor = rep.honor;
  let radicalism = rep.radicalism;
  let loyalty = rep.loyalty;
  let competence = rep.competence;

  // 事件严重度加权：高严重度事件的选择对画像影响更大
  const weight = 0.7 + (event.severity - 1) * 0.15; // severity 1→0.7, 5→1.3

  // 从选项文字与 consequence 简单推断立场（按严重度加权）
  const text = `${choice.text} ${choice.consequence ?? ''}`;
  if (/退党|倒戈|叛|反对本党|脱离/.test(text)) {
    loyalty -= REPUTATION_STEP * 2 * weight;
  }
  if (/改革|激进|颠覆|推翻|重建/.test(text)) {
    radicalism += REPUTATION_STEP * weight;
  }
  if (/维持|保守|现状|稳定|渐进/.test(text)) {
    radicalism -= REPUTATION_STEP * weight;
  }
  if (/承诺|保证|发誓|一定|绝不/.test(text)) {
    // 承诺本身不算 +honor，要看后续是否兑现。这里不动。
  }
  if (/贿赂|收买|黑金|私下交易|献金/.test(text)) {
    honor -= REPUTATION_STEP * weight;
    competence += REPUTATION_STEP / 2 * weight; // 老练但肮脏
  }

  // 从 effect 数值推断
  if (effects.relationDelta) {
    for (const [key, delta] of Object.entries(effects.relationDelta)) {
      const [from] = key.split('>');
      // 如果玩家选择损害自己党派的关系，视为不忠
      if (delta < -10 && from === 'player') {
        loyalty -= REPUTATION_STEP / 2;
      }
    }
  }

  if (effects.metricsDelta?.economicIndex && effects.metricsDelta.economicIndex > 3) {
    competence += REPUTATION_STEP / 2;
  }
  if (effects.metricsDelta?.socialStabilityIndex && effects.metricsDelta.socialStabilityIndex < -5) {
    competence -= REPUTATION_STEP / 2;
  }

  // 事件严重度加权已在上面应用到各分支

  return {
    honor: clamp(honor),
    radicalism: clamp(radicalism),
    loyalty: clamp(loyalty),
    competence: clamp(competence),
  };
}

function clamp(n: number, min = -100, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function updateArcs(
  arcs: PlayerArc[],
  event: PoliticalEvent,
  choice: EventChoice,
  turn: number,
): PlayerArc[] {
  // 从事件 intentType + 选项文字 派生故事线倾向
  const tendencies: string[] = [];
  const text = `${choice.text} ${choice.consequence ?? ''}`;

  if (/改革|激进|颠覆|重建|新政/.test(text) || event.intentType === 'opposition_attack') {
    tendencies.push('reformist');
  }
  if (/维持|保守|现状|稳定|渐进/.test(text)) {
    tendencies.push('conservative');
  }
  if (/独行|独立|个人|单独/.test(text)) {
    tendencies.push('maverick');
  }
  if (/人民|选民|大众|民意/.test(text)) {
    tendencies.push('populist');
  }
  if (/密室|交易|私下|筹码|交换/.test(text)) {
    tendencies.push('backroom_dealer');
  }
  if (/丑闻|献金|贿赂|黑金/.test(text)) {
    tendencies.push('scandal_ridden');
  }

  const result = arcs.map(a => ({ ...a }));
  for (const tend of tendencies) {
    const existing = result.find(a => a.type === tend && a.active);
    if (existing) {
      existing.strength = clamp(existing.strength + 15, 0, 100);
    } else {
      // 检查累积次数（同一倾向是否有历史记录）
      const historicalCount = arcs.filter(a => a.type === tend).length;
      if (historicalCheck(historicalCount)) {
        result.push({
          type: tend,
          startedTurn: turn,
          strength: 20,
          active: true,
        });
      }
    }
  }

  return result;
}

/** 累积达到 ARC_TRIGGER_COUNT 次后激活故事线 */
function historicalCheck(historicalCount: number): boolean {
  return historicalCount + 1 >= ARC_TRIGGER_COUNT;
}

function updatePartyLeaderRelationship(
  relationships: NPCRelationship[],
  state: GameState,
  partyId: string,
  effects: ChoiceEffect,
  eventTitle: string,
  turn: number,
): NPCRelationship[] {
  const party = state.parties.find(p => p.id === partyId);
  if (!party || !party.leader) return relationships;

  const npcKey = `${partyId}:${party.leader}`;
  const existing = relationships.find(r => r.npcKey === npcKey);

  // 计算 score 变化
  let delta = 0;
  if (effects.relationDelta) {
    for (const [key, val] of Object.entries(effects.relationDelta)) {
      if (key.endsWith(`>${partyId}`) || key === `${partyId}>player`) {
        delta += val / 2;
      }
    }
  }
  // 玩家选项对 sourceParty 有支持/反对意图也会影响
  if (effects.supportDelta?.[partyId]) {
    delta += effects.supportDelta[partyId] * 2;
  }

  if (delta === 0 && existing) return relationships;

  const newScore = clamp((existing?.score ?? 0) + delta);
  const newRelationship: NPCRelationship['relationship'] =
    newScore >= 30 ? 'ally' :
    newScore <= -30 ? 'rival' :
    existing?.relationship ?? 'neutral';

  const newEvent = `${eventTitle}（${delta >= 0 ? '+' : ''}${delta.toFixed(0)}）`;
  const keyEvents = [...(existing?.keyEvents ?? []), newEvent].slice(-MAX_NPC_KEY_EVENTS);

  const updated: NPCRelationship = {
    npcKey,
    relationship: newRelationship,
    score: newScore,
    keyEvents,
    lastInteractionTurn: turn,
  };

  if (existing) {
    return relationships.map(r => r.npcKey === npcKey ? updated : r);
  }
  return [...relationships, updated];
}

function appendMajorEvent(
  events: MajorEventEntry[],
  entry: MajorEventEntry,
): MajorEventEntry[] {
  const next = [...events, entry];
  // 超过上限时丢掉最老的 notable
  if (next.length > MAX_MAJOR_EVENTS) {
    const filtered = next.filter(e => e.significance !== 'notable');
    if (filtered.length >= MAX_MAJOR_EVENTS) {
      return filtered.slice(-MAX_MAJOR_EVENTS);
    }
    return next.slice(next.length - MAX_MAJOR_EVENTS);
  }
  return next;
}

function deriveEventTags(
  event: PoliticalEvent,
  effects: ChoiceEffect,
): string[] {
  const tags: string[] = [];
  if (event.intentType) tags.push(event.intentType);
  if (effects.supportDelta) tags.push('support_shift');
  if (effects.relationDelta) tags.push('relation_shift');
  if (effects.fundsDelta) tags.push('funds_shift');
  if (effects.metricsDelta?.economicIndex) tags.push('economic');
  if (effects.metricsDelta?.socialStabilityIndex) tags.push('social');
  return tags;
}

function deriveThreadsFromEffects(
  threads: OpenThread[],
  effects: ChoiceEffect,
  event: PoliticalEvent,
  state: GameState,
  turn: number,
): OpenThread[] {
  const newThreads: OpenThread[] = [];

  // 关系严重恶化 → 派生伏笔
  if (effects.relationDelta) {
    for (const [key, delta] of Object.entries(effects.relationDelta)) {
      if (delta <= -25) {
        const [from, to] = key.split('>');
        const fromName = state.parties.find(p => p.id === from)?.name ?? from;
        const toName = state.parties.find(p => p.id === to)?.name ?? to;
        newThreads.push({
          id: `thread-${turn}-${from}-${to}-${Math.random().toString(36).slice(2, 6)}`,
          description: `${fromName} 与 ${toName} 关系急剧恶化（${event.title}），可能酝酿报复行动`,
          startedTurn: turn,
          urgency: delta <= -40 ? 'high' : 'medium',
        });
      }
    }
  }

  if (newThreads.length === 0) return threads;
  const combined = [...threads, ...newThreads];
  if (combined.length > MAX_OPEN_THREADS) {
    // 丢掉最老的 low urgency
    const sorted = [...combined].sort((a, b) => {
      const urgencyRank = { high: 0, medium: 1, low: 2 };
      return urgencyRank[a.urgency] - urgencyRank[b.urgency];
    });
    return sorted.slice(0, MAX_OPEN_THREADS);
  }
  return combined;
}

// ============================================================================
// 序列化（存档用）
// ============================================================================

export function serializeMemory(memory: WorldMemory): string {
  return JSON.stringify(memory);
}

export function deserializeMemory(json: string): WorldMemory | null {
  try {
    const parsed = JSON.parse(json) as WorldMemory;
    if (parsed.version !== MEMORY_VERSION) {
      // 后续版本可在这里做迁移；当前只有 v1
      console.warn(`WorldMemory version mismatch: ${parsed.version} vs ${MEMORY_VERSION}`);
    }
    return parsed;
  } catch {
    return null;
  }
}

// ============================================================================
// 调试 / 检查
// ============================================================================

/** 返回 memory 的统计摘要（用于调试或 UI 展示） */
export function getMemoryStats(memory: WorldMemory): {
  totalMajorEvents: number;
  activeThreads: number;
  npcTracked: number;
  promisesOpen: number;
  scandalsExposed: number;
  activeArcs: number;
  reputationSnapshot: PlayerReputation;
} {
  return {
    totalMajorEvents: memory.majorEvents.length,
    activeThreads: memory.openThreads.filter(t => t.resolvedTurn === undefined).length,
    npcTracked: memory.npcRelationships.length,
    promisesOpen: memory.player.promises.filter(p => p.kept === null).length,
    scandalsExposed: memory.player.scandals.filter(s => s.exposed).length,
    activeArcs: memory.player.arcs.filter(a => a.active && a.strength >= ARC_STRENGTH_THRESHOLD).length,
    reputationSnapshot: memory.player.reputation,
  };
}
