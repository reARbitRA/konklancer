/**
 * SPEC-008 — وظیفه‌های هوش مصنوعی Konklancer.
 *
 * هر وظیفه یک prompt فارسی دقیق + اعتبارسنجی ساختاریافته دارد:
 *  analyzeJob()        ارزیابی پروژه (JSON)
 *  writeProposalStream() نگارش پروپوزال (استریم متن)
 *  critiqueProposal()  نقد و امتیاز پروپوزال (JSON)
 *  categorizeJob()     دسته‌بندی با تاکسونومی مشترک
 *  generateSolution()  تولید پروژه‌ی چندفایلی به‌صورت agentic (نقشه → فایل‌ها)
 *
 * قواعد ثابت:
 *  - هیچ فیلد تحلیلی جعلی ساخته نمی‌شود؛ اگر مدل آن را برنگرداند، فیلد null/غایب می‌ماند
 *    و در `warnings` به کاربر گفته می‌شود.
 *  - خطاها با LLMError و کد ثابت بالا می‌آیند تا UI پیام و CTA درست نشان دهد.
 */
import {
  LLMError,
  chat,
  chatStream,
  parseJsonLoose,
  type ChatMessage,
  type ChatMeta,
  type ChatTarget,
  type TaskType,
} from './aiEngine';
import { connectionTarget, orderedConnections, type LoadedAIConfig } from './aiConfig';
import { ALL_CATEGORIES, CATEGORY_KEYS, categoryPromptList } from '../shared/taxonomy';
import type { AIProfile } from '../shared/aiProviders';

/* ------------------------------------------------------------------ */
/* انواع ورودی/خروجی                                                   */
/* ------------------------------------------------------------------ */

export interface JobContext {
  title: string;
  description?: string;
  budget?: number | null;
  budgetFormatted?: string;
  platform?: string;
  proposalsCount?: number | null;
  deadline?: string;
  postedTime?: string;
  category?: string;
  url?: string;
}

export interface AnalysisValue {
  automatabilityScore: number;
  matchScore: number | null;
  recommendedBid: number | null;
  suggestedDuration: string | null;
  technicalStack: string[];
  feasibilityReason: string;
  riskLevel: 'low' | 'medium' | 'high' | null;
  winProbability: string | null;
  suggestedKicker: string | null;
  matchReason: string | null;
  redFlags: string[];
  nextSteps: string[];
  caveats: string[];
}

export interface AnalysisResult {
  analysis: AnalysisValue;
  meta: ChatMeta;
  partial: boolean;
  warnings: string[];
}

export interface ProposalInput extends JobContext {
  tone?: 'friendly_expert' | 'direct_urgent' | 'technical_detailed';
  price?: number | null;
  deliveryTime?: string;
  extraNotes?: string;
}

export interface CritiqueValue {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  rewrittenOpening: string | null;
}

export interface SolutionInput extends JobContext {
  instructions?: string;
  language?: string;
}

export interface SolutionFilePlan {
  path: string;
  purpose: string;
}

export interface SolutionPlanValue {
  projectName: string;
  stack: string;
  summary: string;
  files: SolutionFilePlan[];
  runInstructions: string;
}

export interface SolutionResult {
  files: Record<string, string>;
  plan: SolutionPlanValue;
  meta: ChatMeta;
  warnings: string[];
}

export type SolutionProgress = {
  stage: 'plan' | 'file-start' | 'file-done' | 'done';
  message: string;
  path?: string;
  index?: number;
  total?: number;
};

/* ------------------------------------------------------------------ */
/* ابزارهای مشترک                                                      */
/* ------------------------------------------------------------------ */

const TONE_LABELS: Record<string, string> = {
  friendly_expert: 'صمیمی، حرفه‌ای و قابل‌اعتماد (مثل یک مهندس ارشد که راحت حرف می‌زند)',
  direct_urgent: 'صریح و متمرکز روی تحویل سریع، بدون مقدمه‌چینی',
  technical_detailed: 'فنی و دقیق، با اشاره به معماری، کتابخانه‌ها و تست',
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? text : null;
};

const asStringArray = (value: unknown, max = 8): string[] =>
  Array.isArray(value)
    ? value
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .slice(0, max)
    : [];

const asScore = (value: unknown, min = 0, max = 100): number | null => {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.min(max, Math.max(min, number)));
};

const asRisk = (value: unknown): 'low' | 'medium' | 'high' | null => {
  const text = String(value ?? '').toLowerCase();
  return text === 'low' || text === 'medium' || text === 'high' ? text : null;
};

const formatToman = (value: number) => `${Math.round(value).toLocaleString('fa-IR')} تومان`;

