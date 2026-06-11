/** 党内晋升路线 (8级) */
export const PARTY_RANKS = [
  '普通党员',
  '青年局干部',
  '政策委员会成员',
  '党务干部',
  '副干事长',
  '干事长',
  '副党首',
  '党首',
] as const;

export type PartyRank = typeof PARTY_RANKS[number];

/** 国会晋升路线 (9级) */
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
