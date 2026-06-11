import type { Minister, Party, ElectionResult, CabinetPost } from '../types/game';
import type { Faction } from '../types/faction';
import type { MPPersonality } from '../types/mp';

/** 增强版内阁组建（考虑派阀平衡） */
export function formCabinetV2(
  parties: Party[],
  rulingCoalitionIds: string[],
  electionResult: ElectionResult,
  _relations: unknown,
  factions: Record<string, Faction[]>,
  mpPersonalities: Record<string, MPPersonality>,
): Minister[] {
  const partyMap = new Map(parties.map(p => [p.id, p]));
  const coalitionResults = rulingCoalitionIds
    .map(pid => ({ partyId: pid, seats: electionResult.partyResults.find(r => r.partyId === pid)?.seats ?? 0 }))
    .sort((a, b) => b.seats - a.seats);

  if (coalitionResults.length === 0) return [];

  const ministers: Minister[] = [];
  const usedNames = new Set<string>();

  // 首相：最大党领袖
  const pmPartyId = coalitionResults[0].partyId;
  const pmParty = partyMap.get(pmPartyId);
  if (pmParty) {
    ministers.push({
      post: 'prime_minister',
      partyId: pmPartyId,
      personName: pmParty.leader,
    });
    usedNames.add(pmParty.leader);
  }

  // 官房长官：首相党内成员
  const pmPartyMembers = getPartyMembers(pmPartyId, parties, mpPersonalities);
  const chiefSecCandidate = pmPartyMembers.find(n => !usedNames.has(n));
  if (chiefSecCandidate) {
    ministers.push({ post: 'chief_secretary', partyId: pmPartyId, personName: chiefSecCandidate });
    usedNames.add(chiefSecCandidate);
  }

  // 其余职位：考虑派阀平衡
  const remainingPosts: CabinetPost[] = ['finance_minister', 'foreign_minister', 'defense_minister', 'health_minister', 'economy_minister'];
  const partyFactions = factions[pmPartyId] ?? [];

  for (const post of remainingPosts) {
    // 先尝试从不同派阀选人
    let assigned = false;
    for (const faction of partyFactions) {
      // 检查该派阀是否已有人入阁
      const factionInCabinet = ministers.some(m =>
        faction.members.some(memberKey => {
          const mp = mpPersonalities[memberKey];
          return mp?.personName === m.personName;
        })
      );
      if (factionInCabinet) continue;

      // 从该派阀选能力最高的成员
      const candidates = faction.members
        .map(key => mpPersonalities[key])
        .filter(mp => mp && !usedNames.has(mp.personName))
        .sort((a, b) => (b!.negotiationSkill + b!.loyalty) - (a!.negotiationSkill + a!.loyalty));

      if (candidates.length > 0) {
        ministers.push({ post, partyId: pmPartyId, personName: candidates[0]!.personName });
        usedNames.add(candidates[0]!.personName);
        assigned = true;
        break;
      }
    }

    if (!assigned) {
      // 没有派阀候选人，从普通成员中选
      const candidate = pmPartyMembers.find(n => !usedNames.has(n));
      if (candidate) {
        ministers.push({ post, partyId: pmPartyId, personName: candidate });
        usedNames.add(candidate);
      }
    }
  }

  return ministers;
}

function getPartyMembers(partyId: string, parties: Party[], _mpPersonalities: Record<string, MPPersonality>): string[] {
  const party = parties.find(p => p.id === partyId);
  if (!party) return [];
  return [party.leader, ...party.members];
}

/** 计算派阀平衡得分 */
export function calculateFactionBalance(
  ministers: Minister[],
  factions: Record<string, Faction[]>,
  _parties: Party[],
): number {
  const allFactions = Object.values(factions).flat();
  if (allFactions.length === 0) return 100;

  const ministerNames = new Set(ministers.map(m => m.personName));
  let totalMembers = 0;
  let representedMembers = 0;

  for (const faction of allFactions) {
    totalMembers += faction.members.length;
    if (faction.members.some(m => {
      // 简化检查: 如果派阀领袖名字出现在大臣中
      return ministerNames.has(m.split(':')[1] || m);
    })) {
      representedMembers += faction.members.length;
    }
  }

  return totalMembers > 0 ? Math.round((representedMembers / totalMembers) * 100) : 100;
}

/** 计算叛变概率（派阀不满时） */
export function calculateRebellionProbability(
  faction: Faction,
  postsHeld: number,
  expectedPosts: number,
): number {
  if (postsHeld >= expectedPosts) return 0;
  const deficit = expectedPosts - postsHeld;
  const baseChance = faction.ambition * 0.3 + (100 - faction.loyalty) * 0.2;
  return Math.min(80, Math.round(baseChance + deficit * 10));
}
