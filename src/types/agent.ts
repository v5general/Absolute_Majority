/**
 * Agent 模拟系统类型定义
 *
 * 每个 Agent 代表一个政治角色（首相、党首、派系领袖、媒体、利益集团）。
 * Agent 通过 perceive → think → generateIntent 三步循环生成行动意图。
 * 意图经 Narrative Engine 转换为事件，玩家通过事件与 AI 角色互动。
 */

// ===== Agent 意图 =====

/** Agent 生成的行动意图 */
export interface AgentIntent {
  /** 行动者 ID：如 "agent:prime_minister" 或 "agent:party_leader:liberty" */
  actor_id: string;
  /** 意图类型：如 "coalition_proposal", "challenge_leader", "media_attack" */
  intent_type: string;
  /** 目标对象 ID（党派 ID / 议员名 / 法案 ID） */
  target_id: string;
  /** 优先级 1-10（调度器排序用，1 最高） */
  priority: number;
  /** AI 推理文本（用于剧情生成） */
  reasoning: string;
  /** 结构化数据载荷 */
  payload: Record<string, unknown>;
}

/** Agent 对局势的感知 */
export interface AgentPerception {
  /** 局势摘要 */
  summary: string;
  /** 关键因素 */
  key_factors: string[];
  /** 威胁列表 */
  threats: string[];
  /** 机会列表 */
  opportunities: string[];
}

// ===== Agent 角色 =====

/** Agent 角色类型 */
export type AgentRole =
  | 'prime_minister'     // 首相
  | 'party_leader'       // 党首
  | 'faction_leader'     // 派系领袖
  | 'media'              // 媒体
  | 'interest_group';    // 利益集团

/** Agent 配置 */
export interface AgentConfig {
  /** 角色类型 */
  role: AgentRole;
  /** 行动者 ID */
  actor_id: string;
  /** 所属党派（媒体/利益集团无党派） */
  partyId?: string;
  /** 角色 NPC 名 */
  personName?: string;
  /** 调度优先级（首相=1，最低） */
  priority: number;
}

// ===== 玩家角色 =====

/** 玩家角色配置 */
export interface PlayerConfig {
  /** 姓氏 */
  lastName: string;
  /** 名字 */
  firstName: string;
  /** 年龄（必须 >= 25，众议员年龄下限） */
  age: number;
  /** 性别 */
  gender: 'male' | 'female';
  /** 所属党派 ID */
  partyId: string;
  /** 简短背景 */
  background: string;
}

/** 获取玩家全名 */
export function getPlayerFullName(config: PlayerConfig): string {
  return `${config.lastName} ${config.firstName}`;
}

/** 获取正式称呼（姓氏+先生/女士） */
export function getPlayerFormalAddress(config: PlayerConfig): string {
  return `${config.lastName}${config.gender === 'male' ? '先生' : '女士'}`;
}

/** 获取议员称呼（姓氏+议员） */
export function getPlayerTitle(config: PlayerConfig): string {
  return `${config.lastName}议员`;
}