function profileBlock(profile: AIProfile): string {
  const skills = profile.skills.length > 0 ? profile.skills.join('، ') : '—';
  const hourly = profile.hourlyRate ? `${profile.hourlyRate.toLocaleString('fa-IR')} تومان` : '—';
  return [
    `نام/برند: ${profile.name || '—'}`,
    `عنوان حرفه‌ای: ${profile.headline || '—'}`,
    `مهارت‌ها: ${skills}`,
    `نرخ ساعتی هدف: ${hourly}`,
    `نمونه‌کار/اعتبار: ${profile.portfolio || '—'}`,
    `نکات لحن و ترجیح‌ها: ${profile.toneNotes || '—'}`,
  ].join('\n');
}

function jobBlock(job: JobContext): string {
  const lines = [
    `عنوان: ${job.title}`,
    job.platform ? `پلتفرم: ${job.platform}` : null,
    job.budget && job.budget > 0 ? `بودجه‌ی اعلام‌شده: ${formatToman(job.budget)}` : 'بودجه‌ی اعلام‌شده: نامشخص',
    job.budgetFormatted && !(job.budget && job.budget > 0) ? `بودجه (متن پلتفرم): ${job.budgetFormatted}` : null,
    job.proposalsCount !== undefined && job.proposalsCount !== null ? `تعداد پیشنهادهای فعلی: ${job.proposalsCount}` : null,
    job.deadline ? `مهلت: ${job.deadline}` : null,
    job.postedTime ? `زمان انتشار: ${job.postedTime}` : null,
    job.category ? `دسته: ${job.category}` : null,
    job.url ? `لینک آگهی: ${job.url}` : null,
  ].filter(Boolean) as string[];
  const description = (job.description ?? '').trim();
  return `${lines.join('\n')}\n\nتوضیحات کارفرما:\n${description || '—'}`;
}

/** جمع‌بندی کوتاه از ابزار و مصرف توکن برای نمایش در UI (بدون متن prompt). */
export function publicMeta(meta: ChatMeta) {
  return {
    model: meta.model,
    provider: meta.provider,
    cached: meta.cached,
    latencyMs: meta.latencyMs,
    streamed: meta.streamed,
    usage: meta.usage ?? null,
  };
}

/**
 * تلاش روی اتصال فعال و سپس fallback (اگر روشن باشد).
 * اگر اتصال اول در میانه‌ی استریم شکست بخورد و متنی تولید شده باشد، دوباره تلاش نمی‌کنیم.
 */
async function runWithFallback<T>(
  loaded: LoadedAIConfig,
  run: (target: ChatTarget) => Promise<T>,
): Promise<T> {
  const targets = orderedConnections(loaded.config).map((connection) => connectionTarget(connection, loaded.config));
  if (targets.length === 0) {
    throw new LLMError(
      'AI_NOT_CONFIGURED',
      'هیچ اتصال هوش مصنوعی پیکربندی نشده است. از «تنظیمات → هوش مصنوعی» یک provider و کلید اضافه کنید.',
      503,
    );
  }
  let lastError: unknown = null;
  for (const target of targets) {
    try {
      return await run(target);
    } catch (error) {
      lastError = error;
      if (error instanceof LLMError && error.code === 'AI_ABORTED') throw error;
      const message = error instanceof LLMError ? `${error.code}: ${error.message}` : (error as Error)?.message;
      console.warn(`[ai] ${target.label} failed; trying next connection if any. ${message}`);
      if (targets.indexOf(target) < targets.length - 1) continue;
    }
  }
  throw lastError;
}

