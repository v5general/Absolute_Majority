import type {
  Party,
  RelationEntry,
  ElectionResult,
  Committee,
  CommitteeId,
  CommitteeMember,
  Bill,
  BillStatus,
  Ideology,
} from '../types';
import { COMMITTEE_LABELS } from '../types';
import { validateCommitteeVote } from './rulesEngine';

/**
 * 委员会引擎
 *
 * 9 个常任委员会，每个拥有委员长、副委员长、委员名单、意识形态倾向、运作效率。
 *
 * 法案流程：Draft → Committee Review → Revision/Delay → Vote → Implemented/Rejected
 *
 * 核心规则：
 * - 委员长拥有额外权重（1.5x）
 * - 委员长与法案提出者敌对 → 提高搁置概率
 * - 委员长与提出者同派系 → 提高通过率
 * - 委员会成员按各党席位比例分配
 * - 规则 #7：每个议员都必须加入至少一个委员会，可重复加入但不可重复任职
 */

// ===== 意识形态工具 =====

const IDEOLOGY_ORDER: Ideology[] = [
  'far-left', 'left', 'center-left', 'center', 'center-right', 'right', 'far-right',
];

function ideologyDistance(a: Ideology, b: Ideology): number {
  return Math.abs(IDEOLOGY_ORDER.indexOf(a) - IDEOLOGY_ORDER.indexOf(b));
}

/** 计算一组成员的主流意识形态 */
function calcDominantIdeology(members: CommitteeMember[], parties: Party[]): Ideology {
  const counts: Record<string, number> = {};
  for (const m of members) {
    const party = parties.find((p) => p.id === m.partyId);
    if (party) counts[party.ideology] = (counts[party.ideology] ?? 0) + 1;
  }
  let best: Ideology = 'center';
  let max = 0;
  for (const [ideo, count] of Object.entries(counts)) {
    if (count > max) { max = count; best = ideo as Ideology; }
  }
  return best;
}

/** 计算委员会效率 (0-100) */
function calcEfficiency(
  members: CommitteeMember[],
  parties: Party[],
  relations: RelationEntry[],
): number {
  let score = 70;

  let hostilePairs = 0;
  let totalPairs = 0;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (members[i].partyId !== members[j].partyId) {
        totalPairs++;
        const rel = relations.find(
          (r) => r.from === members[i].partyId && r.to === members[j].partyId,
        );
        if (rel && rel.score < -30) hostilePairs++;
      }
    }
  }
  if (totalPairs > 0) {
    score -= Math.round((hostilePairs / totalPairs) * 30);
  }

  const uniqueParties = new Set(members.map((m) => m.partyId)).size;
  score += Math.min(10, uniqueParties * 2);

  return Math.max(10, Math.min(100, score));
}

// ===== 议员花名册生成 =====

/**
 * 后排议员姓氏池（120个）
 *
 * 排除规则：
 * - 现实政治家姓氏全部排除
 * - 党首姓氏（原田 望月 桐生 远山 浅野）排除
 */
const SURNAMES: string[] = [
  '青木', '秋山', '天野', '荒木', '安藤',
  '石川', '和泉', '市川', '岩崎', '五十岚',
  '上田', '植木', '臼井', '梅田', '上原',
  '江口', '榛本', '远藤', '大西', '大桥',
  '冈田', '尾形', '小川', '大塚', '大久保',
  '小野寺', '绪方', '大石', '长谷川', '片山',
  '金泽', '川崎', '香川', '木下', '久保',
  '黑田', '黑崎', '小西', '近藤', '三浦',
  '武田', '田中', '田村', '多田', '北村',
  '柴田', '谷口', '小武', '加藤', '斉藤',
  '佐藤', '桥本', '平田', '平岛', '关口',
  '清水', '酒井', '小林', '小寺', '小山',
  '新川', '立花', '冈村', '大冈', '松本',
  '萩田', '山口', '源', '高桥', '高田',
  '高木', '富士', '松田', '泽田', '齐藤',
  '横山', '斋田', '立石', '徐田', '中岚',
  '中崎', '中村', '长崎', '内田', '中野',
  '永山', '西村', '沼田', '野村', '林',
  '松山', '潘', '本多', '別所', '平子',
  '藤原', '平塚', '春日', '佐々木', '的场',
  '沟口', '宫崎', '森岛', '前田', '村上',
  '中岛', '西田', '根本', '吉田', '山本',
  '山崎', '白口', '枝光', '花田', '古贺',
  '大崎', '西崎', '東田', '南浦', '池田',
];

