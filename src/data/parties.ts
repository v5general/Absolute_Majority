import type { Party } from '../types';

/**
 * 初始派系/政党数据
 * 设计为 6 个派系，模拟多党制选举生态
 *
 * NPC 席位分配（199席）:
 *   改革民主党 54席 (27.1%) |  自由党 40席 (20.1%)
 *   国民保守党 38席 (19.1%) |  社会联盟 29席 (14.6%)
 *   第一公民阵线 24席 (12.1%) | 联合劳工党 14席 (7.0%)
 *
 * 玩家为第 200 席议员，加入某党后该党席位数 +1
 *
 * 姓名规则（CONSTITUTION 核心原则 #2 #4）：
 * - 所有政治人物为原创角色，不映射任何现实政治家
 * - 中文读音和日文读音均不引起对现实人物的联想
 * - 姓氏和名字均从排除现实政治家后的姓名库中选取
 */
export const initialParties: Party[] = [
  {
    id: 'reform',
    name: '改革民主党',
    abbreviation: 'RDP',
    color: '#1E88E5',
    ideology: 'center',
    leader: '原田 正',
    members: ['中村 健一', '山田 美咲', '高桥 直树', '伊藤 樱', '渡边 修', '铃木 亮'],
    description: '温和中间路线，强调制度改革、廉政建设和经济增长，在都市中产阶级有较强支持。',
    baseSupport: 27,
    currentSupport: 27,
    projectedSeats: 54,
    funds: 1200,
    organization: 72,
    charisma: 84,
  },
  {
    id: 'liberty',
    name: '自由党',
    abbreviation: 'LP',
    color: '#FB8C00',
    ideology: 'right',
    leader: '望月 弘',
    members: ['森田 太郎', '藤田 美纪', '冈本 大辅', '萩原 进'],
    description: '自由市场拥趸，主张小政府、低税率、放松管制，深受企业家和年轻专业人士青睐。',
    baseSupport: 20,
    currentSupport: 20,
    projectedSeats: 40,
    funds: 1000,
    organization: 68,
    charisma: 88,
  },
  {
    id: 'conservative',
    name: '国民保守党',
    abbreviation: 'NCP',
    color: '#43A047',
    ideology: 'center-right',
    leader: '桐生 毅夫',
    members: ['松本 胜', '井上 和夫', '小林 正道', '斋藤 秀树', '竹中 一郎'],
    description: '传统价值守护者，主张减税、强军、家庭价值，在乡村和老年人群体中根基深厚。',
    baseSupport: 19,
    currentSupport: 19,
    projectedSeats: 38,
    funds: 820,
    organization: 78,
    charisma: 54,
  },
  {
    id: 'progressive',
    name: '社会联盟',
    abbreviation: 'SA',
    color: '#00897B',
    ideology: 'center-left',
    leader: '林 千鹤',
    members: ['田中 惠子', '佐藤 隆', '木村 真理', '清水 翔太', '小川 惠'],
    description: '主张社会福利扩大化、环保优先、财富再分配，拥有强大的工会基层组织。',
    baseSupport: 14.5,
    currentSupport: 14.5,
    projectedSeats: 29,
    funds: 680,
    organization: 74,
    charisma: 68,
  },
  {
    id: 'populist',
    name: '第一公民阵线',
    abbreviation: 'FCF',
    color: '#8E24AA',
    ideology: 'far-right',
    leader: '远山 绫子',
    members: ['石井 雄大', '长谷川 真由', '宫崎 健', '坂口 翔'],
    description: '民粹主义路线，强调民族主义、反精英、反全球化，以年轻支持者为主力，在蓝领工人和偏远地区有铁杆支持者。',
    baseSupport: 12,
    currentSupport: 12,
    projectedSeats: 24,
    funds: 900,
    organization: 52,
    charisma: 74,
  },
  {
    id: 'solidarity',
    name: '联合劳工党',
    abbreviation: 'ULP',
    color: '#E53935',
    ideology: 'left',
    leader: '浅野 直人',
    members: ['高田 一郎', '中岛 优子', '桥本 哲也', '西村 洋一'],
    description: '无产阶级政党，坚持科学社会主义道路，党内实行民主集中制，主张劳动者权益、反对资本剥削、提倡减税减轻劳动人民负担。组织严密、纪律性强，支持者以中老年工人为主，年轻工人次之，整体支持率不高。',
    baseSupport: 7,
    currentSupport: 7,
    projectedSeats: 14,
    funds: 780,
    organization: 92,
    charisma: 48,
  },
];
