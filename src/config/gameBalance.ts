/**
 * 游戏平衡配置
 * 所有影响游戏平衡的数值都应提取到这里
 * 便于根据剧情推进进行调整
 */

/** 事件影响值的平衡配置 */
export const EVENT_BALANCE = {
  /** 支持率变化的合理范围 */
  supportDelta: {
    min: -5,
    max: 5,
    significant: 3,  // 超过此值视为重大影响
  },
  /** 关系变化的合理范围 */
  relationDelta: {
    min: -30,
    max: 30,
    significant: 15,  // 超过此值视为重大关系变化
  },
  /** 资金变化的合理范围 */
  fundsDelta: {
    min: -500,
    max: 500,
    significant: 200,  // 超过此值视为重大资金变化
  },
  /** 指标变化的合理范围 */
  metricsDelta: {
    min: -15,
    max: 15,
    significant: 8,  // 超过此值视为重大指标变化
  },
  /** 媒体关注度的最大值 */
  mediaAttention: {
    min: 0,
    max: 100,
  },
} as const;

/** 根据事件严重程度调整影响上限 */
export function getSeverityMultiplier(severity: number): number {
  switch (severity) {
    case 1: return 0.5;
    case 2: return 0.8;
    case 3: return 1.0;
    case 4: return 1.5;
    case 5: return 2.0;
    default: return 1.0;
  }
}
