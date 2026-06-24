/** 派系/政党颜色标识 */
export type PartyColor = string;

/** 派系意识形态光谱 */
export type Ideology =
  | 'far-left'      // 极左
  | 'left'          // 左翼
  | 'center-left'   // 中左
  | 'center'        // 中间
  | 'center-right'  // 中右
  | 'right'         // 右翼
  | 'far-right';    // 极右

/** 关系类型 */
export type RelationType =
  | 'alliance'      // 联盟
  | 'friendly'      // 友好
  | 'neutral'       // 中立
  | 'tense'         // 紧张
  | 'hostile';      // 敌对

// ===== AI 行动意图类型 =====

/** AI 行动意图类型枚举 */
export type AIIntentType =
  | 'support_change'      // 支持率变化意图
  | 'relation_change'     // 关系变化意图
  | 'funds_change'        // 资金变化意图
  | 'metrics_change'      // 大盘指标变化意图
  | 'no_confidence'       // 不信任案意图
  | 'coalition_proposal'  // 联盟提案意图
  | 'bill_proposal'       // 法案提案意图
  // --- 政治 AI 意图类型 ---
  | 'challenge_leader'    // 挑战党首
  | 'seek_cabinet'        // 谋求内阁职位
  | 'form_faction'        // 组建/加入派系
  | 'propose_bill'        // 提出法案
  | 'lobby_support'       // 游说支持
  | 'media_campaign'      // 发起媒体攻势
  | 'backroom_deal'       // 密室交易
  | 'faction_defect'      // 派系叛离
  | 'stress_event'        // 压力事件
  // --- 程序性 intent（Phase G Q6） ---
  | 'political_capital_change'  // 政治资本变化（玩家或 NPC）
  | 'fundraising'               // 玩家主动募款行动（非 AI）
  | 'no_confidence_proposal'    // 不信任案提案（程序性，与 no_confidence 区分：含目标首相/联署）
  | 'dissolution_decision'      // 首相解散众议院决策
  | 'leadership_campaign'       // 党首选举活动（含挑战者、现任、派阀背书）
  | 'bill_draft'                // 法案起草（程序性，含目标委员会）
  | 'parliament_questioning'    // 国会质询（含质询方、被质询大臣、议题、时间）
  | 'committee_deliberation';   // 委员会审议（含委员会、法案、审议类型、结果）

/** AI 行动意图 */
export interface AIIntent {
  /** 意图唯一标识 */
  id: string;
  /** 意图类型 */
  type: AIIntentType;
  /** 发起方（事件 ID 或 AI 代理 ID） */
  source: string;
  /** 意图载荷（不同类型有不同结构） */
  payload: Record<string, unknown>;
  /** 生成回合 */
  turn: number;
}

/** 规则引擎校验结果 */
export interface RuleValidationResult {
  /** 是否合法 */
  valid: boolean;
  /** 拒绝原因（如不合法） */
  reason?: string;
}

// ===== 不信任案类型 =====

/** 不信任案 */
export interface NoConfidenceMotion {
  /** 唯一标识 */
  id: string;
  /** 联署议员列表 */
  signatories: string[];
  /** 发起党派 ID */
  proposingPartyId: string;
  /** 联署是否达到门槛 */
  meetsThreshold: boolean;
  /** 创建回合 */
  createdTurn: number;
  /** 联署最低门槛 */
  readonly SIGNATURE_THRESHOLD: 20;
}

// ===== 联盟协议类型 =====

/** 联盟协议 */
export interface CoalitionAgreement {
  /** 唯一标识 */
  id: string;
  /** 参与方党派 ID 列表 */
  parties: string[];
  /** 内阁职位分配方案 */
  cabinetAllocation: { partyId: string; posts: CabinetPost[] }[];
  /** 政策承诺 */
  policyCommitments: string[];
  /** 签署回合 */
  signedTurn: number;
  /** 是否已签署 */
  signed: boolean;
}

/** 关系强度 -100 ~ 100 */
export type RelationScore = number;

