/**
 * Agent 模拟引擎
 *
 * 5 个政治角色 Agent，每个拥有 perceive → think → generateIntent 三步循环。
 * AgentScheduler 按优先级调度所有 Agent。
 *
 * Agent 不直接修改 GameState，不直接生成 Event。
 * Agent 只生成 AgentIntent，由 NarrativeEngine 转换为 PoliticalEvent。
 *
 * 调度优先级：
 *   首相(1) → 党首(2) → 派系领袖(3) → 媒体(4) → 利益集团(5)
 *
 * LLM 增强：
 *   每个 Agent 的 think() 会先尝试调用 DeepSeek LLM 生成意图，
 *   如果 LLM 不可用或返回无效，则 fallback 到规则引擎。
 */

import type {
  Party,
  Committee,
  Government,
  GameState,
  Ideology,
} from '../types';
import type {
  AgentIntent,
  AgentPerception,
  AgentConfig,
  PoliticalEvent,
} from '../types';
import type { ThinkingLogEntry } from '../types';
import { askLLMJSON, isLLMAvailable } from './llmBridge';

// ===== 工具函数 =====

const IDEOLOGY_ORDER: Ideology[] = [
  'far-left', 'left', 'center-left', 'center', 'center-right', 'right', 'far-right',
];

function ideologyLabel(ideo: Ideology): string {
  const labels: Record<Ideology, string> = {
    'far-left': '极左', 'left': '左翼', 'center-left': '中左',
    'center': '中间', 'center-right': '中右', 'right': '右翼', 'far-right': '极右',
  };
  return labels[ideo];
}

/** 从 GameState 构建 Agent 视角的世界摘要 */
function buildWorldSummary(state: GameState, agentPartyId?: string): string {
  const gov = state.government;
  const lines: string[] = [];

  lines.push(`=== 第${state.turn}回合 · 第${state.currentDay}日 ===`);
  lines.push(`总席位: ${state.metrics.totalSeats} · 过半: ${state.metrics.majorityThreshold}`);
  lines.push(`距大选: ${state.turnsUntilElection ?? 48}回合`);

  for (const party of state.parties) {
    const ideology = ideologyLabel(party.ideology);
    const isRuling = gov?.rulingCoalition.includes(party.id) ?? false;
    const role = party.leader === gov?.primeMinisterName ? '首相' : isRuling ? '执政' : '在野';
    lines.push(`  ${party.name}(${party.abbreviation}): ${party.currentSupport}%支持 · ${party.projectedSeats}席 · ${ideology} · ${role}`);
    lines.push(`    领袖: ${party.leader} · 资金: ${party.funds}M · 组织力: ${party.organization} · 魅力: ${party.charisma}`);
    // 派阀信息
    if (party.factions && party.factions.length > 0) {
      for (const f of party.factions) {
        lines.push(`    派阀: ${f.name} (领袖:${f.leader.split(':')[1] ?? f.leader} · 忠诚:${f.loyalty} · 野心:${f.ambition} · ${f.members.length}人)`);
      }
    }
  }

  if (gov) {
    lines.push(`\n执政联盟: ${gov.rulingCoalition.join(', ')} (${gov.rulingCoalition.reduce((s, pid) => {
      const p = state.parties.find(pp => pp.id === pid);
      return s + (p?.projectedSeats ?? 0);
    }, 0)}席)`);
    lines.push(`稳定度: ${gov.stability} · ${gov.isMinority ? '少数政府' : '多数政府'}`);

    // 绝对多数判定
    const coalitionSeats = gov.rulingCoalition.reduce((s, pid) => {
      const p = state.parties.find(pp => pp.id === pid);
      return s + (p?.projectedSeats ?? 0);
    }, 0);
    if (coalitionSeats >= 134) {
      lines.push(`★ 绝对多数 (${coalitionSeats}/200) — 可修宪、Fast Track`);
    }
  }

  lines.push(`\n经济景气: ${state.metrics.economicIndex} · 社会稳定: ${state.metrics.socialStabilityIndex} · 媒体关注: ${state.metrics.mediaAttention}`);

  if (state.bills.length > 0) {
    lines.push(`\n待审法案: ${state.bills.length}件`);
    for (const bill of state.bills.slice(0, 3)) {
      lines.push(`  - ${bill.title} (${bill.status})`);
    }
  }

  return lines.join('\n');
}

// ===== LLM Prompt 构建 =====

/** Agent 推演结果（意图 + 思考日志） */
export interface AgentTurnResult {
  intents: AgentIntent[];
  events: PoliticalEvent[];
  logs: ThinkingLogEntry[];
}

/** LLM 返回的意图结构 */
interface LLMIntentOutput {
  intents: Array<{
    intent_type: string;
    target_id: string;
    priority: number;
    reasoning: string;
    payload: Record<string, unknown>;
    event?: {
      title: string;
      summary: string;
      dialogs: Array<{ speaker: string | null; text: string }>;
      choices: Array<{
        id: string;
        text: string;
        consequence: string;
        effects: {
          supportDelta?: Record<string, number>;
          relationDelta?: Record<string, number>;
          fundsDelta?: Record<string, number>;
          metricsDelta?: Record<string, number>;
        };
      }>;
      scenePrompt?: string;
      speakerId?: string | null;
    };
  }>;
}

/** 随机选取推文模板池中的一条 */
function pickReasoning(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)];
}

// ===== 推理文本多样性池 =====

const ATTACK_REASONS = [
  (leader: string, summary: string) => `${leader}在记者招待会上列举政府三项失职，宣布将在国会发起问责。${summary}`,
  (leader: string, summary: string) => `${leader}在党本部紧急会议上拍案而起："选民给我们的委托不是看着政府胡作非为！"${summary}`,
  (leader: string, summary: string) => `${leader}接受专访时痛斥政府施政不力，誓言在国会提出严厉质询。${summary}`,
  (leader: string, summary: string) => `${leader}召集影子内阁会议后宣布，将在议事堂对政府发起全面质询。${summary}`,
  (leader: string, summary: string) => `${leader}翻阅最新民调数据后冷笑："这样的支持率，政府还有什么脸面继续执政？"决定发起攻势。${summary}`,
];

const COALITION_REASONS = [
  (leader: string, allyName: string, summary: string) => `${leader}与${allyName}党首进行了两小时闭门会谈，双方达成初步合作意向。${summary}`,
  (leader: string, allyName: string, summary: string) => `${leader}派亲信与${allyName}方面秘密接触，提议组建在野统一战线。${summary}`,
  (leader: string, allyName: string, summary: string) => `${leader}在一场非公开晚宴上向${allyName}党首提出合作方案："只有联合，才能改变现状。"${summary}`,
  (leader: string, allyName: string, summary: string) => `${leader}通过中间人传话给${allyName}，建议双方在关键议题上统一立场对抗政府。${summary}`,
];

