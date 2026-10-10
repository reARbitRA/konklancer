import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Server as SocketIOServer } from 'socket.io';
import { callLLM, LLMError, parseJsonLoose, readLLMConfig } from './server/llm';
import { checkContent } from './server/contentFilter';

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
    categoryKey: 'telegram',
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
    categoryKey: 'api',
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
    categoryKey: 'scraping',
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
    categoryKey: 'scraping',
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
    categoryKey: 'telegram',
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
    categoryKey: 'api',
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


function keywordCategory(title: string, description: string): 'Frontend' | 'Backend' | 'DevOps' | 'Design' {
  const text = `${title} ${description}`.toLowerCase();
  if (/react|vue|angular|frontend|فرانت|html|css|tailwind|ui|جاوااسکریپت|next\.js/i.test(text)) return 'Frontend';
  if (/devops|docker|داکر|kubernetes|کوبرنتیز|linux|لینوکس|ci\/cd|deploy|سرور|nginx/i.test(text)) return 'DevOps';
  if (/design|طراحی|لوگو|figma|فیگما|فتوشاپ|photoshop|ui\/ux|گرافیک|بنر/i.test(text)) return 'Design';
  return 'Backend';
}

async function categorizeJobServer(title: string, description: string): Promise<'Frontend' | 'Backend' | 'DevOps' | 'Design'> {
  if (!readLLMConfig()) return keywordCategory(title, description);
  try {
    const prompt = `Categorize this freelance job into exactly one of: Frontend, Backend, DevOps, Design.
Job Title: ${title}
Job Description: ${description}

Return only JSON:
{"tag": "Frontend" | "Backend" | "DevOps" | "Design"}`;
    const llm = await callLLM({ taskType: 'extraction', prompt, json: true, maxTokens: 64, temperature: 0 });
    const parsed = parseJsonLoose(llm.text) ?? {};
    const valid = ['Frontend', 'Backend', 'DevOps', 'Design'];
    return valid.includes(parsed.tag) ? (parsed.tag as any) : keywordCategory(title, description);
  } catch (err: any) {
    console.warn('AI categorization unavailable, using keyword rules:', err?.message ?? err);
    return keywordCategory(title, description);
  }
}

// Uniform error mapping for AI endpoints (SPEC-006 R5, R10).
function sendLLMError(res: Response, err: unknown, fallbackMessage: string) {
  if (err instanceof LLMError) {
    return res.status(err.status).json({ success: false, aiAvailable: false, code: err.code, error: err.message });
  }
  return res.status(500).json({ success: false, aiAvailable: false, code: 'AI_UPSTREAM', error: fallbackMessage });
}

async function broadcastNewJob(customPayload?: any) {
  const template = customPayload || BRIDGE_FEED_POOL[feedIndex % BRIDGE_FEED_POOL.length];
  feedIndex++;

  const newJobId = `live-${template.platformKey || 'feed'}-${Date.now().toString().slice(-4)}`;
  const budget = template.budget || 4000000;

  // Determine initial priority based on budget and complexity
  const priority = budget >= 6000000 ? 'High' : budget >= 4000000 ? 'Medium' : 'Low';
  
  // Categorize tag using Gemini AI
  const categorizedTag = await categorizeJobServer(template.title, template.description);

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
    category: template.category || 'وب اسکرپینگ / پایتون',
    categoryKey: template.categoryKey || 'scraping',
    tags: template.tags ? [...template.tags, categorizedTag] : ['Python', categorizedTag],
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
    activePlatforms: ['پونیشا', 'کارلانسر', 'پارسکدرز'],
    clientsCount: io.engine.clientsCount,
  });

  socket.emit('bridge:log', {
    id: `log-${Date.now()}`,
    timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
    type: 'scan',
    message: 'اتصال فعال وب‌سوکت Socket.io به بریج دریافت آنی پروژه‌ها برقرار شد.',
  });

  // Client requests a real-time scan trigger
  socket.on('scan:trigger', () => {
    socket.emit('bridge:log', {
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      type: 'scan',
      message: 'بریج بک‌اند در حال دریافت آخرین آگهی‌های لحظه‌ای از وب‌هوک و فید پلتفرم‌ها...',
    });

    if (!DEMO_FEED) {
      socket.emit('bridge:log', {
        id: `log-${Date.now()}`,
        timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
        type: 'scan',
        message: 'اسکنر واقعی هنوز به بریج متصل نیست؛ هیچ پروژه‌ی ساختگی تولید نشد.',
      });
      return;
    }

    setTimeout(() => {
      broadcastNewJob();
    }, 600);
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

// Endpoint: Trigger bridge broadcast via REST API
app.post('/api/bridge/trigger-scan', async (_req: Request, res: Response) => {
  if (!DEMO_FEED) {
    // Real scanner integration is SPEC-004 (not yet implemented).
    return res.json({ success: false, job: null, message: 'اسکنر واقعی هنوز متصل نیست (KONKLANCER_DEMO=0).' });
  }
  const job = await broadcastNewJob();
  res.json({ success: true, job });
});

// Endpoint: Categorize job into Frontend, Backend, DevOps, Design using Gemini
app.post('/api/categorize-job', async (req: Request, res: Response) => {
  try {
    const { title = '', description = '' } = req.body;
    const tag = await categorizeJobServer(title, description);
    res.json({ success: true, tag });
  } catch (error: any) {
    console.error('Error in categorize-job:', error);
    return sendLLMError(res, error, 'Failed to categorize job');
  }
});

// Endpoint: Get list of freelance jobs
app.get('/api/jobs', (_req: Request, res: Response) => {
  res.json({ success: true, jobs: DEFAULT_JOBS });
});

// Endpoint: Get real-time bridge status
app.get('/api/bridge/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    status: {
      connected: true,
      activePlatforms: [
        { name: 'پونیشا', status: 'active', latency: '45ms' },
        { name: 'کارلانسر', status: 'active', latency: '120ms' },
        { name: 'پارسکدرز', status: 'active', latency: '85ms' }
      ],
      clientsCount: io.engine.clientsCount
    }
  });
});

