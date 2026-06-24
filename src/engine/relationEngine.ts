/**
 * Relation Engine — NPC 关系网密度平衡（Phase G balance-check）
 *
 * 三大机制：
 *   1. 软上限：每议员最多 4 条"强关系"（score > 60），超出时新关系上限降为 60
 *   2. 衰减：5 回合无互动的关系每回合 -1
 *   3. 防"刷关系"：连续 3 回合对同一 NPC 送礼，第 3 回合效果 ×0.5
 *
 * 注：当前 relations 模型（RelationEntry）不存储 lastInteractionTurn。
 * 为保持向后兼容，本引擎采用简化策略：
 *   - 衰减：所有 score > 60 的关系每回合 -1（视为"自然冷却"）
 *   - 刷关系：在 rulesEngine.applyStrongRelationCap 中处理上限
 *
 * 后续若引入 lastInteractionTurn 字段，可扩展为更精细的衰减逻辑。
 */

import type { GameState, RelationEntry } from '../types';
import { RELATION_CAP } from '../config/gameBalance';

// ============================================================================
// 衰减
// ============================================================================

/**
 * 每回合推进关系衰减。
 *
 * 简化策略：
 *   - 强关系（score > 60）每回合 -1（高关系自然冷却）
 *   - 中等关系（20 < score <= 60）保持不变（稳定区）
 *   - 低关系（score <= 20）保持不变
 *
 * @returns   新的 GameState
 */
export function advanceRelationDecay(state: GameState): GameState {
  let anyChange = false;
  const newRelations = state.relations.map(r => {
    if (r.score > RELATION_CAP.strongRelationScoreThreshold) {
      anyChange = true;
      const newScore = Math.max(
        RELATION_CAP.strongRelationScoreThreshold,
        r.score - RELATION_CAP.decayPerTurn,
      );
      return { ...r, score: newScore };
    }
    return r;
  });

  if (!anyChange) return state;
  return { ...state, relations: newRelations };
}

// ============================================================================
// 软上限检测
// ============================================================================

/**
 * 检查某议员是否已达到"强关系"上限。
 *
 * 上限：strongRelationsPerMP（默认 4）
 * 阈值：strongRelationScoreThreshold（默认 60）
 */
export function isStrongRelationCapped(state: GameState, fromId: string): boolean {
  let strongCount = 0;
  for (const r of state.relations) {
    if (r.from === fromId && r.score > RELATION_CAP.strongRelationScoreThreshold) {
      strongCount++;
    }
  }
  return strongCount >= RELATION_CAP.strongRelationsPerMP;
}

/**
 * 应用软上限到新关系分数。
 *
 * 若 from 已达上限，新关系的初始分数被钳制为 strongRelationScoreThreshold（60）。
 */
export function applyCapToNewRelation(
  state: GameState,
  fromId: string,
  rawScore: number,
): number {
  if (rawScore <= RELATION_CAP.strongRelationScoreThreshold) return rawScore;
  if (!isStrongRelationCapped(state, fromId)) return rawScore;
  return RELATION_CAP.strongRelationScoreThreshold;
}

// ============================================================================
// 防"刷关系"
// ============================================================================

/**
 * 计算防"刷关系"系数。
 *
 * 简化策略：因 relations 未存储连续互动次数，使用关系深度作为代理。
 *   - 已存在 score > 60 的关系：进一步加成效果 ×0.5（边际递减）
 *   - 新关系：×1.0
 *
 * 真正的 grind 检测需要扩展 RelationEntry schema。
 */
export function getGrindFactor(
  state: GameState,
  fromId: string,
  toId: string,
): number {
  const existing = state.relations.find(r => r.from === fromId && r.to === toId);
  if (!existing) return 1.0;
  if (existing.score > RELATION_CAP.strongRelationScoreThreshold) {
    return RELATION_CAP.grindDiminishingFactor;
  }
  return 1.0;
}

// ============================================================================
// 统计工具
// ============================================================================

export interface RelationNetworkStats {
  fromId: string;
  totalRelations: number;
  strongRelations: number;
  weakRelations: number;
  hostileRelations: number;
  capped: boolean;
}

/** 统计某议员的关系网密度（用于 UI / 调试） */
export function getRelationNetworkStats(state: GameState, fromId: string): RelationNetworkStats {
  let totalRelations = 0;
  let strongRelations = 0;
  let weakRelations = 0;
  let hostileRelations = 0;

  for (const r of state.relations) {
    if (r.from !== fromId) continue;
    totalRelations++;
    if (r.score > RELATION_CAP.strongRelationScoreThreshold) strongRelations++;
    else if (r.score < 0) hostileRelations++;
    else weakRelations++;
  }

  return {
    fromId,
    totalRelations,
    strongRelations,
    weakRelations,
    hostileRelations,
    capped: strongRelations >= RELATION_CAP.strongRelationsPerMP,
  };
}
