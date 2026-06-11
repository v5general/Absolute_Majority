/**
 * 固定的媒体配置
 * 游戏中只有三家媒体，分别代表不同政治立场
 */

export type MediaId = 'centrist' | 'left' | 'right';

export interface MediaOutlet {
  id: MediaId;
  name: string;
  abbreviation: string;
  /** 政治立场：'centrist'(中间), 'left'(左翼), 'right'(右翼) */
  stance: 'centrist' | 'left' | 'right';
  /** 影响力权重 1-10 */
  influence: number;
  /** 读者群体描述 */
  audience: string;
}

/**
 * 三家固定媒体（不可更改）
 */
export const MEDIA_OUTLETS: readonly MediaOutlet[] = [
  {
    id: 'centrist',
    name: '中央时事新闻',
    abbreviation: '中时',
    stance: 'centrist',
    influence: 10,
    audience: '中产阶层、公务员、知识分子',
  },
  {
    id: 'left',
    name: '革新民报',
    abbreviation: '革新',
    stance: 'left',
    influence: 8,
    audience: '工会成员、进步青年、社会活动家',
  },
  {
    id: 'right',
    name: '经合新闻',
    abbreviation: '经合',
    stance: 'right',
    influence: 9,
    audience: '企业家、保守派、工商界人士',
  },
] as const;

/**
 * 根据政治立场获取合适的媒体
 */
export function getMediaByStance(stance: 'centrist' | 'left' | 'right'): MediaOutlet {
  return MEDIA_OUTLETS.find(m => m.stance === stance) || MEDIA_OUTLETS[0];
}

/**
 * 获取所有媒体ID列表
 */
export function getAllMediaIds(): MediaId[] {
  return ['centrist', 'left', 'right'];
}

/**
 * 获取媒体名称（用于代码引用）
 */
export const MEDIA_NAMES: Record<MediaId, string> = {
  centrist: '中央时事新闻',
  left: '革新民报',
  right: '经合新闻',
} as const;
