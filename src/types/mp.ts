/**
 * 议员政治人格类型
 *
 * 每个 MP 拥有独立的政治人格，驱动其 AI 行为。
 * AI 只能基于人格数据生成 Intent，绝不直接修改 GameState。
 */

// ===== 隐藏目标 =====

/** MP 的隐藏政治目标，驱动长期行为策略 */
export type HiddenGoal =
  | 'become_prime_minister'
  | 'become_finance_minister'
  | 'become_foreign_minister'
  | 'become_defense_minister'
  | 'become_health_minister'
  | 'become_economy_minister'
  | 'become_chief_secretary'
  | 'destroy_rival_faction'
  | 'expand_faction'
  | 'pass_tax_reform'
  | 'pass_labor_reform'
  | 'pass_defense_reform'
  | 'pass_healthcare_reform'
  | 'maintain_status_quo'
  | 'gain_media_attention'
  | 'accumulate_wealth';

// ===== 性格特质 (CK3风格) =====

/** 性格特质 */
export type PersonalityTrait =
  // 正面特质
  | 'decisive'        // 果断 - 能够迅速做出决策
  | 'cheerful'        // 开朗 - 乐观向上，善于缓解气氛
  | 'gregarious'      // 健谈 - 社交能力强，善于建立人脉
  | 'diligent'        // 勤勉 - 工作努力，从不懈怠
  | 'honest'          // 诚实 - 正直，不撒谎
  | 'generous'        // 慷慨 - 乐意分享财富和资源
  | 'brave'           // 勇敢 - 敢于冒险，不畏困难
  | 'temperate'       // 节制 - 自律，避免过度
  | 'forgiving'       // 宽容 - 容易原谅他人
  | 'calm'            // 冷静 - 在压力下保持理智
  // 负面特质
  | 'cruel'           // 暴虐 - 残忍，对他人痛苦无动于衷
  | 'impulsive'       // 冲动 - 行事鲁莽，不经过思考
  | 'withdrawn'       // 孤僻 - 不善社交，回避人群
  | 'lazy'            // 懒惰 - 工作懈怠，缺乏动力
  | 'deceitful'       // 狡猾 - 善于欺骗，不可信
  | 'greedy'          // 贪婪 - 贪得无厌，追逐财富
  | 'craven'          // 怯懦 - 胆小怕事，逃避风险
  | 'indulgent'       // 放纵 - 缺乏自制，过度享乐
  | 'vengeful'        // 报复心强 - 记仇，报复性强
  | 'stubborn'        // 固执 - 坚持己见，不愿妥协
  // 中性特质
  | 'charismatic'     // 魅力 - 天生领袖气质
  | 'analytical'      // 分析型 - 善于分析数据和逻辑
  | 'empathetic'      // 共情 - 能够理解他人情感
  | 'cynical'         // 愤世嫉俗 - 对人性持怀疑态度
  | 'pragmatic'       // 务实 - 注重实际效果
  | 'idealistic'      // 理想主义 - 追求崇高理想
  | 'traditional'     // 传统 - 重视传统价值
  | 'progressive'     // 进步 - 支持社会变革
  | 'independent'     // 独立 - 不盲从权威
  | 'conformist'      // 从众 - 遵循主流意见
  | 'aggressive'      // 好斗 - 喜欢对抗和竞争
  | 'diplomatic'      // 外交 - 善于调解冲突
  | 'ambitious_trait' // 野心勃勃 - 渴望权力和成就
  | 'cautious'        // 谨慎 - 小心翼翼，避免风险
  | 'radical'         // 激进 - 支持彻底变革
  | 'moderate'        // 温和 - 持中间立场;

/** 性格特质描述 */
export const PERSONALITY_TRAIT_LABELS: Record<PersonalityTrait, string> = {
  decisive: '果断', cheerful: '开朗', gregarious: '健谈', diligent: '勤勉',
  honest: '诚实', generous: '慷慨', brave: '勇敢', temperate: '节制',
  forgiving: '宽容', calm: '冷静',
  cruel: '暴虐', impulsive: '冲动', withdrawn: '孤僻', lazy: '懒惰',
  deceitful: '狡猾', greedy: '贪婪', craven: '怯懦', indulgent: '放纵',
  vengeful: '报复心强', stubborn: '固执',
  charismatic: '魅力', analytical: '分析型', empathetic: '共情',
  cynical: '愤世嫉俗', pragmatic: '务实', idealistic: '理想主义',
  traditional: '传统', progressive: '进步', independent: '独立',
  conformist: '从众', aggressive: '好斗', diplomatic: '外交',
  ambitious_trait: '野心勃勃', cautious: '谨慎', radical: '激进', moderate: '温和',
};

// ===== 政治意识形态 =====

