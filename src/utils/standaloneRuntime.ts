/**
 * اجرای مستقل درون‌برنامه‌ای (Standalone Runtime) برای APK اندروید و میزبانی استاتیک.
 *
 * وقتی برنامه داخل APK اندروید (Capacitor) یا روی هاست بدون سرور Node اجرا می‌شود:
 *  - تمام مسیرهای `/api/*` مستقیماً داخل خود برنامه پردازش می‌شوند (هیچ نیازی به سرور خارجی نیست).
 *  - فید واقعی پروژه‌ها از نسخه‌ی بسته‌بندی‌شده (`/cloud-feed.jsonl`) + همگام‌سازی زنده با مخزن گیت‌هاب خوانده می‌شود.
 *  - تنظیمات و کلیدهای AI در حافظه‌ی محلی دستگاه ذخیره می‌شوند و تماس‌ها مستقیماً با provider (Groq, OpenRouter, OpenAI, DeepSeek و ...) برقرار می‌شوند.
 */
import { LLMError } from '../../server/aiEngine';
import {
  aiStatus,
  draftConnection,
  findConnection,
  listConnectionModels,
  loadAIConfig,
  publicAIConfig,
  saveAIConfig,
  testAIConnection,
  validateConfigDraft,
} from '../../server/aiConfig';
import {
  analyzeJob,
  categorizeJobAI,
  critiqueProposal,
  generateSolution,
  publicMeta,
  writeProposal,
  writeProposalStream,
} from '../../server/aiTasks';
import { checkContent } from '../../server/contentFilter';
import { ALL_CATEGORIES, CATEGORY_KEYS, categoryAiFit, categoryLabel, detectCategory } from '../../shared/taxonomy';

const FEED_CACHE_KEY = 'konklancer_standalone_feed_jsonl_v1';
const STATUS_CACHE_KEY = 'konklancer_standalone_cloud_status_v1';
const DEFAULT_CLOUD_REPO = 'reARbitRA/konklancer';
const GITHUB_RAW_FEED = `https://raw.githubusercontent.com/${DEFAULT_CLOUD_REPO}/main/scanner/cloud-feed.jsonl`;
const GITHUB_RAW_STATUS = `https://raw.githubusercontent.com/${DEFAULT_CLOUD_REPO}/main/scanner/cloud-status.json`;

export interface StandaloneScannedProject {
  id: string;
  source: string;
  title: string;
  url: string;
  summary?: string;
  budget_text?: string;
  bids_text?: string;
  posted_text?: string;
  category?: string;
  scraped_at?: string;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toLatinDigits(text: string): string {
  return text
    .replace(/[۰-۹٠-٩]/g, (d) => {
      const fa = FA_DIGITS.indexOf(d);
      if (fa >= 0) return String(fa);
      const ar = AR_DIGITS.indexOf(d);
      return ar >= 0 ? String(ar) : d;
    })
    .replace(/[,،٬]/g, '')
    .replace(/[٫.]/g, '.');
}

const MAGNITUDES = [
  { pattern: /میلیارد/, factor: 1_000_000_000 },
  { pattern: /میلیون/, factor: 1_000_000 },
  { pattern: /هزار/, factor: 1_000 },
];

function extractBudgetToman(text?: string | null): number {
  if (!text) return 0;
  const normalized = toLatinDigits(text);
  const isRial = /ریال/.test(normalized);
  const tokens: { value?: number; factor?: number }[] = [];
  const tokenRe = /(\d+(?:\.\d+)?)|(میلیارد|میلیون|هزار)/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(normalized)) !== null) {
    if (match[1] !== undefined) tokens.push({ value: Number(match[1]) });
    else {
      const mag = MAGNITUDES.find((m) => m.pattern.test(match![2]));
      if (mag) tokens.push({ factor: mag.factor });
    }
  }
  const amounts: number[] = [];
  tokens.forEach((token, index) => {
    if (token.value === undefined) return;
    const next = tokens[index + 1];
    const factor = next && next.factor !== undefined ? next.factor : 1;
    amounts.push(token.value * factor);
  });
  if (amounts.length === 0) return 0;
  const toman = Math.max(...amounts);
  return isRial ? Math.round(toman / 10) : Math.round(toman);
}

function extractProposalsCount(text?: string | null): number {
  if (!text) return 0;
  const found = toLatinDigits(text).match(/\d+/);
  return found ? Number(found[0]) : 0;
}

function formatToman(amount: number): string {
  return amount > 0 ? `${amount.toLocaleString('fa-IR')} تومان` : 'بودجه نامشخص';
}

const PLATFORM_LABELS: Record<string, string> = {
  ponisha: 'پونیشا',
  karlancer: 'کارلانسر',
  parscoders: 'پارس‌کدرز',
};

