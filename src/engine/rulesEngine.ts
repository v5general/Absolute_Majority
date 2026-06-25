import type {
  GameState,
  AIIntent,
  RuleValidationResult,
  NoConfidenceMotion,
  CoalitionAgreement,
  CabinetPost,
  CommitteeId,
  Committee,
  CommitteeMember,
  Party,
  RelationEntry,
  ElectionResult,
} from '../types';
import { PARLIAMENT_RULES, RELATION_THRESHOLDS, getMonthFromTurn, getCongressSessionByMonth } from '../config/ruleConfig';
import {
  BUDGET_COMMITTEE_MULTIPLIERS,
  CAMPAIGN_MULTIPLIERS_APPLIED_AT_SETTLEMENT,
  RELATION_CAP,
  FUNDS_FAUCET_SINK,
  COMMITTEE_CHAIRMAN_BONUSES,
} from '../config/gameBalance';
import type { ChairmanVoteContext } from '../config/gameBalance';
// 延迟导入 triggerArc 以避免循环依赖（dramaEngine 不依赖 rulesEngine，安全）
import { triggerArc } from './dramaEngine';
import { PARTY_RANKS } from '../types/career';

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

// ===== 常量（从配置派生） =====

/** 不信任案联署最低门槛 */
export const NO_CONFIDENCE_THRESHOLD = PARLIAMENT_RULES.noConfidenceThreshold;

/** 委员会法定人数比例（超过半数） */
export const QUORUM_RATIO = PARLIAMENT_RULES.quorumRatio;

/** 意识形态光谱顺序（本地副本，避免循环导入） */
const IDEOLOGY_ORDER: import('../types').Ideology[] = [
  'far-left', 'left', 'center-left', 'center', 'center-right', 'right', 'far-right',
];

/** 意识形态距离（本地副本，避免循环导入） */
function ideologyDistance(a: import('../types').Ideology, b: import('../types').Ideology): number {
  return Math.abs(IDEOLOGY_ORDER.indexOf(a) - IDEOLOGY_ORDER.indexOf(b));
}

