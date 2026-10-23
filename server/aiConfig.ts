/**
 * SPEC-008 — ذخیره/خواندن تنظیمات AI، ادغام با متغیرهای محیطی، و ساخت targetها.
 *
 * امنیت:
 *  - فایل تنظیمات با مجوز 0600 و پوشه 0700 نوشته می‌شود.
 *  - کلیدها هرگز در پاسخ GET برنمی‌گردند (فقط hasKey و MASKED_KEY).
 *  - connectionهای آمده از env فقط‌خواندنی‌اند و در فایل ذخیره نمی‌شوند.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PROFILE,
  MASKED_KEY,
  PROVIDER_PRESETS,
  defaultAIConfig,
  normalizeBaseUrl,
  providerPreset,
  type AIConfig,
  type AIConnection,
  type AIProfile,
  type AIProviderKind,
} from '../shared/aiProviders';
import {
  LLMError,
  chat,
  listModelsForTarget,
  type ChatTarget,
  type ModelsResult,
} from './aiEngine';

export type AIConfigSource = 'file' | 'env' | 'none';

export interface LoadedAIConfig {
  config: AIConfig;
  source: AIConfigSource;
  filePath: string;
  warning?: string;
}

const PROJECT_AI_ID = /^[a-zA-Z0-9_-]{1,64}$/;

export function aiConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.KONKLANCER_AI_CONFIG_FILE?.trim() || path.join(process.cwd(), 'data', 'ai-config.json');
}

const clamp = (value: unknown, min: number, max: number, fallback: number): number => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
};

function sanitizeProfile(input: unknown): AIProfile {
  const raw = (input ?? {}) as Record<string, unknown>;
  const skills = Array.isArray(raw.skills)
    ? Array.from(new Set(raw.skills.map((s) => String(s).trim()).filter(Boolean))).slice(0, 40)
    : [];
  return {
    name: String(raw.name ?? '').slice(0, 120),
    headline: String(raw.headline ?? '').slice(0, 200),
    skills: skills.map((skill) => skill.slice(0, 80)),
    portfolio: String(raw.portfolio ?? '').slice(0, 4000),
    toneNotes: String(raw.toneNotes ?? '').slice(0, 1000),
    hourlyRate: Number.isFinite(Number(raw.hourlyRate)) && Number(raw.hourlyRate) > 0 ? Number(raw.hourlyRate) : undefined,
  };
}

function sanitizeConnection(
  input: Partial<AIConnection>,
  existing: AIConnection | undefined,
  index: number,
): AIConnection | null {
  const kind = (String(input.kind ?? existing?.kind ?? 'custom') as AIProviderKind);
  const preset = PROVIDER_PRESETS[kind];
  if (!preset) return null;
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? existing?.baseUrl ?? preset.baseUrl);
  if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) return null;

  const incomingKey = typeof input.apiKey === 'string' ? input.apiKey.trim() : '';
  // کلید فقط وقتی از اتصال قبلی به ارث می‌رسد که همان provider بماند؛ در غیر این صورت
  // کلیدِ provider قبلی برای این یکی معتبر نیست و باید دوباره وارد شود.
  let apiKey = existing && existing.kind === kind ? existing.apiKey ?? '' : '';
  if (incomingKey && incomingKey !== MASKED_KEY) apiKey = incomingKey;

  const id =
    typeof input.id === 'string' && PROJECT_AI_ID.test(input.id)
      ? input.id
      : existing?.id ?? `conn-${Date.now().toString(36)}-${index}-${crypto.randomBytes(3).toString('hex')}`;

  return {
    id,
    label: String(input.label ?? existing?.label ?? preset.label).trim().slice(0, 80) || preset.label,
    kind,
    baseUrl,
    ...(apiKey ? { apiKey } : {}),
    modelFast: String(input.modelFast ?? existing?.modelFast ?? '').trim().slice(0, 160),
    modelStrong: String(input.modelStrong ?? existing?.modelStrong ?? '').trim().slice(0, 160),
    enabled: input.enabled === undefined ? existing?.enabled ?? true : Boolean(input.enabled),
    jsonMode: input.jsonMode === undefined ? existing?.jsonMode ?? preset.jsonMode : Boolean(input.jsonMode),
    origin: 'ui',
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    ...(input.lastTest ? { lastTest: input.lastTest } : existing?.lastTest ? { lastTest: existing.lastTest } : {}),
  };
}

function sanitizeConfig(input: Partial<AIConfig>, existing: AIConfig): AIConfig {
  const existingById = new Map(existing.connections.map((connection) => [connection.id, connection]));
  const seen = new Set<string>();
  const connections: AIConnection[] = [];
  const rows = Array.isArray(input.connections) ? input.connections.slice(0, 12) : existing.connections;
  for (const [index, row] of rows.entries()) {
    if (!row || row.origin === 'env') continue; // دوباره از env اضافه می‌شود
    const connection = sanitizeConnection(row, existingById.get(String(row.id ?? '')), index);
    if (!connection || seen.has(connection.id)) continue;
    seen.add(connection.id);
    connections.push(connection);
  }

  const requestedActive = input.activeId ?? existing.activeId;
  const activeId =
    typeof requestedActive === 'string' && (connections.some((c) => c.id === requestedActive) || requestedActive.startsWith('env-'))
      ? requestedActive
      : connections[0]?.id ?? null;

  return {
    version: 1,
    activeId,
    connections,
    fallbackEnabled: input.fallbackEnabled === undefined ? existing.fallbackEnabled : Boolean(input.fallbackEnabled),
    temperature: clamp(input.temperature ?? existing.temperature, 0, 2, existing.temperature ?? 0.35),
    timeoutMs: clamp(input.timeoutMs ?? existing.timeoutMs, 5_000, 600_000, existing.timeoutMs ?? 120_000),
    cacheTtlHours: clamp(input.cacheTtlHours ?? existing.cacheTtlHours, 0, 24 * 365, existing.cacheTtlHours ?? 168),
    privacy: input.privacy === 'private' ? 'private' : input.privacy === 'any' ? 'any' : existing.privacy,
    allowCodeExecution:
      input.allowCodeExecution === undefined ? existing.allowCodeExecution : Boolean(input.allowCodeExecution),
    profile: sanitizeProfile(input.profile ?? existing.profile),
  };
}

function readFileConfig(filePath: string): { config: AIConfig | null; warning?: string } {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const base = sanitizeConfig(parsed, defaultAIConfig());
    // sanitizeConfig با activeId کار می‌کند؛ فایل قدیمی/خراب نباید برنامه را بشکند.
    return { config: { ...base, activeId: typeof parsed.activeId === 'string' ? parsed.activeId : base.activeId } };
  } catch (error: any) {
    if (error?.code === 'ENOENT') return { config: null };
    return { config: null, warning: `فایل تنظیمات AI خوانده نشد: ${error?.message ?? error}` };
  }
}

/** connectionهای قابل‌استفاده از متغیرهای محیطی (برای اجرای headless / بدون UI). */
export function envConnections(env: NodeJS.ProcessEnv = process.env): AIConnection[] {
  const connections: AIConnection[] = [];
  const seen = new Set<string>();

  const push = (kind: AIProviderKind, apiKey: string, baseUrl?: string, extra: Partial<AIConnection> = {}) => {
    const preset = PROVIDER_PRESETS[kind];
    if (!preset) return;
    const url = normalizeBaseUrl(baseUrl || preset.baseUrl);
    if (!url) return;
    const dedupe = `${kind}|${url}`;
    if (seen.has(dedupe)) return;
    if (preset.requiresKey && !apiKey) return;
    seen.add(dedupe);
    connections.push({
      id: `env-${kind}`,
      label: `${preset.label} (env)`,
      kind,
      baseUrl: url,
      apiKey,
      modelFast: String(extra.modelFast ?? '').trim(),
      modelStrong: String(extra.modelStrong ?? '').trim(),
      enabled: true,
      jsonMode: preset.jsonMode,
      origin: 'env',
      createdAt: new Date().toISOString(),
    });
  };

  const gatewayUrl = (env.KONKRED_GATEWAY_URL ?? '').trim();
  const gatewayKey = (env.KONKRED_API_KEY ?? '').trim();
  if (gatewayUrl && gatewayKey) {
    connections.push({
      id: 'env-gateway',
      label: 'Konkred Gateway (env)',
      kind: 'gateway',
      baseUrl: normalizeBaseUrl(gatewayUrl),
      apiKey: gatewayKey,
      modelFast: '',
      modelStrong: '',
      enabled: true,
      jsonMode: false,
      origin: 'env',
      createdAt: new Date().toISOString(),
    });
  }

  const explicitKind = (env.AI_PROVIDER ?? '').trim() as AIProviderKind;
  if (explicitKind && PROVIDER_PRESETS[explicitKind]) {
    push(explicitKind, (env.AI_API_KEY ?? '').trim(), env.AI_BASE_URL, {
      modelFast: env.AI_MODEL_FAST,
      modelStrong: env.AI_MODEL_STRONG,
    });
  }

  const keyMap: Array<[string, AIProviderKind]> = [
    ['OPENAI_API_KEY', 'openai'],
    ['OPENROUTER_API_KEY', 'openrouter'],
    ['GROQ_API_KEY', 'groq'],
    ['GEMINI_API_KEY', 'gemini'],
    ['GOOGLE_API_KEY', 'gemini'],
    ['DEEPSEEK_API_KEY', 'deepseek'],
    ['MISTRAL_API_KEY', 'mistral'],
    ['CEREBRAS_API_KEY', 'cerebras'],
    ['TOGETHER_API_KEY', 'together'],
  ];
  for (const [envKey, kind] of keyMap) {
    const value = (env[envKey] ?? '').trim();
    if (value) push(kind, value);
  }

  const ollama = (env.OLLAMA_HOST ?? env.OLLAMA_BASE_URL ?? '').trim();
  if (ollama) {
    const url = ollama.startsWith('http') ? ollama : `http://${ollama}`;
    push('ollama', '', url);
  }

  return connections;
}