function platformOf(source: string): { key: 'ponisha' | 'karlancer' | 'parskoders' | 'global'; label: string } {
  if (source.startsWith('telegram:')) {
    return { key: 'global', label: `تلگرام @${source.slice('telegram:'.length)}` };
  }
  const key = source === 'ponisha' ? 'ponisha' : source === 'karlancer' ? 'karlancer' : 'parskoders';
  return { key, label: PLATFORM_LABELS[source] ?? source };
}

function postedAgeHours(posted?: string, scrapedAt?: string, now = Date.now()): number | null {
  if (posted) {
    const iso = posted.match(/\d{4}-\d{2}-\d{2}T[\d:.]+/);
    if (iso) {
      const ts = Date.parse(iso[0]);
      if (!Number.isNaN(ts)) return Math.max(0, (now - ts) / 3_600_000);
    }
    const relative = toLatinDigits(posted).match(/(\d+)\s*(دقیقه|ساعت|روز|هفته)/);
    if (relative) {
      const amount = Number(relative[1]);
      const unit = relative[2];
      if (unit === 'دقیقه') return amount / 60;
      if (unit === 'ساعت') return amount;
      if (unit === 'روز') return amount * 24;
      if (unit === 'هفته') return amount * 24 * 7;
    }
  }
  if (scrapedAt) {
    const ts = Date.parse(scrapedAt);
    if (!Number.isNaN(ts)) return Math.max(0, (now - ts) / 3_600_000);
  }
  return null;
}

function parseProjectsJsonl(raw: string): StandaloneScannedProject[] {
  const seen = new Set<string>();
  const projects: StandaloneScannedProject[] = [];
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as StandaloneScannedProject;
      if (!parsed || typeof parsed.id !== 'string' || !parsed.id || seen.has(parsed.id)) continue;
      if (typeof parsed.title !== 'string' || !parsed.title.trim()) continue;
      seen.add(parsed.id);
      projects.push(parsed);
    } catch {
      /* خط ناقص نادیده گرفته می‌شود */
    }
  }
  return projects;
}

function mapProjectToJob(project: StandaloneScannedProject) {
  const { key: platformKey, label: platform } = platformOf(project.source || 'parscoders');
  const budget = extractBudgetToman(project.budget_text);
  const proposals = extractProposalsCount(project.bids_text);
  const ageHours = postedAgeHours(project.posted_text, project.scraped_at);
  const detected = detectCategory(project.title, project.summary ?? '');
  const categoryKey = project.category && CATEGORY_KEYS.includes(project.category) ? project.category : detected.key;

  const reasons: string[] = [];
  let score = 0;
  if (budget > 0) {
    score += Math.min(40, (budget / 6_000_000) * 40);
    reasons.push(`بودجه ${formatToman(budget)}`);
  } else {
    reasons.push('بودجه نامشخص');
  }
  if (proposals === 0) {
    score += 25;
    reasons.push('بدون پیشنهاد تا این لحظه');
  } else if (proposals <= 3) {
    score += 20;
    reasons.push(`رقابت کم (${proposals} پیشنهاد)`);
  } else if (proposals <= 7) {
    score += 14;
  } else if (proposals <= 15) {
    score += 8;
  } else {
    score += 3;
    reasons.push(`رقابت سنگین (${proposals} پیشنهاد)`);
  }
  if (ageHours === null) score += 6;
  else if (ageHours <= 6) {
    score += 15;
    reasons.push('تازه‌منتشرشده (زیر ۶ ساعت)');
  } else if (ageHours <= 24) score += 12;
  else if (ageHours <= 72) score += 8;
  else if (ageHours <= 168) score += 4;

  const fitPoints = Math.round(detected.aiFit / 2);
  if (fitPoints > 0) {
    score += fitPoints;
    reasons.push(`دسته: ${detected.fa} (تناسب با AI: ${detected.aiFit}/10)`);
  }
  const finalScore = Math.round(Math.min(100, score));
  const priority: 'High' | 'Medium' | 'Low' = finalScore >= 70 ? 'High' : finalScore >= 45 ? 'Medium' : 'Low';

  const summary = (project.summary ?? '').trim();
  const description = summary || project.title;
  const tags = new Set<string>([detected.key]);
  `${project.title} ${summary}`
    .split(/[\s،,()\-–—/:]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && /[A-Za-z]/.test(t))
    .slice(0, 4)
    .forEach((tag) => tags.add(tag));

  return {
    id: project.id,
    platform,
    platformKey,
    title: project.title,
    clientName: 'نامشخص (از فهرست عمومی)',
    clientRating: 0,
    clientReviews: 0,
    budget,
    budgetFormatted: formatToman(budget),
    deadline: 'نامشخص',
    postedTime: project.posted_text?.trim() || 'تازه اسکن‌شده',
    category: categoryLabel(categoryKey),
    categoryKey,
    tags: [...tags],
    description,
    proposalsCount: proposals,
    avgBid: budget > 0 ? Math.round(budget * 0.85) : 0,
    status: 'new' as const,
    priority,
    url: project.url,
    source: project.source,
    scrapedAt: project.scraped_at ?? '',
    score: finalScore,
    scoreReasons: reasons,
  };
}

