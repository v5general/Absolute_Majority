import type { MarketMetrics, District } from '../types';

/**
 * 初始大盘指标
 * 模拟一个 200 席位的议会选举（199 NPC + 1 玩家）
 */
export const initialMetrics: MarketMetrics = {
  totalVoters: 48_500_000,
  turnoutRate: 67.5,
  swingVoterRatio: 18.2,
  daysToElection: 90,
  totalSeats: 200,
  majorityThreshold: 101,
  leadingCoalitionSeats: 0,
  economicIndex: 62,
  socialStabilityIndex: 71,
  mediaAttention: 45,
};

/**
 * 初始选区数据
 * 划分为 8 个选区，每个选区席位不同
 * 总席位: 35+28+30+30+22+20+18+16 = 199 (NPC)
 *
 * 目标席位分配（199 NPC 席）:
 *   改革民主党(RDP) 54席  |  自由党(LP)     40席
 *   国民保守党(NCP) 38席  |  社会联盟(SA)   29席
 *   第一公民阵线(FCF) 24席 |  联合劳工党(ULP) 14席
 *
 * 玩家为第 200 席，加入某党后该党席位数 +1。
 */
export const initialDistricts: District[] = [
  {
    id: 'capital-metro',
    name: '首都大都市区',
    totalSeats: 35,
    voterCount: 9_500_000,
    supportByParty: {
      reform: 1200,
      liberty: 700,
      conservative: 400,
      progressive: 600,
      populist: 400,
      solidarity: 200,
    },
  },
  {
    id: 'east-coast',
    name: '东海岸商业带',
    totalSeats: 28,
    voterCount: 6_800_000,
    supportByParty: {
      reform: 800,
      liberty: 800,
      conservative: 400,
      progressive: 300,
      populist: 300,
      solidarity: 200,
    },
  },
  {
    id: 'west-tech',
    name: '西部科技走廊',
    totalSeats: 30,
    voterCount: 7_800_000,
    supportByParty: {
      reform: 1000,
      liberty: 600,
      conservative: 300,
      progressive: 500,
      populist: 400,
      solidarity: 200,
    },
  },
  {
    id: 'north-industrial',
    name: '北方工业区',
    totalSeats: 30,
    voterCount: 7_200_000,
    supportByParty: {
      reform: 600,
      liberty: 500,
      conservative: 500,
      progressive: 500,
      populist: 500,
      solidarity: 400,
    },
  },
  {
    id: 'south-agriculture',
    name: '南方农业区',
    totalSeats: 22,
    voterCount: 4_200_000,
    supportByParty: {
      reform: 300,
      liberty: 200,
      conservative: 1000,
      progressive: 200,
      populist: 300,
      solidarity: 200,
    },
  },
  {
    id: 'central-plains',
    name: '中部平原区',
    totalSeats: 20,
    voterCount: 3_600_000,
    supportByParty: {
      reform: 400,
      liberty: 300,
      conservative: 800,
      progressive: 300,
      populist: 100,
      solidarity: 100,
    },
  },
  {
    id: 'mountain-resource',
    name: '山脉资源区',
    totalSeats: 18,
    voterCount: 2_800_000,
    supportByParty: {
      reform: 300,
      liberty: 600,
      conservative: 400,
      progressive: 200,
      populist: 200,
      solidarity: 100,
    },
  },
  {
    id: 'island-special',
    name: '海岛特别区',
    totalSeats: 16,
    voterCount: 3_600_000,
    supportByParty: {
      reform: 800,
      liberty: 300,
      conservative: 1,
      progressive: 380,
      populist: 200,
      solidarity: 1,
    },
  },
];