/** 政党/派系定义 */
export interface Party {
  id: string;
  name: string;
  abbreviation: string;
  color: PartyColor;
  ideology: Ideology;
  leader: string;
  description: string;
  /** 党内重要成员（不含 leader），供内阁任命使用 */
  members: string[];
  /** 基础支持率 (0-100) */
  baseSupport: number;
  /** 当前支持率 (0-100) */
  currentSupport: number;
  /** 预计席位数 */
  projectedSeats: number;
  /** 资金（百万） */
  funds: number;
  /** 组织力 (0-100) */
  organization: number;
  /** 魅力值 (0-100) */
  charisma: number;
  /** 党内派阀列表（联合工人党 solidarity 为空） */
  factions?: import('../types/faction').Faction[];
}

/** 关系矩阵条目 (A对B的关系) */
export interface RelationEntry {
  from: string;       // 派系A的id
  to: string;         // 派系B的id
  score: RelationScore;
  type: RelationType;
  description: string;
}

/** 大盘统计指标 */
export interface MarketMetrics {
  /** 总选民数 */
  totalVoters: number;
  /** 投票率 */
  turnoutRate: number;
  /** 摇摆选民比例 */
  swingVoterRatio: number;
  /** 选举日倒计时（天） */
  daysToElection: number;
  /** 总席位数 */
  totalSeats: number;
  /** 过半数席位 */
  majorityThreshold: number;
  /** 当前领先联盟席位 */
  leadingCoalitionSeats: number;
  /** 经济景气指数 (0-100) */
  economicIndex: number;
  /** 社会稳定指数 (0-100) */
  socialStabilityIndex: number;
  /** 媒体关注度 (0-100) */
  mediaAttention: number;
}

/** 选区数据 */
export interface District {
  id: string;
  name: string;
  totalSeats: number;
  voterCount: number;
  /** 各派系在该选区的支持率 */
  supportByParty: Record<string, number>;
}

/** 事件日志 */
export interface GameEvent {
  id: string;
  day: number;
  title: string;
  description: string;
  /** 影响的派系id -> 支持率变化 */
  impact: Record<string, number>;
}

// ===== 选举 & 政府类型 =====

/** 阁僚职位 */
export type CabinetPost =
  | 'prime_minister'       // 首相
  | 'chief_secretary'      // 官房长官
  | 'finance_minister'     // 财务大臣
  | 'foreign_minister'     // 外务大臣
  | 'defense_minister'     // 防卫大臣
  | 'health_minister'      // 厚生劳动大臣
  | 'economy_minister';    // 经济产业大臣

/** 阁僚职位中文名 */
export const CABINET_POST_LABELS: Record<CabinetPost, string> = {
  prime_minister: '首相',
  chief_secretary: '官房长官',
  finance_minister: '财务大臣',
  foreign_minister: '外务大臣',
  defense_minister: '防卫大臣',
  health_minister: '厚生劳动大臣',
  economy_minister: '经济产业大臣',
};

/** 阁僚 */
export interface Minister {
  post: CabinetPost;
  partyId: string;
  personName: string;
}

/** 选举结果中单个政党的得票 */
export interface PartyElectionResult {
  partyId: string;
  seats: number;
  supportPercent: number;
}

/** 选举结果 */
export interface ElectionResult {
  /** 各党结果，按席位降序 */
  partyResults: PartyElectionResult[];
  /** 是否有政党单独过半 */
  hasMajority: boolean;
  /** 单独过半的政党ID（如有） */
  majorityPartyId: string | null;
  /** 总席位 */
  totalSeats: number;
  /** 过半阈值 */
  majorityThreshold: number;
  /** 各选区分配结果 districtId -> partyId -> seats */
  districtResults: Record<string, Record<string, number>>;
  /**
   * 全国比例代表层结果（Phase G Q1：110+90 并行制）
   * key = partyId，value = 全国比例代表 90 席中分得的席位数
   * `undefined` / 空 = 旧版纯 D'Hondt 结果
   */
  nationalProportionalResults?: Record<string, number>;
}

