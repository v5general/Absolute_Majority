/**
 * Drama Engine — 戏剧压力曲线控制器
 *
 * 解决 LLM 推演戏剧性枯竭问题：纯 LLM 推演会收敛到平淡日常。
 * dramaEngine 强制在合适时机触发危机、冷却、major arc。
 *
 * 设计参考 NARRATIVE.md（戏剧规则圣经）。
 *
 * 核心三段式集成（narrativeEngine Phase 6 改造后）：
 *   1. 事件生成前：renderDramaDirective() 注入到 prompt
 *   2. LLM 在 drama 指导下生成事件
 *   3. 事件结束后：updateDramaState() 根据事件 severity 更新曲线
 *
 * 设计原则：
 *   - 纯函数 + 不可变更新
 *   - 0 副作用
 *   - 与 worldMemory 并列存在 GameState.dramaState 可选字段
 */

import type { GameState, PoliticalEvent } from '../types';
import { getMonthFromTurn, getCongressSessionByMonth } from '../config/ruleConfig';

// ============================================================================
// 数据结构
// ============================================================================

/** 戏剧曲线状态 */
export interface DramaState {
  /** 当前紧张度 0-100 */
  tension: number;
  /** 距上次危机事件回合数 */
  turnsSinceCrisis: number;
  /** 当前冷却保护剩余回合（>0 时 tension 不上升） */
  cooldownRemaining: number;
  /** 当前激活的 arc（null = 无活跃 arc） */
  activeArc: ActiveArc | null;
  /** 历史已完成的 arc 记录 */
  completedArcs: CompletedArc[];
  /** 已触发的危机事件总数 */
  crisisCount: number;
}

/** 活跃的 major arc */
export interface ActiveArc {
  /** Arc 类型 ID（见 NARRATIVE.md 第二章） */
  type: ArcType;
  /** 触发回合 */
  startedTurn: number;
  /** 当前处于哪一幕：1=Trigger, 2=Escalation, 3=Resolution */
  act: 1 | 2 | 3;
  /** 该 arc 已发生的关键事件数 */
  eventsTriggered: number;
  /** 预计在第几回合结束（用于节奏控制） */
  expectedEndTurn: number;
}

/** 已完成的 arc 记录 */
export interface CompletedArc {
  type: ArcType;
  startedTurn: number;
  endedTurn: number;
  /** 玩家在 arc 高潮时的选择摘要（一句话） */
  playerChoiceSummary?: string;
}

/** Major Arc 类型 ID（与 NARRATIVE.md 第二章一致） */
export type ArcType =
  | 'election_earthquake'
  | 'coalition_collapse'
  | 'no_confidence_storm'
  | 'faction_revolt'
  | 'scandal_eruption'
  | 'constitutional_gambit'
  | 'dissolution_crisis'
  | 'prime_minister_fall'
  | 'backroom_empire'
  | 'media_war'
  | 'reform_crusade'
  | 'succession_drama';

// ============================================================================
// 常量（来自 NARRATIVE.md）
// ============================================================================

/** 每回合基础 tension 增量 */
const BASE_TENSION_INCREMENT = 5;

/** 危机阈值（超过此值应触发危机事件） */
const CRISIS_THRESHOLD = 70;

/** 高潮阈值 */
const CLIMAX_THRESHOLD = 90;

/** 冷却阈值（低于此值进入冷却保护） */
const COOLDOWN_THRESHOLD = 30;

/** 触发危机后进入的 tension 基线 */
const POST_CRISIS_BASELINE = 15;

/** 冷却保护持续回合数 */
const COOLDOWN_DURATION = 3;

/** 高潮封顶后最长持续回合 */
const MAX_CLIMAX_DURATION = 3;

/** Arc 之间最小间隔回合 */
const MIN_ARC_INTERVAL = 5;

/** 每 N 回合必须触发一个 major arc */
const ARC_TRIGGER_PERIOD = 10;

// 会期对 tension 的额外增量（来自 NARRATIVE.md 第七章）
const SESSION_TENSION_BOOST: Record<string, number> = {
  '预算决战期': 3, // 1-3 月：基础 5 + 3 = 8
  '法案攻坚期': 0, // 4-6 月：基础 5
  '选区休会期': -2, // 7-9 月：基础 5 - 2 = 3
  '临时国会期': 1, // 10-12 月：基础 5 + 1 = 6
};

