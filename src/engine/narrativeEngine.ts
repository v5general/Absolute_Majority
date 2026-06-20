/**
 * 叙事引擎
 *
 * 将 AgentIntent 转换为 PoliticalEvent（包含 dialogs 和 choices）。
 * 玩家通过 GalgameDialog 与这些事件互动。
 *
 * 核心由 LLM 动态生成所有事件内容（场景、对话、选项、后果），
 * 只有基本规则约束，不使用固定模板。
 * 当 LLM 不可用时，使用简洁的 fallback 文本保证游戏可运行。
 */

import type {
  GameState,
  PoliticalEvent,
  EventChoice,
  CommitteeId,
} from '../types';
import { COMMITTEE_LABELS } from '../types';
import type { AgentIntent, PlayerConfig } from '../types';
import { askLLMJSON, isLLMAvailable } from './llmBridge';
import { getBackgroundNarrative } from './backgroundEngine';
import { getMonthFromTurn, getYearFromTurn, getCongressSessionByMonth } from '../config/ruleConfig';

// ===== 意图类型基本规则 =====

interface IntentRule {
  /** 事件类型简要说明 */
  description: string;
  /** 严重度 1-5 */
  severity: number;
  /** 给 LLM 的叙事指引 */
  guidance: string;
}

const INTENT_RULES: Record<string, IntentRule> = {
  coalition_proposal: {
    description: '执政党向其他政党提出联盟谈判',
    severity: 4,
    guidance: '这是执政党试图拉拢在野党加入联盟的场景。体现政治博弈、利益交换和权力平衡。场景可以是首相官邸闭门会议、国会走廊密谈等。',
  },
  cabinet_reshuffle: {
    description: '首相进行内阁改组',
    severity: 3,
    guidance: '首相对内阁进行人事调整，可能涉及撤换、提拔、安抚联盟伙伴等。场景可以是首相官邸、党内干部会议等。',
  },
  opposition_attack: {
    description: '在野党在国会质询中攻击政府',
    severity: 4,
    guidance: '在野党利用议会质询环节向政府施压。执政党议员需要防御，在野党议员可以加入攻势。场景在众议院议事厅。',
  },
  opposition_coalition: {
    description: '在野党秘密商议组建联盟对抗政府',
    severity: 4,
    guidance: '两大在野党秘密碰面商讨合作。如果玩家是执政党，则是撞破密会获得情报；如果在野党，则是受邀参加盟友密会。场景可以是料亭、私人会所等隐秘地点。',
  },
  coalition_pressure: {
    description: '执政联盟内小党向首相施压',
    severity: 3,
    guidance: '执政联盟内部出现利益分配矛盾，小党要求更多内阁职位或政策话语权。场景可以是联盟内部会议、首相办公室等。',
  },
  faction_challenge: {
    description: '党内出现挑战党首的派系',
    severity: 4,
    guidance: '党内某位有野心的议员公开或暗中挑战现任党首的领导地位，党面临分裂危机。场景可以是党大会、党内元老会议、记者会等。',
  },
  media_boost: {
    description: '媒体对某党进行了正面报道',
    severity: 2,
    guidance: '媒体（报纸、电视、网络）对某党进行了有利报道，提升了公众形象。场景可以是新闻编辑部、电视节目、社交媒体热议等。',
  },
  media_scandal: {
    description: '媒体曝光某党的丑闻',
    severity: 4,
    guidance: '媒体爆出某党的负面新闻（政治献金、腐败、丑闻等），对该党造成严重打击。场景可以是新闻直播间、调查记者爆料、网络舆论风暴等。',
  },
  lobby_funds: {
    description: '利益集团向政党提供政治捐款',
    severity: 3,
    guidance: '经济团体（经团连等）接触政党议员，以捐款换取政策支持。这是一个敏感的政治交易场景。可以是高级餐厅、私人会所、议员办公室等。',
  },
};

