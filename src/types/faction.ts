/** 派阀意识形态子光谱 */
export type FactionIdeology =
  | 'mainstream'    // 主流派
  | 'reformist'     // 改革派
  | 'conservative'  // 保守派
  | 'radical'       // 激进派
  | 'pragmatist';   // 实用派

/** 派阀诉求类型 */
export type FactionDemand =
  | 'cabinet_post'      // 内阁职位
  | 'committee_chair'   // 委员会委员长
  | 'budget_resource'   // 预算资源
  | 'policy_influence'  // 政策影响力
  | 'media_exposure';   // 媒体曝光

/** 党内派阀 */
export interface Faction {
  id: string;
  name: string;
  /** 派阀领袖 (MP personality key: "partyId:personName") */
  leader: string;
  /** 成员 personality keys */
  members: string[];
  /** 派阀在党内的意识形态倾向 */
  ideology: FactionIdeology;
  /** 对党领导层的忠诚度: 0-100 */
  loyalty: number;
  /** 政治影响力: 0-100 */
  influence: number;
  /** 资金(百万) */
  funding: number;
  /** 野心值: 0-100 (诉求未满足时上升) */
  ambition: number;
  /** 当前诉求 */
  demands: FactionDemand[];
  /** 所属党派ID */
  partyId: string;
}
