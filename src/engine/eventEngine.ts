import type { GameState, PoliticalEvent, EventChoice, AIIntent } from '../types';
import { createIntentFromEffects, settleIntents } from './rulesEngine';
import { createInitialMemory, updateMemoryOnEvent, type WorldMemory } from './worldMemory';
import { createInitialDramaState, updateDramaOnEvent, type DramaState } from './dramaEngine';

/**
 * 事件引擎 — 模拟后端逻辑
 * 1. 从事件池中选取下一个事件
 * 2. 将玩家选择的效果转化为 AI 意图
 * 3. 意图通过规则引擎结算后才修改游戏状态
 *
 * 核心约束遵守：
 * - AI 只能提出行动意图（规则 #5）
 * - 不得直接修改议席、支持率或投票结果（规则 #6）
 * - 所有结果由规则引擎计算（规则 #4）
 *
 * worldMemory 集成：传入 event 参数后，applyChoice 会自动把
 * 玩家选择累积到 state.worldMemory，供下次 LLM 推演时注入。
 */

/** 从事件池中随机选取一个事件（模拟后端推送） */
export function pickNextEvent(pool: PoliticalEvent[], exclude?: string[]): PoliticalEvent | null {
  const available = pool.filter((e) => !exclude?.includes(e.id));
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * 将选项效果转化为 AI 意图并结算
 *
 * 不再直接修改 supportDelta / projectedSeats / funds / relations / metrics，
 * 而是通过 createIntentFromEffects 生成意图，再由规则引擎统一结算。
 *
 * @param state   当前游戏状态
 * @param choice  玩家选择的选项
 * @param event   可选：玩家响应的事件本身。传入后会累积到 worldMemory。
 *                不传则不更新记忆（向后兼容旧调用）。
 */
export function applyChoice(
  state: GameState,
  choice: EventChoice,
  event?: PoliticalEvent,
): GameState {
  // 生成 AI 意图（规则 #5：AI 只能提出行动意图）
  const intents: AIIntent[] = createIntentFromEffects(
    `event-choice-${choice.id}`,
    {
      supportDelta: choice.effects.supportDelta,
      relationDelta: choice.effects.relationDelta,
      fundsDelta: choice.effects.fundsDelta,
      metricsDelta: choice.effects.metricsDelta,
    },
    state.turn,
  );

  // 通过规则引擎结算（规则 #4：所有结果由规则引擎计算）
  let newState = settleIntents(state, intents);

  // 记录事件日志
  newState.events.push({
    id: `evt-log-${Date.now()}`,
    day: newState.currentDay,
    title: '玩家决策已执行',
    description: `支持率、关系、大盘数据已通过规则引擎更新`,
    impact: choice.effects.supportDelta ?? {},
  });

  // 累积到 worldMemory（若提供了 event）
  if (event) {
    const prevMemory: WorldMemory = newState.worldMemory ?? createInitialMemory();
    newState.worldMemory = updateMemoryOnEvent(prevMemory, newState, event, choice);

    // 同步推进戏剧曲线（severity ≥ 4 触发危机后冷却，推进 arc 幕）
    const prevDrama: DramaState = newState.dramaState ?? createInitialDramaState();
    newState.dramaState = updateDramaOnEvent(prevDrama, event, newState.turn);
  }

  return newState;
}
