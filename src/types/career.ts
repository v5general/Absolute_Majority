/**
 * 党内晋升路线 (8 级)
 *
 * Phase G 决策：删除"青年局干部"，新增"政策委员会委员长"。
 * 顺序：普通党员 → 党务干部 → 政策委员会委员 → 政策委员会委员长
 *       → 副干事长 → 干事长 → 副党首 → 党首
 */
export const PARTY_RANKS = [
  '普通党员',
  '党务干部',
  '政策委员会委员',
  '政策委员会委员长',
  '副干事长',
  '干事长',
  '副党首',
  '党首',
] as const;

export type PartyRank = typeof PARTY_RANKS[number];

/**
 * 党派别名（per-party override）
 *
 * 某些党派（如联合工人党 ULP / solidarity）使用不同的党内职位称呼。
 * 未列出的党派使用 PARTY_RANKS 默认名称。
 */
export const PARTY_RANK_ALIASES: Record<string, Partial<Record<PartyRank, string>>> = {
  // 联合工人党（ULP / solidarity）：列宁式政党，使用"书记局"体系
  solidarity: {
    '党务干部': '组织局干部',
    '副干事长': '副书记',
    '干事长': '书记局长',
    '副党首': '副主席',
    '党首': '主席',
  },
  // 改革民主党（reform）：现代全民党风格
  reform: {
    '政策委员会委员长': '政调会长',
    '干事长': '干事长',
  },
  // 保守党（conservative）：传统派阀政党
  conservative: {
    '政策委员会委员长': '政调会长',
  },
};

/** 国会晋升路线 (9 级，保留政务官层) */
export const PARLIAMENT_RANKS = [
  '普通议员',
  '委员会理事',
  '副委员长',
  '委员长',
  '政务官',
  '副大臣',
  '国务大臣',
  '内阁官房长官',
  '内阁总理大臣',
] as const;

export type ParliamentRank = typeof PARLIAMENT_RANKS[number];

/** 双轨制职业状态 */
export interface CareerState {
  partyRank: PartyRank;
  partyRankIndex: number;
  parliamentRank: ParliamentRank;
  parliamentRankIndex: number;
}

/**
 * 获取党内职位在该党派下的显示名称。
 *
 * 未配置别名时返回 PartyRank 原文。
 */
export function getPartyRankLabel(partyId: string, rank: PartyRank): string {
  return PARTY_RANK_ALIASES[partyId]?.[rank] ?? rank;
}