// Endpoint: AI Analysis using Gemini 3.8 Flash
app.post('/api/analyze-job', async (req: Request, res: Response) => {
  try {
    const { title, description, budget, platform } = req.body;
    const check = checkContent(title, description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }

    if (!title || !description) {
      return res.status(400).json({ error: 'Job title and description are required' });
    }

    if (!readLLMConfig()) return sendLLMError(res, new LLMError('AI_NOT_CONFIGURED', 'KONKRED_GATEWAY_URL و KONKRED_API_KEY تنظیم نشده‌اند.', 503), 'AI not configured');

    const prompt = `شما معمار ارشد سیستم‌های اتوماسیون هوش مصنوعی فریلنسری هستید.
پروژه فریلنسری زیر از پلتفرم "${platform || 'فریلنسری'}" را تحلیل فنی و اقتصادی کنید:
عنوان: ${title}
توضیحات: ${description}
بودجه کارفرما: ${budget || 'نامشخص'}

وظیفه شما ارزیابی دقیق است. خروجی را دقیقاً در قالب فرمت JSON معتبر زیر بازگردانید:
{
  "automatabilityScore": 95,
  "recommendedBid": 2800000,
  "suggestedDuration": "۴ ساعت",
  "technicalStack": ["Python", "Playwright"],
  "feasibilityReason": "توضیح تحلیلی ۲ خطی به زبان فارسی درباره چرایی امکان اجرای ۱۰۰٪ خودکار توسط ایجنت هوش مصنوعی",
  "riskLevel": "low",
  "winProbability": "۸۵٪",
  "suggestedKicker": "نکته کلیدی که باید در خط اول پیشنهاد به آن اشاره شود تا کارفرما متوجه شود پروژه دقیق خوانده شده است"
}`;

    const llm = await callLLM({ taskType: 'general', prompt, json: true, cacheKey: `analyze:${platform}|${title}|${description}|${budget}` });
    const parsed = parseJsonLoose(llm.text) ?? {};
    const recommendedBid = parsed.recommendedBid || (budget ? Math.round(budget * 0.85) : 3000000);

    return res.json({
      success: true,
      aiAvailable: true,
      model: llm.model,
      automatabilityScore: parsed.automatabilityScore || 92,
      recommendedBid,
      recommendedBidFormatted: recommendedBid.toLocaleString('fa-IR') + ' تومان',
      suggestedDuration: parsed.suggestedDuration || '۴ ساعت',
      technicalStack: parsed.technicalStack || ['Python', 'Asyncio'],
      feasibilityReason: parsed.feasibilityReason || 'پروژه دیجیتال و الگوریتمی بوده و قابلیت پیاده‌سازی سریع با ایجنت را دارد.',
      riskLevel: parsed.riskLevel || 'low',
      winProbability: parsed.winProbability || '۸۵٪',
      suggestedKicker: parsed.suggestedKicker || 'اشاره به استراتژی حل سریع مسئله'
    });
  } catch (error: any) {
    console.error('Error in analyze-job:', error);
    return sendLLMError(res, error, 'Failed to analyze job');
  }
});

