import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { LLMError } from './server/llm';
import { checkContent } from './server/contentFilter';
import { categoryLabel } from './shared/taxonomy';
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
} from './server/aiConfig';
import {
  analyzeJob,
  categorizeJobAI,
  critiqueProposal,
  generateSolution,
  publicMeta,
  writeProposal,
  writeProposalStream,
} from './server/aiTasks';
import { runGeneratedTests } from './server/codeRunner';
import { listModelsForTarget } from './server/aiEngine';
import {
  buildFeed,
  categorize,
  fetchCloudFeedText,
  fetchCloudStatus,
  readCloudFeedConfig,
  requestCloudScan,
  syncCloudFeed,
  waitForCloudScan,
  describeCategories,
  readProjects,
  readScanConfig,
  readScanTargets,
  runScanner,
  scannerBusy,
  type FeedJob,
  cloudTransport,
} from './server/scannerBridge';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Setup Socket.io Server attached to HTTP Server
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(express.json({ limit: '10mb' }));

// AI access: see server/llm.ts (SPEC-006). No provider SDK is used here.

// Initial jobs catalog
const DEFAULT_JOBS = [
  {
    id: 'kar-8812',
    platform: 'کارلانسر',
    platformKey: 'karlancer',
    title: 'ربات تلگرام پیشرفته فوروارد خودکار و حذف تبلیغات بین چند کانال VIP',
    clientName: 'مهرداد رضایی',
    clientRating: 4.7,
    clientReviews: 28,
    budget: 5000000,
    budgetFormatted: '۵,۰۰۰,۰۰۰ تومان',
    deadline: '۲ روز',
    postedTime: '۲۷ دقیقه پیش',
    category: 'ربات تلگرام / پایتون',
    categoryKey: 'automation',
    tags: ['Telegram Bot', 'python-telegram-bot', 'Asyncio', 'Regex'],
    description: 'رباتی نیاز دارم که به عنوان ادمین در ۲ کانال مبدا عضو باشد و به محض ارسال پست، متن آن را بررسی کند، لینک‌های آیدی و تبلیغات متنی را فیلتر کند و در کانال مقصد قرار دهد. سورس مرتب و کامنت‌گذاری شده همراه با داک اجرای لوکال نیاز دارم.',
    proposalsCount: 9,
    avgBid: 4400000,
    status: 'new'
  },
  {
    id: 'par-1044',
    platform: 'پارسکدرز',
    platformKey: 'parskoders',
    title: 'اسکریپت تجمیع و پاکسازی دیتای چند فایل اکسل بزرگ با کتابخانه Pandas',
    clientName: 'شرکت فناوران آریا',
    clientRating: 5.0,
    clientReviews: 42,
    budget: 2800000,
    budgetFormatted: '۲,۸۰۰,۰۰۰ تومان',
    deadline: '۱۲ ساعت',
    postedTime: '۴۲ دقیقه پیش',
    category: 'داده و هوش مصنوعی',
    categoryKey: 'data',
    tags: ['Pandas', 'Excel Automation', 'Python', 'Data Cleaning'],
    description: '۴ فایل اکسل با فرمت‌های کمی متفاوت شامل اطلاعات فاکتورهای فروش سال ۱۴۰۳ داریم. اسکریپتی می‌خواهیم که ستون‌های تکراری را حذف، فرمت تاریخ‌ها را یکسان و یک خروجی یکدست و شسته‌رفته بسازد. زمان تحویل بسیار مهم است.',
    proposalsCount: 4,
    avgBid: 2500000,
    status: 'new'
  },
  {
    id: 'pon-9430',
    platform: 'پونیشا',
    platformKey: 'ponisha',
    title: 'اتصال وب‌هوک پرداخت زرین‌پال و پیامک کاوه‌نگار به اسکریپت فست‌اِی‌پی‌آی (FastAPI)',
    clientName: 'علیرضا ر.',
    clientRating: 4.8,
    clientReviews: 11,
    budget: 4200000,
    budgetFormatted: '۴,۲۰۰,۰۰۰ تومان',
    deadline: '۱ روز',
    postedTime: '۱ ساعت پیش',
    category: 'توسعه API / بک‌اند',
    categoryKey: 'dev',
    tags: ['FastAPI', 'Zarinpal', 'Kavenegar SMS', 'Webhook'],
    description: 'یک مینی‌سرویس پایتون با فست‌ای‌پی‌آی داریم که می‌خواهیم بعد از کال‌بک موفقیت‌آمیز زرین‌پال، پترن پیامکی کاوه‌نگار را برای خریدار شلیک کند و کد سفارش را در دیتابیس لاگ بیندازد.',
    proposalsCount: 7,
    avgBid: 3900000,
    status: 'new'
  },
  {
    id: 'kar-8825',
    platform: 'کارلانسر',
    platformKey: 'karlancer',
    title: 'ربات رصد لحظه‌ای تخفیف‌ها و کالاهای شگفت‌انگیز دیجی‌کالا و ارسال هشدار',
    clientName: 'فروشگاه تیک‌بای',
    clientRating: 4.6,
    clientReviews: 8,
    budget: 6500000,
    budgetFormatted: '۶,۵۰۰,۰۰۰ تومان',
    deadline: '۲ روز',
    postedTime: '۱ ساعت پیش',
    category: 'وب اسکرپینگ / پایتون',
    categoryKey: 'automation',
    tags: ['Python', 'Requests', 'Telegram Notifications', 'Scheduler'],
    description: 'می‌خواهیم یک اسکریپت سبک روی سرور لینوکس اجرا شود و هر ۵ دقیقه لیست تخفیف‌های بالای ۴۰ درصد در دسته‌های خاص را استخراج و به کانال شخصی ما فوروارد کند.',
    proposalsCount: 12,
    avgBid: 5800000,
    status: 'new'
  },
  {
    id: 'par-1052',
    platform: 'پارسکدرز',
    platformKey: 'parskoders',
    title: 'نوشتن اسکریپت تبدیل فایل‌های صوتی به متن با پایتون و مدل Whisper محلی',
    clientName: 'دکتر صابری',
    clientRating: 5.0,
    clientReviews: 19,
    budget: 4000000,
    budgetFormatted: '۴,۰۰۰,۰۰۰ تومان',
    deadline: '۱ روز',
    postedTime: '۲ ساعت پیش',
    category: 'داده و هوش مصنوعی',
    categoryKey: 'data',
    tags: ['Python', 'OpenAI Whisper', 'Audio Processing', 'CLI Tool'],
    description: 'یک برنامه ساده پایتون که فولدری از فایل‌های صوتی ضبط شده (mp3 یا ogg) را بخواند و متن فارسی پیاده‌سازی شده را با فرمت txt در کنار هر فایل ذخیره کند.',
    proposalsCount: 5,
    avgBid: 3600000,
    status: 'new'
  }
];

