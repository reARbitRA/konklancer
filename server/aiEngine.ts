/**
 * SPEC-008 — موتور واحد تماس با مدل‌های زبانی.
 *
 * همه‌ی providerهای سازگار با OpenAI از همین موتور استفاده می‌کنند:
 *  - چت معمولی (JSON mode اختیاری)
 *  - استریم SSE واقعی (توکن‌به‌توکن)
 *  - تلاش مجدد هوشمند (429 با Retry-After، 5xx، شبکه، سازگاری بدنه)
 *  - کش دیسکی با TTL
 *  - کشف مدل و انتخاب خودکار fast/strong
 *  - گارد پاسخ شبیه‌ساز گیت‌وی (`mock:*`)
 *
 * هیچ کلید یا متن promptی لاگ نمی‌شود.
 */
const getBuiltin = <T = any>(name: string): T | null => {
  try {
    const proc = (globalThis as any).process;
    if (proc && typeof proc.getBuiltinModule === 'function') {
      return proc.getBuiltinModule(name) as T;
    }
  } catch {
    /* محیط مرورگر / وب‌ویو */
  }
  return null;
};

const nodeCrypto = getBuiltin<typeof import('crypto')>('crypto');
const nodeFs = getBuiltin<typeof import('fs')>('fs');
const nodePath = getBuiltin<typeof import('path')>('path');
import { pickModels } from '../shared/aiProviders';

export type TaskType = 'general' | 'extraction' | 'summarization' | 'code-generation' | 'proposal';

export type LLMErrorCode =
  | 'AI_NOT_CONFIGURED'
  | 'AI_UNAVAILABLE'
  | 'AI_AUTH'
  | 'AI_RATE_LIMITED'
  | 'AI_UPSTREAM'
  | 'AI_BAD_RESPONSE'
  | 'AI_BAD_REQUEST'
  | 'AI_MODEL_NOT_FOUND'
  | 'AI_MODELS_UNSUPPORTED'
  | 'AI_MODEL_NOT_CONFIGURED'
  | 'AI_TIMEOUT'
  | 'AI_ABORTED';