/** 党派汉字简称 */
const PARTY_SHORT_NAME: Record<string, string> = {
  reform: '民主',
  liberty: '自由',
  conservative: '保守',
  progressive: '社会',
  populist: '公民',
  green: '劳工',
};

/** 党派ID与名称映射 */
function buildPartyIdList(state: GameState): string {
  return state.parties.map(p => `${p.id}(${p.name})`).join(', ');
}

// ===== LLM 输出类型 =====

interface LLMDialog {
  speaker: string | null;
  text: string;
}

interface LLMChoice {
  id: string;
  text: string;
  consequence: string;
  effects: {
    supportDelta?: Record<string, number>;
    relationDelta?: Record<string, number>;
    fundsDelta?: Record<string, number>;
    metricsDelta?: Record<string, number>;
  };
}

interface LLMEventOutput {
  title: string;
  summary: string;
  dialogs: LLMDialog[];
  choices: LLMChoice[];
  scenePrompt: string;
  speakerId: string | null;
}

// ===== LLM 事件生成 =====

function buildEventSystemPrompt(state: GameState): string {
  const partyIds = buildPartyIdList(state);
  const pc = state.playerConfig;
  const pp = pc ? state.parties.find(p => p.id === pc.partyId) : null;
  const ppShort = pp ? PARTY_SHORT_NAME[pp.id] ?? pp.name : '某党';

  return `你是一个日本议会政治模拟游戏的叙事生成系统。
你的任务是根据AI Agent的行动意图和当前游戏状态，生成一段生动、独特、符合角色立场的政治剧情。

## 可用党派ID（speaker字段只能使用以下ID，null表示旁白）
${partyIds}
speaker字段绝对不能填人名、角色名或非上述ID的文字，只能是上述ID之一或null。

## 关于角色的关键说明
- 玩家是一个新晋普通议员，绝对不是首相，也不是党首
- 玩家姓名: 姓="${pc?.lastName ?? '某'}" 名="${pc?.firstName ?? '某'}" 性别=${pc?.gender === 'female' ? '女' : '男'}
- 称呼规则：
  - 正式场合/上级: "${pc?.lastName ?? '某'}议员" 或 "${pc?.lastName ?? '某'}${pc?.gender === 'female' ? '女士' : '先生'}"
  - 关系亲近: "${pc?.firstName ?? '某'}${pc?.gender === 'female' ? '酱' : '君'}"
  - 媒体报道: "${pc?.lastName ?? '某'}${pc?.firstName ?? '某'}氏" 或 "${ppShort}·${pc?.lastName ?? '某'}${pc?.firstName ?? '某'}氏"
  - 国会议事正式点名（无论男女）: "${pc?.lastName ?? '某'}${pc?.firstName ?? '某'}君"

## 输出格式（严格JSON）
{
  "title": "事件标题（4-8字）",
  "summary": "事件概要（一句话）",
  "dialogs": [
    {"speaker": null, "text": "旁白描述场景"},
    {"speaker": "党派ID", "text": "角色台词"},
    {"speaker": null, "text": "旁白引出玩家选择"}
  ],
  "choices": [
    {
      "id": "choice_id",
      "text": "选项文字（简短有力，8字以内）",
      "consequence": "选择后的后果描述",
      "effects": {
        "supportDelta": {"党派ID": 数字},
        "relationDelta": {"fromID>toID": 数字},
        "fundsDelta": {"党派ID": 数字},
        "metricsDelta": {"mediaAttention": 数字, "socialStabilityIndex": 数字}
      }
    }
  ],
  "scenePrompt": "自由文本输入模式的场景描述（让玩家知道当前处境和可能的行动）",
  "speakerId": "党派ID或null"
}

## 叙事规则
1. dialogs 应有2-4条，先旁白设定场景，再角色发言，最后旁白引出玩家选择
2. choices 应有2-3个选项，代表不同的政治立场和后果
3. 内容必须像真实日本政治场景：可涉及具体政策（税制改革、社会保障、外交、防卫等）、政治术语、议会程序
4. 场景必须多样化：国会质询、闭门会议、媒体采访、走廊偶遇、料亭密会、党本部会议、选区走访等
5. effects数字应合理：supportDelta通常-3到+3，metricsDelta通常-10到+10，relationDelta通常-20到+20
6. 每次生成的情节、对话、场景必须独特，绝不重复
7. speaker字段严格遵守：只能是上述党派ID或null

## 玩家立场规则（极其重要！）
- 玩家是一个新晋普通议员（不是首相，不是党首）
- 如果玩家属于执政联盟：选项应以维护政府/执政联盟为自然选择，叛变/倒戈为高风险选项
- 如果玩家属于在野党：选项应以对抗政府为自然选择，为执政党辩护为高风险倒戈选项
- "保持沉默/中立"永远是可选的
- 选项排列应符合玩家立场：把最符合玩家角色的选项放前面
- 绝对不要把玩家写成首相或党首

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
- 禁止出现现实中任何真实企业或民间团体名称（如日立、丰田、三菱、索尼、软银、经团联等）。如叙事需要涉及企业或团体，请自行创造虚构名称
- 派阀命名必须使用虚构名称，使用简体中文
- 媒体报道必须使用固定的三家媒体：
  * 中央时事新闻（中间派立场）
  * 革新民报（左翼立场）
  * 经合新闻（右翼立场）
- 不得创建或使用其他媒体名称

## 政治体系参考（叙事生成依赖规则）
### 议会结构
- 众议院200席 = 120席选区(单席制) + 80席比例代表(按全国支持率分配)
- 议长由执政联盟最大党推荐、全院表决后退出党派保持中立；副议长由最大在野党推荐
- 议员必须加入会派，会派不完全等于政党，多个小党可组成共同会派。会派规模越大获得资源越多（委员会席位分配权、质询时间、法案优先权、国会发言权）

### 9个常任委员会（共200席）
- 内阁委员会(20人)：首相官邸、行政改革、公务员制度
- 总务委员会(20人)：地方自治、行政事务、数字化改革
- 法务委员会(20人)：司法制度、刑法、民法（委员长可由在野党担任）
- 外务委员会(20人)：外交、国际关系
- 财务金融委员会(30人)：财政、税制、金融（委员长由执政联盟担任）
- 经济产业委员会(25人)：产业政策、能源、科技
- 安全保障委员会(20人)：防卫省、自卫队、国家安全
- 预算委员会(30人)：最高权力委员会，首相必须出席，期间支持率波动×1.5、媒体影响×1.5
- 厚生劳动委员会(15人)：医疗、养老金、劳动政策

### 每月议事流程
- 第1周：委员会召开→第2周：法案审查→第3周：党首辩论(180分钟按会派规模分配)→第4周：全院表决→更新支持率/联盟关系/媒体评价

### 国会年度会期规则（按月份，极其重要！）
游戏起始月份为1月，1回合=1个月。回合数决定当前所处的国会会期，会期决定该月事件的核心性质、场景与可能性，生成事件时必须严格遵守：
- 1月~3月（预算决战期 / 通常国会）：必须在这3回合内强行通过"新年度财政预算案"。在野党会在【预算委员会】揪住首相丑闻不放以拖延时间。若3月底前预算未通过，经济景气指数将雪崩式下跌。事件应围绕预算审议、预算委员会质询、丑闻攻防展开。
- 4月~6月（法案攻坚期 / 通常国会）：预算通过后审议各种普通法案。在野党若认为局势有利，会在5-6月会期结束前集结所有力量发起"内阁不信任动议（倒阁）"。事件应围绕普通法案审议、倒阁博弈展开。
- 7月~9月（地方基本盘维护期 / 国会闭会）：国会放假，禁止出现国会质询、全院表决、委员会审议等场景。议员回到选区修选区、拉赞助。事件应围绕选区活动、媒体拉拢中间选民、暗中搜集政敌黑料展开。
- 10月~12月（临时国会期 / 临时国会）：内阁根据下半年突发事件（天灾、国际局势危机等）决定是否召开国会，会期较短。事件应围绕追加预算案、突发政治丑闻、危机应对展开。
生成事件时必须匹配当前月份所处的会期，禁止在闭会期（7-9月）生成国会内场景，禁止在预算决战期（1-3月）忽略预算议题。

### 派阀系统
- 除联合工人党(solidarity)外所有政党允许存在派阀
- 忠诚度0~100：高于70稳定、40~70观望、低于40可能逼宫、低于20可能脱党
- 挑战条件：派阀规模≥全党25% 且 党首支持率<35% 且 忠诚度<40

### 联合工人党(solidarity)特殊规则
- 民主集中制，禁止派阀，投票纪律95%~100%

### 首相可解散众议院
- 条件：主动/不信任案通过后/重大危机/联盟崩溃。解散后立即大选、法案失效、委员会停摆、内阁转看守
- 解散概率考量：若首相支持率>45%且反对党支持率分散，提前解散概率提高（此时大选对执政党有利）

### 大选系统
- 触发：任期届满/首相解散/不信任案通过/国家危机。选举期间1回合，媒体×200%、支持率波动×150%
- 计算公式：40%政党支持率 + 30%候选人支持率 + 20%地方倾向 + 10%随机波动
- 选后：统计席位→联盟谈判→首相指名→组阁→委员会重组

### 法案决策链（禁止无限讨论）
- 起草→党内讨论→派阀协商→委员会审议→委员会修正→委员会表决→全院辩论→全院表决→实施
- 每项议案有deadline，超期自动表决。结果：Passed/Rejected/Withdrawn/Delayed

### 不信任案决策链
- 提案→联署(≥20名议员)→辩论→表决(全体过半≥101票)→通过则首相选择辞职或解散众议院

### 表决门槛
- 委员会：出席委员过半。全院普通法案：出席议员过半。不信任案：全体过半(≥101票)

### 政治晋升（双轨制）
- 党内：普通党员→青年局干部→政策委员会成员→党务干部→副干事长→干事长→副党首→党首
- 国会：普通议员→委员会理事→副委员长→委员长→政务官→副大臣→国务大臣→内阁官房长官→总理大臣
- 大臣≠党首；党首≠入阁；总理大臣一般是党首但非必然

### 人物背景系统
- 背景(family_origin/education/career/social_class/hometown/connections)影响剧情生成
- 政治世家：派系接纳度高但易丑闻；普通家庭：亲民但资源少。不同出身必须产生不同剧情

### 绝对多数(≥134席)
- Constitutional Majority：可修宪(跳过阻挠/需≥134票)、Fast Track Legislation、纪律投票加成。不自动保证通过

### 党首与首相分离
- 党首负责党务/选举；首相负责组阁/施政。通常兼任但允许分离

## 最高规则（不可违反）
- 允许"党首≠首相"的特殊政治局面。执政党党首与首相可以是不同人物（党内权力分散、派系妥协、傀儡内阁等），不得假设党首必然是首相
- 任何事件最终必须导向某项政治决定。每个事件必须有明确的、可衡量的政治后果
- 禁止无限对话、无限阴谋、无限会议。事件不得无限拖延，必须在当前回合内产生可结算的政治结果
- 所有政治行为必须产生以下至少一项结果，否则事件无效：支持率变化、权力变化、职位变化、法案结果、选举结果、联盟变化
- 单个事件的effects可以为零或很小（表示暂时未产生明显影响），但同类型事件累计超过3个时，effects必须包含至少一项非零的政治后果。事件的积累必然产生量变到质变的效果`;
}