// Demo-only feed. SPEC-004 R1: fabricated jobs are emitted only when KONKLANCER_DEMO=1.
const DEMO_FEED = process.env.KONKLANCER_DEMO === '1';
// Bridge Feed Pool for real-time live push updates
const BRIDGE_FEED_POOL = [
  {
    title: 'اسکریپت پایتون استخراج دیتای ترب و باسلام همراه با خروجی اکسل و سورس مرتب',
    platform: 'پونیشا',
    platformKey: 'ponisha',
    category: 'وب اسکرپینگ / پایتون',
    categoryKey: 'automation',
    tags: ['Python', 'Torob API', 'Pandas', 'Web Scraping'],
    budget: 4800000,
    deadline: '۱ روز',
    clientName: 'توسعه بازار نوین',
    description: 'اسکریپتی نیاز داریم که به صورت دوره‌ای قیمت و موجودی یک لیست ۵۰۰ تایی کالا را از موتورهای ترب و باسلام استخراج کرده و کمترین قیمت بازار را همراه با نام فروشگاه در یک فایل اکسل گزارش کند.'
  },
  {
    title: 'ربات تلگرام دانلود خودکار ویدیوهای یوتیوب و اینستاگرام با کیفیت‌های مختلف',
    platform: 'کارلانسر',
    platformKey: 'karlancer',
    category: 'ربات تلگرام / پایتون',
    categoryKey: 'automation',
    tags: ['Telegram Bot', 'yt-dlp', 'Asyncio', 'FFmpeg'],
    budget: 6200000,
    deadline: '۲ روز',
    clientName: 'سینا محمدی',
    description: 'رباتی تحت پایتون که کاربر با ارسال لینک اینستاگرام یا یوتیوب، مستقیماً فایل ویدیویی یا صوتی را با فرمت فشرده و بهینه‌شده دریافت کند. سورس کد همراه با راهنمای ران کردن روی داکر لینوکس نیاز است.'
  },
  {
    title: 'اسکریپت اتوماسیون پاکسازی و دسته‌بندی دیتابیس مشتریان با کتابخانه Polars',
    platform: 'پارسکدرز',
    platformKey: 'parskoders',
    category: 'داده و هوش مصنوعی',
    categoryKey: 'data',
    tags: ['Python', 'Polars', 'Data Cleaning', 'Regex'],
    budget: 3700000,
    deadline: '۱۲ ساعت',
    clientName: 'داده‌پردازان افق',
    description: 'یک فایل حجیم ۲۰۰ هزار ردیفی اطلاعات فاکتور داریم که فرمت شماره موبایل‌ها، کدهای پستی و مبالغ در آن دچار بی‌نظمی است. اسکریپت پایتون سریع برای تصحیح مقادیر نامعتبر و خروجی پارکت/اکسل لازم داریم.'
  },
  {
    title: 'اتصال خودکار ووکامرس به سیستم صدور فاکتور رسمی و ارسال پیامک اعتباری',
    platform: 'پونیشا',
    platformKey: 'ponisha',
    category: 'توسعه API / بک‌اند',
    categoryKey: 'dev',
    tags: ['WooCommerce API', 'FastAPI', 'SMS Webhook', 'Python'],
    budget: 5400000,
    deadline: '۱ روز',
    clientName: 'آقای کاظمیان',
    description: 'می‌خواهیم پس از ثبت سفارش در ووکامرس، وب‌هوک به اسکریپت پایتون ما ارسال شود، پیش‌فاکتور PDF تولید گردد و لینک دانلود آن از طریق الگو پیامکی کاوه‌نگار برای خریدار فرستاده شود.'
  },
  {
    title: 'ربات رصد لحظه‌ای بلیت‌های کنسرت و پروازهای چارتری و رزرو خودکار',
    platform: 'کارلانسر',
    platformKey: 'karlancer',
    category: 'اتوماسیون / اسکریپت',
    categoryKey: 'automation',
    tags: ['Python', 'Playwright', 'FastAPI', 'Automation'],
    budget: 7500000,
    deadline: '۲ روز',
    clientName: 'سفرگشت آریا',
    description: 'اسکریپتی که به محض باز شدن ظرفیت پروازهای مسیر خاص، ظرف کمتر از ۱۰ ثانیه نوتیفیکیشن تلگرامی فرستاده و مشخصات مسافر را به طور خودکار تکمیل کند.'
  }
];

let feedIndex = 0;

// ---------------------------------------------------------------------------
// SPEC-004 — فید واقعی از اسکنر فقط‌خواندنی (scanner/out/projects.jsonl)
// ---------------------------------------------------------------------------
const SCAN_CONFIG = readScanConfig();
/** فید ابری (اسکن روی رانرهای گیت‌هاب) — وقتی KONKLANCER_CLOUD_FEED_REPO تنظیم شده باشد فعال است. */
const CLOUD_CONFIG = readCloudFeedConfig(process.env, process.cwd(), SCAN_CONFIG.outFile);
/** شناسه پروژه‌هایی که یک‌بار به UI پوش شده‌اند؛ برای جلوگیری از پوش تکراری. */
const emittedJobIds = new Set<string>();

