import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock,
  Code2,
  Coins,
  Copy,
  FileText,
  Gauge,
  Loader2,
  RefreshCw,
  Settings2,
  Sparkles,
  Square,
  ThumbsUp,
  Wand2,
  X,
} from 'lucide-react';
import { FreelanceJob } from '../types';
import { AIRequestError, metaLabel, streamRequest, type AIMeta } from '../utils/aiClient';

interface ProposalStudioModalProps {
  job: FreelanceJob | null;
  onClose: () => void;
  onProceedToCoding: (job: FreelanceJob) => void;
  onSaveProposalToJob: (jobId: string, proposal: string, price: number) => void;
  onOpenAISettings?: () => void;
  /** حالت سایبورگ: تولید خودکار هنگام باز شدن. خاموش = با کلیک کاربر. */
  autoGenerate?: boolean;
  /** درصد تخفیف پیش‌فرض نسبت به بودجه (۵ تا ۳۵). */
  defaultDiscountRate?: number;
}

type Tone = 'friendly_expert' | 'direct_urgent' | 'technical_detailed';

interface Critique {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: string[];
  rewrittenOpening: string | null;
}

const TONES: Array<{ key: Tone; label: string; desc: string }> = [
  { key: 'friendly_expert', label: 'صمیمی و ارشد', desc: 'بیشترین جلب اعتماد' },
  { key: 'direct_urgent', label: 'صریح و تحویل فوری', desc: 'تأکید بر انجام سریع' },
  { key: 'technical_detailed', label: 'فنی و ساختاریافته', desc: 'اشاره به کتابخانه و تست' },
];