function buildEventUserPrompt(
  intent: AgentIntent,
  state: GameState,
  playerConfig: PlayerConfig,
): string {
  const rule = INTENT_RULES[intent.intent_type];
  const playerParty = state.parties.find(p => p.id === playerConfig.partyId);
  const isRuling = state.government?.rulingCoalition.includes(playerConfig.partyId) ?? false;
  const playerRole = isRuling ? '执政联盟' : '在野党';
  const gov = state.government;

  // 玩家背景
  const playerKey = `${playerConfig.partyId}:${playerConfig.lastName} ${playerConfig.firstName}`;
  const playerMP = state.mpPersonalities[playerKey];
  const playerBg = playerMP?.background ? getBackgroundNarrative(playerMP.background) : playerConfig.background;
  const playerCareer = playerMP?.career ? `党内: ${playerMP.career.partyRank} / 国会: ${playerMP.career.parliamentRank}` : '普通议员';

  // 游戏状态
  const month = getMonthFromTurn(state.turn);
  const year = getYearFromTurn(state.turn);
  const session = getCongressSessionByMonth(month);
  let gameCtx = `=== 当前局势 ===
回合: ${state.turn} · ${year}年${month}月 · 第${state.currentDay}日 · 距大选${state.turnsUntilElection ?? 48}回合
国会会期: ${session.name}（${session.status}，${month}月）— ${session.gameplay}
经济景气: ${state.metrics.economicIndex} · 社会稳定: ${state.metrics.socialStabilityIndex} · 媒体关注度: ${state.metrics.mediaAttention}`;

  for (const party of state.parties) {
    const pIsRuling = gov?.rulingCoalition.includes(party.id) ?? false;
    const role = gov?.primeMinisterPartyId === party.id ? '首相' : pIsRuling ? '执政' : '在野';
    gameCtx += `\n${party.name}(${party.id}): ${party.currentSupport}%支持 · ${party.projectedSeats}席 · ${party.ideology} · ${role} · 领袖:${party.leader}`;
    // 派阀信息
    if (party.factions && party.factions.length > 0) {
      gameCtx += `\n  派阀: ${party.factions.map(f => `${f.name}(忠诚${f.loyalty}/野心${f.ambition}/${f.members.length}人)`).join(', ')}`;
    }
  }

  if (gov) {
    const coalitionSeats = gov.rulingCoalition.reduce((s, pid) => {
      return s + (state.parties.find(p => p.id === pid)?.projectedSeats ?? 0);
    }, 0);
    gameCtx += `\n执政联盟: ${gov.rulingCoalition.join(', ')} (${coalitionSeats}席) · ${gov.isMinority ? '少数政府' : '多数政府'} · 稳定度:${gov.stability}`;
    if (coalitionSeats >= 134) {
      gameCtx += `\n★ 绝对多数 (${coalitionSeats}/200)`;
    }
  }

  return `${gameCtx}

=== 玩家信息 ===
姓名: ${playerConfig.lastName} ${playerConfig.firstName} · 年龄: ${playerConfig.age} · 性别: ${playerConfig.gender === 'male' ? '男' : '女'}
所属政党: ${playerParty?.name ?? playerConfig.partyId}(${playerConfig.partyId})
政治立场: ${playerRole}
职业: ${playerCareer}
背景: ${playerBg}
${playerMP?.factionId ? `所属派阀: ${playerMP.factionId}` : ''}

=== 本次事件 ===
事件类型: ${intent.intent_type}
类型说明: ${rule?.description ?? '政治事件'}
叙事指引: ${rule?.guidance ?? '自由发挥'}
行动者: ${intent.actor_id}
目标: ${intent.target_id}
Agent的政治推理: ${intent.reasoning}
附加数据: ${JSON.stringify(intent.payload)}

请根据以上完整上下文，生成一段独特的政治剧情。场景、对话、选项必须具体、生动、多样化，且符合玩家的${playerRole}立场。注意玩家的背景和职业等级应该影响对话内容和选项设计。`;
}

