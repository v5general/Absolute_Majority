import type { MarketMetrics, District } from '../types';
import { PROPORTIONAL_BLOCKS } from '../config/districtConfig';

/**
 * 初始大盘指标
 * 模拟一个 200 席位的议会选举（199 NPC + 1 玩家）
 */
export const initialMetrics: MarketMetrics = {
  totalVoters: 98_500_000,
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
 *
 * 基于日本现实众议院比例代表 11 区块划分：
 *   北海道(12) + 东北(14) + 北关东(20) + 南关东(22) + 东京(25)
 *   + 北陆信越(13) + 东海(22) + 近畿(30) + 中国(13) + 四国(8) + 九州(20)
 *   = 199 NPC 席
 *
 * 各区块政治特征：
 *   近畿 — 新兴改革派/民粹大本营，传统大党翻车区
 *   南关东/北关东/东京 — 首都圈，年轻化都市化，中间选民最多
 *   北海道/东北 — 摇摆区，左翼工会与保守派拉锯
 *   北陆信越/东海/中国/四国 — 保守铁票仓
 *   九州 — 两极分化，防卫外交议题热度高
 *
 * 玩家为第 200 席，加入某党后该党席位数 +1。
 */
export const initialDistricts: District[] = PROPORTIONAL_BLOCKS.map((block) => ({
  id: block.id,
  name: block.name,
  totalSeats: block.totalSeats,
  voterCount: block.voterCount,
  supportByParty: { ...block.supportByParty },
}));