export function loadAIConfig(env: NodeJS.ProcessEnv = process.env): LoadedAIConfig {
  const filePath = aiConfigPath(env);
  const stored = readFileConfig(filePath);
  const envList = envConnections(env);
  const storedConfig = stored.config ?? defaultAIConfig();
  const fileConnections = storedConfig.connections.filter((connection) => !connection.origin || connection.origin === 'ui');
  const connections = [...fileConnections, ...envList];
  const activeId =
    connections.find((connection) => connection.id === storedConfig.activeId)?.id ??
    fileConnections[0]?.id ??
    envList[0]?.id ??
    null;

  const defaults = defaultAIConfig();
  const hasFileConfig = Boolean(stored.config);
  const envNumber = (key: string, fallback: number, min: number, max: number, allowZero = false) => {
    const value = Number(env[key]);
    const valid = Number.isFinite(value) && (value > 0 || (allowZero && value === 0));
    return valid ? clamp(value, min, max, fallback) : fallback;
  };
  const config: AIConfig = {
    ...defaults,
    ...storedConfig,
    // وقتی فایل تنظیمات وجود ندارد، متغیرهای محیطی (SPEC-006) به‌عنوان پیش‌فرض عمل می‌کنند.
    timeoutMs: hasFileConfig ? storedConfig.timeoutMs : envNumber('KONKRED_TIMEOUT_MS', defaults.timeoutMs, 5_000, 600_000),
    cacheTtlHours: hasFileConfig
      ? storedConfig.cacheTtlHours
      : envNumber('KONKRED_CACHE_TTL_HOURS', defaults.cacheTtlHours, 0, 24 * 365, true),
    privacy: hasFileConfig
      ? storedConfig.privacy
      : env.KONKRED_PRIVACY === 'private'
        ? 'private'
        : defaults.privacy,
    connections,
    activeId,
    profile: { ...DEFAULT_PROFILE, ...storedConfig.profile },
  };

  const source: AIConfigSource = fileConnections.length > 0 ? 'file' : envList.length > 0 ? 'env' : 'none';
  return { config, source, filePath, warning: stored.warning };
}