export class LLMError extends Error {
  code: LLMErrorCode;
  status: number;
  detail?: string;
  retryAfterSec?: number;
  constructor(code: LLMErrorCode, message: string, status: number, detail?: string, retryAfterSec?: number) {
    super(message);
    this.name = 'LLMError';
    this.code = code;
    this.status = status;
    this.detail = detail;
    this.retryAfterSec = retryAfterSec;
  }
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  taskType?: TaskType;
  /** fast برای دسته‌بندی/استخراج، strong برای تحلیل/پروپوزال/کد */
  modelTier?: 'fast' | 'strong';
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  /** کلید کش؛ اگر تکرار شود، بدون تماس با provider پاسخ می‌دهد. */
  cacheKey?: string;
  noCache?: boolean;
  /** فقط پاسخی کش می‌شود که این تابع تأیید کند (مثلاً JSON معتبر). */
  cacheValidate?: (text: string) => boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ChatTarget {
  id: string;
  kind: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  /** gateway کانکرد: taskType/privacy در بدنه و گارد mock */
  gateway?: boolean;
  privacy?: 'any' | 'private';
  models: { fast: string; strong: string };
  jsonMode?: boolean;
  /** دمای پیش‌فرض provider (تنظیمات UI) */
  temperature?: number;
  headers?: Record<string, string>;
  timeoutMs: number;
  cacheDir: string;
  cacheTtlMs: number;
  fetchImpl?: typeof fetch;
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatMeta {
  model: string;
  provider: string;
  cached: boolean;
  latencyMs: number;
  attempts: number;
  streamed: boolean;
  usage?: ChatUsage;
}

export interface ChatResult {
  text: string;
  meta: ChatMeta;
}

export type DeltaHandler = (delta: string, info: { model: string }) => void;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sha256 = (value: string): string => {
  if (nodeCrypto) return nodeCrypto.createHash('sha256').update(value).digest('hex');
  let h1 = 0xdeadbeef ^ value.length;
  let h2 = 0x41c6ce57 ^ value.length;
  for (let i = 0; i < value.length; i++) {
    const ch = value.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
};

export const isMockModel = (model: string) => model.trim().toLowerCase().startsWith('mock');

const DEFAULT_CACHE_TTL_MS = 168 * 3600_000;
const MODEL_CACHE_TTL_MS = 10 * 60_000;

const providerOf = (model: string, fallback: string): string => {
  const clean = String(model || '').trim();
  return clean.includes(':') ? clean.split(':')[0] : fallback;
};

/** خواندن Retry-After به секунده، با سقف ۶۰ ثانیه (SPEC-006 R5). */
function retryDelayMs(res: Response): number {
  const header = res.headers.get('retry-after');
  let seconds = header !== null ? Number(header) : NaN;
  if (!Number.isFinite(seconds)) {
    try {
      seconds = Number(res.headers.get('x-ratelimit-reset-requests')?.replace(/s$/, ''));
    } catch {
      seconds = NaN;
    }
  }
  const ms = Number.isFinite(seconds) ? seconds * 1000 : 4000;
  return Math.min(60_000, Math.max(0, ms));
}

function cacheFileFor(target: ChatTarget, cacheKey: string, model: string): string {
  const hash = sha256(`${target.id}|${model}|${cacheKey}`);
  if (nodePath && target.cacheDir) {
    return nodePath.join(target.cacheDir, `${hash}.json`);
  }
  return `konklancer_llm_cache_${hash}`;
}

interface CacheEntry {
  text: string;
  model: string;
  provider: string;
  createdAt: string;
  storedAtMs?: number;
}

const browserCache = new Map<string, CacheEntry>();

function readCache(file: string, ttlMs: number): CacheEntry | null {
  if (!nodeFs) {
    const mem = browserCache.get(file);
    if (!mem) return null;
    if (Date.now() - (mem.storedAtMs ?? 0) > ttlMs) {
      browserCache.delete(file);
      return null;
    }
    return mem;
  }
  try {
    const stat = nodeFs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(nodeFs.readFileSync(file, 'utf8')) as CacheEntry;
  } catch {
    return null;
  }
}

function writeCache(file: string, value: CacheEntry) {
  if (!nodeFs || !nodePath) {
    browserCache.set(file, { ...value, storedAtMs: Date.now() });
    return;
  }
  try {
    nodeFs.mkdirSync(nodePath.dirname(file), { recursive: true });
    nodeFs.writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
  } catch (error) {
    console.warn('[ai] cache write failed:', (error as Error).message);
  }
}

/** خطای شبکه/abort را به کد امن و قابل‌نمایش تبدیل می‌کند. */
function networkError(error: unknown, timeoutMs: number): LLMError {
  const err = error as any;
  if (err?.name === 'AbortError' || err?.name === 'TimeoutError' || err?.code === 'ABORT_ERR') {
    const timedOutMessage =
      err?.name === 'TimeoutError'
        ? `پاسخ provider در ${Math.round(timeoutMs / 1000)} ثانیه نرسید (timeout).`
        : 'درخواست لغو شد.';
    return new LLMError(err?.name === 'TimeoutError' ? 'AI_TIMEOUT' : 'AI_ABORTED', timedOutMessage, 504);
  }
  const causeCode = String(err?.code ?? err?.cause?.code ?? '');
  const hint =
    causeCode === 'ECONNREFUSED'
      ? 'اتصال رد شد (ECONNREFUSED). اگر provider محلی است، مطمئن شوید سرور روی همین آدرس/پورت در حال اجراست.'
      : causeCode === 'ENOTFOUND' || causeCode === 'EAI_AGAIN'
        ? 'آدرس provider پیدا نشد؛ اتصال شبکه/DNS یا صحت Base URL را بررسی کنید.'
        : causeCode === 'UND_ERR_CONNECT_TIMEOUT'
          ? 'زمان اتصال به provider تمام شد؛ آدرس و شبکه را بررسی کنید.'
          : /CERT|TLS|SELF_SIGNED/i.test(causeCode)
            ? 'گواهی TLS پذیرفته نشد؛ آدرس https یا گواهی سرور محلی را بررسی کنید.'
            : '';
  const base = `اتصال به provider برقرار نشد: ${err?.message ?? error}`;
  return new LLMError('AI_UPSTREAM', hint ? `${base} — ${hint}` : base, 502, causeCode || undefined);
}

/**
 * آدرس endpoint. برای گیت‌وی Konkred اگر base نسخه نداشته باشد `/v1` اضافه می‌شود
 * (endpoint گیت‌وی `/v1/chat/completions` است). برای بقیه، base همان‌طور که کاربر
 * وارد کرده استفاده می‌شود.
 */
function endpointUrl(baseUrl: string, path: string, gateway = false): string {
  const base = (baseUrl || '').replace(/\/+$/, '');
  const hasVersion = /\/v\d+[a-z]*$/i.test(base);
  return `${base}${gateway && !hasVersion ? '/v1' : ''}${path}`;
}

function authHeaders(target: ChatTarget): Record<string, string> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (target.apiKey) headers.authorization = `Bearer ${target.apiKey}`;
  return { ...headers, ...(target.headers ?? {}) };
}

function errorMessageFromBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    const message = parsed?.error?.message ?? parsed?.message ?? parsed?.error;
    if (typeof message === 'string') return message;
  } catch {
    /* متن خام */
  }
  return raw.slice(0, 300);
}

