/**
 * Political Capital Engine — 议员个人政治影响力系统
 *
 * Phase G Q3：Political Capital (0-100) 并存于 funds/funding（党派资金）。
 *
 * 数据流：
 *   - initializeCapital(mp, background) → 创建议员时初始化
 *   - grantCapital(state, mpKey, amount, reason) → 法案通过、成功质询等 Faucet
 *   - spendCapital(state, mpKey, amount, reason) → 争议法案、组阁等 Sink
 *   - getCapitalSuccessRate(state, mpKey) → 政治行动成功率折扣
 *   - advanceCapitalTurn(state) → 每回合自动变化（受 ±15 cap 限制）
 *
 * 规则：
 *   - 范围 0-100，初始 30（按出身浮动：政治世家 +10、工会干部 +5、基层 +8）
 *   - 每回合自动变化上限 ±15
 *   - Faucet：法案通过 +5、成功质询 +3、媒体正面 +2、委员会成绩 +2、派阀支持 +1
 *   - Sink：争议法案 -10、组阁/改组 -20、派系协调 -5、提前解散 -15、修宪 -25
 *   - 不足 20：政治行动成功率 ×0.7
 */

import type { GameState } from '../types';
import type { MPPersonality } from '../types/mp';
import type { MPBackground } from '../types/background';
import { POLITICAL_CAPITAL_RULES } from '../config/gameBalance';

// ============================================================================
// 初始化
// ============================================================================

/**
 * 初始化议员的政治资本。
 *
 * 规则：
 *   - 基础值：mp.politicalCapital 已存在则保留，否则使用 POLITICAL_CAPITAL_RULES.initialValue (30)
 *   - 出身修正（仅在传入 background 时应用）：
 *     - 政治世家（political_family）：+10
 *     - 工会干部（union_cadre）：+5
 *     - 基层活动家 / 工人阶级：+8
 *   - 最终 clamp 到 [0, 100]
 */
export function initializeCapital(mp: MPPersonality, background?: MPBackground): number {
  const base = (mp.politicalCapital !== undefined && mp.politicalCapital !== null)
    ? mp.politicalCapital
    : POLITICAL_CAPITAL_RULES.initialValue;

  let value = base;
  if (background) {
    value += backgroundBonusFromOrigin(background);
  }
  return clampCapital(value);
}

/** 根据 MPBackground 推断出身加成 */
function backgroundBonusFromOrigin(bg: MPBackground): number {
  const bonusMap = POLITICAL_CAPITAL_RULES.backgroundBonus;
  let bonus = 0;

  // 政治世家
  if (bg.familyOrigin === 'political_family') {
    bonus += bonusMap.political_dynasty ?? 0;
  }

  // 工会干部
  if (bg.familyOrigin === 'union_cadre') {
    bonus += bonusMap.union_cadre ?? 0;
  }

  // 基层活动家 或 工人阶级
  if (bg.familyOrigin === 'grassroots_activist' || bg.socialClass === 'working') {
    bonus += bonusMap.grassroots ?? 0;
  }

  return bonus;
}

// ============================================================================
// 增减（grant / spend）
// ============================================================================

export interface CapitalChangeEvent {
  mpKey: string;
  mpName: string;
  delta: number;
  reason: string;
  newCapital: number;
}

/**
 * 给某议员增加政治资本。
 *
 * @param state       当前 GameState（不被修改）
 * @param mpKey       "partyId:personName"
 * @param amount      增加量（正数）
 * @param reason      原因（用于事件日志）
 * @returns           新的 GameState 和变化事件（若应用）
 */
export function grantCapital(
  state: GameState,
  mpKey: string,
  amount: number,
  reason: string,
): { state: GameState; change: CapitalChangeEvent | null } {
  return applyCapitalDelta(state, mpKey, Math.abs(amount), reason);
}

/**
 * 消耗某议员的政治资本。
 *
 * @param state       当前 GameState（不被修改）
 * @param mpKey       "partyId:personName"
 * @param amount      消耗量（正数）
 * @param reason      原因（用于事件日志）
 * @returns           新的 GameState 和变化事件（若应用）
 */
export function spendCapital(
  state: GameState,
  mpKey: string,
  amount: number,
  reason: string,
): { state: GameState; change: CapitalChangeEvent | null } {
  return applyCapitalDelta(state, mpKey, -Math.abs(amount), reason);
}

/** 内部：应用任意方向的 capital delta */
function applyCapitalDelta(
  state: GameState,
  mpKey: string,
  rawDelta: number,
  reason: string,
): { state: GameState; change: CapitalChangeEvent | null } {
  const mp = state.mpPersonalities[mpKey];
  if (!mp) return { state, change: null };

  // 确保已有初值
  const oldCapital = mp.politicalCapital ?? POLITICAL_CAPITAL_RULES.initialValue;
  const newCapital = clampCapital(oldCapital + rawDelta);

  if (newCapital === oldCapital) {
    return { state, change: null };
  }

  const actualDelta = newCapital - oldCapital;
  const newPersonalities = {
    ...state.mpPersonalities,
    [mpKey]: { ...mp, politicalCapital: newCapital },
  };

  return {
    state: { ...state, mpPersonalities: newPersonalities },
    change: {
      mpKey,
      mpName: mp.personName,
      delta: actualDelta,
      reason,
      newCapital,
    },
  };
}

// ============================================================================
// 政治行动成功率折扣
// ============================================================================

/**
 * 计算某议员政治行动的成功率折扣因子。
 *
 * 规则：politicalCapital < 20 时所有政治行动成功率 ×0.7。
 *
 * @returns 0.7（低资本）或 1.0（正常）
 */