/**
 * اعتبارسنجی پیش از ذخیره. بدون این تابع، یک آدرس/نوع خراب بی‌صدا حذف می‌شد و کاربر
 * فکر می‌کرد ذخیره شده است. اکنون PUT با 400 و پیام دقیق رد می‌شود.
 */
export function validateConfigDraft(input: Partial<AIConfig>): string | null {
  if (input.connections !== undefined && !Array.isArray(input.connections)) {
    return 'فهرست اتصال‌ها نامعتبر است.';
  }
  const rows = Array.isArray(input.connections) ? input.connections : [];
  for (const [index, row] of rows.entries()) {
    if (!row || row.origin === 'env') continue;
    const preset = PROVIDER_PRESETS[row.kind as AIProviderKind];
    if (!preset) return `اتصال ${index + 1}: نوع provider نامعتبر است.`;
    const baseUrl = normalizeBaseUrl(String(row.baseUrl ?? ''));
    if (!baseUrl) return `اتصال ${index + 1}: آدرس پایه (Base URL) لازم است.`;
    if (!/^https?:\/\//i.test(baseUrl)) return `اتصال ${index + 1}: آدرس پایه باید با http:// یا https:// شروع شود.`;
    const key = String(row.apiKey ?? '').trim();
    const hasKey = Boolean((row as any).hasKey) || (key.length > 0 && key !== MASKED_KEY);
    if (preset.requiresKey && !hasKey) return `اتصال ${index + 1}: کلید API لازم است.`;
  }
  return null;
}

export function saveAIConfig(input: Partial<AIConfig>, env: NodeJS.ProcessEnv = process.env): LoadedAIConfig {
  const filePath = aiConfigPath(env);
  const existing = readFileConfig(filePath).config ?? defaultAIConfig();
  const sanitized = sanitizeConfig(input, { ...existing, connections: existing.connections.filter((c) => c.origin !== 'env') });
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const tempFile = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(sanitized, null, 2), { mode: 0o600 });
  fs.renameSync(tempFile, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* ویندوز chmod ندارد */
  }
  return loadAIConfig(env);
}