/** 后排议员名字池（80个，男女混合） */
const GIVEN_NAMES: string[] = [
  '健一', '直树', '修', '亮', '太郎',
  '大辅', '进', '秀树', '一郎', '和夫',
  '正道', '胜', '兴', '建一', '智志',
  '明', '达也', '三郎', '雄大', '翔',
  '太一', '哲也', '浩二', '强', '真',
  '波', '信彦', '文也', '博', '清',
  '杰', '浩介', '彬', '一成', '康',
  '豪', '弘', '春树', '龙也', '慎',
  '美咲', '樱', '惠子', '美纪', '真理',
  '优子', '恵', '千夏', '香织', '柔',
  '美稀', '友美', '莉子', '彩', '雫',
  '杏子', '奈美', '阳子', '庄子', '珠美',
  '蓬美', '真由美', '诺子', '未来', '初音',
  '花', '和香', '春菜', '莉莉', '月子',
  '樱子', '桐', '夏希', '富美子', '奈罗',
  '美也', '玲', '正美', '响子', '也美',
];

/**
 * 将 leader + 已有 members 作为核心成员，
 * 再从姓名池中生成后排议员，直到达到所需人数。
 *
 * @param globalUsed 全局已用姓名集合，防止跨党派重名
 */
function expandPartyRoster(
  party: Party,
  requiredCount: number,
  globalUsed: Set<string>,
): string[] {
  const existing = [party.leader, ...party.members];
  const roster = [...existing];
  const usedNames = new Set(existing);

  // 注册已有成员到全局集合
  for (const name of existing) {
    globalUsed.add(name);
  }

  // 乘法哈希 + 双步进分散，确保不同党派从姓名池的不同位置开始
  // 且每个党派内部姓氏和名字都充分变化
  let hash = 0;
  for (let i = 0; i < party.id.length; i++) {
    hash = ((hash << 5) - hash + party.id.charCodeAt(i)) | 0;
  }
  // 起始位置取模分散，surname/given 用不同步长避免单一名字
  let si = Math.abs(hash) % SURNAMES.length;
  let gi = (Math.abs(hash) * 7 + 3) % GIVEN_NAMES.length;

  let safety = 0;
  while (roster.length < requiredCount && safety < 50000) {
    const surname = SURNAMES[si % SURNAMES.length];
    const given = GIVEN_NAMES[gi % GIVEN_NAMES.length];
    const name = `${surname} ${given}`;

    if (!usedNames.has(name) && !globalUsed.has(name)) {
      roster.push(name);
      usedNames.add(name);
      globalUsed.add(name);
    }
    // 姓氏步进与名字步进使用互质数，让组合充分散开
    si = (si + 1) % SURNAMES.length;
    gi = (gi + 7) % GIVEN_NAMES.length;
    safety++;
  }

  return roster;
}

// ===== 委员会初始化 =====

/** 全部 9 个委员会 */
export const ALL_COMMITTEE_IDS: CommitteeId[] = [
  'cabinet', 'general', 'judicial', 'foreign', 'finance',
  'economy', 'security', 'budget', 'health',
];

