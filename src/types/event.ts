/** 事件选择的效果 */
export interface ChoiceEffect {
  /** 对支持率的影响 partyId -> delta */
  supportDelta?: Record<string, number>;
  /** 对资金的影响 partyId -> delta */
  fundsDelta?: Record<string, number>;
  /** 对关系的影响 `${from}>${to}` -> delta */
  relationDelta?: Record<string, number>;
  /** 对大盘指标的影响 */
  metricsDelta?: {
    economicIndex?: number;
    socialStabilityIndex?: number;
    mediaAttention?: number;
    turnoutRate?: number;
    swingVoterRatio?: number;
  };
}

/** 事件中的一个选项 */
export interface EventChoice {
  id: string;
  text: string;
  /** 选项后的追加旁白 */
  consequence?: string;
  effects: ChoiceEffect;
}

/** 事件中的一个对话段落 */
export interface DialogSegment {
  /** 说话者 partyId，null 表示旁白/系统 */
  speaker: string | null;
  /** 对话内容 */
  text: string;
}

/** 自由文本交互配置 */
export interface FreeTextConfig {
  /** 场景描述（给 LLM 用的提示） */
  scenePrompt: string;
  /** 对话方 speaker partyId */
  speakerId: string | null;
  /** 输入框占位文字 */
  placeholder: string;
}

/** AI 对玩家自由文本的回应 */
export interface FreeTextResponse {
  /** AI 角色的回应文本 */
  reply: string;
  /** 旁白描述 */
  narration: string;
  /** 根据玩家发言评估的效果 */
  effects: ChoiceEffect;
}

/** 完整的政治事件 */
export interface PoliticalEvent {
  id: string;
  /** 事件标题 */
  title: string;
  /** 背景描述（简短） */
  summary: string;
  /** 对话序列 */
  dialogs: DialogSegment[];
  /** 固定选项（投票等正式场合） */
  choices: EventChoice[];
  /** 自由文本交互（对话、演讲等灵活场景） */
  freeText?: FreeTextConfig;
  /** 触发该事件的来源 partyId（可选） */
  sourceParty?: string;
  /** 事件严重度 1-5 */
  severity: number;
  /** 事件类型标识 */
  intentType?: string;
}

/** 游戏中的事件实例（包含状态） */
export interface ActiveEvent {
  event: PoliticalEvent;
  /** 当前显示到第几段对话 */
  currentDialogIndex: number;
  /** 是否正在打字 */
  isTyping: boolean;
  /** 是否显示选项 */
  showChoices: boolean;
  /** 玩家是否已做出选择 */
  resolved: boolean;
  /** 玩家选择的选项ID */
  chosenId?: string;
  /** 自由文本回应（LLM 返回） */
  freeTextResponse?: FreeTextResponse;
  /** 是否正在等待 LLM 回应自由文本 */
  isWaitingFreeText?: boolean;
}

/** Agent 推演日志条目 */
export interface ThinkingLogEntry {
  /** Agent 角色 */
  role: string;
  /** Agent 名称 */
  name: string;
  /** Agent 的思考/推理 */
  reasoning: string;
  /** 采取的行动 */
  action: string;
  /** 时间戳 */
  timestamp: number;
}