function statusToError(status: number, raw: string, model: string): LLMError {
  const detail = errorMessageFromBody(raw).trim();
  const lower = detail.toLowerCase();
  if (status === 401 || status === 403) {
    return new LLMError('AI_AUTH', 'کلید API پذیرفته نشد. کلید و دسترسی آن را بررسی کنید.', 502, detail);
  }
  if (status === 404) {
    if (lower.includes('model') || model) {
      return new LLMError(
        'AI_MODEL_NOT_FOUND',
        `مدل «${model || 'انتخاب‌شده'}» در این provider پیدا نشد. نام مدل را از فهرست مدل‌ها انتخاب کنید.`,
        502,
        detail,
      );
    }
    return new LLMError('AI_UPSTREAM', 'مسیر درخواست در provider پیدا نشد (404). آدرس پایه را بررسی کنید.', 502, detail);
  }
  if (status === 429) {
    return new LLMError('AI_RATE_LIMITED', 'ظرفیت/سهمیه‌ی این provider فعلاً پر است؛ کمی بعد دوباره تلاش کنید.', 429, detail);
  }
  if (status === 408 || status === 504) {
    return new LLMError('AI_TIMEOUT', 'provider پاسخ را دیر فرستاد (timeout).', 504, detail);
  }
  if (status >= 500) {
    return new LLMError('AI_UPSTREAM', `provider خطای ${status} داد؛ دوباره تلاش کنید.`, 502, detail);
  }
  if (lower.includes('context') && (lower.includes('length') || lower.includes('token'))) {
    return new LLMError('AI_BAD_REQUEST', 'متن ورودی از پنجره‌ی زمینه‌ی مدل بلندتر است؛ توضیحات پروژه را کوتاه‌تر کنید.', 400, detail);
  }
  return new LLMError('AI_BAD_REQUEST', `provider درخواست را رد کرد (HTTP ${status}).`, 400, detail);
}

/* ------------------------------------------------------------------ */
/* کشف مدل                                                             */
/* ------------------------------------------------------------------ */

const modelCache = new Map<string, { at: number; models: string[] }>();

export interface ModelsResult {
  models: string[];
  recommended: { fast: string; strong: string };
}

/**
 * فهرست مدل‌های provider را از `/models` می‌خواند.
 * اگر provider این مسیر را نداشته باشد AI_MODELS_UNSUPPORTED برمی‌گردد تا UI
 * از کاربر بخواهد نام مدل را دستی وارد کند.
 */