/** یک وظیفه‌ی JSON با پارس تحمل‌پذیر و یک تلاش «ترمیم» توسط خود مدل. */
async function jsonTask<T>(options: {
  loaded: LoadedAIConfig;
  messages: ChatMessage[];
  tier: 'fast' | 'strong';
  maxTokens: number;
  taskType: TaskType;
  cacheKey?: string;
  validate: (raw: any) => { value: T; warnings: string[] } | null;
}): Promise<{ value: T; meta: ChatMeta; warnings: string[] }> {
  const request = {
    messages: options.messages,
    taskType: options.taskType,
    modelTier: options.tier,
    maxTokens: options.maxTokens,
    temperature: options.loaded.config.temperature,
    json: true,
    cacheKey: options.cacheKey,
    // پاسخ خراب/ناقص هرگز کش نمی‌شود؛ وگرنه تا انقضای TTL همان خطا تکرار می‌شد.
    cacheValidate: (text: string) => {
      const parsed = parseJsonLoose(text);
      return Boolean(parsed && options.validate(parsed));
    },
  } as const;

  const first = await runWithFallback(options.loaded, (target) => chat(request, target));
  const parsed = parseJsonLoose<any>(first.text);
  const validated = parsed ? options.validate(parsed) : null;
  if (validated) return { value: validated.value, meta: first.meta, warnings: validated.warnings };

  // ترمیم: خروجی خراب/ناقص را به مدل بده و فقط JSON معتبر بخواه.
  const repairPrompt = [
    'خروجی قبلی تو JSON معتبر یا کامل نبود. دوباره فقط JSON معتبر برگردان؛ هیچ متن، توضیح یا ``` ننویس.',
    'اگر فیلدی را نمی‌دانی، همان فیلد را با null یا آرایه‌ی خالی بده. مقادیر عددی را بدون جداکننده بنویس.',
    '',
    'خروجی قبلی:',
    String(first.text).slice(0, 6000),
  ].join('\n');

  const repaired = await runWithFallback(options.loaded, (target) =>
    chat(
      {
        messages: [...options.messages, { role: 'assistant', content: String(first.text).slice(0, 6000) }, { role: 'user', content: repairPrompt }],
        taskType: options.taskType,
        modelTier: 'strong',
        maxTokens: options.maxTokens,
        temperature: 0,
        json: true,
        noCache: true,
      },
      target,
    ),
  );

  const parsedAgain = parseJsonLoose<any>(repaired.text);
  const validatedAgain = parsedAgain ? options.validate(parsedAgain) : null;
  if (!validatedAgain) {
    throw new LLMError(
      'AI_BAD_RESPONSE',
      'پاسخ مدل ساختار معتبر نداشت (حتی پس از یک تلاش ترمیم). دوباره تلاش کنید یا مدل قوی‌تری انتخاب کنید.',
      502,
      String(parsedAgain ?? repaired.text).slice(0, 400),
    );
  }
  return { value: validatedAgain.value, meta: repaired.meta, warnings: ['پاسخ اول ناقص بود و با تلاش ترمیم اصلاح شد.'] };
}

/* ------------------------------------------------------------------ */
/* تحلیل پروژه                                                         */
/* ------------------------------------------------------------------ */

const ANALYSIS_SYSTEM = `تو یک تحلیلگر ارشد بازار فریلنسری و معمار راهکارهای هوش مصنوعی هستی.
فقط یک شیء JSON معتبر برگردان. هیچ متن اضافه، مقدمه، توضیح یا بلوک کد ننویس.
همه‌ی متن‌های انسانی را فارسی روان بنویس. اعداد را بدون جداکننده‌ی هزارگان بده.
واقع‌گرا باش و از وعده‌ی بی‌پشتوانه پرهیز کن.`;

function analysisPrompt(job: JobContext, profile: AIProfile): string {
  return `## پروژه
${jobBlock(job)}

## پروفایل من
${profileBlock(profile)}

## وظیفه
این پروژه را برای تصمیم‌گیری «پیشنهاد بدهم یا نه» تحلیل کن.
- automatabilityScore: درصد امکان انجام با هوش مصنوعی + کد/محتوای تولیدی (۰ تا ۱۰۰).
- matchScore: تناسب با مهارت‌های پروفایل من (۰ تا ۱۰۰). اگر پروفایل خالی است، null بده.
- recommendedBid: قیمت پیشنهادی به تومان (عدد صحیح). اگر بودجه نامشخص است، null بده.
- suggestedDuration: زمان واقع‌بینانه‌ی تحویل، مثل «۶ ساعت».
- technicalStack: حداکثر ۶ مورد.
- feasibilityReason: ۲ تا ۳ جمله‌ی دقیق درباره‌ی مسیر اجرا و ریسک‌هایش.
- riskLevel: low | medium | high
- winProbability: مثل «۷۲٪»
- suggestedKicker: یک جمله‌ی کوتاه که در خط اول پیشنهاد، خوانده‌شدن دقیق پروژه را ثابت کند.
- matchReason: چرا با پروفایل من می‌خورد یا نمی‌خورد (۱ تا ۲ جمله).
- redFlags: حداکثر ۴ ریسک مشخص (مبهم‌بودن، بودجه‌ی غیرواقعی، وابستگی بیرونی...).
- nextSteps: حداکثر ۴ قدم عملی بعدی.
- caveats: هر چیزی که مطمئن نیستی یا در آگهی نیامده است.

## قالب دقیق JSON
{
  "automatabilityScore": 82,
  "matchScore": 74,
  "recommendedBid": 4200000,
  "suggestedDuration": "۶ ساعت",
  "technicalStack": ["Python", "FastAPI"],
  "feasibilityReason": "...",
  "riskLevel": "low",
  "winProbability": "۷۲٪",
  "suggestedKicker": "...",
  "matchReason": "...",
  "redFlags": ["..."],
  "nextSteps": ["..."],
  "caveats": ["..."]
}`;
}

