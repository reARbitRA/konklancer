import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  AlertTriangle,
  Radar,
  RefreshCw,
  Settings,
  Sparkles,
  Terminal,
  WifiOff,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { Header, type AppTab } from './components/Header';
import { MobileNav, StatusBar } from './components/StatusBar';
import { CommandPalette, type PaletteAction } from './components/CommandPalette';
import { JobHunter } from './components/JobHunter';
import { CodeWorkspace } from './components/CodeWorkspace';
import { PipelineBoard } from './components/PipelineBoard';
import { AutoPilotPanel } from './components/AutoPilotPanel';
import { AIEvaluatorModal } from './components/AIEvaluatorModal';
import { ProposalStudioModal } from './components/ProposalStudioModal';
import { GitHubDispatcher } from './components/GitHubDispatcher';
import { GitHubWorkflowManager } from './components/GitHubWorkflowManager';
import { SettingsModal, type SettingsTab } from './components/SettingsModal';
import { INITIAL_JOBS } from './data/mockJobs';
import { FreelanceJob, AIAnalysis, ActivityLogItem, UserSettings, PriorityLevel } from './types';
import { categorizeJobWithGemini } from './utils/geminiCategorizer';
import { categoryLabel, detectCategory } from '../shared/taxonomy';
import { FeedStatusBar, FeedSource } from './components/FeedStatusBar';
import { getAIStatus, type AIStatusPayload } from './utils/aiClient';
import { isCapacitorNative, isStandaloneMode } from './utils/standaloneRuntime';

/**
 * Runtime Type Guard to strictly validate incoming Socket.io data
 * against the FreelanceJob interface before state mutation
 */
function isValidFreelanceJob(data: any): data is FreelanceJob {
  if (!data || typeof data !== 'object') return false;
  if (typeof data.id !== 'string' || !data.id.trim()) return false;
  if (typeof data.title !== 'string' || !data.title.trim()) return false;
  if (typeof data.description !== 'string') return false;
  if (typeof data.budget !== 'number' || isNaN(data.budget)) return false;
  if (typeof data.platform !== 'string') return false;
  if (!['ponisha', 'karlancer', 'parskoders', 'global'].includes(data.platformKey)) return false;
  if (!Array.isArray(data.tags)) return false;
  return true;
}

/** فیلدهای مشتق‌شده‌ی هر پروژه (اولویت و تگ دسته) را کامل می‌کند. */
function enrichJob(job: FreelanceJob): FreelanceJob {
  // دسته از تاکسونومی مشترک می‌آید (ترجمه، گرافیک، ویدیو، صدا، کد و ...) — نه فقط چهار تگ کدنویسی.
  const categoryKey =
    job.categoryKey && job.categoryKey !== 'all'
      ? job.categoryKey
      : detectCategory(job.title, job.description).key;
  return {
    ...job,
    categoryKey,
    category: job.category || categoryLabel(categoryKey),
    priority: job.priority || (job.budget >= 6000000 ? 'High' : job.budget >= 4000000 ? 'Medium' : 'Low'),
    categorizedTag: job.categorizedTag || categoryLabel(categoryKey),
  };
}

/**
 * فید تازه را با پروژه‌های محلی کاربر ادغام می‌کند.
 * وضعیت/تحلیل/پروپوزالِ پروژه‌های شناخته‌شده دست‌نخورده می‌ماند (SPEC-005 / localStorage).
 */
