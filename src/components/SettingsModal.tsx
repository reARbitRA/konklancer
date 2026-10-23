import React, { useEffect, useState } from 'react';
import { Settings, X, FolderGit2, Coins, ShieldCheck, Check, Sparkles } from 'lucide-react';
import { UserSettings } from '../types';
import { AISettingsPanel } from './AISettingsPanel';
import type { AIStatusPayload } from '../utils/aiClient';

export type SettingsTab = 'general' | 'ai';

interface SettingsModalProps {
  settings: UserSettings;
  onClose: () => void;
  onSave: (newSettings: UserSettings) => void;
  initialTab?: SettingsTab;
  onAIChanged?: (status: AIStatusPayload) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onClose,
  onSave,
  initialTab = 'general',
  onAIChanged,
}) => {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [form, setForm] = useState<UserSettings>({
    ...settings,
    githubUseSSH: settings.githubUseSSH ?? false,
    githubSSHKey: settings.githubSSHKey ?? '',
  });
  const [savedNotice, setSavedNotice] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 1200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className={`my-6 flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-2xl ${tab === 'ai' ? 'max-w-3xl' : 'max-w-lg'}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 bg-slate-900/90 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
              {tab === 'ai' ? <Sparkles className="h-4 w-4 text-emerald-400" /> : <Settings className="h-4 w-4" />}
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">
                {tab === 'ai' ? 'تنظیمات هوش مصنوعی' : 'تنظیمات سامانه و اتصال گیت‌هاب'}
              </h2>
              <p className="text-[11px] text-slate-400">
                {tab === 'ai' ? 'provider، مدل، کلید، پروفایل و رفتار همه‌ی امکانات AI' : 'پیکربندی توکن‌های اتوماسیون و استراتژی قیمت‌گذاری'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b border-slate-800 bg-slate-950/40 px-4 pt-2">
          <button
            onClick={() => setTab('ai')}
            className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-[11px] font-medium transition-colors ${
              tab === 'ai' ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5" /> هوش مصنوعی
          </button>
          <button
            onClick={() => setTab('general')}
            className={`flex items-center gap-1.5 rounded-t-lg border-b-2 px-3 py-2 text-[11px] font-medium transition-colors ${
              tab === 'general' ? 'border-emerald-400 text-emerald-300' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderGit2 className="h-3.5 w-3.5" /> گیت‌هاب و سلیقه
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {tab === 'ai' ? (
            <AISettingsPanel onChanged={onAIChanged} />
          ) : (
            <form id="settings-general-form" onSubmit={handleSubmit} className="space-y-5">
              {/* GitHub Token Field */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="flex items-center justify-between text-xs font-semibold text-slate-200">
                    <span className="flex items-center gap-1.5">
                      <FolderGit2 className="h-4 w-4 text-emerald-400" />
                      <span>اتصال به گیت‌هاب:</span>
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, githubUseSSH: false })}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs ${!form.githubUseSSH ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-slate-800 bg-slate-950 text-slate-400'}`}
                    >
                      توکن (PAT)
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, githubUseSSH: true })}
                      className={`flex-1 rounded-lg border px-3 py-2 text-xs ${form.githubUseSSH ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400' : 'border-slate-800 bg-slate-950 text-slate-400'}`}
                    >
                      کلید SSH
                    </button>
                  </div>
                </div>

                {!form.githubUseSSH ? (
                  <div className="space-y-1.5">
                    <input
                      type="password"
                      value={form.githubToken}
                      onChange={(e) => setForm({ ...form, githubToken: e.target.value })}
                      placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-emerald-400 dir-ltr text-left focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <textarea
                      value={form.githubSSHKey}
                      onChange={(e) => setForm({ ...form, githubSSHKey: e.target.value })}
                      placeholder="ssh-ed25519 AAAA..."
                      className="h-24 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-amber-400 dir-ltr text-left focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}
                <p className="text-[11px] leading-relaxed text-slate-400">
                  {form.githubUseSSH
                    ? 'کلید خصوصی SSH خود را برای احراز هویت بدون توکن وارد کنید.'
                    : 'برای ساخت توکن در اکانت گیت‌هاب خود به Settings > Developer settings > Tokens رفته و دسترسی repo را تیک بزنید.'}
                </p>
              </div>

              {/* Daily Goal Field */}
              <div className="space-y-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-200">
                  <Coins className="h-4 w-4 text-amber-400" />
                  <span>هدف روزانه‌ی ارزش پروژه‌های تکمیل‌شده (تومان):</span>
                </label>
                <input
                  type="number"
                  value={form.dailyEarningsGoal}
                  onChange={(e) => setForm({ ...form, dailyEarningsGoal: parseInt(e.target.value) || 5000000 })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-white tabular-nums focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Preferred Proposal Tone */}
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-200">لحن پیش‌فرض پروپوزال‌ها:</label>
                <select
                  value={form.preferredTone}
                  onChange={(e) => setForm({ ...form, preferredTone: e.target.value as any })}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-white focus:border-emerald-500 focus:outline-none"
                >
                  <option value="friendly_expert">صمیمی و ارشد (پیش‌فرض بالاترین تبدیل)</option>
                  <option value="direct_urgent">صریح و تحویل فوری (زیر ۴ ساعت)</option>
                  <option value="technical_detailed">فنی و اشاره به تست‌های پروژه</option>
                </select>
              </div>

              <div className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-[11px] leading-relaxed text-slate-400">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  تنظیمات هوش مصنوعی جداگانه و روی سرور ذخیره می‌شود؛ توکن گیت‌هاب فقط در حافظه‌ی همین تب می‌ماند.
                </span>
              </div>

              {savedNotice && (
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-400">
                  <Check className="h-4 w-4" />
                  <span>تنظیمات با موفقیت ذخیره گردید.</span>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer (general only) */}
        {tab === 'general' && (
          <div className="flex items-center justify-end gap-2 border-t border-slate-800 bg-slate-900/90 px-6 py-4">
            <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-xs text-slate-300 hover:bg-slate-700">
              انصراف
            </button>
            <button type="submit" form="settings-general-form" className="rounded-lg bg-emerald-500 px-5 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400">
              ذخیره تنظیمات
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
