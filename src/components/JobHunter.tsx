import React, { useState } from 'react';
import { 
  Search, 
  Filter, 
  ExternalLink, 
  Sparkles, 
  FileText, 
  Code2, 
  Clock, 
  UserCheck, 
  Plus, 
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  DollarSign
} from 'lucide-react';
import { FreelanceJob, PlatformKey, CategoryKey } from '../types';

interface JobHunterProps {
  jobs: FreelanceJob[];
  onSelectJobForAnalysis: (job: FreelanceJob) => void;
  onSelectJobForProposal: (job: FreelanceJob) => void;
  onSelectJobForCoding: (job: FreelanceJob) => void;
  onAddNewManualJob: (job: Partial<FreelanceJob>) => void;
}

export const JobHunter: React.FC<JobHunterProps> = ({
  jobs,
  onSelectJobForAnalysis,
  onSelectJobForProposal,
  onSelectJobForCoding,
  onAddNewManualJob,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformKey>('all');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // Manual job form state
  const [manualTitle, setManualTitle] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualBudget, setManualBudget] = useState('3000000');
  const [manualPlatform, setManualPlatform] = useState('پونیشا');

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      job.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesPlatform =
      selectedPlatform === 'all' || job.platformKey === selectedPlatform;

    const matchesCategory =
      selectedCategory === 'all' || job.categoryKey === selectedCategory;

    return matchesSearch && matchesPlatform && matchesCategory;
  });

  const handleCreateManualJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTitle.trim() || !manualDesc.trim()) return;

    const budgetNum = parseInt(manualBudget) || 3000000;
    onAddNewManualJob({
      id: `custom-${Date.now()}`,
      title: manualTitle,
      description: manualDesc,
      budget: budgetNum,
      budgetFormatted: `${budgetNum.toLocaleString('fa-IR')} تومان`,
      platform: manualPlatform,
      platformKey: manualPlatform.includes('کارلانسر') ? 'karlancer' : manualPlatform.includes('پارسکدرز') ? 'parskoders' : 'ponisha',
      clientName: 'کارفرمای اختصاصی',
      clientRating: 5.0,
      clientReviews: 10,
      deadline: 'امروز',
      postedTime: 'هم‌اکنون',
      category: 'پروژه سفارشی',
      categoryKey: 'automation',
      tags: ['Custom Job', 'Instant AI'],
      proposalsCount: 1,
      avgBid: budgetNum,
      status: 'new',
    });

    setManualTitle('');
    setManualDesc('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-6">
      {/* Editorial headline & quick metrics bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            شکار هوشمند پروژه‌های فریلنسری
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            پایش لحظه‌ای سایت‌های پونیشا، کارلانسر و پارسکدرز · فیلتر پروژه‌های ۱۰۰٪ قابل انجام با هوش مصنوعی
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-850 border border-slate-700/80 rounded-lg text-xs font-medium text-slate-200 hover:text-white transition-colors"
          >
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            <span>ثبت دستی پروژه از هر سایتی</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Search */}
        <div className="md:col-span-5 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="جستجو در عنوان، پایتون، وب اسکرپینگ، ربات تلگرام..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pr-9 pl-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          />
        </div>

        {/* Platform segmented buttons */}
        <div className="md:col-span-7 flex flex-wrap items-center gap-1.5 justify-start md:justify-end">
          <span className="text-[11px] text-slate-400 ml-1">پلتفرم:</span>
          {(
            [
              { key: 'all', label: 'همه پلتفرم‌ها' },
              { key: 'ponisha', label: 'پونیشا' },
              { key: 'karlancer', label: 'کارلانسر' },
              { key: 'parskoders', label: 'پارسکدرز' },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              onClick={() => setSelectedPlatform(item.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                selectedPlatform === item.key
                  ? 'bg-slate-800 text-emerald-400 border border-slate-700'
                  : 'text-slate-400 bg-slate-900/60 hover:text-slate-200 border border-slate-850'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Category Filter Pills (Functional Buttons) */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] text-slate-400 ml-2">دسته‌بندی پردرآمد:</span>
        {(
          [
            { key: 'all', label: 'همه' },
            { key: 'scraping', label: 'وب اسکرپینگ' },
            { key: 'telegram', label: 'ربات تلگرام' },
            { key: 'data', label: 'اکسل و دیتا' },
            { key: 'api', label: 'توسعه API' },
            { key: 'automation', label: 'اتوماسیون' },
          ] as const
        ).map((cat) => (
          <button
            key={cat.key}
            onClick={() => setSelectedCategory(cat.key)}
            className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
              selectedCategory === cat.key
                ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                : 'text-slate-400 bg-slate-900 hover:text-slate-300 border border-slate-800'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Jobs Grid */}
      <div className="grid grid-cols-1 gap-4">
        {filteredJobs.length === 0 ? (
          <div className="py-16 text-center border border-dashed border-slate-800 rounded-xl bg-slate-900/30">
            <p className="text-sm text-slate-400">هیچ پروژه‌ای مطابق فیلترهای انتخاب شده یافت نشد.</p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedPlatform('all');
                setSelectedCategory('all');
              }}
              className="mt-3 text-xs text-emerald-400 hover:underline"
            >
              پاک‌سازی فیلترها
            </button>
          </div>
        ) : (
          filteredJobs.map((job) => (
            <div
              key={job.id}
              className="group border border-slate-800 bg-slate-900/70 hover:border-slate-700/80 rounded-xl p-5 transition-all space-y-4"
            >
              {/* Header row: Platform, timing, and budget */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="font-semibold text-slate-200">{job.platform}</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    {job.postedTime}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="flex items-center gap-1 text-[11px] text-slate-400">
                    <UserCheck className="h-3 w-3 text-slate-400" />
                    {job.clientName} ({job.clientRating} ★)
                  </span>
                </div>

                {/* Budget, Priority and Categorized Tag */}
                <div className="flex items-center gap-2">
                  {job.priority && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                        job.priority === 'High'
                          ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                          : job.priority === 'Medium'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                      }`}
                    >
                      {job.priority === 'High' ? 'بالا' : job.priority === 'Medium' ? 'متوسط' : 'پایین'}
                    </span>
                  )}

                  {job.categorizedTag && (
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        job.categorizedTag === 'Frontend'
                          ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                          : job.categorizedTag === 'Backend'
                          ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                          : job.categorizedTag === 'DevOps'
                          ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
                          : 'bg-pink-500/10 text-pink-300 border-pink-500/30'
                      }`}
                    >
                      {job.categorizedTag}
                    </span>
                  )}

                  {typeof job.score === 'number' && (
                    <span
                      title={job.scoreReasons?.join(' · ') ?? undefined}
                      className="rounded border border-slate-700/80 bg-slate-800/70 px-2 py-0.5 font-mono text-[10px] text-slate-300"
                    >
                      امتیاز فید: {job.score.toLocaleString('fa-IR')}
                    </span>
                  )}

                  <span className="text-xs text-slate-400">بودجه کارفرما:</span>
                  <span className="font-mono text-sm font-bold text-emerald-400 tabular-nums">
                    {job.budgetFormatted}
                  </span>
                </div>
              </div>

              {/* Title & Description */}
              <div>
                <h3 className="text-base font-semibold text-white group-hover:text-emerald-300 transition-colors">
                  {job.title}
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-slate-300 line-clamp-2">
                  {job.description}
                </p>
              </div>

              {/* Tags unboxed text metadata */}
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-400 pt-1">
                <span className="text-slate-400">تکنولوژی‌های پروژه:</span>
                {job.tags.map((tag, idx) => (
                  <span key={idx} className="font-mono text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
                <span className="mr-auto font-mono text-[11px] text-slate-400">
                  {job.proposalsCount} پیشنهاد ثبت‌شده · میانگین: {job.avgBid.toLocaleString('fa-IR')} تومان
                </span>
              </div>

              {/* Action Buttons row */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80">
                <div className="flex items-center gap-2">
                  {/* Analysis Button */}
                  <button
                    onClick={() => onSelectJobForAnalysis(job)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                    <span>تحلیل هوش مصنوعی</span>
                  </button>

                  {/* Proposal Button */}
                  <button
                    onClick={() => onSelectJobForProposal(job)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                  >
                    <FileText className="h-3.5 w-3.5 text-amber-400" />
                    <span>نگارش پروپوزال</span>
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {/* Open the original listing (SPEC-004: پروژه‌ها از اسکنر عمومی می‌آیند) */}
                  {job.url && (
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 rounded-lg text-xs font-medium transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                      <span>صفحه‌ی پروژه</span>
                    </a>
                  )}

                  {/* Start Agent Code Solution */}
                  <button
                    onClick={() => onSelectJobForCoding(job)}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-lg text-xs shadow-sm transition-all active:scale-95"
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    <span>کدنویسی خودکار با ایجنت</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Add custom job manually */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Plus className="h-4 w-4 text-emerald-400" />
                <span>افزودن دستی پروژه از سایت‌های فریلنسری</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                بستن ✕
              </button>
            </div>

            <form onSubmit={handleCreateManualJob} className="space-y-4">
              <div>
                <label className="block text-xs text-slate-300 mb-1">عنوان پروژه:</label>
                <input
                  type="text"
                  required
                  value={manualTitle}
                  onChange={(e) => setManualTitle(e.target.value)}
                  placeholder="مثال: اسکریپت استخراج محصولات دیجی‌کالا با پایتون"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">پلتفرم مبدا:</label>
                  <select
                    value={manualPlatform}
                    onChange={(e) => setManualPlatform(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/60"
                  >
                    <option value="پونیشا">پونیشا</option>
                    <option value="کارلانسر">کارلانسر</option>
                    <option value="پارسکدرز">پارسکدرز</option>
                    <option value="آپ‌ورک / بین‌المللی">آپ‌ورک / بین‌المللی</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-slate-300 mb-1">بودجه تقریبی (تومان):</label>
                  <input
                    type="number"
                    value={manualBudget}
                    onChange={(e) => setManualBudget(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500/60 tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">توضیحات کامل کارفرما:</label>
                <textarea
                  required
                  rows={4}
                  value={manualDesc}
                  onChange={(e) => setManualDesc(e.target.value)}
                  placeholder="متن کامل پروژه را از سایت فریلنسری کپی و اینجا پیست کنید..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500/60"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-medium rounded-lg text-xs"
                >
                  افزودن و آنالیز فوری
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