/** 每个委员会的基础委员人数（合计200席，对应众议院200席） */
const COMMITTEE_SIZES: Record<CommitteeId, number> = {
  cabinet: 20,   // 内阁委员会
  general: 20,   // 总务委员会
  judicial: 20,  // 法务委员会（委员长可由在野党担任）
  foreign: 20,   // 外务委员会
  finance: 30,   // 财务金融委员会（委员长由执政联盟担任）
  economy: 25,   // 经济产业委员会
  security: 20,  // 安全保障委员会
  budget: 30,    // 预算委员会（最高权力委员会，首相必须出席，波动×1.5）
  health: 15,    // 厚生劳动委员会
};

/**
 * 根据选举结果组建所有委员会
 *
 * 规则 #7 约束：
 * - 每个议员都必须加入至少一个委员会
 * - 同一议员可加入多个委员会（可重复加入）
 * - 同一议员不得在两个委员会担任委员长（不可重复任职）
 * - 同一议员不得在两个委员会担任副委员长（不可重复任职）
 *
 * 分配逻辑：
 * 1. 先为每个党派生成与席位数相等的议员花名册
 * 2. 为每个委员会按比例分配各党名额
 * 3. 使用跨委员会游标轮流选人（不同委员会选不同人）
 * 4. 委员长/副委员长在所有委员会全部成员确定后统一分配，保证不重复
 * 5. 最后验证所有议员至少出现在一个委员会中
 */