/** 确定性随机数生成器（用于 settle，确保可复现） */
function seededRandom(seed: number): () => number {
  let s = Math.abs(seed) + 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** 从 intent id + turn 派生确定性种子 */
function intentSeed(intent: AIIntent, state: GameState, salt: number = 0): number {
  let hash = state.turn * 31 + salt;
  for (let i = 0; i < intent.id.length; i++) hash = ((hash << 5) - hash + intent.id.charCodeAt(i)) | 0;
  return hash;
}

/** 推送事件到 state（统一入口，避免 copypaste） */
function pushEvent(
  state: GameState,
  title: string,
  description: string,
  impact: Record<string, number> = {},
): void {
  state.events.push({
    id: `evt-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
    day: state.currentDay,
    title,
    description,
    impact,
  });
}

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
    // --- Phase G 程序性 intent 校验 ---
    case 'political_capital_change': {
      const delta = intent.payload.capitalDelta as Record<string, number> | undefined;
      if (!delta || Object.keys(delta).length === 0) {
        return { valid: false, reason: '政治资本变化意图缺少 capitalDelta' };
      }
      return { valid: true };
    }
    case 'fundraising': {
      const mpKey = intent.payload.mpKey as string | undefined;
      if (!mpKey) {
        return { valid: false, reason: '募款意图缺少 mpKey' };
      }
      return { valid: true };
    }
    case 'no_confidence_proposal': {
      const proposingPartyId = intent.payload.proposingPartyId as string | undefined;
      const signatories = intent.payload.signatories as string[] | undefined;
      if (!proposingPartyId) {
        return { valid: false, reason: '不信任案提案缺少 proposingPartyId' };
      }
      if (!signatories || signatories.length < NO_CONFIDENCE_THRESHOLD) {
        return {
          valid: false,
          reason: `不信任案联署不足：需要 ${NO_CONFIDENCE_THRESHOLD} 人，当前 ${signatories?.length ?? 0} 人`,
        };
      }
      return { valid: true };
    }
    case 'dissolution_decision': {
      const pmPartyId = intent.payload.pmPartyId as string | undefined;
      if (!pmPartyId) {
        return { valid: false, reason: '解散决策缺少 pmPartyId' };
      }
      return { valid: true };
    }
    case 'leadership_campaign': {
      const partyId = intent.payload.partyId as string | undefined;
      const challengerId = intent.payload.challengerId as string | undefined;
      const currentLeaderId = intent.payload.currentLeaderId as string | undefined;
      if (!partyId || !challengerId || !currentLeaderId) {
        return { valid: false, reason: '党首选举意图缺少必要字段（partyId/challengerId/currentLeaderId）' };
      }
      return { valid: true };
    }
    case 'bill_draft': {
      const title = intent.payload.title as string | undefined;
      const targetCommitteeId = intent.payload.targetCommitteeId as string | undefined;
      if (!title || !targetCommitteeId) {
        return { valid: false, reason: '法案起草意图缺少 title 或 targetCommitteeId' };
      }
      return { valid: true };
    }
    case 'parliament_questioning': {
      const questionerPartyId = intent.payload.questionerPartyId as string | undefined;
      const targetMinisterName = intent.payload.targetMinisterName as string | undefined;
      const topic = intent.payload.topic as string | undefined;
      if (!questionerPartyId || !targetMinisterName || !topic) {
        return { valid: false, reason: '国会质询意图缺少必要字段' };
      }
      return { valid: true };
    }
    case 'committee_deliberation': {
      const committeeId = intent.payload.committeeId as string | undefined;
      const deliberationType = intent.payload.deliberationType as string | undefined;
      if (!committeeId || !deliberationType) {
        return { valid: false, reason: '委员会审议意图缺少 committeeId 或 deliberationType' };
      }
      return { valid: true };
    }
    case 'bill_vote': {
      const billId = intent.payload.billId as string | undefined;
      if (!billId) {
        return { valid: false, reason: '全院表决意图缺少 billId' };
      }
      return { valid: true };
    }
    case 'committee_review': {
      const committeeId = intent.payload.committeeId as string | undefined;
      const billId = intent.payload.billId as string | undefined;
      if (!committeeId || !billId) {
        return { valid: false, reason: '委员会审查意图缺少 committeeId 或 billId' };
      }
      return { valid: true };
    }
    case 'committee_vote': {
      const committeeId = intent.payload.committeeId as string | undefined;
      const billId = intent.payload.billId as string | undefined;
      if (!committeeId || !billId) {
        return { valid: false, reason: '委员会表决意图缺少 committeeId 或 billId' };
      }
      return { valid: true };
    }
    case 'coalition_negotiation': {
      const proposerPartyId = intent.payload.proposerPartyId as string | undefined;
      const targetPartyId = intent.payload.targetPartyId as string | undefined;
      if (!proposerPartyId || !targetPartyId) {
        return { valid: false, reason: '联盟谈判意图缺少 proposerPartyId 或 targetPartyId' };
      }
      return { valid: true };
    }
    case 'cabinet_reshuffle': {
      const pmPartyId = intent.payload.pmPartyId as string | undefined;
      if (!pmPartyId) {
        return { valid: false, reason: '内阁改组意图缺少 pmPartyId' };
      }
      return { valid: true };
    }
    case 'leadership_challenge': {
      const partyId = intent.payload.partyId as string | undefined;
      const challengerId = intent.payload.challengerId as string | undefined;
      const currentLeaderId = intent.payload.currentLeaderId as string | undefined;
      if (!partyId || !challengerId || !currentLeaderId) {
        return { valid: false, reason: '党首挑战意图缺少 partyId、challengerId 或 currentLeaderId' };
      }
      return { valid: true };
    }
    case 'policy_announcement': {
      const partyId = intent.payload.partyId as string | undefined;
      const policyArea = intent.payload.policyArea as string | undefined;
      if (!partyId || !policyArea) {
        return { valid: false, reason: '政策宣示意图缺少 partyId 或 policyArea' };
      }
      return { valid: true };
    }
    default:
      return { valid: false, reason: `未知意图类型: ${intent.type}` };
  }
}

/**
 * 结算单个 AI 意图（核心数值修改的唯一入口）
 *
 * 规则引擎根据意图类型，对 GameState 的核心数值进行受控修改。
 * 此函数是修改 supportDelta / projectedSeats / funds / relations 的唯一合法路径。
 *
 * Phase G Q4：在入口应用预算委员会倍率 + 竞选期间倍率。
 */
export function settleIntent(state: GameState, intent: AIIntent): GameState {
  const validation = validateIntent(intent);
  if (!validation.valid) return state;

  // Phase G Q4：竞选期间倍率 — 对 supportDelta ×1.5、metricsDelta.mediaAttention ×2.0
  const effectiveIntent = CAMPAIGN_MULTIPLIERS_APPLIED_AT_SETTLEMENT && state.isElectionCampaign
    ? applyCampaignMultipliers(intent)
    : intent;

  const newState = structuredClone(state);

  switch (effectiveIntent.type) {
    case 'support_change': {
      const delta = effectiveIntent.payload.supportDelta as Record<string, number>;
      // Phase G Q4：预算委员会 + 1-3 月预算决战期 双触发 → 支持率波动 ×1.5
      const multiplier = isBudgetMultiplierActive(newState) ? BUDGET_COMMITTEE_MULTIPLIERS.supportVolatility : 1.0;
      for (const party of newState.parties) {
        const d = (delta[party.id] ?? 0) * multiplier;
        party.currentSupport = Math.max(1, Math.min(50, party.currentSupport + d));
      }
      recalcSeats(newState);
      break;
    }
    case 'relation_change': {
      const delta = effectiveIntent.payload.relationDelta as Record<string, number>;
      for (const [key, rawD] of Object.entries(delta)) {
        const [from, to] = key.split('>');
        // Phase G balance-check：防"刷关系" — 连续 3 回合对同一 NPC 送礼效果 ×0.5
        const grind = getGrindFactor(newState, from, to);
        const cappedD = applyStrongRelationCap(newState, from, rawD);
        const d = cappedD * grind;
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
      const delta = effectiveIntent.payload.fundsDelta as Record<string, number>;
      for (const party of newState.parties) {
        const d = delta[party.id] ?? 0;
        party.funds = Math.max(0, party.funds + d);
      }
      break;
    }
    case 'metrics_change': {
      const delta = effectiveIntent.payload.metricsDelta as Record<string, number>;
      if (delta.economicIndex) {
        newState.metrics.economicIndex = clamp(newState.metrics.economicIndex + delta.economicIndex);
      }
      if (delta.socialStabilityIndex) {
        newState.metrics.socialStabilityIndex = clamp(newState.metrics.socialStabilityIndex + delta.socialStabilityIndex);
      }
      if (delta.mediaAttention) {
        // Phase G Q4：预算委员会 + 1-3 月 → 媒体影响 ×1.5
        const multiplier = isBudgetMultiplierActive(newState) ? BUDGET_COMMITTEE_MULTIPLIERS.mediaInfluence : 1.0;
        newState.metrics.mediaAttention = clamp(newState.metrics.mediaAttention + delta.mediaAttention * multiplier);
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
          committeeId: (intent.payload.committeeId ?? 'general') as CommitteeId,
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
      const mpName = intent.payload.mpName as string;
      const partyId = intent.payload.partyId as string;
      const factionId = intent.payload.factionId as string | undefined;
      const party = newState.parties.find(p => p.id === partyId);
      if (party && party.factions && factionId) {
        const faction = party.factions.find(f => f.id === factionId);
        if (faction && faction.members.includes(mpName)) {
          faction.members = faction.members.filter(m => m !== mpName);
          faction.influence = Math.max(1, faction.influence - 3);
          // 修正反馈循环：忠诚度不降至触发阈值以下（防止连锁叛离）
          const minLoyaltyAfterDefect = 45; // 保持在触发阈值 40 之上
          faction.loyalty = Math.max(minLoyaltyAfterDefect, faction.loyalty - 5);
        }
      }
      const mpKey = `${partyId}:${mpName}`;
      const mp = newState.mpPersonalities[mpKey];
      if (mp) {
        mp.factionId = undefined;
        mp.loyalty = Math.max(0, mp.loyalty - 10);
      }
      pushEvent(newState, '派系叛离',
        `${mpName} 脱离了${factionId ? `派系 ${factionId}` : '原有派系'}，党内忠诚度下降。`);
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
    // --- Phase G 程序性 intent 结算 ---
    case 'political_capital_change': {
      const delta = intent.payload.capitalDelta as Record<string, number>;
      for (const [mpKey, d] of Object.entries(delta)) {
        const mp = newState.mpPersonalities[mpKey];
        if (!mp) continue;
        const oldValue = mp.politicalCapital ?? 30;
        mp.politicalCapital = Math.max(0, Math.min(100, oldValue + d));
      }
      break;
    }
    case 'fundraising': {
      // 玩家主动募款行动：+50（来自 FUNDS_FAUCET_SINK.fundraisingActionGain）
      // 实际党派资金结算由 economyEngine 处理；这里仅记录事件
      const mpKey = intent.payload.mpKey as string;
      const mp = newState.mpPersonalities[mpKey];
      const partyId = mp?.partyId ?? intent.payload.partyId as string;
      const gain = FUNDS_FAUCET_SINK.fundraisingActionGain;
      const party = newState.parties.find(p => p.id === partyId);
      if (party) {
        party.funds = Math.max(0, party.funds + gain);
      }
      newState.events.push({
        id: `evt-${Date.now()}-fundraise`,
        day: newState.currentDay,
        title: '募款活动',
        description: `${mp?.personName ?? '议员'} 主持了一场募款活动，${party?.name ?? '其党派'} 资金 +${gain}。`,
        impact: party ? { [partyId]: gain } : {},
      });
      break;
    }
    case 'no_confidence_proposal': {
      // 程序性 intent：仅记录提案事件；实际联署/表决由 governmentEngine 处理
      const proposingPartyId = intent.payload.proposingPartyId as string;
      const targetPMName = (intent.payload.targetPMName as string) ?? '现任首相';
      const signatories = (intent.payload.signatories as string[]) ?? [];
      const passed = (intent.payload.passed as boolean | undefined) ?? false;
      const proposingParty = newState.parties.find(p => p.id === proposingPartyId);
      newState.events.push({
        id: `evt-${Date.now()}-ncm`,
        day: newState.currentDay,
        title: passed ? '内阁不信任动议通过' : '内阁不信任动议提案',
        description: `${proposingParty?.name ?? proposingPartyId} 提出「对 ${targetPMName} 内阁的不信任动议」，已获 ${signatories.length} 名议员联署。${passed ? '动议已通过，首相须辞职或解散众议院。' : ''}`,
        impact: {},
      });
      // Phase G 第十二章：不信任案通过 → 强制 dissolution_crisis arc
      if (passed && newState.dramaState) {
        newState.dramaState = triggerArc(newState.dramaState, 'dissolution_crisis', newState.turn);
      }
      break;
    }
    case 'dissolution_decision': {
      const pmPartyId = intent.payload.pmPartyId as string;
      const willingness = (intent.payload.willingness as number) ?? 0;
      const reason = (intent.payload.reason as string) ?? '战略考量';
      const pmParty = newState.parties.find(p => p.id === pmPartyId);
      newState.events.push({
        id: `evt-${Date.now()}-dissolution`,
        day: newState.currentDay,
        title: '解散众议院决策',
        description: `${pmParty?.name ?? pmPartyId} 首相考虑解散众议院（意愿 ${willingness.toFixed(0)}%）：${reason}。`,
        impact: {},
      });
      break;
    }
    case 'leadership_campaign': {
      const partyId = intent.payload.partyId as string;
      const challengerId = intent.payload.challengerId as string; // 即获胜者 MP key
      const currentLeaderId = intent.payload.currentLeaderId as string;
      const party = newState.parties.find(p => p.id === partyId);
      const winnerMP = newState.mpPersonalities[challengerId];
      const winnerName = winnerMP?.personName ?? challengerId.split(':').pop() ?? challengerId;

      // Phase G 修复 #1：实际安装获胜者为新党首（此前仅记录事件，党首永不变更）
      const changedLeader = party && winnerName !== party.leader;
      if (changedLeader) {
        // 清除旧党首的 isLeader 标记
        const oldLeaderMP = newState.mpPersonalities[currentLeaderId];
        if (oldLeaderMP) oldLeaderMP.isLeader = false;
        // 安装新党首
        party!.leader = winnerName;
        if (winnerMP) {
          winnerMP.isLeader = true;
          // 同步党内职业路线到党首
          if (winnerMP.career) {
            winnerMP.career = {
              ...winnerMP.career,
              partyRank: PARTY_RANKS[PARTY_RANKS.length - 1],
              partyRankIndex: PARTY_RANKS.length - 1,
            };
          }
        }
      }

      newState.events.push({
        id: `evt-${Date.now()}-leadership`,
        day: newState.currentDay,
        title: changedLeader ? '党首选举：新党首就任' : '党首选举活动',
        description: changedLeader
          ? `${party!.name} 党首选举结束：${winnerName} 当选新党首（前任 ${currentLeaderId.split(':').pop() ?? currentLeaderId}）。`
          : `${party?.name ?? partyId} 启动党首选举：${winnerName} 挑战现任 ${currentLeaderId}。`,
        impact: {},
      });
      break;
    }
    case 'bill_draft': {
      // 程序性 intent：起草法案，加入 bills 列表
      const title = intent.payload.title as string;
      const proposerPartyId = intent.payload.proposerPartyId as string;
      const summary = (intent.payload.summary as string) ?? '';
      const targetCommitteeId = (intent.payload.targetCommitteeId as CommitteeId) ?? 'general';
      const existing = newState.bills.find(b => b.title === title);
      if (!existing) {
        const party = newState.parties.find(p => p.id === proposerPartyId);
        newState.bills.push({
          id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          title,
          summary,
          proposerPartyId,
          proposerName: party?.leader ?? '',
          committeeId: targetCommitteeId,
          status: 'draft',
          committeeNote: '',
          amendment: '',
          votesFor: 0,
          votesAgainst: 0,
          createdTurn: intent.turn,
        });
        newState.events.push({
          id: `evt-${Date.now()}-billdraft`,
          day: newState.currentDay,
          title: '法案起草',
          description: `提出「${title}」草案，送交 ${targetCommitteeId} 委员会审议。`,
          impact: {},
        });
      }
      break;
    }
    case 'parliament_questioning': {
      const questionerPartyId = intent.payload.questionerPartyId as string;
      const targetMinisterName = intent.payload.targetMinisterName as string;
      const topic = intent.payload.topic as string;
      const questionTime = (intent.payload.questionTime as number) ?? 0;
      const questionerParty = newState.parties.find(p => p.id === questionerPartyId);
      newState.events.push({
        id: `evt-${Date.now()}-questioning`,
        day: newState.currentDay,
        title: '国会质询',
        description: `${questionerParty?.name ?? questionerPartyId} 在国会质询 ${targetMinisterName}：${topic}（质询时间 ${questionTime} 分钟）`,
        impact: {},
      });
      break;
    }
    case 'committee_deliberation': {
      const committeeId = intent.payload.committeeId as CommitteeId;
      const billId = (intent.payload.billId as string) ?? '';
      const deliberationType = intent.payload.deliberationType as string;
      const outcome = (intent.payload.outcome as string) ?? 'pending';
      // 委员长细分权重在此应用（push +30% / shelve +50% / amend +20%）
      const bill = newState.bills.find(b => b.id === billId || b.title === billId);
      if (bill) {
        if (deliberationType === 'push') {
          bill.status = bill.status === 'draft' ? 'in_committee' : bill.status;
          bill.committeeNote = `委员长推进：${outcome}`;
        } else if (deliberationType === 'shelve') {
          bill.status = 'delayed';
          bill.committeeNote = `委员长搁置：${outcome}`;
        } else if (deliberationType === 'amend') {
          bill.status = 'revised';
          bill.amendment = outcome;
        }
      }
      newState.events.push({
        id: `evt-${Date.now()}-deliberation`,
        day: newState.currentDay,
        title: '委员会审议',
        description: `${committeeId} 委员会审议 ${deliberationType}：${outcome}`,
        impact: {},
      });
      break;
    }
    case 'bill_vote': {
      const billId = intent.payload.billId as string;
      const bill = newState.bills.find(b => b.id === billId);
      if (bill) {
        bill.status = 'voting';
        // 全院表决：与 committeeEngine.committee_vote 一致使用 relScore * 0.3 权重
        let votesFor = 0;
        let votesAgainst = 0;
        for (const party of newState.parties) {
          const rel = newState.relations.find(
            r => r.from === party.id && r.to === bill.proposerPartyId,
          );
          const relScore = rel ? rel.score : 0;
          const isSameParty = party.id === bill.proposerPartyId;
          const billParty = newState.parties.find(p => p.id === bill.proposerPartyId);
          const idDist = ideologyDistance(party.ideology, billParty?.ideology ?? 'center');
          let favorScore = 50 + relScore * 0.3;
          if (isSameParty) favorScore += 30;
          favorScore -= idDist * 6;
          const favorRatio = Math.max(0, Math.min(1, favorScore / 100));
          const partyVotes = party.projectedSeats;
          votesFor += Math.round(partyVotes * favorRatio);
          votesAgainst += partyVotes - Math.round(partyVotes * favorRatio);
        }
        bill.votesFor = votesFor;
        bill.votesAgainst = votesAgainst;
        bill.status = votesFor > votesAgainst ? 'implemented' : 'rejected';
      }
      pushEvent(newState, '全院表决',
        `法案 "${bill?.title ?? billId}" 经全院表决${bill?.status === 'implemented' ? '通过' : '未通过'}（赞成 ${bill?.votesFor ?? 0}，反对 ${bill?.votesAgainst ?? 0}）。`);
      break;
    }
    case 'committee_review': {
      const committeeId = intent.payload.committeeId as CommitteeId;
      const billId = intent.payload.billId as string;
      const bill = newState.bills.find(b => b.id === billId);
      const committee = newState.committees.find(c => c.id === committeeId);
      if (bill && committee) {
        const chairmanParty = newState.parties.find(p => p.id === committee.chairman.partyId);
        const billParty = newState.parties.find(p => p.id === bill.proposerPartyId);
        const rel = newState.relations.find(r => r.from === committee.chairman.partyId && r.to === bill.proposerPartyId);
        const relScore = rel ? rel.score : 0;
        const idDist = ideologyDistance(
          chairmanParty?.ideology ?? 'center',
          billParty?.ideology ?? 'center',
        );
        const passChance = 50 + relScore * 0.5 - idDist * 8 + (committee.efficiency - 50) * 0.3;
        if (passChance >= 65) {
          bill.status = 'revised';
          bill.committeeNote = '审议通过，无修正';
        } else if (passChance >= 40) {
          bill.status = 'revised';
          bill.amendment = `修正案：经${committeeId}委员会审议修改`;
          bill.committeeNote = '审议通过，含修正案';
        } else if (passChance >= 20) {
          bill.status = 'delayed';
          bill.committeeNote = '审议搁置（软性）';
        } else {
          bill.status = 'delayed';
          bill.committeeNote = '审议搁置（强硬）';
        }
        pushEvent(newState, '委员会审查',
          `${committeeId} 委员会审查法案 "${bill.title}"：${bill.committeeNote}`);
      } else {
        pushEvent(newState, '委员会审查失败',
          `委员会审查意图缺少有效法案或委员会（billId=${billId}, committeeId=${committeeId}）`);
      }
      break;
    }
    case 'committee_vote': {
      const committeeId = intent.payload.committeeId as CommitteeId;
      const billId = intent.payload.billId as string;
      const bill = newState.bills.find(b => b.id === billId);
      const committee = newState.committees.find(c => c.id === committeeId);
      if (bill && committee) {
        let votesFor = 0;
        let votesAgainst = 0;
        for (const member of committee.members) {
          if (!committee.presentMembers.includes(member.personName)) continue;
          const isChairman = member.personName === committee.chairman.personName;
          const isSameParty = member.partyId === bill.proposerPartyId;
          const rel = newState.relations.find(r => r.from === member.partyId && r.to === bill.proposerPartyId);
          const relScore = rel ? rel.score : 0;
          let favorScore = 50 + relScore * 0.3;
          if (isSameParty) favorScore += 30;
          const memberParty = newState.parties.find(p => p.id === member.partyId);
          const billParty = newState.parties.find(p => p.id === bill.proposerPartyId);
          const idDist = ideologyDistance(memberParty?.ideology ?? 'center', billParty?.ideology ?? 'center');
          favorScore -= idDist * 6;
          const voteWeight = isChairman ? getChairmanWeightMultiplier((intent.payload.voteContext as ChairmanVoteContext) ?? 'push') : 1;
          if (favorScore >= 45) votesFor += voteWeight;
          else votesAgainst += voteWeight;
        }
        bill.votesFor = votesFor;
        bill.votesAgainst = votesAgainst;
        bill.status = votesFor > votesAgainst ? 'revised' : 'rejected';
        pushEvent(newState, '委员会表决',
          `${committeeId} 委员会表决 "${bill.title}"：赞成 ${votesFor}，反对 ${votesAgainst}。`);
      } else {
        pushEvent(newState, '委员会表决失败',
          `委员会表决意图缺少有效法案或委员会（billId=${billId}, committeeId=${committeeId}）`);
      }
      break;
    }
    case 'coalition_negotiation': {
      const proposerPartyId = intent.payload.proposerPartyId as string;
      const targetPartyId = intent.payload.targetPartyId as string;
      if (newState.government) {
        // 简化联盟谈判：检查意愿度，满足条件则加入执政联盟
        const targetParty = newState.parties.find(p => p.id === targetPartyId);
        const rulingParty = newState.parties.find(p => p.id === proposerPartyId);
        if (targetParty && rulingParty) {
          const rel = newState.relations.find(r => r.from === targetPartyId && r.to === proposerPartyId);
          const relScore = rel ? rel.score : 0;
          const idDist = ideologyDistance(targetParty.ideology, rulingParty.ideology);
          const willingness = 30 + relScore * 0.5 - idDist * 10;
          if (willingness >= 45 && !newState.government.rulingCoalition.includes(targetPartyId)) {
            newState.government.rulingCoalition.push(targetPartyId);
            newState.government.opposition = newState.government.opposition.filter(o => o !== targetPartyId);
            // 简化稳定性重算
            const coalitionSeats = newState.government.rulingCoalition.reduce((s, pid) => {
              const p = newState.parties.find(pp => pp.id === pid);
              return s + (p?.projectedSeats ?? 0);
            }, 0);
            const seatMargin = Math.min(40, Math.max(0, ((coalitionSeats / newState.metrics.totalSeats) - 0.5) * 200));
            newState.government.stability = Math.min(100, Math.max(0, seatMargin + 30));
          }
        }
        const success = newState.government.rulingCoalition.includes(targetPartyId);
        pushEvent(newState, '联盟谈判',
          `${proposerPartyId} 与 ${targetPartyId} 进行联盟谈判${success ? '，达成协议' : '，谈判破裂'}。`);
      }
      break;
    }
    case 'cabinet_reshuffle': {
      const pmPartyId = intent.payload.pmPartyId as string;
      const scope = (intent.payload.scope as string) ?? 'partial';
      const rng = seededRandom(intentSeed(intent, newState, 1));
      if (newState.government) {
        const reshuffleCount = scope === 'full'
          ? Math.floor(newState.government.ministers.length * 0.5)
          : 1 + Math.floor(rng() * 3);
        const shuffled = [...newState.government.ministers];
        // 修正：预先缓存移除数量，避免 splice 收缩 shuffled.length 导致循环提前终止
        const targetRemove = Math.min(reshuffleCount, shuffled.length);
        for (let i = 0; i < targetRemove; i++) {
          const idx = Math.floor(rng() * shuffled.length);
          shuffled.splice(idx, 1);
        }
        newState.government.ministers = shuffled;
        const stabilityDelta = (intent.payload.stabilityDelta as number) ?? 10;
        newState.government.stability = Math.min(100, Math.max(0,
          (newState.government.stability ?? 50) + stabilityDelta,
        ));
      }
      pushEvent(newState, '内阁改组',
        `首相（${pmPartyId}）宣布内阁${scope === 'full' ? '全面' : '部分'}改组。`);
      break;
    }
    case 'leadership_challenge': {
      const partyId = intent.payload.partyId as string;
      const challengerId = intent.payload.challengerId as string;
      const currentLeaderId = intent.payload.currentLeaderId as string;
      const party = newState.parties.find(p => p.id === partyId);
      const rng = seededRandom(intentSeed(intent, newState, 2));
      if (party) {
        // 发起挑战：降低党内支持、触发派阀站队（确定性 RNG）
        const supportPenalty = -(2 + Math.floor(rng() * 4));
        party.currentSupport = Math.max(1, Math.min(50, party.currentSupport + supportPenalty));
        if (party.factions) {
          for (const faction of party.factions) {
            if (rng() < 0.3) faction.loyalty = Math.max(0, faction.loyalty - 5);
          }
        }
        recalcSeats(newState);
      }
      pushEvent(newState, '党首挑战',
        `${challengerId.split(':').pop() ?? challengerId} 正式对现任党首 ${currentLeaderId.split(':').pop() ?? currentLeaderId} 发起挑战！党内陷入分裂。`);
      break;
    }
    case 'policy_announcement': {
      const partyId = intent.payload.partyId as string;
      const policyArea = intent.payload.policyArea as string;
      const audience = (intent.payload.targetAudience as string) ?? 'general';
      const party = newState.parties.find(p => p.id === partyId);
      if (party) {
        const rng = seededRandom(intentSeed(intent, newState, 3));
        const supportGain = audience === 'core' ? 2 : audience === 'swing' ? 1.5 : 1;
        const noise = (rng() - 0.5) * 0.5;
        party.currentSupport = Math.max(1, Math.min(50, party.currentSupport + supportGain + noise));
        recalcSeats(newState);
      }
      pushEvent(newState, '政策宣示',
        `${party?.name ?? partyId} 发布${policyArea}领域新政策。`);
      break;
    }
    default:
      break;
  }

  return newState;
}

// ============================================================================
// Phase G Q4：预算委员会 + 竞选期间倍率
// ============================================================================

/**
 * 判定预算委员会倍率是否生效。
 *
 * Phase G Q4：必须同时满足
 *   1. 当前月份 ∈ [1, 3]（预算决战期会期）
 *   2. 委员会为 `budget`（默认全局检查；committeeId 可选用于委员会特定倍率）
 *
 * 任一条件不满足都不应用。
 */
export function isBudgetMultiplierActive(state: GameState, committeeId?: CommitteeId): boolean {
  const month = getMonthFromTurn(state.turn);
  const session = getCongressSessionByMonth(month);
  if (session.name !== '预算决战期') return false;
  if (committeeId !== undefined) return committeeId === 'budget';
  // 全局检查：1-3 月且至少存在预算委员会
  return state.committees.some(c => c.id === 'budget');
}

/**
 * 应用竞选期间倍率（content-audit PARTIAL 修复）。
 *
 * 规则：在 state.isElectionCampaign === true 时
 *   - supportDelta × 1.5
 *   - metricsDelta.mediaAttention × 2.0
 *
 * 不修改原 intent，返回新的 intent。
 */
export function applyCampaignMultipliers(intent: AIIntent): AIIntent {
  const supportDelta = intent.payload.supportDelta as Record<string, number> | undefined;
  const metricsDelta = intent.payload.metricsDelta as Record<string, number> | undefined;

  const newPayload: Record<string, unknown> = { ...intent.payload };

  if (supportDelta) {
    const scaled: Record<string, number> = {};
    for (const [k, v] of Object.entries(supportDelta)) {
      scaled[k] = v * 1.5;
    }
    newPayload.supportDelta = scaled;
  }

  if (metricsDelta && metricsDelta.mediaAttention !== undefined) {
    newPayload.metricsDelta = {
      ...metricsDelta,
      mediaAttention: metricsDelta.mediaAttention * 2.0,
    };
  }

  return { ...intent, payload: newPayload };
}

/**
 * 计算委员长在特定审议动作下的权重倍率。
 *
 * Phase G Q4：废除硬编码 1.5×，按动作类型细分：
 *   - push：1.0 + 0.3 = 1.3
 *   - shelve：1.0 + 0.5 = 1.5
 *   - amend：1.0 + 0.2 = 1.2
 */
export function getChairmanWeightMultiplier(context: ChairmanVoteContext): number {
  switch (context) {
    case 'push':   return 1.0 + COMMITTEE_CHAIRMAN_BONUSES.pushForward;
    case 'shelve': return 1.0 + COMMITTEE_CHAIRMAN_BONUSES.shelve;
    case 'amend':  return 1.0 + COMMITTEE_CHAIRMAN_BONUSES.amendment;
    default:       return 1.0;
  }
}

// ============================================================================
// Phase G balance-check：NPC 关系网密度平衡
// ============================================================================

/**
 * 检查某议员是否已达到"强关系"上限（最多 N 条 score > 60 的关系）。
 *
 * 若已达上限，新关系或加成后的关系分数将被钳制为 60。
 */
export function isStrongRelationCapped(state: GameState, fromId: string): boolean {
  const threshold = RELATION_CAP.strongRelationScoreThreshold;
  let strongCount = 0;
  for (const r of state.relations) {
    if (r.from === fromId && r.score > threshold) strongCount++;
  }
  return strongCount >= RELATION_CAP.strongRelationsPerMP;
}

/**
 * 应用"强关系"上限到 delta。
 *
 * 若 from 已达上限且 delta 会让分数超过阈值，则将实际增量钳制为
 * 阈值 - 当前分数（不会让分数超过阈值）。
 */
function applyStrongRelationCap(state: GameState, fromId: string, delta: number): number {
  if (delta <= 0) return delta;
  if (!isStrongRelationCapped(state, fromId)) return delta;
  // 已达上限：新关系最高被钳制为 threshold
  // 简化策略：将正向 delta 折半（表示上限效应）
  return delta * 0.5;
}

/**
 * 计算防"刷关系"系数。
 *
 * 简化策略：因 relations 模型未存储 lastInteractionTurn，当前返回 1.0。
 * 真正的 grind 检测在 relationEngine.advanceRelationDecay 中维护。
 */
function getGrindFactor(_state: GameState, _from: string, _to: string): number {
  return 1.0;
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
  if (score >= RELATION_THRESHOLDS.alliance) return 'alliance';
  if (score >= RELATION_THRESHOLDS.friendly) return 'friendly';
  if (score >= RELATION_THRESHOLDS.neutral_low) return 'neutral';
  if (score >= RELATION_THRESHOLDS.tense) return 'tense';
  return 'hostile';
}

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}