function maskConnection(connection: AIConnection): AIConnection {
  const { apiKey, ...rest } = connection;
  return {
    ...rest,
    apiKey: apiKey ? MASKED_KEY : '',
    hasKey: Boolean(apiKey),
    origin: connection.origin === 'env' ? 'env' : 'ui',
  };
}

export function publicAIConfig(loaded: LoadedAIConfig) {
  return {
    ...loaded.config,
    connections: loaded.config.connections.map(maskConnection),
    source: loaded.source,
    filePath:
      loaded.source === 'file'
        ? (() => {
            const relative = path.relative(process.cwd(), loaded.filePath);
            return relative && !relative.startsWith('..') ? relative : loaded.filePath;
          })()
        : undefined,
    warning: loaded.warning,
    providers: Object.values(PROVIDER_PRESETS).map((preset) => ({
      kind: preset.kind,
      label: preset.label,
      baseUrl: preset.baseUrl,
      requiresKey: preset.requiresKey,
      hint: preset.hint,
      keyUrl: preset.keyUrl,
      docsUrl: preset.docsUrl,
      local: Boolean(preset.local),
    })),
  };
}

export function isConnectionUsable(connection: AIConnection): boolean {
  if (!connection.enabled) return false;
  const preset = providerPreset(connection.kind);
  return Boolean(connection.apiKey) || !preset.requiresKey;
}

/** ترتیب تلاش: اتصال فعال، سپس بقیه‌ی اتصال‌های سالم (اگر fallback روشن باشد). */
export function orderedConnections(config: AIConfig): AIConnection[] {
  const usable = config.connections.filter(isConnectionUsable);
  const active = usable.find((connection) => connection.id === config.activeId);
  if (!active) return config.fallbackEnabled ? usable : usable.slice(0, 1);
  const rest = config.fallbackEnabled ? usable.filter((connection) => connection.id !== active.id) : [];
  return [active, ...rest];
}

