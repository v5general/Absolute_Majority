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

  // flash 模型不支持 response_format，需要根据模型名称判断
  const useJSONFormat = options?.responseFormat !== undefined
    ? options.responseFormat !== null
    : !config.model.includes('flash');
  const responseFormat = options?.responseFormat !== undefined
    ? options.responseFormat
    : useJSONFormat ? { type: 'json_object' } : null;

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
      console.error(`[LLM] API error: ${response.status} ${response.statusText}`);
      console.error('[LLM] Error details:', errText);
      console.error('[LLM] Request body:', JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt.slice(0, 100) + '...' },
          { role: 'user', content: userPrompt.slice(0, 100) + '...' },
        ],
      }));
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
  console.log('[LLM] askLLMJSON called, options:', options);
  const raw = await askLLM(systemPrompt, userPrompt, options);
  console.log('[LLM] Raw response:', raw ? `(length: ${raw.length})` : 'null');

  if (!raw) {
    console.warn('[LLM] No raw response, using fallback');
    return fallback;
  }

  // 尝试 1: 直接解析
  try {
    const parsed = JSON.parse(raw) as T;
    console.log('[LLM] JSON parsed successfully (direct), keys:', Object.keys(parsed as any));
    return parsed;
  } catch (parseError) {
    console.log('[LLM] Direct parse failed, trying extraction methods...');
  }

  // 尝试 2: 去除 markdown 代码块标记
  let cleaned = raw.trim();
  // 去除 ```json 开头和 ``` 结尾
  cleaned = cleaned.replace(/^```json\s*/i, '');
  cleaned = cleaned.replace(/^```\s*/i, '');
  cleaned = cleaned.replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  if (cleaned !== raw) {
    console.log('[LLM] Removed markdown code blocks');
    try {
      const parsed = JSON.parse(cleaned) as T;
      console.log('[LLM] JSON parsed successfully (after markdown removal), keys:', Object.keys(parsed as any));
      return parsed;
    } catch (e) {
      console.log('[LLM] Still failed after markdown removal');
    }
  }

  // 尝试 3: 提取 JSON 对象或数组
  try {
    // 匹配完整的 JSON 对象或数组
    const objectMatch = cleaned.match(/\{[\s\S]*\}/);
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    const jsonMatch = objectMatch || arrayMatch;

    if (jsonMatch) {
      const extracted = jsonMatch[0];
      console.log('[LLM] Extracted JSON block, length:', extracted.length);

      // 尝试修复不完整的 JSON
      const repaired = attemptRepairJSON(extracted);
      if (repaired !== extracted) {
        console.log('[LLM] Attempted JSON repair');
      }

      const parsed = JSON.parse(repaired) as T;
      console.log('[LLM] JSON parsed successfully (extraction), keys:', Object.keys(parsed as any));
      return parsed;
    }
  } catch (repairError) {
    console.log('[LLM] Extraction/repair failed:', repairError);
  }

  // 尝试 4: 暴力提取并修复
  console.error('[LLM] All attempts failed, raw content preview:', raw.slice(0, 300));
  console.warn('[LLM] Using fallback');
  return fallback;
}

/**
 * 尝试修复不完整的 JSON
 */
function attemptRepairJSON(jsonStr: string): string {
  let repaired = jsonStr.trim();

  // 计算括号平衡
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // 补全缺失的闭合括号
  const missingBraces = openBraces - closeBraces;
  const missingBrackets = openBrackets - closeBrackets;

  if (missingBraces > 0) {
    repaired += '}'.repeat(missingBraces);
    console.log(`[LLM] Added ${missingBraces} closing braces`);
  }
  if (missingBrackets > 0) {
    repaired += ']'.repeat(missingBrackets);
    console.log(`[LLM] Added ${missingBrackets} closing brackets`);
  }

  // 尝试修复未终止的字符串（简单情况）
  // 如果最后一个字符是引号，检查字符串是否完整
  if (repaired.slice(-1) !== '"' && repaired.slice(-1) !== '}' && repaired.slice(-1) !== ']') {
    // 检查是否有未闭合的字符串
    const quotes = repaired.match(/"/g);
    if (quotes && quotes.length % 2 !== 0) {
      repaired += '"';
      console.log('[LLM] Added closing quote');
    }
  }

  return repaired;
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
    const requestBody: Record<string, unknown> = {
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.9,
      max_tokens: 1500,
    };

    // 只有非 flash 模型才尝试使用 response_format
    // flash 模型通常不支持 JSON 模式
    if (!config.model.includes('flash')) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(getChatUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[LLM] API error: ${response.status} ${response.statusText}`);
      console.error('[LLM] Error details:', errText);
      console.error('[LLM] Request body:', JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: systemPrompt.slice(0, 100) + '...' },
          { role: 'user', content: userPrompt.slice(0, 100) + '...' },
        ],
      }));
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
