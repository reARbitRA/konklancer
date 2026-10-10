import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { 
  AlertTriangle, 
  RefreshCw, 
  X, 
  WifiOff, 
  CheckCircle2 
} from 'lucide-react';
import { Header } from './components/Header';
import { JobHunter } from './components/JobHunter';
import { CodeWorkspace } from './components/CodeWorkspace';
import { PipelineBoard } from './components/PipelineBoard';
import { AutoPilotPanel } from './components/AutoPilotPanel';
import { AIEvaluatorModal } from './components/AIEvaluatorModal';
import { ProposalStudioModal } from './components/ProposalStudioModal';
import { GitHubDispatcher } from './components/GitHubDispatcher';
import { GitHubWorkflowManager } from './components/GitHubWorkflowManager';
import { SettingsModal } from './components/SettingsModal';
import { INITIAL_JOBS } from './data/mockJobs';
import { FreelanceJob, AIAnalysis, ActivityLogItem, UserSettings, PriorityLevel } from './types';
import { categorizeJobWithGemini } from './utils/geminiCategorizer';

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

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'hunter' | 'coder' | 'pipeline' | 'autopilot'>('hunter');

  // Core Data
  const [jobs, setJobs] = useState<FreelanceJob[]>(() => {
    const saved = localStorage.getItem('freelanceflow_jobs');
    if (saved) {
      try {
        const parsed: FreelanceJob[] = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const hasCompleted = parsed.some((j) => j.status === 'completed');
          const enriched = parsed.map((j) => ({
            ...j,
            priority: j.priority || (j.budget >= 6000000 ? 'High' : j.budget >= 4000000 ? 'Medium' : 'Low'),
            categorizedTag:
              j.categorizedTag ||
              (j.tags?.find((t) => ['Frontend', 'Backend', 'DevOps', 'Design'].includes(t)) as any) ||
              'Backend',
          }));
          if (!hasCompleted) {
            const initialCompleted = INITIAL_JOBS.filter((j) => j.status === 'completed');
            return [...enriched, ...initialCompleted];
          }
          return enriched;
        }
      } catch (e) {
        console.error('Failed to parse jobs from localStorage:', e);
      }
    }
    return INITIAL_JOBS;
  });

  const [settings, setSettings] = useState<UserSettings>(() => {
    const saved = localStorage.getItem('freelanceflow_settings');
    return saved
      ? JSON.parse(saved)
      : {
          githubToken: '',
          defaultDiscountRate: 18,
          autoBidThreshold: 85,
          cyborgMode: true,
          preferredTone: 'friendly_expert',
          dailyEarningsGoal: 5000000,
        };
  });

  const [logs, setLogs] = useState<ActivityLogItem[]>([
    {
      id: 'log-1',
      timestamp: '۱۰:۴۲',
      type: 'scan',
      message: 'موتور رصد به پلتفرم‌های پونیشا، کارلانسر و پارسکدرز متصل شد.',
    },
  ]);

  // Socket.io Real-Time Client State
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState<boolean>(false);
  const [socketError, setSocketError] = useState<string | null>(null);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  // Selected Jobs for Modals & Workspaces
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<FreelanceJob | null>(null);
  const [selectedJobForProposal, setSelectedJobForProposal] = useState<FreelanceJob | null>(null);
  const [selectedJobForCoding, setSelectedJobForCoding] = useState<FreelanceJob | null>(() => INITIAL_JOBS[0] || null);
  const [gitHubPushState, setGitHubPushState] = useState<{
    job: FreelanceJob | null;
    files: Record<string, string>;
  }>({ job: null, files: {} });
  const [jobToInit, setJobToInit] = useState<FreelanceJob | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('freelanceflow_jobs', JSON.stringify(jobs));
  }, [jobs]);

  const jobsRef = useRef(jobs);
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  useEffect(() => {
    const interval = setInterval(() => {
      const biddedJobs = jobsRef.current.filter(j => j.status === 'bidded');
      if (biddedJobs.length > 0 && Notification.permission === 'granted') {
        new Notification('یادآوری بررسی وضعیت پروژه‌ها', {
          body: `شما ${biddedJobs.length} پروژه در وضعیت «ارسال پیشنهاد» دارید. برای بررسی بازخوردها اقدام کنید.`,
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
    localStorage.setItem('freelanceflow_settings', JSON.stringify(settings));
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

  // Robust Socket.io Client Setup with Exponential Backoff Reconnection Policy
  useEffect(() => {
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
      setSocketConnected(false);
      if (reason === 'io server disconnect') {
        // The server forcefully disconnected; reconnect manually
        socket.connect();
      }
      addLog(`ارتباط وب‌سوکت قطع شد (${reason})، در حال تلاش برای اتصال مجدد...`, 'scan');
    });

    // Persistent Error & Connect Error Handlers
    socket.on('connect_error', (err) => {
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

      // Automatically categorize with Gemini API helper function upon receipt
      let categorizedTag = incomingData.categorizedTag;
      if (!categorizedTag) {
        categorizedTag = await categorizeJobWithGemini(incomingData.title, incomingData.description);
      }

      const priority: PriorityLevel = incomingData.priority || 
        (incomingData.budget >= 6000000 ? 'High' : incomingData.budget >= 4000000 ? 'Medium' : 'Low');

      const enrichedJob: FreelanceJob = {
        ...incomingData,
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
  }, []);

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
          if (data.job && isValidFreelanceJob(data.job)) {
            let job = data.job;
            if (!job.categorizedTag) {
              const catTag = await categorizeJobWithGemini(job.title, job.description);
              job = {
                ...job,
                categorizedTag: catTag,
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
              status: j.status === 'new' ? 'bidded' : j.status,
            }
          : j
      )
    );
    addLog(`پیشنهاد قیمت ${price.toLocaleString('fa-IR')} تومان در پایپ‌لاین ثبت گردید.`, 'bid');
  };

  const handleUpdateJobFiles = (jobId: string, files: Record<string, string>) => {
    setJobs((prev) =>
      prev.map((j) => {
        if (j.id === jobId) {
          const updatedJob = { ...j, generatedFiles: files, status: 'in_progress' as const };
          setJobToInit(updatedJob);
          return updatedJob;
        }
        return j;
      })
    );
    addLog(`سورس کامل پروژه "${jobId}" با ایجنت کدنویسی تولید و اعتبارسنجی شد.`, 'code');
  };

  const handleCompleteJob = (jobId: string, repoUrl: string) => {
    const todayIso = new Date().toISOString().split('T')[0];
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              repoUrl,
              status: 'completed',
              completedAt: j.completedAt || todayIso,
            }
          : j
      )
    );
    playChime();
    addLog(`پروژه "${jobId}" در گیت‌هاب منتشر شد و درآمد آن تسویه گردید!`, 'payment');
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
    const categorizedTag =
      fullJob.categorizedTag ||
      (await categorizeJobWithGemini(fullJob.title, fullJob.description));
    const priority: PriorityLevel =
      fullJob.priority ||
      (fullJob.budget >= 6000000 ? 'High' : fullJob.budget >= 4000000 ? 'Medium' : 'Low');

    const enrichedJob: FreelanceJob = {
      ...fullJob,
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Bar Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onQuickScan={handleQuickScan}
        isScanning={isScanning}
        totalEarningsToday={totalEarningsToday}
        activeJobsCount={activeJobsCount}
        socketConnected={socketConnected}
      />

      {/* Persistent Socket.io Connection Error Notification Banner */}
      {socketError && (
        <div className="bg-red-950/80 border-b border-red-800/80 text-red-200 px-4 py-2.5 text-xs transition-all animate-in slide-in-from-top duration-200">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <WifiOff className="h-4 w-4 text-red-400 shrink-0" />
              <span className="font-medium">
                {socketError}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleManualReconnect}
                disabled={isReconnecting}
                className="flex items-center gap-1.5 px-3 py-1 bg-red-900/60 hover:bg-red-850 text-red-100 border border-red-700/60 rounded text-[11px] font-medium transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${isReconnecting ? 'animate-spin' : ''}`} />
                <span>{isReconnecting ? 'در حال اتصال مجدد...' : 'تلاش مجدد برای اتصال (Reconnect)'}</span>
              </button>

              <button
                onClick={() => setSocketError(null)}
                className="text-red-400 hover:text-red-200 p-1"
                title="بستن پیام"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'hunter' && (
          <JobHunter
            jobs={jobs}
            onSelectJobForAnalysis={(job) => setSelectedJobForAnalysis(job)}
            onSelectJobForProposal={(job) => setSelectedJobForProposal(job)}
            onSelectJobForCoding={(job) => {
              setSelectedJobForCoding(job);
              setActiveTab('coder');
            }}
            onAddNewManualJob={handleAddNewManualJob}
          />
        )}

        {activeTab === 'coder' && (
          <CodeWorkspace
            job={selectedJobForCoding}
            githubToken={settings.githubToken}
            onOpenGitHubPush={(job, files) => {
              setGitHubPushState({ job, files });
            }}
            onUpdateJobFiles={handleUpdateJobFiles}
            onUpdateJobRepoUrl={handleUpdateJobRepoUrl}
          />
        )}

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
        {jobToInit && (
          <GitHubWorkflowManager
            job={jobToInit}
            githubToken={settings.githubToken}
            onRepoCreated={(repoUrl) => {
              setJobs(prev => prev.map(j => j.id === jobToInit.id ? { ...j, repoUrl } : j));
              setJobToInit(null);
            }}
            autoStart={true}
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
          />
        )}
      </main>

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
          onClose={() => setIsSettingsOpen(false)}
          onSave={(newSettings) => setSettings(newSettings)}
        />
      )}
    </div>
  );
}