function validateAnalysis(raw: any): { value: AnalysisValue; warnings: string[] } | null {
  if (!raw || typeof raw !== 'object') return null;
  const warnings: string[] = [];
  const automatabilityScore = asScore(raw.automatabilityScore);
  const feasibilityReason = asString(raw.feasibilityReason);
  if (automatabilityScore === null || !feasibilityReason) return null;

  const recommendedBidRaw = Number(raw.recommendedBid);
  const recommendedBid =
    Number.isFinite(recommendedBidRaw) && recommendedBidRaw > 0 ? Math.round(recommendedBidRaw) : null;
  if (!recommendedBid) warnings.push('مدل قیمت پیشنهادی نداد؛ خودتان بر اساس بودجه تصمیم بگیرید.');

  return {
    value: {
      automatabilityScore,
      matchScore: asScore(raw.matchScore),
      recommendedBid,
      suggestedDuration: asString(raw.suggestedDuration),
      technicalStack: asStringArray(raw.technicalStack, 8),
      feasibilityReason,
      riskLevel: asRisk(raw.riskLevel),
      winProbability: asString(raw.winProbability),
      suggestedKicker: asString(raw.suggestedKicker),
      matchReason: asString(raw.matchReason),
      redFlags: asStringArray(raw.redFlags, 6),
      nextSteps: asStringArray(raw.nextSteps, 6),
      caveats: asStringArray(raw.caveats, 6),
    },
    warnings,
  };
}

export async function analyzeJob(loaded: LoadedAIConfig, job: JobContext): Promise<AnalysisResult> {
  if (!job.title?.trim()) throw new LLMError('AI_BAD_REQUEST', 'عنوان پروژه لازم است.', 400);
  if (!(job.description ?? '').trim()) {
    throw new LLMError(
      'AI_BAD_REQUEST',
      'برای تحلیل دقیق، توضیحات پروژه لازم است. متن کامل آگهی را وارد کنید (لینک به‌تنهایی کافی نیست).',
      400,
    );
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: ANALYSIS_SYSTEM },
    { role: 'user', content: analysisPrompt(job, loaded.config.profile) },
  ];
  const cacheKey = `analyze:v2|${job.platform}|${job.title}|${job.description}|${job.budget}|${JSON.stringify(loaded.config.profile)}`;
  const result = await jsonTask({
    loaded,
    messages,
    tier: 'strong',
    maxTokens: 1600,
    taskType: 'general',
    cacheKey,
    validate: validateAnalysis,
  });

  const partial =
    result.value.recommendedBid === null ||
    result.value.matchScore === null ||
    result.value.riskLevel === null ||
    result.value.winProbability === null;

  return {
    analysis: result.value,
    meta: result.meta,
    partial,
    warnings: result.warnings,
  };
}

/* ------------------------------------------------------------------ */
/* پروپوزال                                                            */
/* ------------------------------------------------------------------ */

function proposalPrompt(input: ProposalInput, profile: AIProfile): string {
  const tone = TONE_LABELS[input.tone ?? 'friendly_expert'] ?? TONE_LABELS.friendly_expert;
  const price =
    input.price && input.price > 0
      ? `${input.price.toLocaleString('fa-IR')} تومان`
      : input.budget && input.budget > 0
        ? `${Math.round(input.budget * 0.85).toLocaleString('fa-IR')} تومان (پیشنهادِ حدود ۸۵٪ بودجه)`
        : 'قابل مذاکره';
  return `## پروژه
${jobBlock(input)}

## پروفایل من
${profileBlock(profile)}

## تصمیم من
- قیمت: ${price}
- زمان تحویل: ${input.deliveryTime || '۴۸ ساعت'}
- لحن: ${tone}
${input.extraNotes ? `- نکته‌ی اضافه‌ی من: ${input.extraNotes}` : ''}

## قواعد نوشتن
۱. فقط متن پروپوزال را بنویس؛ بدون JSON، عنوان، بولت، نقل‌قول یا توضیح اضافه.
۲. حداکثر ۴ جمله. جمله‌ی اول باید به یک جزئیات مشخص و منحصربه‌فرد از آگهی اشاره کند تا کارفرما مطمئن شود متن را خوانده‌ای.
۳. یک جمله‌ی کوتاه درباره‌ی مسیر اجرا/تست و تحویل با README فارسی بنویس.
۴. از عبارت‌های کلیشه‌ای مثل «با کمال میل»، «تضمین ۱۰۰٪»، «در اسرع وقت»، «با توجه به اینکه» استفاده نکن.
۵. قیمت و زمان را طبیعی و بدون جدول ذکر کن.
۶. ادعایی که قابل انجام نیست نکن؛ اگر ابهام مهمی هست، یک سؤال کوتاه در پایان بپرس.`;
}