function emitBridgeLog(message: string, type: 'scan' | 'bid' | 'code' | 'github' | 'payment' = 'scan') {
  io.emit('bridge:log', {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    type,
    message,
  });
}

/** فید فعلی را از خروجی JSONL اسکنر می‌سازد (بدون هیچ تماس شبکه‌ای). */
function loadFeedJobs() {
  const projects = readProjects(SCAN_CONFIG.outFile);
  const feed = buildFeed(projects, {
    include: SCAN_CONFIG.include,
    exclude: SCAN_CONFIG.exclude,
    // خالی بودن یعنی هیچ دسته‌ای محدود نشود: ترجمه، گرافیک، ویدیو، صدا و ... همه در فید می‌آیند.
    categories: SCAN_CONFIG.categories,
    minScore: SCAN_CONFIG.minScore,
  });
  return { projects, jobs: feed.jobs as FeedJob[], scannedAt: feed.scannedAt };
}

function enabledTargets() {
  return readScanTargets(SCAN_CONFIG.cwd).filter((target) => target.enabled);
}

interface ScanOutcome {
  ok: boolean;
  added: number;
  total: number;
  scannedAt: string | null;
  message: string;
  output?: string;
}

/** یک اسکن واقعی: CLI اسکنر را اجرا می‌کند، فید را می‌خواند و پروژه‌های تازه را پوش می‌کند. */
async function performScan(): Promise<ScanOutcome> {
  if (scannerBusy()) {
    return { ok: false, added: 0, total: 0, scannedAt: null, message: 'یک اسکن دیگر در حال اجراست؛ لطفاً چند لحظه بعد تلاش کنید.' };
  }
  const enabled = enabledTargets();
  if (SCAN_CONFIG.platforms.length === 0 && !SCAN_CONFIG.telegram) {
    return {
      ok: false,
      added: 0,
      total: 0,
      scannedAt: null,
      message: 'منبعی برای اسکن تنظیم نشده است: KONKLANCER_SCAN_PLATFORMS یا KONKLANCER_SCAN_TELEGRAM=1 را در .env بگذارید.',
    };
  }
  if (enabled.length === 0) {
    return {
      ok: false,
      added: 0,
      total: 0,
      scannedAt: null,
      message: 'هیچ پلتفرم/کانالی فعال نیست. برای تلگرام: scan_enabled کانال را true کنید؛ برای پلتفرم: ابتدا انتخابگرهای CSS را کالیبره کنید (docs/PERSONAL-SETUP.md).',
    };
  }

  emitBridgeLog(`اجرای اسکن فقط‌خواندنی روی ${enabled.length} منبع فعال...`);
  const run = await runScanner(SCAN_CONFIG);
  if (!run.ok) {
    const tail = run.output.split('\n').map((line) => line.trim()).filter(Boolean).at(-1) ?? '';
    const message = run.timedOut
      ? 'اسکن به مهلت زمانی نرسید و متوقف شد.'
      : tail || 'اسکن ناموفق بود.';
    emitBridgeLog(`اسکن متوقف شد: ${message}`);
    return { ok: false, added: 0, total: 0, scannedAt: null, message, output: run.output };
  }

  const { jobs, scannedAt, projects } = loadFeedJobs();
  const fresh = jobs.filter((job) => !emittedJobIds.has(job.id));
  for (const job of fresh) {
    emittedJobIds.add(job.id);
    io.emit('job:new', job);
  }
  const message = `اسکن تمام شد: ${fresh.length} پروژه جدید از ${projects.length} پروژه در فید.`;
  emitBridgeLog(message);
  return { ok: true, added: fresh.length, total: projects.length, scannedAt, message, output: run.output };
}

// اسکن دوره‌ای اختیاری برای استفاده شخصی (پیش‌فرض: خاموش)
if (SCAN_CONFIG.intervalMinutes > 0) {
  setInterval(() => {
    performScan().catch((err) => console.warn('[scanner] scheduled scan failed:', err?.message ?? err));
  }, SCAN_CONFIG.intervalMinutes * 60_000);
}



/**
 * دسته‌بندی یک پروژه: اول AI (مدل سریع) و در صورت شکست/نبود AI، قواعد کلیدواژه‌ی مشترک.
 * این تابع هرگز endpoint را fail نمی‌کند؛ خروجی همیشه یک کلید معتبر از تاکسونومی است.
 */
async function categorizeJobServer(title: string, description: string): Promise<{ tag: string; source: 'ai' | 'rules'; confidence: number | null; meta: any }> {
  const fallback = categorize(title, description).key;
  const loaded = loadAIConfig();
  if (!aiStatus(loaded).configured) return { tag: fallback, source: 'rules', confidence: null, meta: null };
  const ai = await categorizeJobAI(loaded, { title, description });
  if (ai.category) {
    return { tag: ai.category, source: 'ai', confidence: ai.confidence, meta: ai.meta ? publicMeta(ai.meta) : null };
  }
  return { tag: fallback, source: 'rules', confidence: null, meta: null };
}

// Uniform error mapping for AI endpoints (SPEC-006 R5/R10, SPEC-008).
function sendLLMError(res: Response, err: unknown, fallbackMessage: string) {
  if (err instanceof LLMError) {
    return res.status(err.status || 502).json({
      success: false,
      aiAvailable: false,
      code: err.code,
      error: err.message,
      detail: err.detail ?? null,
      retryAfterSec: err.retryAfterSec ?? null,
      // UI با این پرچم دکمه‌ی «تنظیمات AI» را نشان می‌دهد.
      requiresAIConfig: ['AI_NOT_CONFIGURED', 'AI_AUTH', 'AI_MODEL_NOT_FOUND', 'AI_MODEL_NOT_CONFIGURED'].includes(err.code),
    });
  }
  return res.status(500).json({ success: false, aiAvailable: false, code: 'AI_UPSTREAM', error: fallbackMessage });
}

/* ------------------------- SSE helpers (SPEC-008) ------------------------- */