const PRESSURE_REASONS = [
  (leader: string, summary: string) => `${leader}在联盟内部会议上直言不讳："我们贡献了席位，理应获得更多话语权。"${summary}`,
  (leader: string, summary: string) => `${leader}暗示如果不能获得更多内阁职位，可能重新考虑联盟关系。${summary}`,
  (leader: string, summary: string) => `${leader}在媒体前巧妙透露对联盟分配的不满，向首相施加公开压力。${summary}`,
];

const PM_COALITION_REASONS = [
  (pmName: string, targetName: string, summary: string) => `${pmName}在首相官邸召集幕僚商议："我们需要${targetName}的支持才能稳定执政。"${summary}`,
  (pmName: string, targetName: string, summary: string) => `${pmName}指示党务高层与${targetName}展开秘密接触，承诺以阁僚职位换取联盟。${summary}`,
  (pmName: string, targetName: string, summary: string) => `${pmName}在党内干部会议上说："少数政府不能长久，必须主动出击拉拢${targetName}。"${summary}`,
];

const PM_RESHUFFLE_REASONS = [
  (stability: number, threats: string) => `首相审视内阁名单，稳定度仅${stability}点，决定撤换数名表现不佳的阁僚。${threats}`,
  (stability: number, threats: string) => `官邸消息人士透露，首相因内阁稳定度跌至${stability}，已拟定改组方案。${threats}`,
  (stability: number, threats: string) => `首相在深夜召集亲信商议人事变动："稳定度${stability}太低了，必须给联盟伙伴更多甜头。"${threats}`,
];

const FACTION_REASONS = [
  (challenger: string, leader: string, summary: string) => `${challenger}在党内元老面前公开质疑${leader}的领导："党的支持率在流血，我们不能坐视不理。"${summary}`,
  (challenger: string, leader: string, summary: string) => `${challenger}暗中串联党内不满势力，向${leader}发出温和但明确的挑战信号。${summary}`,
  (challenger: string, leader: string, summary: string) => `${challenger}在党大会上发言时话中有话："党需要新气象。"矛头直指${leader}。${summary}`,
];

const MEDIA_REASONS_POSITIVE = [
  (partyName: string, summary: string) => `《中央时事新闻》发表社论称赞${partyName}的政策方案具有前瞻性。${summary}`,
  (partyName: string, summary: string) => `《革新民报》深度报道${partyName}的改革举措，进步阵营反响热烈。${summary}`,
  (partyName: string, summary: string) => `《经合新闻》从经济角度肯定${partyName}的政策方向，商界评价积极。${summary}`,
];

const MEDIA_REASONS_NEGATIVE = [
  (partyName: string, summary: string) => `《中央时事新闻》头版曝光${partyName}内部文件，揭示政策承诺与实际执行之间存在巨大差距。${summary}`,
  (partyName: string, summary: string) => `《革新民报》尖锐批评${partyName}的立场违背劳工利益，引发左翼阵营强烈反弹。${summary}`,
  (partyName: string, summary: string) => `《经合新闻》质疑${partyName}的经济政策可能损害市场信心，工商界表示担忧。${summary}`,
];

const LOBBY_REASONS = [
  (summary: string) => `经团连代表团造访国会，与多名执政党议员闭门会面，桌上放着一份政策建议书和隐晦的捐款意向。${summary}`,
  (summary: string) => `一个新兴产业联盟约见关键议员，以"政策研究资助"名义提出资金支持。${summary}`,
  (summary: string) => `商界大佬在私人晚宴上向执政党高层暗示，若政策方向合适，将加大政治捐助力度。${summary}`,
];

/** 党派汉字简称（用于媒体称呼等场景） */
const PARTY_SHORT_NAME: Record<string, string> = {
  reform: '民主',
  liberty: '自由',
  conservative: '保守',
  progressive: '社会',
  populist: '公民',
  green: '劳工',
};

