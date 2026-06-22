/**
 * 政治 AI 引擎
 *
 * 让所有 200 名议员拥有独立政治人格，每回合基于人格和游戏状态生成行动意图。
 *
 * 核心约束（遵守项目 CONSTITUTION 规则 #5）：
 * - AI 只能返回 Intent，绝不直接修改 GameState
 * - 所有意图必须经过 rulesEngine 校验和结算
 *
 * 数据流：
 *   politicalAIEngine → AIIntent[]
 *     → rulesEngine.validateIntent() → 校验
 *     → rulesEngine.settleIntent()    → 结算（唯一修改 State 的入口）
 */

import type {
  Party,
  Committee,
  ElectionResult,
  Government,
  AIIntent,
  GameState,
  Ideology,
} from '../types';
import type { MPPersonality, HiddenGoal } from '../types';
import { generateBackground, applyBackgroundToPersonality } from './backgroundEngine';
import { initializeCareer } from './careerEngine';
import { findPersonPreset } from '../data/keyPeoplePresets';
import type { Faction } from '../types/faction';

// ===== 名字性别判断 =====

/**
 * 根据名字判断性别
 * 基于名字最后一个字来判断（日本名字习惯）
 */
function inferGenderFromName(name: string): 'male' | 'female' {
  const lastChar = name.slice(-1);

  // 常见女性名字结尾字
  const femaleEndings = ['咲', '纪', '美', '惠', '京', '奈', '菜', '花', '枝', '纱', '子', '由', '代', '实', '里', '洋'];

  // 如果最后一个字是女性名字结尾，则判断为女性
  if (femaleEndings.includes(lastChar)) {
    return 'female';
  }

  // 否则默认为男性
  return 'male';
}

// ===== 确定性随机数生成器 =====

/** 基于字符串的哈希种子 */
function seedFromName(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return hash;
}