function sseStart(res: Response) {
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  res.socket?.setNoDelay?.(true);
}

function sseSend(res: Response, event: string, data: unknown) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function sseError(res: Response, err: unknown) {
  if (err instanceof LLMError) {
    sseSend(res, 'error', {
      success: false,
      aiAvailable: false,
      code: err.code,
      error: err.message,
      detail: err.detail ?? null,
      retryAfterSec: err.retryAfterSec ?? null,
      requiresAIConfig: ['AI_NOT_CONFIGURED', 'AI_AUTH', 'AI_MODEL_NOT_FOUND', 'AI_MODEL_NOT_CONFIGURED'].includes(err.code),
    });
    return;
  }
  sseSend(res, 'error', { success: false, aiAvailable: false, code: 'AI_UPSTREAM', error: (err as Error)?.message ?? 'خطای نامشخص' });
}

/** connection ذخیره‌شده یا پیش‌نویس فرم را برمی‌گرداند (برای تست/دریافت مدل قبل از ذخیره). */
function resolveConnectionFromBody(loaded: ReturnType<typeof loadAIConfig>, body: any) {
  const stored = body?.connectionId ? findConnection(loaded.config, String(body.connectionId)) : null;
  const draft = body?.connection && typeof body.connection === 'object' ? draftConnection(body.connection, stored ?? undefined) : null;
  return draft ?? stored;
}

/** فیلدهای مشترک پروژه را از بدنه‌ی درخواست می‌سازد. */
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

async function broadcastNewJob(customPayload?: any) {
  const template = customPayload || BRIDGE_FEED_POOL[feedIndex % BRIDGE_FEED_POOL.length];
  feedIndex++;

  const newJobId = `live-${template.platformKey || 'feed'}-${Date.now().toString().slice(-4)}`;
  const budget = template.budget || 4000000;

  // Determine initial priority based on budget and complexity
  const priority = budget >= 6000000 ? 'High' : budget >= 4000000 ? 'Medium' : 'Low';
  
  // دسته‌بندی با تاکسونومی مشترک (بدون فراخوانی شبکه‌ای؛ برچسب فارسی از همان منبع)
  const categoryKey = template.categoryKey || categorize(template.title, template.description).key;
  const categorizedTag = categoryLabel(categoryKey);

  const newJob = {
    id: newJobId,
    platform: template.platform,
    platformKey: template.platformKey || 'ponisha',
    title: template.title,
    clientName: template.clientName || 'کارفرمای تاییدشده',
    clientRating: 4.9,
    clientReviews: 16,
    budget,
    budgetFormatted: `${budget.toLocaleString('fa-IR')} تومان`,
    deadline: template.deadline || '۱ روز',
    postedTime: 'هم‌اکنون (لحظه‌ای)',
    category: categoryLabel(categoryKey),
    categoryKey: template.categoryKey || 'automation',
    tags: template.tags ? [...template.tags, String(categorizedTag)] : ['Python', String(categorizedTag)],
    description: template.description,
    proposalsCount: 1,
    avgBid: Math.round(budget * 0.9),
    status: 'new',
    priority,
    categorizedTag
  };

  io.emit('job:new', newJob);
  io.emit('bridge:log', {
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    type: 'scan',
    message: `[Socket.io Push] پروژه جدید با تگ ${newJob.categorizedTag} و اولویت ${newJob.priority} از ${newJob.platform} دریافت شد: "${newJob.title}"`,
    jobId: newJob.id,
  });

  return newJob;
}

// Socket.io Bridge Connection Management
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  // Send initial connection handshake
  socket.emit('bridge:status', {
    connected: true,
    activePlatforms: enabledTargets().map((target) => ({ name: target.name, status: 'active', latency: '—' })),
    source: loadFeedJobs().projects.length > 0 ? 'scanner' : DEMO_FEED ? 'demo' : 'empty',
    clientsCount: io.engine.clientsCount,
  });

  socket.emit('bridge:log', {
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    type: 'scan',
    message: 'اتصال فعال وب‌سوکت Socket.io به بریج دریافت آنی پروژه‌ها برقرار شد.',
  });

  // Client requests a scan of the real, read-only scanner (SPEC-004).
  socket.on('scan:trigger', async () => {
    emitBridgeLog('درخواست اسکن زنده از رابط کاربری دریافت شد...');
    const outcome = await performScan();
    if (!outcome.ok) {
      socket.emit('bridge:log', {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        type: 'scan',
        message: outcome.message,
      });
      return;
    }
    socket.emit('scan:done', { added: outcome.added, total: outcome.total, scannedAt: outcome.scannedAt });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Periodic background poller pushing new opportunities to connected clients
if (DEMO_FEED) {
  setInterval(() => {
    if (io.engine.clientsCount > 0) {
      broadcastNewJob();
    }
  }, 45000);
}

// Endpoint: run one real, read-only scan of the configured sources (SPEC-004).
app.post('/api/bridge/trigger-scan', async (_req: Request, res: Response) => {
  const outcome = await performScan();
  res.status(outcome.ok ? 200 : 502).json({ ...outcome, success: outcome.ok, job: null });
});

// Endpoint: وضعیت فید ابری (اسکن روی رانرهای گیت‌هاب)
app.get('/api/bridge/cloud', async (_req: Request, res: Response) => {
  if (!CLOUD_CONFIG) {
    return res.json({
      success: true,
      enabled: false,
      message: 'فید ابری تنظیم نشده است؛ KONKLANCER_CLOUD_FEED_REPO را در .env بگذارید.',
    });
  }
  try {
    const status = await fetchCloudStatus(CLOUD_CONFIG);
    const feedText = await fetchCloudFeedText(CLOUD_CONFIG);
    return res.json({
      success: true,
      enabled: true,
      repo: CLOUD_CONFIG.repo,
      ref: CLOUD_CONFIG.ref,
      hasToken: Boolean(CLOUD_CONFIG.token),
      cloudProjects: feedText ? feedText.split('\n').filter(Boolean).length : 0,
      // روشی که واقعاً استفاده شد: fetch نود یا CLI گیت‌هاب (محیط‌های با گواهی سفارشی)
      transport: cloudTransport(),
      status,
    });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message ?? 'خطای خواندن وضعیت ابری' });
  }
});