export function initializeCommittees(
  parties: Party[],
  relations: RelationEntry[],
  electionResult: ElectionResult,
  rulingCoalition: string[],
): Committee[] {
  const totalSeats = electionResult.partyResults.reduce((s, r) => s + r.seats, 0);

  // 0. 全局已用姓名集合 — 确保不同党派的后排议员不会重名
  const globalUsedNames = new Set<string>();

  // 1. 为每个党派生成完整的议员花名册
  const partyRosters: Record<string, string[]> = {};
  for (const pr of electionResult.partyResults) {
    const party = parties.find((p) => p.id === pr.partyId)!;
    partyRosters[pr.partyId] = expandPartyRoster(party, pr.seats, globalUsedNames);
  }

  // 2. 记录每个议员的委员会归属（用于验证全员覆盖）
  const mpCommitteeMap = new Map<string, Set<CommitteeId>>();

  // 3. 跨委员会游标 — 让不同委员会选同党派的不同人
  const partyCursors: Record<string, number> = {};
  for (const pr of electionResult.partyResults) {
    partyCursors[pr.partyId] = 0;
  }

  // 4. 逐个委员会分配成员
  const committees: Committee[] = [];
  const committeeMembersList: CommitteeMember[][] = [];

  for (const cid of ALL_COMMITTEE_IDS) {
    const size = COMMITTEE_SIZES[cid];
    const members: CommitteeMember[] = [];
    const usedInCommittee = new Set<string>();

    // 按席位比例分配各党名额（确保加总恰好等于 size）
    const rawSlots: { partyId: string; count: number }[] = [];
    let totalRaw = 0;
    for (const pr of electionResult.partyResults) {
      const slots = Math.max(1, Math.round((pr.seats / totalSeats) * size));
      rawSlots.push({ partyId: pr.partyId, count: slots });
      totalRaw += slots;
    }
    // 修正总数偏差：按偏差量逐个调整最大党
    let diff = size - totalRaw;
    while (diff !== 0) {
      const sorted = [...rawSlots].sort((a, b) => b.count - a.count);
      if (diff > 0) {
        sorted[0].count++;
        diff--;
      } else {
        // 从最小党扣（但不低于 1）
        for (let i = sorted.length - 1; i >= 0; i--) {
          if (sorted[i].count > 1) {
            sorted[i].count--;
            diff++;
            break;
          }
        }
      }
    }

    // 从各党花名册中用游标选人（跨委员会轮转）
    for (const slot of rawSlots) {
      const roster = partyRosters[slot.partyId];
      let picked = 0;
      let cursor = partyCursors[slot.partyId];

      while (picked < slot.count) {
        const name = roster[cursor % roster.length];
        cursor++;

        if (!usedInCommittee.has(name)) {
          members.push({ personName: name, partyId: slot.partyId });
          usedInCommittee.add(name);
          picked++;

          if (!mpCommitteeMap.has(name)) {
            mpCommitteeMap.set(name, new Set());
          }
          mpCommitteeMap.get(name)!.add(cid);
        }
      }
      // 保存游标位置供下一个委员会使用
      partyCursors[slot.partyId] = cursor;
    }

    committeeMembersList.push(members);
  }

  // 5. 统一分配委员长/副委员长（保证全局不重复）
  //    先选好 9 个委员长和 9 个副委员长，再与各委员会匹配

  const assignedChairmen = new Set<string>();
  const assignedViceChairmen = new Set<string>();

  // 委员长候选人：执政联盟最大党成员（优先核心成员）
  const rulingSorted = rulingCoalition
    .map((pid) => ({ pid, seats: electionResult.partyResults.find((r) => r.partyId === pid)?.seats ?? 0 }))
    .sort((a, b) => b.seats - a.seats);
  const chairmanPartyId = rulingSorted[0]?.pid ?? electionResult.partyResults[0].partyId;
  const chairmanParty = parties.find((p) => p.id === chairmanPartyId)!;
  const chairmanPool = [chairmanParty.leader, ...chairmanParty.members, ...partyRosters[chairmanPartyId]];

  // 副委员长候选人：在野第一大党成员
  const oppositionSorted = electionResult.partyResults
    .filter((r) => !rulingCoalition.includes(r.partyId))
    .sort((a, b) => b.seats - a.seats);
  const vicePartyId = oppositionSorted[0]?.partyId ?? electionResult.partyResults[1]?.partyId ?? parties[1].id;
  const viceParty = parties.find((p) => p.id === vicePartyId)!;
  const vicePool = [viceParty.leader, ...viceParty.members, ...partyRosters[vicePartyId]];

  // 为每个委员会匹配委员长和副委员长
  for (let ci = 0; ci < ALL_COMMITTEE_IDS.length; ci++) {
    const cid = ALL_COMMITTEE_IDS[ci];
    const members = committeeMembersList[ci];

    // --- 选委员长 ---
    let chairman: CommitteeMember | null = null;

    // 优先：从委员长候选人池中找已在本委员会成员中的、未担任过委员长的人
    for (const name of chairmanPool) {
      if (!assignedChairmen.has(name)) {
        const m = members.find((mm) => mm.personName === name);
        if (m) { chairman = m; break; }
      }
    }
    // 次选：本委员会中执政党成员里未担任过委员长的人
    if (!chairman) {
      for (const m of members) {
        if (m.partyId === chairmanPartyId && !assignedChairmen.has(m.personName)) {
          chairman = m;
          break;
        }
      }
    }
    // 兜底：本委员会中任何未担任过委员长的人（绝不违反规则）
    if (!chairman) {
      for (const m of members) {
        if (!assignedChairmen.has(m.personName)) {
          chairman = m;
          break;
        }
      }
    }
    // 极端兜底：强制选第一个（不应发生，54人分9个委员长绰绰有余）
    if (!chairman) chairman = members[0];
    assignedChairmen.add(chairman.personName);

    // --- 选副委员长 ---
    let viceChairman: CommitteeMember | null = null;

    // 优先：从副委员长候选人池中找已在本委员会成员中的、未担任过副委员长的人
    for (const name of vicePool) {
      if (!assignedViceChairmen.has(name) && name !== chairman.personName) {
        const m = members.find((mm) => mm.personName === name);
        if (m) { viceChairman = m; break; }
      }
    }
    // 次选：本委员会中在野党成员里未担任过副委员长的人
    if (!viceChairman) {
      for (const m of members) {
        if (m.partyId === vicePartyId && !assignedViceChairmen.has(m.personName) && m.personName !== chairman.personName) {
          viceChairman = m;
          break;
        }
      }
    }
    // 兜底：本委员会中任何未担任过副委员长的人（不含委员长本人）
    if (!viceChairman) {
      for (const m of members) {
        if (!assignedViceChairmen.has(m.personName) && m.personName !== chairman.personName) {
          viceChairman = m;
          break;
        }
      }
    }
    // 极端兜底
    if (!viceChairman) {
      viceChairman = members.find((m) => m.personName !== chairman.personName) ?? members[0];
    }
    assignedViceChairmen.add(viceChairman.personName);

    // 确保委员长/副委员长在成员列表中
    if (!members.some((m) => m.personName === chairman!.personName)) {
      members.unshift({ personName: chairman.personName, partyId: chairman.partyId });
    }
    if (!members.some((m) => m.personName === viceChairman!.personName)) {
      members.push({ personName: viceChairman.personName, partyId: viceChairman.partyId });
    }

    const ideology = calcDominantIdeology(members, parties);
    const efficiency = calcEfficiency(members, parties, relations);

    committees.push({
      id: cid,
      chairman,
      viceChairman,
      members,
      presentMembers: members.map((m) => m.personName),
      ideology,
      efficiency,
    });
  }

  // 6. 补充未分配到任何委员会的议员
  ensureAllMPsAssigned(committees, partyRosters, mpCommitteeMap);

  return committees;
}