export async function listModelsForTarget(
  target: Pick<ChatTarget, 'baseUrl' | 'apiKey' | 'headers' | 'fetchImpl' | 'timeoutMs' | 'kind'> & { gateway?: boolean },
): Promise<ModelsResult> {
  const baseUrl = (target.baseUrl || '').trim().replace(/\/+$/, '');
  const key = `${baseUrl}|${sha256(target.apiKey || '')}`;
  const cached = modelCache.get(key);
  if (cached && Date.now() - cached.at < MODEL_CACHE_TTL_MS) {
    return { models: cached.models, recommended: pickModels(cached.models) };
  }

  const fetchImpl = target.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await fetchImpl(endpointUrl(baseUrl, '/models', Boolean(target.gateway)), {
      method: 'GET',
      headers: authHeaders({ ...target, baseUrl } as ChatTarget),
      signal: AbortSignal.timeout(Math.min(target.timeoutMs || 20_000, 20_000)),
    });
  } catch (error) {
    throw networkError(error, target.timeoutMs);
  }

  if (res.status === 401 || res.status === 403) {
    throw statusToError(res.status, await res.text().catch(() => ''), '');
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => '');
    throw new LLMError(
      res.status === 404 ? 'AI_MODELS_UNSUPPORTED' : 'AI_UPSTREAM',
      res.status === 404
        ? 'این provider فهرست مدل‌ها را ارائه نمی‌دهد؛ نام مدل را دستی وارد کنید.'
        : `دریافت فهرست مدل‌ها ناموفق بود (HTTP ${res.status}).`,
      502,
      errorMessageFromBody(raw),
    );
  }

  const data: any = await res.json().catch(() => null);
  const rows: any[] = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
  const models = Array.from(
    new Set(
      rows
        .map((row) => (typeof row === 'string' ? row : row?.id ?? row?.name ?? row?.model))
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim()),
    ),
  ).sort((a, b) => a.localeCompare(b));

  if (models.length === 0) {
    throw new LLMError('AI_MODELS_UNSUPPORTED', 'provider فهرست مدلی برنگرداند؛ نام مدل را دستی وارد کنید.', 502);
  }

  modelCache.set(key, { at: Date.now(), models });
  return { models, recommended: pickModels(models) };
}

/** برای تست‌ها و بعد از تغییر تنظیمات. */
export function clearModelCache() {
  modelCache.clear();
}

async function resolveModel(target: ChatTarget, tier: 'fast' | 'strong'): Promise<string> {
  const configured = (target.models?.[tier] || '').trim();
  if (configured) return configured;
  if (target.gateway) return ''; // گیت‌وی خودش مدل را بر اساس taskType انتخاب می‌کند
  const discovered = await listModelsForTarget(target);
  const model = discovered.recommended[tier] || discovered.recommended.fast;
  if (!model) {
    throw new LLMError('AI_MODEL_NOT_CONFIGURED', 'هیچ مدل چتی در این provider پیدا نشد؛ نام مدل را دستی تنظیم کنید.', 503);
  }
  return model;
}

/* ------------------------------------------------------------------ */
/* ساخت بدنه و تلاش مجدد                                               */
/* ------------------------------------------------------------------ */

interface BodyVariant {
  label: string;
  body: Record<string, any>;
}

function buildBodyVariants(params: {
  target: ChatTarget;
  request: ChatRequest;
  model: string;
  stream: boolean;
}): BodyVariant[] {
  const { target, request, model, stream } = params;
  const base: Record<string, any> = {
    messages: request.messages,
    temperature: request.temperature ?? target.temperature ?? 0.35,
  };
  if (model) base.model = model;
  if (request.maxTokens && request.maxTokens > 0) base.max_tokens = Math.floor(request.maxTokens);
  if (stream) base.stream = true;
  const wantsJson = Boolean(request.json) && target.jsonMode !== false;
  if (wantsJson) base.response_format = { type: 'json_object' };
  if (target.gateway) {
    base.taskType = request.taskType ?? 'general';
    base.privacy = target.privacy ?? 'any';
    // گیت‌وی برای انتخاب مدل به taskType نیاز دارد؛ نام مدل هاردکد نمی‌کنیم.
    if (!base.model) delete base.model;
  }

  const variants: BodyVariant[] = [{ label: 'base', body: { ...base } }];
  if (wantsJson) {
    const withoutJson = { ...base };
    delete withoutJson.response_format;
    variants.push({ label: 'no-response-format', body: withoutJson });
  }
  if (base.max_tokens) {
    const noMax: Record<string, any> = { ...base };
    delete noMax.max_tokens;
    variants.push({ label: 'no-max-tokens', body: noMax });
    const completionTokens: Record<string, any> = { ...base, max_completion_tokens: base.max_tokens };
    delete completionTokens.max_tokens;
    variants.push({ label: 'max-completion-tokens', body: completionTokens });

    if (wantsJson) {
      const both: Record<string, any> = { ...base, max_completion_tokens: base.max_tokens };
      delete both.max_tokens;
      delete both.response_format;
      variants.push({ label: 'completion-tokens-no-response-format', body: both });
    }
  }
  return variants;
}

function isBadRequestFallbackWorthy(status: number, raw: string): boolean {
  if (status !== 400) return false;
  const lower = raw.toLowerCase();
  return (
    lower.includes('response_format') ||
    lower.includes('json') ||
    lower.includes('max_tokens') ||
    lower.includes('max_completion_tokens') ||
    lower.includes('unsupported') ||
    lower.includes('unrecognized') ||
    lower.includes('not supported')
  );
}