/** 线性同余 RNG，确保同一种子产出相同序列 */
function seededRandom(seed: number): () => number {
  let s = Math.abs(seed) + 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** 限制数值范围 */
function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

// ===== 意识形态工具 =====

const IDEOLOGY_ORDER: Ideology[] = [
  'far-left', 'left', 'center-left', 'center', 'center-right', 'right', 'far-right',
];

function ideologyPosition(ideo: Ideology): number {
  return IDEOLOGY_ORDER.indexOf(ideo);
}

// ===== 隐藏目标池 =====

const LEADER_GOALS: HiddenGoal[] = [
  'become_prime_minister', 'maintain_status_quo',
  'pass_tax_reform', 'pass_labor_reform', 'pass_defense_reform', 'pass_healthcare_reform',
  'gain_media_attention',
];

const MINISTER_GOALS: HiddenGoal[] = [
  'expand_faction', 'gain_media_attention', 'maintain_status_quo',
  'pass_tax_reform', 'pass_labor_reform', 'accumulate_wealth',
];

const CHAIRMAN_GOALS: HiddenGoal[] = [
  'pass_tax_reform', 'pass_labor_reform', 'pass_defense_reform', 'pass_healthcare_reform',
  'gain_media_attention', 'expand_faction',
];

const BACKBENCHER_GOALS: HiddenGoal[] = [
  'become_prime_minister', 'become_finance_minister', 'become_foreign_minister',
  'become_defense_minister', 'become_health_minister', 'become_economy_minister',
  'become_chief_secretary', 'destroy_rival_faction', 'expand_faction',
  'gain_media_attention', 'accumulate_wealth',
];

/** 从目标池中随机选择 n 个不重复的目标 */
function pickGoals(pool: HiddenGoal[], count: number, rng: () => number): HiddenGoal[] {
  const shuffled = [...pool].sort(() => rng() - 0.5);
  return shuffled.slice(0, count);
}

// ===== 人格生成 =====

/**
 * 为所有议员生成政治人格
 *
 * 在游戏初始化时调用一次（选举、组阁、委员会组建之后）。
 * 领导者人格由党派属性驱动；成员和后排议员使用带种子的随机。
 *
 * @param parties 所有党派
 * @param committees 所有委员会（含成员列表）
 * @param _electionResult 选举结果
 * @param government 政府信息（含内阁大臣列表）
 */
export function generatePersonalities(
  parties: Party[],
  committees: Committee[],
  _electionResult: ElectionResult,
  government: Government | null,
): Record<string, MPPersonality> {
  const result: Record<string, MPPersonality> = {};

  // 收集特殊角色
  const ministerNames = new Set<string>();
  const chairmanNames = new Set<string>();
  if (government) {
    for (const m of government.ministers) {
      ministerNames.add(m.personName);
    }
  }
  for (const c of committees) {
    chairmanNames.add(c.chairman.personName);
  }

  // 收集所有议员姓名（从委员会成员列表）
  const allMPs = new Map<string, { personName: string; partyId: string }>();
  for (const c of committees) {
    for (const m of c.members) {
      const key = `${m.partyId}:${m.personName}`;
      if (!allMPs.has(key)) {
        allMPs.set(key, { personName: m.personName, partyId: m.partyId });
      }
    }
  }

  // 为每个议员生成人格 + 背景 + 职业
  for (const [key, mp] of allMPs) {
    const party = parties.find((p) => p.id === mp.partyId);
    if (!party) continue;

    const isLeader = party.leader === mp.personName;
    const isMinister = ministerNames.has(mp.personName);
    const isCommitteeChairman = chairmanNames.has(mp.personName);

    let personality = generatePersonality(
      mp.personName,
      mp.partyId,
      party,
      isLeader,
      isMinister,
      isCommitteeChairman,
    );

    // 生成背景并应用修正
    const background = generateBackground(mp.personName, mp.partyId, party);
    personality = applyBackgroundToPersonality(personality, background);
    personality.background = background;

    // 初始化职业状态
    personality.career = initializeCareer(personality, party, government, committees);

    result[key] = personality;
  }

  return result;
}

/**
 * 生成单个议员的政治人格
 *
 * 使用议员姓名作为种子，确保确定性重放。
 */
export function generatePersonality(
  personName: string,
  partyId: string,
  party: Party,
  isLeader: boolean,
  isMinister: boolean,
  isCommitteeChairman: boolean,
): MPPersonality {
  const seed = seedFromName(personName);
  const rng = seededRandom(seed);

  // 检查是否有预设数据
  const preset = findPersonPreset(partyId, personName);

  let ambition: number;
  let loyalty: number;
  let corruption: number;
  let popularity: number;
  let mediaSkill: number;
  let negotiationSkill: number;
  let stress: number;
  let health: number;
  let hiddenGoals: HiddenGoal[] = [];

  // === 生成性格特质 (1-3个) ===
  const personalityTraits = preset
    ? preset.personalityTraits
    : generatePersonalityTraits(isLeader, isMinister, isCommitteeChairman, rng);

  // === 生成政治意识形态 ===
  const politicalIdeology = generatePoliticalIdeology(party, rng);

  // 预设的政治目标优先
  if (preset) {
    hiddenGoals = preset.hiddenGoals;
  }

  if (isLeader) {
    // 党首：高野心，由党派魅力驱动
    ambition = clamp(70 + party.charisma * 0.3 + rng() * 10);
    loyalty = clamp(50 + rng() * 20);
    corruption = clamp(20 + rng() * 25);
    popularity = clamp(40 + party.charisma * 0.4 + rng() * 10);
    mediaSkill = clamp(30 + party.charisma * 0.3 + rng() * 15);
    negotiationSkill = clamp(40 + party.organization * 0.2 + rng() * 15);
    stress = clamp(20 + rng() * 20);
    health = clamp(70 + rng() * 20);
    if (!preset) hiddenGoals = pickGoals(LEADER_GOALS, 2, rng);
  } else if (isMinister) {
    // 大臣：中等野心，高忠诚（已有职位）
    ambition = clamp(40 + rng() * 30);
    loyalty = clamp(60 + rng() * 25);
    corruption = clamp(25 + rng() * 30);
    popularity = clamp(30 + rng() * 25);
    mediaSkill = clamp(25 + rng() * 35);
    negotiationSkill = clamp(35 + rng() * 35);
    stress = clamp(25 + rng() * 30);
    health = clamp(65 + rng() * 25);
    if (!preset) hiddenGoals = pickGoals(MINISTER_GOALS, 2, rng);
  } else if (isCommitteeChairman) {
    // 委员长：委员会相关目标
    ambition = clamp(35 + rng() * 35);
    loyalty = clamp(50 + rng() * 30);
    corruption = clamp(15 + rng() * 35);
    popularity = clamp(20 + rng() * 30);
    mediaSkill = clamp(20 + rng() * 40);
    negotiationSkill = clamp(30 + rng() * 40);
    stress = clamp(20 + rng() * 25);
    health = clamp(70 + rng() * 25);
    if (!preset) hiddenGoals = pickGoals(CHAIRMAN_GOALS, 2, rng);
  } else {
    // 后排议员：高方差，5% 概率成为"潜伏者"
    ambition = clamp(10 + rng() * 80);
    loyalty = clamp(20 + rng() * 70);
    corruption = clamp(10 + rng() * 50);
    popularity = clamp(5 + rng() * 30);
    mediaSkill = clamp(10 + rng() * 45);
    negotiationSkill = clamp(10 + rng() * 50);
    stress = clamp(10 + rng() * 30);
    health = clamp(75 + rng() * 20);

    // 5% 概率成为潜伏者（超高野心）
    if (rng() < 0.05) {
      ambition = clamp(85 + rng() * 15);
      popularity = clamp(30 + rng() * 25);
      if (!preset) hiddenGoals = pickGoals(
        ['become_prime_minister', 'destroy_rival_faction', 'seek_cabinet'] as HiddenGoal[],
        2,
        rng,
      );
    } else {
      if (!preset) hiddenGoals = pickGoals(BACKBENCHER_GOALS, rng() < 0.5 ? 1 : 2, rng);
    }
  }

  // 年龄：预设优先，否则基于种子确定性生成
  const age = preset
    ? preset.age
    : isLeader
      ? 40 + Math.floor(rng() * 30)            // 党首 40-70
      : isMinister
        ? 38 + Math.floor(rng() * 30)          // 大臣 38-68
        : isCommitteeChairman
          ? 35 + Math.floor(rng() * 35)        // 委员长 35-70
          : Math.max(25, Math.floor(rng() * rng() * 55) + 25); // 后排 25-80，偏年轻
  // 性别：始终基于名字判断
  const gender: 'male' | 'female' = inferGenderFromName(personName);

  return {
    id: `${partyId}:${personName}`,
    personName,
    partyId,
    age,
    gender,
    ambition,
    loyalty,
    corruption,
    popularity,
    mediaSkill,
    negotiationSkill,
    personalityTraits,
    politicalIdeology,
    stress,
    health,
    hiddenGoals,
    isLeader,
    isMinister,
    isCommitteeChairman,
  };
}

/**
 * 生成性格特质 (1-3个)
 */
function generatePersonalityTraits(
  isLeader: boolean,
  isMinister: boolean,
  isCommitteeChairman: boolean,
  rng: () => number,
): import('../types/mp').PersonalityTrait[] {
  const allTraits: import('../types/mp').PersonalityTrait[] = [
    'decisive', 'cheerful', 'gregarious', 'diligent', 'honest', 'generous',
    'brave', 'temperate', 'forgiving', 'calm',
    'cruel', 'impulsive', 'withdrawn', 'lazy', 'deceitful', 'greedy',
    'craven', 'indulgent', 'vengeful', 'stubborn',
    'charismatic', 'analytical', 'empathetic', 'cynical', 'pragmatic',
    'idealistic', 'traditional', 'progressive', 'independent', 'conformist',
    'aggressive', 'diplomatic', 'ambitious_trait', 'cautious', 'radical', 'moderate',
  ];

  // 根据角色筛选更可能的特质
  let likelyTraits: import('../types/mp').PersonalityTrait[] = [];
  if (isLeader) {
    likelyTraits = ['charismatic', 'decisive', 'ambitious_trait', 'aggressive', 'diplomatic', 'cautious', 'stubborn', 'cynical'];
  } else if (isMinister) {
    likelyTraits = ['pragmatic', 'diplomatic', 'analytical', 'cautious', 'diligent', 'greedy', 'deceitful'];
  } else if (isCommitteeChairman) {
    likelyTraits = ['moderate', 'traditional', 'progressive', 'analytical', 'diligent'];
  } else {
    likelyTraits = allTraits; // 后排议员：完全随机
  }

  const numTraits = Math.floor(rng() * 3) + 1; // 1-3个特质
  const traits: import('../types/mp').PersonalityTrait[] = [];

  for (let i = 0; i < numTraits; i++) {
    // 60% 概率从 likelyTraits 中选择，40% 从所有特质中选择
    const useLikely = rng() < 0.6 && likelyTraits.length > 0;
    const sourcePool = useLikely ? likelyTraits : allTraits;

    const traitIndex = Math.floor(rng() * sourcePool.length);
    const trait = sourcePool[traitIndex];

    // 避免重复
    if (!traits.includes(trait)) {
      traits.push(trait);
    }
  }

  return traits;
}

/**
 * 生成政治意识形态
 */
function generatePoliticalIdeology(
  party: Party,
  rng: () => number,
): { primary: import('../types/mp').PoliticalIdeology; secondary?: import('../types/mp').PoliticalIdeology; economicAxis: number; socialAxis: number } {
  // 将党派意识形态映射到详细的意识形态
  const primaryIdeology = mapPartyIdeologyToDetailed(party.ideology, rng);

  // 次要意识形态：30% 概率有，但必须与主要意识形态不同
  let secondaryIdeology: import('../types/mp').PoliticalIdeology | undefined = undefined;
  if (rng() < 0.3) {
    // 尝试生成不同的次要意识形态
    let attempts = 0;
    while (attempts < 10) {
      const candidate = mapPartyIdeologyToDetailed(party.ideology, rng);
      if (candidate !== primaryIdeology) {
        secondaryIdeology = candidate;
        break;
      }
      attempts++;
    }
  }

  // 经济轴：基于党派意识形态 + 随机偏移
  // -100 (极左) 到 +100 (极右)
  // 调整为更符合现实的分布：极端党派内部也有温和派
  let economicAxis = 0;
  switch (party.ideology) {
    case 'far-left':
      // 60% 左(-80~-50), 30% 中间偏左(-50~-20), 10% 极左(-100~-80)
      const rollFL = rng();
      if (rollFL < 0.6) economicAxis = clamp(-80 + rng() * 30, -100, -50);
      else if (rollFL < 0.9) economicAxis = clamp(-50 + rng() * 30, -60, -20);
      else economicAxis = clamp(-95 + rng() * 15, -100, -80);
      break;
    case 'left':
      // 70% 左(-60~-30), 30% 中间偏左(-30~0)
      economicAxis = rng() < 0.7
        ? clamp(-60 + rng() * 30, -70, -30)
        : clamp(-30 + rng() * 30, -40, 0);
      break;
    case 'center-left':
      // 60% 中间偏左(-20~+10), 40% 左(-40~-20)
      economicAxis = rng() < 0.6
        ? clamp(-20 + rng() * 30, -35, 15)
        : clamp(-40 + rng() * 20, -50, -20);
      break;
    case 'center':
      // 80% 中间(-15~+15), 20% 略偏左或偏右
      economicAxis = rng() < 0.8
        ? clamp(-15 + rng() * 30, -20, 20)
        : clamp(-10 + rng() * 40, -30, 30);
      break;
    case 'center-right':
      // 60% 中间偏右(0~+30), 40% 右(+30~+50)
      economicAxis = rng() < 0.6
        ? clamp(0 + rng() * 30, -10, 35)
        : clamp(30 + rng() * 20, 20, 55);
      break;
    case 'right':
      // 50% 中间偏右(+10~+35), 35% 右(+35~+50), 15% 极右(+50~+70)
      const rollR = rng();
      if (rollR < 0.5) economicAxis = clamp(10 + rng() * 25, 0, 40);
      else if (rollR < 0.85) economicAxis = clamp(35 + rng() * 15, 30, 55);
      else economicAxis = clamp(50 + rng() * 20, 45, 70);
      break;
    case 'far-right':
      // 40% 右(+20~+45), 40% 中间偏右(+5~+25), 20% 极右(+55~+80)
      const rollFR = rng();
      if (rollFR < 0.4) economicAxis = clamp(20 + rng() * 25, 10, 50);
      else if (rollFR < 0.8) economicAxis = clamp(5 + rng() * 20, -5, 30);
      else economicAxis = clamp(55 + rng() * 25, 50, 85);
      break;
  }

  // 社会轴：基于随机 + 一定倾向
  // -100 (威权) 到 +100 (自由)
  // 极端倾向威权，温和倾向自由
  let socialAxis = 0;
  if (['far-left', 'far-right'].includes(party.ideology)) {
    socialAxis = clamp(-30 + rng() * 80, -100, 0); // 倾向威权: -100 ~ 0
  } else if (['center-left', 'center', 'center-right'].includes(party.ideology)) {
    socialAxis = clamp(20 + rng() * 60, -20, 100); // 倾向自由: -20 ~ +100
  } else {
    socialAxis = clamp(-10 + rng() * 80, -50, 50); // 中间: -50 ~ +50
  }

  return {
    primary: primaryIdeology,
    secondary: secondaryIdeology,
    economicAxis: Math.round(economicAxis),
    socialAxis: Math.round(socialAxis),
  };
}

/**
 * 将党派意识形态映射到详细意识形态
 * 确保意识形态在正确的光谱内
 */
function mapPartyIdeologyToDetailed(
  partyIdeology: import('../types').Ideology,
  rng: () => number,
): import('../types/mp').PoliticalIdeology {
  switch (partyIdeology) {
    case 'far-left':
      const farLeftOptions = ['socialism', 'communism', 'syndicalism', 'trotskyism', 'maoism'];
      return farLeftOptions[Math.floor(rng() * farLeftOptions.length)] as import('../types/mp').PoliticalIdeology;
    case 'left':
      const leftOptions = ['democratic_socialism', 'socialism', 'progressivism', 'environmentalism'];
      return leftOptions[Math.floor(rng() * leftOptions.length)] as import('../types/mp').PoliticalIdeology;
    case 'center-left':
      const centerLeftOptions = ['social_liberalism', 'progressivism', 'liberalism', 'environmentalism'];
      return centerLeftOptions[Math.floor(rng() * centerLeftOptions.length)] as import('../types/mp').PoliticalIdeology;
    case 'center':
      const centerOptions = ['liberalism', 'secularism', 'technocracy', 'progressivism'];
      return centerOptions[Math.floor(rng() * centerOptions.length)] as import('../types/mp').PoliticalIdeology;
    case 'center-right':
      const centerRightOptions = ['liberal_conservatism', 'conservatism', 'secularism'];
      return centerRightOptions[Math.floor(rng() * centerRightOptions.length)] as import('../types/mp').PoliticalIdeology;
    case 'right':
      const rightOptions = ['conservatism', 'neoconservatism', 'traditionalism', 'nationalism'];
      return rightOptions[Math.floor(rng() * rightOptions.length)] as import('../types/mp').PoliticalIdeology;
    case 'far-right':
      const farRightOptions = ['nationalism', 'authoritarianism', 'traditionalism', 'theocracy'];
      return farRightOptions[Math.floor(rng() * farRightOptions.length)] as import('../types/mp').PoliticalIdeology;
    default:
      const allOptions = ['liberalism', 'conservatism', 'progressivism', 'secularism'];
      return allOptions[Math.floor(rng() * allOptions.length)] as import('../types/mp').PoliticalIdeology;
  }
}

// ===== 每回合 AI 循环 =====

/**
 * 运行一回合政治 AI
 *
 * 识别活跃议员 → 为每个活跃议员生成意图 → 去重 → 返回意图数组
 */
export function runPoliticalAI(state: GameState): AIIntent[] {
  const activeMPs = determineActiveMPs(state);
  const intents: AIIntent[] = [];

  for (const mp of activeMPs) {
    const intent = generatePoliticalIntent(mp, state);
    if (intent) {
      intents.push(intent);
    }
  }

  return deduplicateIntents(intents);
}

/**
 * 确定本回合活跃的议员
 *
 * 规则：党首总是活跃；高野心/高压力/有可行动目标的议员也会活跃；随机 10% 激活
 */
export function determineActiveMPs(state: GameState): MPPersonality[] {
  const allPersonalities = Object.values(state.mpPersonalities);
  const active: MPPersonality[] = [];

  for (const mp of allPersonalities) {
    // 跳过已死亡的议员
    if (mp.deceased) continue;

    // 党首总是活跃
    if (mp.isLeader) {
      active.push(mp);
      continue;
    }

    // 高有效野心
    if (calculateAmbition(mp, state) > 60) {
      active.push(mp);
      continue;
    }

    // 高压力
    if (mp.stress > 70) {
      active.push(mp);
      continue;
    }

    // 有可行动的隐藏目标
    const goal = resolveActiveGoal(mp, state);
    if (goal) {
      active.push(mp);
      continue;
    }

    // 随机 10% 激活（用姓名+回合做种子，确保确定性）
    const rng = seededRandom(seedFromName(mp.personName) + state.turn);
    if (rng() < 0.10) {
      active.push(mp);
    }
  }

  return active;
}

/**
 * 为单个议员生成一个政治意图
 *
 * 决策优先级：
 * 1. 压力危机 → stress_event
 * 2. 忠诚危机 → challenge_leader
 * 3. 隐藏目标驱动 → goalToIntent
 * 4. 派系行为 → calculateFactionBehavior
 * 5. 联盟行为（仅党首/大臣） → calculateCoalitionBehavior
 */
export function generatePoliticalIntent(
  mp: MPPersonality,
  state: GameState,
): AIIntent | null {
  // 优先级 1：压力危机
  if (mp.stress > 85 && mp.health < 30) {
    return createStressEventIntent(mp, state);
  }

  // 优先级 2：忠诚危机 → 挑战党首
  const effectiveLoyalty = calculateLoyalty(mp, state);
  if (effectiveLoyalty < 20 && mp.ambition > 60 && !mp.isLeader) {
    return createChallengeLeaderIntent(mp, state);
  }

  // 优先级 3：隐藏目标驱动
  const activeGoal = resolveActiveGoal(mp, state);
  if (activeGoal) {
    const intent = goalToIntent(mp, activeGoal, state);
    if (intent) return intent;
  }

  // 优先级 4：派系行为
  const factionIntent = calculateFactionBehavior(mp, state);
  if (factionIntent) return factionIntent;

  // 优先级 5：联盟行为（仅党首和大臣）
  if (mp.isLeader || mp.isMinister) {
    const coalitionIntent = calculateCoalitionBehavior(mp, state);
    if (coalitionIntent) return coalitionIntent;
  }

  return null;
}

// ===== 行为计算器 =====

/**
 * 计算有效野心（综合基础特质、职位、党派表现、回合进度）
 */
export function calculateAmbition(mp: MPPersonality, state: GameState): number {
  let base = mp.ambition;

  // 职位修正
  if (mp.isLeader) base -= 15;
  else if (mp.isMinister) base -= 5;
  else if (mp.isCommitteeChairman) base -= 3;
  else base += 5;

  // 党派表现修正
  const party = state.parties.find((p) => p.id === mp.partyId);
  if (party) {
    const supportTrend = party.currentSupport - party.baseSupport;
    if (supportTrend < -5) base += 10;
  }

  // 后期紧迫感（第 36 回合 = 选举临近）
  if (state.turn > 36) base += (state.turn - 36) * 1.5;

  return clamp(base);
}

/**
 * 计算有效忠诚度（综合基础特质、党首魅力、党派走势、目标冲突、背景修正）
 */
export function calculateLoyalty(mp: MPPersonality, state: GameState): number {
  let base = mp.loyalty;

  // 党派走势修正
  const party = state.parties.find((p) => p.id === mp.partyId);
  if (party) {
    if (party.currentSupport < party.baseSupport - 5) base -= 15;
  }

  // 隐藏目标冲突：想当首相但不是党首 → 忠诚度降低
  if (mp.hiddenGoals.includes('become_prime_minister') && !mp.isLeader) {
    base -= 20;
  }

  // 背景修正：政治世家对党更忠诚，基层活动家更独立
  if (mp.background) {
    base += mp.background.modifiers.factionAcceptanceBonus * 0.1;
  }

  return clamp(base);
}

/**
 * 计算派系级行为意图
 *
 * 使用实际派系数据：如果议员属于某个派系，检查该派系的忠诚度和诉求；
 * 如果不属于任何派系，可能尝试组建新派系。
 */
export function calculateFactionBehavior(
  mp: MPPersonality,
  state: GameState,
): AIIntent | null {
  const party = state.parties.find((p) => p.id === mp.partyId);

  // 检查议员是否已有派系
  if (mp.factionId && party?.factions) {
    const faction = party.factions.find((f) => f.id === mp.factionId);
    if (faction && faction.loyalty < 40 && mp.ambition > 60 && !mp.isLeader) {
      // 派系不满 + 高野心 → 可能发起挑战
      const rng = seededRandom(seedFromName(mp.personName) + state.turn * 7);
      if (rng() < 0.12) {
        return {
          id: `political-${Date.now()}-faction-act-${Math.random().toString(36).slice(2, 7)}`,
          type: 'faction_defect',
          source: `mp://${mp.partyId}:${mp.personName}`,
          payload: {
            mpName: mp.personName,
            partyId: mp.partyId,
            factionId: faction.id,
            factionName: faction.name,
            factionLoyalty: faction.loyalty,
          },
          turn: state.turn,
        };
      }
    }
    return null;
  }

  // 无派系 + 高野心 + 非党首 → 可能组建派系
  if (mp.ambition > 65 && !mp.isLeader && !mp.isCommitteeChairman) {
    const rng = seededRandom(seedFromName(mp.personName) + state.turn * 7);
    if (rng() < 0.15) {
      return {
        id: `political-${Date.now()}-faction-${Math.random().toString(36).slice(2, 7)}`,
        type: 'form_faction',
        source: `mp://${mp.partyId}:${mp.personName}`,
        payload: {
          leaderName: mp.personName,
          partyId: mp.partyId,
          factionName: `${mp.personName}派`,
        },
        turn: state.turn,
      };
    }
  }

  return null;
}

/**
 * 计算联盟级行为意图
 */
export function calculateCoalitionBehavior(
  mp: MPPersonality,
  state: GameState,
): AIIntent | null {
  if (!state.government) return null;

  // 在野党党首：可能发起不信任或游说
  if (mp.isLeader && !state.government.rulingCoalition.includes(mp.partyId)) {
    const rng = seededRandom(seedFromName(mp.personName) + state.turn * 13);
    if (rng() < 0.10) {
      return {
        id: `political-${Date.now()}-lobby-${Math.random().toString(36).slice(2, 7)}`,
        type: 'lobby_support',
        source: `mp://${mp.partyId}:${mp.personName}`,
        payload: {
          initiatorName: mp.personName,
          partyId: mp.partyId,
          topic: 'no_confidence',
        },
        turn: state.turn,
      };
    }
  }

  // 执政联盟大臣：可能谋求更高职位
  if (mp.isMinister && mp.ambition > 70) {
    const rng = seededRandom(seedFromName(mp.personName) + state.turn * 17);
    if (rng() < 0.08) {
      return {
        id: `political-${Date.now()}-cabinet-${Math.random().toString(36).slice(2, 7)}`,
        type: 'seek_cabinet',
        source: `mp://${mp.partyId}:${mp.personName}`,
        payload: {
          mpName: mp.personName,
          partyId: mp.partyId,
          negotiationScore: mp.negotiationSkill,
        },
        turn: state.turn,
      };
    }
  }

  return null;
}

/**
 * 判断哪个隐藏目标在当前状态下最可行动
 */
export function resolveActiveGoal(
  mp: MPPersonality,
  state: GameState,
): HiddenGoal | null {
  for (const goal of mp.hiddenGoals) {
    switch (goal) {
      case 'become_prime_minister':
        if (!mp.isLeader && mp.ambition > 70) return goal;
        break;
      case 'gain_media_attention':
        if (mp.mediaSkill > 60) return goal;
        break;
      case 'accumulate_wealth':
        if (mp.corruption > 50) return goal;
        break;
      case 'pass_tax_reform':
      case 'pass_labor_reform':
      case 'pass_defense_reform':
      case 'pass_healthcare_reform':
        if (mp.isCommitteeChairman || mp.isMinister) return goal;
        break;
      case 'expand_faction':
        if (mp.ambition > 50 && !mp.isLeader) return goal;
        break;
      case 'destroy_rival_faction':
        if (mp.negotiationSkill > 55 && mp.corruption > 40) return goal;
        break;
      case 'maintain_status_quo':
        // 现状维持者不主动行动
        break;
    }
  }
  return null;
}

/**
 * 将隐藏目标转换为具体意图
 */
export function goalToIntent(
  mp: MPPersonality,
  goal: HiddenGoal,
  state: GameState,
): AIIntent | null {
  const source = `mp://${mp.partyId}:${mp.personName}`;
  const id = () => `political-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

  switch (goal) {
    case 'become_prime_minister':
      if (!mp.isLeader) {
        return {
          id: id(),
          type: 'challenge_leader',
          source,
          payload: {
            partyId: mp.partyId,
            challengerName: mp.personName,
            supportDelta: { [mp.partyId]: -2 } as Record<string, number>,
          },
          turn: state.turn,
        };
      }
      return null;

    case 'gain_media_attention':
      return {
        id: id(),
        type: 'media_campaign',
        source,
        payload: {
          mpName: mp.personName,
          partyId: mp.partyId,
          intensity: Math.round(mp.mediaSkill * 0.1),
          supportDelta: { [mp.partyId]: Math.round(mp.mediaSkill * 0.05) } as Record<string, number>,
        },
        turn: state.turn,
      };

    case 'accumulate_wealth': {
      const rng = seededRandom(seedFromName(mp.personName) + state.turn);
      return {
        id: id(),
        type: 'backroom_deal',
        source,
        payload: {
          initiatorName: mp.personName,
          partyId: mp.partyId,
          action: 'fundraise',
          fundsDelta: { [mp.partyId]: Math.round(50 + rng() * 100) } as Record<string, number>,
        },
        turn: state.turn,
      };
    }

    case 'pass_tax_reform':
    case 'pass_labor_reform':
    case 'pass_defense_reform':
    case 'pass_healthcare_reform': {
      const topicMap: Record<string, string> = {
        pass_tax_reform: '税制改革法案',
        pass_labor_reform: '劳动改革法案',
        pass_defense_reform: '防卫改革法案',
        pass_healthcare_reform: '医疗改革法案',
      };
      const committeeMap: Record<string, string> = {
        pass_tax_reform: 'finance',
        pass_labor_reform: 'health',
        pass_defense_reform: 'security',
        pass_healthcare_reform: 'health',
      };
      return {
        id: id(),
        type: 'propose_bill',
        source,
        payload: {
          title: topicMap[goal],
          summary: `${mp.personName}提出的${topicMap[goal]}，旨在调整相关领域政策。`,
          proposerPartyId: mp.partyId,
          proposerName: mp.personName,
          committeeId: committeeMap[goal],
        },
        turn: state.turn,
      };
    }

    case 'destroy_rival_faction':
      return {
        id: id(),
        type: 'backroom_deal',
        source,
        payload: {
          initiatorName: mp.personName,
          partyId: mp.partyId,
          action: 'undermine',
          relationDelta: {} as Record<string, number>,
        },
        turn: state.turn,
      };

    case 'expand_faction':
      return {
        id: id(),
        type: 'form_faction',
        source,
        payload: {
          leaderName: mp.personName,
          partyId: mp.partyId,
          factionName: `${mp.personName}派`,
        },
        turn: state.turn,
      };

    default:
      return null;
  }
}

// ===== 意图创建辅助 =====

function createStressEventIntent(mp: MPPersonality, state: GameState): AIIntent {
  return {
    id: `political-${Date.now()}-stress-${Math.random().toString(36).slice(2, 7)}`,
    type: 'stress_event',
    source: `mp://${mp.partyId}:${mp.personName}`,
    payload: {
      mpName: mp.personName,
      partyId: mp.partyId,
      title: '议员失态事件',
      description: `${mp.personName}因长期高压在公开场合失态，引发媒体关注。`,
      supportDelta: { [mp.partyId]: -1 } as Record<string, number>,
    },
    turn: state.turn,
  };
}

