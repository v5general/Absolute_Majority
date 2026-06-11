import type {
  GameState,
  AIIntent,
  RuleValidationResult,
  NoConfidenceMotion,
  CoalitionAgreement,
  CabinetPost,
  Committee,
  CommitteeMember,
  Party,
  RelationEntry,
  ElectionResult,
} from '../types';

/**
 * 规则引擎 — 全局约束校验与核心数值结算
 *
 * 规则引擎核心约束：
 * 1. 不信任案必须满足至少 20 名议员联署
 * 2. 任何委员会表决必须先达到法定人数
 * 3. 任何联盟成立必须签署联盟协议
 * 4. 所有结果由规则引擎计算
 * 5. AI 只能提出行动意图
 * 6. 不得直接修改议席、支持率或投票结果
 */

// ===== 常量 =====

/** 不信任案联署最低门槛 */
export const NO_CONFIDENCE_THRESHOLD = 20;

/** 委员会法定人数比例（超过半数） */
export const QUORUM_RATIO = 0.5;

// ===== 不信任案规则 =====

/**
 * 创建不信任案
 *
 * 规则：至少 20 名议员联署才能成立
 */
export function createNoConfidenceMotion(
  signatories: string[],
  proposingPartyId: string,
  turn: number,
): NoConfidenceMotion {
  return {
    id: `ncm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    signatories,
    proposingPartyId,
    meetsThreshold: signatories.length >= NO_CONFIDENCE_THRESHOLD,
    createdTurn: turn,
    SIGNATURE_THRESHOLD: NO_CONFIDENCE_THRESHOLD,
  };
}

/**
 * 校验不信任案是否可以进入表决
 */
export function validateNoConfidenceMotion(motion: NoConfidenceMotion): RuleValidationResult {
  if (motion.signatories.length < NO_CONFIDENCE_THRESHOLD) {
    return {
      valid: false,
      reason: `联署人数不足：需要 ${NO_CONFIDENCE_THRESHOLD} 人，当前仅 ${motion.signatories.length} 人`,
    };
  }
  return { valid: true };
}

// ===== 委员会法定人数规则 =====

/**
 * 判定委员会是否达到法定人数
 *
 * 规则：到场委员必须超过半数
 */
export function hasQuorum(committee: Committee): boolean {
  const requiredMembers = Math.floor(committee.members.length * QUORUM_RATIO) + 1;
  return committee.presentMembers.length >= requiredMembers;
}

/**
 * 校验委员会表决是否合法
 */
export function validateCommitteeVote(committee: Committee): RuleValidationResult {
  const requiredMembers = Math.floor(committee.members.length * QUORUM_RATIO) + 1;
  if (committee.presentMembers.length < requiredMembers) {
    return {
      valid: false,
      reason: `法定人数不足：需要 ${requiredMembers} 人出席，当前仅 ${committee.presentMembers.length} 人`,
    };
  }
  return { valid: true };
}

/**
 * 初始化委员会出席名单（默认全部出席）
 */
export function initializeCommitteeAttendance(committee: Committee): Committee {
  return {
    ...committee,
    presentMembers: committee.members.map((m) => m.personName),
  };
}

/**
 * 设置委员会出席情况
 */
export function setCommitteeAttendance(
  committee: Committee,
  presentMemberNames: string[],
): Committee {
  // 只允许在成员列表中的名字
  const memberNames = new Set(committee.members.map((m) => m.personName));
  const validPresent = presentMemberNames.filter((n) => memberNames.has(n));
  return { ...committee, presentMembers: validPresent };
}

// ===== 联盟协议规则 =====

/**
 * 创建联盟协议
 *
 * 规则：任何联盟成立必须签署联盟协议
 */
export function createCoalitionAgreement(
  parties: string[],
  cabinetAllocation: { partyId: string; posts: CabinetPost[] }[],
  policyCommitments: string[],
  turn: number,
): CoalitionAgreement {
  return {
    id: `ca-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    parties,
    cabinetAllocation,
    policyCommitments,
    signedTurn: turn,
    signed: true,
  };
}

/**
 * 校验联盟协议是否完整
 */
export function validateCoalitionAgreement(agreement: CoalitionAgreement): RuleValidationResult {
  if (agreement.parties.length < 2) {
    return {
      valid: false,
      reason: '联盟至少需要两个参与方',
    };
  }

  if (!agreement.signed) {
    return {
      valid: false,
      reason: '联盟协议尚未签署',
    };
  }

  // 校验所有参与方都有职位分配
  for (const partyId of agreement.parties) {
    const hasAllocation = agreement.cabinetAllocation.some((a) => a.partyId === partyId);
    if (!hasAllocation) {
      return {
        valid: false,
        reason: `参与方 ${partyId} 在协议中无内阁职位分配`,
      };
    }
  }

  return { valid: true };
}