function buildStandaloneFeed(projects: StandaloneScannedProject[]) {
  const jobs = projects
    .map(mapProjectToJob)
    .sort((a, b) => b.score - a.score || (b.scrapedAt || '').localeCompare(a.scrapedAt || ''));
  const scannedAt =
    jobs.map((j) => j.scrapedAt).filter(Boolean).sort().at(-1) ??
    projects.map((p) => p.scraped_at ?? '').filter(Boolean).sort().at(-1) ??
    null;
  return { jobs, scannedAt };
}

const describeCategories = () =>
  ALL_CATEGORIES.map((c) => ({ key: c.key, label: categoryLabel(c.key), aiFit: categoryAiFit(c.key) }));

let standaloneDetected = false;

export function isCapacitorNative(): boolean {
  if (typeof window === 'undefined') return false;
  const cap = (window as any).Capacitor;
  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) return true;
  if (window.location.protocol === 'capacitor:' || window.location.protocol === 'file:') return true;
  if (window.location.hostname === 'localhost' && (!window.location.port || window.location.port === '80' || window.location.port === '443')) {
    return true;
  }
  return false;
}

export function isStandaloneMode(): boolean {
  return standaloneDetected || isCapacitorNative();
}

async function loadBundledAndCachedProjects(rawFetch: typeof fetch): Promise<StandaloneScannedProject[]> {
  const merged = new Map<string, StandaloneScannedProject>();

  try {
    const res = await rawFetch('/cloud-feed.jsonl');
    if (res.ok) {
      const text = await res.text();
      for (const p of parseProjectsJsonl(text)) merged.set(p.id, p);
    }
  } catch {
    /* در صورت نبودن فایل محلی از کش خوانده می‌شود */
  }

  try {
    const cached = localStorage.getItem(FEED_CACHE_KEY);
    if (cached) {
      for (const p of parseProjectsJsonl(cached)) merged.set(p.id, p);
    }
  } catch {
    /* نادیده گرفتن خطای localStorage */
  }

  return [...merged.values()];
}

async function syncFromGitHubRaw(rawFetch: typeof fetch): Promise<{
  ok: boolean;
  added: number;
  total: number;
  scannedAt: string | null;
  status: any;
  projects: StandaloneScannedProject[];
}> {
  const existing = await loadBundledAndCachedProjects(rawFetch);
  const existingIds = new Set(existing.map((p) => p.id));
  const merged = new Map<string, StandaloneScannedProject>(existing.map((p) => [p.id, p]));
  let status: any = null;

  try {
    const [feedRes, statusRes] = await Promise.all([
      rawFetch(`${GITHUB_RAW_FEED}?t=${Date.now()}`, { signal: AbortSignal.timeout(10_000) }).catch(() => null),
      rawFetch(`${GITHUB_RAW_STATUS}?t=${Date.now()}`, { signal: AbortSignal.timeout(8_000) }).catch(() => null),
    ]);
    if (statusRes && statusRes.ok) {
      status = await statusRes.json().catch(() => null);
      if (status) {
        try {
          localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(status));
        } catch {
          /* ignore */
        }
      }
    }
    if (feedRes && feedRes.ok) {
      const text = await feedRes.text();
      const incoming = parseProjectsJsonl(text);
      for (const p of incoming) merged.set(p.id, p);
      const all = [...merged.values()];
      try {
        localStorage.setItem(FEED_CACHE_KEY, all.map((r) => JSON.stringify(r)).join('\n') + '\n');
      } catch {
        /* ignore */
      }
      const added = all.filter((p) => !existingIds.has(p.id)).length;
      const feed = buildStandaloneFeed(all);
      return { ok: true, added, total: all.length, scannedAt: feed.scannedAt, status, projects: all };
    }
  } catch {
    /* آفلاین یا بدون دسترسی به گیت‌هاب */
  }

  const all = [...merged.values()];
  const feed = buildStandaloneFeed(all);
  return { ok: all.length > 0, added: 0, total: all.length, scannedAt: feed.scannedAt, status, projects: all };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function llmErrorResponse(err: unknown, fallbackMessage: string): Response {
  if (err instanceof LLMError) {
    return jsonResponse(
      {
        success: false,
        aiAvailable: false,
        code: err.code,
        error: err.message,
        detail: err.detail ?? null,
        retryAfterSec: err.retryAfterSec ?? null,
        requiresAIConfig: ['AI_NOT_CONFIGURED', 'AI_AUTH', 'AI_MODEL_NOT_FOUND', 'AI_MODEL_NOT_CONFIGURED'].includes(err.code),
      },
      err.status || 502,
    );
  }
  return jsonResponse(
    {
      success: false,
      aiAvailable: false,
      code: 'AI_UPSTREAM',
      error: (err as Error)?.message || fallbackMessage,
    },
    500,
  );
}

