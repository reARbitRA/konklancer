/**
 * SPEC-008 — کاتالوگ providerهای هوش مصنوعی و شمای تنظیمات.
 *
 * این فایل بین سرور و UI مشترک است و هیچ وابستگی‌ای به Node ندارد.
 * هر providerای که API سازگار با OpenAI دارد (chat/completions + models) پشتیبانی می‌شود؛
 * به همین دلیل می‌توان بدون تغییر کد از OpenAI، OpenRouter، Groq، Gemini (endpoint سازگار)،
 * DeepSeek، Mistral، Cerebras، Together، Ollama و LM Studio استفاده کرد.
 */

export type AIProviderKind =
  | 'openai'
  | 'openrouter'
  | 'groq'
  | 'gemini'
  | 'deepseek'
  | 'mistral'
  | 'cerebras'
  | 'together'
  | 'ollama'
  | 'lmstudio'
  | 'gateway'
  | 'custom';

export interface ProviderPreset {
  kind: AIProviderKind;
  label: string;
  /** آدرس پایه‌ی سازگار با OpenAI (بدون /chat/completions) */
  baseUrl: string;
  requiresKey: boolean;
  /** نشانی ساخت کلید (اگر وجود دارد) */
  keyUrl?: string;
  docsUrl?: string;
  /** توضیح کوتاه فارسی برای UI */
  hint: string;
  /** پیش‌فرض JSON mode برای این provider */
  jsonMode: boolean;
  /** gateway کانکرد taskType/privacy را خودش مدیریت می‌کند */
  gateway?: boolean;
  local?: boolean;
}

export const PROVIDER_PRESETS: Record<AIProviderKind, ProviderPreset> = {
  openai: {
    kind: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    keyUrl: 'https://platform.openai.com/api-keys',
    docsUrl: 'https://platform.openai.com/docs/api-reference/chat',
    hint: 'مدل‌های GPT؛ سریع‌ترین مسیر برای خروجی ساختاریافته و استریم.',
    jsonMode: true,
  },
  openrouter: {
    kind: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    requiresKey: true,
    keyUrl: 'https://openrouter.ai/keys',
    docsUrl: 'https://openrouter.ai/docs',
    hint: 'صدها مدل (از جمله مدل‌های رایگان) با یک کلید.',
    jsonMode: true,
  },
  groq: {
    kind: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    requiresKey: true,
    keyUrl: 'https://console.groq.com/keys',
    docsUrl: 'https://console.groq.com/docs/openai',
    hint: 'استنتاج بسیار سریع مدل‌های باز؛ برای دسته‌بندی و تحلیل روزمره عالی است.',
    jsonMode: true,
  },
  gemini: {
    kind: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    requiresKey: true,
    keyUrl: 'https://aistudio.google.com/app/apikey',
    docsUrl: 'https://ai.google.dev/gemini-api/docs/openai',
    hint: 'از طریق endpoint سازگار با OpenAI؛ سهمیه‌ی رایگان دارد.',
    jsonMode: true,
  },
  deepseek: {
    kind: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    requiresKey: true,
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/',
    hint: 'مدل‌های ارزان و قوی برای کدنویسی و تحلیل.',
    jsonMode: true,
  },
  mistral: {
    kind: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    requiresKey: true,
    keyUrl: 'https://console.mistral.ai/api-keys/',
    docsUrl: 'https://docs.mistral.ai/api/',
    hint: 'مدل‌های اروپایی با سهمیه‌ی رایگان و خروجی JSON.',
    jsonMode: true,
  },
  cerebras: {
    kind: 'cerebras',
    label: 'Cerebras',
    baseUrl: 'https://api.cerebras.ai/v1',
    requiresKey: true,
    keyUrl: 'https://cloud.cerebras.ai/',
    docsUrl: 'https://inference-docs.cerebras.ai/',
    hint: 'استنتاج فوق‌سریع مدل‌های باز.',
    jsonMode: true,
  },
  together: {
    kind: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    requiresKey: true,
    keyUrl: 'https://api.together.ai/settings/api-keys',
    docsUrl: 'https://docs.together.ai/',
    hint: 'مدل‌های باز میزبانی‌شده با پرداخت به‌ازای مصرف.',
    jsonMode: true,
  },
  ollama: {
    kind: 'ollama',
    label: 'Ollama (محلی)',
    baseUrl: 'http://localhost:11434/v1',
    requiresKey: false,
    docsUrl: 'https://github.com/ollama/ollama/blob/main/docs/openai.md',
    hint: 'کاملاً محلی و خصوصی؛ ابتدا Ollama را نصب و یک مدل را pull کنید.',
    jsonMode: true,
    local: true,
  },
  lmstudio: {
    kind: 'lmstudio',
    label: 'LM Studio (محلی)',
    baseUrl: 'http://localhost:1234/v1',
    requiresKey: false,
    docsUrl: 'https://lmstudio.ai/docs/app/api/endpoints/openai',
    hint: 'سرور محلی سازگار با OpenAI؛ بدون نیاز به اینترنت.',
    jsonMode: true,
    local: true,
  },
  gateway: {
    kind: 'gateway',
    label: 'Konkred Gateway',
    baseUrl: 'http://localhost:4000',
    requiresKey: true,
    docsUrl: 'https://github.com/reARbitRA/konkred-AI-ecosystem',
    hint: 'گیت‌وی اختصاصی پروژه؛ چرخش کلیدهای رایگان و انتخاب مدل بر اساس taskType.',
    jsonMode: false,
    gateway: true,
  },
  custom: {
    kind: 'custom',
    label: 'سازگار با OpenAI (دلخواه)',
    baseUrl: '',
    requiresKey: false,
    hint: 'هر سروری که /chat/completions و /models سازگار با OpenAI دارد.',
    jsonMode: true,
  },
};