// ===== AI 意图规则 =====

/**
 * 从事件效果生成 AI 意图（替代直接修改状态）
 *
 * 事件系统调用此函数生成意图，意图再由规则引擎结算
 */
export function createIntentFromEffects(
  source: string,
  effects: {
    supportDelta?: Record<string, number>;
    relationDelta?: Record<string, number>;
    fundsDelta?: Record<string, number>;
    metricsDelta?: Record<string, number>;
  },
  turn: number,
): AIIntent[] {
  const intents: AIIntent[] = [];

  if (effects.supportDelta) {
    intents.push({
      id: `intent-${Date.now()}-support`,
      type: 'support_change',
      source,
      payload: { supportDelta: effects.supportDelta },
      turn,
    });
  }

  if (effects.relationDelta) {
    intents.push({
      id: `intent-${Date.now()}-relation`,
      type: 'relation_change',
      source,
      payload: { relationDelta: effects.relationDelta },
      turn,
    });
  }

  if (effects.fundsDelta) {
    intents.push({
      id: `intent-${Date.now()}-funds`,
      type: 'funds_change',
      source,
      payload: { fundsDelta: effects.fundsDelta },
      turn,
    });
  }

  if (effects.metricsDelta) {
    intents.push({
      id: `intent-${Date.now()}-metrics`,
      type: 'metrics_change',
      source,
      payload: { metricsDelta: effects.metricsDelta },
      turn,
    });
  }

  return intents;
}

/**
 * 校验 AI 意图是否合法
 */
export function validateIntent(intent: AIIntent): RuleValidationResult {
  switch (intent.type) {
    case 'support_change': {
      const delta = intent.payload.supportDelta as Record<string, number> | undefined;
      if (!delta || Object.keys(delta).length === 0) {
        return { valid: false, reason: '支持率变化意图缺少有效的 delta 数据' };
      }
      return { valid: true };
    }
    case 'relation_change': {
      const delta = intent.payload.relationDelta as Record<string, number> | undefined;
      if (!delta || Object.keys(delta).length === 0) {
        return { valid: false, reason: '关系变化意图缺少有效的 delta 数据' };
      }
      return { valid: true };
    }
    case 'funds_change': {
      const delta = intent.payload.fundsDelta as Record<string, number> | undefined;
      if (!delta || Object.keys(delta).length === 0) {
        return { valid: false, reason: '资金变化意图缺少有效的 delta 数据' };
      }
      return { valid: true };
    }
    case 'metrics_change': {
      const delta = intent.payload.metricsDelta as Record<string, number> | undefined;
      if (!delta || Object.keys(delta).length === 0) {
        return { valid: false, reason: '大盘指标变化意图缺少有效的 delta 数据' };
      }
      return { valid: true };
    }
    case 'no_confidence': {
      const signatories = intent.payload.signatories as string[] | undefined;
      if (!signatories || signatories.length < NO_CONFIDENCE_THRESHOLD) {
        return {
          valid: false,
          reason: `不信任案联署人数不足：需要 ${NO_CONFIDENCE_THRESHOLD} 人，当前仅 ${signatories?.length ?? 0} 人`,
        };
      }
      return { valid: true };
    }
    case 'coalition_proposal': {
      const parties = intent.payload.parties as string[] | undefined;
      if (!parties || parties.length < 2) {
        return { valid: false, reason: '联盟提案至少需要两个参与方' };
      }
      return { valid: true };
    }
    case 'bill_proposal': {
      const title = intent.payload.title as string | undefined;
      if (!title) {
        return { valid: false, reason: '法案提案缺少标题' };
      }
      return { valid: true };
    }
    // --- 政治 AI 意图校验 ---
    case 'challenge_leader': {
      const partyId = intent.payload.partyId as string | undefined;
      const challenger = intent.payload.challengerName as string | undefined;
      if (!partyId || !challenger) {
        return { valid: false, reason: '领袖挑战意图缺少必要字段' };
      }
      return { valid: true };
    }
    case 'seek_cabinet': {
      const mpName = intent.payload.mpName as string | undefined;
      if (!mpName) {
        return { valid: false, reason: '谋求内阁职位意图缺少议员姓名' };
      }
      return { valid: true };
    }
    case 'form_faction': {
      const leaderName = intent.payload.leaderName as string | undefined;
      if (!leaderName) {
        return { valid: false, reason: '派系组建意图缺少领袖姓名' };
      }
      return { valid: true };
    }
    case 'propose_bill': {
      const title = intent.payload.title as string | undefined;
      if (!title) {
        return { valid: false, reason: '法案提案缺少标题' };
      }
      return { valid: true };
    }
    case 'lobby_support':
    case 'media_campaign':
    case 'backroom_deal':
    case 'faction_defect':
    case 'stress_event':
      return { valid: true };
    default:
      return { valid: false, reason: `未知意图类型: ${intent.type}` };
  }
}