/** 构建通用的 LLM system prompt */
function buildSystemPrompt(role: string, roleDescription: string, state: GameState): string {
  const partyIds = state.parties.map(p => `${p.id}(${p.name})`).join(', ');
  const playerConfig = state.playerConfig;
  const playerParty = playerConfig ? state.parties.find(p => p.id === playerConfig.partyId) : null;
  const isRuling = playerConfig ? (state.government?.rulingCoalition.includes(playerConfig.partyId) ?? false) : false;
  const playerRole = isRuling ? '执政联盟' : '在野党';
  const playerPartyShort = playerParty ? PARTY_SHORT_NAME[playerParty.id] ?? playerParty.name : '某党';

  return `你是一个日本议会政治模拟游戏中的AI决策与叙事生成Agent。你的角色是：${role}（${roleDescription}）。

## 你的任务
1. 根据当前政治局势，决定你这一回合要采取的政治行动
2. 为每个行动生成完整的剧情内容（场景、对话、选项）

## 可用党派ID（speaker字段只能使用以下ID，null表示旁白）
${partyIds}

## 关于角色的关键说明
- 你（Agent）扮演的是游戏中的NPC（如首相、党首、媒体等）
- 玩家是一个新晋议员，隶属于${playerParty?.name ?? '某党'}，${playerRole}阵营
- 玩家绝对不是首相，也不是党首，只是一个普通议员
- 对话中的speaker字段只能填党派ID（如${state.parties.map(p => p.id).join(', ')}）或null，不要填人名、角色名、或其他文字

## 对玩家的称呼规则（严格遵守）
玩家姓名: 姓="${playerConfig?.lastName ?? '某'}" 名="${playerConfig?.firstName ?? '某'}" 性别=${playerConfig?.gender === 'female' ? '女' : '男'}
- 正式场合/初次见面/对方是上级: "${playerConfig?.lastName ?? '某'}议员" 或 "议员${playerConfig?.gender === 'female' ? '女士' : '先生'}" 或 "${playerConfig?.lastName ?? '某'}${playerConfig?.gender === 'female' ? '女士' : '先生'}"
- 关系亲近的同僚/后辈: "${playerConfig?.firstName ?? '某'}君" 或 "${playerConfig?.firstName ?? '某'}${playerConfig?.gender === 'female' ? '酱' : '君'}"
- 媒体报道: "${playerConfig?.lastName ?? '某'}${playerConfig?.firstName ?? '某'}氏" 或 "${playerPartyShort}·${playerConfig?.lastName ?? '某'}${playerConfig?.firstName ?? '某'}氏"
- 国会议事中的正式点名（无论男女）: "${playerConfig?.lastName ?? '某'}${playerConfig?.firstName ?? '某'}君"
- 你自行根据角色与玩家的关系亲疏、场合正式程度选择合适的称呼，保持自然

## 可用的意图类型（intent_type）
- coalition_proposal: 向其他政党提出联盟提案（payload需含 proposingPartyId, targetPartyId, offeredPosts）
- cabinet_reshuffle: 内阁改组（payload需含 stabilityDelta）
- opposition_attack: 在野党攻击政府（payload需含 attackPartyId, supportDelta）
- opposition_coalition: 在野党联盟密会（payload需含 proposingPartyId, targetPartyId）
- coalition_pressure: 联盟小党向首相施压（payload需含 demandingPartyId, demandedPosts）
- faction_challenge: 派系挑战党首（payload需含 challengerName, currentLeaderName, partyId, supportDelta）
- media_boost: 媒体正面报道（payload需含 targetPartyId, isPositive=true, supportDelta, mediaDelta）
- media_scandal: 媒体负面爆料（payload需含 targetPartyId, isPositive=false, supportDelta, mediaDelta）
- lobby_funds: 利益集团政治捐款（payload需含 targetPartyId, fundsDelta, corruptionRisk）
- wait: 按兵不动，不采取行动

## 输出格式（严格JSON）
{
  "intents": [
    {
      "intent_type": "意图类型",
      "target_id": "目标党派ID",
      "priority": 1-10,
      "reasoning": "你的政治推理，具体生动，结合数据",
      "payload": { ... },
      "event": {
        "title": "事件标题（4-8字）",
        "summary": "事件概要",
        "dialogs": [
          {"speaker": null, "text": "旁白描述场景"},
          {"speaker": "党派ID", "text": "角色台词"},
          {"speaker": null, "text": "旁白引出玩家选择"}
        ],
        "choices": [
          {
            "id": "choice_id",
            "text": "选项文字（8字以内）",
            "consequence": "后果描述",
            "effects": {
              "supportDelta": {"党派ID": 数字},
              "relationDelta": {"fromID>toID": 数字},
              "metricsDelta": {"mediaAttention": 数字, "socialStabilityIndex": 数字}
            }
          }
        ],
        "scenePrompt": "自由文本场景描述",
        "speakerId": "党派ID或null"
      }
    }
  ]
}

## 叙事规则
- dialogs 应有2-4条，先旁白设定场景，再角色发言，最后旁白引出玩家选择
- choices 应有2-3个选项，代表不同的政治立场和后果
- 内容必须像真实日本政治场景，涉及具体政策、政治术语、议会程序
- 场景多样化：国会质询、闭门会议、料亭密会、媒体采访、走廊偶遇等
- effects数字合理：supportDelta -3到+3，metricsDelta -10到+10
- 每次生成必须独特，绝不重复
- speaker字段约束（严格遵守）：只能是 ${state.parties.map(p => p.id).join(' 或 ')} 或 null，不要填其他任何值

## 玩家立场（极其重要！）
当前玩家: ${playerConfig?.lastName ?? '某'}${playerConfig?.firstName ?? '某'} · 所属: ${playerParty?.name ?? '未知'} · 立场: ${playerRole} · 身份: 新晋普通议员（不是首相，不是党首）${playerConfig ? `\n背景: ${playerConfig.background}` : ''}
- 玩家是${playerRole}的普通议员：选项应符合此立场，把最符合玩家角色的选项放前面
- "保持沉默/中立"永远是可选的
- 绝对不要把玩家写成首相或党首，玩家只是一个新人议员

## 游戏全局规则（不可违反）
- 世界观：架空日本，2058年，议会内阁制，众议院为唯一可操作议会
- 众议院总席位200席，任期4年（48回合），1回合=1个月
- 现实中的日本政党不存在，所有政党为原创；现实中的日本政治人物不存在，所有人物为原创
- 允许使用日本姓名、行政区划（东京、大阪、北海道等）、政府机构（首相官邸、财务省、防卫省等）
- 本作重点是：议会政治、派系斗争、联合组阁、委员会博弈、媒体战、利益集团博弈。不是现实政治映射
- AI只能提出行动意图，不得直接修改议席、支持率、投票结果或内阁职位
- 你生成的 effects 数值只是建议，最终结算由规则引擎决定

## 禁止现实政治元素（严格遵守）
- 禁止使用任何现实日本派阀名称（清和会、平成会、宏池会、志帅会等）
- 禁止使用任何现实日本媒体名称（NHK、朝日新闻、读卖新闻、每日新闻、产经新闻、文春等）
- 禁止使用任何现实日本大学名称（东京大学、京都大学、早稻田、庆应等）
- 派阀命名必须使用虚构名称（如：至誠会、創志会、新政会等）
- 媒体报道必须使用固定的三家媒体：
  * 中央时事新闻（中间派立场）
  * 革新民报（左翼立场）
  * 经合新闻（右翼立场）
- 学历必须使用虚构描述（顶尖国立大学、知名私立大学等）
- 政党和政治人物必须完全虚构，不得映射现实人物或政党
- 违反此规则的内容将被拒绝

## 媒体系统规则（严格遵守）
- 游戏中只有三家媒体，不可添加或修改：
  1. 中央时事新闻（中时）：中间派立场，影响中产阶层、公务员
  2. 革新民报（革新）：左翼立场，影响工会、进步阵营
  3. 经合新闻（经合）：右翼立场，影响企业家、工商界
- 所有媒体相关内容必须使用这三家媒体之一
- 不得创建或使用其他媒体名称

## 政治体系参考（AI演算依赖规则）
### 议会结构
- 众议院200席 = 120席选区(单席制，得票最高者当选) + 80席比例代表(按全国支持率分配)
- 议长由执政联盟最大党推荐、全院表决后退出党派保持中立；副议长由最大在野党推荐
- 议员必须加入会派，会派不完全等于政党，多个小党可组成共同会派

### 9个常任委员会（共200席）
- 内阁委员会(20人)：监督首相官邸、行政改革、公务员制度
- 总务委员会(20人)：监督地方自治、行政事务、数字化改革
- 法务委员会(20人)：监督司法制度、刑法、民法（委员长可由在野党担任）
- 外务委员会(20人)：监督外交、国际关系
- 财务金融委员会(30人)：监督财政、税制、金融（委员长由执政联盟担任）
- 经济产业委员会(25人)：监督产业政策、能源、科技
- 安全保障委员会(20人)：监督防卫省、自卫队、国家安全
- 预算委员会(30人)：最高权力委员会，监督年度预算/补充预算（委员长由执政联盟担任，首相必须出席，期间支持率波动×1.5、丑闻曝光×1.5、媒体影响×1.5）
- 厚生劳动委员会(15人)：监督医疗、养老金、劳动政策

### 每月议事流程
- 第1周：委员会召开 → 第2周：法案审查 → 第3周：党首辩论(180分钟按会派规模分配) → 第4周：全院表决 → 更新支持率/联盟关系/媒体评价/利益集团态度

### 派阀系统
- 除联合工人党(solidarity)外所有政党允许存在派阀，派阀影响党首选举、首相指名、大臣任命、法案表决
- 派阀忠诚度0~100：高于70稳定支持、40~70观望、低于40可能逼宫、低于20可能脱党
- 派阀诉求：内阁职位、委员会委员长、预算资源、政策影响力、媒体曝光。长期得不到满足则ambition上升、loyalty下降
- 派阀挑战条件：派阀规模≥全党25% 且 党首支持率<35% 且 派阀忠诚度<40 → 允许发起leadership_challenge

### 联合工人党(solidarity)特殊规则
- 实行民主集中制，禁止派阀，投票纪律95%~100%
- 党员忠诚度过低时允许退党/辞职/独立参选，但禁止形成新派阀

### 首相权力
- 可解散众议院(条件：主动解散/不信任案通过后/重大政治危机/执政联盟崩溃)
- 解散后：立即大选、所有法案自动失效、委员会停止运作、内阁转入看守
- 若满足支持率>45%且反对党支持率分散，提高提前解散概率

### 大选系统
- 触发条件：法定任期届满(48回合)/首相解散众议院/不信任案通过且首相未辞职/特殊国家危机
- 选举期间持续1回合，媒体影响力×200%、支持率波动×150%
- 计算公式：40%政党支持率 + 30%候选人个人支持率 + 20%地方倾向 + 10%随机波动
- 选后组阁流程：统计席位→联盟谈判→首相指名选举→组阁→委员会重组

### 党首选举触发条件
- 党首辞职/大选惨败/派阀挑战成功/重大丑闻 → 影响首相候选人、联盟谈判、政策路线

### 法案决策链（禁止无限讨论）
- 起草→党内讨论→派阀协商→委员会审议→委员会修正→委员会表决→全院辩论→全院表决→实施
- AI可：支持/反对/弃权/修正/拖延/交易。每项议案有decision_deadline，超期自动表决
- 法案最终结果：Passed/Rejected/Withdrawn/Delayed

### 不信任案决策链
- 提案→联署收集(需≥20名议员)→议会辩论→表决→结果
- 若通过：首相选择辞职或解散众议院

### 表决门槛
- 委员会：出席委员过半赞成。全院普通法案：出席议员过半赞成。不信任案：全体议员过半(≥101票)

### 政治晋升体系（双轨制，互不影响）
- 党内路线：普通党员→青年局干部→政策委员会成员→党务干部→副干事长→干事长→副党首→党首
- 国会路线：普通议员→委员会理事→副委员长→委员长→政务官→副大臣→国务大臣→内阁官房长官→内阁总理大臣
- 成为大臣≠成为党首；成为党首≠进入内阁；总理大臣一般是党首但非必然

### 内阁任命规则
- 首相考虑：忠诚度、能力值、派系平衡、联盟协议、政治交易
- 派阀过大而未获得职位→提高叛变概率

### 人物背景系统
- 角色拥有：family_origin, education, career, social_class, hometown, connections
- 政治世家：派系接纳度高、获得推荐人容易、媒体关注高、募款效率高；但易卷入家族丑闻、被攻击裙带关系
- 普通家庭：亲民形象高、基层支持率高；但建派系慢、政治资源少
- 事件生成必须读取背景，不同出身产生不同剧情

### 绝对多数规则
- 执政联盟≥134席(2/3)获得Constitutional Majority：可提出修宪法案(跳过阻挠流程)、强制终止委员会拖延、启动Fast Track Legislation、纪律投票加成、委员会席位分配优势
- 修宪法案通过门槛：全院2/3以上(≥134票)赞成
- 绝对多数不自动保证通过，联盟内部严重叛变仍可失败

### 党首与首相分离
- 党首负责党务/选举/路线斗争；首相负责组阁/施政/国会运营
- 通常执政党党首兼任首相，但允许党首≠首相的特殊政治局面

## 最高规则（不可违反）
- 允许"党首≠首相"的特殊政治局面。执政党党首与首相可以是不同人物（党内权力分散、派系妥协、傀儡内阁等），不得假设党首必然是首相
- 任何事件最终必须导向某项政治决定。每个事件必须有明确的、可衡量的政治后果
- 禁止无限对话、无限阴谋、无限会议。事件不得无限拖延，必须在当前回合内产生可结算的政治结果
- 所有政治行为必须产生以下至少一项结果，否则事件无效：支持率变化、权力变化、职位变化、法案结果、选举结果、联盟变化
- 单个事件的effects可以为零或很小（表示暂时未产生明显影响），但同类型事件累计超过3个时，effects必须包含至少一项非零的政治后果。事件的积累必然产生量变到质变的效果

## 约束
- 每回合最多生成2个意图，每个意图必须附带event字段
- 必须符合你的角色身份
- 如果无事可做，返回空intents数组

## JSON 输出格式要求（严格遵守）
- 直接输出纯 JSON 对象，不要使用 markdown 代码块标记
- 不要添加任何解释性文字、注释或额外说明
- 确保 JSON 格式完整且正确，所有字符串和括号必须闭合`;
}

