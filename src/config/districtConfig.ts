/**
 * 选区（比例代表区）配置
 *
 * 基于现实日本众议院比例代表 11 区块划分。
 * 所有选区数据统一使用此配置，便于随剧情推进调整。
 *
 * 政治特征说明：
 * - 北海道：传统农业/渔业/重工业，左翼工会与保守派拉锯，摇摆属性
 * - 东北：传统农业区，左翼工会与保守派拉锯，摇摆属性
 * - 北关东：首都圈郊区，年轻化/都市化，对经济福利敏感，中间选民多
 * - 南关东：首都圈核心（含横滨），极度都市化，舆论极其敏感
 * - 东京：首都，选民年轻化，中间选民最多，对经济政策极其敏感
 * - 北陆信越：传统保守派铁票仓，门阀/地方土建利益集团根深蒂固
 * - 东海：传统保守派铁票仓，制造业中心
 * - 近畿：含大阪/京都，新兴改革派/民粹大本营，传统大党翻车区
 * - 中国：传统保守派铁票仓
 * - 四国：传统保守派铁票仓
 * - 九州（含冲绳）：防卫/外交/美军基地议题热度高，政治光谱两极分化
 */

/** 比例代表区块定义 */
export interface ProportionalBlock {
  /** 区块 ID */
  id: string;
  /** 区块中文名 */
  name: string;
  /** 区块英文名 */
  nameEn: string;
  /** 该区块包含的都道府县 */
  prefectures: string[];
  /**
   * 分配的席位总数。
   *
   * Phase G Q1：每个区块固定 10 席（DIRECT_SEATS_PER_BLOCK = 10），
   * 直接层总计 110 席。原"按选民人口比例分配"已废弃以简化系统。
   */
  totalSeats: number;
  /** 选民人数（近似值） */
  voterCount: number;
  /** 政治特征标签 */
  politicalTraits: string[];
  /** 各党派在该区块的基础支持度 */
  supportByParty: Record<string, number>;
}

/**
 * 11 个比例代表区块
 *
 * Phase G Q1：并行制 110 直接 + 90 全国比例代表 = 200 席
 *   - 每个区块固定 10 个直接席位（DIRECT_SEATS_PER_BLOCK = 10）
 *   - 总直接席 = 11 × 10 = 110 NPC 直接席
 *   - 全国比例代表层 90 席独立计算（见 electionConfig / electionEngine）
 *
 * NPC = 110 直接 + 89 比例 = 199（玩家占用第 200 席，加入某党时该党 +1）
 */