function createChallengeLeaderIntent(mp: MPPersonality, state: GameState): AIIntent {
  const party = state.parties.find((p) => p.id === mp.partyId);
  return {
    id: `political-${Date.now()}-challenge-${Math.random().toString(36).slice(2, 7)}`,
    type: 'challenge_leader',
    source: `mp://${mp.partyId}:${mp.personName}`,
    payload: {
      partyId: mp.partyId,
      challengerName: mp.personName,
      currentLeaderName: party?.leader ?? 'unknown',
      supportDelta: { [mp.partyId]: -3 } as Record<string, number>,
    },
    turn: state.turn,
  };
}

// ===== 去重 =====

/**
 * 去重意图：同类型同目标的意图只保留一个（优先保留发起者权重最高的）
 */
function deduplicateIntents(intents: AIIntent[]): AIIntent[] {
  const seen = new Map<string, AIIntent>();

  for (const intent of intents) {
    // 生成去重键：type + 关键目标标识
    let dedupeKey = intent.type;
    switch (intent.type) {
      case 'challenge_leader':
        dedupeKey += `:${intent.payload.partyId}`;
        break;
      case 'media_campaign':
        dedupeKey += `:${intent.payload.partyId}`;
        break;
      case 'form_faction':
        dedupeKey += `:${intent.payload.leaderName}`;
        break;
      case 'propose_bill':
        dedupeKey += `:${intent.payload.title}`;
        break;
      default:
        dedupeKey += `:${intent.source}`;
        break;
    }

    if (!seen.has(dedupeKey)) {
      seen.set(dedupeKey, intent);
    }
  }

  return Array.from(seen.values());
}