/** 首相 Agent LLM prompt */
function buildPMUserPrompt(state: GameState, perception: AgentPerception): string {
  const gov = state.government!;
  const coalitionInfo = gov.rulingCoalition.map(pid => {
    const p = state.parties.find(pp => pp.id === pid);
    return p ? `${p.name}(${p.projectedSeats}席)` : pid;
  }).join(', ');

  return `## 当前世界局势
${buildWorldSummary(state)}

## 你是首相 ${gov.primeMinisterName}
- 你的党派: ${state.parties.find(p => p.id === gov.primeMinisterPartyId)?.name ?? gov.primeMinisterPartyId}
- 执政联盟: ${coalitionInfo}
- ${gov.isMinority ? '⚠️ 你是少数政府！随时可能被不信任案推翻！' : '你拥有多数席位。'}

## 情报分析
- 局势摘要: ${perception.summary}
- 威胁: ${perception.threats.length > 0 ? perception.threats.join('；') : '无特别威胁'}
- 机会: ${perception.opportunities.length > 0 ? perception.opportunities.join('；') : '无特别机会'}

请作为首相，制定本回合的政治策略。`;
}

/** 党首 Agent LLM prompt */
function buildPartyLeaderUserPrompt(
  state: GameState,
  perception: AgentPerception,
  party: Party,
  isRuling: boolean,
  isPM: boolean,
): string {
  const gov = state.government;
  return `## 当前世界局势
${buildWorldSummary(state)}

## 你是 ${party.name} 党首 ${party.leader}
- 意识形态: ${ideologyLabel(party.ideology)}
- 当前席位: ${party.projectedSeats} · 支持率: ${party.currentSupport}%
- ${isRuling ? (isPM ? '你是首相所在党的党首' : '你是执政联盟成员') : '你是反对党'}
- 资金: ${party.funds}M · 组织力: ${party.organization} · 魅力: ${party.charisma}

## 情报分析
- 局势摘要: ${perception.summary}
- 威胁: ${perception.threats.length > 0 ? perception.threats.join('；') : '无特别威胁'}
- 机会: ${perception.opportunities.length > 0 ? perception.opportunities.join('；') : '无特别机会'}

${!isRuling && gov ? `\n执政党是${state.parties.find(p => p.id === gov.primeMinisterPartyId)?.name ?? gov.primeMinisterPartyId}，${gov.isMinority ? '少数政府处境艰难。' : '多数政府稳固。'}` : ''}

请作为党首，制定本回合的政治策略。`;
}

