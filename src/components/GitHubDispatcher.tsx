import React, { useState } from 'react';
import { 
  FolderGit2, 
  Check, 
  Copy, 
  ExternalLink, 
  Send, 
  Sparkles, 
  CheckCircle2, 
  Clock, 
  Coins, 
  ArrowLeft,
  X,
  MessageSquare
} from 'lucide-react';
import { FreelanceJob } from '../types';

interface GitHubDispatcherProps {
  job: FreelanceJob | null;
  files: Record<string, string>;
  githubToken: string;
  onClose: () => void;
  onCompleteJob: (jobId: string, repoUrl: string) => void;
}

export const GitHubDispatcher: React.FC<GitHubDispatcherProps> = ({
  job,
  files,
  githubToken,
  onClose,
  onCompleteJob,
}) => {
  const [repoName, setRepoName] = useState(
    job ? `delivery-${job.platformKey}-${job.id}` : `delivery-task-${Date.now()}`
  );
  const [commitMessage, setCommitMessage] = useState('Production release: source code and documentation');
  const [loading, setLoading] = useState(false);
  const [repoUrl, setRepoUrl] = useState<string | null>(job?.repoUrl || null);
  const [deliveryMessage, setDeliveryMessage] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedMsg, setCopiedMsg] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!job) return null;

  const handlePushToGitHub = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/push-github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName,
          files,
          githubToken,
          commitMessage,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'خطا در ثبت مخزن گیت‌هاب');

      setRepoUrl(data.repoUrl);
      setDeliveryMessage(data.deliveryMessage);
    } catch (err: any) {
      setError(err.message || 'خطا در انتشار پروژه در گیت‌هاب');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    if (repoUrl) {
      navigator.clipboard.writeText(repoUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  const handleCopyMessage = () => {
    if (deliveryMessage) {
      navigator.clipboard.writeText(deliveryMessage);
      setCopiedMsg(true);
      setTimeout(() => setCopiedMsg(false), 2000);
    }
  };

  const handleFinishAndRelease = () => {
    if (repoUrl) {
      onCompleteJob(job.id, repoUrl);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
              <FolderGit2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">انتشار خودکار در گیت‌هاب و تحویل به کارفرما</h2>
              <p className="text-[11px] text-slate-400 font-mono">پروژه: {job.title.slice(0, 45)}...</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Job badge */}
          <div className="flex items-center justify-between p-3.5 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <div className="space-y-0.5">
              <span className="font-semibold text-white block">{job.title}</span>
              <span className="text-[11px] text-slate-400">کارفرما: {job.clientName} ({job.platform})</span>
            </div>
            <div className="text-left font-mono">
              <span className="text-emerald-400 font-bold block tabular-nums">{job.budgetFormatted}</span>
              <span className="text-[10px] text-slate-500">{Object.keys(files).length} فایل آماده ارسال</span>
            </div>
          </div>

          {!repoUrl ? (
            /* Pre-Push Configuration Form */
            <div className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">نام مخزن گیت‌هاب (Repository Name):</label>
                <input
                  type="text"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 dir-ltr text-left focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">پیام کامیت (Commit Message):</label>
                <input
                  type="text"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-300 dir-ltr text-left focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-400 space-y-1">
                <span className="text-white font-medium block">نحوه اتصال به گیت‌هاب:</span>
                <p className="text-[11px] leading-relaxed">
                  {githubToken ? (
                    <span className="text-emerald-400">
                      ✓ توکن گیت‌هاب شما متصل است. مخزن مستقیم در اکانت شما ساخته خواهد شد.
                    </span>
                  ) : (
                    <span>
                      توکن گیت‌هاب تنظیم نشده است. مخزن به صورت خودکار با لینک عمومی معتبر ایجاد و لینک تحویل آماده خواهد شد. (برای ثبت توکن اختصاصی از منوی تنظیمات بالا استفاده کنید).
                    </span>
                  )}
                </p>
              </div>

              {error && (
                <p className="text-xs text-red-400">{error}</p>
              )}

              <button
                onClick={handlePushToGitHub}
                disabled={loading}
                className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <FolderGit2 className="h-4 w-4" />
                <span>{loading ? 'در حال ایجاد مخزن و ارسال فایل‌ها...' : 'ساخت ریپازیتوری و آپلود پروژه در گیت‌هاب'}</span>
              </button>
            </div>
          ) : (
            /* Post-Push Success and Delivery Message */
            <div className="space-y-5 animate-in fade-in duration-200">
              <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-3">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-300">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>مخزن گیت‌هاب با موفقیت ساخته و کدهای پروژه منتشر شد!</span>
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2 p-2 bg-slate-950 border border-slate-800 rounded-lg">
                  <a
                    href={repoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-sky-400 hover:underline dir-ltr truncate flex items-center gap-1"
                  >
                    <span>{repoUrl}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>

                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1 px-3 py-1 bg-slate-850 hover:bg-slate-800 text-slate-200 rounded text-[11px] shrink-0"
                  >
                    {copiedLink ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedLink ? 'کپی شد' : 'کپی لینک'}</span>
                  </button>
                </div>
              </div>

              {/* Delivery Message to Employer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-slate-300 font-semibold flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5 text-emerald-400" />
                    <span>متن پیام تحویل برای چت کارفرما (در پونیشا / کارلانسر):</span>
                  </label>

                  <button
                    onClick={handleCopyMessage}
                    className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {copiedMsg ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    <span>{copiedMsg ? 'کپی شد!' : 'کپی پیام تحویل'}</span>
                  </button>
                </div>

                <textarea
                  rows={5}
                  value={deliveryMessage}
                  onChange={(e) => setDeliveryMessage(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-emerald-500 font-sans"
                />

                <p className="text-[11px] text-slate-400">
                  💡 این پیام را در چت پروژه برای کارفرما ارسال کنید تا پروژه را تست کرده و تسویه حساب را تایید کند.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-slate-800 bg-slate-900/90">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs text-slate-400 hover:text-white"
          >
            بستن
          </button>

          {repoUrl && (
            <button
              onClick={handleFinishAndRelease}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs shadow-md transition-all active:scale-95"
            >
              <Check className="h-4 w-4" />
              <span>تکمیل پروژه و ثبت درآمد در پایپ‌لاین</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
