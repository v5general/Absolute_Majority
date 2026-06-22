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

/**
 * 浏览器控制台调试用：打印当前 LLM 配置和移动端检测结果。
 * 用户在 mobile 上可以直接在 console 调用 `debugLLMConfig()` 排查。
 */
export function debugLLMConfig(): void {
  const config = getConfig();
  const mobile = isMobileDevice();
  // 不打印完整 apiKey，只打印首尾几位以便确认
  const keyPreview = config.apiKey
    ? `${config.apiKey.slice(0, 6)}...${config.apiKey.slice(-4)} (length=${config.apiKey.length})`
    : '(empty)';
  console.log('===== LLM Debug =====');
  console.log('  baseUrl:', config.baseUrl || '(empty)');
  console.log('  apiKey:', keyPreview);
  console.log('  model:', config.model || '(empty)');
  console.log('  mobile:', mobile);
  console.log('  REQUEST_TIMEOUT_MS:', mobile ? 120_000 : 90_000);
  console.log('  chatUrl:', (() => {
    try {
      return getChatUrl();
    } catch (e) {
      return `error: ${(e as Error).message}`;
    }
  })());
  console.log('  localStorage llm_config:', (() => {
    try {
      const raw = localStorage.getItem('llm_config');
      return raw ? `(length=${raw.length})` : '(missing)';
    } catch {
      return '(localStorage not accessible)';
    }
  })());
  console.log('=====================');
}

// 暴露到 window 方便手机端控制台直接调用
if (typeof window !== 'undefined') {
  (window as unknown as { debugLLMConfig?: () => void }).debugLLMConfig = debugLLMConfig;
}

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

// ===== 流式响应支持 =====
//
// iOS Safari 等移动端浏览器对 fetch 有隐式超时（~60s），长 LLM 响应会被
// 静默杀掉。改用 stream:true 让服务端逐 token 推送，连接保持活跃，移动端
// 不会触发超时。所有主流 OpenAI 兼容服务商（DeepSeek/OpenAI/Kimi/Qwen/GLM/
// SiliconFlow）均支持 SSE 流式响应。

/** 解析单行 SSE chunk，返回 delta.content 累积字符串。 */
function parseSSEChunk(chunk: string): { content: string; done: boolean } {
  let content = '';
  let done = false;
  // SSE 以 `data: ` 开头，每行一条事件
  const lines = chunk.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === '') continue;
    if (payload === '[DONE]') { done = true; continue; }
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed?.choices?.[0]?.delta?.content;
      if (typeof delta === 'string' && delta.length > 0) content += delta;
    } catch {
      // 部分 chunk 可能跨行被截断，忽略解析失败
    }
  }
  return { content, done };
}

/**
 * 调用 chat completions 接口并返回完整文本内容。
 * - 优先使用 stream 模式（移动端友好）
 * - 若服务端不支持 stream 或返回普通 JSON，自动降级
 * - timeoutMs 仅作用于"拿到响应头"阶段；流式传输阶段不超时（避免误杀）
 */
async function callChatCompletion(
  url: string,
  body: Record<string, unknown>,
  config: LLMConfig,
  timeoutMs: number,
): Promise<string | null> {
  // 加上 stream:true，让服务端以 SSE 推送
  const streamBody = { ...body, stream: true };

  const response = await fetchWithRetry(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
      // 提示服务端走 SSE；多数代理会识别此头部
      'Accept': 'text/event-stream',
    },
    body: JSON.stringify(streamBody),
  }, timeoutMs);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${errText.slice(0, 200)}`);
  }

  // 检测响应类型：SSE 流 vs 普通 JSON
  const contentType = response.headers.get('content-type') || '';
  const isSSE = contentType.includes('text/event-stream');

  // 不支持流式：直接 JSON 解析
  if (!isSSE || !response.body) {
    const data = await response.json();
    return data?.choices?.[0]?.message?.content ?? null;
  }

  // 流式读取：移动端友好，连接持续活跃不会被超时杀掉
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let lastErr: unknown = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      // SSE 事件以空行分隔；为防止跨 chunk 截断，按行处理时保留最后未完整行
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const { content } = parseSSEChunk(line);
        if (content) fullContent += content;
      }
    }
    // 处理 buffer 中剩余内容
    if (buffer.length > 0) {
      const { content } = parseSSEChunk(buffer);
      if (content) fullContent += content;
    }
  } catch (err) {
    // 流被中断：保留已收到的部分内容，避免整段丢失
    lastErr = err;
    console.warn('[LLM] Stream interrupted, using partial content:', describeNetworkError(err));
  }

  if (fullContent.length > 0) return fullContent;
  // 没拿到任何内容，若有错则抛出便于上层重试
  if (lastErr) throw lastErr;
  return null;
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

    console.log(`[LLM] askLLM → ${getChatUrl()} (mobile=${isMobileDevice()}, stream=true, model=${config.model})`);
    const content = await callChatCompletion(getChatUrl(), body, config, REQUEST_TIMEOUT_MS);
    console.log('[LLM] Response:', content ? `(length: ${content.length})` : 'null');
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // HTTP 错误单独打印，方便定位（如 401/429/模型超 max_tokens）
    if (msg.startsWith('HTTP ')) {
      console.error('[LLM] API error:', msg);
    } else {
      console.warn('[LLM] Request failed:', describeNetworkError(err));
    }
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
 * 调用 LLM 获取自由文本回复（非 JSON）。
 * 用于角色创建时的政治目标、背景故事等纯文本生成。
 * 不发送 response_format: json_object —— DeepSeek/OpenAI 等服务商
 * 要求使用 json_object 时 prompt 必须包含 "json" 字样，否则返回 400。
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

    console.log(`[LLM] askLLMText → ${getChatUrl()} (mobile=${isMobileDevice()}, stream=true)`);
    const content = await callChatCompletion(getChatUrl(), requestBody, config, REQUEST_TIMEOUT_MS);
    return content;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith('HTTP ')) {
      console.error('[LLM] API error:', msg);
    } else {
      console.warn('[LLM] Text request failed:', describeNetworkError(err));
    }
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