export async function writeProposalStream(
  loaded: LoadedAIConfig,
  input: ProposalInput,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; meta: ChatMeta }> {
  if (!(input.description ?? '').trim()) {
    throw new LLMError('AI_BAD_REQUEST', 'برای نگارش پروپوزال هدفمند، متن توضیحات پروژه لازم است.', 400);
  }
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'تو یک فریلنسر ارشد فارسی‌زبان هستی که پروپوزال‌های انسانی، دقیق و بدون کلیشه می‌نویسد. فقط متن پروپوزال را برگردان.',
    },
    { role: 'user', content: proposalPrompt(input, loaded.config.profile) },
  ];

  const targets = orderedConnections(loaded.config).map((connection) => connectionTarget(connection, loaded.config));
  if (targets.length === 0) {
    throw new LLMError(
      'AI_NOT_CONFIGURED',
      'هیچ اتصال هوش مصنوعی پیکربندی نشده است. از «تنظیمات → هوش مصنوعی» یک provider و کلید اضافه کنید.',
      503,
    );
  }

  let lastError: unknown = null;
  for (const target of targets) {
    let emitted = false;
    try {
      const result = await chatStream(
        {
          messages,
          taskType: 'proposal',
          modelTier: 'strong',
          maxTokens: 700,
          temperature: Math.max(0.4, loaded.config.temperature),
          signal,
        },
        target,
        (delta) => {
          if (!delta) return;
          emitted = true;
          onDelta(delta);
        },
      );
      return { text: result.text.trim(), meta: result.meta };
    } catch (error) {
      lastError = error;
      if (error instanceof LLMError && error.code === 'AI_ABORTED') throw error;
      console.warn(`[ai] proposal via ${target.label} failed:`, (error as Error)?.message);
      if (emitted) throw error;
    }
  }
  throw lastError;
}

export interface ProposalResult {
  proposal: string;
  meta: ChatMeta;
}

/** مسیر غیراستریم (سازگاری/تست). */
export async function writeProposal(loaded: LoadedAIConfig, input: ProposalInput): Promise<ProposalResult> {
  let text = '';
  const result = await writeProposalStream(loaded, input, (delta) => {
    text += delta;
  });
  return { proposal: result.text || text, meta: result.meta };
}

/* ------------------------------------------------------------------ */
/* نقد پروپوزال                                                        */
/* ------------------------------------------------------------------ */

export async function critiqueProposal(
  loaded: LoadedAIConfig,
  input: { proposal: string; job: JobContext },
): Promise<{ critique: CritiqueValue; meta: ChatMeta }> {
  const proposal = input.proposal?.trim();
  if (!proposal) throw new LLMError('AI_BAD_REQUEST', 'متن پروپوزال خالی است.', 400);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'تو یک کارفرمای سخت‌گیر و منصف هستی که هزاران پروپوزال فارسی خوانده‌ای. فقط JSON معتبر برگردان.',
    },
    {
      role: 'user',
      content: `## پروژه
${jobBlock(input.job)}

## پروپوزالی که برایم فرستاده شده
${proposal.slice(0, 6000)}

## وظیفه
این پروپوزال را نقد کن:
- score: ۰ تا ۱۰۰ (شانس واقعی جلب توجه من)
- verdict: یک جمله‌ی داوری صریح
- strengths: حداکثر ۳ نقطه‌قوت مشخص (اگر ندارد، آرایه‌ی خالی)
- improvements: حداکثر ۴ اصلاح مشخص و قابل اجرا
- rewrittenOpening: بازنویسی فقط جمله‌ی اول (یا null)

JSON:
{"score": 68, "verdict": "...", "strengths": ["..."], "improvements": ["..."], "rewrittenOpening": "..."}`,
    },
  ];

  const result = await jsonTask({
    loaded,
    messages,
    tier: 'strong',
    maxTokens: 800,
    taskType: 'general',
    cacheKey: `critique:v1|${proposal}|${input.job.title}|${JSON.stringify(loaded.config.profile)}`,
    validate: (raw) => {
      const score = asScore(raw?.score);
      const verdict = asString(raw?.verdict);
      if (score === null || !verdict) return null;
      return {
        value: {
          score,
          verdict,
          strengths: asStringArray(raw?.strengths, 4),
          improvements: asStringArray(raw?.improvements, 5),
          rewrittenOpening: asString(raw?.rewrittenOpening),
        },
        warnings: [],
      };
    },
  });

  return { critique: result.value, meta: result.meta };
}