/** 派系领袖 Agent LLM prompt */
function buildFactionLeaderUserPrompt(
  state: GameState,
  perception: AgentPerception,
  config: AgentConfig,
): string {
  const party = state.parties.find(p => p.id === config.partyId);
  return `## 当前世界局势
${buildWorldSummary(state)}

## 你是 ${party?.name ?? '某党'} 内部的派系领袖 ${config.personName ?? ''}
- 你不是党首，但拥有相当影响力
- 本党支持率: ${party?.currentSupport ?? '?'}% · 基准支持率: ${party?.baseSupport ?? '?'}%
- ${party && party.currentSupport < party.baseSupport - 3 ? '⚠️ 党的支持率明显下滑！' : '党的支持率稳定。'}

## 情报分析
- 局势摘要: ${perception.summary}
- 威胁: ${perception.threats.length > 0 ? perception.threats.join('；') : '无特别威胁'}
- 机会: ${perception.opportunities.length > 0 ? perception.opportunities.join('；') : '无特别机会'}

请作为派系领袖，决定是否要挑战党首或采取其他行动。`;
}

/** 媒体 Agent LLM prompt */
function buildMediaUserPrompt(state: GameState, perception: AgentPerception): string {
  return `## 当前世界局势
${buildWorldSummary(state)}

## 你是主流媒体
- 你的目标是报道最有新闻价值的政治事件
- 媒体关注指数: ${state.metrics.mediaAttention}/100
- 经济景气指数: ${state.metrics.economicIndex} · 社会稳定指数: ${state.metrics.socialStabilityIndex}

## 情报分析
- 局势摘要: ${perception.summary}
- 威胁: ${perception.threats.length > 0 ? perception.threats.join('；') : '无'}
- 机会: ${perception.opportunities.length > 0 ? perception.opportunities.join('；') : '无'}

请决定本回合要报道什么新闻。可以选择 media_boost（正面报道）或 media_scandal（负面爆料）。`;
}

/** 利益集团 Agent LLM prompt */
function buildInterestGroupUserPrompt(state: GameState, perception: AgentPerception): string {
  return `## 当前世界局势
${buildWorldSummary(state)}

## 你是经济利益团体（经团连）
- 你的目标是影响政策以维护商业利益
- 你拥有大量政治捐款能力
- 经济景气指数: ${state.metrics.economicIndex}

## 情报分析
- 局势摘要: ${perception.summary}
- 威胁: ${perception.threats.length > 0 ? perception.threats.join('；') : '无'}
- 机会: ${perception.opportunities.length > 0 ? perception.opportunities.join('；') : '无'}

请决定本回合要游说或捐款给哪个党派。`;
}

// ===== 事件严重度映射 =====

const INTENT_SEVERITY: Record<string, number> = {
  coalition_proposal: 4,
  cabinet_reshuffle: 3,
  opposition_attack: 4,
  opposition_coalition: 4,
  coalition_pressure: 3,
  faction_challenge: 4,
  media_boost: 2,
  media_scandal: 4,
  lobby_funds: 3,
};

// ===== Agent 基类 =====

abstract class BaseAgent {
  config: AgentConfig;

  constructor(config: AgentConfig) {
    this.config = config;
  }

  /** 感知：构建当前局势认知 */
  abstract perceive(state: GameState): AgentPerception;

  /** 规则引擎 fallback 思考 */
  abstract thinkFallback(state: GameState, perception: AgentPerception): AgentIntent[];

  /** 获取角色描述 */
  abstract getRoleDescription(): string;

  /** 构建 LLM 用户 prompt */
  abstract buildUserPrompt(state: GameState, perception: AgentPerception): string;

