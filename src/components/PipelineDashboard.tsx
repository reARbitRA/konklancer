import React from 'react';
import { CheckCircle2, Code2, FileText, Radar, Rocket } from 'lucide-react';
import { FreelanceJob } from '../types';

interface PipelineDashboardProps {
  jobs: FreelanceJob[];
}

const STAGES: Array<{
  key: FreelanceJob['status'];
  label: string;
  detail: string;
  icon: React.ElementType;
  accent: string;
  bar: string;
}> = [
  { key: 'new', label: 'پروژه‌های تازه', detail: 'نیازمند بررسی', icon: Radar, accent: 'text-sky-300', bar: 'from-sky-500 to-cyan-400' },
  { key: 'bidded', label: 'پیگیری دستی', detail: 'ارسال خارج از برنامه', icon: FileText, accent: 'text-amber-300', bar: 'from-amber-500 to-yellow-300' },
  { key: 'in_progress', label: 'در حال انجام', detail: 'در محیط توسعه', icon: Code2, accent: 'text-violet-300', bar: 'from-violet-500 to-fuchsia-400' },
  { key: 'ready', label: 'آماده‌ی تحویل', detail: 'منتظر بازبینی', icon: Rocket, accent: 'text-emerald-300', bar: 'from-emerald-500 to-teal-300' },
  { key: 'completed', label: 'تکمیل ثبت‌شده', detail: 'ثبت دستی شما', icon: CheckCircle2, accent: 'text-slate-300', bar: 'from-slate-500 to-slate-300' },
];

export const PipelineDashboard: React.FC<PipelineDashboardProps> = ({ jobs }) => {
  const counts = STAGES.map((stage) => ({
    ...stage,
    count: jobs.filter((job) => job.status === stage.key).length,
  }));
  const maxCount = Math.max(1, ...counts.map((stage) => stage.count));

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5" aria-label="توزیع واقعی پروژه‌ها در مراحل پایپ‌لاین">
      {counts.map((stage, index) => {
        const Icon = stage.icon;
        const width = stage.count === 0 ? 0 : Math.max(8, Math.round((stage.count / maxCount) * 100));
        return (
          <section
            key={stage.key}
            className="relative overflow-hidden rounded-xl border border-slate-800/80 bg-gradient-to-br from-slate-900/95 to-slate-950/90 p-3"
            aria-label={`${stage.label}: ${stage.count} پروژه`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950/80 ${stage.accent}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-semibold text-slate-200">{stage.label}</p>
                  <p className="mt-0.5 truncate text-[9px] text-slate-500">مرحله‌ی {index + 1} · {stage.detail}</p>
                </div>
              </div>
              <span className={`font-mono text-lg font-semibold tabular-nums ${stage.accent}`}>{stage.count.toLocaleString('fa-IR')}</span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800/80" role="progressbar" aria-label={`تعداد پروژه‌ها در مرحله ${stage.label}`} aria-valuemin={0} aria-valuemax={maxCount} aria-valuenow={stage.count}>
              <div className={`h-full rounded-full bg-gradient-to-l ${stage.bar} transition-[width] duration-300`} style={{ width: `${width}%` }} />
            </div>
          </section>
        );
      })}
    </div>
  );
};
