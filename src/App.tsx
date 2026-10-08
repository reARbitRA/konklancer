import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { JobHunter } from './components/JobHunter';
import { CodeWorkspace } from './components/CodeWorkspace';
import { PipelineBoard } from './components/PipelineBoard';
import { AutoPilotPanel } from './components/AutoPilotPanel';
import { AIEvaluatorModal } from './components/AIEvaluatorModal';
import { ProposalStudioModal } from './components/ProposalStudioModal';
import { GitHubDispatcher } from './components/GitHubDispatcher';
import { SettingsModal } from './components/SettingsModal';
import { INITIAL_JOBS } from './data/mockJobs';
import { FreelanceJob, AIAnalysis, ActivityLogItem, UserSettings } from './types';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<'hunter' | 'coder' | 'pipeline' | 'autopilot'>('hunter');

  // Core Data
  const [jobs, setJobs] = useState<FreelanceJob[]>(() => {
    const saved = localStorage.getItem('freelanceflow_jobs');
    return saved ? JSON.parse(saved) : INITIAL_JOBS;
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
    {
      id: 'log-2',
      timestamp: '۱۰:۴۴',
      type: 'bid',
      message: 'پروژه استخراج دیتای دیوار شناسایی و امتیاز اتوماسیون ۹۶٪ تایید شد.',
    },
  ]);

  // Selected Jobs for Modals & Workspaces
  const [selectedJobForAnalysis, setSelectedJobForAnalysis] = useState<FreelanceJob | null>(null);
  const [selectedJobForProposal, setSelectedJobForProposal] = useState<FreelanceJob | null>(null);
  const [selectedJobForCoding, setSelectedJobForCoding] = useState<FreelanceJob | null>(() => INITIAL_JOBS[0] || null);
  const [gitHubPushState, setGitHubPushState] = useState<{
    job: FreelanceJob | null;
    files: Record<string, string>;
  }>({ job: null, files: {} });

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // Sync state to localStorage
  useEffect(() => {
    localStorage.setItem('freelanceflow_jobs', JSON.stringify(jobs));
  }, [jobs]);

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
      id: `log-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }),
      type,
      message,
    };
    setLogs((prev) => [newLog, ...prev.slice(0, 49)]);
  };

  // Quick live scan simulation
  const handleQuickScan = () => {
    setIsScanning(true);
    addLog('در حال اسکن فوری آخرین مناقصات و پروژه‌های پونیشا، کارلانسر و پارسکدرز...');

    setTimeout(() => {
      setIsScanning(false);
      playChime();

      // Introduce a fresh simulated project matching high-value tags
      const freshJob: FreelanceJob = {
        id: `scan-${Date.now().toString().slice(-4)}`,
        platform: 'کارلانسر',
        platformKey: 'karlancer',
        title: 'اسکریپت پایتون استخراج دیتای ترب و ذخیره در فایل اکسل همراه با لاگ',
        clientName: 'فروشگاه الکترونیک رسا',
        clientRating: 4.9,
        clientReviews: 12,
        budget: 4500000,
        budgetFormatted: '۴,۵۰۰,۰۰۰ تومان',
        deadline: '۱ روز',
        postedTime: 'هم‌اکنون',
        category: 'وب اسکرپینگ / پایتون',
        categoryKey: 'scraping',
        tags: ['Python', 'Torob API', 'Pandas', 'Excel'],
        description: 'نیازمند اسکریپتی هستیم که قیمت‌های یک لیست ۲۰۰ تایی کالا را از موتور جستجوی ترب جستجو کند و کمترین قیمت و فروشنده آن را در فایل اکسل خروجی دهد. تحویل زیر ۶ ساعت اولویت دارد.',
        proposalsCount: 2,
        avgBid: 4100000,
        status: 'new',
      };

      setJobs((prev) => [freshJob, ...prev]);
      addLog(`پروژه جدید یافت شد: "${freshJob.title}" با بودجه ۴,۵۰۰,۰۰۰ تومان.`, 'scan');
    }, 1500);
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
      prev.map((j) => (j.id === jobId ? { ...j, generatedFiles: files, status: 'in_progress' } : j))
    );
    addLog(`سورس کامل پروژه "${jobId}" با ایجنت کدنویسی تولید و اعتبارسنجی شد.`, 'code');
  };

  const handleCompleteJob = (jobId: string, repoUrl: string) => {
    setJobs((prev) =>
      prev.map((j) =>
        j.id === jobId
          ? {
              ...j,
              repoUrl,
              status: 'completed',
            }
          : j
      )
    );
    playChime();
    addLog(`پروژه "${jobId}" در گیت‌هاب منتشر شد و درآمد آن تسویه گردید!`, 'payment');
  };

  const handleMoveJobStatus = (jobId: string, newStatus: FreelanceJob['status']) => {
    setJobs((prev) =>
      prev.map((j) => (j.id === jobId ? { ...j, status: newStatus } : j))
    );
  };

  const handleAddNewManualJob = (newJob: Partial<FreelanceJob>) => {
    const fullJob = newJob as FreelanceJob;
    setJobs((prev) => [fullJob, ...prev]);
    setSelectedJobForAnalysis(fullJob);
    addLog(`پروژه دستی "${fullJob.title}" افزوده شد و تحلیل هوش مصنوعی آغاز شد.`, 'scan');
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
      />

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
            onOpenGitHubPush={(job, files) => {
              setGitHubPushState({ job, files });
            }}
            onUpdateJobFiles={handleUpdateJobFiles}
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
            dailyEarningsGoal={settings.dailyEarningsGoal}
          />
        )}

        {activeTab === 'autopilot' && (
          <AutoPilotPanel
            logs={logs}
            settings={settings}
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