export function getCapitalSuccessRate(state: GameState, mpKey: string): number {
  const mp = state.mpPersonalities[mpKey];
  if (!mp) return 1.0;

  const capital = mp.politicalCapital ?? POLITICAL_CAPITAL_RULES.initialValue;
  if (capital < POLITICAL_CAPITAL_RULES.lowCapitalThreshold) {
    return POLITICAL_CAPITAL_RULES.lowCapitalSuccessMultiplier;
  }
  return 1.0;
}

// ============================================================================
// 组阁/改组 discrete sink（Phase G 修复 #4 完整化）
// ============================================================================

/**
 * 应用"组阁/改组"政治资本消耗（-20）。
 *
 * Phase G Q3 discrete sink。当发生内阁改组（minister 名单变化）时，
 * 首相及新任大臣每人 -20 politicalCapital。
 *
 * 此前该 sink 仅在 config 定义、无任何 runtime 触发路径（nextTurn 中无改组流程）。
 * 现作为纯函数导出，供 useGameState 在检测到 minister 名单变化时调用，
 * 亦可被集成测试直接调用以验证经济反应。
 *
 * @param state        当前 GameState（不被修改）
 * @param ministerKeys 受影响议员 MP key 列表（"partyId:personName"）
 * @param amount       消耗量（默认 cabinetFormation = -20）
 * @returns            新的 GameState
 */
export function applyCabinetFormationPenalty(
  state: GameState,
  ministerKeys: string[],
  amount: number = POLITICAL_CAPITAL_RULES.cabinetFormation,
): GameState {
  if (ministerKeys.length === 0) return state;

  const newPersonalities = { ...state.mpPersonalities };
  let changed = false;

  for (const key of ministerKeys) {
    const mp = newPersonalities[key];
    if (!mp) continue;
    const oldValue = mp.politicalCapital ?? POLITICAL_CAPITAL_RULES.initialValue;
    const newValue = Math.max(
      POLITICAL_CAPITAL_RULES.minValue,
      oldValue + amount, // amount 为负数
    );
    if (newValue !== oldValue) {
      newPersonalities[key] = { ...mp, politicalCapital: newValue };
      changed = true;
    }
  }

  return changed ? { ...state, mpPersonalities: newPersonalities } : state;
}

// ============================================================================
// 每回合推进
// ============================================================================

/**
 * 每回合推进所有议员的政治资本。
 *
 * 规则：
 *   - Faucet 自动触发：派阀支持 +1（如属于派阀）
 *   - Sink 自动触发：派系协调 -5（如属于派阀且忠诚度低）
 *   - 单回合总变化上限 ±15（perTurnChangeCap）
 *
 * 注：法案通过、组阁、修宪等离散事件由调用方主动调用 grantCapital/spendCapital。
 */
export function advanceCapitalTurn(state: GameState): GameState {
  let newState = state;
  const changes: CapitalChangeEvent[] = [];

  for (const [mpKey, mp] of Object.entries(state.mpPersonalities)) {
    if (mp.deceased) continue;

    let delta = 0;

    // Faucet：派阀支持 +1（如属于派阀）
    if (mp.factionId) {
      delta += POLITICAL_CAPITAL_RULES.factionBacking;
    }

    // Sink：派系协调 -5（如属于派阀且忠诚度 < 50）
    if (mp.factionId && mp.loyalty < 50) {
      delta += POLITICAL_CAPITAL_RULES.factionCoordination;
    }

    // 应用单回合上限
    delta = Math.max(
      -POLITICAL_CAPITAL_RULES.perTurnChangeCap,
      Math.min(POLITICAL_CAPITAL_RULES.perTurnChangeCap, delta),
    );

    if (delta === 0) continue;

    const result = applyCapitalDelta(newState, mpKey, delta, '每回合自动变化');
    if (result.change) {
      newState = result.state;
      changes.push(result.change);
    }
  }

  // 记录到事件日志（仅在有变化时）
  if (changes.length > 0) {
    newState = {
      ...newState,
      events: [
        ...newState.events,
        ...changes.slice(0, 5).map(c => ({
          id: `capital-turn-${state.turn}-${c.mpKey}`,
          day: state.currentDay,
          title: '政治资本变化',
          description: `${c.mpName}：${c.delta > 0 ? '+' : ''}${c.delta.toFixed(0)} (${c.reason})`,
          impact: {},
        })),
      ],
    };
  }

  return newState;
}

// ============================================================================
// 工具
// ============================================================================

/** 钳制到 [minValue, maxValue] */
function clampCapital(value: number): number {
  return Math.max(
    POLITICAL_CAPITAL_RULES.minValue,
    Math.min(POLITICAL_CAPITAL_RULES.maxValue, value),
  );
}

/** 读取某议员的政治资本（兜底 30） */
export function getCapital(mp: MPPersonality | undefined): number {
  if (!mp) return POLITICAL_CAPITAL_RULES.initialValue;
  return mp.politicalCapital ?? POLITICAL_CAPITAL_RULES.initialValue;
}

/**
 * 批量初始化某 state 中所有议员的政治资本（旧存档迁移用）。
 *
 * 对已有 politicalCapital 的议员保留原值；对缺失的补默认值 + 出身修正。
 */
export function initializeAllCapital(state: GameState): GameState {
  const newPersonalities: Record<string, MPPersonality> = {};
  let changed = false;

  for (const [key, mp] of Object.entries(state.mpPersonalities)) {
    if (mp.politicalCapital === undefined || mp.politicalCapital === null) {
      const capital = initializeCapital(mp, mp.background);
      newPersonalities[key] = { ...mp, politicalCapital: capital };
      changed = true;
    } else {
      newPersonalities[key] = mp;
    }
  }

  return changed ? { ...state, mpPersonalities: newPersonalities } : state;
}