// Arc 触发优先级（来自 NARRATIVE.md 第 2.3 节）
const ARC_PRIORITY: ArcType[] = [
  'no_confidence_storm',
  'coalition_collapse',
  'scandal_eruption',
  'constitutional_gambit',
  'faction_revolt',
  'prime_minister_fall',
  'dissolution_crisis',
  'election_earthquake',
  'media_war',
  'backroom_empire',
  'reform_crusade',
  'succession_drama',
];

// ============================================================================
// 初始化
// ============================================================================

export function createInitialDramaState(): DramaState {
  return {
    tension: 20,
    turnsSinceCrisis: 0,
    cooldownRemaining: 0,
    activeArc: null,
    completedArcs: [],
    crisisCount: 0,
  };
}

// ============================================================================
// 每回合推进
// ============================================================================

/**
 * 每回合开始时调用，推进 drama 曲线。
 *
 * @param drama 当前 drama state（不被修改）
 * @param state 当前 GameState（用于查会期、政府状态等）
 * @returns 新的 drama state
 */
export function advanceDramaTurn(
  drama: DramaState,
  state: GameState,
): DramaState {
  const month = getMonthFromTurn(state.turn);
  const session = getCongressSessionByMonth(month);
  const sessionBoost = SESSION_TENSION_BOOST[session.name] ?? 0;

  let newTension = drama.tension;
  let newCooldown = drama.cooldownRemaining;
  let newTurnsSinceCrisis = drama.turnsSinceCrisis + 1;

  if (newCooldown > 0) {
    // 冷却保护期：tension 不上升，cooldown 递减
    newCooldown -= 1;
  } else {
    // 正常上升
    newTension += BASE_TENSION_INCREMENT + sessionBoost;
    // 高潮封顶
    if (newTension > CLIMAX_THRESHOLD) {
      // 检查是否超过高潮持续上限
      if (drama.activeArc && drama.activeArc.act === 3) {
        const climaxDuration = state.turn - drama.activeArc.expectedEndTurn + MAX_CLIMAX_DURATION;
        if (climaxDuration >= MAX_CLIMAX_DURATION) {
          // 强制结束高潮
          newTension = COOLDOWN_THRESHOLD - 5;
          newCooldown = COOLDOWN_DURATION;
        }
      }
      newTension = Math.min(newTension, 100);
    }
  }

  return {
    ...drama,
    tension: newTension,
    cooldownRemaining: newCooldown,
    turnsSinceCrisis: newTurnsSinceCrisis,
  };
}

// ============================================================================
// Arc 触发判断
// ============================================================================

/**
 * 检查本回合是否应触发 / 推进 major arc。
 *
 * @param drama  当前 drama state
 * @param state  当前 GameState
 * @returns 应推进的 arc 类型；null = 本回合不推进
 */
export function checkArcTrigger(
  drama: DramaState,
  state: GameState,
): ArcType | null {
  // 已有活跃 arc：推进而非触发新的
  if (drama.activeArc) {
    return shouldAdvanceArc(drama, state) ? drama.activeArc.type : null;
  }

  // === Phase G 第十二章：turn-based 强制规则（与选举周期对齐） ===
  // 1. turn >= 44 且 activeArc == null：强制 election_earthquake
  //    （任期届满倒计时 = 0，大选必然发生）
  if (state.turn >= 44 && !drama.completedArcs.some(c => c.type === 'election_earthquake')) {
    return 'election_earthquake';
  }

  // 2. 不信任案通过瞬间：强制 dissolution_crisis
  //    （由 rulesEngine 触发，此处不重复检测；保留钩子）

  // 3. 派阀挑战成功：强制 faction_revolt
  //    （已在 getCandidateArcs 中通过 faction loyalty 检测）

  // tension 极高时直接进入候选评估（绕过 turnsSinceCrisis 检查）
  // 这样高 tension 不会被冷却期推迟
  if (drama.tension >= CRISIS_THRESHOLD) {
    const candidates = getCandidateArcs(state, drama);
    if (candidates.length > 0) {
      for (const priority of ARC_PRIORITY) {
        if (candidates.includes(priority)) return priority;
      }
      return candidates[0];
    }
  }

  // 普通节奏：需要足够冷却期
  if (drama.turnsSinceCrisis < MIN_ARC_INTERVAL) return null;

  // 每 ARC_TRIGGER_PERIOD 回合必须触发一次（强制节奏）
  const forced = drama.crisisCount === 0 ||
    (state.turn - (drama.completedArcs[drama.completedArcs.length - 1]?.endedTurn ?? 0)) >= ARC_TRIGGER_PERIOD;

  if (!forced) return null;

  // 候选 arc 列表
  const candidates = getCandidateArcs(state, drama);
  if (candidates.length === 0) return null;

  // 按优先级选第一个
  for (const priority of ARC_PRIORITY) {
    if (candidates.includes(priority)) {
      return priority;
    }
  }
  return candidates[0];
}

