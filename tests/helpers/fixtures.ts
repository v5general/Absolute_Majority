/**
 * 共享测试夹具（fixtures）
 *
 * 提供 类型正确的 Party / MPPersonality / Committee / GameState 构造函数，
 * 供 tests/unit/engine/*.test.ts 复用，避免每个测试文件重复构造完整对象
 * 且字段名拼写错误（如 name vs personName）。
 *
 * 这些函数构造的对象通过 TypeScript 严格检查，符合 src/types 中的接口。
 */

import type {
  GameState,
  Party,
  Government,
  Committee,
  CommitteeId,
  CommitteeMember,
  ElectionResult,
  Faction,
  GameEvent,
} from '../../src/types';
import type {
  MPPersonality,
  PersonalityTrait,
  PoliticalIdeology,
} from '../../src/types/mp';
import type { FamilyOrigin, Education, SocialClass, MPBackground } from '../../src/types/background';

// ============================================================================
// Party
// ============================================================================

export interface MakePartyOptions {
  support?: number;
  seats?: number;
  funds?: number;
  hasFactions?: boolean;
  ideology?: Party['ideology'];
}

/** 构造一个最小但类型完整的 Party */
export function makeTestParty(id: string, opts: MakePartyOptions = {}): Party {
  const {
    support = 25,
    seats = 30,
    funds = 100,
    hasFactions = false,
    ideology = 'center',
  } = opts;

  return {
    id,
    name: `党${id}`,
    abbreviation: id.toUpperCase().slice(0, 4),
    color: '#3366cc',
    ideology,
    leader: `党首${id}`,
    description: '测试用党',
    members: [`党员${id}-1`, `党员${id}-2`, `党员${id}-3`],
    baseSupport: support,
    currentSupport: support,
    projectedSeats: seats,
    funds,
    organization: 50,
    charisma: 50,
    factions: hasFactions ? [makeTestFaction(id)] : undefined,
  };
}

/** 构造一个最小但类型完整的 Faction */
export function makeTestFaction(partyId: string): Faction {
  return {
    id: `faction-${partyId}`,
    name: `${partyId}核心派`,
    leader: `${partyId}:党首${partyId}`,
    members: [`${partyId}:党员${partyId}-1`, `${partyId}:党员${partyId}-2`],
    ideology: 'mainstream',
    loyalty: 60,
    influence: 50,
    funding: 100,
    ambition: 50,
    demands: ['cabinet_post'],
    partyId,
  };
}

// ============================================================================
// MPPersonality
// ============================================================================

export interface MakeMPOptions {
  partyId?: string;
  politicalCapital?: number | null;
  factionId?: string | null;
  loyalty?: number;
  ambition?: number;
  popularity?: number;
  negotiationSkill?: number;
  mediaSkill?: number;
  corruption?: number;
  age?: number;
  gender?: 'male' | 'female';
  isLeader?: boolean;
  isMinister?: boolean;
  isCommitteeChairman?: boolean;
  deceased?: boolean;
  background?: MPBackground;
}

/**
 * 构造一个最小但类型完整的 MPPersonality。
 *
 * key（"partyId:personName"）由调用方决定，id 字段同步设置。
 * 政治资本：null 视为"未初始化"（即 omit 字段）；数字则原样赋值。
 */
export function makeTestMP(key: string, opts: MakeMPOptions = {}): MPPersonality {
  const [partyId, personName] = key.includes(':')
    ? key.split(':')
    : ['reform', key];

  const personalityTraits: PersonalityTrait[] = ['pragmatic'];
  const politicalIdeology = {
    primary: 'liberalism' as PoliticalIdeology,
    economicAxis: 0,
    socialAxis: 0,
  };

  const mp: MPPersonality = {
    id: key,
    personName: personName ?? key,
    partyId: opts.partyId ?? partyId,
    age: opts.age ?? 45,
    gender: opts.gender ?? 'male',
    ambition: opts.ambition ?? 50,
    loyalty: opts.loyalty ?? 50,
    corruption: opts.corruption ?? 20,
    popularity: opts.popularity ?? 50,
    mediaSkill: opts.mediaSkill ?? 50,
    negotiationSkill: opts.negotiationSkill ?? 50,
    personalityTraits,
    politicalIdeology,
    stress: 20,
    health: 80,
    hiddenGoals: [],
    isLeader: opts.isLeader ?? false,
    isMinister: opts.isMinister ?? false,
    isCommitteeChairman: opts.isCommitteeChairman ?? false,
  };

  // 政治资本：null => omit（视为未初始化）；否则赋值
  if (opts.politicalCapital !== null && opts.politicalCapital !== undefined) {
    mp.politicalCapital = opts.politicalCapital;
  }

  if (opts.factionId !== undefined) {
    mp.factionId = opts.factionId;
  }
  if (opts.deceased) {
    mp.deceased = true;
    mp.deathCause = 'illness';
    mp.deathTurn = 1;
  }
  if (opts.background) {
    mp.background = opts.background;
  }

  return mp;
}

