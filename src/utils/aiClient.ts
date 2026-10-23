/**
 * SPEC-008 — کلاینت AI سمت مرورگر.
 * همه‌ی تماس‌ها relative هستند تا از پشت همان سرور/Vite proxy عبور کنند.
 * استریم با fetch + ReadableStream خوانده می‌شود (EventSource برای POST کار نمی‌کند).
 */
import type { AIConfig } from '../../shared/aiProviders';

export interface AIMeta {
  model: string;
  provider: string;
  cached: boolean;
  latencyMs: number;
  streamed: boolean;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number } | null;
}

export interface AIStatusPayload {
  configured: boolean;
  source: 'file' | 'env' | 'none';
  warning?: string;
  provider: {
    id: string;
    label: string;
    kind: string;
    kindLabel: string;
    baseUrl: string;
    modelFast: string | null;
    modelStrong: string | null;
    gateway: boolean;
    hasKey: boolean;
    origin: 'ui' | 'env';
    lastTest?: {
      ok: boolean;
      at: string;
      latencyMs?: number;
      model?: string;
      message?: string;
    } | null;
  } | null;
  connections: number;
  usableConnections: number;
  fallbackEnabled: boolean;
  allowCodeExecution: boolean;
  profileReady: boolean;
  temperature: number;
  timeoutMs: number;
  cacheTtlHours: number;
}

export interface AIConfigResponse {
  config: AIConfig & { source?: AIStatusPayload['source']; warning?: string };
  status: AIStatusPayload;
}

export class AIRequestError extends Error {
  code: string;
  status: number;
  detail?: string | null;
  requiresAIConfig: boolean;
  payload?: any;
  constructor(
    message: string,
    options: { code?: string; status?: number; detail?: string | null; requiresAIConfig?: boolean; payload?: any } = {},
  ) {
    super(message);
    this.name = 'AIRequestError';
    this.code = options.code ?? 'AI_UPSTREAM';
    this.status = options.status ?? 0;
    this.detail = options.detail ?? null;
    this.requiresAIConfig = Boolean(options.requiresAIConfig);
    this.payload = options.payload;
  }
}

async function errorFromResponse(response: Response): Promise<AIRequestError> {
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    /* پاسخ غیر JSON */
  }
  return new AIRequestError(data?.error || data?.message || `درخواست ناموفق بود (HTTP ${response.status}).`, {
    code: data?.code,
    status: response.status,
    detail: data?.detail,
    requiresAIConfig: data?.requiresAIConfig,
    payload: data,
  });
}

async function jsonRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw await errorFromResponse(response);
  return (await response.json()) as T;
}

export const getAIStatus = () => jsonRequest<AIStatusPayload & { success: boolean }>('/api/ai/status');

export const getAIConfig = () =>
  jsonRequest<{ success: boolean } & AIConfigResponse>('/api/ai/config');

export const saveAIConfig = (config: Partial<AIConfig>) =>
  jsonRequest<{ success: boolean } & AIConfigResponse>('/api/ai/config', {
    method: 'PUT',
    body: JSON.stringify(config),
  });

export const fetchAIModels = (body: { connectionId?: string; connection?: any }) =>
  jsonRequest<{
    success: boolean;
    count: number;
    models: string[];
    recommended: { fast: string; strong: string };
  }>('/api/ai/models', { method: 'POST', body: JSON.stringify(body) });

export const testAIConnectionRequest = (body: { connectionId?: string; connection?: any }) =>
  jsonRequest<{
    success: boolean;
    ok: boolean;
    latencyMs: number;
    model?: string;
    provider?: string;
    reply?: string;
    code?: string;
    message: string;
  }>('/api/ai/test', { method: 'POST', body: JSON.stringify(body) });

/* ------------------------------------------------------------------ */
/* استریم SSE                                                          */
/* ------------------------------------------------------------------ */

export type SSEHandler = (event: string, data: any) => void;

export async function streamRequest(
  url: string,
  body: unknown,
  onEvent: SSEHandler,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) throw await errorFromResponse(response);
  if (!response.body) throw new AIRequestError('پاسخ استریم از سرور دریافت نشد.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const flushBlock = (block: string) => {
    const lines = block.split(/\r?\n/);
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length === 0) return;
    let data: any = null;
    try {
      data = JSON.parse(dataLines.join('\n'));
    } catch {
      data = { text: dataLines.join('\n') };
    }
    if (event === 'error') {
      throw new AIRequestError(data?.error || 'خطا در جریان پاسخ هوش مصنوعی.', {
        code: data?.code,
        status: 502,
        detail: data?.detail,
        requiresAIConfig: data?.requiresAIConfig,
        payload: data,
      });
    }
    onEvent(event, data);
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let match = buffer.match(/\r?\n\r?\n/);
    while (match && match.index !== undefined) {
      const block = buffer.slice(0, match.index);
      buffer = buffer.slice(match.index + match[0].length);
      if (block.trim()) flushBlock(block);
      match = buffer.match(/\r?\n\r?\n/);
    }
  }
  if (buffer.trim()) flushBlock(buffer);
}

/** برچسب کوتاه متادیتای مدل برای نمایش در UI. */
export function metaLabel(meta?: AIMeta | null): string {
  if (!meta) return '';
  const latency = meta.latencyMs >= 1000 ? `${(meta.latencyMs / 1000).toFixed(1)} ثانیه` : `${meta.latencyMs} ms`;
  const parts = [meta.model || 'مدل نامشخص', latency];
  if (meta.cached) parts.push('از کش');
  if (meta.usage?.totalTokens) parts.push(`${meta.usage.totalTokens.toLocaleString('fa-IR')} توکن`);
  return parts.join(' · ');
}
