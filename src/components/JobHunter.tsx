import React, { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import {
  BadgeCheck,
  CheckCircle2,
  ChevronDown,
  Clock,
  Code2,
  ExternalLink,
  FileText,
  Filter,
  Layers,
  ListFilter,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  X,
} from 'lucide-react';
import { FreelanceJob, PlatformKey, CategoryKey } from '../types';
import { ALL_CATEGORIES, categoryLabel, detectCategory } from '../../shared/taxonomy';

interface JobHunterProps {
  jobs: FreelanceJob[];
  onSelectJobForAnalysis: (job: FreelanceJob) => void;
  onSelectJobForProposal: (job: FreelanceJob) => void;
  onSelectJobForCoding: (job: FreelanceJob) => void;
  onAddNewManualJob: (job: Partial<FreelanceJob>) => void;
  focusJobId?: string | null;
  onFocusHandled?: () => void;
}

type SortKey = 'score' | 'newest' | 'budget' | 'proposals' | 'relevance';
type Scope = 'all' | 'fresh' | 'analyzed' | 'ready' | 'high';

interface Filters {
  platform: PlatformKey;
  category: CategoryKey;
  scope: Scope;
  minScore: number;
  budgetMin: string;
  budgetMax: string;
  sort: SortKey;
}

const DEFAULT_FILTERS: Filters = {
  platform: 'all',
  category: 'all',
  scope: 'all',
  minScore: 0,
  budgetMin: '',
  budgetMax: '',
  sort: 'score',
};

const FILTER_KEY = 'konklancer_hunter_filters_v2';

const SORT_LABEL: Record<SortKey, string> = {
  score: 'امتیاز فید',
  newest: 'تازه‌ترین',
  budget: 'بالاترین بودجه',
  proposals: 'کمترین رقابت',
  relevance: 'بیشترین تطابق',
};

const STATUS_META: Record<FreelanceJob['status'], { label: string; className: string }> = {
  new: { label: 'بررسی‌نشده', className: 'chip' },
  bidded: { label: 'پیشنهاد آماده', className: 'chip chip-amber' },
  in_progress: { label: 'در حال کار', className: 'chip chip-sky' },
  ready: { label: 'آماده‌ی تحویل', className: 'chip chip-violet' },
  completed: { label: 'تسویه‌شده', className: 'chip chip-accent' },
};

const PLATFORMS: Array<{ key: PlatformKey; label: string }> = [
  { key: 'all', label: 'همه' },
  { key: 'ponisha', label: 'پونیشا' },
  { key: 'karlancer', label: 'کارلانسر' },
  { key: 'parskoders', label: 'پارس‌کدرز' },
  { key: 'global', label: 'بین‌المللی' },
];

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: 'all', label: 'همه' },
  { key: 'fresh', label: 'تازه' },
  { key: 'analyzed', label: 'تحلیل‌شده' },
  { key: 'ready', label: 'آماده‌ی پیشنهاد' },
  { key: 'high', label: 'امتیاز بالا' },
];

const loadFilters = (): Filters => {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return { ...DEFAULT_FILTERS, ...JSON.parse(raw) };
  } catch {
    /* تنظیمات ذخیره‌شده معتبر نیست */
  }
  return DEFAULT_FILTERS;
};

const normalize = (value: string) =>
  value
    .toLowerCase()
    .replace(/[يى]/g, 'ی')
    .replace(/[ك]/g, 'ک')
    .replace(/[\u200c\u200f\u200e]/g, ' ');

const parseBudget = (value: string): number | null => {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*(k|m|میلیون|هزار)?$/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  if (unit === 'm' || unit === 'میلیون') return amount * 1_000_000;
  if (unit === 'k' || unit === 'هزار') return amount * 1_000;
  return amount;
};

interface ParsedQuery {
  terms: string[];
  phrases: string[];
  platform?: string;
  category?: string;
  tag?: string;
  minScore?: number;
  budgetMin?: number;
  budgetMax?: number;
}

export function parseQuery(raw: string): ParsedQuery {
  const result: ParsedQuery = { terms: [], phrases: [] };
  const tokens = raw.match(/"[^"]*"|\S+/g) ?? [];
  for (const token of tokens) {
    if (token.startsWith('"') && token.endsWith('"') && token.length > 2) {
      result.phrases.push(normalize(token.slice(1, -1)));
      continue;
    }
    if (token.startsWith('@')) {
      result.platform = normalize(token.slice(1));
      continue;
    }
    if (token.startsWith('#')) {
      const value = normalize(token.slice(1));
      const category = ALL_CATEGORIES.find((item) => normalize(item.fa).includes(value) || normalize(item.key).includes(value));
      if (category) result.category = category.key;
      else result.tag = value;
      continue;
    }
    if (/^(min|score):/i.test(token)) {
      const value = Number(token.split(':')[1]);
      if (Number.isFinite(value)) result.minScore = value;
      continue;
    }
    if (/(=|>|<|<=|>=)/.test(token) && /بودجه|budget/i.test(token)) {
      const operator = token.includes('>=') ? '>=' : token.includes('<=') ? '<=' : token.includes('>') ? '>' : token.includes('<') ? '<' : '=';
      const amount = parseBudget(token.replace(/^.*?(>=|<=|>|<|=)/, ''));
      if (amount !== null) {
        if (operator === '>') result.budgetMin = amount;
        else if (operator === '>=') result.budgetMin = amount;
        else if (operator === '<') result.budgetMax = amount;
        else if (operator === '<=') result.budgetMax = amount;
        else result.budgetMin = result.budgetMax = amount;
      }
      continue;
    }
    if (token.trim()) result.terms.push(normalize(token.trim()));
  }
  return result;
}