/**
 * 结算单个 AI 意图（核心数值修改的唯一入口）
 *
 * 规则引擎根据意图类型，对 GameState 的核心数值进行受控修改。
 * 此函数是修改 supportDelta / projectedSeats / funds / relations 的唯一合法路径。
 */
export function settleIntent(state: GameState, intent: AIIntent): GameState {
  const validation = validateIntent(intent);
  if (!validation.valid) return state;

  const newState = structuredClone(state);

  switch (intent.type) {
    case 'support_change': {
      const delta = intent.payload.supportDelta as Record<string, number>;
      for (const party of newState.parties) {
        const d = delta[party.id] ?? 0;
        party.currentSupport = Math.max(1, Math.min(50, party.currentSupport + d));
      }
      recalcSeats(newState);
      break;
    }
    case 'relation_change': {
      const delta = intent.payload.relationDelta as Record<string, number>;
      for (const [key, d] of Object.entries(delta)) {
        const [from, to] = key.split('>');
        const entry = newState.relations.find((r) => r.from === from && r.to === to);
        if (entry) {
          entry.score = Math.max(-100, Math.min(100, entry.score + d));
          entry.type = scoreToType(entry.score);
        } else {
          newState.relations.push({
            from,
            to,
            score: Math.max(-100, Math.min(100, d)),
            type: scoreToType(d),
            description: '新形成的关系立场',
          });
        }
      }
      break;
    }
    case 'funds_change': {
      const delta = intent.payload.fundsDelta as Record<string, number>;
      for (const party of newState.parties) {
        const d = delta[party.id] ?? 0;
        party.funds = Math.max(0, party.funds + d);
      }
      break;
    }
    case 'metrics_change': {
      const delta = intent.payload.metricsDelta as Record<string, number>;
      if (delta.economicIndex) {
        newState.metrics.economicIndex = clamp(newState.metrics.economicIndex + delta.economicIndex);
      }
      if (delta.socialStabilityIndex) {
        newState.metrics.socialStabilityIndex = clamp(newState.metrics.socialStabilityIndex + delta.socialStabilityIndex);
      }
      if (delta.mediaAttention) {
        newState.metrics.mediaAttention = clamp(newState.metrics.mediaAttention + delta.mediaAttention);
      }
      if (delta.turnoutRate) {
        newState.metrics.turnoutRate = clamp(newState.metrics.turnoutRate + delta.turnoutRate, 30, 95);
      }
      if (delta.swingVoterRatio) {
        newState.metrics.swingVoterRatio = clamp(newState.metrics.swingVoterRatio + delta.swingVoterRatio, 5, 40);
      }
      break;
    }
    // --- 政治 AI 意图结算 ---
    case 'challenge_leader': {
      const delta = (intent.payload.supportDelta as Record<string, number>) ?? {};
      for (const party of newState.parties) {
        const d = delta[party.id] ?? 0;
        party.currentSupport = Math.max(1, Math.min(50, party.currentSupport + d));
      }
      recalcSeats(newState);
      newState.events.push({
        id: `evt-${Date.now()}-challenge`,
        day: newState.currentDay,
        title: '党内领袖挑战',
        description: `${intent.payload.challengerName as string} 对 ${intent.payload.currentLeaderName as string} 发起了党首挑战！`,
        impact: delta,
      });
      break;
    }
    case 'seek_cabinet': {
      newState.events.push({
        id: `evt-${Date.now()}-cabinet`,
        day: newState.currentDay,
        title: '谋求内阁职位',
        description: `${intent.payload.mpName as string} 表达了对更高职位的野心。`,
        impact: {},
      });
      break;
    }
    case 'form_faction': {
      newState.events.push({
        id: `evt-${Date.now()}-faction`,
        day: newState.currentDay,
        title: '新派系成立',
        description: `${intent.payload.leaderName as string} 在党内组建了「${intent.payload.factionName as string}」。`,
        impact: {},
      });
      break;
    }
    case 'propose_bill': {
      const billTitle = intent.payload.title as string;
      const existing = newState.bills.find((b) => b.title === billTitle);
      if (!existing) {
        newState.bills.push({
          id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title: billTitle,
          summary: intent.payload.summary as string ?? '',
          proposerPartyId: intent.payload.proposerPartyId as string ?? '',
          proposerName: intent.payload.proposerName as string ?? '',
          committeeId: intent.payload.committeeId as string ?? 'general',
          status: 'draft',
          committeeNote: '',
          amendment: '',
          votesFor: 0,
          votesAgainst: 0,
          createdTurn: intent.turn,
        });
        newState.events.push({
          id: `evt-${Date.now()}-bill`,
          day: newState.currentDay,
          title: '新法案提出',
          description: `${intent.payload.proposerName as string} 提出了「${billTitle}」。`,
          impact: {},
        });
      }
      break;
    }
    case 'lobby_support': {
      newState.events.push({
        id: `evt-${Date.now()}-lobby`,
        day: newState.currentDay,
        title: '议员游说活动',
        description: `${intent.payload.initiatorName as string} 正在四处游说，推动「${intent.payload.topic as string}」议题。`,
        impact: {},
      });
      break;
    }
    case 'media_campaign': {
      const supportDelta = (intent.payload.supportDelta as Record<string, number>) ?? {};
      for (const party of newState.parties) {
        const d = supportDelta[party.id] ?? 0;
        party.currentSupport = Math.max(1, Math.min(50, party.currentSupport + d));
      }
      recalcSeats(newState);
      const mediaBoost = (intent.payload.intensity as number) ?? 5;
      newState.metrics.mediaAttention = clamp(newState.metrics.mediaAttention + mediaBoost);
      newState.events.push({
        id: `evt-${Date.now()}-media`,
        day: newState.currentDay,
        title: '媒体攻势',
        description: `${intent.payload.mpName as string} 发起了一场媒体攻势，吸引了公众关注。`,
        impact: supportDelta,
      });
      break;
    }
    case 'backroom_deal': {
      const action = intent.payload.action as string;
      if (action === 'fundraise') {
        const fundsDelta = (intent.payload.fundsDelta as Record<string, number>) ?? {};
        for (const party of newState.parties) {
          const d = fundsDelta[party.id] ?? 0;
          party.funds = Math.max(0, party.funds + d);
        }
      }
      newState.events.push({
        id: `evt-${Date.now()}-deal`,
        day: newState.currentDay,
        title: '密室交易',
        description: `${intent.payload.initiatorName as string} 进行了秘密活动（${action}）。`,
        impact: {},
      });
      break;
    }
    case 'faction_defect': {
      newState.events.push({
        id: `evt-${Date.now()}-defect`,
        day: newState.currentDay,
        title: '派系叛离',
        description: `${intent.payload.mpName as string} 脱离了原有派系。`,
        impact: {},
      });
      break;
    }
    case 'stress_event': {
      const supportDelta = (intent.payload.supportDelta as Record<string, number>) ?? {};
      for (const party of newState.parties) {
        const d = supportDelta[party.id] ?? 0;
        party.currentSupport = Math.max(1, Math.min(50, party.currentSupport + d));
      }
      recalcSeats(newState);
      newState.events.push({
        id: `evt-${Date.now()}-stress`,
        day: newState.currentDay,
        title: (intent.payload.title as string) ?? '议员失态',
        description: (intent.payload.description as string) ?? '一位议员因压力过大而公开失态。',
        impact: supportDelta,
      });
      break;
    }
    default:
      break;
  }

  return newState;
}