// ===== 人格更新 =====

/**
 * 回合结束后批量更新所有议员人格（压力、健康变化）
 */
export function updateAllPersonalities(state: GameState): Record<string, MPPersonality> {
  const updated: Record<string, MPPersonality> = {};

  for (const [key, mp] of Object.entries(state.mpPersonalities)) {
    updated[key] = updateMPState(mp, state);
  }

  return updated;
}

/**
 * 更新单个议员的状态（压力、健康）
 */
export function updateMPState(mp: MPPersonality, state: GameState): MPPersonality {
  // 已死亡的议员不再更新
  if (mp.deceased) return mp;

  let stressDelta = 0;
  let healthDelta = 0;

  // 党首承受更多压力
  if (mp.isLeader) stressDelta += 3;
  if (mp.isMinister) stressDelta += 2;

  // 党派支持率下降 → 成员压力增加
  const party = state.parties.find((p) => p.id === mp.partyId);
  if (party) {
    const trend = party.currentSupport - party.baseSupport;
    if (trend < -5) stressDelta += 5;
    else if (trend > 5) stressDelta -= 2;
  }

  // 高野心 → 自然增压
  if (mp.ambition > 70) stressDelta += 2;

  // 压力自然衰减
  stressDelta -= 2;

  // 健康受压力影响
  if (mp.stress > 80) healthDelta -= 2;
  else if (mp.stress < 30) healthDelta += 1;

  // 后期回合压力增加
  if (state.turn > 36) stressDelta += 1;

  // 衰老健康损失
  if (mp.age > 80) {
    // 80岁以上：每回合 -2 ~ -6 额外健康损失
    const oldAgeLoss = 2 + Math.floor(Math.abs(seedFromName(mp.personName) + state.turn) % 5);
    healthDelta -= oldAgeLoss * 2; // 加倍
  } else if (mp.age > 75) {
    // 75岁以上：每回合 -1 ~ -3 额外健康损失
    const oldAgeLoss = 1 + Math.floor(Math.abs(seedFromName(mp.personName) + state.turn) % 3);
    healthDelta -= oldAgeLoss;
  }

  return {
    ...mp,
    // 1 回合 = 1 个月，12 回合（1 年）年龄 +1
    age: (state.turn + 1) % 12 === 0 ? mp.age + 1 : mp.age,
    stress: clamp(mp.stress + stressDelta),
    health: clamp(mp.health + healthDelta),
  };
}