/**
 * 确保所有议员都至少被分配到一个委员会
 *
 * 对于未被任何委员会覆盖的议员，将其追加到其党派成员比例最高的委员会中。
 */
function ensureAllMPsAssigned(
  committees: Committee[],
  partyRosters: Record<string, string[]>,
  mpCommitteeMap: Map<string, Set<CommitteeId>>,
): void {
  // 收集所有议员
  const allMPs = new Set<string>();
  for (const roster of Object.values(partyRosters)) {
    for (const name of roster) {
      allMPs.add(name);
    }
  }

  // 找出未被覆盖的议员 → 其所属党派
  const uncovered: { name: string; partyId: string }[] = [];
  for (const [partyId, roster] of Object.entries(partyRosters)) {
    for (const name of roster) {
      if (!mpCommitteeMap.has(name) || mpCommitteeMap.get(name)!.size === 0) {
        uncovered.push({ name, partyId });
      }
    }
  }

  // 为未覆盖议员分配到该党成员最多的委员会
  for (const mp of uncovered) {
    // 找该党成员最多的委员会
    let bestCommittee: Committee | null = null;
    let bestCount = -1;
    for (const committee of committees) {
      const count = committee.members.filter((m) => m.partyId === mp.partyId).length;
      if (count > bestCount) {
        bestCount = count;
        bestCommittee = committee;
      }
    }
    if (bestCommittee && !bestCommittee.members.some((m) => m.personName === mp.name)) {
      bestCommittee.members.push({ personName: mp.name, partyId: mp.partyId });
      bestCommittee.presentMembers.push(mp.name);
      if (!mpCommitteeMap.has(mp.name)) {
        mpCommitteeMap.set(mp.name, new Set());
      }
      mpCommitteeMap.get(mp.name)!.add(bestCommittee.id);
    }
  }
}

/**
 * 校验委员会分配是否满足规则 #7
 *
 * - 每个议员至少在一个委员会中
 * - 无重复委员长任职
 * - 无重复副委员长任职
 */