function usageFrom(data: any): ChatUsage | undefined {
  const usage = data?.usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens);
  const totalTokens = Number(usage.total_tokens ?? (promptTokens + completionTokens));
  const result: ChatUsage = {};
  if (Number.isFinite(promptTokens)) result.promptTokens = promptTokens;
  if (Number.isFinite(completionTokens)) result.completionTokens = completionTokens;
  if (Number.isFinite(totalTokens)) result.totalTokens = totalTokens;
  return Object.keys(result).length > 0 ? result : undefined;
}

function contentFromCompletion(data: any): string {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part === 'string' ? part : part?.text ?? ''))
      .join('');
  }
  const alt = data?.choices?.[0]?.text;
  return typeof alt === 'string' ? alt : '';
}

/* ------------------------------------------------------------------ */
/* چت غیر استریم                                                       */
/* ------------------------------------------------------------------ */

export interface ChatOptions {
  /** تعداد تلاش کل برای خطاهای گذرا (پیش‌فرض ۲). */
  attempts?: number;
}

export async function chat(request: ChatRequest, target: ChatTarget, options: ChatOptions = {}): Promise<ChatResult> {
  const started = Date.now();
  const fetchImpl = target.fetchImpl ?? fetch;
  const model = await resolveModel(target, request.modelTier ?? 'strong');
  const timeoutMs = request.timeoutMs ?? target.timeoutMs;

  const cacheFile = request.cacheKey && !request.noCache ? cacheFileFor(target, request.cacheKey, model) : null;
  if (cacheFile) {
    const hit = readCache(cacheFile, target.cacheTtlMs);
    if (hit && (!request.cacheValidate || request.cacheValidate(hit.text))) {
      return {
        text: hit.text,
        meta: {
          model: hit.model,
          provider: hit.provider,
          cached: true,
          latencyMs: Date.now() - started,
          attempts: 0,
          streamed: false,
        },
      };
    }
  }

  const url = endpointUrl(target.baseUrl, '/chat/completions', target.gateway);
  const headers = authHeaders(target);
  const variants = buildBodyVariants({ target, request, model, stream: false });
  const maxAttempts = Math.max(1, options.attempts ?? 2);
  let attempts = 0;
  let lastError: LLMError | null = null;
  let variantIndex = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const variant = variants[variantIndex];
    const body = JSON.stringify(variant.body);
    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body,
        signal: request.signal
          ? AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)])
          : AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const mapped = networkError(error, timeoutMs);
      if (mapped.code === 'AI_ABORTED') throw mapped;
      lastError = mapped;
      if (attempt < maxAttempts) {
        await sleep(700 * attempt);
        continue;
      }
      throw mapped;
    }

    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      const mapped = statusToError(res.status, raw, model || '');
      lastError = mapped;
      if (isBadRequestFallbackWorthy(res.status, raw) && variantIndex < variants.length - 1) {
        variantIndex++;
        attempt--; // تلاش compatibility جدا از سهمیه‌ی retry است
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
        await sleep(res.status === 429 ? retryDelayMs(res) : 700 * attempt);
        continue;
      }
      throw mapped;
    }

    const data: any = await res.json().catch(() => null);
    if (!data) throw new LLMError('AI_BAD_RESPONSE', 'پاسخ provider JSON معتبر نبود.', 502);
    const returnedModel = String(data.model ?? model ?? '');
    if (target.gateway && isMockModel(returnedModel)) {
      throw new LLMError('AI_UNAVAILABLE', 'هیچ provider زنده‌ای در دسترس نیست (پاسخ شبیه‌ساز گیت‌وی).', 503);
    }
    const text = contentFromCompletion(data);
    if (!text.trim()) {
      throw new LLMError('AI_BAD_RESPONSE', 'provider پاسخ خالی برگرداند.', 502);
    }

    const result: ChatResult = {
      text,
      meta: {
        model: returnedModel || model,
        provider: providerOf(returnedModel, target.kind),
        cached: false,
        latencyMs: Date.now() - started,
        attempts,
        streamed: false,
        usage: usageFrom(data),
      },
    };
    if (cacheFile && (!request.cacheValidate || request.cacheValidate(text))) {
      writeCache(cacheFile, {
        text,
        model: result.meta.model,
        provider: result.meta.provider,
        createdAt: new Date().toISOString(),
      });
    }
    return result;
  }

  throw lastError ?? new LLMError('AI_UPSTREAM', 'درخواست به provider ناموفق بود.', 502);
}

