import type { Faction, FactionDemand, FactionIdeology } from '../types/faction';
import type { Party, Government } from '../types/game';
import type { MPPersonality } from '../types/mp';

const FACTION_IDEOLOGIES: FactionIdeology[] = ['mainstream', 'reformist', 'conservative', 'radical', 'pragmatist'];
const FACTION_DEMANDS: FactionDemand[] = ['cabinet_post', 'committee_chair', 'budget_resource', 'policy_influence', 'media_exposure'];

/** 基于名称的确定性伪随机 */
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (h * 1664525 + 1013904223) | 0;
    return (h >>> 0) / 4294967296;
  };
}

/** 为所有政党初始化派阀（除 ULP/solidarity 外） */
export function initializeFactions(
  parties: Party[],
  mpPersonalities: Record<string, MPPersonality>,
): Record<string, Faction[]> {
  const result: Record<string, Faction[]> = {};

  for (const party of parties) {
    // 联合工人党禁止派阀
    if (party.id === 'solidarity') {
      result[party.id] = [];
      continue;
    }

    // 收集该党所有议员
    const partyMPs = Object.values(mpPersonalities).filter(mp => mp.partyId === party.id);
    if (partyMPs.length < 4) {
      result[party.id] = [];
      continue;
    }

    const rng = seededRandom(party.id + '_factions');
    const factionCount = Math.min(Math.max(2, Math.floor(partyMPs.length / 5)), 4);
    const factions: Faction[] = [];

    // 按野心排序，最野心的成为派阀领袖候选
    const sorted = [...partyMPs].sort((a, b) => b.ambition - a.ambition);
    const leaders = sorted.slice(0, factionCount);

    // 将成员分配到各派阀
    const remaining = sorted.slice(factionCount);
    const memberBuckets: string[][] = leaders.map(l => [l.id]);

    for (const mp of remaining) {
      const bucketIdx = Math.floor(rng() * factionCount);
      memberBuckets[bucketIdx].push(mp.id);
    }

    const familyNames = ['清和', '宏池', '平成', '令和', '至高', '新風', '未来', '改革', '創生', '翼賛'];
    for (let i = 0; i < factionCount; i++) {
      const leaderMP = leaders[i];
      const surname = leaderMP.personName.split(' ')[0] || leaderMP.personName;
      const name = i === 0 ? `${surname}派` : `${familyNames[(i * 3 + Math.floor(rng() * familyNames.length)) % familyNames.length]}会`;
      const members = memberBuckets[i];
      const share = members.length / partyMPs.length;

      factions.push({
        id: `${party.id}_faction_${i}`,
        name,
        leader: leaderMP.id,
        members,
        ideology: FACTION_IDEOLOGIES[i % FACTION_IDEOLOGIES.length],
        loyalty: 50 + Math.floor(rng() * 30), // 50-80
        influence: Math.floor(share * 100),
        funding: 50 + Math.floor(rng() * 200),
        ambition: 20 + Math.floor(rng() * 25), // 20-45
        demands: [FACTION_DEMANDS[i % FACTION_DEMANDS.length], FACTION_DEMANDS[(i + 2) % FACTION_DEMANDS.length]],
        partyId: party.id,
      });
    }

    result[party.id] = factions;
  }

  return result;
}

/** 判断派阀是否可以挑战党首 */
export function canChallengeLeader(
  faction: Faction,
  party: Party,
  leaderSupportRate: number,
): boolean {
  const share = faction.members.length / Math.max(1, party.projectedSeats);
  return share >= 0.25 && leaderSupportRate < 35 && faction.loyalty < 40;
}

/** 计算派阀诉求 */
export function calculateFactionDemands(
  faction: Faction,
  _party: Party,
  _government: Government | null,
): FactionDemand[] {
  // 野心越高，诉求越多
  if (faction.ambition > 70) return [...FACTION_DEMANDS].slice(0, 3);
  if (faction.ambition > 50) return faction.demands;
  return [faction.demands[0]];
}

/** 每回合更新派阀忠诚度和野心 */
export function updateFactionLoyalty(
  faction: Faction,
  demandsMet: boolean,
  cabinetPostsHeld: number,
): Faction {
  let { loyalty, ambition } = faction;

  if (demandsMet || cabinetPostsHeld > 0) {
    loyalty = Math.min(100, loyalty + 2 + cabinetPostsHeld * 3);
    ambition = Math.max(0, ambition - 1 - cabinetPostsHeld * 2);
  } else {
    ambition = Math.min(100, ambition + 5);
    loyalty = Math.max(0, loyalty - 3);
  }

  return { ...faction, loyalty, ambition };
}

/** 检查派阀脱党可能性 */
export function checkDefection(
  faction: Faction,
  _party: Party,
): { shouldDefect: boolean; defectionChance: number } {
  if (faction.loyalty >= 20) return { shouldDefect: false, defectionChance: 0 };
  const chance = Math.min(80, (20 - faction.loyalty) * 4);
  return { shouldDefect: chance > 30, defectionChance: chance };
}

/** 获取派阀在党内的份额比例 */
export function getFactionShare(faction: Faction, party: Party): number {
  return faction.members.length / Math.max(1, party.projectedSeats);
}

/** 计算 ULP(联合工人党) 投票纪律 */
export function calculateULPDiscipline(
  mpPersonalities: Record<string, MPPersonality>,
  partyId: string,
): number {
  if (partyId !== 'solidarity') return 0;
  const ulpMembers = Object.values(mpPersonalities).filter(mp => mp.partyId === 'solidarity');
  if (ulpMembers.length === 0) return 100;
  const avgLoyalty = ulpMembers.reduce((sum, mp) => sum + mp.loyalty, 0) / ulpMembers.length;
  // 纪律范围 95-100%，基于平均忠诚度
  return Math.max(95, Math.min(100, Math.round(avgLoyalty * 0.05 + 93)));
}

/** 获取某党某派阀所获得的内阁职位数 */
export function getFactionCabinetPosts(
  faction: Faction,
  ministerPersonNames: string[],
): number {
  return faction.members.filter(m => ministerPersonNames.includes(m)).length;
}