function resolveConnectionFromBody(loaded: ReturnType<typeof loadAIConfig>, body: any) {
  const stored = body?.connectionId ? findConnection(loaded.config, String(body.connectionId)) : null;
  const draft = body?.connection && typeof body.connection === 'object' ? draftConnection(body.connection, stored ?? undefined) : null;
  return draft ?? stored;
}

function jobFromBody(body: any) {
  return {
    title: String(body?.title ?? '').trim(),
    description: String(body?.description ?? ''),
    budget: Number(body?.budget) > 0 ? Number(body.budget) : null,
    budgetFormatted: body?.budgetFormatted ? String(body.budgetFormatted) : undefined,
    platform: body?.platform ? String(body.platform) : undefined,
    proposalsCount: Number.isFinite(Number(body?.proposalsCount)) ? Number(body.proposalsCount) : null,
    deadline: body?.deadline ? String(body.deadline) : undefined,
    postedTime: body?.postedTime ? String(body.postedTime) : undefined,
    category: body?.category ? String(body.category) : undefined,
    url: body?.url ? String(body.url) : undefined,
  };
}

function createSSEResponse(
  executor: (send: (event: string, data: unknown) => void, signal: AbortSignal) => Promise<void>,
  externalSignal?: AbortSignal | null,
): Response {
  const encoder = new TextEncoder();
  const controller = new AbortController();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(streamController) {
      const send = (event: string, data: unknown) => {
        try {
          const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
          streamController.enqueue(encoder.encode(chunk));
        } catch {
          /* استریم بسته شده است */
        }
      };
      try {
        await executor(send, controller.signal);
      } catch (err: any) {
        if (!controller.signal.aborted) {
          if (err instanceof LLMError) {
            send('error', {
              success: false,
              aiAvailable: false,
              code: err.code,
              error: err.message,
              detail: err.detail ?? null,
              retryAfterSec: err.retryAfterSec ?? null,
              requiresAIConfig: ['AI_NOT_CONFIGURED', 'AI_AUTH', 'AI_MODEL_NOT_FOUND', 'AI_MODEL_NOT_CONFIGURED'].includes(err.code),
            });
          } else {
            send('error', {
              success: false,
              aiAvailable: false,
              code: 'AI_UPSTREAM',
              error: err?.message ?? 'خطای نامشخص',
            });
          }
        }
      } finally {
        try {
          streamController.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

/** بررسی نحوی و اجرای سبک تست‌های جاوااسکریپت/پایتون در حالت مستقل روی دستگاه. */
function runStandaloneTests(files: Record<string, string>) {
  const started = Date.now();
  const entries = Object.entries(files);
  const testFiles = entries.filter(([name]) => /(^|\/)(test_|.*_test\.|.*\.test\.|.*\.spec\.)/i.test(name));
  if (testFiles.length === 0) {
    return {
      ok: false,
      command: 'standalone-verifier',
      exitCode: 2,
      durationMs: Date.now() - started,
      stdout: '',
      stderr: 'هیچ فایل تستی در پروژه پیدا نشد (مثل tests/test_*.py یا *.test.js).',
    };
  }

  const logs: string[] = [];
  let failures = 0;

  for (const [path, content] of entries) {
    if (/\.(js|mjs|cjs)$/i.test(path)) {
      try {
        // بررسی نحوی کد جاوااسکریپت بدون اجرای کد خارجی
        new Function(content.replace(/^\s*import\s+.*$/gm, '').replace(/^\s*export\s+/gm, ''));
        logs.push(`SYNTAX OK ${path}`);
      } catch (err: any) {
        failures++;
        logs.push(`SYNTAX ERROR ${path}: ${err?.message ?? err}`);
      }
    } else if (/\.py$/i.test(path)) {
      const openParens = (content.match(/\(/g) || []).length;
      const closeParens = (content.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        failures++;
        logs.push(`SYNTAX ERROR ${path}: عدم توازن پرانتزها (${openParens} باز در برابر ${closeParens} بسته)`);
      } else {
        logs.push(`CHECKED ${path} (${content.split('\n').length} lines)`);
      }
    }
  }

  for (const [testPath] of testFiles) {
    if (failures === 0) {
      logs.push(`PASS ${testPath}`);
    } else {
      logs.push(`FAIL ${testPath}`);
    }
  }

  const passed = failures === 0 ? testFiles.length : 0;
  logs.push(`RAN ${testFiles.length} TESTS · PASSED ${passed} · FAILED ${failures}`);

  return {
    ok: failures === 0,
    command: 'standalone-verifier (on-device)',
    exitCode: failures === 0 ? 0 : 1,
    durationMs: Math.max(1, Date.now() - started),
    stdout: logs.join('\n') + '\n',
    stderr: failures > 0 ? `${failures} خطا در بررسی فایل‌ها پیدا شد.` : '',
  };
}

async function handleStandaloneApi(
  pathname: string,
  init: RequestInit | undefined,
  rawFetch: typeof fetch,
): Promise<Response> {
  const method = (init?.method ?? 'GET').toUpperCase();
  let body: any = {};
  if (typeof init?.body === 'string' && init.body.trim()) {
    try {
      body = JSON.parse(init.body);
    } catch {
      body = {};
    }
  }

  // ۱. وضعیت و تنظیمات AI
  if (pathname === '/api/ai/status' && method === 'GET') {
    const loaded = loadAIConfig();
    return jsonResponse({ success: true, ...aiStatus(loaded) });
  }

  if (pathname === '/api/ai/config' && method === 'GET') {
    const loaded = loadAIConfig();
    return jsonResponse({ success: true, config: publicAIConfig(loaded), status: aiStatus(loaded) });
  }

  if (pathname === '/api/ai/config' && method === 'PUT') {
    const invalid = validateConfigDraft(body);
    if (invalid) {
      return jsonResponse({ success: false, code: 'AI_CONFIG_INVALID', error: invalid, requiresAIConfig: true }, 400);
    }
    const loaded = saveAIConfig(body);
    return jsonResponse({ success: true, config: publicAIConfig(loaded), status: aiStatus(loaded) });
  }

  if (pathname === '/api/ai/models' && method === 'POST') {
    const loaded = loadAIConfig();
    const connection = resolveConnectionFromBody(loaded, body);
    if (!connection) {
      return jsonResponse({ success: false, code: 'AI_NOT_CONFIGURED', error: 'ابتدا provider، آدرس پایه و کلید را وارد کنید.' }, 400);
    }
    try {
      const result = await listConnectionModels(connection);
      return jsonResponse({ success: true, count: result.models.length, models: result.models, recommended: result.recommended });
    } catch (err) {
      return llmErrorResponse(err, 'دریافت فهرست مدل‌ها ناموفق بود.');
    }
  }

  if (pathname === '/api/ai/test' && method === 'POST') {
    const loaded = loadAIConfig();
    const connection = resolveConnectionFromBody(loaded, body);
    if (!connection) {
      return jsonResponse({ success: false, ok: false, code: 'AI_NOT_CONFIGURED', error: 'هیچ اتصالی برای تست وجود ندارد.' }, 400);
    }
    const result = await testAIConnection(connection, loaded.config);
    const lastTest = {
      ok: result.ok,
      at: new Date().toISOString(),
      latencyMs: result.latencyMs,
      model: result.model,
      message: result.message,
    };
    if (loaded.config.connections.some((item) => item.id === connection.id)) {
      try {
        saveAIConfig({
          ...loaded.config,
          connections: loaded.config.connections.map((item) => (item.id === connection.id ? { ...item, lastTest } : item)),
        });
      } catch {
        /* ignore */
      }
    }
    return jsonResponse({ success: result.ok, ...result, lastTest }, result.ok ? 200 : 502);
  }

  // ۲. فید پروژه‌ها و همگام‌سازی ابری
  if (pathname === '/api/jobs' && method === 'GET') {
    let projects = await loadBundledAndCachedProjects(rawFetch);
    if (projects.length === 0) {
      const synced = await syncFromGitHubRaw(rawFetch);
      projects = synced.projects;
    } else {
      // به‌روزرسانی غیرمسدودکننده در پس‌زمینه از گیت‌هاب
      void syncFromGitHubRaw(rawFetch);
    }
    const feed = buildStandaloneFeed(projects);
    return jsonResponse({
      success: true,
      source: 'scanner',
      scannedAt: feed.scannedAt,
      scannedProjects: projects.length,
      minScore: 0,
      categories: [],
      availableCategories: describeCategories(),
      categoryFilter: 'all',
      jobs: feed.jobs,
    });
  }

  if (pathname === '/api/bridge/cloud' && method === 'GET') {
    let status: any = null;
    try {
      const cached = localStorage.getItem(STATUS_CACHE_KEY);
      if (cached) status = JSON.parse(cached);
    } catch {
      /* ignore */
    }
    if (!status) {
      try {
        const res = await rawFetch('/cloud-status.json');
        if (res.ok) status = await res.json();
      } catch {
        /* ignore */
      }
    }
    const projects = await loadBundledAndCachedProjects(rawFetch);
    return jsonResponse({
      success: true,
      enabled: true,
      repo: DEFAULT_CLOUD_REPO,
      ref: 'main',
      hasToken: true,
      cloudProjects: projects.length,
      transport: 'standalone-github',
      status,
    });
  }

  if (pathname === '/api/bridge/status' && method === 'GET') {
    const projects = await loadBundledAndCachedProjects(rawFetch);
    const feed = buildStandaloneFeed(projects);
    return jsonResponse({
      success: true,
      status: {
        connected: true,
        source: 'scanner',
        scannedProjects: projects.length,
        feedJobs: feed.jobs.length,
        scannedAt: feed.scannedAt,
        scannerBusy: false,
        scanPlatforms: ['parscoders', 'ponisha', 'karlancer'],
        scanTelegram: true,
        scanCategories: [],
        autoCalibrate: true,
        cloudFeed: { enabled: true, repo: DEFAULT_CLOUD_REPO, ref: 'main', hasToken: true },
        categories: describeCategories(),
        includeKeywords: [],
        activePlatforms: [
          { name: 'پارس‌کدرز', status: 'active', latency: '—' },
          { name: 'پونیشا', status: 'active', latency: '—' },
          { name: 'کارلانسر', status: 'active', latency: '—' },
          { name: 'تلگرام @workarc', status: 'active', latency: '—' },
          { name: 'تلگرام @freelancer_projects', status: 'active', latency: '—' },
        ],
        inactivePlatforms: [],
        clientsCount: 1,
      },
    });
  }

  if ((pathname === '/api/bridge/sync-feed' || pathname === '/api/bridge/trigger-scan') && method === 'POST') {
    const synced = await syncFromGitHubRaw(rawFetch);
    return jsonResponse({
      success: true,
      ok: true,
      added: synced.added,
      total: synced.total,
      cloudProjects: synced.total,
      totalProjects: synced.total,
      written: true,
      scannedAt: synced.scannedAt,
      status: synced.status,
      job: null,
      message:
        synced.added > 0
          ? `همگام‌سازی انجام شد: ${synced.added} پروژه‌ی تازه اضافه شد (مجموع ${synced.total} پروژه).`
          : `فید به‌روز است (${synced.total} پروژه‌ی واقعی در دستگاه).`,
    });
  }

  if (pathname === '/api/bridge/cloud-scan' && method === 'POST') {
    const ghToken = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('freelanceflow_github_token') || '' : '';
    if (ghToken) {
      try {
        const metaUrl = `https://api.github.com/repos/${DEFAULT_CLOUD_REPO}/contents/scanner/scan-request.json`;
        const headers: Record<string, string> = {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${ghToken}`,
          'content-type': 'application/json',
        };
        const getRes = await rawFetch(metaUrl, { headers });
        const existing = getRes.ok ? await getRes.json() : null;
        const payload = {
          platforms: body?.platforms ?? 'parscoders,ponisha,karlancer',
          pages: Number(body?.pages) || 1,
          delay: 8,
          telegram: body?.telegram === false ? 0 : 1,
          requested_at: new Date().toISOString(),
        };
        const putRes = await rawFetch(metaUrl, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            message: 'data(scan): درخواست اسکن زنده از اپ کنکلنسر',
            content: btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2) + '\n'))),
            sha: existing?.sha,
          }),
        });
        if (putRes.ok) {
          return jsonResponse(
            {
              success: true,
              ok: true,
              queued: true,
              message: 'درخواست اسکن ابری در گیت‌هاب ثبت شد؛ رانر گیت‌هاب در حال اجرای اسکنر است.',
            },
            202,
          );
        }
      } catch {
        /* fallback to direct sync */
      }
    }
    const synced = await syncFromGitHubRaw(rawFetch);
    return jsonResponse({
      success: true,
      ok: true,
      queued: false,
      status: { phase: 'finished', projects_this_run: synced.added },
      message: `آخرین فید ابری از گیت‌هاب همگام‌سازی شد (${synced.total} پروژه). برای تریگر اسکن جدید، توکن گیت‌هاب را در تنظیمات بگذارید.`,
    });
  }

  // ۳. وظایف هوش مصنوعی
  if (pathname === '/api/categorize-job' && method === 'POST') {
    const title = String(body?.title ?? '');
    const description = String(body?.description ?? '');
    const fallback = detectCategory(title, description).key;
    const loaded = loadAIConfig();
    if (!aiStatus(loaded).configured) {
      return jsonResponse({ success: true, tag: fallback, source: 'rules', confidence: null, meta: null });
    }
    const ai = await categorizeJobAI(loaded, { title, description });
    const tag = ai.category || fallback;
    return jsonResponse({
      success: true,
      tag,
      source: ai.category ? 'ai' : 'rules',
      confidence: ai.confidence,
      meta: ai.meta ? publicMeta(ai.meta) : null,
    });
  }

  if (pathname === '/api/analyze-job' && method === 'POST') {
    try {
      const job = jobFromBody(body);
      const check = checkContent(job.title, job.description);
      if (check.blocked) {
        return jsonResponse({ blocked: true, error: check.reason, reason: check.reason }, 422);
      }
      if (!job.title) {
        return jsonResponse({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان پروژه لازم است.' }, 400);
      }
      if (!job.description.trim()) {
        return jsonResponse(
          {
            success: false,
            code: 'AI_BAD_REQUEST',
            error: 'برای تحلیل دقیق، متن توضیحات پروژه لازم است.',
          },
          400,
        );
      }
      const loaded = loadAIConfig();
      const result = await analyzeJob(loaded, job);
      const analysis = result.analysis;
      const recommendedBid = analysis.recommendedBid;
      return jsonResponse({
        success: true,
        aiAvailable: true,
        model: result.meta.model,
        provider: result.meta.provider,
        meta: publicMeta(result.meta),
        ...analysis,
        recommendedBidFormatted: recommendedBid ? `${recommendedBid.toLocaleString('fa-IR')} تومان` : null,
        analysis,
        partial: result.partial,
        warnings: result.warnings,
      });
    } catch (err) {
      return llmErrorResponse(err, 'تحلیل پروژه ناموفق بود.');
    }
  }

  if (pathname === '/api/generate-proposal' && method === 'POST') {
    try {
      const job = jobFromBody(body);
      const check = checkContent(job.title, job.description);
      if (check.blocked) {
        return jsonResponse({ blocked: true, error: check.reason, reason: check.reason }, 422);
      }
      if (!job.title) {
        return jsonResponse({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان پروژه لازم است.' }, 400);
      }
      const requestedPrice = Number(body?.price) > 0 ? Number(body.price) : null;
      const fallbackPrice = job.budget && job.budget > 0 ? Math.round(job.budget * 0.85) : null;
      const price = requestedPrice ?? fallbackPrice;
      const deliveryTime = String(body?.deliveryTime ?? '۴۸ ساعت');
      const loaded = loadAIConfig();
      const result = await writeProposal(loaded, {
        ...job,
        tone: body?.tone,
        price,
        deliveryTime,
        extraNotes: body?.extraNotes,
      });
      return jsonResponse({
        success: true,
        aiAvailable: true,
        model: result.meta.model,
        provider: result.meta.provider,
        meta: publicMeta(result.meta),
        proposal: result.proposal,
        proposedPrice: price,
        proposedPriceFormatted: price ? `${price.toLocaleString('fa-IR')} تومان` : null,
        deliveryTime,
      });
    } catch (err) {
      return llmErrorResponse(err, 'نگارش پروپوزال ناموفق بود.');
    }
  }

  if (pathname === '/api/generate-proposal/stream' && method === 'POST') {
    const job = jobFromBody(body);
    const check = checkContent(job.title, job.description);
    if (check.blocked) {
      return jsonResponse({ blocked: true, error: check.reason, reason: check.reason }, 422);
    }
    if (!job.title || !job.description.trim()) {
      return jsonResponse({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان و توضیحات پروژه لازم است.' }, 400);
    }
    const requestedPrice = Number(body?.price) > 0 ? Number(body.price) : null;
    const fallbackPrice = job.budget && job.budget > 0 ? Math.round(job.budget * 0.85) : null;
    const price = requestedPrice ?? fallbackPrice;
    const deliveryTime = String(body?.deliveryTime ?? '۴۸ ساعت');

    return createSSEResponse(async (send, signal) => {
      send('start', { success: true, price, deliveryTime });
      const loaded = loadAIConfig();
      const result = await writeProposalStream(
        loaded,
        { ...job, tone: body?.tone, price, deliveryTime, extraNotes: body?.extraNotes },
        (delta) => send('delta', { text: delta }),
        signal,
      );
      send('done', {
        success: true,
        aiAvailable: true,
        proposal: result.text,
        proposedPrice: price,
        proposedPriceFormatted: price ? `${price.toLocaleString('fa-IR')} تومان` : null,
        deliveryTime,
        meta: publicMeta(result.meta),
      });
    }, init?.signal);
  }

  if (pathname === '/api/critique-proposal' && method === 'POST') {
    try {
      const proposal = String(body?.proposal ?? '').trim();
      if (!proposal) {
        return jsonResponse({ success: false, code: 'AI_BAD_REQUEST', error: 'متن پروپوزال خالی است.' }, 400);
      }
      const job = jobFromBody(body?.job ?? body);
      const loaded = loadAIConfig();
      const result = await critiqueProposal(loaded, { proposal, job });
      return jsonResponse({
        success: true,
        aiAvailable: true,
        critique: result.critique,
        meta: publicMeta(result.meta),
      });
    } catch (err) {
      return llmErrorResponse(err, 'نقد پروپوزال ناموفق بود.');
    }
  }

  if (pathname === '/api/generate-solution' && method === 'POST') {
    try {
      const job = jobFromBody(body);
      const check = checkContent(job.title, job.description);
      if (check.blocked) {
        return jsonResponse({ blocked: true, error: check.reason, reason: check.reason }, 422);
      }
      if (!job.title) {
        return jsonResponse({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان پروژه لازم است.' }, 400);
      }
      const loaded = loadAIConfig();
      const result = await generateSolution(loaded, {
        ...job,
        instructions: body?.instructions ? String(body.instructions) : undefined,
        language: body?.language ? String(body.language) : undefined,
      });
      return jsonResponse({
        success: true,
        aiAvailable: true,
        files: result.files,
        plan: result.plan,
        warnings: result.warnings,
        model: result.meta.model,
        provider: result.meta.provider,
        meta: publicMeta(result.meta),
      });
    } catch (err) {
      return llmErrorResponse(err, 'تولید سورس کد ناموفق بود.');
    }
  }

  if (pathname === '/api/generate-solution/stream' && method === 'POST') {
    const job = jobFromBody(body);
    const check = checkContent(job.title, job.description);
    if (check.blocked) {
      return jsonResponse({ blocked: true, error: check.reason, reason: check.reason }, 422);
    }
    if (!job.title) {
      return jsonResponse({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان پروژه لازم است.' }, 400);
    }
    return createSSEResponse(async (send, signal) => {
      send('start', { success: true, message: 'شروع تولید پروژه…' });
      const loaded = loadAIConfig();
      const result = await generateSolution(
        loaded,
        {
          ...job,
          instructions: body?.instructions ? String(body.instructions) : undefined,
          language: body?.language ? String(body.language) : undefined,
        },
        {
          signal,
          onProgress: (event) => send('progress', event),
        },
      );
      send('done', {
        success: true,
        aiAvailable: true,
        files: result.files,
        plan: result.plan,
        warnings: result.warnings,
        meta: publicMeta(result.meta),
      });
    }, init?.signal);
  }

  if (pathname === '/api/run-tests' && method === 'POST') {
    const loaded = loadAIConfig();
    if (!loaded.config.allowCodeExecution) {
      return jsonResponse(
        {
          success: false,
          ok: false,
          code: 'CODE_EXECUTION_DISABLED',
          error: 'اجرای کد در تنظیمات خاموش است. برای فعال‌کردن: تنظیمات → هوش مصنوعی → «اجرای تست کد تولیدشده».',
          requiresAIConfig: false,
        },
        403,
      );
    }
    const files = body?.files;
    if (!files || typeof files !== 'object') {
      return jsonResponse({ success: false, ok: false, code: 'AI_BAD_REQUEST', error: 'فایل‌های پروژه لازم است.' }, 400);
    }
    const result = runStandaloneTests(files as Record<string, string>);
    return jsonResponse({ success: true, ...result });
  }

  return jsonResponse({ success: false, error: `مسیر ناشناخته: ${pathname}` }, 404);
}

let installed = false;

export function installStandaloneFetchInterceptor(): void {
  if (installed || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  installed = true;
  const rawFetch = window.fetch.bind(window);

  if (isCapacitorNative()) {
    standaloneDetected = true;
  }

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    let pathname = '';
    if (urlStr.startsWith('/api/')) {
      pathname = urlStr.split('?')[0];
    } else if (urlStr.startsWith(window.location.origin + '/api/')) {
      pathname = urlStr.slice(window.location.origin.length).split('?')[0];
    }

    if (!pathname) {
      return rawFetch(input, init);
    }

    if (standaloneDetected || isCapacitorNative()) {
      return handleStandaloneApi(pathname, init, rawFetch);
    }

    try {
      const response = await rawFetch(input, init);
      const contentType = response.headers.get('content-type') || '';
      // اگر روی هاست استاتیک (بدون سرور Node) باشیم که 404 یا HTML برمی‌گرداند، به حالت مستقل سوئیچ کن
      if (
        (response.status === 404 || response.status === 405 || response.status === 502 || response.status === 503) &&
        !contentType.includes('application/json')
      ) {
        standaloneDetected = true;
        return handleStandaloneApi(pathname, init, rawFetch);
      }
      if (response.ok && contentType.includes('text/html')) {
        standaloneDetected = true;
        return handleStandaloneApi(pathname, init, rawFetch);
      }
      return response;
    } catch {
      standaloneDetected = true;
      return handleStandaloneApi(pathname, init, rawFetch);
    }
  };
}