export const PROPORTIONAL_BLOCKS: ProportionalBlock[] = [
  {
    id: 'hokkaido',
    name: '北海道',
    nameEn: 'Hokkaidō',
    prefectures: ['北海道'],
    totalSeats: 10,
    voterCount: 4_300_000,
    politicalTraits: ['摇摆', '工会影响', '农业渔业'],
    supportByParty: {
      reform: 730,
      liberty: 480,
      conservative: 500,
      progressive: 600,
      populist: 300,
      solidarity: 430,
    },
  },
  {
    id: 'tohoku',
    name: '东北',
    nameEn: 'Tōhoku',
    prefectures: ['青森', '岩手', '宫城', '秋田', '山形', '福岛'],
    totalSeats: 10,
    voterCount: 7_200_000,
    politicalTraits: ['摇摆', '传统农业', '工会背景'],
    supportByParty: {
      reform: 840,
      liberty: 480,
      conservative: 600,
      progressive: 700,
      populist: 300,
      solidarity: 520,
    },
  },
  {
    id: 'kita-kanto',
    name: '北关东',
    nameEn: 'Kitakantō',
    prefectures: ['茨城', '栃木', '群马', '埼玉'],
    totalSeats: 10,
    voterCount: 11_000_000,
    politicalTraits: ['年轻化', '郊区都市', '经济敏感', '中间选民'],
    supportByParty: {
      reform: 1110,
      liberty: 800,
      conservative: 500,
      progressive: 500,
      populist: 470,
      solidarity: 230,
    },
  },
  {
    id: 'minami-kanto',
    name: '南关东',
    nameEn: 'Minamikantō',
    prefectures: ['千叶', '神奈川'],
    totalSeats: 10,
    voterCount: 12_500_000,
    politicalTraits: ['极度都市化', '舆论敏感', '年轻选民', '中间选民最多'],
    supportByParty: {
      reform: 1230,
      liberty: 910,
      conservative: 400,
      progressive: 600,
      populist: 480,
      solidarity: 200,
    },
  },
  {
    id: 'tokyo',
    name: '东京',
    nameEn: 'Tōkyō',
    prefectures: ['东京'],
    totalSeats: 10,
    voterCount: 11_500_000,
    politicalTraits: ['首都', '极度都市化', '舆论极其敏感', '中间选民最多'],
    supportByParty: {
      reform: 1200,
      liberty: 1080,
      conservative: 300,
      progressive: 700,
      populist: 530,
      solidarity: 230,
    },
  },
  {
    id: 'hokuriku-shinetsu',
    name: '北陆信越',
    nameEn: 'Hokuriku-Shinetsu',
    prefectures: ['新潟', '富山', '石川', '福井', '山梨', '长野'],
    totalSeats: 10,
    voterCount: 5_800_000,
    politicalTraits: ['保守铁票仓', '门阀政治', '地方土建利益'],
    supportByParty: {
      reform: 400,
      liberty: 360,
      conservative: 870,
      progressive: 200,
      populist: 100,
      solidarity: 140,
    },
  },
  {
    id: 'tokai',
    name: '东海',
    nameEn: 'Tōkai',
    prefectures: ['岐阜', '静冈', '爱知', '三重'],
    totalSeats: 10,
    voterCount: 11_000_000,
    politicalTraits: ['保守铁票仓', '制造业中心', '地方土建利益'],
    supportByParty: {
      reform: 580,
      liberty: 700,
      conservative: 800,
      progressive: 300,
      populist: 300,
      solidarity: 220,
    },
  },
  {
    id: 'kinki',
    name: '近畿',
    nameEn: 'Kinki',
    prefectures: ['滋贺', '京都', '大阪', '兵库', '奈良', '和歌山'],
    totalSeats: 10,
    voterCount: 15_000_000,
    politicalTraits: ['改革派大本营', '民粹根据地', '传统大党翻车区'],
    supportByParty: {
      reform: 850,
      liberty: 590,
      conservative: 300,
      progressive: 600,
      populist: 950,
      solidarity: 340,
    },
  },
  {
    id: 'chugoku',
    name: '中国',
    nameEn: 'Chūgoku',
    prefectures: ['鸟取', '岛根', '冈山', '广岛', '山口'],
    totalSeats: 10,
    voterCount: 6_000_000,
    politicalTraits: ['保守铁票仓', '门阀政治', '地方利益集团'],
    supportByParty: {
      reform: 400,
      liberty: 350,
      conservative: 850,
      progressive: 200,
      populist: 200,
      solidarity: 100,
    },
  },
  {
    id: 'shikoku',
    name: '四国',
    nameEn: 'Shikoku',
    prefectures: ['德岛', '香川', '爱媛', '高知'],
    totalSeats: 10,
    voterCount: 3_200_000,
    politicalTraits: ['保守铁票仓', '门阀政治', '农村利益'],
    supportByParty: {
      reform: 300,
      liberty: 250,
      conservative: 670,
      progressive: 200,
      populist: 100,
      solidarity: 150,
    },
  },
  {
    id: 'kyushu',
    name: '九州',
    nameEn: 'Kyūshū',
    prefectures: ['福冈', '佐贺', '长崎', '熊本', '大分', '宫崎', '鹿儿岛', '冲绳'],
    totalSeats: 10,
    voterCount: 11_000_000,
    politicalTraits: ['两极分化', '防卫外交议题', '美军基地', '冲绳特殊性'],
    supportByParty: {
      reform: 750,
      liberty: 480,
      conservative: 500,
      progressive: 700,
      populist: 570,
      solidarity: 450,
    },
  },
];

/** 总 NPC 直接席位数（11 区块 × 10）= 110 */
export const TOTAL_NPC_SEATS = PROPORTIONAL_BLOCKS.reduce((sum, b) => sum + b.totalSeats, 0);

/**
 * 全国比例代表层总席位数。
 *
 * Phase G Q1：90 席按全国政党票 D'Hondt 分配（5% 阈值）。
 * 与 electionConfig.PROPORTIONAL_SEATS_TOTAL 保持同步。
 */
export const PROPORTIONAL_SEATS_TOTAL = 90;

/** 区块 ID -> 区块数据的查找映射 */
export const BLOCK_BY_ID: Record<string, ProportionalBlock> = Object.fromEntries(
  PROPORTIONAL_BLOCKS.map((b) => [b.id, b]),
);

/** 都道府县 -> 所属区块 ID 的映射 */
export const PREFECTURE_TO_BLOCK: Record<string, string> = Object.fromEntries(
  PROPORTIONAL_BLOCKS.flatMap((b) => b.prefectures.map((p) => [p, b.id])),
);
