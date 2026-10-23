import React from 'react';
import type { AIStatusPayload } from '../utils/aiClient';
import { Radar, Settings, Sparkles, Search, Terminal, Workflow, Zap } from 'lucide-react';

export type AppTab = 'hunter' | 'coder' | 'pipeline' | 'autopilot';

interface HeaderProps {
  activeTab: AppTab;
  setActiveTab: (tab: AppTab) => void;
  onOpenSettings: () => void;
  onQuickScan: () => void;
  isScanning: boolean;
  totalEarningsToday: number;
  activeJobsCount: number;
  socketConnected?: boolean;
  aiStatus?: AIStatusPayload | null;
  onOpenCommandPalette?: () => void;
}

const TABS: Array<{ key: AppTab; label: string; short: string; icon: React.ElementType }> = [
  { key: 'hunter', label: 'پروژه‌ها', short: 'پروژه‌ها', icon: Radar },
  { key: 'coder', label: 'محیط توسعه', short: 'کدنویسی', icon: Terminal },
  { key: 'pipeline', label: 'پایپ‌لاین', short: 'پایپ‌لاین', icon: Workflow },
  { key: 'autopilot', label: 'مرکز کنترل', short: 'کنترل', icon: Sparkles },
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onOpenSettings,
  onQuickScan,
  isScanning,
  totalEarningsToday,
  activeJobsCount,
  socketConnected = false,
  aiStatus = null,
  onOpenCommandPalette,
}) => {
  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-slate-800/70 bg-[#070c16]/85 px-2.5 backdrop-blur-xl sm:px-4">
      {/* brand */}
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-gradient-to-b from-emerald-500/20 to-emerald-500/5 text-emerald-300 shadow-[0_0_24px_-10px_rgba(52,211,153,0.8)]">
          <Zap className="h-4 w-4" />
        </div>
        <div className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="truncate text-[13px] font-bold tracking-tight text-white">Konklancer</span>
          <span className="font-mono text-[9px] text-slate-500">freelance ai workbench</span>
        </div>
        <span
          className={`ms-1 h-1.5 w-1.5 shrink-0 rounded-full ${
            socketConnected ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]' : 'bg-amber-400'
          }`}
          title={socketConnected ? 'اتصال زنده برقرار است' : 'در حال اتصال…'}
        />
      </div>

      <div className="hidden h-5 w-px bg-slate-800 md:block" />

      {/* primary navigation */}
      <nav className="hidden items-center gap-0.5 md:flex" aria-label="بخش‌های اصلی">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              aria-current={active ? 'page' : undefined}
              title={tab.key === 'coder' ? 'محیط توسعه: درخت فایل، ادیتور، ابزارهای AI و ترمینال' : tab.label}
              className={`relative flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-medium transition-colors ${
                active ? 'bg-slate-800/80 text-white' : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <Icon className={`h-3.5 w-3.5 ${active ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="hidden lg:inline">{tab.label}</span>
              <span className="lg:hidden">{tab.short}</span>
              {tab.key === 'pipeline' && activeJobsCount > 0 && (
                <span className="rounded bg-slate-700/80 px-1 font-mono text-[9px] tabular-nums text-slate-200">
                  {activeJobsCount.toLocaleString('fa-IR')}
                </span>
              )}
              {active && <span className="absolute -bottom-[9px] inset-x-2 h-px bg-emerald-400/80" />}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* command palette trigger */}
      <button
        onClick={onOpenCommandPalette}
        className="group flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900/60 text-slate-400 transition-colors hover:border-slate-700 hover:text-slate-200 sm:w-[190px] sm:justify-start sm:gap-2 sm:px-2.5 xl:w-[240px]"
        title="جست‌وجوی سراسری (Ctrl/⌘ + K)"
        aria-label="جست‌وجوی سراسری"
      >
        <Search className="h-3.5 w-3.5 shrink-0" />
        <span className="hidden flex-1 truncate text-right text-[11px] text-slate-500 sm:inline">
          جست‌وجوی پروژه، دستور…
        </span>
        <span className="hidden shrink-0 items-center gap-0.5 font-mono text-[9px] text-slate-600 sm:flex">
          <kbd className="kbd">Ctrl</kbd>
          <kbd className="kbd">K</kbd>
        </span>
      </button>

      {/* AI status */}
      {aiStatus && (
        <button
          onClick={onOpenSettings}
          title={
            aiStatus.configured
              ? `${aiStatus.provider?.label ?? 'AI'} · ${aiStatus.provider?.kindLabel ?? ''} · منبع: ${aiStatus.source}`
              : 'هوش مصنوعی تنظیم نشده — کلیک برای تنظیم'
          }
          className={`hidden h-8 max-w-[180px] items-center gap-1.5 rounded-lg border px-2 font-mono text-[10px] transition-colors xl:flex ${
            aiStatus.configured
              ? 'border-emerald-500/25 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/10'
              : 'border-amber-500/30 bg-amber-500/5 text-amber-300 hover:bg-amber-500/10'
          }`}
        >
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${aiStatus.configured ? 'bg-emerald-400' : 'bg-amber-400'}`} />
          <span className="truncate">
            {aiStatus.configured ? aiStatus.provider?.modelStrong || aiStatus.provider?.modelFast || 'AI · auto' : 'AI · تنظیم نشده'}
          </span>
        </button>
      )}

      <div className="hidden h-5 w-px bg-slate-800 sm:block" />

      {/* earnings */}
      <div className="hidden items-center gap-1.5 text-[11px] lg:flex" title="جمع مبلغ تخمینی پروژه‌هایی که وضعیت تکمیلشان دستی ثبت شده است">
        <span className="text-slate-500">تکمیل:</span>
        <span className="font-mono font-semibold tabular-nums text-emerald-300">
          {totalEarningsToday.toLocaleString('fa-IR')}
        </span>
        <span className="text-[9px] text-slate-500">تومان</span>
      </div>

      <button
        onClick={onQuickScan}
        disabled={isScanning}
        className="btn btn-primary h-8 px-2 sm:px-3"
        title="اسکن زنده منابع"
      >
        <Radar className={`h-3.5 w-3.5 ${isScanning ? 'animate-spin' : ''}`} />
        <span className="hidden sm:inline">{isScanning ? 'در حال اسکن…' : 'اسکن'}</span>
      </button>

      <button
        onClick={onOpenSettings}
        className="icon-btn h-8 w-8 border border-slate-800 bg-slate-900/60"
        title="تنظیمات"
        aria-label="تنظیمات"
      >
        <Settings className="h-4 w-4" />
      </button>
    </header>
  );
};
