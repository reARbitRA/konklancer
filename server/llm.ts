// SPEC-006: every LLM call goes through the Konkred gateway (OpenAI-compatible
// /v1/chat/completions). Konklancer holds one gateway key and no provider keys.
import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';

export type TaskType = 'general' | 'extraction' | 'summarization' | 'code-generation';

export type LLMErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_UNAVAILABLE'
  | 'AI_AUTH'
  | 'AI_RATE_LIMITED'
  | 'AI_UPSTREAM'
  | 'AI_BAD_RESPONSE';

export class LLMError extends Error {
  code: LLMErrorCode;
  status: number;
  constructor(code: LLMErrorCode, message: string, status: number) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
  }
}

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** A mock/simulator model means no live provider capacity. Never treat it as real output. */
export const isMockModel = (model: string) => model.trim().toLowerCase().startsWith('mock');

function retryDelayMs(res: Response): number {
  const header = res.headers.get('retry-after');
  const seconds = header !== null ? Number(header) : NaN;
  const ms = Number.isFinite(seconds) ? seconds * 1000 : 5000;
  return Math.min(60_000, Math.max(0, ms));
}

function readCache(file: string, ttlMs: number): LLMResult | null {
  try {
    const st = fs.statSync(file);
    if (Date.now() - st.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as LLMResult;
  } catch {
    return null;
  }
}

function writeCache(file: string, value: LLMResult) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(value));
  } catch (err) {
    console.warn('[llm] cache write failed:', (err as Error).message);
  }
}

export async function callLLM(
  req: LLMRequest,
  cfg: LLMConfig | null = readLLMConfig(),
  fetchImpl: typeof fetch = fetch,
): Promise<LLMResult> {
  if (!cfg) {
    throw new LLMError('AI_NOT_CONFIGURED', 'KONKRED_GATEWAY_URL و KONKRED_API_KEY تنظیم نشده‌اند.', 503);
  }

  const cacheFile = req.cacheKey ? path.join(cfg.cacheDir, `${sha256(req.cacheKey)}.json`) : null;
  if (cacheFile) {
    const hit = readCache(cacheFile, cfg.cacheTtlMs);
    if (hit) return { ...hit, cached: true };
  }

  const messages: { role: string; content: string }[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.prompt });

  const body = JSON.stringify({
    taskType: req.taskType,
    messages,
    max_tokens: req.maxTokens ?? 2048,
    temperature: req.temperature ?? 0.4,
    privacy: cfg.privacy,
  });

  const url = `${cfg.gatewayUrl}/v1/chat/completions`;
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` };

  // One attempt, plus one retry for 429 (after Retry-After) and 5xx / network errors.
  for (let attempt = 1; attempt <= 2; attempt++) {
    const last = attempt === 2;
    let res: Response;
    try {
      res = await fetchImpl(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(cfg.timeoutMs) });
    } catch (err) {
      if (!last) {
        await sleep(1000);
        continue;
      }
      throw new LLMError('AI_UPSTREAM', `gateway unreachable: ${(err as Error).message}`, 502);
    }

    if (res.status === 401 || res.status === 403) {
      throw new LLMError('AI_AUTH', 'gateway کلید KONKRED_API_KEY را نپذیرفت.', 502);
    }
    if (res.status === 429) {
      if (!last) {
        await sleep(retryDelayMs(res));
        continue;
      }
      throw new LLMError('AI_RATE_LIMITED', 'ظرفیت رایگان فعلاً پر است؛ بعداً دوباره تلاش کنید.', 429);
    }
    if (res.status >= 500) {
      if (!last) {
        await sleep(1000);
        continue;
      }
      throw new LLMError('AI_UPSTREAM', `gateway HTTP ${res.status}`, 502);
    }
    if (!res.ok) {
      throw new LLMError('AI_UPSTREAM', `gateway HTTP ${res.status}`, 502);
    }

    const data: any = await res.json().catch(() => null);
    const model = String(data?.model ?? '');
    if (isMockModel(model)) {
      throw new LLMError('AI_UNAVAILABLE', 'هیچ provider زنده‌ای در دسترس نیست (پاسخ شبیه‌ساز گیتوی).', 503);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      throw new LLMError('AI_BAD_RESPONSE', 'gateway پاسخ خالی برگرداند.', 502);
    }

    const result: LLMResult = { text, model, provider: model.split(':')[0] || 'unknown', cached: false };
    if (cacheFile) writeCache(cacheFile, result);
    return result;
  }
  throw new LLMError('AI_UPSTREAM', 'unreachable', 502);
}

/** Parse JSON from model output that may be fenced or have surrounding prose. */
export function parseJsonLoose<T = any>(text: string): T | null {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(t) as T;
  } catch {
    // fall through
  }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(t.slice(start, end + 1)) as T;
    } catch {
      return null;
    }
  }
  return null;
}