export function connectionTarget(connection: AIConnection, config: AIConfig, env: NodeJS.ProcessEnv = process.env): ChatTarget {
  const preset = providerPreset(connection.kind);
  return {
    id: connection.id,
    kind: connection.kind,
    label: connection.label,
    baseUrl: normalizeBaseUrl(connection.baseUrl || preset.baseUrl),
    apiKey: connection.apiKey ?? '',
    gateway: Boolean(preset.gateway),
    privacy: config.privacy,
    models: { fast: connection.modelFast, strong: connection.modelStrong },
    jsonMode: connection.jsonMode && !preset.gateway,
    temperature: config.temperature,
    timeoutMs: config.timeoutMs,
    cacheDir: env.KONKRED_CACHE_DIR || path.join(process.cwd(), 'data', 'cache', 'llm'),
    cacheTtlMs: config.cacheTtlHours * 3600_000,
  };
}

export function activeConnection(config: AIConfig): AIConnection | null {
  const usable = config.connections.filter(isConnectionUsable);
  return usable.find((connection) => connection.id === config.activeId) ?? usable[0] ?? null;
}

export function aiStatus(loaded: LoadedAIConfig) {
  const active = activeConnection(loaded.config);
  const preset = active ? providerPreset(active.kind) : null;
  return {
    configured: Boolean(active),
    source: loaded.source,
    warning: loaded.warning,
    provider: active
      ? {
          id: active.id,
          label: active.label,
          kind: active.kind,
          kindLabel: preset?.label ?? active.kind,
          baseUrl: active.baseUrl,
          modelFast: active.modelFast || null,
          modelStrong: active.modelStrong || null,
          gateway: Boolean(preset?.gateway),
          hasKey: Boolean(active.apiKey),
          origin: active.origin ?? 'ui',
          lastTest: active.lastTest ?? null,
        }
      : null,
    connections: loaded.config.connections.length,
    usableConnections: loaded.config.connections.filter(isConnectionUsable).length,
    fallbackEnabled: loaded.config.fallbackEnabled,
    allowCodeExecution: loaded.config.allowCodeExecution,
    profileReady: Boolean(loaded.config.profile.name || loaded.config.profile.headline || loaded.config.profile.skills.length),
    temperature: loaded.config.temperature,
    timeoutMs: loaded.config.timeoutMs,
    cacheTtlHours: loaded.config.cacheTtlHours,
  };
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  model?: string;
  provider?: string;
  reply?: string;
  code?: string;
  message: string;
}

/** تست واقعی اتصال با یک پیام کوتاه (بدون کش). */
export async function testAIConnection(connection: AIConnection, config: AIConfig): Promise<ConnectionTestResult> {
  const started = Date.now();
  const target = connectionTarget(connection, config);
  try {
    const result = await chat(
      {
        messages: [
          { role: 'system', content: 'You are a connectivity probe. Reply with the single word OK.' },
          { role: 'user', content: 'Reply with: OK' },
        ],
        taskType: 'general',
        modelTier: 'fast',
        maxTokens: 8,
        temperature: 0,
        noCache: true,
        timeoutMs: Math.min(config.timeoutMs, 30_000),
      },
      target,
      { attempts: 1 },
    );
    return {
      ok: true,
      latencyMs: Date.now() - started,
      model: result.meta.model,
      provider: result.meta.provider,
      reply: result.text.trim().slice(0, 120),
      message: `اتصال موفق بود (${result.meta.model || target.kind}).`,
    };
  } catch (error) {
    const mapped = error instanceof LLMError ? error : null;
    return {
      ok: false,
      latencyMs: Date.now() - started,
      code: mapped?.code ?? 'AI_UPSTREAM',
      message: mapped?.message ?? (error as Error)?.message ?? 'اتصال ناموفق بود.',
    };
  }
}

export async function listConnectionModels(connection: AIConnection): Promise<ModelsResult> {
  return listModelsForTarget({
    baseUrl: connection.baseUrl,
    apiKey: connection.apiKey ?? '',
    headers: {},
    timeoutMs: 20_000,
    kind: connection.kind,
  });
}

/** ساخت پیش‌نویس connection از فرم UI (قبل از ذخیره) برای «دریافت مدل‌ها» و «تست». */
export function draftConnection(input: Partial<AIConnection>, existing?: AIConnection): AIConnection | null {
  return sanitizeConnection({ ...input, id: input.id ?? existing?.id }, existing, 0);
}

export function findConnection(config: AIConfig, id?: string): AIConnection | null {
  if (id) return config.connections.find((connection) => connection.id === id) ?? null;
  return activeConnection(config);
}