export function validateCommitteeAssignments(
  committees: Committee[],
  partyRosters: Record<string, string[]>,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  // 检查重复委员长
  const chairmanCount = new Map<string, number>();
  for (const c of committees) {
    chairmanCount.set(c.chairman.personName, (chairmanCount.get(c.chairman.personName) ?? 0) + 1);
  }
  for (const [name, count] of chairmanCount) {
    if (count > 1) {
      issues.push(`${name} 在 ${count} 个委员会中担任委员长（违规：不可重复任职）`);
    }
  }

  // 检查重复副委员长
  const viceCount = new Map<string, number>();
  for (const c of committees) {
    viceCount.set(c.viceChairman.personName, (viceCount.get(c.viceChairman.personName) ?? 0) + 1);
  }
  for (const [name, count] of viceCount) {
    if (count > 1) {
      issues.push(`${name} 在 ${count} 个委员会中担任副委员长（违规：不可重复任职）`);
    }
  }

  // 检查全员覆盖
  const allAssigned = new Set<string>();
  for (const c of committees) {
    for (const m of c.members) {
      allAssigned.add(m.personName);
    }
  }
  for (const [partyId, roster] of Object.entries(partyRosters)) {
    for (const name of roster) {
      if (!allAssigned.has(name)) {
        issues.push(`${name}（${partyId}）未被分配到任何委员会（违规：每个议员必须加入至少一个委员会）`);
      }
    }
  }

  return { valid: issues.length === 0, issues };
}

/**
 * 获取指定议员参与的所有委员会
 */
export function getMPCommitteeMemberships(
  mpName: string,
  committees: Committee[],
): { committeeId: CommitteeId; role: '委员长' | '副委员长' | '委员' }[] {
  const memberships: { committeeId: CommitteeId; role: '委员长' | '副委员长' | '委员' }[] = [];
  for (const c of committees) {
    if (c.chairman.personName === mpName) {
      memberships.push({ committeeId: c.id, role: '委员长' });
    } else if (c.viceChairman.personName === mpName) {
      memberships.push({ committeeId: c.id, role: '副委员长' });
    } else if (c.members.some((m) => m.personName === mpName)) {
      memberships.push({ committeeId: c.id, role: '委员' });
    }
  }
  return memberships;
}

// ===== 法案流程 =====

/** 委员会审议结果 */
export interface CommitteeReviewResult {
  status: BillStatus;
  note: string;
  amendment: string;
}

/**
 * 委员会审议法案
 */
export function committee_review(
  bill: Bill,
  committee: Committee,
  parties: Party[],
  relations: RelationEntry[],
): CommitteeReviewResult {
  const proposerParty = parties.find((p) => p.id === bill.proposerPartyId);
  const chairmanParty = parties.find((p) => p.id === committee.chairman.partyId);
  if (!proposerParty || !chairmanParty) {
    return { status: 'revised', note: '审议通过，无修正', amendment: '' };
  }

  const relation = relations.find(
    (r) => r.from === committee.chairman.partyId && r.to === bill.proposerPartyId,
  );
  const relScore = relation ? relation.score : 0;

  const idDist = ideologyDistance(proposerParty.ideology, committee.ideology);

  let passChance = 50 + relScore * 0.5 - idDist * 8 + (committee.efficiency - 50) * 0.3;

  const isSameParty = committee.chairman.partyId === bill.proposerPartyId;
  const isAllied = relation && relation.score >= 20;

  if (isSameParty) {
    passChance += 25;
  } else if (isAllied) {
    passChance += 15;
  }

  if (passChance >= 65) {
    return {
      status: 'revised',
      note: `委员会审议通过。委员长${committee.chairman.personName}支持该法案，委员会以多数赞成通过。`,
      amendment: '',
    };
  }

  if (passChance >= 40) {
    return {
      status: 'revised',
      note: `委员会附条件通过。在委员长${committee.chairman.personName}的斡旋下，法案经修正后获多数支持。`,
      amendment: `增加修正条款：经${COMMITTEE_LABELS[committee.id]}协商，对部分条款进行了妥协性调整。`,
    };
  }

  if (passChance >= 20) {
    return {
      status: 'delayed',
      note: `委员会决定搁置该法案。委员长${committee.chairman.personName}认为需要进一步审议，法案暂时无法进入表决阶段。`,
      amendment: '',
    };
  }

  return {
    status: 'delayed',
    note: `法案被强硬搁置。委员长${committee.chairman.personName}与提出方存在严重分歧，拒绝将法案列入议程。`,
    amendment: '',
  };
}