/**
 * 根据当前局势列出可触发的 arc 候选。
 */
function getCandidateArcs(state: GameState, drama: DramaState): ArcType[] {
  const candidates: ArcType[] = [];
  const gov = state.government;

  // constitutional_gambit：执政联盟 ≥ 134
  if (gov) {
    const coalitionSeats = gov.rulingCoalition.reduce((s, pid) => {
      return s + (state.parties.find(p => p.id === pid)?.projectedSeats ?? 0);
    }, 0);
    if (coalitionSeats >= 134) {
      candidates.push('constitutional_gambit');
    }

    // coalition_collapse：执政联盟内有党支持率低
    const unstablePartner = gov.rulingCoalition.some(pid => {
      const p = state.parties.find(x => x.id === pid);
      return p && p.currentSupport < 15;
    });
    if (unstablePartner && gov.rulingCoalition.length >= 2) {
      candidates.push('coalition_collapse');
    }

    // no_confidence_storm：在野党席位接近 101
    const oppositionSeats = state.parties
      .filter(p => !gov.rulingCoalition.includes(p.id))
      .reduce((s, p) => s + p.projectedSeats, 0);
    if (oppositionSeats >= 90) {
      candidates.push('no_confidence_storm');
    }

    // prime_minister_fall：首相所在党支持率低
    const pmParty = state.parties.find(p => p.id === gov.primeMinisterPartyId);
    if (pmParty && pmParty.currentSupport < 20) {
      candidates.push('prime_minister_fall');
    }

    // dissolution_crisis：首相支持率高 + 反对分散
    if (pmParty && pmParty.currentSupport > 45) {
      const oppositionParties = state.parties.filter(p => !gov.rulingCoalition.includes(p.id));
      const maxOpp = Math.max(...oppositionParties.map(p => p.currentSupport), 0);
      if (maxOpp < 25) {
        candidates.push('dissolution_crisis');
      }
    }
  }

  // scandal_eruption：媒体关注度高
  if (state.metrics.mediaAttention > 60) {
    candidates.push('scandal_eruption');
  }

  // faction_revolt：派阀 loyalty 低
  for (const party of state.parties) {
    if (party.factions) {
      const hasRebel = party.factions.some(f => f.loyalty < 40 && f.members.length >= 10);
      if (hasRebel) {
        candidates.push('faction_revolt');
        break;
      }
    }
  }

  // media_war：媒体关注度持续高
  if (state.metrics.mediaAttention > 70) {
    candidates.push('media_war');
  }

  // 兜底：若以上都不满足但 tension 极高，给一个通用 arc
  // 注意：constitutional_gambit 必须严格满足 coalitionSeats >= 134，
  // 不能作为兜底（coalitionSeats 计算依赖 rulingCoalition + projectedSeats，可能与最终统计不同）
  if (candidates.length === 0 && drama.tension >= CRISIS_THRESHOLD) {
    candidates.push('media_war');
  }

  // 防御性：移除任何被错误 push 的 constitutional_gambit（双重校验）
  if (gov) {
    const realCoalitionSeats = gov.rulingCoalition.reduce((s, pid) => {
      return s + (state.parties.find(p => p.id === pid)?.projectedSeats ?? 0);
    }, 0);
    if (realCoalitionSeats < 134) {
      const idx = candidates.indexOf('constitutional_gambit');
      if (idx >= 0) candidates.splice(idx, 1);
    }
  }

  // 去重：避免最近已完成同类型 arc 重复
  const recent = drama.completedArcs.slice(-3).map(c => c.type);
  return candidates.filter(c => !recent.includes(c));
}

