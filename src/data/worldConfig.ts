/**
 * 游戏世界观全局配置
 *
 * 设定：架空日本，2058年
 * 政治制度：议会内阁制
 * 国会：众议院（唯一可操作议会）
 * 任期：4年 = 48回合，1回合 = 1个月
 *
 * 核心原则：
 * - 现实中的日本政党不存在，所有政党为原创
 * - 现实中的日本政治人物不存在，所有人物为原创
 * - 允许使用日本姓名、行政区划、政府机构名称
 * - 游戏重点是议会政治、派系斗争、联合组阁、
 *   委员会博弈、媒体战、利益集团博弈
 * - 不是现实政治映射
 *
 * 选区划分基于现实日本众议院比例代表 11 区块
 */

import { PROPORTIONAL_BLOCKS, PREFECTURE_TO_BLOCK } from '../config/districtConfig';

export const WORLD_CONFIG = {
  /** 国家名称 */
  country: '日本国',

  /** 游戏时间背景 */
  year: 2058,

  /** 政治制度 */
  politicalSystem: 'parliamentary' as const,

  /** 可操作议会 */
  parliament: {
    name: '众议院',
    isUpperHouse: false,
  },

  /** 任期与回合 */
  term: {
    /** 任期年数 */
    years: 4,
    /** 总回合数 */
    totalTurns: 48,
    /** 每回合代表的现实时长 */
    turnDuration: '1个月' as const,
  },

  /** 游戏核心主题 */
  coreThemes: [
    '议会政治',
    '派系斗争',
    '联合组阁',
    '委员会博弈',
    '媒体战',
    '利益集团博弈',
  ],

  /** 日本行政区划 - 47都道府县（从选区配置自动收集） */
  get prefectures() {
    return PROPORTIONAL_BLOCKS.flatMap(b => b.prefectures);
  },

  /** 比例代表区块定义（11 区块） */
  proportionalBlocks: PROPORTIONAL_BLOCKS.map(b => ({
    id: b.id,
    name: b.name,
    nameEn: b.nameEn,
    prefectures: b.prefectures,
    totalSeats: b.totalSeats,
    politicalTraits: b.politicalTraits,
  })),

  /** 都道府县 -> 所属比例代表区块 ID 映射 */
  prefectureToBlock: PREFECTURE_TO_BLOCK,

  /** 日本政府机构（游戏中使用） */
  governmentAgencies: [
    '首相官邸',
    '财务省',
    '外务省',
    '防卫省',
    '厚生劳动省',
    '经济产业省',
    '文部科学省',
    '国土交通省',
    '环境省',
    '法务省',
    '总务省',
    '农林水产省',
    '国家公安委员会',
    '内阁官房',
    '内阁府',
  ],
} as const;

/** 世界观配置类型 */
export type WorldConfig = typeof WORLD_CONFIG;