// Endpoint: همگام‌سازی فید محلی با آخرین فید ابری (بدون اجرای اسکن)
app.post('/api/bridge/sync-feed', async (_req: Request, res: Response) => {
  if (!CLOUD_CONFIG) {
    return res.status(400).json({ success: false, error: 'فید ابری تنظیم نشده است.' });
  }
  try {
    const result = await syncCloudFeed(CLOUD_CONFIG);
    if (result.written) {
      emitBridgeLog(`فید ابری همگام شد: ${result.cloudProjects} پروژه‌ی ابری · کل ${result.totalProjects}`, 'scan');
    }
    return res.status(result.ok ? 200 : 502).json({ success: result.ok, ...result });
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message ?? 'همگام‌سازی فید ابری ناموفق بود' });
  }
});

// Endpoint: درخواست اسکن ابری (اجرای اسکنر واقعی روی رانر گیت‌هاب) و سپس همگام‌سازی فید
app.post('/api/bridge/cloud-scan', async (req: Request, res: Response) => {
  if (!CLOUD_CONFIG) {
    return res.status(400).json({ success: false, error: 'فید ابری تنظیم نشده است.' });
  }
  try {
    const since = new Date().toISOString();
    const request = await requestCloudScan(CLOUD_CONFIG, {
      platforms: typeof req.body?.platforms === 'string' ? req.body.platforms : undefined,
      pages: Number(req.body?.pages) || undefined,
      telegram: req.body?.telegram === undefined ? undefined : Boolean(req.body.telegram),
    });
    if (!request.ok) return res.status(400).json({ success: false, ...request });

    emitBridgeLog(request.message, 'scan');
    res.status(202).json({ success: true, queued: true, message: request.message });

    void (async () => {
      try {
        const status = await waitForCloudScan(CLOUD_CONFIG, since);
        const synced = await syncCloudFeed(CLOUD_CONFIG);
        emitBridgeLog(
          synced.ok
            ? `اسکن ابری تمام شد: ${synced.cloudProjects} پروژه‌ی ابری (${status?.projects_this_run ?? 0} در این اجرا)`
            : `اسکن ابری تمام شد ولی فید تازه‌ای منتشر نشد: ${synced.message}`,
          'scan',
        );
        io.emit('scan:done', {
          added: status?.projects_this_run ?? synced.cloudProjects,
          total: status?.projects_in_feed ?? synced.totalProjects,
          scannedAt: status?.finished_at ?? new Date().toISOString(),
          source: 'cloud',
        });
      } catch (error: any) {
        emitBridgeLog(`پیگیری اسکن ابری ناموفق بود: ${error?.message ?? error}`, 'scan');
      }
    })();
    return;
  } catch (error: any) {
    return res.status(502).json({ success: false, error: error?.message ?? 'درخواست اسکن ابری ناموفق بود' });
  }
});

/* ===================================================================== */
/* SPEC-008 — تنظیمات و سلامت هوش مصنوعی                                  */
/* ===================================================================== */

// وضعیت خلاصه: آیا AI آماده است، کدام provider فعال است، و چند اتصال سالم وجود دارد.
app.get('/api/ai/status', (_req: Request, res: Response) => {
  const loaded = loadAIConfig();
  res.json({ success: true, ...aiStatus(loaded) });
});

// تنظیمات کامل با کلیدهای ماسک‌شده (کلید واقعی هرگز به مرورگر برنمی‌گردد).
app.get('/api/ai/config', (_req: Request, res: Response) => {
  const loaded = loadAIConfig();
  res.json({ success: true, config: publicAIConfig(loaded), status: aiStatus(loaded) });
});

// ذخیره‌ی تنظیمات از UI (provider، مدل‌ها، پروفایل، رفتار).
app.put('/api/ai/config', (req: Request, res: Response) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ success: false, code: 'AI_BAD_REQUEST', error: 'بدنه‌ی تنظیمات نامعتبر است.' });
    }
    const invalid = validateConfigDraft(req.body);
    if (invalid) {
      return res.status(400).json({ success: false, code: 'AI_CONFIG_INVALID', error: invalid, requiresAIConfig: true });
    }
    const loaded = saveAIConfig(req.body);
    const status = aiStatus(loaded);
    console.log(`[ai] تنظیمات ذخیره شد · provider فعال: ${status.provider?.label ?? '—'} · اتصال‌های سالم: ${status.usableConnections}`);
    return res.json({ success: true, config: publicAIConfig(loaded), status });
  } catch (error: any) {
    return res.status(500).json({ success: false, code: 'AI_CONFIG_WRITE_FAILED', error: `ذخیره‌ی تنظیمات ناموفق بود: ${error?.message ?? error}` });
  }
});

// فهرست مدل‌های provider؛ هم برای connection ذخیره‌شده و هم برای فرم ذخیره‌نشده.
app.post('/api/ai/models', async (req: Request, res: Response) => {
  const loaded = loadAIConfig();
  const connection = resolveConnectionFromBody(loaded, req.body);
  if (!connection) {
    return res.status(400).json({ success: false, code: 'AI_NOT_CONFIGURED', error: 'ابتدا provider، آدرس پایه و کلید را وارد کنید.' });
  }
  try {
    const result = await listConnectionModels(connection);
    return res.json({ success: true, count: result.models.length, models: result.models, recommended: result.recommended });
  } catch (error) {
    return sendLLMError(res, error, 'دریافت فهرست مدل‌ها ناموفق بود.');
  }
});