/**
 * 批量结算 AI 意图
 */
export function settleIntents(state: GameState, intents: AIIntent[]): GameState {
  let current = state;
  for (const intent of intents) {
    current = settleIntent(current, intent);
  }
  return current;
}

// ===== 席位计算（唯一入口） =====

/**
 * 根据支持率重新分配预计席位
 *
 * 这是修改 projectedSeats 的唯一合法路径
 */
export function recalcSeats(state: GameState): void {
  const total = state.parties.reduce((s, p) => s + p.currentSupport, 0);
  const totalSeats = state.metrics.totalSeats;
  let assigned = 0;

  for (let i = 0; i < state.parties.length; i++) {
    const raw = (state.parties[i].currentSupport / total) * totalSeats;
    const seats = Math.floor(raw);
    state.parties[i].projectedSeats = seats;
    assigned += seats;
  }

  const remainder = totalSeats - assigned;
  const byRemainder = [...state.parties]
    .map((p, i) => ({
      index: i,
      frac: (p.currentSupport / total) * totalSeats - Math.floor((p.currentSupport / total) * totalSeats),
    }))
    .sort((a, b) => b.frac - a.frac);

  for (let i = 0; i < remainder; i++) {
    state.parties[byRemainder[i].index].projectedSeats += 1;
  }
}

// ===== 工具函数 =====

function scoreToType(score: number): 'alliance' | 'friendly' | 'neutral' | 'tense' | 'hostile' {
  if (score >= 60) return 'alliance';
  if (score >= 20) return 'friendly';
  if (score >= -20) return 'neutral';
  if (score >= -50) return 'tense';
  return 'hostile';
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}