/**
 * 会派（Parliamentary Group）— Phase G Q5
 *
 * 议员必须加入会派。会派不完全等于政党：多个小党可组成共同会派。
 * 会派规模决定：委员会席位分配权、国会质询时间、法案优先权、国会发言权。
 *
 * 党首辩论时间按会派席位比例分配（180 分钟，最小保障 5 分钟）。
 */
export interface ParliamentaryGroup {
  /** 会派 ID（通常 = 主导党 id 或 "coalition-xxx"） */
  id: string;
  /** 会派显示名 */
  name: string;
  /** 会派成员党 ID 列表（单党会派只有一个元素） */
  memberPartyIds: string[];
  /** 会派总席位（= ∑ memberPartyIds 的 seats） */
  totalSeats: number;
}

/** 联合谈判中的一方 */
export interface CoalitionOffer {
  partyId: string;
  /** 是否接受加入执政联盟 */
  accepted: boolean;
  /** 谈判意愿得分 (0-100)，越高越愿意加入 */
  willingness: number;
  /** 要求获得的内阁职位 */
  demandedPosts: CabinetPost[];
}

/** 政府（内阁） */
export interface Government {
  /** 首相所属政党 */
  primeMinisterPartyId: string;
  /** 首相姓名 */
  primeMinisterName: string;
  /** 执政联盟成员 partyId[] */
  rulingCoalition: string[];
  /** 在野联盟成员 partyId[] */
  opposition: string[];
  /** 内阁成员 */
  ministers: Minister[];
  /** 内阁稳定度 (0-100) */
  stability: number;
  /** 是否少数政府（执政联盟席位未过半） */
  isMinority: boolean;
  /** 组阁所依据的选举结果 */
  electionResult: ElectionResult;
  /** 联合谈判/招募记录 */
  coalitionOffers: CoalitionOffer[];
  /** 联盟协议列表（任何联盟成立必须签署协议） */
  coalitionAgreements: CoalitionAgreement[];
  /** 待处理的不信任案 */
  noConfidenceMotions: NoConfidenceMotion[];
  /** 是否为看守内阁（众议院解散后） */
  isCaretaker?: boolean;
}

/** 完整游戏状态 */
export interface GameState {
  parties: Party[];
  relations: RelationEntry[];
  metrics: MarketMetrics;
  districts: District[];
  events: GameEvent[];
  /** 当前政府（null = 尚未选举/组阁） */
  government: Government | null;
  /** 委员会列表 */
  committees: Committee[];
  /** 当前正在审议的法案 */
  bills: Bill[];
  /** 待处理的 AI 行动意图（须经规则引擎校验后才能执行） */
  pendingIntents: AIIntent[];
  /** 所有议员的政治人格数据，key = "partyId:personName" */
  mpPersonalities: Record<string, import('./mp').MPPersonality>;
  /** 玩家角色配置（null = 尚未创建角色） */
  playerConfig: import('./agent').PlayerConfig | null;
  /** Agent 生成的事件队列（等待玩家处理） */
  currentAIEvents: import('./event').PoliticalEvent[];
  currentDay: number;
  turn: number;
  /** 距法定大选剩余回合数 */
  turnsUntilElection?: number;
  /** 是否处于选举竞选期 */
  isElectionCampaign?: boolean;
  /** 玩家身心健康 (0-100)，受压力和年龄影响 */
  playerHealth?: number;
  /** 玩家压力水平 (0-100) */
  playerStress?: number;
  /** 玩家是否已死亡 */
  isPlayerDead?: boolean;
  /** 玩家死亡原因 */
  playerDeathCause?: string;
  /**
   * 跨回合世界状态记忆（LLM 推演一致性用）。
   * 由 worldMemory.ts 维护，注入到 LLM prompt 让 NPC / 剧情延续过往设定。
   * undefined = 旧存档，会在 migrateGameState 中自动初始化。
   */
  worldMemory?: import('../engine/worldMemory').WorldMemory;
  /**
   * 戏剧曲线状态（dramaEngine 用）。
   * 控制 LLM 推演的戏剧节奏（tension / arc / cooldown）。
   * undefined = 未接入，simulate 等工具会自动初始化。
   */
  dramaState?: import('../engine/dramaEngine').DramaState;
  /**
   * 会派列表（Phase G Q5：党首辩论机制）。
   * undefined = 旧存档，parliamentaryGroupEngine 会自动初始化。
   */
  parliamentaryGroups?: ParliamentaryGroup[];
  /**
   * 上次党首辩论事件生成的月份（Phase G Q5）。
   * 用于"每月至少生成一次辩论事件"的检测。
   * undefined = 未生成过。
   */
  lastDebateMonth?: number;
  /**
   * 连续低支持率回合计数（Phase G 第七章触发条件 5）。
   * 用于"连续 6 回合支持率 < 25% → 触发党首选举"。
   * 仅跟踪玩家所在党。
   */
  consecutiveLowSupportTurns?: number;
}