/* ------------------------------------------------------------------ */
/* دسته‌بندی                                                           */
/* ------------------------------------------------------------------ */

export async function categorizeJobAI(
  loaded: LoadedAIConfig,
  input: { title: string; description?: string },
): Promise<{ category: string | null; confidence: number | null; meta: ChatMeta | null }> {
  const text = `${input.title} ${input.description ?? ''}`.trim();
  if (!text) return { category: null, confidence: null, meta: null };
  try {
    const result = await jsonTask({
      loaded,
      messages: [
        {
          role: 'system',
          content: `دسته‌بند دقیق پروژه‌های فریلنسری هستی. فقط JSON معتبر با کلید category برگردان.
دسته‌های مجاز (کلید = برچسب فارسی):
${categoryPromptList()}`,
        },
        {
          role: 'user',
          content: `عنوان: ${input.title}\nتوضیحات: ${(input.description ?? '').slice(0, 4000)}\n\nفقط یکی از کلیدها را انتخاب کن:
{"category":"کلید","confidence":0.0}`,
        },
      ],
      tier: 'fast',
      maxTokens: 120,
      taskType: 'extraction',
      cacheKey: `category:v1|${text}`,
      validate: (raw) => {
        const key = String(raw?.category ?? '').trim();
        if (!CATEGORY_KEYS.includes(key)) return null;
        const confidence = Number(raw?.confidence);
        return {
          value: {
            category: key,
            confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
          },
          warnings: [],
        };
      },
    });
    return { ...result.value, meta: result.meta };
  } catch (error) {
    console.warn('[ai] categorize fallback to rules:', (error as Error)?.message);
    return { category: null, confidence: null, meta: null };
  }
}

/* ------------------------------------------------------------------ */
/* تولید پروژه‌ی چندفایلی (agentic)                                     */
/* ------------------------------------------------------------------ */

const MAX_FILES = 12;
const MAX_FILE_BYTES = 220_000;
const MAX_TOTAL_BYTES = 1_500_000;
const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9._\/-]*$/;
const BLOCKED_EXT = /\.(exe|dll|bin|so|dylib|zip|rar|7z|tar|gz|png|jpe?g|gif|webp|ico|mp4|mp3|wav|pdf|woff2?|ttf)$/i;

export function sanitizeSolutionFiles(input: unknown): { files: Record<string, string>; warnings: string[] } {
  const warnings: string[] = [];
  const files: Record<string, string> = {};
  let total = 0;
  if (!input || typeof input !== 'object') return { files, warnings: ['مدل هیچ فایلی برنگرداند.'] };
  const entries = Object.entries(input as Record<string, unknown>);
  for (const [rawPath, rawContent] of entries) {
    if (Object.keys(files).length >= MAX_FILES) {
      warnings.push(`بیش از ${MAX_FILES} فایل نادیده گرفته شد.`);
      break;
    }
    const filePath = String(rawPath).replace(/^\.\//, '').trim();
    if (!filePath || !SAFE_PATH.test(filePath) || filePath.includes('..') || filePath.startsWith('/') || BLOCKED_EXT.test(filePath)) {
      warnings.push(`مسیر ناامن یا نامناسب رد شد: ${filePath}`);
      continue;
    }
    let content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);
    content = stripFence(content);
    if (!content.trim()) continue;
    const bytes = Buffer.byteLength(content, 'utf8');
    if (bytes > MAX_FILE_BYTES) {
      warnings.push(`فایل ${filePath} بزرگ‌تر از حد مجاز بود و کوتاه شد.`);
      content = content.slice(0, MAX_FILE_BYTES);
    }
    total += Buffer.byteLength(content, 'utf8');
    if (total > MAX_TOTAL_BYTES) {
      warnings.push('حجم کل فایل‌ها از حد مجاز گذشت؛ بقیه نادیده گرفته شد.');
      break;
    }
    files[filePath] = content;
  }
  return { files, warnings };
}

function stripFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```[a-zA-Z0-9_+-]*\r?\n([\s\S]*?)\r?\n```$/);
  return fenced ? fenced[1] : trimmed;
}