const matchesParsed = (job: FreelanceJob, query: ParsedQuery, haystack: string): boolean => {
  if (query.terms.some((term) => !haystack.includes(term))) return false;
  if (query.phrases.some((phrase) => !haystack.includes(phrase))) return false;
  if (query.platform) {
    const platformText = normalize(`${job.platformKey} ${job.platform}`);
    if (!platformText.includes(query.platform)) return false;
  }
  if (query.category && job.categoryKey !== query.category) return false;
  if (query.tag) {
    const tagText = normalize(`${job.tags.join(' ')} ${job.category ?? ''}`);
    if (!tagText.includes(query.tag)) return false;
  }
  if (query.minScore !== undefined && (job.score ?? 0) < query.minScore) return false;
  if (query.budgetMin !== undefined && job.budget < query.budgetMin) return false;
  if (query.budgetMax !== undefined && job.budget > query.budgetMax) return false;
  return true;
};

/** بخش‌های مطابق با عبارت جست‌وجو را هایلایت می‌کند. */
const Highlight: React.FC<{ text: string; terms: string[] }> = ({ text, terms }) => {
  const clean = terms.filter((term) => term.length > 1);
  if (clean.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${clean.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        clean.some((term) => normalize(part).toLowerCase() === term) ? (
          <mark key={index} className="rounded bg-emerald-400/20 px-0.5 text-emerald-200">
            {part}
          </mark>
        ) : (
          <React.Fragment key={index}>{part}</React.Fragment>
        ),
      )}
    </>
  );
};

const STATUS_TONE: Record<FreelanceJob['status'], string> = {
  new: 'text-slate-500',
  bidded: 'text-amber-300/90',
  in_progress: 'text-sky-300/90',
  ready: 'text-violet-300/90',
  completed: 'text-emerald-300/90',
};

const scoreTone = (score?: number) =>
  score === undefined
    ? 'border-slate-700 text-slate-500'
    : score >= 80
      ? 'border-emerald-500/50 text-emerald-300 bg-emerald-500/8'
      : score >= 60
        ? 'border-sky-500/40 text-sky-300 bg-sky-500/8'
        : 'border-slate-700 text-slate-400';

const ScoreBadge: React.FC<{ score?: number; reasons?: string[] }> = ({ score, reasons }) => (
  <span
    title={reasons?.length ? `دلیل امتیاز: ${reasons.join(' · ')}` : 'امتیاز پیش‌فیلتر'}
    className={`flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-lg border font-mono ${scoreTone(score)}`}
  >
    {score === undefined ? (
      <span className="text-[13px]">—</span>
    ) : (
      <>
        <span className="text-[13px] font-bold leading-none tabular-nums">{score.toLocaleString('fa-IR')}</span>
        <span className="mt-0.5 text-[8px] leading-none text-current/60">امتیاز</span>
      </>
    )}
  </span>
);