// ===== 委员会类型 =====

/** 委员会 ID */
export type CommitteeId =
  | 'cabinet'           // 内阁委员会
  | 'general'           // 总务委员会
  | 'judicial'          // 法务委员会
  | 'foreign'           // 外务委员会
  | 'finance'           // 财务金融委员会
  | 'economy'           // 经济产业委员会
  | 'security'          // 安全保障委员会
  | 'budget'            // 预算委员会
  | 'health';           // 厚生劳动委员会

/** 委员会 ID 对应中文名 */
export const COMMITTEE_LABELS: Record<CommitteeId, string> = {
  cabinet: '内阁委员会',
  general: '总务委员会',
  judicial: '法务委员会',
  foreign: '外务委员会',
  finance: '财务金融委员会',
  economy: '经济产业委员会',
  security: '安全保障委员会',
  budget: '预算委员会',
  health: '厚生劳动委员会',
};

/** 委员会成员 */
export interface CommitteeMember {
  /** 议员姓名 */
  personName: string;
  /** 所属政党 */
  partyId: string;
  /** 人格数据索引键："partyId:personName"，用于查找 mpPersonalities */
  personalityKey?: string;
}

/** 委员会 */
export interface Committee {
  id: CommitteeId;
  /** 委员长 */
  chairman: CommitteeMember;
  /** 副委员长 */
  viceChairman: CommitteeMember;
  /** 委员（含委员长和副委员长） */
  members: CommitteeMember[];
  /** 当前出席委员（用于法定人数判定） */
  presentMembers: string[];
  /** 委员会整体意识形态倾向 */
  ideology: Ideology;
  /** 运作效率 (0-100)，受主席能力和党派对立影响 */
  efficiency: number;
}

// ===== 法案类型 =====

/** 法案状态 */
export type BillStatus =
  | 'draft'           // 起草
  | 'in_committee'    // 委员会审议中
  | 'revised'         // 委员会修正后
  | 'delayed'         // 委员会搁置
  | 'voting'          // 全院表决
  | 'passed'          // 通过
  | 'rejected'        // 否决
  | 'withdrawn'       // 撤回（解散时自动）
  | 'implemented';    // 已实施

/** 法案状态中文标签 */
export const BILL_STATUS_LABELS: Record<BillStatus, string> = {
  draft: '起草',
  in_committee: '委员会审议中',
  revised: '委员会修正',
  delayed: '搁置',
  voting: '全院表决',
  passed: '通过',
  rejected: '否决',
  withdrawn: '撤回',
  implemented: '已实施',
};

/** 法案 */
export interface Bill {
  id: string;
  /** 法案标题 */
  title: string;
  /** 法案概述 */
  summary: string;
  /** 提出者所属政党 */
  proposerPartyId: string;
  /** 提出者姓名 */
  proposerName: string;
  /** 送交审议的委员会 */
  committeeId: CommitteeId;
  /** 当前状态 */
  status: BillStatus;
  /** 委员会审议结果说明 */
  committeeNote: string;
  /** 委员会修正内容（如有） */
  amendment: string;
  /** 表决赞成票数 */
  votesFor: number;
  /** 表决反对票数 */
  votesAgainst: number;
  /** 创建回合 */
  createdTurn: number;
  /** 决策截止回合（超过后自动表决） */
  decisionDeadline?: number;
  /** 是否为修宪法案（需要绝对多数支持） */
  isConstitutionalAmendment?: boolean;
}