export const PROVIDER_LIST: ProviderPreset[] = Object.values(PROVIDER_PRESETS);

/** جای‌نگهدار کلید ذخیره‌شده؛ هرگز کلید واقعی به مرورگر برنمی‌گردد. */
export const MASKED_KEY = '••••••••';

export interface AIConnection {
  id: string;
  label: string;
  kind: AIProviderKind;
  baseUrl: string;
  /** فقط در بدنه‌ی PUT (ورودی) و داخل سرور استفاده می‌شود. */
  apiKey?: string;
  /** در پاسخ GET: آیا کلید ذخیره شده است؟ */
  hasKey?: boolean;
  modelFast: string;
  modelStrong: string;
  enabled: boolean;
  jsonMode: boolean;
  createdAt?: string;
  /** ui = ساخته‌شده در تنظیمات؛ env = آمده از متغیرهای محیطی (فقط‌خواندنی) */
  origin?: 'ui' | 'env';
  lastTest?: {
    ok: boolean;
    at: string;
    latencyMs?: number;
    model?: string;
    message?: string;
  };
}

export interface AIProfile {
  name: string;
  headline: string;
  skills: string[];
  portfolio: string;
  toneNotes: string;
  hourlyRate?: number;
}

export interface AIConfig {
  version: 1;
  activeId: string | null;
  connections: AIConnection[];
  fallbackEnabled: boolean;
  temperature: number;
  timeoutMs: number;
  cacheTtlHours: number;
  privacy: 'any' | 'private';
  allowCodeExecution: boolean;
  profile: AIProfile;
}

export const DEFAULT_PROFILE: AIProfile = {
  name: '',
  headline: '',
  skills: [],
  portfolio: '',
  toneNotes: '',
};

export function defaultAIConfig(): AIConfig {
  return {
    version: 1,
    activeId: null,
    connections: [],
    fallbackEnabled: true,
    temperature: 0.35,
    timeoutMs: 120_000,
    cacheTtlHours: 168,
    privacy: 'any',
    allowCodeExecution: false,
    profile: { ...DEFAULT_PROFILE },
  };
}

export const providerPreset = (kind: string): ProviderPreset =>
  PROVIDER_PRESETS[kind as AIProviderKind] ?? PROVIDER_PRESETS.custom;

/** آدرس پایه را نرمال می‌کند: بدون اسلش انتهایی، و اگر کاربر /v1 را جا انداخته بود اضافه نمی‌کند. */
export function normalizeBaseUrl(url: string): string {
  return (url || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(chat\/completions|completions|models)$/i, '')
    .replace(/\/+$/, '');
}

/**
 * انتخاب خودکار مدل از فهرست provider.
 * به‌جای هاردکد کردن نام مدل‌ها (که هر چند ماه عوض می‌شوند)، از نام‌ها الگو می‌گیریم:
 *  - fast: mini/flash/instant/small/lite/8b/7b/haiku/nano
 *  - strong: pro/large/70b/sonnet/opus/reasoner/o3/gpt-5/max/coder
 */
const NON_CHAT = /embed|embedding|whisper|tts|speech|dall-?e|image|moderation|rerank|guard|vision-only/i;
const FAST_HINT = /mini|flash|instant|small|lite|nano|haiku|8b|7b|3b|1b|turbo|fast/i;
const STRONG_HINT = /pro$|-pro|large|70b|72b|120b|405b|sonnet|opus|reasoner|o3|o1|gpt-5|gpt-4\.1|max$|-max|qwen.*coder|deepseek-coder|32b|30b|27b|22b|14b/i;

export function pickModels(ids: string[]): { fast: string; strong: string } {
  const chat = ids
    .map((id) => String(id || '').trim())
    .filter((id) => id && !NON_CHAT.test(id));
  if (chat.length === 0) return { fast: '', strong: '' };
  const fast = chat.find((id) => FAST_HINT.test(id)) ?? chat[0];
  // اول مدل‌های قوی شناخته‌شده، بعد اولین مدل غیر-fast تا هیچ‌وقت strong = fast نشود.
  const strongCandidates = chat.filter((id) => id !== fast);
  const strong = strongCandidates.find((id) => STRONG_HINT.test(id)) ?? strongCandidates[0] ?? fast;
  return { fast, strong };
}

/** اعتبارسنجی سبک سمت کلاینت برای فرم تنظیمات. */
export function validateConnectionDraft(draft: Partial<AIConnection>): string | null {
  const kind = draft.kind as AIProviderKind;
  if (!kind || !PROVIDER_PRESETS[kind]) return 'نوع provider نامعتبر است.';
  const preset = PROVIDER_PRESETS[kind];
  const baseUrl = normalizeBaseUrl(draft.baseUrl || '');
  if (!baseUrl) return 'آدرس پایه (Base URL) لازم است.';
  if (!/^https?:\/\//i.test(baseUrl)) return 'آدرس پایه باید با http:// یا https:// شروع شود.';
  if (preset.requiresKey && !(draft.apiKey || '').trim() && !draft.hasKey) return 'کلید API لازم است.';
  return null;
}
