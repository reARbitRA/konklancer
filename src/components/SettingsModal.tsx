import React, { useState } from 'react';
import { Settings, X, FolderGit2, Coins, ShieldCheck, Check, Key } from 'lucide-react';
import { UserSettings } from '../types';

interface SettingsModalProps {
  settings: UserSettings;
  onClose: () => void;
  onSave: (newSettings: UserSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onClose,
  onSave,
}) => {
  const [form, setForm] = useState<UserSettings>({ ...settings });
  const [savedNotice, setSavedNotice] = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden my-8">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-300">
              <Settings className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">تنظیمات سامانه و اتصال گیت‌هاب</h2>
              <p className="text-[11px] text-slate-400">پیکربندی توکن‌های اتوماسیون و استراتژی قیمت‌گذاری</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* GitHub Token Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <FolderGit2 className="h-4 w-4 text-emerald-400" />
                <span>توکن اختصاصی گیت‌هاب (Personal Access Token):</span>
              </span>
              <span className="text-[10px] text-slate-400 font-normal">اختیاری اما توصیه شده</span>
            </label>
            <div className="relative">
              <input
                type="password"
                value={form.githubToken}
                onChange={(e) => setForm({ ...form, githubToken: e.target.value })}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-emerald-400 dir-ltr text-left focus:outline-none focus:border-emerald-500"
              />
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              برای ساخت توکن در اکانت گیت‌هاب خود به Settings &gt; Developer settings &gt; Tokens رفته و دسترسی <code className="text-emerald-400 bg-slate-950 px-1 rounded">repo</code> را تیک بزنید. در صورت خالی بودن، مخزن‌های تست به صورت خودکار ایجاد می‌شوند.
            </p>
          </div>

          {/* Daily Goal Field */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Coins className="h-4 w-4 text-amber-400" />
              <span>هدف درآمد روزانه (تومان):</span>
            </label>
            <input
              type="number"
              value={form.dailyEarningsGoal}
              onChange={(e) => setForm({ ...form, dailyEarningsGoal: parseInt(e.target.value) || 5000000 })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500 tabular-nums"
            />
          </div>

          {/* Preferred Proposal Tone */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-200 block">لحن پیش‌فرض پروپوزال‌ها:</label>
            <select
              value={form.preferredTone}
              onChange={(e) => setForm({ ...form, preferredTone: e.target.value as any })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="friendly_expert">صمیمی و ارشد (پیش‌فرض بالاترین تبدیل)</option>
              <option value="direct_urgent">صریح و تحویل فوری (زیر ۴ ساعت)</option>
              <option value="technical_detailed">فنی و اشاره به تست‌های پروژه</option>
            </select>
          </div>

          {/* Save feedback */}
          {savedNotice && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 flex items-center gap-2">
              <Check className="h-4 w-4" />
              <span>تنظیمات با موفقیت ذخیره گردید.</span>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-slate-300 rounded-lg text-xs"
            >
              انصراف
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs transition-colors"
            >
              ذخیره تنظیمات
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