function shouldAdvanceArc(drama: DramaState, state: GameState): boolean {
  if (!drama.activeArc) return false;
  // 每 1-2 回合推进一幕
  const arc = drama.activeArc;
  const turnsInAct = state.turn - arc.startedTurn;
  return turnsInAct >= arc.act * 2;
}

// ============================================================================
// 渲染为 LLM prompt 指令
// ============================================================================

/**
 * 生成给 LLM 的戏剧指令字符串，注入到 narrativeEngine 的 prompt。
 *
 * 这是一段"软约束"：LLM 应该遵循，但 narrativeEngine 的 fallback 仍能工作。
 *
 * @param drama 当前 drama state
 * @param state 当前 GameState
 * @returns 戏剧指令字符串块；空则不注入
 */
export function renderDramaDirective(
  drama: DramaState | null | undefined,
  state: GameState,
): string {
  if (!drama) return '';

  const sections: string[] = [];

  // 1. 紧张度档位
  const tier = getTensionTier(drama.tension);
  sections.push(`=== 戏剧节奏指令（必须遵循） ===
当前紧张度: ${drama.tension.toFixed(0)}/100 — ${tier.label}
档位要求: ${tier.directive}
${drama.cooldownRemaining > 0 ? `\n⚠️ 当前处于冷却保护期（剩余 ${drama.cooldownRemaining} 回合）：生成的事件应为日常 / 小博弈级别，禁止生成 Severity ≥ 4 的危机。` : ''}`);

  // 2. 活跃 arc 指令
  if (drama.activeArc) {
    const arc = drama.activeArc;
    const actDirective = getActDirective(arc.type, arc.act);
    sections.push(`=== 活跃故事弧（必须延续） ===
Arc: ${describeArc(arc.type)}（第 ${arc.act} 幕，已 ${arc.eventsTriggered} 个关键事件，预计 T${arc.expectedEndTurn} 结束）
本幕要求: ${actDirective}
→ 玩家已经知道这个 arc 在发生，事件应延续既定方向，不要重新介绍背景。`);
  }

  // 3. 距上次危机
  if (drama.turnsSinceCrisis >= 6 && drama.tension < CRISIS_THRESHOLD) {
    sections.push(`=== 节奏提示 ===
距上次危机已 ${drama.turnsSinceCrisis} 回合，紧张度 ${drama.tension.toFixed(0)}。
如果当前是 Cool-down 或 Buildup 档位，事件应让 tension 自然积累（围绕日常博弈、派阀暗斗、关系建立），避免立刻爆发。`);
  } else if (drama.tension >= CRISIS_THRESHOLD) {
    sections.push(`=== 节奏提示 ===
紧张度已达危机阈值（${drama.tension.toFixed(0)}/${CRISIS_THRESHOLD}）。
本回合事件 **必须** 是 Severity ≥ 4 的危机事件，并尽量触发以下 arc 类型之一：
${getCandidateArcs(state, drama).slice(0, 3).map(a => `- ${describeArc(a)}`).join('\n')}
不要生成日常小事件。`);
  }

  return `\n\n${sections.join('\n\n')}\n=== 戏剧指令结束 ===\n`;
}

function getTensionTier(tension: number): { label: string; directive: string } {
  if (tension < 30) {
    return {
      label: 'Cool-down 喘息期',
      directive: '事件应为选区活动、社交、小博弈、关系建立。禁止危机、丑闻、不信任案。Severity ≤ 2。',
    };
  }
  if (tension < 50) {
    return {
      label: 'Buildup 紧张积累',
      directive: '事件围绕派阀暗斗、媒体试探、政策分歧浮现。Severity 2-3。',
    };
  }
  if (tension < 70) {
    return {
      label: 'Escalation 升级期',
      directive: '事件应包含公开冲突、联盟摩擦、委员会对抗。Severity 3-4。',
    };
  }
  if (tension < 90) {
    return {
      label: 'Crisis 危机期',
      directive: '事件必须 Severity ≥ 4：不信任案、丑闻爆雷、党内逼宫、组阁破裂。',
    };
  }
  return {
    label: 'Climax 高潮期',
    directive: '事件必须 Severity 5：大选、解散、修宪、首相倒台。这是 Arc 的高潮幕。',
  };
}