function solutionPlanPrompt(input: SolutionInput): string {
  return `## پروژه
${jobBlock(input)}

## خواسته‌ی اضافه‌ی من
${input.instructions || '—'}

## وظیفه
یک نقشه‌ی فایل حرفه‌ای و مینیمال برای تحویل کامل این پروژه طراحی کن.
- حداکثر ۶ فایل؛ هر فایل یک مسئولیت روشن.
- حتماً README.md فارسی (نصب، اجرا، مثال) و حداقل یک فایل تست قابل اجرا داشته باش.
- پشته‌ی فناوری را صریح بگو. ${input.language ? `زبان اصلی: ${input.language}.` : ''}
- نام فایل‌ها نسبی و امن باشند (بدون .. و بدون مسیر مطلق).

فقط JSON:
{
  "projectName": "...",
  "stack": "...",
  "summary": "۲ جمله درباره‌ی راهکار",
  "files": [{"path": "main.py", "purpose": "..."}],
  "runInstructions": "دستورهای کوتاه اجرا"
}`;
}

function filePrompt(input: SolutionInput, plan: SolutionPlanValue, file: SolutionFilePlan): string {
  const planList = plan.files.map((item) => `- ${item.path}: ${item.purpose}`).join('\n');
  return `## پروژه
${jobBlock(input)}

## نقشه‌ی پروژه
نام: ${plan.projectName}
پشته: ${plan.stack}
خلاصه: ${plan.summary}
فایل‌ها:
${planList}

## وظیفه
محتوای کامل فایل «${file.path}» را بنویس (هدف: ${file.purpose}).
- کد باید کامل، قابل اجرا و بدون TODO باشد.
- خطاها را مدیریت کن و ورودی‌ها را اعتبارسنجی کن.
- برای README.md توضیح فارسی کامل بنویس.
- برای فایل تست، تست‌های واقعی بنویس که با دستور پروژه اجرا شوند.
- فقط محتوای خام فایل را برگردان؛ بدون بلوک کد و بدون توضیح اضافه.`;
}