/** 政治意识形态 */
export type PoliticalIdeology =
  // 左翼意识形态
  | 'socialism'        // 社会主义 - 生产资料公有制，社会福利最大化
  | 'communism'        // 共产主义 - 阶级消灭，无产者联合
  | 'anarchism'        // 无政府主义 - 废除国家，自由联合
  | 'syndicalism'      // 工团主义 - 工人自治，工会掌权
  | 'trotskyism'       // 托洛茨基主义 - 世界革命，不断革命
  | 'maoism'          // 毛主义 - 农村包围城市，人民战争
  | 'democratic_socialism'  // 民主社会主义 - 民主框架内实现社会主义
  // 自由主义意识形态
  | 'liberalism'       // 自由主义 - 个人自由，市场经济
  | 'neoliberalism'    // 新自由主义 - 经济自由化，私有化
  | 'progressivism'    // 进步主义 - 社会改革，科学进步
  | 'libertarianism'   // 自由意志主义 - 最小政府，个人自治
  | 'social_liberalism'  // 社会自由主义 - 经济自由 + 社会福利
  // 保守主义意识形态
  | 'conservatism'     // 保守主义 - 维护传统，渐进改革
  | 'neoconservatism'  // 新保守主义 - 强力政府，干预主义
  | 'liberal_conservatism'  // 自由保守主义 - 经济保守 + 社会自由
  | 'traditionalism'   // 传统主义 - 宗教/文化传统至上
  // 民族主义意识形态
  | 'nationalism'     // 民族主义 - 民族利益至上
  | 'fascism'         // 法西斯主义 - 极端民族主义，威权统治
  | 'chauvinism'      // 沙文主义 - 极端民族优越感
  | 'regionalism'     // 地方主义 - 地方自治，区域利益
  // 宗教意识形态
  | 'theocracy'       // 神权政治 - 宗教法则统治
  | 'fundamentalism'  // 原教旨主义 - 严格宗教教义
  | 'secularism'      // 世俗主义 - 政教分离
  // 环保与其它
  | 'environmentalism'  // 环保主义 - 环境保护优先
  | 'feminism'        // 女权主义 - 性别平等
  | 'populism'        // 民粹主义 - 人民对抗精英
  | 'authoritarianism'  // 威权主义 - 强力领导，秩序优先
  | 'technocracy'    // 技术官僚主义 - 专家治国
  | 'corporatism'    // 统合主义 - 阶级合作，团体协商
  | 'militarism'     // 军国主义 - 军事扩张，武力至上
  | 'pacifism'       // 和平主义 - 反对战争，非暴力
  | 'monarchism'     // 君主主义 - 君主立宪或绝对君主
  | 'republicanism'  // 共和主义 - 共和体制，反对君主;

/** 政治意识形态中文标签 */
export const POLITICAL_IDEOLOGY_LABELS: Record<PoliticalIdeology, string> = {
  socialism: '社会主义', communism: '共产主义', anarchism: '无政府主义',
  syndicalism: '工团主义', trotskyism: '托洛茨基主义', maoism: '毛主义',
  democratic_socialism: '民主社会主义',
  liberalism: '自由主义', neoliberalism: '新自由主义', progressivism: '进步主义',
  libertarianism: '自由意志主义', social_liberalism: '社会自由主义',
  conservatism: '保守主义', neoconservatism: '新保守主义',
  liberal_conservatism: '自由保守主义', traditionalism: '传统主义',
  nationalism: '民族主义', fascism: '法西斯主义', chauvinism: '沙文主义',
  regionalism: '地方主义',
  theocracy: '神权政治', fundamentalism: '原教旨主义', secularism: '世俗主义',
  environmentalism: '环保主义', feminism: '女权主义', populism: '民粹主义',
  authoritarianism: '威权主义', technocracy: '技术官僚主义', corporatism: '统合主义',
  militarism: '军国主义', pacifism: '和平主义', monarchism: '君主主义', republicanism: '共和主义',
};

// ===== 议员人格 =====

/** 议员政治人格档案 */
export interface MPPersonality {
  /** 唯一标识："partyId:personName" */
  id: string;
  /** 议员全名（对应 CommitteeMember.personName） */
  personName: string;
  /** 所属政党 ID */
  partyId: string;
  /** 年龄 */
  age: number;
  /** 性别 */
  gender: 'male' | 'female';

  // --- 政治能力 (0-100) ---
  /** 野心：向上爬的驱动力（0=安于现状，100=不择手段） */
  ambition: number;
  /** 忠诚度：对党首的忠诚（0=随时叛变，100=坚定不移） */
  loyalty: number;
  /** 腐败倾向（0=廉洁，100=见钱眼开） */
  corruption: number;
  /** 公众知名度（0=默默无闻，100=家喻户晓） */
  popularity: number;
  /** 媒体操控技巧（0=经常失言，100=舆论大师） */
  mediaSkill: number;
  /** 谈判技巧（0=固执己见，100=交易大师） */
  negotiationSkill: number;

  // --- 性格特质 (1-3个，CK3风格) ---
  personalityTraits: PersonalityTrait[];

  // --- 政治意识形态 ---
  politicalIdeology: {
    primary: PoliticalIdeology;
    secondary?: PoliticalIdeology;
    /** 经济左右轴 (-100 极左 ~ +100 极右) */
    economicAxis: number;
    /** 社会自由轴 (-100 威权 ~ +100 自由) */
    socialAxis: number;
  };

  // --- 状态追踪 ---
  /** 当前压力水平（0=平静，100=崩溃边缘） */
  stress: number;
  /** 身心健康（0=无法履职，100=巅峰状态） */
  health: number;

  // --- 动机 ---
  /** 1-3 个隐藏目标，驱动该议员的行为策略 */
  hiddenGoals: HiddenGoal[];

  // --- 角色标记（计算得出） ---
  /** 是否为党首 */
  isLeader: boolean;
  /** 是否为内阁大臣 */
  isMinister: boolean;
  /** 是否为委员会委员长 */
  isCommitteeChairman: boolean;

  // --- 派阀/职业/背景（新增） ---
  /** 所属派阀ID（null = 无派阀 / ULP党员） */
  factionId?: string | null;
  /** 双轨制职业状态 */
  career?: import('./career').CareerState;
  /** 出身背景档案 */
  background?: import('./background').MPBackground;

  // --- 生老病死 ---
  /** 是否已死亡 */
  deceased?: boolean;
  /** 死亡原因 */
  deathCause?: 'illness' | 'old_age' | 'accident' | 'suicide' | 'stress_collapse';
  /** 死亡回合 */
  deathTurn?: number;
}
