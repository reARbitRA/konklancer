/**
 * SPEC-006 — کلاینت گیت‌وی کانکرد (سازگاری کامل با نسخه‌ی قبلی).
 *
 * از SPEC-008 به بعد، موتور مشترک در `server/aiEngine.ts` است و این فایل فقط یک
 * آداپتور برای مسیر گیت‌وی و API قدیمی `callLLM` است تا کدها/تست‌های قبلی
 * بدون تغییر کار کنند.
 */
import path from 'path';
import {
  chat,
  LLMError,
  parseJsonLoose,
  isMockModel,
  type ChatMessage,
  type ChatTarget,
  type TaskType,
} from './aiEngine';

export { LLMError, parseJsonLoose, isMockModel };
export type { TaskType };

export type LLMErrorCode = import('./aiEngine').LLMErrorCode;

export interface LLMConfig {
  gatewayUrl: string;
  apiKey: string;
  timeoutMs: number;
  privacy: 'private' | 'any';
  cacheDir: string;
  cacheTtlMs: number;
}

export interface LLMRequest {
  taskType: TaskType;
  prompt: string;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  /** When set, successful answers are cached on disk under sha256(cacheKey). */
  cacheKey?: string;
}

export interface LLMResult {
  text: string;
  model: string;
  provider: string;
  cached: boolean;
}

export function readLLMConfig(env: NodeJS.ProcessEnv = process.env): LLMConfig | null {
  const gatewayUrl = (env.KONKRED_GATEWAY_URL || '').trim().replace(/\/+$/, '');
  const apiKey = (env.KONKRED_API_KEY || '').trim();
  if (!gatewayUrl || !apiKey) return null;
  return {
    gatewayUrl,
    apiKey,
    timeoutMs: Number(env.KONKRED_TIMEOUT_MS) || 60_000,
    privacy: env.KONKRED_PRIVACY === 'private' ? 'private' : 'any',
    cacheDir: env.KONKRED_CACHE_DIR || path.join(process.cwd(), 'data', 'cache', 'llm'),
    cacheTtlMs: (Number(env.KONKRED_CACHE_TTL_HOURS) || 168) * 3600_000,
  };
}

export function gatewayTarget(cfg: LLMConfig): ChatTarget {
  return {
    id: 'env-gateway',
    kind: 'gateway',
    label: 'Konkred Gateway',
    baseUrl: cfg.gatewayUrl,
    apiKey: cfg.apiKey,
    gateway: true,
    privacy: cfg.privacy,
    models: { fast: '', strong: '' },
    jsonMode: false,
    timeoutMs: cfg.timeoutMs,
    cacheDir: cfg.cacheDir,
    cacheTtlMs: cfg.cacheTtlMs,
  };
}

export async function callLLM(
  req: LLMRequest,
  cfg: LLMConfig | null = readLLMConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<LLMResult> {
  if (!cfg) {
    throw new LLMError('AI_NOT_CONFIGURED', 'KONKRED_GATEWAY_URL و KONKRED_API_KEY تنظیم نشده‌اند.', 503);
  }
  const messages: ChatMessage[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.prompt });

  const result = await chat(
    {
      messages,
      taskType: req.taskType,
      modelTier: 'strong',
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      json: req.json,
      cacheKey: req.cacheKey,
    },
    { ...gatewayTarget(cfg), fetchImpl },
  );

  return {
    text: result.text,
    model: result.meta.model,
    provider: result.meta.provider,
    cached: result.meta.cached,
  };
}