// ============================================================================
// Background
// ============================================================================

export interface MakeBackgroundOptions {
  familyOrigin?: FamilyOrigin;
  education?: Education;
  socialClass?: SocialClass;
}

/** 构造一个最小但类型完整的 MPBackground */
export function makeTestBackground(opts: MakeBackgroundOptions = {}): MPBackground {
  return {
    familyOrigin: opts.familyOrigin ?? 'salaryman',
    education: opts.education ?? 'national_university',
    career: '公务员',
    socialClass: opts.socialClass ?? 'middle',
    hometown: '东京',
    connections: [],
    modifiers: {
      factionAcceptanceBonus: 0,
      recommendationBonus: 0,
      mediaAttentionBonus: 0,
      fundraisingBonus: 0,
      scandalRiskModifier: 0,
      populistAppealBonus: 0,
      grassrootsSupportBonus: 0,
      factionBuildingSpeed: 1,
    },
  };
}

// ============================================================================
// Committee
// ============================================================================

export interface MakeCommitteeOptions {
  id?: CommitteeId;
  chairmanName?: string;
  memberCount?: number;
  presentCount?: number;
}

/** 构造一个最小但类型完整的 Committee */
export function makeTestCommittee(opts: MakeCommitteeOptions = {}): Committee {
  const {
    id = 'general',
    chairmanName = '委员长A',
    memberCount = 5,
    presentCount,
  } = opts;

  const members: CommitteeMember[] = Array.from({ length: memberCount }, (_, i) => ({
    personName: i === 0 ? chairmanName : `委员${i}`,
    partyId: 'reform',
  }));

  const present = members.slice(0, presentCount ?? memberCount).map(m => m.personName);

  return {
    id,
    chairman: members[0],
    viceChairman: members[1],
    members,
    presentMembers: present,
    ideology: 'center',
    efficiency: 50,
  };
}

// ============================================================================
// GameEvent
// ============================================================================

export interface MakeEventOptions {
  title?: string;
  impact?: Record<string, number>;
}

/** 构造一个最小但类型完整的 GameEvent */
export function makeTestEvent(opts: MakeEventOptions = {}): GameEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    day: 1,
    title: opts.title ?? '测试事件',
    description: '测试事件描述',
    impact: opts.impact ?? {},
  };
}

// ============================================================================
// ElectionResult
// ============================================================================

export interface MakeElectionResultOptions {
  partySeats?: Record<string, number>;
  totalSeats?: number;
}

/** 构造一个最小但类型完整的 ElectionResult */
export function makeTestElectionResult(opts: MakeElectionResultOptions = {}): ElectionResult {
  const { partySeats = {}, totalSeats = 200 } = opts;
  const partyResults = Object.entries(partySeats).map(([partyId, seats]) => ({
    partyId,
    seats,
    supportPercent: 0,
  }));
  return {
    partyResults,
    hasMajority: false,
    majorityPartyId: null,
    totalSeats,
    majorityThreshold: 101,
    districtResults: {},
  };
}

// ============================================================================
// GameState
// ============================================================================

export interface MakeStateOptions {
  parties?: Party[];
  committees?: Committee[];
  mpPersonalities?: Record<string, MPPersonality>;
  government?: Government | null;
  turn?: number;
  isElectionCampaign?: boolean;
  consecutiveLowSupportTurns?: number;
}

/** 构造一个最小但类型完整的 GameState */
export function makeTestState(opts: MakeStateOptions = {}): GameState {
  return {
    parties: opts.parties ?? [
      makeTestParty('reform', { support: 30, seats: 50 }),
      makeTestParty('liberty', { support: 20, seats: 40 }),
      makeTestParty('conservative', { support: 18, seats: 35 }),
      makeTestParty('progressive', { support: 15, seats: 30 }),
      makeTestParty('populist', { support: 12, seats: 25 }),
      makeTestParty('solidarity', { support: 10, seats: 20 }),
    ],
    relations: [],
    metrics: {
      totalVoters: 100_000_000,
      turnoutRate: 60,
      swingVoterRatio: 20,
      daysToElection: 1440,
      totalSeats: 200,
      majorityThreshold: 101,
      leadingCoalitionSeats: 100,
      economicIndex: 50,
      socialStabilityIndex: 60,
      mediaAttention: 50,
    },
    districts: [],
    events: [],
    government: opts.government ?? null,
    committees: opts.committees ?? [],
    bills: [],
    pendingIntents: [],
    mpPersonalities: opts.mpPersonalities ?? {},
    playerConfig: null,
    currentAIEvents: [],
    currentDay: 1,
    turn: opts.turn ?? 1,
    turnsUntilElection: 48 - (opts.turn ?? 1),
    isElectionCampaign: opts.isElectionCampaign ?? false,
    consecutiveLowSupportTurns: opts.consecutiveLowSupportTurns,
  };
}