  /** 从 LLM 输出构建 PoliticalEvent */
  private buildEventFromLLM(intent: LLMIntentOutput['intents'][0], state: GameState): PoliticalEvent | null {
    if (!intent.event?.dialogs?.length || !intent.event?.choices?.length) return null;

    return {
      id: `ai-${this.config.actor_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: intent.event.title,
      summary: intent.event.summary,
      sourceParty: (intent.payload.proposingPartyId as string)
        ?? (intent.payload.attackPartyId as string)
        ?? (intent.payload.demandingPartyId as string)
        ?? intent.target_id,
      severity: INTENT_SEVERITY[intent.intent_type] ?? 3,
      dialogs: intent.event.dialogs.map(d => ({ speaker: d.speaker, text: d.text })),
      choices: intent.event.choices.map(c => ({
        id: c.id,
        text: c.text,
        consequence: c.consequence,
        effects: {
          supportDelta: c.effects.supportDelta,
          relationDelta: c.effects.relationDelta,
          fundsDelta: c.effects.fundsDelta,
          metricsDelta: c.effects.metricsDelta,
        },
      })),
      freeText: intent.event.scenePrompt ? {
        scenePrompt: intent.event.scenePrompt,
        speakerId: intent.event.speakerId ?? null,
        placeholder: '发表你的看法...',
      } : undefined,
      intentType: intent.intent_type,
    };
  }

  /** LLM 增强 + fallback 生成意图 */
  async generateIntent(state: GameState): Promise<{ intents: AgentIntent[]; events: PoliticalEvent[]; log: ThinkingLogEntry | null }> {
    const perception = this.perceive(state);

    // 尝试 LLM
    if (isLLMAvailable()) {
      try {
        const systemPrompt = buildSystemPrompt(this.config.role, this.getRoleDescription(), state);
        const userPrompt = this.buildUserPrompt(state, perception);

        const result = await askLLMJSON<LLMIntentOutput>(
          systemPrompt,
          userPrompt,
          { intents: [] },
          { maxTokens: 6000, temperature: 0.7, responseFormat: null },
        );

        if (result && result.intents && result.intents.length > 0) {
          const intents: AgentIntent[] = [];
          const events: PoliticalEvent[] = [];

          for (const raw of result.intents) {
            intents.push({
              actor_id: this.config.actor_id,
              intent_type: raw.intent_type,
              target_id: raw.target_id,
              priority: raw.priority,
              reasoning: raw.reasoning,
              payload: raw.payload,
            });
            const event = this.buildEventFromLLM(raw, state);
            if (event) events.push(event);
          }

          return {
            intents,
            events,
            log: {
              role: this.config.role,
              name: this.config.personName ?? this.getRoleLabel(),
              reasoning: result.intents[0]?.reasoning ?? '生成策略意图',
              action: result.intents.map(i => i.intent_type).join(', '),
              timestamp: Date.now(),
            },
          };
        }

        // LLM 返回空意图（按兵不动）
        return {
          intents: [],
          events: [],
          log: {
            role: this.config.role,
            name: this.config.personName ?? this.getRoleLabel(),
            reasoning: '经过深思熟虑，决定本回合不采取特别行动。',
            action: 'wait',
            timestamp: Date.now(),
          },
        };
      } catch (err) {
        console.warn(`[Agent] LLM failed for ${this.config.actor_id}, using fallback:`, err);
      }
    }

    // Fallback 到规则引擎
    const fallbackIntents = this.thinkFallback(state, perception);
    return {
      intents: fallbackIntents,
      events: [],
      log: fallbackIntents.length > 0 ? {
        role: this.config.role,
        name: this.config.personName ?? this.getRoleLabel(),
        reasoning: fallbackIntents[0].reasoning,
        action: fallbackIntents.map(i => i.intent_type).join(', '),
        timestamp: Date.now(),
      } : {
        role: this.config.role,
        name: this.config.personName ?? this.getRoleLabel(),
        reasoning: '观察局势，暂不行动。',
        action: 'wait',
        timestamp: Date.now(),
      },
    };
  }

  /** 角色显示名 */
  getRoleLabel(): string {
    const labels: Record<string, string> = {
      prime_minister: '首相',
      party_leader: '党首',
      faction_leader: '派系领袖',
      media: '媒体',
      interest_group: '利益集团',
    };
    return labels[this.config.role] ?? this.config.role;
  }
}

// ===== 首相 Agent =====

export class PrimeMinisterAgent extends BaseAgent {
  getRoleDescription(): string {
    return '日本首相，领导执政联盟，负责政府稳定运作';
  }

  buildUserPrompt(state: GameState, perception: AgentPerception): string {
    return buildPMUserPrompt(state, perception);
  }

  perceive(state: GameState): AgentPerception {
    const gov = state.government;
    const pmParty = state.parties.find(p => p.id === gov?.primeMinisterPartyId);
    const coalitionSeats = gov?.rulingCoalition.reduce((s, pid) => {
      return s + (state.parties.find(p => p.id === pid)?.projectedSeats ?? 0);
    }, 0) ?? 0;
    const majority = state.metrics.majorityThreshold;

    const perception: AgentPerception = {
      summary: `首相${gov?.primeMinisterName ?? ''}领导${pmParty?.name ?? ''}执政联盟，当前${coalitionSeats}席，${coalitionSeats >= majority ? '已过半' : `距过半差${majority - coalitionSeats}席`}。`,
      key_factors: [],
      threats: [],
      opportunities: [],
    };

    if (coalitionSeats < majority) {
      perception.threats.push('少数政府，随时可能被不信任案推翻');
      perception.opportunities.push('可以拉拢中间派政党扩大联盟');
    }

    if (pmParty && pmParty.currentSupport < pmParty.baseSupport - 3) {
      perception.threats.push('本党支持率下滑');
    }

    for (const party of state.parties) {
      if (gov && !gov.rulingCoalition.includes(party.id) && party.projectedSeats >= 20) {
        perception.key_factors.push(`${party.name}(${party.projectedSeats}席)是在野大党`);
      }
    }

    if (gov && gov.stability < 50) {
      perception.threats.push('内阁稳定度低，联盟伙伴不满');
    }

    return perception;
  }

  thinkFallback(state: GameState, perception: AgentPerception): AgentIntent[] {
    const intents: AgentIntent[] = [];
    const gov = state.government;
    if (!gov) return intents;

    // 策略1：少数政府时寻求联盟
    if (gov.isMinority) {
      const candidates = state.parties
        .filter(p => !gov.rulingCoalition.includes(p.id))
        .sort((a, b) => {
          const distA = Math.abs(IDEOLOGY_ORDER.indexOf(a.ideology) - IDEOLOGY_ORDER.indexOf('center'));
          const distB = Math.abs(IDEOLOGY_ORDER.indexOf(b.ideology) - IDEOLOGY_ORDER.indexOf('center'));
          return distA - distB;
        });

      if (candidates.length > 0) {
        const target = candidates[0];
        intents.push({
          actor_id: this.config.actor_id,
          intent_type: 'coalition_proposal',
          target_id: target.id,
          priority: 2,
          reasoning: pickReasoning(PM_COALITION_REASONS)(gov.primeMinisterName, target.name, perception.summary),
          payload: {
            proposingPartyId: gov.primeMinisterPartyId,
            targetPartyId: target.id,
            offeredPosts: ['chief_secretary'],
          },
        });
      }
    }

    // 策略2：稳定度低时调整内阁
    if (gov.stability < 40) {
      intents.push({
        actor_id: this.config.actor_id,
        intent_type: 'cabinet_reshuffle',
        target_id: 'cabinet',
        priority: 3,
        reasoning: pickReasoning(PM_RESHUFFLE_REASONS)(gov.stability, perception.threats.join('；')),
        payload: { stabilityDelta: 10 },
      });
    }

    return intents;
  }
}

// ===== 党首 Agent =====

export class PartyLeaderAgent extends BaseAgent {
  getRoleDescription(): string {
    return `党首，领导政党进行政治博弈`;
  }

  buildUserPrompt(state: GameState, perception: AgentPerception): string {
    const party = state.parties.find(p => p.id === this.config.partyId);
    const gov = state.government;
    const isRuling = gov?.rulingCoalition.includes(party!.id) ?? false;
    const isPM = gov?.primeMinisterPartyId === party!.id;
    return buildPartyLeaderUserPrompt(state, perception, party!, isRuling, isPM);
  }

  perceive(state: GameState): AgentPerception {
    const party = state.parties.find(p => p.id === this.config.partyId);
    if (!party) return { summary: '未知党派', key_factors: [], threats: [], opportunities: [] };

    const gov = state.government;
    const isRuling = gov?.rulingCoalition.includes(party.id) ?? false;
    const isPM = gov?.primeMinisterPartyId === party.id;
    const supportTrend = party.currentSupport - party.baseSupport;

    return {
      summary: `${party.leader}领导的${party.name}，${party.projectedSeats}席，${isRuling ? (isPM ? '执政党（首相所在党）' : '执政联盟成员') : '在野党'}。支持率${party.currentSupport}%（${supportTrend > 0 ? '上升' : supportTrend < 0 ? '下降' : '持平'}）。`,
      key_factors: [
        `资金${party.funds}M，组织力${party.organization}，魅力${party.charisma}`,
      ],
      threats: supportTrend < -3 ? ['支持率明显下滑'] : [],
      opportunities: !isRuling && party.projectedSeats >= 30 ? ['有实力争取执政地位'] : [],
    };
  }

  thinkFallback(state: GameState, perception: AgentPerception): AgentIntent[] {
    const intents: AgentIntent[] = [];
    const party = state.parties.find(p => p.id === this.config.partyId);
    if (!party) return intents;

    const gov = state.government;
    const isRuling = gov?.rulingCoalition.includes(party.id) ?? false;

    // 在野党首：攻击政府
    if (!isRuling && gov && gov.isMinority) {
      const rng = Math.random();
      if (rng < 0.4) {
        intents.push({
          actor_id: this.config.actor_id,
          intent_type: 'opposition_attack',
          target_id: gov.primeMinisterPartyId,
          priority: 3,
          reasoning: pickReasoning(ATTACK_REASONS)(party.leader, perception.summary),
          payload: {
            attackPartyId: party.id,
            supportDelta: { [party.id]: 1, [gov.primeMinisterPartyId]: -2 },
          },
        });
      }
    }

    // 在野大党首：寻求联盟
    if (!isRuling && party.projectedSeats >= 30) {
      const allies = state.parties
        .filter(p => p.id !== party.id)
        .filter(p => {
          const rel = state.relations.find(r => r.from === party.id && r.to === p.id);
          return rel && rel.score > 0;
        })
        .sort((a, b) => {
          const relA = state.relations.find(r => r.from === party.id && r.to === a.id);
          const relB = state.relations.find(r => r.from === party.id && r.to === b.id);
          return (relB?.score ?? 0) - (relA?.score ?? 0);
        });

      if (allies.length > 0) {
        intents.push({
          actor_id: this.config.actor_id,
          intent_type: 'opposition_coalition',
          target_id: allies[0].id,
          priority: 4,
          reasoning: pickReasoning(COALITION_REASONS)(party.leader, allies[0].name, perception.summary),
          payload: {
            proposingPartyId: party.id,
            targetPartyId: allies[0].id,
          },
        });
      }
    }

    // 执政联盟小党首：向首相施压
    if (isRuling && gov && gov.primeMinisterPartyId !== party.id) {
      if (gov.stability < 60) {
        intents.push({
          actor_id: this.config.actor_id,
          intent_type: 'coalition_pressure',
          target_id: gov.primeMinisterPartyId,
          priority: 3,
          reasoning: pickReasoning(PRESSURE_REASONS)(party.leader, perception.summary),
          payload: {
            demandingPartyId: party.id,
            demandedPosts: ['economy_minister'],
          },
        });
      }
    }

    return intents;
  }
}

// ===== 派系领袖 Agent =====

export class FactionLeaderAgent extends BaseAgent {
  getRoleDescription(): string {
    return '党内部派系领袖，可能挑战党首或推动党内改革';
  }

  buildUserPrompt(state: GameState, perception: AgentPerception): string {
    return buildFactionLeaderUserPrompt(state, perception, this.config);
  }

  perceive(state: GameState): AgentPerception {
    const party = state.parties.find(p => p.id === this.config.partyId);
    if (!party) return { summary: '未知', key_factors: [], threats: [], opportunities: [] };

    // 查找该议员所在的派阀
    const mpKey = `${this.config.partyId}:${this.config.personName}`;
    const mpPersonality = state.mpPersonalities[mpKey];
    const faction = mpPersonality?.factionId
      ? party.factions?.find(f => f.id === mpPersonality.factionId)
      : null;

    const summary = faction
      ? `派系领袖${this.config.personName}在${party.name}内部活动，领导${faction.name}（${faction.members.length}人，忠诚度${faction.loyalty}，野心${faction.ambition}）。`
      : `派系领袖${this.config.personName}在${party.name}内部活动。`;

    return {
      summary,
      key_factors: [`党首${party.leader}的支持率为${party.currentSupport}%`],
      threats: party.currentSupport < party.baseSupport - 5 ? ['本党支持率严重下滑，党内可能出现不满'] : [],
      opportunities: [],
    };
  }

  thinkFallback(state: GameState, perception: AgentPerception): AgentIntent[] {
    const intents: AgentIntent[] = [];
    const party = state.parties.find(p => p.id === this.config.partyId);
    if (!party) return intents;

    // 查找该议员所在派阀
    const mpKey = `${this.config.partyId}:${this.config.personName}`;
    const mpPersonality = state.mpPersonalities[mpKey];
    const faction = mpPersonality?.factionId
      ? party.factions?.find(f => f.id === mpPersonality.factionId)
      : null;

    // 派阀领袖挑战：满足规则条件时（派阀规模≥全党25%、党首支持率<35%、忠诚度<40）
    const factionShare = faction ? faction.members.length / Math.max(1, party.projectedSeats) : 0;
    const canChallenge = faction && factionShare >= 0.25 && party.currentSupport < 35 && faction.loyalty < 40;

    if ((canChallenge || (party.currentSupport < party.baseSupport - 5 && !party.leader.includes(this.config.personName ?? '')))) {
      if (Math.random() < (canChallenge ? 0.35 : 0.15)) {
        intents.push({
          actor_id: this.config.actor_id,
          intent_type: 'faction_challenge',
          target_id: party.id,
          priority: 5,
          reasoning: pickReasoning(FACTION_REASONS)(this.config.personName ?? '某议员', party.leader, perception.summary),
          payload: {
            challengerName: this.config.personName,
            currentLeaderName: party.leader,
            partyId: party.id,
            supportDelta: { [party.id]: -2 },
            factionId: faction?.id,
            factionLoyalty: faction?.loyalty,
            factionShare: Math.round(factionShare * 100),
          },
        });
      }
    }

    return intents;
  }
}

// ===== 媒体 Agent =====

export class MediaAgent extends BaseAgent {
  getRoleDescription(): string {
    return '主流媒体，关注新闻价值，影响公众舆论';
  }

  buildUserPrompt(state: GameState, perception: AgentPerception): string {
    return buildMediaUserPrompt(state, perception);
  }

  perceive(state: GameState): AgentPerception {
    return {
      summary: `媒体关注度高(${state.metrics.mediaAttention}/100)。经济景气${state.metrics.economicIndex}，社会稳定${state.metrics.socialStabilityIndex}。`,
      key_factors: state.bills.length > 0 ? ['有法案正在审议'] : [],
      threats: state.metrics.socialStabilityIndex < 40 ? ['社会不稳，舆论容易发酵'] : [],
      opportunities: state.metrics.mediaAttention > 60 ? ['高关注度，报道效果加倍'] : [],
    };
  }

  thinkFallback(state: GameState, perception: AgentPerception): AgentIntent[] {
    const intents: AgentIntent[] = [];

    // 媒体曝光：随机选一个党派放大报道
    if (Math.random() < 0.3) {
      const targetParty = state.parties[Math.floor(Math.random() * state.parties.length)];
      const isPositive = Math.random() > 0.5;
      const reasons = isPositive ? MEDIA_REASONS_POSITIVE : MEDIA_REASONS_NEGATIVE;
      intents.push({
        actor_id: this.config.actor_id,
        intent_type: isPositive ? 'media_boost' : 'media_scandal',
        target_id: targetParty.id,
        priority: 6,
        reasoning: pickReasoning(reasons)(targetParty.name, perception.summary),
        payload: {
          targetPartyId: targetParty.id,
          isPositive,
          supportDelta: { [targetParty.id]: isPositive ? 2 : -3 },
          mediaDelta: 5,
        },
      });
    }

    return intents;
  }
}

// ===== 利益集团 Agent =====

export class InterestGroupAgent extends BaseAgent {
  getRoleDescription(): string {
    return '经济利益团体（经团连），通过政治捐款和游说影响政策';
  }

  buildUserPrompt(state: GameState, perception: AgentPerception): string {
    return buildInterestGroupUserPrompt(state, perception);
  }

  perceive(state: GameState): AgentPerception {
    return {
      summary: `利益集团关注政策走向。当前${state.bills.length}件法案待审。`,
      key_factors: ['关注经济政策和产业法规'],
      threats: state.metrics.economicIndex < 40 ? ['经济低迷影响商业利益'] : [],
      opportunities: state.bills.length > 0 ? ['有法案可以游说'] : [],
    };
  }

  thinkFallback(state: GameState, perception: AgentPerception): AgentIntent[] {
    const intents: AgentIntent[] = [];

    // 游说：向执政党提供资金换取政策
    if (Math.random() < 0.25) {
      const gov = state.government;
      const targetPartyId = gov?.primeMinisterPartyId ?? state.parties[0]?.id;
      if (targetPartyId) {
        intents.push({
          actor_id: this.config.actor_id,
          intent_type: 'lobby_funds',
          target_id: targetPartyId,
          priority: 7,
          reasoning: pickReasoning(LOBBY_REASONS)(perception.summary),
          payload: {
            targetPartyId,
            fundsDelta: { [targetPartyId]: 50 + Math.floor(Math.random() * 100) },
            corruptionRisk: true,
          },
        });
      }
    }

    return intents;
  }
}

// ===== Agent 调度器 =====

/**
 * Agent 调度器
 *
 * 按优先级顺序执行所有 Agent，收集 AgentIntent。
 * 首相(1) → 党首(2) → 派系领袖(3) → 媒体(4) → 利益集团(5)
 */
export class AgentScheduler {
  private agents: BaseAgent[] = [];

  /** 根据 GameState 构建 Agent 列表 */
  buildAgents(state: GameState): void {
    this.agents = [];
    const gov = state.government;

    // 1. 首相 Agent
    if (gov) {
      const pmParty = state.parties.find(p => p.id === gov.primeMinisterPartyId);
      this.agents.push(new PrimeMinisterAgent({
        role: 'prime_minister',
        actor_id: 'agent:prime_minister',
        partyId: gov.primeMinisterPartyId,
        personName: gov.primeMinisterName,
        priority: 1,
      }));
    }

    // 2. 各党首 Agent
    for (const party of state.parties) {
      if (party.id === gov?.primeMinisterPartyId) continue; // 首相已单独处理
      this.agents.push(new PartyLeaderAgent({
        role: 'party_leader',
        actor_id: `agent:party_leader:${party.id}`,
        partyId: party.id,
        personName: party.leader,
        priority: 2,
      }));
    }

    // 3. 派系领袖 Agent（从高野心议员中选取）
    const factionLeaders = Object.values(state.mpPersonalities)
      .filter(mp => mp.ambition > 60 && !mp.isLeader && !mp.isMinister)
      .slice(0, 3); // 取前3个高野心后排议员

    for (const mp of factionLeaders) {
      this.agents.push(new FactionLeaderAgent({
        role: 'faction_leader',
        actor_id: `agent:faction:${mp.partyId}:${mp.personName}`,
        partyId: mp.partyId,
        personName: mp.personName,
        priority: 3,
      }));
    }

    // 4. 媒体 Agent
    this.agents.push(new MediaAgent({
      role: 'media',
      actor_id: 'agent:media:mainstream',
      priority: 4,
    }));

    // 5. 利益集团 Agent
    this.agents.push(new InterestGroupAgent({
      role: 'interest_group',
      actor_id: 'agent:interest_group:keidanren',
      priority: 5,
    }));
  }

  /** 执行一回合：所有 Agent 按优先级生成 Intent（异步） */
  async runTurn(state: GameState): Promise<AgentTurnResult> {
    this.buildAgents(state);

    // 并行执行所有 Agent 的 LLM 调用，每个Agent独立失败不影响其他
    const results = await Promise.all(
      this.agents.map(agent =>
        agent.generateIntent(state).catch(err => {
          console.error(`[Agent] ${agent.config.actor_id} crashed:`, err);
          // 返回安全的fallback结果
          return {
            intents: [],
            events: [],
            log: {
              role: agent.config.role,
              name: agent.config.personName ?? agent.getRoleLabel(),
              reasoning: '系统错误，暂停行动',
              action: 'error',
              timestamp: Date.now(),
            },
          };
        })
      ),
    );

    const allIntents = results.flatMap(r => r.intents ?? []);
    const allEvents = results.flatMap(r => r.events ?? []);
    const logs = results.map(r => r.log).filter((l): l is ThinkingLogEntry => l !== null);

    // 对事件去重：同 intent_type 同 target 只保留一个
    const seenEvents = new Map<string, PoliticalEvent>();
    for (const event of allEvents) {
      const key = `${event.intentType}:${event.sourceParty}`;
      if (!seenEvents.has(key)) {
        seenEvents.set(key, event);
      }
    }
    const dedupedEvents = Array.from(seenEvents.values());
    dedupedEvents.sort((a, b) => b.severity - a.severity);

    return {
      intents: this.deduplicate(allIntents),
      events: dedupedEvents,
      logs,
    };
  }

  /** 去重：同类型同目标只保留优先级最高的 */
  private deduplicate(intents: AgentIntent[]): AgentIntent[] {
    const seen = new Map<string, AgentIntent>();

    for (const intent of intents) {
      const key = `${intent.intent_type}:${intent.target_id}`;
      const existing = seen.get(key);
      if (!existing || intent.priority < existing.priority) {
        seen.set(key, intent);
      }
    }

    return Array.from(seen.values()).sort((a, b) => a.priority - b.priority);
  }
}

// ===== 单例调度器 =====

let schedulerInstance: AgentScheduler | null = null;

/** 获取 Agent 调度器单例 */
export function getAgentScheduler(): AgentScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new AgentScheduler();
  }
  return schedulerInstance;
}

/** 执行一回合 Agent 推演（异步，会调用 LLM） */
export async function runAgentTurn(state: GameState): Promise<AgentTurnResult> {
  return getAgentScheduler().runTurn(state);
}