async function generateEventFromLLM(
  intent: AgentIntent,
  state: GameState,
  playerConfig: PlayerConfig,
): Promise<PoliticalEvent> {
  const rule = INTENT_RULES[intent.intent_type] ?? { severity: 3 };
  const fallback = generateFallbackEvent(intent, state, playerConfig);

  try {
    const result = await askLLMJSON<LLMEventOutput | null>(
      buildEventSystemPrompt(state),
      buildEventUserPrompt(intent, state, playerConfig),
      null,
    );

    if (!result || !result.dialogs?.length || !result.choices?.length) {
      return fallback;
    }

    const event: PoliticalEvent = {
      id: `ai-${intent.actor_id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: result.title || fallback.title,
      summary: result.summary || fallback.summary,
      sourceParty: (intent.payload.proposingPartyId as string)
        ?? (intent.payload.attackPartyId as string)
        ?? (intent.payload.demandingPartyId as string)
        ?? intent.target_id,
      severity: rule.severity,
      dialogs: result.dialogs.map(d => ({
        speaker: d.speaker,
        text: d.text,
      })),
      choices: result.choices.map(c => ({
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
      freeText: result.scenePrompt ? {
        scenePrompt: result.scenePrompt,
        speakerId: result.speakerId ?? null,
        placeholder: '发表你的看法...',
      } : undefined,
      intentType: intent.intent_type,
    };

    return event;
  } catch {
    return fallback;
  }
}

// ===== Fallback（LLM 不可用时） =====

function generateFallbackEvent(
  intent: AgentIntent,
  state: GameState,
  playerConfig: PlayerConfig,
): PoliticalEvent {
  const rule = INTENT_RULES[intent.intent_type];
  return {
    id: `fallback-${intent.actor_id}-${Date.now()}`,
    title: rule?.description?.slice(0, 8) ?? '政治事件',
    summary: rule?.description ?? '发生了一起政治事件',
    sourceParty: intent.target_id,
    severity: rule?.severity ?? 3,
    dialogs: [
      { speaker: null, text: `${rule?.description ?? '政治事件'}。` },
      { speaker: null, text: intent.reasoning },
      { speaker: null, text: `${playerConfig.lastName}议员，你需要做出选择。` },
    ],
    choices: [
      { id: 'support', text: '支持', consequence: '你选择了支持。', effects: {} },
      { id: 'oppose', text: '反对', consequence: '你选择了反对。', effects: {} },
      { id: 'neutral', text: '中立', consequence: '你选择保持中立。', effects: {} },
    ],
    intentType: intent.intent_type,
  };
}

// ===== 转换函数 =====

/**
 * 将 AgentIntent 列表转换为 PoliticalEvent 列表
 *
 * 每个意图通过 LLM 动态生成完整的事件内容。
 * 所有事件并行生成，按严重度排序。
 */
export async function convertIntentsToEvents(
  intents: AgentIntent[],
  state: GameState,
  playerConfig: PlayerConfig,
): Promise<PoliticalEvent[]> {
  const events = await Promise.all(
    intents.map(intent => generateEventFromLLM(intent, state, playerConfig)),
  );

  // 按严重度排序（高严重度事件优先展示）
  events.sort((a, b) => b.severity - a.severity);

  return events;
}

// ===== AI 法案生成（每回合根据局势由 LLM 生成）=====

/** 合法委员会 id 列表（用于校验 LLM 输出） */
const VALID_COMMITTEE_IDS = Object.keys(COMMITTEE_LABELS) as CommitteeId[];

/** LLM 生成的法案草案（proposerName 由提出党党首真实姓名回填） */
export interface AIBillDraft {
  title: string;
  /** 法案核心内容概述，供玩家点击查看 */
  summary: string;
  proposerName: string;
  proposerPartyId: string;
  committeeId: CommitteeId;
}

/**
 * 每回合调用 LLM 根据当前局势生成 1-2 项法案草案。
 *
 * - 紧扣当前月份所处的国会会期（如预算决战期偏向预算/财政类）。
 * - proposerPartyId 由 LLM 选择（必须为真实党派 id），提出者姓名回填为该党党首真名。
 * - LLM 不可用或返回非法时返回空数组，由 politicalAIEngine 的规则式 propose_bill 兜底。
 */
export async function generateAIBills(state: GameState): Promise<AIBillDraft[]> {
  if (!isLLMAvailable()) return [];

  const gov = state.government;
  const month = getMonthFromTurn(state.turn);
  const session = getCongressSessionByMonth(month);

  const coalitionStr = gov?.rulingCoalition
    ?.map(pid => state.parties.find(p => p.id === pid)?.name)
    .filter(Boolean).join('、') ?? '无';

  const partyListStr = state.parties
    .map(p => `- ${p.id}（${p.name}/${p.abbreviation}，党首：${p.leader}，${p.projectedSeats}席，支持率${p.currentSupport}%）`)
    .join('\n');

  const committeeListStr = VALID_COMMITTEE_IDS
    .map(id => `- ${id}：${COMMITTEE_LABELS[id]}`)
    .join('\n');

  const systemPrompt = `你是架空日本议会（2058年，众议院200席）的法案生成器。根据当前政治局势，为本回合生成1-2项真实合理的法案草案。法案将由真实党首之一提出，送交对应常任委员会审议。

## 可用常任委员会（committeeId 只能从下列 id 中选）
${committeeListStr}

## 当前局势
- 月份：${month}月（${session.name} / ${session.status}）
- 会期玩法提示：${session.gameplay}
- 执政联盟：${coalitionStr}
- 总席位 ${state.metrics.totalSeats}，过半 ${state.metrics.majorityThreshold}
- 经济景气 ${state.metrics.economicIndex}，社会稳定 ${state.metrics.socialStabilityIndex}

## 可用党派与党首
${partyListStr}

## 生成要求
- 数量：1-2 项，紧扣当前局势与会期（如预算决战期优先预算/财政类，法案攻坚期覆盖各委员会政策类，闭会期不出法案）
- title：法案正式名称（中文，8-16字，形如《某某法案》）
- summary：法案核心内容概述（中文，2-4句，必须包含：①核心政策与关键数据；②涉及的主要党派或人物及其立场；③政治意图）。这是玩家点击查看的详情，要言之有物。
- proposerPartyId：必须是上面党派 id 之一（由你判断哪个党最可能提出该项法案）
- committeeId：必须是上面 9 个委员会 id 之一

输出严格 JSON，不要使用 markdown 代码块，不要任何解释：
{"bills":[{"title":"《...》","summary":"...","proposerPartyId":"...","committeeId":"..."}]}`;

  const userPrompt = `当前是 ${month} 月（${session.name}）。请生成本回合的法案草案。`;

  try {
    const result = await askLLMJSON<{ bills: Array<{ title: string; summary: string; proposerPartyId: string; committeeId: string }> }>(
      systemPrompt,
      userPrompt,
      { bills: [] },
    );

    const drafts: AIBillDraft[] = [];
    for (const raw of result.bills ?? []) {
      const party = state.parties.find(p => p.id === raw.proposerPartyId);
      if (!party || !raw.title || !raw.summary) continue;
      const committeeId = VALID_COMMITTEE_IDS.includes(raw.committeeId as CommitteeId)
        ? (raw.committeeId as CommitteeId)
        : 'general';
      drafts.push({
        title: raw.title,
        summary: raw.summary,
        proposerPartyId: raw.proposerPartyId,
        proposerName: party.leader, // 回填真实党首姓名，杜绝 LLM 编造人名
        committeeId,
      });
    }
    // 7-9月闭会期不出法案（与会期规则一致）
    if (session.status === '国会闭会') return [];
    return drafts.slice(0, 2);
  } catch {
    return [];
  }
}