// تست واقعی اتصال با یک درخواست کوچک.
app.post('/api/ai/test', async (req: Request, res: Response) => {
  const loaded = loadAIConfig();
  const connection = resolveConnectionFromBody(loaded, req.body);
  if (!connection) {
    return res.status(400).json({ success: false, ok: false, code: 'AI_NOT_CONFIGURED', error: 'هیچ اتصالی برای تست وجود ندارد.' });
  }
  const result = await testAIConnection(connection, loaded.config);
  const lastTest = {
    ok: result.ok,
    at: new Date().toISOString(),
    latencyMs: result.latencyMs,
    model: result.model,
    message: result.message,
  };
  if (connection.origin !== 'env' && loaded.config.connections.some((item) => item.id === connection.id)) {
    try {
      saveAIConfig({
        ...loaded.config,
        connections: loaded.config.connections.map((item) => (item.id === connection.id ? { ...item, lastTest } : item)),
      });
    } catch {
      /* تست موفق است حتی اگر ذخیره نشود */
    }
  }
  return res.status(result.ok ? 200 : 502).json({ success: result.ok, ...result, lastTest });
});

// Endpoint: دسته‌بندی پروژه با دسته‌های مشترک (shared/taxonomy.json)
app.post('/api/categorize-job', async (req: Request, res: Response) => {
  try {
    const title = String(req.body?.title ?? '');
    const description = String(req.body?.description ?? '');
    if (!title && !description) {
      return res.status(400).json({ success: false, error: 'عنوان یا توضیحات پروژه لازم است.' });
    }
    const result = await categorizeJobServer(title, description);
    return res.json({
      success: true,
      tag: result.tag,
      source: result.source,
      confidence: result.confidence,
      meta: result.meta,
    });
  } catch (error: any) {
    console.error('Error in categorize-job:', error);
    return sendLLMError(res, error, 'Failed to categorize job');
  }
});

// Endpoint: Get the live job feed (SPEC-004).
// منبع واقعی، خروجی JSONL اسکنر است. داده‌ی ساختگی فقط با KONKLANCER_DEMO=1 سرو می‌شود.
app.get('/api/jobs', (_req: Request, res: Response) => {
  const { projects, jobs, scannedAt } = loadFeedJobs();
  if (projects.length > 0) {
    jobs.forEach((job) => emittedJobIds.add(job.id));
    return res.json({
      success: true,
      source: 'scanner',
      scannedAt,
      scannedProjects: projects.length,
      minScore: SCAN_CONFIG.minScore,
      categories: SCAN_CONFIG.categories,
      // همه‌ی دسته‌های تاکسونومی (سطح داده، نه فیلتر) تا UI بتواند هر نوع کاری را نشان دهد.
      availableCategories: describeCategories(),
      // وقتی فهرست دسته خالی است، هیچ دسته‌ای حذف نمی‌شود (شامل کارهای غیرکدنویسی).
      categoryFilter: SCAN_CONFIG.categories.length > 0 ? 'explicit' : 'all',
      jobs,
    });
  }
  if (DEMO_FEED) {
    return res.json({ success: true, source: 'demo', scannedAt: null, jobs: DEFAULT_JOBS });
  }
  return res.json({
    success: true,
    source: 'empty',
    scannedAt: null,
    scannedProjects: 0,
    jobs: [],
    message: 'هنوز هیچ پروژه‌ای اسکن نشده است؛ راه‌اندازی: docs/PERSONAL-SETUP.md',
  });
});

// Endpoint: Get real-time bridge status (وضعیت واقعی: کدام منبع فعال است و فید از کجاست)
app.get('/api/bridge/status', (_req: Request, res: Response) => {
  const { projects, jobs, scannedAt } = loadFeedJobs();
  const targets = readScanTargets(SCAN_CONFIG.cwd);
  const active = targets.filter((target) => target.enabled);
  res.json({
    success: true,
    status: {
      connected: true,
      source: projects.length > 0 ? 'scanner' : DEMO_FEED ? 'demo' : 'empty',
      scannedProjects: projects.length,
      feedJobs: jobs.length,
      scannedAt,
      scannerBusy: scannerBusy(),
      scanPlatforms: SCAN_CONFIG.platforms,
      scanTelegram: SCAN_CONFIG.telegram,
      scanCategories: SCAN_CONFIG.categories,
      autoCalibrate: SCAN_CONFIG.autoCalibrate,
      cloudFeed: CLOUD_CONFIG
        ? { enabled: true, repo: CLOUD_CONFIG.repo, ref: CLOUD_CONFIG.ref, hasToken: Boolean(CLOUD_CONFIG.token) }
        : { enabled: false },
      categories: describeCategories(),
      includeKeywords: SCAN_CONFIG.include,
      // سازگاری با پنل: فقط منابع فعال گزارش می‌شوند (بدون latency ساختگی)
      activePlatforms: active.map((target) => ({ name: target.name, status: 'active', latency: '—' })),
      inactivePlatforms: targets
        .filter((target) => !target.enabled)
        .map((target) => ({ name: target.name, reason: target.reason, kind: target.kind })),
      clientsCount: io.engine.clientsCount,
    },
  });
});

/* ===================================================================== */
/* SPEC-008 — امکانات هوش مصنوعی (تحلیل، پروپوزال، نقد، کد، اجرای تست)   */
/* ===================================================================== */

