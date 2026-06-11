import type { RelationEntry } from '../types';

/**
 * 初始关系矩阵
 * score: -100(完全敌对) ~ 100(完全联盟)
 * 对角线为自身，不包含在内
 *
 * 关系映射：
 *   score >= 60  => alliance (联盟)
 *   score >= 20  => friendly (友好)
 *   score >= -20 => neutral  (中立)
 *   score >= -50 => tense    (紧张)
 *   score < -50  => hostile  (敌对)
 *
 * 意识形态光谱：ULP(left) > SA(center-left) > RDP(center) > NCP(center-right) > LP(right) > FCF(far-right)
 */
export const initialRelations: RelationEntry[] = [
  // ===== 社会联盟 (progressive) 对其他派系 =====
  {
    from: 'progressive',
    to: 'reform',
    score: 30,
    type: 'friendly',
    description: '在福利政策上有合作空间，但改革派更偏市场路线，分歧不小',
  },
  {
    from: 'progressive',
    to: 'conservative',
    score: -35,
    type: 'tense',
    description: '在税收和福利议题上有明显分歧，但尚未到全面对立的程度',
  },
  {
    from: 'progressive',
    to: 'liberty',
    score: -25,
    type: 'neutral',
    description: '批评自由市场但态度温和，在社会自由化议题上偶有交集',
  },
  {
    from: 'progressive',
    to: 'solidarity',
    score: 70,
    type: 'alliance',
    description: '天然盟友，在福利扩张和社会正义议题上高度一致，经常联合行动',
  },
  {
    from: 'progressive',
    to: 'populist',
    score: -55,
    type: 'hostile',
    description: '强烈反对其民粹主义和排外倾向，双方支持者经常冲突',
  },

  // ===== 改革民主党 (reform) 对其他派系 =====
  {
    from: 'reform',
    to: 'progressive',
    score: 25,
    type: 'friendly',
    description: '愿意在福利制度改革上合作，但担心被贴上左翼标签',
  },
  {
    from: 'reform',
    to: 'conservative',
    score: 25,
    type: 'friendly',
    description: '在经济发展思路上有共识，但社会治理理念差异大',
  },
  {
    from: 'reform',
    to: 'liberty',
    score: 50,
    type: 'friendly',
    description: '共享市场自由化理念，廉政建设上有合作基础',
  },
  {
    from: 'reform',
    to: 'solidarity',
    score: -10,
    type: 'neutral',
    description: '认可部分劳工诉求但认为其反资本立场过于激进',
  },
  {
    from: 'reform',
    to: 'populist',
    score: -40,
    type: 'tense',
    description: '反对其反制度倾向，但也在争取相同的中产阶级选民',
  },

  // ===== 国民保守党 (conservative) 对其他派系 =====
  {
    from: 'conservative',
    to: 'progressive',
    score: -30,
    type: 'tense',
    description: '在福利扩张和税收上有分歧，但社会联盟立场温和，尚可对话',
  },
  {
    from: 'conservative',
    to: 'reform',
    score: 20,
    type: 'friendly',
    description: '在维护秩序方面立场相近，可就预算达成妥协',
  },
  {
    from: 'conservative',
    to: 'liberty',
    score: 45,
    type: 'friendly',
    description: '经济政策上经常联合，但在社会保守议题上有分歧',
  },
  {
    from: 'conservative',
    to: 'solidarity',
    score: -65,
    type: 'hostile',
    description: '全面反对其反资本立场和阶级斗争叙事，视其为制度威胁',
  },
  {
    from: 'conservative',
    to: 'populist',
    score: 55,
    type: 'friendly',
    description: '在民族主义和传统价值上有共鸣，是潜在执政盟友',
  },

  // ===== 自由党 (liberty) 对其他派系 =====
  {
    from: 'liberty',
    to: 'progressive',
    score: -20,
    type: 'neutral',
    description: '对福利扩张持保留态度，但社会联盟立场温和，冲突可控',
  },
  {
    from: 'liberty',
    to: 'reform',
    score: 48,
    type: 'friendly',
    description: '核心盟友之一，在市场化改革和廉政上高度一致',
  },
  {
    from: 'liberty',
    to: 'conservative',
    score: 40,
    type: 'friendly',
    description: '经济上立场相近，但社会自由主义与社会保守主义矛盾',
  },
  {
    from: 'liberty',
    to: 'solidarity',
    score: -40,
    type: 'tense',
    description: '对其反资本和反自由市场立场强烈不满，减税主张是唯一微弱交集',
  },
  {
    from: 'liberty',
    to: 'populist',
    score: -50,
    type: 'hostile',
    description: '坚决反对贸易保护主义和排外政策，在经济全球化上完全对立',
  },

  // ===== 联合劳工党 (solidarity) 对其他派系 =====
  {
    from: 'solidarity',
    to: 'progressive',
    score: 60,
    type: 'alliance',
    description: '最亲密的政治盟友，但嫌社会联盟不够激进，时有摩擦',
  },
  {
    from: 'solidarity',
    to: 'reform',
    score: -15,
    type: 'neutral',
    description: '认为改革派是维护资本秩序的改良主义者，难以真正信任',
  },
  {
    from: 'solidarity',
    to: 'conservative',
    score: -65,
    type: 'hostile',
    description: '将保守党视为资产阶级代理人，阶级立场根本对立',
  },
  {
    from: 'solidarity',
    to: 'liberty',
    score: -45,
    type: 'tense',
    description: '视自由党为资本剥削的辩护士，减税共同点不足以弥合根本分歧',
  },
  {
    from: 'solidarity',
    to: 'populist',
    score: -70,
    type: 'hostile',
    description: '强烈反对其民族主义和排外政策，认为其分化了工人阶级团结',
  },

  // ===== 第一公民阵线 (populist) 对其他派系 =====
  {
    from: 'populist',
    to: 'progressive',
    score: -45,
    type: 'tense',
    description: '对社会联盟的温和左翼路线嗤之以鼻，但不视为首要威胁',
  },
  {
    from: 'populist',
    to: 'reform',
    score: -35,
    type: 'tense',
    description: '将改革派视为建制派一部分，但偶尔利用其议题',
  },
  {
    from: 'populist',
    to: 'conservative',
    score: 50,
    type: 'friendly',
    description: '在民族主义和传统议题上结盟，是天然执政伙伴',
  },
  {
    from: 'populist',
    to: 'liberty',
    score: -50,
    type: 'hostile',
    description: '反对自由市场和全球化，认为其损害本国工人利益',
  },
  {
    from: 'populist',
    to: 'solidarity',
    score: -65,
    type: 'hostile',
    description: '视劳工党为过时势力，双方在工人阶级选票上激烈争夺',
  },
];
