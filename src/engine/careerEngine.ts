import type { PartyRank, ParliamentRank, CareerState } from '../types/career';
import { PARTY_RANKS, PARLIAMENT_RANKS } from '../types/career';
import type { MPPersonality } from '../types/mp';
import type { Party, Government, Committee, CabinetPost } from '../types/game';

/** 初始化议员职业状态 */
export function initializeCareer(
  mp: MPPersonality,
  party: Party,
  government: Government | null,
  committees: Committee[],
): CareerState {
  const personName = mp.personName;

  // 党内路线
  let partyRankIndex = 0;
  if (personName === party.leader) {
    partyRankIndex = PARTY_RANKS.length - 1; // 党首
  } else if (party.members.includes(personName)) {
    partyRankIndex = 2 + (mp.ambition > 60 ? 1 : 0); // 政策委员会成员 or 党务干部
  } else {
    partyRankIndex = mp.loyalty > 70 ? 1 : 0; // 青年局干部 or 普通党员
  }

  // 国会路线
  let parliamentRankIndex = 0;

  // 检查是否为总理大臣
  if (government && government.primeMinisterName === personName) {
    parliamentRankIndex = PARLIAMENT_RANKS.length - 1; // 内阁总理大臣
  }
  // 检查是否为大臣
  else if (government && government.ministers.some(m => m.personName === personName)) {
    const minister = government.ministers.find(m => m.personName === personName)!;
    parliamentRankIndex = getMinisterRankIndex(minister.post);
  }
  // 检查是否为委员长
  else {
    for (const c of committees) {
      if (c.chairman.personName === personName) {
        parliamentRankIndex = 3; // 委员长
        break;
      }
      if (c.viceChairman?.personName === personName) {
        parliamentRankIndex = 2; // 副委员长
        break;
      }
    }
  }

  return {
    partyRank: PARTY_RANKS[partyRankIndex],
    partyRankIndex,
    parliamentRank: PARLIAMENT_RANKS[parliamentRankIndex],
    parliamentRankIndex,
  };
}

/** 根据内阁职位获取国会路线等级 */
function getMinisterRankIndex(post: CabinetPost): number {
  switch (post) {
    case 'prime_minister': return 8;    // 内阁总理大臣
    case 'chief_secretary': return 7;    // 内阁官房长官
    case 'finance_minister': return 6;   // 国务大臣
    case 'foreign_minister': return 6;
    case 'defense_minister': return 6;
    case 'health_minister': return 6;
    case 'economy_minister': return 6;
    default: return 5;                   // 副大臣
  }
}

/** 检查党内晋升资格 */
export function checkPartyPromotion(
  mp: MPPersonality,
  career: CareerState,
  party: Party,
): { eligible: boolean; nextRank: PartyRank | null } {
  if (career.partyRankIndex >= PARTY_RANKS.length - 1) {
    return { eligible: false, nextRank: null }; // 已是党首
  }

  const score = calculatePromotionScore(mp, {
    loyalty: mp.loyalty / 100,
    factionSupport: 0.5,
    politicalCapital: mp.negotiationSkill / 100,
    partyReputation: mp.mediaSkill / 100,
    electionPerformance: mp.popularity / 100,
  });

  const nextIndex = career.partyRankIndex + 1;
  const threshold = 0.4 + nextIndex * 0.08; // 越高职位需要越高分数
  return { eligible: score >= threshold, nextRank: PARTY_RANKS[nextIndex] };
}

/** 检查国会晋升资格 */
export function checkParliamentPromotion(
  mp: MPPersonality,
  career: CareerState,
  government: Government | null,
  committees: Committee[],
): { eligible: boolean; nextRank: ParliamentRank | null } {
  // 国会路线由实际职位决定，不主动晋升
  return { eligible: false, nextRank: null };
}

/** 计算晋升综合评分 */
export function calculatePromotionScore(
  mp: MPPersonality,
  factors: {
    loyalty: number;
    factionSupport: number;
    politicalCapital: number;
    partyReputation: number;
    electionPerformance: number;
  },
): number {
  return (
    factors.loyalty * 0.25 +
    factors.factionSupport * 0.25 +
    factors.politicalCapital * 0.2 +
    factors.partyReputation * 0.15 +
    factors.electionPerformance * 0.15
  );
}

/** 运行党首选举 */
export function runPartyLeadershipElection(
  party: Party,
  _factions: unknown,
  mpPersonalities: Record<string, MPPersonality>,
  candidates: string[],
): { winner: string; votes: Record<string, number> } {
  const votes: Record<string, number> = {};

  for (const candidateId of candidates) {
    const mp = mpPersonalities[candidateId];
    if (!mp) continue;
    // 投票权重: 影响力+人气+谈判力
    votes[candidateId] = mp.popularity + mp.negotiationSkill * 0.5 + mp.ambition * 0.3;
  }

  let winner = candidates[0];
  let maxVotes = 0;
  for (const [id, v] of Object.entries(votes)) {
    if (v > maxVotes) {
      maxVotes = v;
      winner = id;
    }
  }

  return { winner, votes };
}

/** 检查党首选举触发条件 */
export function checkLeadershipElectionTriggers(
  party: Party,
  _recentElectionResult?: unknown,
): boolean {
  // 党首支持率 < 25% 时可能触发
  return party.currentSupport < 25;
}

/** 同步职业状态与实际职位 */
export function syncCareerWithPositions(
  career: CareerState,
  isLeader: boolean,
  isMinister: boolean,
  ministerPost: CabinetPost | null,
  isCommitteeChairman: boolean,
): CareerState {
  let partyRankIndex = career.partyRankIndex;
  let parliamentRankIndex = career.parliamentRankIndex;

  if (isLeader) partyRankIndex = PARTY_RANKS.length - 1;
  if (ministerPost) parliamentRankIndex = getMinisterRankIndex(ministerPost);
  else if (isCommitteeChairman) parliamentRankIndex = 3;
  else if (isMinister) parliamentRankIndex = Math.max(parliamentRankIndex, 4);

  return {
    partyRank: PARTY_RANKS[partyRankIndex],
    partyRankIndex,
    parliamentRank: PARLIAMENT_RANKS[parliamentRankIndex],
    parliamentRankIndex,
  };
}