export const ProposalStudioModal: React.FC<ProposalStudioModalProps> = ({
  job,
  onClose,
  onProceedToCoding,
  onSaveProposalToJob,
  onOpenAISettings,
  autoGenerate = false,
  defaultDiscountRate = 18,
}) => {
  const [tone, setTone] = useState<Tone>('friendly_expert');
  const [customPrice, setCustomPrice] = useState<number>(0);
  const [deliveryTime, setDeliveryTime] = useState<string>('۴۸ ساعت');
  const [proposalText, setProposalText] = useState<string>('');
  const [streaming, setStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<{ message: string; detail?: string; requiresAI?: boolean } | null>(null);
  const [stopped, setStopped] = useState(false);
  const [meta, setMeta] = useState<AIMeta | null>(null);
  const [critique, setCritique] = useState<Critique | null>(null);
  const [critiqueLoading, setCritiqueLoading] = useState(false);
  const [critiqueError, setCritiqueError] = useState<string | null>(null);
  const [extraNotes, setExtraNotes] = useState('');

  const abortRef = useRef<AbortController | null>(null);
  const generatedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!job) return;
    const ratio = Math.min(0.95, Math.max(0.5, 1 - defaultDiscountRate / 100));
    const initialPrice = job.proposedPrice || (job.budget ? Math.round(job.budget * ratio) : 0);
    setCustomPrice(initialPrice);
    setCritique(null);
    setCritiqueError(null);
    setError(null);
    setStopped(false);
    setMeta(null);

    if (job.proposal) {
      setProposalText(job.proposal);
      setDeliveryTime('۴۸ ساعت');
      generatedFor.current = job.id;
      return;
    }
    setProposalText('');
    if (autoGenerate && generatedFor.current !== job.id) {
      generatedFor.current = job.id;
      void generate('friendly_expert', initialPrice, job);
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  if (!job) return null;

  const generate = async (selectedTone: Tone = tone, price = customPrice, targetJob: FreelanceJob = job) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStreaming(true);
    setStopped(false);
    setError(null);
    setCritique(null);
    setCritiqueError(null);
    setProposalText('');
    setMeta(null);

    try {
      let finalText = '';
      await streamRequest(
        '/api/generate-proposal/stream',
        {
          title: targetJob.title,
          description: targetJob.description,
          budget: targetJob.budget,
          budgetFormatted: targetJob.budgetFormatted,
          platform: targetJob.platform,
          proposalsCount: targetJob.proposalsCount,
          deadline: targetJob.deadline,
          postedTime: targetJob.postedTime,
          category: targetJob.category,
          url: targetJob.url,
          tone: selectedTone,
          price,
          deliveryTime,
          extraNotes: extraNotes.trim() || undefined,
        },
        (event, data) => {
          if (event === 'delta' && typeof data?.text === 'string') {
            finalText += data.text;
            setProposalText(finalText);
          } else if (event === 'done') {
            finalText = String(data?.proposal ?? finalText);
            setProposalText(finalText);
            setMeta(data?.meta ?? null);
            if (data?.deliveryTime) setDeliveryTime(String(data.deliveryTime));
            if (Number(data?.proposedPrice) > 0) setCustomPrice(Number(data.proposedPrice));
            onSaveProposalToJob(targetJob.id, finalText, Number(data?.proposedPrice) || price);
          }
        },
        controller.signal,
      );
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setStopped(true);
      } else {
        const requestError = err instanceof AIRequestError ? err : null;
        setError({
          message: requestError?.message ?? err?.message ?? 'خطا در ارتباط با سرور هوش مصنوعی',
          detail: requestError?.detail ?? undefined,
          requiresAI: Boolean(requestError?.requiresAIConfig) || requestError?.status === 503,
        });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setStreaming(false);
    }
  };

  const stopStreaming = () => {
    abortRef.current?.abort();
    setStopped(true);
  };

  const handleCopy = () => {
    if (!proposalText) return;
    navigator.clipboard.writeText(proposalText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCritique = async () => {
    if (!proposalText.trim()) return;
    setCritiqueLoading(true);
    setCritiqueError(null);
    try {
      const response = await fetch('/api/critique-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal: proposalText,
          job: {
            title: job.title,
            description: job.description,
            budget: job.budget,
            platform: job.platform,
            proposalsCount: job.proposalsCount,
            deadline: job.deadline,
          },
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setCritiqueError(data?.error ?? 'نقد پروپوزال ناموفق بود.');
        return;
      }
      setCritique(data.critique ?? null);
    } catch (err: any) {
      setCritiqueError(err?.message ?? 'نقد پروپوزال ناموفق بود.');
    } finally {
      setCritiqueLoading(false);
    }
  };

  const handleSaveAndAdvance = () => {
    if (proposalText.trim()) onSaveProposalToJob(job.id, proposalText, customPrice);
    onClose();
    onProceedToCoding(job);
  };

  const wordCount = proposalText.trim() ? proposalText.trim().split(/\s+/).length : 0;
  const scoreColor = critique ? (critique.score >= 75 ? 'emerald' : critique.score >= 50 ? 'amber' : 'red') : 'slate';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="my-8 w-full max-w-2xl overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-400">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">استودیو نگارش پیشنهاد (ضد کلیشه)</h2>
              <p className="font-mono text-[11px] text-slate-400">پروژه: {job.title.slice(0, 50)}…</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 p-6">
          {/* Tone selector */}
          <div className="space-y-2">
            <label className="block text-xs text-slate-400">سبک و لحن روانشناسی:</label>
            <div className="grid grid-cols-3 gap-2">
              {TONES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setTone(item.key);
                    void generate(item.key, customPrice);
                  }}
                  disabled={streaming}
                  className={`rounded-lg border p-3 text-right transition-all disabled:opacity-60 ${
                    tone === item.key ? 'border-amber-500/60 bg-slate-800 text-white shadow-sm' : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span className="block text-xs font-semibold">{item.label}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-400">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Pricing / duration */}
          <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div>
              <label className="mb-1 block text-[11px] text-slate-400">مبلغ پیشنهادی شما (تومان):</label>
              <input
                type="number"
                value={customPrice || ''}
                onChange={(e) => setCustomPrice(parseInt(e.target.value) || 0)}
                disabled={streaming}
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-1.5 font-mono text-xs tabular-nums text-emerald-400 focus:border-emerald-500 focus:outline-none disabled:opacity-60"
              />
              <span className="mt-1 block text-[10px] text-slate-400">بودجه‌ی کارفرما: {job.budgetFormatted}</span>
            </div>

            <div>
              <label className="mb-1 block text-[11px] text-slate-400">زمان تحویل:</label>
              <input
                type="text"
                value={deliveryTime}
                onChange={(e) => setDeliveryTime(e.target.value)}
                disabled={streaming}
                placeholder="مثال: ۴۸ ساعت"
                className="w-full rounded-lg border border-slate-700/80 bg-slate-900 px-3 py-1.5 text-xs text-white focus:border-emerald-500 focus:outline-none disabled:opacity-60"
              />
              <span className="mt-1 block text-[10px] text-emerald-400/90">تحویل سریع = شانس بیشتر</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] text-slate-400">نکته‌ی اختیاری برای این پیشنهاد (به مدل داده می‌شود):</label>
            <input
              value={extraNotes}
              onChange={(event) => setExtraNotes(event.target.value)}
              placeholder="مثلاً «تأکید کن که نمونه‌ی مشابه دارم» یا «قیمت قابل مذاکره است»"
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:border-amber-500/60 focus:outline-none"
            />
          </div>

          {/* Proposal text */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                <span>متن نهایی پیشنهاد (آماده‌ی ارسال):</span>
              </label>
              <div className="flex items-center gap-2 text-[10px] text-slate-500">
                {streaming && (
                  <span className="flex items-center gap-1 text-amber-300">
                    <Loader2 className="h-3 w-3 animate-spin" /> در حال نوشتن…
                  </span>
                )}
                {!streaming && proposalText && <span>{wordCount.toLocaleString('fa-IR')} کلمه</span>}
                <button onClick={() => void generate(tone, customPrice)} disabled={streaming} className="text-[11px] text-amber-400 transition-colors hover:text-amber-300 disabled:opacity-50">
                  بازنویسی مجدد ↻
                </button>
                {streaming && (
                  <button onClick={stopStreaming} className="flex items-center gap-1 text-[11px] text-red-300 hover:text-red-200">
                    <Square className="h-3 w-3" /> توقف
                  </button>
                )}
              </div>
            </div>

            {!proposalText && !streaming && !error && (
              <button
                onClick={() => void generate(tone, customPrice)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 py-6 text-xs font-medium text-amber-200 transition-colors hover:bg-amber-500/10"
              >
                <Sparkles className="h-4 w-4" />
                تولید پیشنهاد با هوش مصنوعی
              </button>
            )}

            <div className="relative">
              <textarea
                rows={7}
                value={proposalText}
                onChange={(e) => setProposalText(e.target.value)}
                placeholder={streaming ? 'مدل در حال نوشتن است…' : 'هنوز متنی تولید نشده است.'}
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs leading-relaxed text-slate-200 focus:border-amber-500/60 focus:outline-none"
              />
              <button
                onClick={handleCopy}
                disabled={!proposalText}
                className="absolute bottom-3 left-3 flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-[11px] text-slate-200 transition-colors hover:bg-slate-700 disabled:opacity-40"
              >
                {copied ? (
                  <>
                    <Check className="h-3 w-3 text-emerald-400" />
                    <span className="text-emerald-300">کپی شد!</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3" />
                    <span>کپی برای چت کارفرما</span>
                  </>
                )}
              </button>
            </div>

            {stopped && !streaming && <p className="text-[11px] text-slate-400">تولید متوقف شد. متن ناقص ذخیره نمی‌شود.</p>}

            {error && (
              <div className="space-y-2 rounded-lg border border-red-800/50 bg-red-950/30 p-3 text-[11px] text-red-200">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    <p className="font-semibold">{error.message}</p>
                    {error.detail && <p className="mt-1 font-mono text-[10px] text-red-300/80">{error.detail}</p>}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void generate(tone, customPrice)} className="flex items-center gap-1 rounded bg-red-900/50 px-2.5 py-1 hover:bg-red-900">
                    <RefreshCw className="h-3 w-3" /> تلاش مجدد
                  </button>
                  {error.requiresAI && onOpenAISettings && (
                    <button onClick={onOpenAISettings} className="flex items-center gap-1 rounded border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-amber-200 hover:bg-amber-500/20">
                      <Settings2 className="h-3 w-3" /> تنظیم AI
                    </button>
                  )}
                </div>
              </div>
            )}

            <p className="text-[11px] text-slate-400">
              💡 این متن را در کادر پیشنهاد سایت {job.platform} پیست و خودتان ارسال کنید.
            </p>
          </div>

          {/* Critique */}
          <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold text-white">
                <ThumbsUp className="h-3.5 w-3.5 text-sky-400" /> نقد کارفرمای سخت‌گیر
              </h3>
              <button
                onClick={() => void handleCritique()}
                disabled={!proposalText.trim() || streaming || critiqueLoading}
                className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                {critiqueLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Gauge className="h-3.5 w-3.5 text-sky-400" />}
                {critique ? 'نقد مجدد' : 'امتیاز و نقد این متن'}
              </button>
            </div>

            {critiqueError && <p className="mt-2 text-[11px] text-red-300">{critiqueError}</p>}

            {critique && (
              <div className="mt-3 space-y-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full border-2 font-mono text-sm font-bold ${
                    scoreColor === 'emerald'
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                      : scoreColor === 'amber'
                        ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                        : 'border-red-500/50 bg-red-500/10 text-red-300'
                  }`}>
                    {critique.score}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-200">{critique.verdict}</p>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className={`h-full rounded-full ${scoreColor === 'emerald' ? 'bg-emerald-400' : scoreColor === 'amber' ? 'bg-amber-400' : 'bg-red-400'}`}
                        style={{ width: `${Math.min(100, Math.max(0, critique.score))}%` }}
                      />
                    </div>
                  </div>
                </div>

                {critique.strengths.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> نقاط قوت
                    </p>
                    <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-slate-300">
                      {critique.strengths.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {critique.improvements.length > 0 && (
                  <div>
                    <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-amber-300">
                      <Wand2 className="h-3 w-3" /> پیشنهادهای اصلاح
                    </p>
                    <ul className="list-inside list-disc space-y-0.5 text-[11px] leading-relaxed text-slate-300">
                      {critique.improvements.map((item, index) => (
                        <li key={index}>{item}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {critique.rewrittenOpening && (
                  <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 p-2.5 text-[11px]">
                    <p className="mb-1 flex items-center gap-1 font-semibold text-sky-300">
                      <Sparkles className="h-3 w-3" /> جمله‌ی اول پیشنهادی
                    </p>
                    <p className="leading-relaxed text-slate-300">{critique.rewrittenOpening}</p>
                    <button
                      onClick={() => setProposalText((current) => `${critique.rewrittenOpening}\n${current.split(/\n/).slice(1).join('\n')}`.trim())}
                      className="mt-1.5 text-[10px] text-sky-300 underline hover:text-sky-200"
                    >
                      جای‌گذاری در متن
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {meta && (
            <p className="border-t border-slate-800 pt-2 font-mono text-[10px] text-slate-500">
              {metaLabel(meta)}
              {meta.streamed ? ' · استریم زنده' : ''}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-900/90 px-6 py-4">
          <button onClick={onClose} className="px-4 py-2 text-xs text-slate-400 hover:text-white">
            انصراف
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleCopy} disabled={!proposalText} className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40">
              کپی متن
            </button>

            <button
              onClick={handleSaveAndAdvance}
              disabled={!proposalText.trim() || streaming}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-5 py-2 text-xs font-medium text-slate-950 shadow-md transition-all hover:bg-emerald-400 active:scale-95 disabled:opacity-40"
            >
              <Code2 className="h-3.5 w-3.5" />
              <span>ثبت پیشنهاد و شروع کدنویسی</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