function mergeFeedJobs(
  current: FreelanceJob[],
  incoming: FreelanceJob[],
  seed: FreelanceJob[] = [],
): FreelanceJob[] {
  const known = new Set(current.map((job) => job.id));
  const fresh = incoming.filter((job) => !known.has(job.id)).map(enrichJob);
  const freshIds = new Set(fresh.map((job) => job.id));
  const seeded = seed
    .filter((job) => !known.has(job.id) && !freshIds.has(job.id))
    .map(enrichJob);
  return [...fresh, ...current, ...seeded];
}

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'hunter' | 'coder' | 'pipeline' | 'autopilot'>('hunter');

  // Core Data
  // پروژه‌ها از فید واقعی (/api/jobs) می‌آیند؛ از localStorage فقط برای نگه‌داشتن
  // وضعیت/تحلیل/پروپوزالِ خودِ کاربر استفاده می‌شود. داده‌ی ساختگی فقط در حالت دمو می‌آید.
  const [jobs, setJobs] = useState<FreelanceJob[]>(() => {
    const saved = localStorage.getItem('freelanceflow_jobs');
    if (!saved) return [];
    try {
      const parsed: FreelanceJob[] = JSON.parse(saved);
      return Array.isArray(parsed) ? parsed.map(enrichJob) : [];
    } catch (e) {
      console.error('Failed to parse jobs from localStorage:', e);
      return [];
    }
  });

  // SPEC-004: منبع فید و زمان آخرین اسکن
  const [feed, setFeed] = useState<{ source: FeedSource; scannedAt: string | null; scannedProjects: number }>({
    source: 'unknown',
    scannedAt: null,
    scannedProjects: 0,
  });

  const [settings, setSettings] = useState<UserSettings>(() => {
    const defaults = {
      githubToken: '',
      defaultDiscountRate: 18,
      autoBidThreshold: 85,
      cyborgMode: true,
      preferredTone: 'friendly_expert',
      dailyEarningsGoal: 5000000,
    };
    // SPEC-003 R2: the GitHub token lives only in sessionStorage; any copy left
    // in localStorage by older builds is removed here.
    let parsed: Partial<UserSettings> = {};
    try {
      const saved = localStorage.getItem('freelanceflow_settings');
      if (saved) parsed = JSON.parse(saved);
    } catch (e) {
      console.error('Failed to parse settings from localStorage:', e);
    }
    const { githubToken: legacyToken, ...rest } = parsed as any;
    if (legacyToken !== undefined) localStorage.removeItem('freelanceflow_settings');
    const sessionToken = sessionStorage.getItem('freelanceflow_github_token') || '';
    return { ...defaults, ...rest, githubToken: sessionToken || legacyToken || '' };
  });

  const [logs, setLogs] = useState<ActivityLogItem[]>([]);

  // Socket.io Real-Time Client State
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  // Selected Jobs for Modals & Workspaces
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<FreelanceJob | null>(null);
  const [selectedJobForProposal, setSelectedJobForProposal] = useState<FreelanceJob | null>(null);
  const [selectedJobForCoding, setSelectedJobForCoding] = useState<FreelanceJob | null>(null);
  const [gitHubPushState, setGitHubPushState] = useState<{
    job: FreelanceJob | null;
    files: Record<string, string>;
  }>({ job: null, files: {} });
  const [jobToInit, setJobToInit] = useState<FreelanceJob | null>(null);

  const [isCommandOpen, setIsCommandOpen] = useState(false);
  const [focusJobId, setFocusJobId] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [aiStatus, setAiStatus] = useState<AIStatusPayload | null>(null);
  const [aiStatusLoading, setAiStatusLoading] = useState(true);
  // SPEC-008: تحلیل خودکار پروژه‌های تازه (اختیاری، پیش‌فرض خاموش). هیچ پیشنهادی خودکار ارسال نمی‌شود.
  const [autoAnalyze, setAutoAnalyze] = useState<boolean>(() => localStorage.getItem('konklancer_auto_analyze') === '1');
  const [isScanning, setIsScanning] = useState(false);
  // فید ابری: اسکنر واقعی روی رانرهای گیت‌هاب اجرا می‌شود (سایت‌ها از این سرور قابل دسترسی نیستند)
  const [cloudInfo, setCloudInfo] = useState<{ enabled: boolean; repo?: string; status?: any }>({ enabled: false });
  const [cloudBusy, setCloudBusy] = useState(false);

  // Sync state to localStorage — سهمیه‌ی مرورگر ممکن است با فایل‌های تولیدشده پر شود؛
  // در آن صورت برنامه نباید کرش کند و باید صادقانه هشدار بدهد.
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  useEffect(() => {
    try {
      localStorage.setItem('freelanceflow_jobs', JSON.stringify(jobs));
      setStorageWarning(null);
    } catch {
      setStorageWarning(
        'حافظه‌ی مرورگر پر شده است؛ تغییرات آخر فقط تا بستن این تب باقی می‌مانند. فایل‌های پروژه را از استودیو کد در GitHub ثبت کنید.',
      );
    }
  }, [jobs]);

  // SPEC-004: خواندن فید از سرور (خروجی اسکنر) به‌جای داده‌ی ساختگی.
  const refreshCloudStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/bridge/cloud');
      const data = await res.json();
      setCloudInfo({ enabled: Boolean(data?.enabled && data?.hasToken !== false), repo: data?.repo, status: data?.status });
      return data;
    } catch {
      setCloudInfo({ enabled: false });
      return null;
    }
  }, []);

  // وضعیت AI (SPEC-008): برای بنر «تنظیم نشده» و نشانگر مدل در هدر
  const refreshAIStatus = useCallback(async () => {
    try {
      const data = await getAIStatus();
      setAiStatus(data);
    } catch {
      setAiStatus(null);
    } finally {
      setAiStatusLoading(false);
    }
  }, []);

  const openAISettings = useCallback(() => {
    setSettingsTab('ai');
    setIsSettingsOpen(true);
  }, []);

  const openSettings = useCallback(() => {
    setSettingsTab('general');
    setIsSettingsOpen(true);
  }, []);

  // Ctrl/Cmd+K — جست‌وجوی سراسری (همان الگوی VS Code)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setIsCommandOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // همگام‌سازی فید محلی با آخرین فید ابری
  const refreshFeed = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch('/api/jobs');
      const data = await response.json();
      const incoming: FreelanceJob[] = Array.isArray(data?.jobs)
        ? data.jobs.filter(isValidFreelanceJob)
        : [];
      const source: FeedSource = (data?.source as FeedSource) ?? 'unknown';
      setFeed({
        source,
        scannedAt: data?.scannedAt ?? null,
        scannedProjects: typeof data?.scannedProjects === 'number' ? data.scannedProjects : incoming.length,
      });
      if (incoming.length > 0) {
        setJobs((prev) => mergeFeedJobs(prev, incoming, source === 'demo' ? INITIAL_JOBS : []));
      } else if (source === 'demo') {
        setJobs((prev) => mergeFeedJobs(prev, [], INITIAL_JOBS));
      }
    } catch (err) {
      console.warn('[feed] بارگذاری /api/jobs ناموفق بود:', err);
      setFeed((prev) => ({ ...prev, source: 'unknown' }));
    }
  }, []);

  useEffect(() => {
    refreshCloudStatus();
    refreshFeed();
    void refreshAIStatus();
  }, [refreshFeed, refreshAIStatus]);

  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // فقط پروژه‌هایی که بعد از باز شدن صفحه اضافه می‌شوند کاندید تحلیل خودکار هستند
  // (بک‌لاگ قبلی به‌صورت ناخواسته هزینه‌ی توکن ایجاد نمی‌کند).
  const knownJobIdsRef = useRef<Set<string>>(new Set(jobs.map((job) => job.id)));
  const autoAnalyzedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const interval = setInterval(() => {
      const biddedJobs = jobsRef.current.filter(j => j.status === 'bidded');
      if (biddedJobs.length > 0 && Notification.permission === 'granted') {
        new Notification('یادآوری بررسی وضعیت پروژه‌ها', {
          body: `شما ${biddedJobs.length} پروژه در مرحله‌ی «پیگیری دستی» دارید؛ ارسال و بررسی بازخورد در پلتفرم انجام می‌شود.`,
        });
      }
    }, 4 * 60 * 60 * 1000); // 4 hours

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    // SPEC-003 R2: persist everything except the token in localStorage.
    const { githubToken, ...persistable } = settings;
    localStorage.setItem('freelanceflow_settings', JSON.stringify(persistable));
    if (githubToken) {
      sessionStorage.setItem('freelanceflow_github_token', githubToken);
    } else {
      sessionStorage.removeItem('freelanceflow_github_token');
    }
  }, [settings]);

  // Sound feedback using Web Audio API
  const playChime = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.15); // A5
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // AudioContext may be restricted by browser policy
    }
  };

  const addLog = (message: string, type: ActivityLogItem['type'] = 'scan') => {
    const newLog: ActivityLogItem = {
      id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      type,
      message,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  useEffect(() => {
    localStorage.setItem('konklancer_auto_analyze', autoAnalyze ? '1' : '0');
  }, [autoAnalyze]);

  const analyzeJobInBackground = async (job: FreelanceJob) => {
    addLog(`تحلیل خودکار شروع شد: «${job.title.slice(0, 40)}»`, 'bid');
    try {
      const response = await fetch('/api/analyze-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: job.title,
          description: job.description,
          budget: job.budget,
          budgetFormatted: job.budgetFormatted,
          platform: job.platform,
          proposalsCount: job.proposalsCount,
          deadline: job.deadline,
          postedTime: job.postedTime,
          category: job.category,
          url: job.url,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        addLog(
          `تحلیل خودکار «${job.title.slice(0, 30)}» ناموفق بود: ${data?.error ?? `HTTP ${response.status}`}`,
          'bid',
        );
        return;
      }
      const value: AIAnalysis = {
        ...(data.analysis ?? data),
        warnings: data.warnings ?? [],
        partial: Boolean(data.partial),
        meta: data.meta ?? null,
      };
      setJobs((prev) => prev.map((item) => (item.id === job.id ? { ...item, aiAnalysis: value } : item)));
      addLog(
        `تحلیل خودکار «${job.title.slice(0, 30)}»: اتوماسیون ${value.automatabilityScore}٪${
          typeof value.matchScore === 'number' ? ` · تناسب ${value.matchScore}٪` : ''
        }`,
        'bid',
      );
    } catch (error: any) {
      addLog(`تحلیل خودکار ناموفق بود: ${error?.message ?? error}`, 'bid');
    }
  };

  useEffect(() => {
    const known = knownJobIdsRef.current;
    const fresh = jobs.filter((job) => !known.has(job.id));
    jobs.forEach((job) => known.add(job.id));
    if (!autoAnalyze || !aiStatus?.configured || fresh.length === 0) return;
    const candidates = fresh
      .filter((job) => !job.aiAnalysis && !autoAnalyzedRef.current.has(job.id))
      .filter((job) => typeof job.score !== 'number' || job.score >= settings.autoBidThreshold)
      .slice(0, 2);
    for (const job of candidates) {
      autoAnalyzedRef.current.add(job.id);
      void analyzeJobInBackground(job);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, autoAnalyze, aiStatus?.configured, settings.autoBidThreshold]);

  // --- فید ابری: همگام‌سازی و درخواست اسکن روی رانر گیت‌هاب ---
  const handleSyncCloudFeed = useCallback(async () => {
    setCloudBusy(true);
    try {
      const res = await fetch('/api/bridge/sync-feed', { method: 'POST' });
      const data = await res.json();
      addLog(String(data?.message ?? data?.error ?? 'همگام‌سازی فید انجام شد.'), 'scan');
      await refreshFeed();
      await refreshCloudStatus();
    } catch (err: any) {
      addLog(`همگام‌سازی فید ناموفق بود: ${err?.message ?? err}`, 'scan');
    } finally {
      setCloudBusy(false);
    }
  }, [refreshFeed, refreshCloudStatus]);

  // درخواست اسکن ابری: رانر گیت‌هاب اسکنر واقعی را اجرا می‌کند و بعد فید همگام می‌شود
  const handleCloudScan = useCallback(async () => {
    setCloudBusy(true);
    addLog('درخواست اسکن ابری ثبت شد؛ رانر گیت‌هاب در حال اجرای اسکنر واقعی است...', 'scan');
    try {
      const res = await fetch('/api/bridge/cloud-scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      addLog(String(data?.message ?? data?.error ?? 'درخواست اسکن ابری ثبت شد.'), 'scan');
      // پیگیری وضعیت هر ۱۵ ثانیه تا پایان اجرا (سقف ~۵ دقیقه)
      const deadline = Date.now() + 5 * 60_000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 15_000));
        const status = await refreshCloudStatus();
        if (status?.status?.phase === 'finished') {
          addLog(`اسکن ابری تمام شد (${status.status.projects_this_run ?? 0} پروژه در این اجرا).`, 'scan');
          await handleSyncCloudFeed();
          return;
        }
      }
      addLog('زمان پیگیری اسکن ابری تمام شد؛ بعداً دکمه‌ی «همگام‌سازی» را بزنید.', 'scan');
    } catch (err: any) {
      addLog(`اسکن ابری ناموفق بود: ${err?.message ?? err}`, 'scan');
    } finally {
      setCloudBusy(false);
    }
  }, [addLog, refreshCloudStatus, handleSyncCloudFeed]);


  // Robust Socket.io Client Setup with Exponential Backoff Reconnection Policy
  useEffect(() => {
    if (isCapacitorNative() || isStandaloneMode()) {
      setSocketConnected(true);
      setSocketError(null);
      setIsReconnecting(false);
      addLog('حالت مستقل (Standalone) فعال است؛ فید و هوش مصنوعی مستقیماً روی دستگاه اجرا می‌شوند.', 'scan');
      return;
    }

    const socket: Socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 30, // 30 automatic retries
      reconnectionDelay: 1000,   // Initial 1s delay
      reconnectionDelayMax: 5000,// Maximum 5s backoff cap
      randomizationFactor: 0.5,  // Jitter factor to avoid thundering herds
      timeout: 10000,            // 10s connection timeout
    });

    socket.on('connect', () => {
      setSocketConnected(true);
      setSocketError(null); // Clear persistent error banner on successful connection
      setIsReconnecting(false);
      addLog('اتصال زنده وب‌سوکت Socket.io با بریج دریافت پروژه‌ها با موفقیت برقرار شد.', 'scan');
    });

    socket.on('disconnect', (reason) => {
      if (isStandaloneMode()) {
        setSocketConnected(true);
        setSocketError(null);
        setIsReconnecting(false);
        socket.disconnect();
        return;
      }
      setSocketConnected(false);
      if (reason === 'io server disconnect') {
        // The server forcefully disconnected; reconnect manually
        socket.connect();
      }
      addLog(`ارتباط وب‌سوکت قطع شد (${reason})، در حال تلاش برای اتصال مجدد...`, 'scan');
    });

    // Persistent Error & Connect Error Handlers
    socket.on('connect_error', (err) => {
      if (isStandaloneMode()) {
        setSocketConnected(true);
        setSocketError(null);
        setIsReconnecting(false);
        socket.disconnect();
        return;
      }
      setSocketConnected(false);
      setIsReconnecting(true);
      const errMsg = `خطای اتصال به بریج وب‌سوکت: ${err.message || 'شبکه در دسترس نیست'}.`;
      setSocketError(errMsg);
      addLog(errMsg, 'scan');
    });

    socket.on('error', (err: any) => {
      setSocketConnected(false);
      const errMsg = typeof err === 'string' ? err : err?.message || 'خطای سوکت رخ داده است.';
      setSocketError(`خطای وب‌سوکت: ${errMsg}`);
      addLog(`خطای سیستمی وب‌سوکت: ${errMsg}`, 'scan');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      setIsReconnecting(true);
      addLog(`در حال تلاش مجدد برای اتصال به بریج (تلاش شماره ${attemptNumber})...`, 'scan');
    });

    socket.on('reconnect_failed', () => {
      setIsReconnecting(false);
      setSocketError('تلاش‌های متعدد برای برقراری ارتباط با بریج با شکست مواجه شد. لطفاً اتصال اینترنت را بررسی و دکمه تلاش مجدد را فشار دهید.');
    });

    // Handle real-time push of newly discovered jobs with runtime schema validation and Gemini categorization
    socket.on('job:new', async (incomingData: unknown) => {
      // Validate incoming data against FreelanceJob interface
      if (!isValidFreelanceJob(incomingData)) {
        console.warn('[Socket.io Bridge] Received malformed job payload failing FreelanceJob validation:', incomingData);
        addLog('یک داده آگهی نامعتبر دریافت و به دلیل عدم تطابق با شمای پروژه رد شد.', 'scan');
        return;
      }

      // دسته‌بندی خودکار هنگام دریافت (تاکسونومی مشترک؛ سرور و UI یک کلید می‌دهند)
      const categoryKey =
        incomingData.categoryKey && incomingData.categoryKey !== 'all'
          ? incomingData.categoryKey
          : detectCategory(incomingData.title, incomingData.description).key;
      let categorizedTag = incomingData.categorizedTag || categoryLabel(categoryKey);
      if (!incomingData.categorizedTag) {
        categorizedTag = categoryLabel(
          await categorizeJobWithGemini(incomingData.title, incomingData.description),
        );
      }

      const priority: PriorityLevel = incomingData.priority || 
        (incomingData.budget >= 6000000 ? 'High' : incomingData.budget >= 4000000 ? 'Medium' : 'Low');

      const enrichedJob: FreelanceJob = {
        ...incomingData,
        categoryKey,
        category: incomingData.category || categoryLabel(categoryKey),
        categorizedTag,
        priority,
        tags: incomingData.tags.includes(categorizedTag) 
          ? incomingData.tags 
          : [...incomingData.tags, categorizedTag]
      };

      setJobs((prev) => {
        // Idempotency check: Guard against duplicates
        if (prev.some((j) => j.id === enrichedJob.id)) {
          return prev;
        }
        playChime();
        
        // Trigger browser notification for high-priority jobs
        if (enrichedJob.priority === 'High' && Notification.permission === 'granted') {
          new Notification(`پروژه اولویت بالا: ${enrichedJob.platform}`, {
            body: enrichedJob.title,
            icon: '/favicon.ico', // Ensure this exists or use a generic icon
          });
        }
        
        return [enrichedJob, ...prev];
      });

      addLog(
        `[پوش زنده Socket.io] پروژه جدید از ${enrichedJob.platform} با تگ هوشمند ${categorizedTag} و اولویت ${priority} دریافت شد: "${enrichedJob.title}" (${enrichedJob.budgetFormatted})`,
        'scan'
      );
    });

    // نتیجه‌ی اسکن واقعی (SPEC-004) که سرور پس از پایان کار می‌فرستد
    socket.on('scan:done', (payload: { added?: number; total?: number; scannedAt?: string | null }) => {
      setIsScanning(false);
      const added = payload?.added ?? 0;
      const total = payload?.total ?? 0;
      setFeed((prev) => ({
        ...prev,
        source: total > 0 ? 'scanner' : prev.source,
        scannedAt: payload?.scannedAt ?? prev.scannedAt,
        scannedProjects: total || prev.scannedProjects,
      }));
      addLog(`اسکن تمام شد: ${added} پروژه‌ی جدید (${total} پروژه در فید).`, 'scan');
      refreshFeed();
    });

    // Handle incoming bridge logs
    socket.on('bridge:log', (logPayload: { message: string; type?: ActivityLogItem['type'] }) => {
      if (logPayload?.message) {
        addLog(logPayload.message, logPayload.type || 'scan');
      }
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [refreshFeed]);

  const handleManualReconnect = () => {
    setIsReconnecting(true);
    addLog('تلاش دستی برای برقراری مجدد ارتباط با سوکت...');
    if (socketRef.current) {
      socketRef.current.connect();
    }
  };

  // Real-time scan trigger sending event to Socket.io backend bridge
  const handleQuickScan = () => {
    setIsScanning(true);
    addLog('ارسال سیگنال اسکن زنده به بریج وب‌سوکت Socket.io...');

    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('scan:trigger');
    } else {
      // Fallback HTTP endpoint if socket is reconnecting
      fetch('/api/bridge/trigger-scan', { method: 'POST' })
        .then((res) => res.json())
        .then(async (data) => {
          setIsScanning(false);
          if (data?.message) addLog(String(data.message), 'scan');
          if (typeof data?.added === 'number') {
            setFeed((prev) => ({
              ...prev,
              source: (data?.total ?? 0) > 0 ? 'scanner' : prev.source,
              scannedAt: data?.scannedAt ?? prev.scannedAt,
              scannedProjects: data?.total ?? prev.scannedProjects,
            }));
            refreshFeed();
          }
          if (data.job && isValidFreelanceJob(data.job)) {
            let job = data.job;
            if (!job.categorizedTag) {
              const catTag = await categorizeJobWithGemini(job.title, job.description);
              job = {
                ...job,
                categoryKey: job.categoryKey || catTag,
                category: job.category || categoryLabel(job.categoryKey || catTag),
                categorizedTag: categoryLabel(catTag),
                tags: job.tags.includes(catTag) ? job.tags : [...job.tags, catTag]
              };
            }
            if (!job.priority) {
              job.priority = job.budget >= 6000000 ? 'High' : job.budget >= 4000000 ? 'Medium' : 'Low';
            }
            setJobs((prev) => {
              if (prev.some((j) => j.id === job.id)) return prev;
              playChime();
              return [job, ...prev];
            });
          }
        })
        .catch(console.error);
    }

    setTimeout(() => {
      setIsScanning(false);
    }, 1000);
  };

  // Updaters
  const handleUpdateAnalysis = (jobId: string, analysis: AIAnalysis) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, aiAnalysis: analysis } : j))
    );
    addLog(`تحلیل هوش مصنوعی برای پروژه "${jobId}" با امتیاز ${analysis.automatabilityScore}٪ ثبت شد.`, 'bid');
  };

  const handleSaveProposalToJob = (jobId: string, proposal: string, price: number) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              proposal,
              proposedPrice: price,
              // وضعیت در برنامه فقط با اقدام صریح کاربر تغییر می‌کند؛ متن تولیدشده خودکار ارسال نمی‌شود.
            }
          : j
      )
    );
    addLog(
      `پیشنهاد ${price.toLocaleString('fa-IR')} تومانی برای پروژه ذخیره شد (هنوز ارسال نشده).`,
      'bid',
    );
  };

  const handleUpdateJobFiles = (jobId: string, files: Record<string, string>) => {
    const current = jobsRef.current.find((job) => job.id === jobId);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, generatedFiles: files, status: 'in_progress' as const } : j,
      ),
    );
    if (current) setJobToInit({ ...current, generatedFiles: files, status: 'in_progress' });
    addLog(`سورس پروژه «${jobId}» با ایجنت تولید شد (تست‌ها هنوز اجرا نشده‌اند).`, 'code');
  };

  const handleCompleteJob = (jobId: string, repoUrl: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId ? { ...j, repoUrl, status: 'ready' } : j,
      ),
    );
    addLog(`کد پروژه «${jobId}» در مخزن گیت‌هاب منتشر شد؛ منتظر بازبینی کارفرماست و تکمیل/پرداخت فقط با ثبت دستی شما مشخص می‌شود.`, 'github');
  };

  const handleMoveJobStatus = (jobId: string, newStatus: FreelanceJob['status']) => {
    const todayIso = new Date().toISOString().split('T')[0];
    const job = jobsRef.current.find(j => j.id === jobId);
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              status: newStatus,
              ...(newStatus === 'completed' && !j.completedAt ? { completedAt: todayIso } : {}),
            }
          : j
      )
    );
    if (job && newStatus === 'in_progress') {
        setJobToInit({...job, status: 'in_progress'});
    }
    addLog(`وضعیت پروژه "${jobId}" به "${newStatus}" تغییر یافت.`, 'scan');
  };

  const handleUpdateJobRepoUrl = (jobId: string, repoUrl: string) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, repoUrl } : j))
    );
    addLog(`مخزن گیت‌هاب برای پروژه "${jobId}" با موفقیت ایجاد شد: ${repoUrl}`, 'github');
  };

  const handleUpdatePriority = (jobId: string, newPriority: PriorityLevel) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, priority: newPriority } : j))
    );
    addLog(`اولویت تسک "${jobId}" به ${newPriority} تغییر یافت.`, 'scan');
  };

  const handleAddNewManualJob = async (newJob: Partial<FreelanceJob>) => {
    const fullJob = newJob as FreelanceJob;
    // Categorize using Gemini API upon receipt
    const categoryKey =
      fullJob.categoryKey && fullJob.categoryKey !== 'all'
        ? fullJob.categoryKey
        : detectCategory(fullJob.title, fullJob.description).key;
    const categorizedTag =
      fullJob.categorizedTag ||
      categoryLabel(await categorizeJobWithGemini(fullJob.title, fullJob.description));
    const priority: PriorityLevel =
      fullJob.priority ||
      (fullJob.budget >= 6000000 ? 'High' : fullJob.budget >= 4000000 ? 'Medium' : 'Low');

    const enrichedJob: FreelanceJob = {
      ...fullJob,
      categoryKey,
      category: fullJob.category || categoryLabel(categoryKey),
      categorizedTag,
      priority,
      tags:
        fullJob.tags && fullJob.tags.includes(categorizedTag)
          ? fullJob.tags
          : [...(fullJob.tags || []), categorizedTag],
    };

    setJobs((prev) => [enrichedJob, ...prev]);
    setSelectedJobForAnalysis(enrichedJob);
    addLog(
      `پروژه دستی "${enrichedJob.title}" با تگ هوشمند ${categorizedTag} و اولویت ${priority} افزوده شد.`,
      'scan'
    );
  };

  // Revenue metrics
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const totalEarningsToday = completedJobs.reduce(
    (acc, j) => acc + (j.proposedPrice || j.budget || 0),
    0
  );
  const activeJobsCount = jobs.filter((j) => j.status !== 'completed').length;

  const goToTab = useCallback((tab: AppTab) => setActiveTab(tab), []);

  const paletteActions: PaletteAction[] = [
    { id: 'tab-hunter', label: 'رفتن به پروژه‌ها', hint: 'فهرست و جست‌وجوی آگهی‌ها', icon: Radar, run: () => goToTab('hunter') },
    { id: 'tab-coder', label: 'رفتن به محیط توسعه', hint: 'Explorer، ویرایش فایل‌ها، ابزار AI و ترمینال تست', icon: Terminal, run: () => goToTab('coder') },
    { id: 'tab-pipeline', label: 'رفتن به پایپ‌لاین', hint: 'برد وضعیت پروژه‌ها', icon: Workflow, run: () => goToTab('pipeline') },
    { id: 'tab-autopilot', label: 'رفتن به مرکز کنترل', hint: 'اسکن، تحلیل خودکار، لاگ‌ها', icon: Sparkles, run: () => goToTab('autopilot') },
    {
      id: 'scan',
      label: 'اسکن زنده‌ی فید',
      hint: 'اجرای اسکنر واقعی روی منابع',
      icon: Zap,
      run: () => {
        setActiveTab('hunter');
        handleQuickScan();
      },
    },
    { id: 'ai-settings', label: 'تنظیم هوش مصنوعی', hint: 'انتخاب سرویس، واردکردن کلید API، تست اتصال و انتخاب مدل', icon: Sparkles, run: openAISettings },
    { id: 'settings', label: 'تنظیمات برنامه', hint: 'عمومی، گیت‌هاب، اجرای کد', icon: Settings, run: openSettings },
  ];

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-slate-950 text-slate-100">
      {/* Top Bar Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={openSettings}
        onQuickScan={handleQuickScan}
        aiStatus={aiStatus}
        isScanning={isScanning}
        totalEarningsToday={totalEarningsToday}
        activeJobsCount={activeJobsCount}
        socketConnected={socketConnected}
        onOpenCommandPalette={() => setIsCommandOpen(true)}
      />

      {/* Persistent Socket.io Connection Error Notification Banner */}
      {socketError && (
        <div className="shrink-0 border-b border-red-800/80 bg-red-950/80 px-3 py-1.5 text-[11px] text-red-200">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <WifiOff className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <span className="truncate font-medium">{socketError}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleManualReconnect}
                disabled={isReconnecting}
                className="btn h-6 border-red-700/60 bg-red-900/60 px-2 text-[10px] text-red-100 hover:bg-red-900/80"
              >
                <RefreshCw className={`h-3 w-3 ${isReconnecting ? 'animate-spin' : ''}`} />
                {isReconnecting ? 'در حال اتصال مجدد…' : 'اتصال مجدد'}
              </button>
              <button onClick={() => setSocketError(null)} className="icon-btn h-6 w-6 text-red-300" aria-label="بستن پیام">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {storageWarning && (
        <div className="flex shrink-0 items-center gap-1.5 border-b border-amber-800/50 bg-amber-950/30 px-3 py-1 text-[10px] text-amber-200">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate">{storageWarning}</span>
          <button onClick={() => setStorageWarning(null)} className="ms-auto shrink-0 text-amber-400 hover:text-amber-200">
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* AI setup banner (SPEC-008) — فقط وقتی AI تنظیم نشده است */}
      {!aiStatusLoading && aiStatus && !aiStatus.configured && (
        <div className="shrink-0 border-b border-amber-800/50 bg-amber-950/40 px-3 py-1.5 text-[11px] text-amber-100">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              <span className="truncate">
                <span className="font-semibold">هوش مصنوعی تنظیم نشده.</span> برای تحلیل، پروپوزال، دسته‌بندی و تولید کد،
                یک provider و کلید اضافه کنید.
              </span>
            </div>
            <button onClick={openAISettings} className="btn h-6 border-amber-500/50 bg-amber-500/15 px-2 text-[10px] font-bold text-amber-100 hover:bg-amber-500/25">
              <Sparkles className="h-3 w-3" /> تنظیم هوش مصنوعی
            </button>
          </div>
        </div>
      )}

      {/* Main Workspace Canvas */}
      <main className="flex min-h-0 flex-1 flex-col">
        {activeTab === 'hunter' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <FeedStatusBar
              source={feed.source}
              scannedAt={feed.scannedAt}
              scannedProjects={feed.scannedProjects}
              jobCount={jobs.length}
              isScanning={isScanning}
              onScan={handleQuickScan}
              cloudEnabled={cloudInfo.enabled}
              cloudBusy={cloudBusy}
              onCloudScan={handleCloudScan}
              onSyncFeed={handleSyncCloudFeed}
            />
            <div className="min-h-0 flex-1">
              <JobHunter
                jobs={jobs}
                focusJobId={focusJobId}
                onFocusHandled={() => setFocusJobId(null)}
                onSelectJobForAnalysis={(job) => setSelectedJobForAnalysis(job)}
                onSelectJobForProposal={(job) => setSelectedJobForProposal(job)}
                onSelectJobForCoding={(job) => {
                  setSelectedJobForCoding(job);
                  setActiveTab('coder');
                }}
                onAddNewManualJob={handleAddNewManualJob}
              />
            </div>
          </div>
        )}

        {activeTab === 'coder' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <CodeWorkspace
              job={selectedJobForCoding}
              githubToken={settings.githubToken}
              onOpenGitHubPush={(job, files) => {
                setGitHubPushState({ job, files });
              }}
              onUpdateJobFiles={handleUpdateJobFiles}
              onUpdateJobRepoUrl={handleUpdateJobRepoUrl}
              onOpenAISettings={openAISettings}
              autoGenerate={settings.cyborgMode && Boolean(aiStatus?.configured)}
              onBrowseJobs={() => setActiveTab('hunter')}
            />
          </div>
        )}

        {(activeTab === 'pipeline' || activeTab === 'autopilot') && (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-[1600px] space-y-3 p-3 sm:p-4">
              {activeTab === 'pipeline' && (
                <PipelineBoard
                  jobs={jobs}
                  onSelectJobForAnalysis={(job) => setSelectedJobForAnalysis(job)}
                  onSelectJobForProposal={(job) => setSelectedJobForProposal(job)}
                  onSelectJobForCoding={(job) => {
                    setSelectedJobForCoding(job);
                    setActiveTab('coder');
                  }}
                  onMoveJobStatus={handleMoveJobStatus}
                  onUpdatePriority={handleUpdatePriority}
                  dailyEarningsGoal={settings.dailyEarningsGoal}
                />
              )}
              {activeTab === 'autopilot' && (
                <AutoPilotPanel
                  logs={logs}
                  settings={settings}
                  jobs={jobs}
                  onUpdateSettings={(newSettings) => setSettings({ ...settings, ...newSettings })}
                  onTriggerManualScan={handleQuickScan}
                  isScanning={isScanning}
                  autoAnalyze={autoAnalyze}
                  onToggleAutoAnalyze={() => setAutoAnalyze((value) => !value)}
                  aiConfigured={Boolean(aiStatus?.configured)}
                />
              )}
              {jobToInit && (
                <GitHubWorkflowManager
                  job={jobToInit}
                  githubToken={settings.githubToken}
                  onRepoCreated={(repoUrl) => {
                    setJobs((prev) => prev.map((j) => (j.id === jobToInit.id ? { ...j, repoUrl } : j)));
                    setJobToInit(null);
                  }}
                  autoStart={false}
                />
              )}
            </div>
          </div>
        )}
      </main>

      <StatusBar
        socketConnected={socketConnected}
        aiStatus={aiStatus}
        feedSource={feed.source}
        jobCount={jobs.length}
        activeTab={activeTab}
      />
      <MobileNav activeTab={activeTab} setActiveTab={setActiveTab} activeJobsCount={activeJobsCount} />

      <CommandPalette
        open={isCommandOpen}
        onClose={() => setIsCommandOpen(false)}
        jobs={jobs}
        actions={paletteActions}
        onSelectJob={(job) => {
          setActiveTab('hunter');
          setFocusJobId(job.id);
        }}
      />

      {/* Modal: AI Feasibility & Price Evaluator */}
      {selectedJobForAnalysis && (
        <AIEvaluatorModal
          job={selectedJobForAnalysis}
          onClose={() => setSelectedJobForAnalysis(null)}
          onProceedToProposal={(job) => {
            setSelectedJobForProposal(job);
          }}
          onProceedToCoding={(job) => {
            setSelectedJobForCoding(job);
            setActiveTab('coder');
          }}
          onUpdateAnalysis={handleUpdateAnalysis}
          onOpenAISettings={openAISettings}
        />
      )}

      {/* Modal: Proposal Studio */}
      {selectedJobForProposal && (
        <ProposalStudioModal
          job={selectedJobForProposal}
          onClose={() => setSelectedJobForProposal(null)}
          onProceedToCoding={(job) => {
            setSelectedJobForCoding(job);
            setActiveTab('coder');
          }}
          onSaveProposalToJob={handleSaveProposalToJob}
          onOpenAISettings={openAISettings}
          autoGenerate={settings.cyborgMode && Boolean(aiStatus?.configured)}
          defaultDiscountRate={settings.defaultDiscountRate}
        />
      )}

      {/* Modal: GitHub Dispatcher & Employer Delivery */}
      {gitHubPushState.job && (
        <GitHubDispatcher
          job={gitHubPushState.job}
          files={gitHubPushState.files}
          githubToken={settings.githubToken}
          onClose={() => setGitHubPushState({ job: null, files: {} })}
          onCompleteJob={handleCompleteJob}
        />
      )}

      {/* Modal: Settings */}
      {isSettingsOpen && (
        <SettingsModal
          settings={settings}
          initialTab={settingsTab}
          onClose={() => setIsSettingsOpen(false)}
          onSave={(newSettings) => setSettings(newSettings)}
          onAIChanged={(status) => {
            setAiStatus(status);
            setAiStatusLoading(false);
          }}
        />
      )}
    </div>
  );
}