function validatePlan(raw: any): { value: SolutionPlanValue; warnings: string[] } | null {
  const filesRaw = Array.isArray(raw?.files) ? raw.files : null;
  if (!filesRaw || filesRaw.length === 0) return null;
  const files: SolutionFilePlan[] = [];
  for (const row of filesRaw.slice(0, 6)) {
    const filePath = String(row?.path ?? '').replace(/^\.\//, '').trim();
    if (!filePath || !SAFE_PATH.test(filePath) || filePath.includes('..') || filePath.startsWith('/') || BLOCKED_EXT.test(filePath)) continue;
    if (files.some((file) => file.path === filePath)) continue;
    files.push({ path: filePath, purpose: String(row?.purpose ?? '').slice(0, 300) });
  }
  if (files.length === 0) return null;
  return {
    value: {
      projectName: String(raw?.projectName ?? 'project').slice(0, 80),
      stack: String(raw?.stack ?? '').slice(0, 200),
      summary: String(raw?.summary ?? '').slice(0, 800),
      files,
      runInstructions: String(raw?.runInstructions ?? '').slice(0, 800),
    },
    warnings: [],
  };
}

async function generateSingleShot(
  loaded: LoadedAIConfig,
  input: SolutionInput,
): Promise<{ files: Record<string, string>; plan: SolutionPlanValue; meta: ChatMeta; warnings: string[] }> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'تو یک مهندس نرم‌افزار ارشد و ایجنت کدنویسی هستی. فقط JSON معتبر با کلید files برگردان؛ کلیدها مسیر نسبی فایل و مقدارها محتوای کامل فایل هستند.',
    },
    {
      role: 'user',
      content: `## پروژه
${jobBlock(input)}

## خواسته‌ی اضافه
${input.instructions || '—'}

## وظیفه
یک پروژه‌ی کامل و قابل اجرا بساز: کد اصلی، تست واقعی، README.md فارسی و فایل وابستگی‌ها.
JSON:
{"files": {"main.py": "...", "test_main.py": "...", "README.md": "...", "requirements.txt": "..."}}`,
    },
  ];
  const result = await jsonTask({
    loaded,
    messages,
    tier: 'strong',
    maxTokens: 7000,
    taskType: 'code-generation',
    validate: (raw) => {
      const sanitized = sanitizeSolutionFiles(raw?.files ?? raw);
      if (Object.keys(sanitized.files).length === 0) return null;
      const plan: SolutionPlanValue = {
        projectName: String(raw?.projectName ?? 'project'),
        stack: String(raw?.stack ?? ''),
        summary: '',
        files: Object.keys(sanitized.files).map((filePath) => ({ path: filePath, purpose: '' })),
        runInstructions: String(raw?.runInstructions ?? ''),
      };
      return { value: { files: sanitized.files, plan }, warnings: sanitized.warnings };
    },
  });
  return { ...(result.value as { files: Record<string, string>; plan: SolutionPlanValue }), meta: result.meta, warnings: result.warnings };
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function generateSolution(
  loaded: LoadedAIConfig,
  input: SolutionInput,
  options: { onProgress?: (event: SolutionProgress) => void; signal?: AbortSignal } = {},
): Promise<SolutionResult> {
  if (!input.title?.trim()) throw new LLMError('AI_BAD_REQUEST', 'عنوان پروژه لازم است.', 400);
  const onProgress = options.onProgress ?? (() => {});
  const warnings: string[] = [];

  let plan: SolutionPlanValue;
  let planMeta: ChatMeta;
  try {
    onProgress({ stage: 'plan', message: 'طراحی نقشه‌ی فایل‌ها و انتخاب پشته…' });
    const planResult = await jsonTask({
      loaded,
      messages: [
        {
          role: 'system',
          content: 'تو معمار نرم‌افزار هستی. فقط JSON معتبر نقشه‌ی پروژه را برگردان.',
        },
        { role: 'user', content: solutionPlanPrompt(input) },
      ],
      tier: 'strong',
      maxTokens: 1200,
      taskType: 'general',
      validate: validatePlan,
    });
    plan = planResult.value;
    planMeta = planResult.meta;
  } catch (error) {
    if (options.signal?.aborted) throw new LLMError('AI_ABORTED', 'تولید کد لغو شد.', 499);
    warnings.push(`نقشه‌بندی چندفایلی ناموفق بود (${(error as Error)?.message}); تولید تک‌مرحله‌ای انجام شد.`);
    const single = await generateSingleShot(loaded, input);
    onProgress({ stage: 'done', message: 'پروژه‌ی تک‌مرحله‌ای آماده شد.', total: Object.keys(single.files).length });
    return { ...single, warnings: [...warnings, ...single.warnings] };
  }

  onProgress({
    stage: 'plan',
    message: `نقشه آماده شد: ${plan.files.length} فایل (${plan.stack || 'پشته نامشخص'})`,
    total: plan.files.length,
  });

  const total = plan.files.length;
  const fileContents: Record<string, string> = {};
  let lastMeta = planMeta;

  await mapWithConcurrency(plan.files, 2, async (file, index) => {
    if (options.signal?.aborted) throw new LLMError('AI_ABORTED', 'تولید کد لغو شد.', 499);
    onProgress({
      stage: 'file-start',
      message: `نوشتن فایل ${index + 1} از ${total}: ${file.path}`,
      path: file.path,
      index: index + 1,
      total,
    });
    const result = await runWithFallback(loaded, (target) =>
      chat(
        {
          messages: [
            {
              role: 'system',
              content: 'تو مهندس ارشد نرم‌افزار هستی. فقط محتوای خام فایل درخواستی را برگردان؛ بدون ``` و بدون توضیح.',
            },
            { role: 'user', content: filePrompt(input, plan, file) },
          ],
          taskType: 'code-generation',
          modelTier: 'strong',
          maxTokens: 4096,
          temperature: Math.min(0.5, loaded.config.temperature),
          signal: options.signal,
          timeoutMs: loaded.config.timeoutMs,
        },
        target,
      ),
    );
    lastMeta = result.meta;
    fileContents[file.path] = stripFence(result.text);
    onProgress({
      stage: 'file-done',
      message: (() => {
        const chars = result.text.length;
        const size = chars < 1000 ? `${chars.toLocaleString('fa-IR')} نویسه` : `${(chars / 1000).toLocaleString('fa-IR', { maximumFractionDigits: 1 })} هزار نویسه`;
        return `فایل ${file.path} آماده شد (${size})`;
      })(),
      path: file.path,
      index: index + 1,
      total,
    });
  });

  const sanitized = sanitizeSolutionFiles(fileContents);
  if (Object.keys(sanitized.files).length === 0) {
    throw new LLMError('AI_BAD_RESPONSE', 'هیچ فایل معتبری از مدل دریافت نشد.', 502);
  }
  warnings.push(...sanitized.warnings);

  onProgress({ stage: 'done', message: 'همه‌ی فایل‌ها آماده شدند.', total: Object.keys(sanitized.files).length });
  return { files: sanitized.files, plan, meta: lastMeta, warnings };
}

/** هم‌پوشانی نام دسته‌های تاکسونومی با برچسب فارسی (برای UI/گزارش). */
export const categoryLabels = ALL_CATEGORIES.reduce<Record<string, string>>((acc, category) => {
  acc[category.key] = category.fa;
  return acc;
}, {});