// Endpoint: تحلیل پروژه (JSON ساختاریافته + متادیتای مدل/زمان/تلاش)
app.post('/api/analyze-job', async (req: Request, res: Response) => {
  try {
    const job = jobFromBody(req.body);
    const check = checkContent(job.title, job.description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }
    if (!job.title) {
      return res.status(400).json({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان پروژه لازم است.' });
    }
    if (!job.description.trim()) {
      return res.status(400).json({
        success: false,
        code: 'AI_BAD_REQUEST',
        error: 'برای تحلیل دقیق، متن توضیحات پروژه لازم است. متن کامل آگهی را وارد کنید.',
      });
    }

    const loaded = loadAIConfig();
    const result = await analyzeJob(loaded, job);
    const analysis = result.analysis;
    const recommendedBid = analysis.recommendedBid;

    return res.json({
      success: true,
      aiAvailable: true,
      model: result.meta.model,
      provider: result.meta.provider,
      meta: publicMeta(result.meta),
      // فیلدهای تخت برای سازگاری با نسخه‌ی قبلی UI
      ...analysis,
      recommendedBidFormatted: recommendedBid ? `${recommendedBid.toLocaleString('fa-IR')} تومان` : null,
      analysis,
      partial: result.partial,
      warnings: result.warnings,
    });
  } catch (error: any) {
    console.error('Error in analyze-job:', error?.code ?? error?.message ?? error);
    return sendLLMError(res, error, 'تحلیل پروژه ناموفق بود.');
  }
});

// Endpoint: نگارش پروپوزال (غیراستریم — سازگار با کلاینت‌های قبلی)
app.post('/api/generate-proposal', async (req: Request, res: Response) => {
  try {
    const job = jobFromBody(req.body);
    const check = checkContent(job.title, job.description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }
    if (!job.title) {
      return res.status(400).json({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان پروژه لازم است.' });
    }

    const requestedPrice = Number(req.body?.price) > 0 ? Number(req.body.price) : null;
    const fallbackPrice = job.budget && job.budget > 0 ? Math.round(job.budget * 0.85) : null;
    const price = requestedPrice ?? fallbackPrice;
    const deliveryTime = String(req.body?.deliveryTime ?? '۴۸ ساعت');

    const loaded = loadAIConfig();
    const result = await writeProposal(loaded, {
      ...job,
      tone: req.body?.tone,
      price,
      deliveryTime,
      extraNotes: req.body?.extraNotes,
    });

    return res.json({
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
  } catch (error: any) {
    console.error('Error in generate-proposal:', error?.code ?? error?.message ?? error);
    return sendLLMError(res, error, 'نگارش پروپوزال ناموفق بود.');
  }
});

// Endpoint: نگارش پروپوزال با استریم واقعی (SSE) — متن همان‌طور که مدل می‌نویسد می‌رسد.
app.post('/api/generate-proposal/stream', async (req: Request, res: Response) => {
  const job = jobFromBody(req.body);
  const check = checkContent(job.title, job.description);
  if (check.blocked) {
    return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
  }
  if (!job.title || !job.description.trim()) {
    return res.status(400).json({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان و توضیحات پروژه لازم است.' });
  }

  sseStart(res);
  const controller = new AbortController();
  let finished = false;
  res.on('close', () => {
    if (!finished) controller.abort();
  });

  try {
    const requestedPrice = Number(req.body?.price) > 0 ? Number(req.body.price) : null;
    const fallbackPrice = job.budget && job.budget > 0 ? Math.round(job.budget * 0.85) : null;
    const price = requestedPrice ?? fallbackPrice;
    const deliveryTime = String(req.body?.deliveryTime ?? '۴۸ ساعت');
    sseSend(res, 'start', { success: true, price, deliveryTime });

    const loaded = loadAIConfig();
    const result = await writeProposalStream(
      loaded,
      { ...job, tone: req.body?.tone, price, deliveryTime, extraNotes: req.body?.extraNotes },
      (delta) => sseSend(res, 'delta', { text: delta }),
      controller.signal,
    );
    sseSend(res, 'done', {
      success: true,
      aiAvailable: true,
      proposal: result.text,
      proposedPrice: price,
      proposedPriceFormatted: price ? `${price.toLocaleString('fa-IR')} تومان` : null,
      deliveryTime,
      meta: publicMeta(result.meta),
    });
  } catch (error: any) {
    if (!controller.signal.aborted) sseError(res, error);
  } finally {
    finished = true;
    if (!res.writableEnded) res.end();
  }
});

// Endpoint: نقد و امتیاز پروپوزال (کارفرمای سخت‌گیر شبیه‌سازی‌شده)
app.post('/api/critique-proposal', async (req: Request, res: Response) => {
  try {
    const proposal = String(req.body?.proposal ?? '').trim();
    if (!proposal) {
      return res.status(400).json({ success: false, code: 'AI_BAD_REQUEST', error: 'متن پروپوزال خالی است.' });
    }
    const job = jobFromBody(req.body?.job ?? req.body);
    const loaded = loadAIConfig();
    const result = await critiqueProposal(loaded, { proposal, job });
    return res.json({
      success: true,
      aiAvailable: true,
      critique: result.critique,
      meta: publicMeta(result.meta),
    });
  } catch (error: any) {
    console.error('Error in critique-proposal:', error?.code ?? error?.message ?? error);
    return sendLLMError(res, error, 'نقد پروپوزال ناموفق بود.');
  }
});

// Endpoint: تولید پروژه‌ی چندفایلی (غیراستریم)
app.post('/api/generate-solution', async (req: Request, res: Response) => {
  try {
    const job = jobFromBody(req.body);
    const check = checkContent(job.title, job.description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }
    if (!job.title) {
      return res.status(400).json({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان پروژه لازم است.' });
    }

    const loaded = loadAIConfig();
    const result = await generateSolution(loaded, {
      ...job,
      instructions: req.body?.instructions ? String(req.body.instructions) : undefined,
      language: req.body?.language ? String(req.body.language) : undefined,
    });

    return res.json({
      success: true,
      aiAvailable: true,
      files: result.files,
      plan: result.plan,
      warnings: result.warnings,
      model: result.meta.model,
      provider: result.meta.provider,
      meta: publicMeta(result.meta),
    });
  } catch (error: any) {
    console.error('Error in generate-solution:', error?.code ?? error?.message ?? error);
    return sendLLMError(res, error, 'تولید سورس کد ناموفق بود.');
  }
});

// Endpoint: تولید پروژه با پیشرفت زنده (نقشه → فایل‌به‌فایل)
app.post('/api/generate-solution/stream', async (req: Request, res: Response) => {
  const job = jobFromBody(req.body);
  const check = checkContent(job.title, job.description);
  if (check.blocked) {
    return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
  }
  if (!job.title) {
    return res.status(400).json({ success: false, code: 'AI_BAD_REQUEST', error: 'عنوان پروژه لازم است.' });
  }

  sseStart(res);
  const controller = new AbortController();
  let finished = false;
  res.on('close', () => {
    if (!finished) controller.abort();
  });

  try {
    sseSend(res, 'start', { success: true, message: 'شروع تولید پروژه…' });
    const loaded = loadAIConfig();
    const result = await generateSolution(
      loaded,
      {
        ...job,
        instructions: req.body?.instructions ? String(req.body.instructions) : undefined,
        language: req.body?.language ? String(req.body.language) : undefined,
      },
      {
        signal: controller.signal,
        onProgress: (event) => sseSend(res, 'progress', event),
      },
    );
    sseSend(res, 'done', {
      success: true,
      aiAvailable: true,
      files: result.files,
      plan: result.plan,
      warnings: result.warnings,
      meta: publicMeta(result.meta),
    });
  } catch (error: any) {
    if (!controller.signal.aborted) sseError(res, error);
  } finally {
    finished = true;
    if (!res.writableEnded) res.end();
  }
});

// Endpoint: اجرای واقعی تست‌های کد تولیدشده (فقط اگر کاربر در تنظیمات اجازه داده باشد)
app.post('/api/run-tests', async (req: Request, res: Response) => {
  const loaded = loadAIConfig();
  if (!loaded.config.allowCodeExecution) {
    return res.status(403).json({
      success: false,
      ok: false,
      code: 'CODE_EXECUTION_DISABLED',
      error: 'اجرای کد در تنظیمات خاموش است. برای فعال‌کردن: تنظیمات → هوش مصنوعی → «اجرای تست کد تولیدشده».',
      requiresAIConfig: false,
    });
  }
  const files = req.body?.files;
  if (!files || typeof files !== 'object') {
    return res.status(400).json({ success: false, ok: false, code: 'AI_BAD_REQUEST', error: 'فایل‌های پروژه لازم است.' });
  }
  try {
    const result = await runGeneratedTests(files as Record<string, string>, {
      timeoutMs: Number(req.body?.timeoutMs) || undefined,
    });
    return res.json({ success: result.ok, ...result });
  } catch (error: any) {
    return res.status(500).json({ success: false, ok: false, code: 'CODE_RUN_FAILED', error: error?.message ?? 'اجرای تست ناموفق بود.' });
  }
});

// Start Express server and connect Vite in development
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: null,
        // Allow the sandbox live-preview host (*.e2b.app) and localhost only.
        allowedHosts: ['.e2b.app', 'localhost', '127.0.0.1'],
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const aiLoaded = loadAIConfig();
  const ai = aiStatus(aiLoaded);
  if (!ai.configured) {
    console.warn(
      '[ai] هیچ اتصال هوش مصنوعی تنظیم نشده است. از UI «تنظیمات → هوش مصنوعی» یک provider و کلید اضافه کنید، ' +
        'یا OPENAI_API_KEY / GROQ_API_KEY / GEMINI_API_KEY / KONKRED_GATEWAY_URL را در .env بگذارید.',
    );
  } else {
    console.log(
      `[ai] آماده · ${ai.provider?.label} · مدل fast: ${ai.provider?.modelFast ?? 'خودکار'} · strong: ${ai.provider?.modelStrong ?? 'خودکار'} · fallback: ${ai.fallbackEnabled ? 'روشن' : 'خاموش'}`,
    );
  }

  // وضعیت اسکنر را در همان لحظه‌ی راه‌اندازی گزارش می‌دهیم تا برای استفاده‌ی شخصی معلوم باشد
  // چه چیزی اسکن می‌شود و فید از کجاست (SPEC-004).
  const enabled = enabledTargets();
  const feed = loadFeedJobs();
  console.log(
    `[scanner] فید: ${SCAN_CONFIG.outFile} · ${feed.projects.length} پروژه در فایل · ${enabled.length} منبع فعال`,
  );
  if (CLOUD_CONFIG) {
    console.log(
      `[scanner] فید ابری فعال: ${CLOUD_CONFIG.repo}@${CLOUD_CONFIG.ref || 'default'} · توکن: ${CLOUD_CONFIG.token ? 'دارد' : 'ندارد'}`,
    );
    // اگر فید محلی خالی بود، یک‌بار از فید ابری پر می‌شود (شخصی‌سازی: بدون تنظیم دستی).
    if (feed.projects.length === 0 && CLOUD_CONFIG.token) {
      void syncCloudFeed(CLOUD_CONFIG)
        .then((result) => {
          console.log(`[scanner] ${result.message}`);
          if (result.written) emitBridgeLog(`فید ابری در راه‌اندازی همگام شد: ${result.cloudProjects} پروژه`, 'scan');
        })
        .catch((error) => console.warn(`[scanner] همگام‌سازی فید ابری در راه‌اندازی ناموفق بود: ${error?.message ?? error}`));
    }
  }
  if (enabled.length > 0) {
    console.log(`[scanner] منابع فعال: ${enabled.map((t) => t.name).join(' · ')}`);
  } else if (feed.projects.length > 0) {
    // فایل فید از قبل داده دارد؛ فقط اسکن خودکار خاموش است (یا منابعش فعال نشده‌اند).
    console.warn(
      '[scanner] اسکن خودکار فعال نیست؛ فید فعلی فقط از فایل خوانده می‌شود. ' +
        'برای افزودن داده‌ی تازه: docs/PERSONAL-SETUP.md (بخش‌های ۴ و ۵).',
    );
  } else {
    console.warn(
      '[scanner] هیچ منبعی فعال نیست و فایل فید هم خالی است؛ UI خالی می‌ماند. ' +
        'راهنمای راه‌اندازی شخصی: docs/PERSONAL-SETUP.md',
    );
  }
  if (SCAN_CONFIG.intervalMinutes > 0) {
    console.log(`[scanner] اسکن خودکار هر ${SCAN_CONFIG.intervalMinutes} دقیقه فعال است.`);
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Konklancer server & Socket.io bridge running at http://localhost:${PORT}`);
  });
}

startServer();
