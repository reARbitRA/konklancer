import React from 'react';
import { 
  Workflow, 
  CheckCircle2, 
  Clock, 
  Coins, 
  ArrowLeft, 
  Sparkles, 
  FolderGit2, 
  FileText,
  Code2,
  TrendingUp,
  Target
} from 'lucide-react';
import { FreelanceJob } from '../types';

interface PipelineBoardProps {
  jobs: FreelanceJob[];
  onSelectJobForAnalysis: (job: FreelanceJob) => void;
  onSelectJobForProposal: (job: FreelanceJob) => void;
  onSelectJobForCoding: (job: FreelanceJob) => void;
  onMoveJobStatus: (jobId: string, newStatus: FreelanceJob['status']) => void;
  dailyEarningsGoal: number;
}

export const PipelineBoard: React.FC<PipelineBoardProps> = ({
  jobs,
  onSelectJobForAnalysis,
  onSelectJobForProposal,
  onSelectJobForCoding,
  onMoveJobStatus,
  dailyEarningsGoal,
}) => {
  const completedJobs = jobs.filter((j) => j.status === 'completed');
  const totalEarned = completedJobs.reduce((acc, j) => acc + (j.proposedPrice || j.budget || 0), 0);
  const goalProgress = Math.min(100, Math.round((totalEarned / (dailyEarningsGoal || 5000000)) * 100));

  const stages: { key: FreelanceJob['status']; title: string; desc: string }[] = [
    { key: 'new', title: '۱. پروژه‌های شکارشده', desc: 'بررسی نشده' },
    { key: 'bidded', title: '۲. پیشنهاد ارسال‌شده', desc: 'منتظر پاسخ کارفرما' },
    { key: 'in_progress', title: '۳. در حال کدنویسی', desc: 'ایجنت در حال توسعه' },
    { key: 'ready', title: '۴. آماده تحویل', desc: 'کد آماده در مخزن' },
    { key: 'completed', title: '۵. تسویه‌شده', desc: 'وجه دریافت شد' },
  ];

  return (
    <div className="space-y-6">
      {/* Financial Health & Daily Goal Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-5 bg-slate-900 border border-slate-800 rounded-xl">
        <div className="space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Coins className="h-3.5 w-3.5 text-emerald-400" />
            <span>مجموع درآمد واریزی امروز:</span>
          </span>
          <div className="font-mono text-xl font-bold text-emerald-400 tabular-nums">
            {totalEarned.toLocaleString('fa-IR')} تومان
          </div>
          <span className="text-[11px] text-slate-400 block font-mono">
            {completedJobs.length} پروژه با موفقیت تحویل و تسویه گردید
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-amber-400" />
            <span>پیشرفت هدف روزانه ({dailyEarningsGoal.toLocaleString('fa-IR')} تومان):</span>
          </span>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
              <div 
                className="bg-emerald-400 h-full rounded-full transition-all duration-500"
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            <span className="font-mono text-xs font-bold text-slate-200 tabular-nums">{goalProgress}٪</span>
          </div>
          <span className="text-[11px] text-slate-400 block">
            {totalEarned >= dailyEarningsGoal ? 'تبریک! هدف امروز محقق شد.' : 'فقط چند پروژه تا تکمیل هدف'}
          </span>
        </div>

        <div className="space-y-1">
          <span className="text-xs text-slate-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-sky-400" />
            <span>میانگین سرعت تحویل ایجنت:</span>
          </span>
          <div className="font-mono text-xl font-bold text-sky-300">
            ۴۵ دقیقه
          </div>
          <span className="text-[11px] text-slate-400 block">
            نرخ رضایت کارفرمایان: ۹۸٪ با کدهای تست‌شده
          </span>
        </div>
      </div>

      {/* Kanban Board Columns */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5 items-start">
        {stages.map((stage) => {
          const stageJobs = jobs.filter((j) => j.status === stage.key);
          const stageTotal = stageJobs.reduce((acc, j) => acc + (j.proposedPrice || j.budget || 0), 0);

          return (
            <div
              key={stage.key}
              className="bg-slate-950 border border-slate-800/90 rounded-xl p-3 flex flex-col min-h-[460px] space-y-3"
            >
              {/* Stage Header */}
              <div className="pb-2 border-b border-slate-800/80">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-white">{stage.title}</h3>
                  <span className="font-mono text-[11px] bg-slate-800 text-slate-300 rounded px-1.5 py-0.5">
                    {stageJobs.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
                  <span>{stage.desc}</span>
                  <span className="font-mono tabular-nums text-slate-400">
                    {stageTotal > 0 ? `${(stageTotal / 1000000).toFixed(1)} م.ت` : ''}
                  </span>
                </div>
              </div>

              {/* Jobs List in Stage */}
              <div className="flex-1 space-y-2.5 overflow-y-auto max-h-[500px]">
                {stageJobs.length === 0 ? (
                  <div className="py-8 text-center text-[11px] text-slate-600 italic">
                    موردی نیست
                  </div>
                ) : (
                  stageJobs.map((job) => (
                    <div
                      key={job.id}
                      className="bg-slate-900 border border-slate-800/80 hover:border-slate-700 rounded-lg p-3 space-y-2 text-xs transition-colors"
                    >
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-400 font-medium">{job.platform}</span>
                        <span className="font-mono font-bold text-emerald-400 tabular-nums">
                          {(job.proposedPrice || job.budget).toLocaleString('fa-IR')} ت
                        </span>
                      </div>

                      <h4 className="font-semibold text-slate-200 line-clamp-2 leading-relaxed">
                        {job.title}
                      </h4>

                      {/* Quick stage transition buttons */}
                      <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-1 text-[11px]">
                        {stage.key === 'new' && (
                          <>
                            <button
                              onClick={() => onSelectJobForProposal(job)}
                              className="text-amber-400 hover:underline"
                            >
                              نگارش پیشنهاد
                            </button>
                            <button
                              onClick={() => onMoveJobStatus(job.id, 'bidded')}
                              className="text-slate-400 hover:text-white"
                              title="انتقال به ارسال‌شده"
                            >
                              ثبت ←
                            </button>
                          </>
                        )}

                        {stage.key === 'bidded' && (
                          <>
                            <button
                              onClick={() => onSelectJobForCoding(job)}
                              className="text-emerald-400 hover:underline flex items-center gap-1"
                            >
                              <Code2 className="h-3 w-3" />
                              <span>کدنویسی</span>
                            </button>
                            <button
                              onClick={() => onMoveJobStatus(job.id, 'in_progress')}
                              className="text-slate-400 hover:text-white"
                            >
                              شروع ←
                            </button>
                          </>
                        )}

                        {stage.key === 'in_progress' && (
                          <>
                            <button
                              onClick={() => onSelectJobForCoding(job)}
                              className="text-sky-400 hover:underline"
                            >
                              مشاهده سورس
                            </button>
                            <button
                              onClick={() => onMoveJobStatus(job.id, 'ready')}
                              className="text-slate-400 hover:text-white"
                            >
                              آماده تحویل ←
                            </button>
                          </>
                        )}

                        {stage.key === 'ready' && (
                          <>
                            <span className="text-[10px] text-emerald-400">در انتظار تایید</span>
                            <button
                              onClick={() => onMoveJobStatus(job.id, 'completed')}
                              className="px-2 py-0.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded text-[10px]"
                            >
                              تسویه شد ✓
                            </button>
                          </>
                        )}

                        {stage.key === 'completed' && (
                          <div className="flex items-center gap-1 text-emerald-400 font-medium text-[11px]">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            <span>مبلغ دریافت شد</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