function getActDirective(type: ArcType, act: 1 | 2 | 3): string {
  if (act === 1) {
    return '第一幕 Trigger：明确引发事件，至少 2 个 NPC 表态，玩家被卷入但未选定立场';
  }
  if (act === 2) {
    return '第二幕 Escalation：阵营对立清晰，玩家必须做关键选择，至少 1 个转折（盟友变对手或反之）';
  }
  return '第三幕 Resolution：政治后果结算，关键 NPC 命运定型，为下一个 arc 埋伏笔';
}

function describeArc(type: ArcType): string {
  const map: Record<ArcType, string> = {
    election_earthquake: '选举地震',
    coalition_collapse: '联盟崩溃',
    no_confidence_storm: '不信任风暴',
    faction_revolt: '派阀逼宫',
    scandal_eruption: '丑闻爆发',
    constitutional_gambit: '修宪赌局',
    dissolution_crisis: '解散危机',
    prime_minister_fall: '首相陨落',
    backroom_empire: '密室帝国',
    media_war: '媒体战争',
    reform_crusade: '改革十字军',
    succession_drama: '世袭戏剧',
  };
  return `${map[type]}（${type}）`;
}

// ============================================================================
// 事件结束后更新
// ============================================================================

/**
 * 玩家做完事件选择后，根据 severity 更新 drama 曲线。
 *
 * @param drama       当前 drama state
 * @param event       本次事件
 * @param turn        当前回合
 * @returns           新的 drama state
 */
export function updateDramaOnEvent(
  drama: DramaState,
  event: PoliticalEvent,
  turn: number,
): DramaState {
  const next: DramaState = { ...drama };

  // 高严重度事件：触发危机后冷却
  if (event.severity >= 4) {
    next.crisisCount += 1;
    next.turnsSinceCrisis = 0;
    next.tension = POST_CRISIS_BASELINE;
    next.cooldownRemaining = COOLDOWN_DURATION;
  } else if (event.severity === 3) {
    // 显著事件：小幅升温
    next.tension = Math.min(100, next.tension + 5);
  } else if (event.severity <= 2) {
    // 小事件：微弱降温（让 Cool-down 真正冷却）
    next.tension = Math.max(0, next.tension - 1);
  }

  // 推进活跃 arc
  if (next.activeArc) {
    next.activeArc = {
      ...next.activeArc,
      eventsTriggered: next.activeArc.eventsTriggered + 1,
    };
    // 自动推进幕
    if (event.severity >= 4) {
      if (next.activeArc.act < 3) {
        next.activeArc.act = (next.activeArc.act + 1) as 1 | 2 | 3;
      } else {
        // 第三幕完成，结束 arc
        next.completedArcs = [
          ...next.completedArcs,
          {
            type: next.activeArc.type,
            startedTurn: next.activeArc.startedTurn,
            endedTurn: turn,
          },
        ];
        next.activeArc = null;
      }
    }
  }

  return next;
}

/**
 * 强制启动一个 arc（管理员 / 测试用）。
 */
export function triggerArc(
  drama: DramaState,
  type: ArcType,
  turn: number,
): DramaState {
  return {
    ...drama,
    tension: Math.max(drama.tension, CRISIS_THRESHOLD),
    activeArc: {
      type,
      startedTurn: turn,
      act: 1,
      eventsTriggered: 0,
      expectedEndTurn: turn + 6,
    },
  };
}

// ============================================================================
// 调试
// ============================================================================

export function getDramaStats(drama: DramaState): {
  tension: number;
  tier: string;
  activeArc: string | null;
  completedArcCount: number;
  crisisCount: number;
  turnsSinceCrisis: number;
} {
  return {
    tension: drama.tension,
    tier: getTensionTier(drama.tension).label,
    activeArc: drama.activeArc ? describeArc(drama.activeArc.type) : null,
    completedArcCount: drama.completedArcs.length,
    crisisCount: drama.crisisCount,
    turnsSinceCrisis: drama.turnsSinceCrisis,
  };
}
