import React, { useState, useMemo } from 'react';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip 
} from 'recharts';
import { 
  Sparkles, 
  Radar, 
  Play, 
  Square, 
  Sliders, 
  ShieldCheck, 
  Bell, 
  Radio, 
  Activity, 
  Clock, 
  Coins, 
  CheckCircle2,
  Terminal,
  Zap,
  TrendingUp
} from 'lucide-react';
import { ActivityLogItem, UserSettings, FreelanceJob } from '../types';

interface AutoPilotPanelProps {
  logs: ActivityLogItem[];
  settings: UserSettings;
  jobs: FreelanceJob[];
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
  onTriggerManualScan: () => void;
  isScanning: boolean;
  /** SPEC-008: تحلیل خودکار پروژه‌های تازه (ارسال پیشنهاد هرگز خودکار نیست). */
  autoAnalyze: boolean;
  onToggleAutoAnalyze: () => void;
  aiConfigured: boolean;
}

export const AutoPilotPanel: React.FC<AutoPilotPanelProps> = ({
  logs,
  settings,
  jobs,
  onUpdateSettings,
  onTriggerManualScan,
  isScanning,
  autoAnalyze,
  onToggleAutoAnalyze,
  aiConfigured,
}) => {
  const [bridgeStatus, setBridgeStatus] = useState<any>(null);

  React.useEffect(() => {
    fetch('/api/bridge/status')
      .then(res => res.json())
      .then(data => setBridgeStatus(data.status))
      .catch(console.error);
  }, []);

  // Completed jobs & today's calculations for the chart
  const completedJobs = useMemo(() => jobs.filter((j) => j.status === 'completed'), [jobs]);
  
  const last7DaysChartData = useMemo(() => {
    const dayNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه', 'شنبه'];
    const result = [];
    const today = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const isoDate = d.toISOString().split('T')[0];
      const dayName = i === 0 ? 'امروز' : i === 1 ? 'دیروز' : dayNames[d.getDay()];
      
      const dayMonth = d.toLocaleDateString('fa-IR', { month: 'short', day: 'numeric' });
      
      const dayJobs = completedJobs.filter((j) => (j.completedAt ? j.completedAt === isoDate : i === 0));
      const dayTotal = dayJobs.reduce((acc, j) => acc + (j.proposedPrice || j.budget || 0), 0);

      result.push({
        dateKey: isoDate,
        dayLabel: dayName,
        fullDateLabel: dayMonth,
        earnings: dayTotal,
      });
    }
    return result;
  }, [completedJobs]);

  return (
    <div className="space-y-6">
      {/* Editorial Title */}
      <div className="border-b border-slate-800 pb-4">
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <Radar className="h-5 w-5 text-emerald-400" />
          <span>مرکز اسکن، تحلیل و پیگیری پروژه‌ها</span>
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          اسکن واقعی با اجرای دستی شما · تحلیل خودکار پروژه‌های تازه فقط در صورت فعال‌سازی · ارسال پیشنهاد همیشه دستی است
        </p>
      </div>

      {/* Visual Chart Panel */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-400" />
          <span>ارزش تخمینی تکمیل‌های ثبت‌شده در ۷ روز اخیر</span>
        </h2>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={last7DaysChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="dayLabel" stroke="#64748b" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000000).toFixed(1)}M`} />
              <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }} />
              <Line type="monotone" dataKey="earnings" stroke="#10b981" strokeWidth={2} dot={{ fill: '#0f172a', stroke: '#10b981', r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Engine Status Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Core Status Card */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium">وضعیت موتور رصد:</span>
            <div className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${autoAnalyze && aiConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
              <span className="font-mono text-xs font-semibold text-white">
                {autoAnalyze ? (aiConfigured ? 'فعال (تحلیل خودکار)' : 'روشن، بدون AI') : 'خاموش'}
              </span>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-bold text-white">
              {settings.cyborgMode ? 'حالت سایبورگ (پیش‌نویس خودکار)' : 'حالت دستی (خروجی با کلیک)'}
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {settings.cyborgMode
                ? 'با باز کردن پروپوزال یا ورک‌اسپیس کدنویسی، پیش‌نویس با AI ساخته می‌شود؛ ارسال به کارفرما همیشه با تایید شما و دستی است.'
                : 'تحلیل، پروپوزال و کد فقط با کلیک شما ساخته می‌شوند. هیچ درخواستی خودکار ارسال نمی‌شود.'}
            </p>
            {autoAnalyze && !aiConfigured && (
              <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">
                تحلیل خودکار روشن است ولی هنوز provider تنظیم نشده؛ ابتدا از «تنظیمات → هوش مصنوعی» یک اتصال اضافه کنید.
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => onUpdateSettings({ cyborgMode: !settings.cyborgMode })}
              className="flex-1 py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors"
            >
              تغییر به {settings.cyborgMode ? 'حالت دستی' : 'تولید پیش‌نویس خودکار'}
            </button>

            <button
              onClick={onToggleAutoAnalyze}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                autoAnalyze
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                  : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
              }`}
            >
              {autoAnalyze ? 'توقف تحلیل خودکار' : 'روشن کردن تحلیل خودکار'}
            </button>
          </div>
        </div>

        {/* Tactical Parameters */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl space-y-4">
          <span className="text-xs text-slate-400 font-medium block">پارامترهای اسکن و تخفیف:</span>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">درصد تخفیف پیشنهادی نسبت به بودجه:</span>
                <span className="font-mono font-bold text-emerald-400 tabular-nums">
                  {settings.defaultDiscountRate}٪
                </span>
              </div>
              <input
                type="range"
                min="5"
                max="35"
                value={settings.defaultDiscountRate}
                onChange={(e) => onUpdateSettings({ defaultDiscountRate: parseInt(e.target.value) })}
                className="w-full accent-emerald-400 bg-slate-950 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">حداقل امتیاز فید برای تحلیل خودکار:</span>
                <span className="font-mono font-bold text-sky-400 tabular-nums">
                  {settings.autoBidThreshold}٪
                </span>
              </div>
              <input
                type="range"
                min="70"
                max="98"
                value={settings.autoBidThreshold}
                onChange={(e) => onUpdateSettings({ autoBidThreshold: parseInt(e.target.value) })}
                className="w-full accent-sky-400 bg-slate-950 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-2 text-[10px] leading-relaxed text-slate-400">
              فاصله‌ی اسکن خودکار از متغیر محیطی{' '}
              <span className="font-mono text-slate-300">KONKLANCER_SCAN_INTERVAL_MIN</span> خوانده می‌شود
              (پیش‌فرض: خاموش). برای شروع اسکن فوری از دکمه‌ی «اجرای اسکن زنده» استفاده کنید.
            </div>
          </div>
        </div>

        {/* Quick Launch & Radar pulse */}
        <div className="p-5 bg-slate-900 border border-slate-800 rounded-xl flex flex-col justify-between">
          <div className="space-y-2">
            <span className="text-xs text-slate-400 font-medium block">
              فید واقعی اسکنر (SPEC-004):
            </span>
            <div className="space-y-1.5 text-xs">
              {bridgeStatus ? (
                <>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>منبع فید:</span>
                    <span className="font-mono text-emerald-400">
                      {bridgeStatus.source === 'scanner'
                        ? 'اسکنر واقعی'
                        : bridgeStatus.source === 'demo'
                          ? 'داده‌ی نمایشی'
                          : 'خالی (هنوز اسکن نشده)'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-300">
                    <span>پروژه‌های فید:</span>
                    <span className="font-mono text-slate-200">
                      {(bridgeStatus.feedJobs ?? 0).toLocaleString('fa-IR')} از{' '}
                      {(bridgeStatus.scannedProjects ?? 0).toLocaleString('fa-IR')} اسکن‌شده
                    </span>
                  </div>
                  {bridgeStatus.activePlatforms?.length > 0 ? (
                    bridgeStatus.activePlatforms.map((p: any) => (
                      <div key={p.name} className="flex items-center justify-between text-slate-300">
                        <span>{p.name}:</span>
                        <span className="font-mono text-emerald-400">فعال</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-amber-300/90">
                      هیچ منبعی فعال نیست — راهنما: docs/PERSONAL-SETUP.md
                    </p>
                  )}
                </>
              ) : (
                <p className="text-slate-500 italic">در حال دریافت وضعیت...</p>
              )}
            </div>
          </div>

          <button
            onClick={onTriggerManualScan}
            disabled={isScanning}
            className="w-full mt-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-lg text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Radar className={`h-4 w-4 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? 'در حال پایش سایت‌ها...' : 'اجرای اسکن زنده اکنون'}</span>
          </button>
        </div>
      </div>

      {/* Live Activity Log Stream */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-400" />
            <h3 className="text-xs font-bold text-white">لاگ فعالیت‌های سیستمی و هوش مصنوعی</h3>
          </div>
          <span className="font-mono text-[11px] text-slate-400">Real-time Activity Stream</span>
        </div>

        <div className="p-4 divide-y divide-slate-800/60 max-h-72 overflow-y-auto font-mono text-xs">
          {logs.length === 0 ? (
            <p className="py-6 text-center text-slate-600 text-xs">هنوز لاگی ثبت نشده است.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-start justify-between gap-3 text-slate-300">
                <div className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold">›</span>
                  <span>{log.message}</span>
                </div>
                <span className="text-[11px] text-slate-500 shrink-0 font-mono">{log.timestamp}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