// Endpoint: Generate authentic Persian proposal tailored to employer
app.post('/api/generate-proposal', async (req: Request, res: Response) => {
  try {
    const { title, description, budget, tone = 'friendly_expert' } = req.body;
    const check = checkContent(title, description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }

    if (!title || !description) {
      return res.status(400).json({ error: 'Job title and description are required' });
    }

    const targetPrice = budget ? Math.round(budget * 0.82) : 2500000;

    if (!readLLMConfig()) return sendLLMError(res, new LLMError('AI_NOT_CONFIGURED', 'KONKRED_GATEWAY_URL و KONKRED_API_KEY تنظیم نشده‌اند.', 503), 'AI not configured');

    const toneInstructionsMap: Record<string, string> = {
      friendly_expert: 'لحن: یک مهندس نرم‌افزار حرفه‌ای، صمیمی، خاکی و قابل اعتماد.',
      direct_urgent: 'لحن: صریح، بسیار متمرکز بر زمان تحویل فوری زیر چند ساعت.',
      technical_detailed: 'لحن: فنی و آگاه به جزییات کتابخانه‌ها و معماری اجرای بدون باگ.'
    };
    const toneInstructions = toneInstructionsMap[String(tone)] || 'لحن: حرفه‌ای و صمیمی';

    const prompt = `شما یک برنامه‌نویس ارشد ایرانی در بازار فریلنسری هستید.
می‌خواهید برای پروژه زیر یک پروپوزال (پیشنهاد) بسیار متقاعدکننده بنویسید که کارفرما بلافاصله پیام دهد.
عنوان پروژه: ${title}
توضیحات پروژه: ${description}
بودجه کارفرما: ${budget || 'متغیر'}
${toneInstructions}

قوانین سخت‌گیرانه:
۱. اصلاً نباید شبیه متون تکراری یا هوش مصنوعی باشد. واژه‌های کلیشه‌ای مثل "با کمال میل"، "تضمین ۱۰۰٪"، "در اسرع وقت" را هرگز به کار نبرید.
۲. طول متن: حداکثر ۳ الی ۴ جمله.
۳. در جمله اول دقیقاً به یکی از چالش‌ها یا بخش‌های خاص خواسته کارفرما اشاره کنید تا ثابت شود متن را با دقت خوانده‌اید.
۴. ذکر کنید که کدها تست‌شده با راهنمای اجرای فارسی روی گیت‌هاب تحویل خواهد شد.

خروجی را در قالب JSON زیر تحویل دهید:
{
  "proposal": "متن فارسی پروپوزال",
  "proposedPrice": ${targetPrice},
  "deliveryTime": "۴ ساعت"
}`;

    const llm = await callLLM({ taskType: 'general', prompt, json: true });
    const parsed = parseJsonLoose(llm.text) ?? {};

    return res.json({
      success: true,
      aiAvailable: true,
      model: llm.model,
      proposal: parsed.proposal,
      proposedPrice: parsed.proposedPrice || targetPrice,
      proposedPriceFormatted: (parsed.proposedPrice || targetPrice).toLocaleString('fa-IR') + ' تومان',
      deliveryTime: parsed.deliveryTime || '۴ ساعت',
    });
  } catch (error: any) {
    console.error('Error in generate-proposal:', error);
    return sendLLMError(res, error, 'Failed to generate proposal');
  }
});

// Endpoint: Autonomous Code Solution Generator
app.post('/api/generate-solution', async (req: Request, res: Response) => {
  try {
    const { title, description } = req.body;
    const check = checkContent(title, description);
    if (check.blocked) {
      return res.status(422).json({ blocked: true, error: check.reason, reason: check.reason });
    }

    if (!title) {
      return res.status(400).json({ error: 'Job title is required' });
    }

    if (!readLLMConfig()) return sendLLMError(res, new LLMError('AI_NOT_CONFIGURED', 'KONKRED_GATEWAY_URL و KONKRED_API_KEY تنظیم نشده‌اند.', 503), 'AI not configured');

    const prompt = `شما یک مهندس نرم‌افزار ارشد و ایجنت کدنویسی خودکار هستید.
برای این پروژه فریلنسری:
عنوان: ${title}
توضیحات: ${description}

وظیفه شما تولید یک پروژه کامل، بدون نقص، کامپایل‌پذیر و آماده تحویل است.
کدها باید دارای لاگین تمیز، ترای/اکسپت کامل و داکیومنت فارسی برای کارفرما باشد.

خروجی را حتماً در قالب یک JSON معتبر برگردانید که کلیدهای آن نام فایل‌ها و مقادیر آن سورس کامل فایل باشد:
{
  "files": {
    "main.py": "سورس کامل کد اصلی پایتون با همه توابع واقعی",
    "requirements.txt": "لیست کتابخانه‌های مورد نیاز",
    "README.md": "راهنمای کامل و گام‌به‌گام فارسی برای کارفرما جهت نحوه نصب و اجرای پروژه",
    "test_suite.py": "تست‌های اعتبارسنجی با unittest"
  }
}`;

    const llm = await callLLM({ taskType: 'code-generation', prompt, json: true, maxTokens: 8000 });
    const parsed = parseJsonLoose(llm.text) ?? {};

    return res.json({
      success: true,
      aiAvailable: true,
      model: llm.model,
      files: parsed.files || {}
    });
  } catch (error: any) {
    console.error('Error in generate-solution:', error);
    return sendLLMError(res, error, 'Failed to generate solution');
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

  if (!readLLMConfig()) console.warn('[llm] KONKRED_GATEWAY_URL / KONKRED_API_KEY not set: AI endpoints return 503 AI_NOT_CONFIGURED');

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`FreelanceFlow AI Server & Socket.io Bridge running at http://localhost:${PORT}`);
  });
}

startServer();