/**
 * 委员会搁置
 */
export function committee_delay(
  bill: Bill,
  committee: Committee,
): string {
  return `「${bill.title}」被${COMMITTEE_LABELS[committee.id]}搁置。委员长${committee.chairman.personName}以"需要进一步研究"为由推迟表决。`;
}

/**
 * 委员会修正
 */
export function committee_amendment(
  bill: Bill,
  committee: Committee,
  parties: Party[],
  relations: RelationEntry[],
): string {
  const chairmanParty = parties.find((p) => p.id === committee.chairman.partyId);
  const proposerParty = parties.find((p) => p.id === bill.proposerPartyId);
  if (!chairmanParty || !proposerParty) return '委员会提出技术性修正。';

  const idDist = ideologyDistance(chairmanParty.ideology, proposerParty.ideology);

  if (idDist <= 1) {
    return `微幅修正：${COMMITTEE_LABELS[committee.id]}对法案措辞和技术细节进行了少量调整，核心条款不变。`;
  }
  if (idDist <= 3) {
    return `中度修正：${COMMITTEE_LABELS[committee.id]}对部分关键条款进行了修改，以平衡不同派系的诉求。`;
  }
  return `大幅修正：${COMMITTEE_LABELS[committee.id]}对法案进行了根本性修改，多项原始条款被重写或删除。`;
}

/**
 * 委员会表决：模拟委员会内部投票
 *
 * 规则约束：表决前必须达到法定人数（规则 #2）
 * 委员长拥有 1.5x 权重。
 */
export function committee_vote(
  bill: Bill,
  committee: Committee,
  parties: Party[],
  relations: RelationEntry[],
): { votesFor: number; votesAgainst: number } {
  // 规则 #2：法定人数检查
  const quorumValidation = validateCommitteeVote(committee);
  if (!quorumValidation.valid) {
    return { votesFor: 0, votesAgainst: 0 };
  }

  let votesFor = 0;
  let votesAgainst = 0;

  for (const member of committee.members) {
    const memberParty = parties.find((p) => p.id === member.partyId);
    if (!memberParty) continue;

    // 只计算出席的委员
    if (!committee.presentMembers.includes(member.personName)) continue;

    const weight = member.personName === committee.chairman.personName ? 1.5 : 1;

    const isSameParty = member.partyId === bill.proposerPartyId;
    const rel = relations.find(
      (r) => r.from === member.partyId && r.to === bill.proposerPartyId,
    );
    const relScore = rel ? rel.score : 0;

    let favorScore = 50 + relScore * 0.3;
    if (isSameParty) favorScore += 30;

    const idDist = ideologyDistance(memberParty.ideology, parties.find((p) => p.id === bill.proposerPartyId)?.ideology ?? 'center');
    favorScore -= idDist * 6;

    if (favorScore >= 45) {
      votesFor += weight;
    } else {
      votesAgainst += weight;
    }
  }

  return {
    votesFor: Math.round(votesFor),
    votesAgainst: Math.round(votesAgainst),
  };
}

/**
 * 创建新法案
 */
export function createBill(
  title: string,
  summary: string,
  proposerPartyId: string,
  proposerName: string,
  committeeId: CommitteeId,
  turn: number,
): Bill {
  return {
    id: `bill-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    summary,
    proposerPartyId,
    proposerName,
    committeeId,
    status: 'draft',
    committeeNote: '',
    amendment: '',
    votesFor: 0,
    votesAgainst: 0,
    createdTurn: turn,
  };
}

// ===== 工具函数 =====

export function getCommitteeLabel(id: CommitteeId): string {
  return COMMITTEE_LABELS[id];
}
