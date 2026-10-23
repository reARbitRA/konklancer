import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  Coins,
  FileText,
  Flame,
  Layers,
  ListChecks,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Sparkles,
  Target,
  X,
} from 'lucide-react';
import { FreelanceJob, AIAnalysis } from '../types';
import { metaLabel } from '../utils/aiClient';

interface AIEvaluatorModalProps {
  job: FreelanceJob | null;
  onClose: () => void;
  onProceedToProposal: (job: FreelanceJob) => void;
  onProceedToCoding: (job: FreelanceJob) => void;
  onUpdateAnalysis: (jobId: string, analysis: AIAnalysis) => void;
  onOpenAISettings?: () => void;
}

const riskLabel: Record<string, string> = { low: 'کم', medium: 'متوسط', high: 'زیاد' };

export const AIEvaluatorModal: React.FC<AIEvaluatorModalProps> = ({
  job,
  onClose,
  onProceedToProposal,
  onProceedToCoding,
  onUpdateAnalysis,
  onOpenAISettings,
}) => {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(job?.aiAnalysis ?? null);
  const [error, setError] = useState<{ message: string; detail?: string; requiresAI?: boolean } | null>(null);

  useEffect(() => {
    setAnalysis(job?.aiAnalysis ?? null);
    setError(null);
    setLoading(false);
  }, [job?.id]);

  if (!job) return null;

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);
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
        setError({
          message: data?.error || 'خطا در تحلیل پروژه',
          detail: data?.detail ?? undefined,
          requiresAI: Boolean(data?.requiresAIConfig) || response.status === 503,
        });
        return;
      }

      const value: AIAnalysis = {
        ...(data.analysis ?? data),
        warnings: data.warnings ?? [],
        partial: Boolean(data.partial),
        meta: data.meta ?? null,
      };
      setAnalysis(value);
      onUpdateAnalysis(job.id, value);
    } catch (err: any) {
      setError({ message: err?.message || 'خطا در برقراری ارتباط با مدل هوش مصنوعی' });
    } finally {
      setLoading(false);
    }
  };

  const score = analysis?.automatabilityScore ?? 0;
  const warnings = [...(analysis?.warnings ?? []), ...(analysis?.caveats ?? [])];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">ارزیابی هوشمند پروژه</h2>
              <p className="font-mono text-[11px] text-slate-400">
                {job.platform} · {job.id}
                {analysis?.meta?.model ? ` · ${analysis.meta.model}` : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-5 p-6">
          <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/80 p-4">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold text-white">{job.title}</span>
              <span className="shrink-0 font-mono font-bold tabular-nums text-emerald-400">{job.budgetFormatted}</span>
            </div>
            <p className="line-clamp-3 text-xs leading-relaxed text-slate-400">{job.description}</p>
            <div className="flex flex-wrap gap-1.5 text-[10px] text-slate-500">
              <span>{job.proposalsCount} پیشنهاد</span>
              <span>·</span>
              <span>{job.deadline}</span>
              {job.proposedPrice ? (
                <>
                  <span>·</span>
                  <span>قیمت شما: {job.proposedPrice.toLocaleString('fa-IR')} تومان</span>
                </>
              ) : null}
            </div>
          </div>

          {/* Empty / trigger */}
          {!analysis && !loading && !error && (
            <div className="space-y-3 py-8 text-center">
              <Sparkles className="mx-auto h-10 w-10 animate-pulse text-sky-400" />
              <h3 className="text-sm font-bold text-white">تحلیل دقیق این پروژه با پروفایل شما</h3>
              <p className="mx-auto max-w-md text-xs leading-relaxed text-slate-400">
                درصد اتوماسیون، تناسب با مهارت‌های شما، قیمت پیشنهادی، ریسک‌ها و قدم‌های بعدی بررسی می‌شود. خروجی فقط از
                پاسخ مدل ساخته می‌شود و هیچ مقدار ساختگی نمایش داده نمی‌شود.
              </p>
              <button
                onClick={() => void runAnalysis()}
                className="mt-2 rounded-lg bg-sky-500 px-5 py-2.5 text-xs font-medium text-slate-950 shadow-md transition-all hover:bg-sky-400 active:scale-95"
              >
                اجرای تحلیل هوشمند
              </button>
            </div>
          )}

          {/* Loading */}
          {loading && (
            <div className="space-y-3 py-12 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-400" />
              <p className="text-xs text-slate-300">در حال تحلیل پروژه، برآورد قیمت و بررسی ریسک‌ها…</p>
              <p className="text-[10px] text-slate-500">اگر مدل اسکن نباشد ممکن است تا چند ثانیه طول بکشد.</p>
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="space-y-3 rounded-xl border border-red-800/50 bg-red-950/30 p-4 text-xs text-red-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">{error.message}</p>
                  {error.detail && <p className="font-mono text-[10px] leading-relaxed text-red-300/80">{error.detail}</p>}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => void runAnalysis()} className="flex items-center gap-1 rounded-md bg-red-900/50 px-3 py-1.5 text-[11px] hover:bg-red-900">
                  <RefreshCw className="h-3 w-3" /> تلاش مجدد
                </button>
                {error.requiresAI && onOpenAISettings && (
                  <button onClick={onOpenAISettings} className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-200 hover:bg-amber-500/20">
                    <Settings2 className="h-3 w-3" /> تنظیم هوش مصنوعی
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Results */}
          {analysis && !loading && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {/* Automation score */}
                <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>امتیاز اتوماسیون:</span>
                    <Flame className="h-3.5 w-3.5 text-emerald-400" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-2xl font-bold tabular-nums text-emerald-400">{score}٪</span>
                    <span className="text-[11px] font-medium text-emerald-500">قابل اجرای خودکار</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, score))}%` }} />
                  </div>
                </div>

                {/* Match score */}
                <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>تناسب با پروفایل شما:</span>
                    <Target className="h-3.5 w-3.5 text-indigo-400" />
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="font-mono text-2xl font-bold tabular-nums text-indigo-300">
                      {typeof analysis.matchScore === 'number' ? `${analysis.matchScore}٪` : '—'}
                    </span>
                    <span className="text-[11px] font-medium text-indigo-400/80">
                      {typeof analysis.matchScore === 'number'
                        ? analysis.matchScore >= 70
                          ? 'تناسب بالا'
                          : analysis.matchScore >= 40
                            ? 'قابل بررسی'
                            : 'تناسب کم'
                        : 'مدل امتیاز نداد'}'
                    </span>
                  </div>
                  {analysis.matchReason && <p className="mt-1 text-[10px] leading-relaxed text-slate-400">{analysis.matchReason}</p>}
                </div>

                {/* Price */}
                <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>قیمت پیشنهادی برنده:</span>
                    <Coins className="h-3.5 w-3.5 text-amber-400" />
                  </div>
                  <div className="font-mono text-lg font-bold tabular-nums text-amber-300">
                    {analysis.recommendedBid
                      ? analysis.recommendedBidFormatted || `${analysis.recommendedBid.toLocaleString('fa-IR')} تومان`
                      : 'نامشخص'}
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-slate-400">
                    {analysis.recommendedBid ? 'بر پایه‌ی بودجه، رقابت و پروفایل شما' : 'مدل قیمت نداد؛ خودتان تصمیم بگیرید.'}
                  </p>
                </div>

                {/* Time / probability */}
                <div className="space-y-1 rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>زمان تحویل پیشنهادی:</span>
                    <Clock className="h-3.5 w-3.5 text-sky-400" />
                  </div>
                  <div className="font-mono text-lg font-bold text-white">{analysis.suggestedDuration || '—'}</div>
                  <p className="mt-1 text-[10px] font-medium text-sky-400/90">
                    {analysis.winProbability ? `احتمال برنده شدن: ${analysis.winProbability}` : 'احتمال برد اعلام نشد'}
                    {analysis.riskLevel ? ` · ریسک: ${riskLabel[analysis.riskLevel] ?? analysis.riskLevel}` : ''}
                  </p>
                </div>
              </div>

              {(analysis.partial || warnings.length > 0) && (
                <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-[11px] text-amber-200">
                  <div className="mb-1 flex items-center gap-1.5 font-semibold">
                    <AlertTriangle className="h-3.5 w-3.5" /> {analysis.partial ? 'پاسخ مدل کامل نبود' : 'نکات مدل'}
                  </div>
                  <ul className="list-inside list-disc space-y-0.5 leading-relaxed text-amber-100/90">
                    {warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Reason */}
              <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold text-white">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> تحلیل استراتژیک
                </h4>
                <p className="text-xs leading-relaxed text-slate-300">{analysis.feasibilityReason}</p>
              </div>

              {/* Kicker */}
              {analysis.suggestedKicker && (
                <div className="space-y-1 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs">
                  <span className="block font-semibold text-amber-300">نکته‌ی کلیدی خط اول پروپوزال:</span>
                  <p className="italic text-slate-300">«{analysis.suggestedKicker}»</p>
                </div>
              )}

              {/* Red flags */}
              {(analysis.redFlags?.length ?? 0) > 0 && (
                <div className="space-y-1.5 rounded-xl border border-red-500/20 bg-red-500/5 p-3.5">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-red-300">
                    <ShieldAlert className="h-3.5 w-3.5" /> ریسک‌هایی که باید بررسی کنید
                  </h4>
                  <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-red-100/90">
                    {analysis.redFlags?.map((flag, index) => (
                      <li key={index}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Next steps */}
              {(analysis.nextSteps?.length ?? 0) > 0 && (
                <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-950 p-3.5">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                    <ListChecks className="h-3.5 w-3.5 text-sky-400" /> قدم‌های بعدی
                  </h4>
                  <ol className="list-inside list-decimal space-y-0.5 text-[11px] leading-relaxed text-slate-300">
                    {analysis.nextSteps?.map((step, index) => (
                      <li key={index}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Stack + metadata */}
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                <Layers className="h-3.5 w-3.5 text-slate-400" />
                <span>پشته‌ی فنی:</span>
                <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                  {(analysis.technicalStack ?? []).map((tech, index) => (
                    <span key={index} className="rounded bg-slate-800 px-2 py-0.5 text-slate-200">
                      {tech}
                    </span>
                  ))}
                  {(analysis.technicalStack ?? []).length === 0 && <span className="text-slate-500">—</span>}
                </div>
              </div>

              {analysis.meta && (
                <p className="border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500">
                  {metaLabel(analysis.meta as any)}
                  {analysis.meta.cached ? ' · پاسخ از کش' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/90 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 transition-colors hover:text-white">
            بستن
          </button>

          {analysis && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => void runAnalysis()}
                disabled={loading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" /> تحلیل مجدد
              </button>

              <button
                onClick={() => {
                  onClose();
                  onProceedToProposal(job);
                }}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-amber-300 transition-colors hover:bg-slate-700"
              >
                <FileText className="h-3.5 w-3.5" /> نگارش پروپوزال
              </button>

              <button
                onClick={() => {
                  onClose();
                  onProceedToCoding(job);
                }}
                className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-medium text-slate-950 shadow-md transition-all hover:bg-emerald-400 active:scale-95"
              >
                <Code2 className="h-3.5 w-3.5" /> تولید خودکار سورس
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
