import React from 'react';
import { Activity, CircleDot, Cpu, Database, Radar, Sparkles, Terminal, Workflow } from 'lucide-react';
import type { AppTab } from './Header';
import type { AIStatusPayload } from '../utils/aiClient';
import type { FeedSource } from './FeedStatusBar';

const FEED_LABEL: Record<FeedSource, string> = {
  scanner: 'اسکنر واقعی',
  demo: 'داده‌ی نمایشی',
  empty: 'فید خالی',
  unknown: 'نامشخص',
};

interface StatusBarProps {
  socketConnected: boolean;
  aiStatus: AIStatusPayload | null;
  feedSource: FeedSource;
  jobCount: number;
  activeTab: AppTab;
}

export const StatusBar: React.FC<StatusBarProps> = ({ socketConnected, aiStatus, feedSource, jobCount, activeTab }) => {
  const tabLabel: Record<AppTab, string> = {
    hunter: 'پروژه‌ها',
    coder: 'استودیو کد',
    pipeline: 'پایپ‌لاین',
    autopilot: 'مرکز کنترل',
  };

  return (
    <footer className="hidden h-6 shrink-0 items-center gap-3 border-t border-slate-800/80 bg-[#060b14] px-3 font-mono text-[10px] text-slate-500 md:flex">
      <span className="flex items-center gap-1 text-emerald-400/90">
        <Terminal className="h-3 w-3" /> Konklancer
      </span>
      <span className="text-slate-700">|</span>
      <span className="flex items-center gap-1">
        <CircleDot className={`h-3 w-3 ${socketConnected ? 'text-emerald-400' : 'text-amber-400'}`} />
        {socketConnected ? 'bridge live' : 'offline'}
      </span>
      <span className="flex items-center gap-1">
        <Cpu className="h-3 w-3 text-slate-500" />
        {aiStatus?.configured
          ? aiStatus.provider?.modelStrong || aiStatus.provider?.modelFast || 'ai · auto'
          : 'ai: not configured'}
      </span>
      <span className="flex items-center gap-1">
        <Database className="h-3 w-3 text-slate-500" />
        {FEED_LABEL[feedSource]}
      </span>
      <span className="flex items-center gap-1">
        <Activity className="h-3 w-3 text-slate-500" />
        {jobCount.toLocaleString('fa-IR')} پروژه
      </span>
      <span className="flex-1" />
      <span className="hidden text-slate-600 lg:inline">
        <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> جست‌وجو
      </span>
      <span className="hidden text-slate-600 xl:inline">
        <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">S</kbd> ذخیره‌ی فایل
      </span>
      <span className="text-slate-600">{tabLabel[activeTab]}</span>
    </footer>
  );
};

interface MobileNavProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  activeJobsCount: number;
}

const MOBILE_TABS: Array<{ key: AppTab; label: string; icon: React.ElementType }> = [
  { key: 'hunter', label: 'پروژه‌ها', icon: Radar },
  { key: 'coder', label: 'استودیو', icon: Terminal },
  { key: 'pipeline', label: 'پایپ‌لاین', icon: Workflow },
  { key: 'autopilot', label: 'کنترل', icon: Sparkles },
];

export const MobileNav: React.FC<MobileNavProps> = ({ activeTab, setActiveTab, activeJobsCount }) => (
  <nav
    className="flex shrink-0 items-stretch border-t border-slate-800/80 bg-[#070c16]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    aria-label="ناوبری موبایل"
  >
    {MOBILE_TABS.map((tab) => {
      const Icon = tab.icon;
      const active = tab.key === activeTab;
      return (
        <button
          key={tab.key}
          onClick={() => setActiveTab(tab.key)}
          aria-current={active ? 'page' : undefined}
          className={`relative flex flex-1 flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors ${
            active ? 'text-emerald-300' : 'text-slate-500'
          }`}
        >
          {active && <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-emerald-400" />}
          <Icon className="h-4 w-4" />
          {tab.label}
          {tab.key === 'pipeline' && activeJobsCount > 0 && (
            <span className="absolute right-[22%] top-1 rounded-full bg-emerald-500 px-1 text-[8px] font-bold text-slate-950">
              {activeJobsCount.toLocaleString('fa-IR')}
            </span>
          )}
        </button>
      );
    })}
  </nav>
);