const Bar: React.FC<{ value: number; tone?: 'emerald' | 'sky' | 'amber' }> = ({ value, tone = 'emerald' }) => (
  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
    <div
      className={`h-full rounded-full ${tone === 'emerald' ? 'bg-emerald-400' : tone === 'sky' ? 'bg-sky-400' : 'bg-amber-400'}`}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

interface DetailProps {
  job: FreelanceJob;
  onAnalyze: () => void;
  onProposal: () => void;
  onCode: () => void;
  onClose?: () => void;
  compact?: boolean;
}

const JobDetail: React.FC<DetailProps> = ({ job, onAnalyze, onProposal, onCode, onClose, compact = false }) => {
  const analysis = job.aiAnalysis;
  const status = STATUS_META[job.status];

  return (
    <div className={`flex h-full min-h-0 flex-col ${compact ? '' : 'bg-[#080e1a]'}`}>
      <div className="flex items-start gap-2 border-b border-slate-800/70 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="chip chip-sky">{job.platform}</span>
            <span className={status.className}>{status.label}</span>
            {job.categoryKey && <span className="chip">{categoryLabel(String(job.categoryKey))}</span>}
          </div>
          <h2 className="text-[13px] font-bold leading-6 text-white">{job.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[10px] text-slate-500">
            <span>{job.budgetFormatted}</span>
            <span>·</span>
            <span>{(job.proposalsCount ?? 0).toLocaleString('fa-IR')} پیشنهاد</span>
            <span>·</span>
            <span>میانگین {(job.avgBid ?? 0).toLocaleString('fa-IR')}</span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="icon-btn shrink-0" aria-label="بستن">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <div className="grid grid-cols-2 gap-2">
          {[
            { icon: Clock, label: 'ثبت', value: job.postedTime || '—' },
            { icon: BadgeCheck, label: 'مهلت', value: job.deadline || '—' },
            { icon: Users, label: 'کارفرما', value: `${job.clientName}${job.clientRating ? ` · ${job.clientRating}★` : ''}` },
            { icon: Layers, label: 'دسته', value: job.category || categoryLabel(job.categoryKey) || '—' },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-800/70 bg-slate-900/40 px-2 py-1.5">
              <span className="flex items-center gap-1 text-[9px] text-slate-500">
                <item.icon className="h-2.5 w-2.5" /> {item.label}
              </span>
              <span className="mt-0.5 block truncate text-[11px] text-slate-300" title={item.value}>
                {item.value}
              </span>
            </div>
          ))}
        </div>

        <p className="mt-3 whitespace-pre-wrap text-[11.5px] leading-6 text-slate-400">{job.description}</p>

        {job.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {job.tags.slice(0, 10).map((tag) => (
              <span key={tag} className="rounded bg-slate-800/60 px-1.5 py-0.5 font-mono text-[9px] text-slate-400">
                {tag}
              </span>
            ))}
          </div>
        )}

        {analysis ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-1.5 text-[11px] font-bold text-white">
                <Sparkles className="h-3 w-3 text-sky-400" /> تحلیل هوش مصنوعی
              </h3>
              {analysis.meta?.model && <span className="font-mono text-[9px] text-slate-600">{analysis.meta.model}</span>}
            </div>

            <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-950/50 p-2.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-slate-500">قابل انجام با AI</span>
                <span className="font-mono text-emerald-300">{(analysis.automatabilityScore ?? 0).toLocaleString('fa-IR')}٪</span>
              </div>
              <Bar value={analysis.automatabilityScore} />
              <div className="flex items-center justify-between pt-1 text-[10px]">
                <span className="text-slate-500">تناسب با شما</span>
                <span className="font-mono text-sky-300">
                  {typeof analysis.matchScore === 'number' ? `${analysis.matchScore.toLocaleString('fa-IR')}٪` : '—'}
                </span>
              </div>
              <Bar value={analysis.matchScore ?? 0} tone="sky" />
            </div>

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-2 py-1.5">
                <span className="block text-[9px] text-amber-500/80">قیمت پیشنهادی</span>
                <span className="font-mono text-[11px] text-amber-200">
                  {analysis.recommendedBidFormatted ||
                    (analysis.recommendedBid ? `${analysis.recommendedBid.toLocaleString('fa-IR')} تومان` : 'نامشخص')}
                </span>
              </div>
              <div className="rounded-lg border border-sky-500/20 bg-sky-500/5 px-2 py-1.5">
                <span className="block text-[9px] text-sky-500/80">زمان تحویل</span>
                <span className="text-[11px] text-sky-200">{analysis.suggestedDuration || '—'}</span>
              </div>
            </div>

            <p className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-2 text-[11px] leading-6 text-slate-300">
              {analysis.feasibilityReason}
            </p>

            {(analysis.redFlags?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-2">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-red-300">
                  <ShieldAlert className="h-3 w-3" /> ریسک‌ها
                </p>
                <ul className="list-inside list-disc space-y-0.5 text-[10px] leading-5 text-red-100/80">
                  {analysis.redFlags?.slice(0, 4).map((flag) => (
                    <li key={flag}>{flag}</li>
                  ))}
                </ul>
              </div>
            )}

            {(analysis.nextSteps?.length ?? 0) > 0 && (
              <div className="rounded-lg border border-slate-800/70 bg-slate-900/40 p-2">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold text-slate-200">
                  <ListFilter className="h-3 w-3 text-sky-400" /> قدم‌های بعدی
                </p>
                <ol className="list-inside list-decimal space-y-0.5 text-[10px] leading-5 text-slate-400">
                  {analysis.nextSteps?.slice(0, 4).map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-sky-500/25 bg-sky-500/5 p-3 text-center">
            <Sparkles className="mx-auto h-5 w-5 text-sky-400" />
            <p className="mt-1.5 text-[11px] text-slate-300">هنوز تحلیلی برای این پروژه ساخته نشده است.</p>
            <button onClick={onAnalyze} className="btn mt-2 border-sky-500/40 bg-sky-500/10 text-sky-200">
              اجرای تحلیل هوشمند
            </button>
          </div>
        )}
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-slate-800/70 bg-[#070c16] p-2.5">
        <button onClick={onProposal} className="btn h-8 justify-center">
          <FileText className="h-3.5 w-3.5 text-amber-400" /> نگارش پیشنهاد
        </button>
        <button onClick={onCode} className="btn btn-primary h-8 justify-center">
          <Code2 className="h-3.5 w-3.5" /> تولید کد
        </button>
        {job.url && (
          <a
            href={job.url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn col-span-2 h-7 justify-center border-slate-800 bg-transparent text-[10px]"
          >
            <ExternalLink className="h-3 w-3" /> صفحه‌ی اصلی پروژه روی {job.platform}
          </a>
        )}
      </div>
    </div>
  );
};

export const JobHunter: React.FC<JobHunterProps> = ({
  jobs,
  onSelectJobForAnalysis,
  onSelectJobForProposal,
  onSelectJobForCoding,
  onAddNewManualJob,
  focusJobId,
  onFocusHandled,
}) => {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [filters, setFilters] = useState<Filters>(loadFilters);
  const [selectedId, setSelectedId] = useState<string | null>(jobs[0]?.id ?? null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [mobile, setMobile] = useState(false);

  const searchRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // manual form
  const [manualTitle, setManualTitle] = useState('');
  const [manualDesc, setManualDesc] = useState('');
  const [manualBudget, setManualBudget] = useState('3000000');
  const [manualPlatform, setManualPlatform] = useState('پونیشا');

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1279px)');
    const apply = () => setMobile(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(filters));
    } catch {
      /* حافظه در دسترس نیست */
    }
  }, [filters]);

  // پرش از پالت فرمان‌ها: فیلترها پاک می‌شوند تا پروژه‌ی هدف قطعاً دیده شود.
  useEffect(() => {
    if (!focusJobId) return;
    setQuery('');
    setFilters(DEFAULT_FILTERS);
    setSelectedId(focusJobId);
    if (mobile) setSheetOpen(true);
    window.setTimeout(() => {
      document.getElementById(`job-row-${focusJobId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 80);
    onFocusHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusJobId]);

  // اگر پروژه‌ی انتخاب‌شده از فهرست حذف/فیلتر شد، اولین نتیجه انتخاب می‌شود.
  useEffect(() => {
    if (selectedId && jobs.some((job) => job.id === selectedId)) return;
    setSelectedId(jobs[0]?.id ?? null);
  }, [jobs, selectedId]);

  const parsed = useMemo(() => parseQuery(deferredQuery), [deferredQuery]);
  const activeTerms = useMemo(() => [...parsed.terms, ...parsed.phrases], [parsed]);

  const enriched = useMemo(
    () =>
      jobs.map((job) => ({
        job,
        haystack: normalize(
          `${job.title} ${job.description} ${job.tags.join(' ')} ${job.clientName} ${job.platform} ${job.category ?? ''} ${job.categoryKey ?? ''}`,
        ),
        titleText: normalize(job.title),
        tagText: normalize(`${job.tags.join(' ')} ${job.category ?? ''}`),
      })),
    [jobs],
  );

  const filtered = useMemo(() => {
    let rows = enriched.filter(({ job, haystack }) => {
      if (filters.platform !== 'all' && job.platformKey !== filters.platform) return false;
      if (filters.category !== 'all' && job.categoryKey !== filters.category) return false;
      if (filters.scope === 'fresh' && job.status !== 'new') return false;
      if (filters.scope === 'analyzed' && !job.aiAnalysis) return false;
      if (filters.scope === 'ready' && job.status !== 'bidded' && !job.proposal) return false;
      if (filters.scope === 'high' && (job.score ?? 0) < 75) return false;
      if (filters.minScore > 0 && (job.score ?? 0) < filters.minScore) return false;
      if (filters.budgetMin && job.budget < Number(filters.budgetMin)) return false;
      if (filters.budgetMax && job.budget > Number(filters.budgetMax)) return false;
      if (!matchesParsed(job, parsed, haystack)) return false;
      return true;
    });

    const relevance = (row: (typeof enriched)[number]) => {
      if (!parsed.terms.length && !parsed.phrases.length) return 0;
      let score = 0;
      for (const term of activeTerms) {
        if (row.titleText.includes(term)) score += 6;
        if (row.tagText.includes(term)) score += 3;
        if (row.haystack.includes(term)) score += 1;
      }
      return score;
    };

    const sortKey: SortKey = parsed.terms.length || parsed.phrases.length ? 'relevance' : filters.sort;
    rows = [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'newest':
          return Date.parse(b.job.scrapedAt ?? '') - Date.parse(a.job.scrapedAt ?? '') || 0;
        case 'budget':
          return b.job.budget - a.job.budget;
        case 'proposals':
          return (a.job.proposalsCount ?? 0) - (b.job.proposalsCount ?? 0);
        case 'relevance': {
          const delta = relevance(b) - relevance(a);
          if (delta !== 0) return delta;
          return (b.job.score ?? 0) - (a.job.score ?? 0);
        }
        case 'score':
        default:
          return (b.job.score ?? 0) - (a.job.score ?? 0) || b.job.budget - a.job.budget;
      }
    });

    return rows.map((row) => row.job);
  }, [enriched, filters, parsed, activeTerms]);

  useEffect(() => {
    if (filtered.length === 0) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !filtered.some((job) => job.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedId) ?? null, [jobs, selectedId]);

  const openDetail = (job: FreelanceJob) => {
    setSelectedId(job.id);
    if (mobile) setSheetOpen(true);
  };

  const analyze = (job: FreelanceJob) => {
    setSheetOpen(false);
    onSelectJobForAnalysis(job);
  };
  const propose = (job: FreelanceJob) => {
    setSheetOpen(false);
    onSelectJobForProposal(job);
  };
  const code = (job: FreelanceJob) => {
    setSheetOpen(false);
    onSelectJobForCoding(job);
  };

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    if (filtered.length === 0) return;
    const index = filtered.findIndex((job) => job.id === selectedId);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const next = filtered[Math.min(filtered.length - 1, index + 1)];
      setSelectedId(next.id);
      document.getElementById(`job-row-${next.id}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previous = filtered[Math.max(0, index - 1)];
      setSelectedId(previous.id);
      document.getElementById(`job-row-${previous.id}`)?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter' && index >= 0) {
      event.preventDefault();
      openDetail(filtered[index]);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;
      if (!typing && event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      }
      if (event.key === 'Escape') {
        setShowFilters(false);
        setShowHelp(false);
        setSheetOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeFilterCount =
    (filters.platform !== 'all' ? 1 : 0) +
    (filters.category !== 'all' ? 1 : 0) +
    (filters.scope !== 'all' ? 1 : 0) +
    (filters.minScore > 0 ? 1 : 0) +
    (filters.budgetMin ? 1 : 0) +
    (filters.budgetMax ? 1 : 0) +
    (query.trim() ? 1 : 0);

  const resetAll = () => {
    setFilters(DEFAULT_FILTERS);
    setQuery('');
  };

  const counts = useMemo(
    () => ({
      total: jobs.length,
      analyzed: jobs.filter((job) => Boolean(job.aiAnalysis)).length,
      ready: jobs.filter((job) => job.status === 'bidded' || Boolean(job.proposal)).length,
    }),
    [jobs],
  );

  const handleCreateManualJob = (event: React.FormEvent) => {
    event.preventDefault();
    if (!manualTitle.trim() || !manualDesc.trim()) return;
    const budgetNum = parseInt(manualBudget, 10) || 3000000;
    const categoryKey = detectCategory(manualTitle, manualDesc).key;
    onAddNewManualJob({
      id: `custom-${Date.now()}`,
      title: manualTitle.trim(),
      description: manualDesc.trim(),
      budget: budgetNum,
      budgetFormatted: `${budgetNum.toLocaleString('fa-IR')} تومان`,
      platform: manualPlatform,
      platformKey: manualPlatform.includes('کارلانسر') ? 'karlancer' : manualPlatform.includes('پارس‌کدرز') ? 'parskoders' : manualPlatform.includes('آپ‌ورک') ? 'global' : 'ponisha',
      clientName: 'کارفرمای اختصاصی',
      clientRating: 5,
      clientReviews: 0,
      deadline: 'نامشخص',
      postedTime: 'هم‌اکنون',
      category: categoryLabel(categoryKey),
      categoryKey,
      tags: [],
      proposalsCount: 0,
      avgBid: budgetNum,
      status: 'new',
      scrapedAt: new Date().toISOString(),
    });
    setManualTitle('');
    setManualDesc('');
    setShowAddModal(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* toolbar */}
      <div className="shrink-0 border-b border-slate-800/70 bg-[#070c16]/60 px-2 py-2 sm:px-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative min-w-[190px] flex-1">
            <Search className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جست‌وجو در پروژه‌ها…  ( / )     @پلتفرم  #دسته  min:80  بودجه>5m"
              className="field h-8 pe-16 ps-8 text-[11.5px]"
              aria-label="جست‌وجوی پروژه"
              dir="auto"
            />
            <div className="absolute left-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {query ? (
                <button onClick={() => setQuery('')} className="icon-btn h-5 w-5" aria-label="پاک کردن جست‌وجو">
                  <X className="h-3 w-3" />
                </button>
              ) : (
                <kbd className="kbd hidden sm:inline-flex">/</kbd>
              )}
              <button
                onClick={() => setShowHelp((value) => !value)}
                className={`icon-btn h-5 w-5 text-[10px] ${showHelp ? 'text-emerald-300' : ''}`}
                title="راهنمای جست‌وجوی پیشرفته"
                aria-label="راهنمای جست‌وجو"
              >
                ?
              </button>
            </div>
          </div>

          <div className="relative">
            <button
              onClick={() => setShowFilters((value) => !value)}
              className={`btn h-8 ${activeFilterCount > 0 ? 'border-emerald-500/40 text-emerald-200' : ''}`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">فیلترها</span>
              {activeFilterCount > 0 && (
                <span className="rounded bg-emerald-500/20 px-1 font-mono text-[9px] text-emerald-200">{activeFilterCount}</span>
              )}
              <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
            </button>

            {showFilters && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setShowFilters(false)} />
                <div className="animate-scale-in absolute left-0 top-9 z-40 w-[300px] rounded-xl border border-slate-700/70 bg-slate-900 p-3 shadow-2xl shadow-black/50 sm:w-[340px]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-[11px] font-bold text-white">
                      <Filter className="h-3 w-3 text-emerald-400" /> فیلترهای دقیق
                    </span>
                    <button onClick={resetAll} className="text-[10px] text-slate-500 hover:text-slate-200">
                      پاک‌سازی همه
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    <label className="block">
                      <span className="mb-1 block text-[10px] text-slate-400">دسته‌بندی</span>
                      <select
                        value={filters.category}
                        onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}
                        className="field h-8"
                      >
                        <option value="all">همه‌ی دسته‌ها</option>
                        {ALL_CATEGORIES.map((category) => (
                          <option key={category.key} value={category.key}>
                            {category.fa} · تناسب AI {category.aiFit}/10
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-[10px] text-slate-400">حداقل بودجه (تومان)</span>
                        <input
                          inputMode="numeric"
                          value={filters.budgetMin}
                          onChange={(event) => setFilters((current) => ({ ...current, budgetMin: event.target.value.replace(/\D/g, '') }))}
                          placeholder="۰"
                          className="field h-8 font-mono"
                          dir="ltr"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-[10px] text-slate-400">حداکثر بودجه</span>
                        <input
                          inputMode="numeric"
                          value={filters.budgetMax}
                          onChange={(event) => setFilters((current) => ({ ...current, budgetMax: event.target.value.replace(/\D/g, '') }))}
                          placeholder="بدون سقف"
                          className="field h-8 font-mono"
                          dir="ltr"
                        />
                      </label>
                    </div>

                    <label className="block">
                      <span className="mb-1 flex items-center justify-between text-[10px] text-slate-400">
                        <span>حداقل امتیاز فید</span>
                        <span className="font-mono text-emerald-300">{filters.minScore.toLocaleString('fa-IR')}</span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={filters.minScore}
                        onChange={(event) => setFilters((current) => ({ ...current, minScore: Number(event.target.value) }))}
                        className="w-full accent-emerald-400"
                      />
                    </label>

                    <label className="block">
                      <span className="mb-1 block text-[10px] text-slate-400">ترتیب نمایش</span>
                      <select
                        value={filters.sort}
                        onChange={(event) => setFilters((current) => ({ ...current, sort: event.target.value as SortKey }))}
                        className="field h-8"
                        disabled={Boolean(parsed.terms.length || parsed.phrases.length)}
                      >
                        {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                          <option key={key} value={key}>
                            {SORT_LABEL[key]}
                          </option>
                        ))}
                      </select>
                      {Boolean(parsed.terms.length || parsed.phrases.length) && (
                        <span className="mt-1 block text-[9px] text-slate-500">در حالت جست‌وجو، ترتیب بر اساس تطابق است.</span>
                      )}
                    </label>
                  </div>
                </div>
              </>
            )}
          </div>

          <button onClick={() => setShowAddModal(true)} className="btn h-8">
            <Plus className="h-3.5 w-3.5 text-emerald-400" />
            <span className="hidden sm:inline">پروژه‌ی دستی</span>
          </button>
        </div>

        {/* platforms + scopes */}
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <div className="flex items-center rounded-lg border border-slate-800/80 bg-slate-900/50 p-0.5">
            {PLATFORMS.map((platform) => (
              <button
                key={platform.key}
                onClick={() => setFilters((current) => ({ ...current, platform: platform.key }))}
                className={`rounded-md px-2 py-1 text-[10.5px] transition-colors ${
                  filters.platform === platform.key
                    ? 'bg-slate-700/80 text-white'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {platform.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 overflow-x-auto">
            {SCOPES.map((scope) => (
              <button
                key={scope.key}
                onClick={() => setFilters((current) => ({ ...current, scope: scope.key }))}
                className={`rounded-md px-2 py-1 text-[10.5px] transition-colors ${
                  filters.scope === scope.key
                    ? 'bg-emerald-500/12 text-emerald-300 ring-1 ring-inset ring-emerald-500/25'
                    : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                }`}
              >
                {scope.label}
              </button>
            ))}
          </div>

          <div className="ms-auto flex items-center gap-2 text-[10px] text-slate-500">
            <span className="font-mono tabular-nums">
              {filtered.length.toLocaleString('fa-IR')} از {counts.total.toLocaleString('fa-IR')}
            </span>
            <span className="hidden items-center gap-1 sm:flex">
              <CheckCircle2 className="h-3 w-3 text-emerald-400/70" />
              {counts.analyzed.toLocaleString('fa-IR')} تحلیل‌شده
            </span>
          </div>
        </div>

        {showHelp && (
          <div className="animate-fade mt-2 rounded-lg border border-slate-800 bg-slate-950/70 px-3 py-2 text-[10px] leading-6 text-slate-400">
            <span className="font-semibold text-slate-200">عملگرهای جست‌وجو:</span>{' '}
            <code className="text-emerald-300">@ponisha</code> پلتفرم · <code className="text-emerald-300">#گرافیک</code> دسته ·{' '}
            <code className="text-emerald-300">min:80</code> حداقل امتیاز · <code className="text-emerald-300">بودجه&gt;5m</code>{' '}
            بودجه · <code className="text-emerald-300">"ربات تلگرام"</code> عبارت دقیق. همه‌ی کلمه‌ها باید موجود باشند (AND).
          </div>
        )}
      </div>

      {/* content */}
      <div className="flex min-h-0 flex-1">
        <div
          ref={listRef}
          tabIndex={0}
          onKeyDown={handleListKeyDown}
          className="min-w-0 flex-1 overflow-y-auto focus:outline-none"
          role="listbox"
          aria-label="فهرست پروژه‌ها"
        >
          {filtered.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
              <Search className="h-8 w-8 text-slate-700" />
              {counts.total === 0 ? (
                <>
                  <p className="text-sm text-slate-300">فید هنوز خالی است.</p>
                  <p className="max-w-sm text-[11px] leading-6 text-slate-500">
                    از نوار بالای همین صفحه «اسکن زنده» را بزنید تا اسکنر واقعی اجرا شود، یا یک پروژه را دستی
                    اضافه کنید. هیچ داده‌ی نمایشی به‌صورت خودکار وارد فهرست نمی‌شود.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-300">پروژه‌ای با این معیارها پیدا نشد.</p>
                  <p className="text-[11px] text-slate-500">عبارت جست‌وجو یا فیلترها را تغییر دهید.</p>
                </>
              )}
              <div className="mt-2 flex gap-2">
                {activeFilterCount > 0 && (
                  <button onClick={resetAll} className="btn">
                    <X className="h-3 w-3" /> پاک‌سازی فیلترها
                  </button>
                )}
                <button onClick={() => setShowAddModal(true)} className="btn border-emerald-500/40 text-emerald-200">
                  <Plus className="h-3 w-3" /> افزودن پروژه‌ی دستی
                </button>
              </div>
            </div>
          ) : (
            filtered.map((job) => {
              const isSelected = job.id === selectedId;
              const status = STATUS_META[job.status];
              const analysis = job.aiAnalysis;
              return (
                <div
                  key={job.id}
                  id={`job-row-${job.id}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => openDetail(job)}
                  onDoubleClick={() => analyze(job)}
                  className={`group relative cursor-pointer border-b border-slate-800/50 px-2.5 py-2 transition-colors sm:px-3 ${
                    isSelected ? 'bg-slate-800/35' : 'hover:bg-slate-900/60'
                  }`}
                >
                  {isSelected && <span className="absolute inset-y-0 right-0 w-0.5 bg-emerald-400" />}
                  <div className="flex items-start gap-2.5">
                    <ScoreBadge score={job.score} reasons={job.scoreReasons} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="min-w-0 flex-1 truncate text-[12px] font-semibold text-slate-100 group-hover:text-white">
                          <Highlight text={job.title} terms={activeTerms} />
                        </h3>
                        <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums text-emerald-300">
                          {job.budgetFormatted}
                        </span>
                      </div>

                      <p className="mt-0.5 line-clamp-1 text-[10.5px] leading-5 text-slate-500">
                        <Highlight text={job.description} terms={activeTerms} />
                      </p>

                      <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[9.5px] text-slate-500">
                        <span className="font-medium text-slate-400">{job.platform}</span>
                        <span className="text-slate-700">·</span>
                        {job.categoryKey && (
                          <span className="rounded bg-slate-800/60 px-1 py-px text-slate-400">
                            {categoryLabel(String(job.categoryKey))}
                          </span>
                        )}
                        {job.status !== 'new' && (
                          <span className={`hidden text-[9px] sm:inline ${STATUS_TONE[job.status]}`}>{status.label}</span>
                        )}
                        <span className="flex items-center gap-0.5">
                          <Clock className="h-2.5 w-2.5" /> {job.postedTime || '—'}
                        </span>
                        <span className="flex items-center gap-0.5">
                          <Users className="h-2.5 w-2.5" /> {(job.proposalsCount ?? 0).toLocaleString('fa-IR')} پیشنهاد
                        </span>
                        {analysis && (
                          <span className="flex items-center gap-0.5 text-sky-300/90">
                            <Sparkles className="h-2.5 w-2.5" />
                            {(analysis.automatabilityScore ?? 0).toLocaleString('fa-IR')}٪
                            {typeof analysis.matchScore === 'number' && (
                              <span className="text-indigo-300/80"> · تناسب {analysis.matchScore.toLocaleString('fa-IR')}٪</span>
                            )}
                          </span>
                        )}
                        {job.generatedFiles && Object.keys(job.generatedFiles).length > 0 && (
                          <span className="chip chip-violet h-4 text-[8.5px]">{Object.keys(job.generatedFiles).length} فایل</span>
                        )}
                      </div>
                    </div>

                    <div className="hidden shrink-0 items-center gap-0.5 self-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 sm:flex">
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          analyze(job);
                        }}
                        className="icon-btn h-6 w-6"
                        title="تحلیل هوشمند"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-sky-400" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          propose(job);
                        }}
                        className="icon-btn h-6 w-6"
                        title="نگارش پیشنهاد"
                      >
                        <FileText className="h-3.5 w-3.5 text-amber-400" />
                      </button>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          code(job);
                        }}
                        className="icon-btn h-6 w-6"
                        title="تولید کد"
                      >
                        <Code2 className="h-3.5 w-3.5 text-emerald-400" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div className="h-16" />
        </div>

        {/* desktop detail panel */}
        <aside className="hidden w-[340px] shrink-0 border-s border-slate-800/70 xl:flex 2xl:w-[400px]">
          {selectedJob ? (
            <div className="flex h-full w-full flex-col">
              <JobDetail
                job={selectedJob}
                onAnalyze={() => analyze(selectedJob)}
                onProposal={() => propose(selectedJob)}
                onCode={() => code(selectedJob)}
              />
            </div>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center">
              <Target className="h-7 w-7 text-slate-700" />
              <p className="text-xs text-slate-400">یک پروژه را از فهرست انتخاب کنید</p>
              <p className="text-[10px] text-slate-600">جزئیات، تحلیل AI و اقدام‌های سریع اینجا نمایش داده می‌شود.</p>
            </div>
          )}
        </aside>
      </div>

      {/* mobile detail sheet */}
      {mobile && sheetOpen && selectedJob && (
        <div className="fixed inset-0 z-[60] flex items-end bg-slate-950/70 backdrop-blur-sm xl:hidden" onClick={() => setSheetOpen(false)}>
          <div
            className="sheet flex max-h-[86dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-slate-700/80 bg-slate-900"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-700" />
            <div className="min-h-0 flex-1 overflow-hidden">
              <JobDetail
                job={selectedJob}
                compact
                onClose={() => setSheetOpen(false)}
                onAnalyze={() => analyze(selectedJob)}
                onProposal={() => propose(selectedJob)}
                onCode={() => code(selectedJob)}
              />
            </div>
          </div>
        </div>
      )}

      {/* manual job modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div
            className="animate-scale-in w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <Plus className="h-4 w-4 text-emerald-400" /> افزودن پروژه از هر سایت
              </h3>
              <button onClick={() => setShowAddModal(false)} className="icon-btn" aria-label="بستن">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateManualJob} className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-[11px] text-slate-400">عنوان پروژه</span>
                <input
                  autoFocus
                  required
                  value={manualTitle}
                  onChange={(event) => setManualTitle(event.target.value)}
                  placeholder="مثلاً طراحی لوگوی فروشگاه + راهنمای برند"
                  className="field"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-400">پلتفرم مبدأ</span>
                  <select value={manualPlatform} onChange={(event) => setManualPlatform(event.target.value)} className="field">
                    <option value="پونیشا">پونیشا</option>
                    <option value="کارلانسر">کارلانسر</option>
                    <option value="پارس‌کدرز">پارس‌کدرز</option>
                    <option value="آپ‌ورک / بین‌المللی">آپ‌ورک / بین‌المللی</option>
                    <option value="سایت دیگر">سایت دیگر</option>
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] text-slate-400">بودجه (تومان)</span>
                  <input
                    inputMode="numeric"
                    value={manualBudget}
                    onChange={(event) => setManualBudget(event.target.value.replace(/\D/g, ''))}
                    className="field font-mono"
                    dir="ltr"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[11px] text-slate-400">متن کامل آگهی</span>
                <textarea
                  required
                  rows={5}
                  value={manualDesc}
                  onChange={(event) => setManualDesc(event.target.value)}
                  placeholder="متن پروژه را از سایت کپی و اینجا بچسبانید؛ تحلیل و پروپوزال بر همین مبنا ساخته می‌شود."
                  className="field resize-y"
                />
              </label>
              <div className="flex items-center justify-between gap-2 pt-1">
                <p className="text-[10px] leading-5 text-slate-500">دسته‌بندی خودکار از عنوان و متن انجام می‌شود.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowAddModal(false)} className="btn">
                    انصراف
                  </button>
                  <button type="submit" className="btn btn-primary">
                    <Plus className="h-3.5 w-3.5" /> افزودن و تحلیل
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
