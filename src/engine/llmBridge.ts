/**
 * LLM 调用桥接层
 *
 * 支持任何 OpenAI 兼容 API（DeepSeek、OpenAI、Kimi、通义千问等）。
 * 用户在界面配置 Base URL + API Key + 模型名。
 *
 * 双层架构：
 * - 规则 fallback（必须）：纯本地，保证游戏可运行
 * - LLM 增强（可选）：更丰富的推理和更合理的决策
 */

// ===== 默认配置 =====

const DEFAULT_BASE_URL = '';
const DEFAULT_API_KEY = '';
const DEFAULT_MODEL = 'deepseek-chat';

// ===== 存储层 =====

interface LLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// 旧版本的硬编码 key，用于迁移时清除
const OLD_HARDCODED_KEYS = [
  'sk-5ac2b7572d3f472cbc2d0cc99fea997',
];

function loadConfig(): LLMConfig {
  try {
    // 清除旧版 localStorage key
    localStorage.removeItem('llm_api_key');

    const saved = localStorage.getItem('llm_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      // 如果 apiKey 是旧的硬编码值，清掉
      if (OLD_HARDCODED_KEYS.includes(parsed.apiKey)) {
        localStorage.removeItem('llm_config');
        return { baseUrl: DEFAULT_BASE_URL, apiKey: DEFAULT_API_KEY, model: DEFAULT_MODEL };
      }
      return {
        baseUrl: parsed.baseUrl || DEFAULT_BASE_URL,
        apiKey: parsed.apiKey || DEFAULT_API_KEY,
        model: parsed.model || DEFAULT_MODEL,
      };
    }
  } catch { /* ignore */ }
  return { baseUrl: DEFAULT_BASE_URL, apiKey: DEFAULT_API_KEY, model: DEFAULT_MODEL };
}

function saveConfig(config: LLMConfig): void {
  try { localStorage.setItem('llm_config', JSON.stringify(config)); } catch { /* ignore */ }
}

let cachedConfig: LLMConfig | null = null;

function getConfig(): LLMConfig {
  if (!cachedConfig) cachedConfig = loadConfig();
  return cachedConfig;
}

// ===== 公开 API =====

/** 获取当前配置 */
export function getLLMConfig(): LLMConfig {
  return getConfig();
}

/** 设置完整配置 */
export function setLLMConfig(config: Partial<LLMConfig>): void {
  const current = getConfig();
  cachedConfig = { ...current, ...config };
  saveConfig(cachedConfig);
}

/** 以下是旧 API 兼容封装 */
export function setLLMApiKey(key: string): void { setLLMConfig({ apiKey: key }); }
export function getLLMApiKey(): string | null { return getConfig().apiKey; }
export function isLLMAvailable(): boolean { return !!getConfig().apiKey && !!getConfig().baseUrl; }

// ===== 核心 fetch =====

/** 构建完整的 chat completions URL */
function getChatUrl(): string {
  const base = getConfig().baseUrl.replace(/\/+$/, '');
  if (base.endsWith('/chat/completions')) return base;
  if (base.endsWith('/v1')) return `${base}/chat/completions`;
  if (base.endsWith('/v1/')) return `${base}chat/completions`;
  // 用户可能直接给了 https://api.xxx.com 不带 /v1
  return `${base}/v1/chat/completions`;
}

/** LLM 调用选项 */
export interface LLMOptions {
  maxTokens?: number;
  temperature?: number;
  /** 设为 null 可禁用 response_format */
  responseFormat?: { type: string } | null;
}

/**
 * 调用 LLM（异步）
 */
export async function askLLM(
  systemPrompt: string,
  userPrompt: string,
  options?: LLMOptions,
): Promise<string | null> {
  const config = getConfig();
  if (!config.apiKey || !config.baseUrl) return null;

  const maxTokens = options?.maxTokens ?? 2048;
  const temperature = options?.temperature ?? 0.8;
  const responseFormat = options?.responseFormat !== undefined
    ? options.responseFormat
    : { type: 'json_object' };

  try {
    const body: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: maxTokens,
    };
    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const response = await fetch(getChatUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.warn(`[LLM] API error: ${response.status} ${response.statusText}`, errText);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn('[LLM] Request failed:', err);
    return null;
  }
}

/**
 * 调用 LLM 并解析 JSON 响应
 */
export async function askLLMJSON<T>(
  systemPrompt: string,
  userPrompt: string,
  fallback: T,
  options?: LLMOptions,
): Promise<T> {
  const raw = await askLLM(systemPrompt, userPrompt, options);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]) as T;
    } catch { /* ignore */ }
    return fallback;
  }
}

/**
 * 调用 LLM 获取自由文本回复（JSON 格式）
 */
export async function askLLMText(
  systemPrompt: string,
  userPrompt: string,
): Promise<string | null> {
  const config = getConfig();
  if (!config.apiKey || !config.baseUrl) return null;

  try {
    const response = await fetch(getChatUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.9,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      console.warn(`[LLM] API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? null;
  } catch (err) {
    console.warn('[LLM] Text request failed:', err);
    return null;
  }
}

/**
 * 测试 API 连通性
 * @returns 'ok' | 'fail' | 错误信息
 */
export async function testLLMConnection(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<{ ok: boolean; error?: string }> {
  let url = baseUrl.replace(/\/+$/, '');
  if (url.endsWith('/chat/completions')) { /* keep */ }
  else if (url.endsWith('/v1') || url.endsWith('/v1/')) { url = url.replace(/\/+$/, '') + '/chat/completions'; }
  else { url = url + '/v1/chat/completions'; }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: '回复OK' }],
        max_tokens: 5,
      }),
    });

    if (response.ok) {
      return { ok: true };
    }
    const errText = await response.text().catch(() => '');
    return { ok: false, error: `${response.status} ${response.statusText}: ${errText.slice(0, 200)}` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}
