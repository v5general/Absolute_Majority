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

// ===== 移动端检测与超时配置 =====

/** 移动端通常网络更慢、浏览器并发连接数更少，需要更宽容的超时与串行执行。 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(max-width: 768px)').matches
    || /Android|iPhone|iPad|iPod|Mobile/i.test(typeof navigator !== 'undefined' ? navigator.userAgent : '');
}

/** 单次 LLM 请求超时（毫秒）。移动端给更长，避免慢网络下被中断。 */
const REQUEST_TIMEOUT_MS = isMobileDevice() ? 120_000 : 90_000;
/** 验证连接超时（短）。 */
const TEST_TIMEOUT_MS = 20_000;

/**
 * 带超时的 fetch：到达超时后 abort 请求，避免移动端浏览器隐式杀掉请求时
 * 出现"loading 永远不结束"的问题。
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  if (typeof AbortController === 'undefined') {
    // 极旧环境，退回普通 fetch
    return fetch(url, options);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 带重试的 fetch：仅在网络层错误（TypeError，通常是 CORS/连接失败/abort）
 * 时重试一次。HTTP 错误码（如 401/429/500）不重试，由上层处理。
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  retries = 1,
): Promise<Response> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeoutMs);
    } catch (err) {
      lastErr = err;
      // 仅在还有重试次数时继续；AbortError 也属于"网络问题"，可重试一次
      if (attempt >= retries) break;
      // 短暂退避后重试
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  throw lastErr;
}

/** 把网络错误转成可读描述（中文），用于日志/UI 提示。 */
function describeNetworkError(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return '请求超时（移动端网络较慢，可重试或切换到 Wi-Fi）';
  }
  if (err instanceof TypeError) {
    // fetch 抛 TypeError 通常是 CORS 拒绝、DNS 失败、连接被拒、混合内容
    return '网络/CORS 错误：可能是浏览器阻止了跨域请求，或 HTTPS 页面调用了 HTTP API';
  }
  return err instanceof Error ? err.message : String(err);
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

    const response = await fetchWithRetry(getChatUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
    }, REQUEST_TIMEOUT_MS);

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
    console.warn('[LLM] Request failed:', describeNetworkError(err));
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

    const response = await fetchWithRetry(getChatUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    }, REQUEST_TIMEOUT_MS);

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
    console.warn('[LLM] Text request failed:', describeNetworkError(err));
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
    const response = await fetchWithRetry(url, {
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
    }, TEST_TIMEOUT_MS);

    if (response.ok) {
      return { ok: true };
    }
    const errText = await response.text().catch(() => '');
    return { ok: false, error: `${response.status} ${response.statusText}: ${errText.slice(0, 200)}` };
  } catch (err: unknown) {
    return { ok: false, error: describeNetworkError(err) };
  }
}