/* ------------------------------------------------------------------ */
/* استریم واقعی                                                        */
/* ------------------------------------------------------------------ */

function parseSSEData(raw: string): string[] {
  const out: string[] = [];
  for (const block of raw.split(/\r?\n\r?\n/)) {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
      .trim();
    if (data) out.push(data);
  }
  return out;
}

/**
 * چت استریم. برای گیت‌وی (که ممکن است استریم را پشتیبانی نکند) به‌صورت امن
 * پاسخ کامل گرفته و یک‌باره تحویل می‌شود تا هرگز متن شبیه‌ساز نشت نکند.
 */
export async function chatStream(
  request: ChatRequest,
  target: ChatTarget,
  onDelta: DeltaHandler,
): Promise<ChatResult> {
  if (target.gateway) {
    const result = await chat(request, target, { attempts: 2 });
    if (result.text) onDelta(result.text, { model: result.meta.model });
    return { ...result, meta: { ...result.meta, streamed: false } };
  }

  const started = Date.now();
  const fetchImpl = target.fetchImpl ?? fetch;
  const model = await resolveModel(target, request.modelTier ?? 'strong');
  const timeoutMs = request.timeoutMs ?? target.timeoutMs;

  const cacheFile = request.cacheKey && !request.noCache ? cacheFileFor(target, request.cacheKey, model) : null;
  if (cacheFile) {
    const hit = readCache(cacheFile, target.cacheTtlMs);
    if (hit && (!request.cacheValidate || request.cacheValidate(hit.text))) {
      onDelta(hit.text, { model: hit.model });
      return {
        text: hit.text,
        meta: {
          model: hit.model,
          provider: hit.provider,
          cached: true,
          latencyMs: Date.now() - started,
          attempts: 0,
          streamed: true,
        },
      };
    }
  }

  const url = endpointUrl(target.baseUrl, '/chat/completions', target.gateway);
  const headers = authHeaders(target);
  const variants = buildBodyVariants({ target, request, model, stream: true });
  const maxAttempts = 2;
  let attempts = 0;
  let variantIndex = 0;
  let lastError: LLMError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    const variant = variants[variantIndex];
    const controller = new AbortController();
    let idleTimer: NodeJS.Timeout | null = null;
    const resetIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => controller.abort(new Error('idle-timeout')), Math.max(30_000, timeoutMs));
    };
    const onAbort = () => controller.abort(new Error('client-abort'));
    request.signal?.addEventListener('abort', onAbort, { once: true });
    resetIdle();

    let emitted = false;
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(variant.body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const raw = await res.text().catch(() => '');
        const mapped = statusToError(res.status, raw, model || '');
        lastError = mapped;
        if (isBadRequestFallbackWorthy(res.status, raw) && variantIndex < variants.length - 1) {
          variantIndex++;
          attempt--;
          continue;
        }
        if ((res.status === 429 || res.status >= 500) && attempt < maxAttempts) {
          await sleep(res.status === 429 ? retryDelayMs(res) : 700 * attempt);
          continue;
        }
        throw mapped;
      }

      const contentType = (res.headers.get('content-type') || '').toLowerCase();
      if (!contentType.includes('text/event-stream') || !res.body) {
        // بعضی providerها/پروکسی‌ها استریم را نادیده می‌گیرند و JSON کامل می‌فرستند.
        const data: any = await res.json().catch(() => null);
        const returnedModel = String(data?.model ?? model ?? '');
        if (target.gateway && isMockModel(returnedModel)) {
          throw new LLMError('AI_UNAVAILABLE', 'پاسخ شبیه‌ساز گیت‌وی پذیرفته نمی‌شود.', 503);
        }
        const text = contentFromCompletion(data);
        if (!text.trim()) throw new LLMError('AI_BAD_RESPONSE', 'پاسخ stream خالی بود.', 502);
        onDelta(text, { model: returnedModel || model });
        const result: ChatResult = {
          text,
          meta: {
            model: returnedModel || model,
            provider: providerOf(returnedModel, target.kind),
            cached: false,
            latencyMs: Date.now() - started,
            attempts,
            streamed: false,
            usage: usageFrom(data),
          },
        };
        if (cacheFile && (!request.cacheValidate || request.cacheValidate(text))) {
          writeCache(cacheFile, { text, model: result.meta.model, provider: result.meta.provider, createdAt: new Date().toISOString() });
        }
        return result;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let text = '';
      let returnedModel = model;
      let usage: ChatUsage | undefined;
      let done = false;

      while (!done) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        // SSE eventها با خط خالی جدا می‌شوند؛ آخرین بخش ناقص در buffer می‌ماند.
        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary !== -1) {
          const eventBlock = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + (buffer[boundary] === '\r' ? 4 : 2));
          const datas = parseSSEData(eventBlock);
          for (const data of datas) {
            if (data === '[DONE]') {
              done = true;
              break;
            }
            let parsed: any;
            try {
              parsed = JSON.parse(data);
            } catch {
              continue;
            }
            resetIdle();
            if (parsed?.model) returnedModel = String(parsed.model);
            if (target.gateway && isMockModel(returnedModel)) {
              throw new LLMError('AI_UNAVAILABLE', 'پاسخ شبیه‌ساز گیت‌وی پذیرفته نمی‌شود.', 503);
            }
            const deltaContent =
              parsed?.choices?.[0]?.delta?.content ??
              parsed?.choices?.[0]?.message?.content ??
              parsed?.choices?.[0]?.text ??
              '';
            const delta = typeof deltaContent === 'string' ? deltaContent : '';
            if (delta) {
              text += delta;
              emitted = true;
              onDelta(delta, { model: returnedModel });
            }
            const u = usageFrom(parsed);
            if (u) usage = u;
          }
          if (done) break;
          boundary = buffer.search(/\r?\n\r?\n/);
        }
      }

      if (!text.trim()) throw new LLMError('AI_BAD_RESPONSE', 'پاسخ stream خالی بود.', 502);

      const result: ChatResult = {
        text,
        meta: {
          model: returnedModel,
          provider: providerOf(returnedModel, target.kind),
          cached: false,
          latencyMs: Date.now() - started,
          attempts,
          streamed: true,
          usage,
        },
      };
      if (cacheFile && (!request.cacheValidate || request.cacheValidate(text))) {
        writeCache(cacheFile, { text, model: result.meta.model, provider: result.meta.provider, createdAt: new Date().toISOString() });
      }
      return result;
    } catch (error) {
      const mapped = error instanceof LLMError ? error : networkError(error, timeoutMs);
      if (mapped.code === 'AI_ABORTED' && !request.signal?.aborted) {
        // idle timeout داخلی
        lastError = new LLMError('AI_TIMEOUT', 'جریان پاسخ provider قطع شد (timeout).', 504);
      } else {
        lastError = mapped;
      }
      if (mapped.code === 'AI_ABORTED') throw mapped;
      if (!emitted && attempt < maxAttempts && (mapped.code === 'AI_UPSTREAM' || mapped.code === 'AI_TIMEOUT')) {
        await sleep(500 * attempt);
        continue;
      }
      throw lastError;
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      request.signal?.removeEventListener('abort', onAbort);
    }
  }

  throw lastError ?? new LLMError('AI_UPSTREAM', 'استریم provider ناموفق بود.', 502);
}

/** پارس JSON از خروجی مدل (fence، متن اضافه، یا کامنت‌های ابتدایی). */
export function parseJsonLoose<T = any>(text: string): T | null {
  if (typeof text !== 'string') return null;
  const stripped = text
    .trim()
    .replace(/^```(?:json|javascript)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  const attempts = [stripped];
  const firstBrace = stripped.indexOf('{');
  const lastBrace = stripped.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) attempts.push(stripped.slice(firstBrace, lastBrace + 1));
  const firstBracket = stripped.indexOf('[');
  const lastBracket = stripped.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) attempts.push(stripped.slice(firstBracket, lastBracket + 1));
  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as T;
    } catch {
      /* تلاش بعدی */
    }
  }
  return null;
}

export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_CACHE_TTL_MS_EXPORT = DEFAULT_CACHE_TTL_MS;

export function tempCacheDir(): string {
  if (nodePath && typeof process !== 'undefined' && typeof process.cwd === 'function') {
    return nodePath.join(process.cwd(), 'data', 'cache', 'llm');
  }
  return 'browser-cache';
}
