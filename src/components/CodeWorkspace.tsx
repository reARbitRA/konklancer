import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Copy,
  Download,
  Eye,
  FilePlus2,
  Files,
  FolderGit2,
  FolderPlus,
  FolderTree,
  LayoutPanelLeft,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Play,
  Save,
  Search,
  Settings2,
  Sparkles,
  Terminal,
  TerminalSquare,
  X,
} from 'lucide-react';
import { FreelanceJob } from '../types';
import { AIRequestError, streamRequest, type AIMeta } from '../utils/aiClient';
import { CodeEditor } from './workspace/CodeEditor';
import { FileTree } from './workspace/FileTree';
import { MarkdownView } from './workspace/MarkdownView';
import { PromptDialog } from './workspace/PromptDialog';
import { WorkspaceInspector, type AgentLogEntry, type SolutionPlan } from './workspace/WorkspaceInspector';
import { WorkspaceTerminal, type TestResult } from './workspace/WorkspaceTerminal';
import {
  buildFileTree,
  countFiles,
  formatBytes,
  isValidFilePath,
  languageOf,
  LANGUAGE_LABEL,
  searchInFiles,
  uniquePath,
} from './workspace/fileTree';

interface CodeWorkspaceProps {
  job: FreelanceJob | null;
  githubToken: string;
  onOpenGitHubPush: (job: FreelanceJob, files: Record<string, string>) => void;
  onUpdateJobFiles: (jobId: string, files: Record<string, string>) => void;
  onUpdateJobRepoUrl: (jobId: string, repoUrl: string) => void;
  onOpenAISettings?: () => void;
  autoGenerate?: boolean;
  onBrowseJobs?: () => void;
}

interface Layout {
  explorer: number;
  inspector: number;
  terminal: number;
  explorerOpen: boolean;
  inspectorOpen: boolean;
  terminalOpen: boolean;
}

const LAYOUT_KEY = 'konklancer_workspace_layout_v2';
const DEFAULT_LAYOUT: Layout = {
  explorer: 236,
  inspector: 310,
  terminal: 210,
  explorerOpen: true,
  inspectorOpen: true,
  terminalOpen: true,
};

const loadLayout = (): Layout => {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw) return { ...DEFAULT_LAYOUT, ...JSON.parse(raw) };
  } catch {
    /* مقدار ذخیره‌شده معتبر نیست */
  }
  return DEFAULT_LAYOUT;
};

const MAX_TABS = 10;

export const CodeWorkspace: React.FC<CodeWorkspaceProps> = ({
  job,
  githubToken,
  onOpenGitHubPush,
  onUpdateJobFiles,
  onUpdateJobRepoUrl,
  onOpenAISettings,
  autoGenerate = false,
  onBrowseJobs,
}) => {
  // ---------- file state ----------
  const [files, setFiles] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [openTabs, setOpenTabs] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [revealLine, setRevealLine] = useState<number | null>(null);
  const [cursor, setCursor] = useState({ line: 1, column: 1, selected: 0 });

  // ---------- generation state ----------
  const [generating, setGenerating] = useState(false);
  const [progressPct, setProgressPct] = useState(0);
  const [plan, setPlan] = useState<SolutionPlan | null>(null);
  const [meta, setMeta] = useState<AIMeta | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; detail?: string; requiresAI?: boolean } | null>(null);
  const [agentLogs, setAgentLogs] = useState<AgentLogEntry[]>([]);
  const [instructions, setInstructions] = useState('');
  const [showInstruction, setShowInstruction] = useState(false);

  // ---------- test state ----------
  const [testRunning, setTestRunning] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // ---------- layout / ui ----------
  const [layout, setLayout] = useState<Layout>(loadLayout);
  const [explorerQuery, setExplorerQuery] = useState('');
  const [fileFilter, setFileFilter] = useState('');
  const [mobilePane, setMobilePane] = useState<'code' | 'files' | 'tools' | 'terminal'>('code');
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [newFileFolder, setNewFileFolder] = useState<string | null>(null);
  const [regenerateOpen, setRegenerateOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const generatedFor = useRef<string | null>(null);
  const dragRef = useRef<{ kind: 'explorer' | 'inspector'; startX: number; start: number } | null>(null);
  const filesRef = useRef(files);
  const dirtyRef = useRef(dirty);
  const prevJobIdRef = useRef<string | null>(null);

  filesRef.current = files;
  dirtyRef.current = dirty;

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout));
    } catch {
      /* حافظه در دسترس نیست */
    }
  }, [layout]);

  // ذخیره‌ی خودکار تغییرات پروژه‌ی قبلی هنگام جابه‌جایی (مثل VS Code که با تغییر workspace چیزی گم نمی‌شود)
  useEffect(() => {
    const previousId = prevJobIdRef.current;
    if (previousId && previousId !== job?.id && dirtyRef.current.size > 0) {
      onUpdateJobFiles(previousId, filesRef.current);
      dirtyRef.current = new Set();
    }
    prevJobIdRef.current = job?.id ?? null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current.size === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  // ---------- load job ----------
  useEffect(() => {
    if (!job) {
      setFiles({});
      setOpenTabs([]);
      setActivePath(null);
      return;
    }
    abortRef.current?.abort();
    const initial = job.generatedFiles ?? {};
    const initialPaths = Object.keys(initial);
    setFiles(initial);
    setDirty(new Set());
    setTestResult(null);
    setError(null);
    setPlan(null);
    setWarnings([]);
    setMeta(null);
    setProgressPct(0);
    setAgentLogs([]);
    setExplorerQuery('');
    setFileFilter('');

    if (initialPaths.length > 0) {
      const preferred = initialPaths.find((path) => /readme/i.test(path)) ?? initialPaths[0];
      const ordered = [preferred, ...initialPaths.filter((path) => path !== preferred)].slice(0, MAX_TABS);
      setOpenTabs(ordered);
      setActivePath(preferred);
      setMode(languageOf(preferred) === 'markdown' ? 'preview' : 'edit');
      generatedFor.current = job.id;
      return;
    }

    setOpenTabs([]);
    setActivePath(null);
    if (autoGenerate && generatedFor.current !== job.id) {
      generatedFor.current = job.id;
      void generate('', job);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.id]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (!showQuickOpen) return;
    setQuickQuery('');
  }, [showQuickOpen]);

  const pushLog = useCallback((message: string, tone: AgentLogEntry['tone'] = 'info', stage = 'agent') => {
    setAgentLogs((current) => [
      ...current.slice(-120),
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, stage, message, tone, at: Date.now() },
    ]);
  }, []);

  // ---------- generation ----------
  const generate = async (extraInstructions = '', targetJob: FreelanceJob | null = job) => {
    if (!targetJob) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setGenerating(true);
    setError(null);
    setWarnings([]);
    setMeta(null);
    setProgressPct(3);
    setAgentLogs([]);
    pushLog(`آغاز تولید برای «${targetJob.title}»`, 'info', 'start');

    try {
      let received: Record<string, string> | null = null;
      await streamRequest(
        '/api/generate-solution/stream',
        {
          title: targetJob.title,
          description: targetJob.description,
          budget: targetJob.budget,
          platform: targetJob.platform,
          proposalsCount: targetJob.proposalsCount,
          deadline: targetJob.deadline,
          category: targetJob.category,
          url: targetJob.url,
          instructions: extraInstructions.trim() || undefined,
        },
        (event, data) => {
          if (event === 'progress') {
            const message = typeof data?.message === 'string' ? data.message : 'در حال پردازش…';
            const stage = typeof data?.stage === 'string' ? data.stage : 'progress';
            const total = Number(data?.total) || 0;
            const index = Number(data?.index) || 0;
            if (stage === 'plan') setProgressPct((value) => Math.max(value, data?.total ? 12 : 6));
            if (stage === 'file-start' && total > 0) {
              setProgressPct(Math.max(12, Math.min(92, 12 + Math.round(((index - 1) / total) * 80))));
            }
            if (stage === 'file-done' && total > 0) {
              setProgressPct(Math.max(12, Math.min(95, 12 + Math.round((index / total) * 80))));
            }
            pushLog(message, stage === 'file-done' ? 'success' : 'info', stage);
          } else if (event === 'done') {
            received = (data?.files ?? {}) as Record<string, string>;
            setPlan((data?.plan ?? null) as SolutionPlan | null);
            setWarnings(Array.isArray(data?.warnings) ? data.warnings : []);
            setMeta((data?.meta ?? null) as AIMeta | null);
            setProgressPct(100);
            setFiles(received);
            setDirty(new Set());
            const paths = Object.keys(received);
            if (paths.length > 0) {
              const preferred = paths.find((path) => /readme/i.test(path)) ?? paths[0];
              setOpenTabs([preferred, ...paths.filter((path) => path !== preferred)].slice(0, MAX_TABS));
              setActivePath(preferred);
              setMode(languageOf(preferred) === 'markdown' ? 'preview' : 'edit');
            }
            onUpdateJobFiles(targetJob.id, received);
            pushLog(
              `${paths.length.toLocaleString('fa-IR')} فایل ساخته شد${data?.meta?.model ? ` · ${data.meta.model}` : ''}`,
              'success',
              'done',
            );
          }
        },
        controller.signal,
      );
      if (!received || Object.keys(received).length === 0) {
        setError({ message: 'مدل هیچ فایلی برنگرداند. دستور دقیق‌تری بنویسید و دوباره تلاش کنید.' });
        setProgressPct(0);
      }
    } catch (err: any) {
      setProgressPct(0);
      if (err?.name === 'AbortError') {
        pushLog('تولید متوقف شد؛ خروجی ناقص ذخیره نشد.', 'warn', 'abort');
      } else {
        const requestError = err instanceof AIRequestError ? err : null;
        setError({
          message: requestError?.message ?? err?.message ?? 'خطا در اجرای ایجنت کدنویسی',
          detail: requestError?.detail ?? undefined,
          requiresAI: Boolean(requestError?.requiresAIConfig) || requestError?.status === 503,
        });
        pushLog(requestError?.message ?? 'تولید ناموفق بود.', 'error', 'error');
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setGenerating(false);
    }
  };

  // ---------- editing ----------
  const updateFile = (path: string, value: string) => {
    setFiles((current) => ({ ...current, [path]: value }));
    setDirty((current) => {
      const next = new Set(current);
      next.add(path);
      return next;
    });
  };

  const saveFiles = (paths: string[]) => {
    if (!job || paths.length === 0) return;
    onUpdateJobFiles(job.id, filesRef.current);
    setDirty((current) => {
      const next = new Set(current);
      paths.forEach((path) => next.delete(path));
      return next;
    });
    pushLog(
      paths.length === 1 ? `«${paths[0]}» ذخیره شد.` : `${paths.length.toLocaleString('fa-IR')} فایل ذخیره شد.`,
      'success',
      'save',
    );
  };

  const saveAll = () => saveFiles([...dirtyRef.current]);

  const openFile = (path: string, line?: number) => {
    setOpenTabs((current) => {
      if (current.includes(path)) return current;
      const next = [...current, path];
      return next.length > MAX_TABS ? next.slice(next.length - MAX_TABS) : next;
    });
    setActivePath(path);
    setMode(languageOf(path) === 'markdown' ? 'preview' : 'edit');
    setRevealLine(line ?? null);
    setMobilePane('code');
  };

  const closeTab = (path: string) => {
    setOpenTabs((current) => {
      const index = current.indexOf(path);
      const next = current.filter((item) => item !== path);
      if (path === activePath) {
        const fallback = next[Math.min(index, next.length - 1)] ?? null;
        setActivePath(fallback);
        if (fallback) setMode(languageOf(fallback) === 'markdown' ? 'preview' : 'edit');
      }
      return next;
    });
  };

  const createFile = (path: string) => {
    const template = path.endsWith('.md')
      ? `# ${path.split('/').pop()?.replace(/\.md$/i, '')}\n\n`
      : path.endsWith('.py')
        ? '"""ماژول تازه."""\n\n\n'
        : '';
    setFiles((current) => ({ ...current, [path]: template }));
    setDirty((current) => new Set(current).add(path));
    openFile(path);
  };

  const renameFile = (from: string, to: string) => {
    setFiles((current) => {
      const next: Record<string, string> = {};
      for (const [path, content] of Object.entries(current)) next[path === from ? to : path] = content;
      return next;
    });
    setOpenTabs((current) => current.map((path) => (path === from ? to : path)));
    if (activePath === from) setActivePath(to);
    setDirty((current) => {
      const next = new Set(current);
      next.delete(from);
      next.add(to);
      return next;
    });
  };

  const deleteFile = (path: string) => {
    setFiles((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
    setOpenTabs((current) => current.filter((item) => item !== path));
    if (activePath === path) {
      const remaining = openTabs.filter((item) => item !== path);
      setActivePath(remaining[0] ?? null);
    }
    setDirty((current) => {
      const next = new Set(current);
      next.delete(path);
      return next;
    });
  };

  // ---------- tests ----------
  const runTests = async () => {
    if (!job || Object.keys(filesRef.current).length === 0) return;
    setTestRunning(true);
    setTestResult(null);
    setLayout((current) => ({ ...current, terminalOpen: true }));
    setMobilePane('terminal');
    try {
      const response = await fetch('/api/run-tests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: filesRef.current, timeoutMs: 30000 }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setTestResult({
          ok: false,
          error: data?.error ?? 'اجرای تست ناموفق بود.',
          disabled: data?.code === 'CODE_EXECUTION_DISABLED',
        });
        return;
      }
      setTestResult({ ...data, ok: Boolean(data?.ok) });
    } catch (err: any) {
      setTestResult({ ok: false, error: err?.message ?? 'اجرای تست ناموفق بود.' });
    } finally {
      setTestRunning(false);
    }
  };

  // ---------- clipboard / download ----------
  const copy = (key: string, value: string) => {
    void navigator.clipboard?.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(null), 1600);
  };

  const downloadFile = (path: string) => {
    const blob = new Blob([files[path] ?? ''], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = path.split('/').pop() ?? 'file.txt';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadBundle = () => {
    const combined = Object.entries(files)
      .map(([name, content]) => `\n${'='.repeat(10)} FILE: ${name} ${'='.repeat(10)}\n\n${content}\n`)
      .join('');
    const blob = new Blob([combined], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${job?.id ?? 'project'}-bundle.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  // ---------- shortcuts ----------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) {
        if (event.key === 'Escape') setShowQuickOpen(false);
        return;
      }
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        if (activePath && dirtyRef.current.has(activePath)) saveFiles([activePath]);
        else saveAll();
      } else if (key === 'p') {
        event.preventDefault();
        setShowQuickOpen((value) => !value);
      } else if (key === 'b') {
        event.preventDefault();
        setLayout((current) => ({ ...current, explorerOpen: !current.explorerOpen }));
      } else if (key === 'j') {
        event.preventDefault();
        setLayout((current) => ({ ...current, terminalOpen: !current.terminalOpen }));
      } else if (key === 'i') {
        event.preventDefault();
        setLayout((current) => ({ ...current, inspectorOpen: !current.inspectorOpen }));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  // ---------- resize ----------
  const startDrag = (kind: 'explorer' | 'inspector') => (event: React.PointerEvent) => {
    event.preventDefault();
    dragRef.current = {
      kind,
      startX: event.clientX,
      start: kind === 'explorer' ? layout.explorer : layout.inspector,
    };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  };

  const onDragMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const delta = drag.startX - event.clientX;
    if (drag.kind === 'explorer') {
      setLayout((current) => ({ ...current, explorer: Math.min(420, Math.max(180, drag.start + delta)) }));
    } else {
      setLayout((current) => ({ ...current, inspector: Math.min(520, Math.max(250, drag.start + delta)) }));
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // ---------- derived ----------
  const tree = useMemo(() => buildFileTree(files), [files]);
  const filePaths = useMemo(() => Object.keys(files).sort(), [files]);
  const searchHits = useMemo(
    () => (explorerQuery.trim().length >= 2 ? searchInFiles(files, explorerQuery) : []),
    [files, explorerQuery],
  );
  const visibleTree = useMemo(() => {
    if (!fileFilter.trim()) return tree;
    const needle = fileFilter.trim().toLowerCase();
    const filterNodes = (nodes: ReturnType<typeof buildFileTree>): ReturnType<typeof buildFileTree> =>
      nodes
        .map((node) =>
          node.type === 'file'
            ? node.name.toLowerCase().includes(needle)
              ? node
              : null
            : (() => {
                const children = filterNodes(node.children);
                if (children.length > 0 || node.name.toLowerCase().includes(needle)) return { ...node, children };
                return null;
              })(),
        )
        .filter(Boolean) as ReturnType<typeof buildFileTree>;
    return filterNodes(tree);
  }, [tree, fileFilter]);

  const quickResults = useMemo(() => {
    const needle = quickQuery.trim().toLowerCase();
    if (!needle) return filePaths.slice(0, 12);
    return filePaths.filter((path) => path.toLowerCase().includes(needle)).slice(0, 20);
  }, [filePaths, quickQuery]);

  const activeContent = activePath ? files[activePath] ?? '' : '';
  const activeLanguage = activePath ? languageOf(activePath) : 'text';
  const activeDirty = activePath ? dirty.has(activePath) : false;
  const stats = useMemo(
    () => ({
      files: filePaths.length,
      lines: filePaths.reduce((total, path) => total + (files[path]?.split('\n').length ?? 0), 0),
      bytes: filePaths.reduce((total, path) => total + new TextEncoder().encode(files[path] ?? '').length, 0),
    }),
    [filePaths, files],
  );

  const activeTabs = openTabs.filter((path) => files[path] !== undefined);
  const dirtyCount = dirty.size;
  const running = generating;

  // ---------- empty state ----------
  if (!job) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="surface max-w-md p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
            <TerminalSquare className="h-6 w-6" />
          </div>
          <h2 className="mt-3 text-sm font-bold text-white">پروژه‌ای برای کدنویسی انتخاب نشده است</h2>
          <p className="mx-auto mt-1.5 max-w-sm text-[11.5px] leading-6 text-slate-400">
            از بخش پروژه‌ها روی «تولید کد» یکی از آگهی‌ها بزنید؛ ایجنت نقشه‌ی پروژه را می‌سازد و فایل‌ها را در ادیتور
            قابل ویرایش نمایش می‌دهد.
          </p>
          {onBrowseJobs && (
            <button onClick={onBrowseJobs} className="btn btn-primary mx-auto mt-4 h-8">
              <ArrowLeft className="h-3.5 w-3.5" /> رفتن به فهرست پروژه‌ها
            </button>
          )}
        </div>
      </div>
    );
  }

  const renderExplorer = (compact = false) => (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-[32px] shrink-0 items-center gap-1 border-b border-slate-800/70 px-2">
        <span className="flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-widest text-slate-500">
          <FolderTree className="h-3 w-3" /> Explorer
        </span>
        <span className="rounded bg-slate-800/70 px-1 font-mono text-[9px] tabular-nums text-slate-400">
          {countFiles(tree).toLocaleString('fa-IR')}
        </span>
        <div className="flex-1" />
        <button
          onClick={() => setNewFileFolder('')}
          className="icon-btn h-6 w-6"
          title="فایل جدید"
          aria-label="فایل جدید"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
        </button>
        {!compact && (
          <button
            className="icon-btn h-6 w-6"
            title="جمع کردن پنل (Ctrl+B)"
            onClick={() => setLayout((current) => ({ ...current, explorerOpen: false }))}
            aria-label="جمع کردن اکسپلورر"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="shrink-0 space-y-1 border-b border-slate-800/60 p-1.5">
        <div className="relative">
          <Search className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-600" />
          <input
            value={explorerQuery}
            onChange={(event) => setExplorerQuery(event.target.value)}
            placeholder="جست‌وجو در محتوای فایل‌ها"
            className="field h-7 pe-2 ps-7 text-[10.5px]"
            aria-label="جست‌وجو در فایل‌ها"
          />
          {explorerQuery && (
            <button onClick={() => setExplorerQuery('')} className="absolute left-1 top-1/2 -translate-y-1/2 p-1 text-slate-500 hover:text-slate-200">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <input
            value={fileFilter}
            onChange={(event) => setFileFilter(event.target.value)}
            placeholder="فیلتر نام فایل"
            className="field h-6 flex-1 px-2 text-[10px]"
            aria-label="فیلتر نام فایل"
          />
          <button onClick={() => setNewFileFolder('')} className="icon-btn h-6 w-6" title="فایل جدید">
            <FilePlus2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => setNewFileFolder('')}
            className="icon-btn h-6 w-6"
            title="پوشه (با مسیر بسازید: src/utils/file.py)"
          >
            <FolderPlus className="h-3 w-3" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {explorerQuery.trim().length >= 2 ? (
          searchHits.length === 0 ? (
            <p className="p-3 text-center text-[10px] text-slate-600">نتیجه‌ای پیدا نشد.</p>
          ) : (
            <div className="py-1" dir="ltr">
              {searchHits.map((hit) => (
                <div key={hit.path} className="mb-1">
                  <div className="flex items-center gap-1.5 px-2 py-0.5 font-mono text-[10px] text-slate-400">
                    <FilePlus2 className="h-3 w-3 shrink-0 text-slate-600" />
                    <span className="truncate">{hit.path}</span>
                    <span className="rounded bg-slate-800 px-1 text-[9px] text-slate-500">{hit.matches.length}</span>
                  </div>
                  {hit.matches.map((match) => (
                    <button
                      key={`${hit.path}-${match.line}-${match.column}`}
                      onClick={() => openFile(hit.path, match.line)}
                      className="block w-full truncate px-6 py-0.5 text-left font-mono text-[10px] text-slate-500 hover:bg-slate-800/50 hover:text-slate-200"
                    >
                      <span className="me-1 text-slate-600">{match.line}:</span>
                      {match.text}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )
        ) : (
          <FileTree
            nodes={visibleTree}
            activePath={activePath}
            dirtyPaths={dirty}
            onOpen={(path) => openFile(path)}
            onRename={(path) => setRenameTarget(path)}
            onDelete={(path) => setDeleteTarget(path)}
            onNewFile={(folder) => setNewFileFolder(folder)}
          />
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-slate-800/70 px-2 py-1 text-[9px] text-slate-600">
        <span className="font-mono">
          {stats.files.toLocaleString('fa-IR')} فایل · {formatBytes(stats.bytes) || '0 B'}
        </span>
        <button onClick={downloadBundle} disabled={stats.files === 0} className="flex items-center gap-1 hover:text-slate-300">
          <Download className="h-3 w-3" /> bundle
        </button>
      </div>
    </div>
  );

  const renderEditor = () => {
    if (!activePath) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/60 text-slate-500">
            <Files className="h-5 w-5" />
          </div>
          <p className="text-xs font-medium text-slate-300">فایلی باز نیست</p>
          <p className="text-[10.5px] text-slate-500">
            از اکسپلورر یک فایل انتخاب کنید یا <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">P</kbd> را بزنید.
          </p>
          <button onClick={() => setShowQuickOpen(true)} className="btn mt-1 h-7">
            باز کردن سریع فایل
          </button>
        </div>
      );
    }

    const isMarkdown = activeLanguage === 'markdown';
    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* tab bar */}
        <div className="flex h-[33px] shrink-0 items-stretch border-b border-slate-800/80 bg-[#070d18]" dir="ltr">
          <div className="flex min-w-0 flex-1 overflow-x-auto">
            {activeTabs.map((path) => {
              const name = path.split('/').pop();
              const isActive = path === activePath;
              const isDirty = dirty.has(path);
              return (
                <div
                  key={path}
                  className={`group flex h-full min-w-0 max-w-[200px] items-center gap-1 border-e border-slate-800/70 px-2 text-[11px] transition-colors ${
                    isActive ? 'bg-[#0b1220] text-slate-100' : 'bg-[#060b13] text-slate-500 hover:text-slate-300'
                  }`}
                  title={path}
                >
                  <button onClick={() => openFile(path)} className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        isDirty ? 'bg-amber-400' : isActive ? 'bg-emerald-400/70' : 'bg-slate-700'
                      }`}
                    />
                    <span className="truncate font-mono text-[10.5px]">{name}</span>
                  </button>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      closeTab(path);
                    }}
                    className="shrink-0 rounded p-0.5 text-slate-600 opacity-0 transition-opacity hover:bg-slate-700/60 hover:text-slate-200 group-hover:opacity-100"
                    title="بستن تب"
                    aria-label={`بستن ${name}`}
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="flex shrink-0 items-center gap-0.5 border-s border-slate-800/70 px-1">
            <button
              onClick={() => setShowQuickOpen(true)}
              className="icon-btn h-6 w-6"
              title="باز کردن سریع فایل (Ctrl+P)"
              aria-label="باز کردن سریع فایل"
            >
              <Search className="h-3 w-3" />
            </button>
            <button
              onClick={() => activePath && downloadFile(activePath)}
              className="icon-btn h-6 w-6"
              title="دانلود فایل"
              aria-label="دانلود فایل"
            >
              <Download className="h-3 w-3" />
            </button>
            <button
              onClick={() => copy('file', activeContent)}
              className="icon-btn h-6 w-6"
              title="کپی محتوا"
              aria-label="کپی محتوا"
            >
              {copied === 'file' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>

        {/* breadcrumb + mode */}
        <div className="flex h-[26px] shrink-0 items-center gap-1 border-b border-slate-800/60 bg-[#080e1a] px-2 text-[10px]">
          <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden font-mono text-slate-500" dir="ltr">
            {activePath.split('/').map((segment, index, all) => (
              <React.Fragment key={`${segment}-${index}`}>
                <span className={index === all.length - 1 ? 'truncate text-slate-300' : 'truncate'}>{segment}</span>
                {index < all.length - 1 && <span className="text-slate-700">/</span>}
              </React.Fragment>
            ))}
            {activeDirty && <span className="ms-1 rounded bg-amber-500/15 px-1 text-[9px] text-amber-300">ویرایش‌شده</span>}
          </div>

          {isMarkdown && (
            <div className="flex items-center rounded-md border border-slate-800 bg-slate-900/60 p-0.5">
              <button
                onClick={() => setMode('preview')}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] ${
                  mode === 'preview' ? 'bg-slate-700/80 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Eye className="h-2.5 w-2.5" /> پیش‌نمایش
              </button>
              <button
                onClick={() => setMode('edit')}
                className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] ${
                  mode === 'edit' ? 'bg-slate-700/80 text-white' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                <Pencil className="h-2.5 w-2.5" /> ویرایش
              </button>
            </div>
          )}
          <button
            onClick={() => saveFiles([activePath])}
            disabled={!activeDirty}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] ${
              activeDirty ? 'text-emerald-300 hover:bg-emerald-500/10' : 'text-slate-600'
            }`}
            title="ذخیره (Ctrl+S)"
          >
            <Save className="h-2.5 w-2.5" /> ذخیره
          </button>
        </div>

        {/* editor */}
        <div className="min-h-0 flex-1">
          {isMarkdown && mode === 'preview' ? (
            <div className="h-full overflow-y-auto bg-[#070d18]">
              <MarkdownView content={activeContent} emptyHint="این فایل خالی است. برای نوشتن، حالت ویرایش را انتخاب کنید." />
            </div>
          ) : (
            <CodeEditor
              path={activePath}
              value={activeContent}
              onChange={(value) => updateFile(activePath, value)}
              onSave={() => saveFiles([activePath])}
              onCursorChange={setCursor}
              revealLine={revealLine}
              onRevealHandled={() => setRevealLine(null)}
            />
          )}
        </div>

        {/* status strip */}
        <div className="flex h-[22px] shrink-0 items-center gap-3 border-t border-slate-800/70 bg-[#060b13] px-2 font-mono text-[9.5px] text-slate-500">
          <span>
            Ln {cursor.line}, Col {cursor.column}
            {cursor.selected > 0 ? ` (${cursor.selected} sel)` : ''}
          </span>
          <span className="hidden sm:inline">{LANGUAGE_LABEL[activeLanguage]}</span>
          <span className="hidden md:inline">UTF-8</span>
          <span className="hidden md:inline">Spaces: 2</span>
          <span className="hidden lg:inline">LF</span>
          <div className="flex-1" />
          <span>{formatBytes(new TextEncoder().encode(activeContent).length)}</span>
          <span className={activeDirty ? 'text-amber-300' : 'text-emerald-400/80'}>{activeDirty ? '● unsaved' : '✓ saved'}</span>
        </div>
      </div>
    );
  };

  const mobileTabs: Array<{ key: typeof mobilePane; label: string; icon: React.ElementType; count?: number }> = [
    { key: 'files', label: 'فایل‌ها', icon: FolderTree, count: stats.files },
    { key: 'code', label: 'کد', icon: Terminal },
    { key: 'tools', label: 'ابزار AI', icon: Sparkles },
    { key: 'terminal', label: 'ترمینال', icon: TerminalSquare },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#060b14]">
      {/* project toolbar */}
      <div className="shrink-0 border-b border-slate-800/70 bg-[#080e1a]/90">
        <div className="flex flex-wrap items-center gap-1.5 px-2 py-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
              <Terminal className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2 className="truncate text-[11.5px] font-semibold text-slate-100">{job.title}</h2>
                <span className="chip h-4 shrink-0 text-[8.5px]">{job.platform}</span>
              </div>
              <p className="truncate font-mono text-[9px] text-slate-500">
                {plan?.projectName || job.id} · {plan?.stack || job.budgetFormatted}
                {stats.files > 0 ? ` · ${stats.files.toLocaleString('fa-IR')} فایل` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowInstruction((value) => !value)}
              className={`btn h-7 px-2 text-[10px] ${showInstruction ? 'border-sky-500/40 text-sky-200' : ''}`}
              title="دستور اصلاح برای تولید"
            >
              <Sparkles className="h-3 w-3 text-sky-400" />
              <span className="hidden sm:inline">دستور</span>
            </button>
            <button
              onClick={() => (stats.files > 0 ? setRegenerateOpen(true) : void generate(instructions))}
              disabled={running}
              className="btn btn-primary h-7 px-2.5 text-[10.5px]"
              title="تولید یا بازتولید سورس با ایجنت"
            >
              {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              <span>{running ? 'در حال تولید…' : stats.files > 0 ? 'تولید مجدد' : 'تولید سورس'}</span>
            </button>
            <button
              onClick={saveAll}
              disabled={dirtyCount === 0}
              className="btn h-7 px-2 text-[10px]"
              title="ذخیره‌ی همه (Ctrl+S)"
            >
              <Save className="h-3 w-3" />
              <span className="hidden sm:inline">ذخیره</span>
              {dirtyCount > 0 && (
                <span className="rounded bg-amber-500/20 px-1 font-mono text-[9px] text-amber-200">{dirtyCount}</span>
              )}
            </button>
            <button onClick={() => void runTests()} disabled={testRunning || stats.files === 0} className="btn h-7 px-2 text-[10px]" title="اجرای واقعی تست‌ها">
              {testRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 text-emerald-400" />}
              <span className="hidden md:inline">تست</span>
            </button>
            <button
              onClick={() => onOpenGitHubPush(job, files)}
              disabled={stats.files === 0}
              className="btn h-7 px-2 text-[10px]"
              title="ارسال به گیت‌هاب و تحویل"
            >
              <FolderGit2 className="h-3 w-3 text-emerald-400" />
              <span className="hidden lg:inline">تحویل</span>
            </button>
            <div className="hidden h-5 w-px bg-slate-800 md:block" />
            <button
              onClick={() => setLayout((current) => ({ ...current, explorerOpen: !current.explorerOpen }))}
              className={`icon-btn hidden h-7 w-7 md:flex ${layout.explorerOpen ? 'text-slate-300' : 'text-slate-600'}`}
              title="اکسپلورر (Ctrl+B)"
            >
              <PanelLeftOpen className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setLayout((current) => ({ ...current, inspectorOpen: !current.inspectorOpen }))}
              className={`icon-btn hidden h-7 w-7 lg:flex ${layout.inspectorOpen ? 'text-slate-300' : 'text-slate-600'}`}
              title="پنل ابزار (Ctrl+I)"
            >
              <LayoutPanelLeft className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {showInstruction && (
          <div className="animate-fade flex items-center gap-2 border-t border-slate-800/60 px-2 py-1.5">
            <input
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="مثلاً «تست‌ها را با unittest بنویس»، «README فارسی اضافه کن»، «ساختار src/ و tests/ بساز»"
              className="field h-7 flex-1 text-[10.5px]"
              onKeyDown={(event) => {
                if (event.key === 'Enter') void generate(instructions);
              }}
            />
            <button onClick={() => void generate(instructions)} disabled={running} className="btn h-7 px-2 text-[10px]">
              اعمال
            </button>
          </div>
        )}

        {running && (
          <div className="h-0.5 w-full bg-slate-900">
            <div className="h-full bg-gradient-to-l from-emerald-400 to-sky-400 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-800/40 bg-red-950/30 px-3 py-2 text-[11px] text-red-200">
          <div className="flex flex-wrap items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{error.message}</p>
              {error.detail && <p className="mt-0.5 font-mono text-[9.5px] leading-5 text-red-300/80">{error.detail}</p>}
            </div>
            <div className="flex gap-1.5">
              {error.requiresAI && onOpenAISettings && (
                <button onClick={onOpenAISettings} className="btn h-6 border-amber-500/40 bg-amber-500/10 px-2 text-[10px] text-amber-200">
                  <Settings2 className="h-3 w-3" /> تنظیم AI
                </button>
              )}
              <button onClick={() => setError(null)} className="icon-btn h-6 w-6" aria-label="بستن خطا">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* mobile pane switch */}
      <div className="flex shrink-0 items-center gap-0.5 border-b border-slate-800/70 bg-[#070d18] px-1 py-1 lg:hidden">
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setMobilePane(tab.key)}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[10px] ${
                mobilePane === tab.key ? 'bg-slate-800 text-white' : 'text-slate-500'
              }`}
            >
              <Icon className="h-3 w-3" /> {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span className="font-mono text-[8px] text-slate-500">{tab.count.toLocaleString('fa-IR')}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* desktop 3-pane */}
      <div className="hidden min-h-0 flex-1 lg:flex" onPointerMove={onDragMove} onPointerUp={endDrag} onPointerLeave={endDrag}>
        {layout.explorerOpen && (
          <>
            <aside className="min-h-0 shrink-0 border-s border-slate-800/70 bg-[#070d18]" style={{ width: layout.explorer }}>
              {renderExplorer()}
            </aside>
            <div
              className="resize-handle"
              data-dragging={dragRef.current?.kind === 'explorer'}
              onPointerDown={startDrag('explorer')}
              role="separator"
              aria-orientation="vertical"
              aria-label="تغییر عرض اکسپلورر"
            />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">{renderEditor()}</div>
          {layout.terminalOpen && (
            <WorkspaceTerminal
              result={testResult}
              running={testRunning}
              logs={agentLogs.map((entry) => `${new Date(entry.at).toLocaleTimeString('fa-IR')} · ${entry.message}`)}
              height={layout.terminal}
              onHeightChange={(height) => setLayout((current) => ({ ...current, terminal: height }))}
              onClearLogs={() => setAgentLogs([])}
              onRunTests={() => void runTests()}
              canRun={stats.files > 0}
              onOpenSettings={onOpenAISettings}
            />
          )}
          {!layout.terminalOpen && (
            <button
              onClick={() => setLayout((current) => ({ ...current, terminalOpen: true }))}
              className="flex h-6 shrink-0 items-center gap-1 border-t border-slate-800/70 bg-[#060b13] px-2 text-[9.5px] text-slate-500 hover:text-slate-300"
            >
              <TerminalSquare className="h-3 w-3" /> باز کردن ترمینال (Ctrl+J)
            </button>
          )}
        </div>

        {layout.inspectorOpen && (
          <>
            <div
              className="resize-handle"
              data-dragging={dragRef.current?.kind === 'inspector'}
              onPointerDown={startDrag('inspector')}
              role="separator"
              aria-orientation="vertical"
              aria-label="تغییر عرض پنل ابزار"
            />
            <aside className="min-h-0 shrink-0 border-e border-slate-800/70" style={{ width: layout.inspector }}>
              <WorkspaceInspector
                job={job}
                files={files}
                plan={plan}
                logs={agentLogs}
                warnings={warnings}
                meta={meta}
                testResult={testResult}
                testRunning={testRunning}
                generating={running}
                dirtyCount={dirtyCount}
                githubToken={githubToken}
                onRepoCreated={(url) => onUpdateJobRepoUrl(job.id, url)}
                onOpenAISettings={onOpenAISettings}
                onRunTests={() => void runTests()}
                onOpenFile={(path) => openFile(path)}
                onGenerate={() => void generate(instructions)}
              />
            </aside>
          </>
        )}
      </div>

      {/* mobile panes */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        {mobilePane === 'files' && <div className="min-h-0 flex-1 overflow-hidden">{renderExplorer(true)}</div>}
        {mobilePane === 'code' && <div className="min-h-0 flex-1">{renderEditor()}</div>}
        {mobilePane === 'tools' && (
          <div className="min-h-0 flex-1 overflow-hidden">
            <WorkspaceInspector
              job={job}
              files={files}
              plan={plan}
              logs={agentLogs}
              warnings={warnings}
              meta={meta}
              testResult={testResult}
              testRunning={testRunning}
              generating={running}
              dirtyCount={dirtyCount}
              githubToken={githubToken}
              onRepoCreated={(url) => onUpdateJobRepoUrl(job.id, url)}
              onOpenAISettings={onOpenAISettings}
              onRunTests={() => void runTests()}
              onOpenFile={(path) => openFile(path)}
              onGenerate={() => void generate(instructions)}
            />
          </div>
        )}
        {mobilePane === 'terminal' && (
          <div className="flex min-h-0 flex-1 flex-col">
            <WorkspaceTerminal
              result={testResult}
              running={testRunning}
              logs={agentLogs.map((entry) => `${new Date(entry.at).toLocaleTimeString('fa-IR')} · ${entry.message}`)}
              height={Math.max(320, layout.terminal)}
              onHeightChange={(height) => setLayout((current) => ({ ...current, terminal: height }))}
              onClearLogs={() => setAgentLogs([])}
              onRunTests={() => void runTests()}
              canRun={stats.files > 0}
              onOpenSettings={onOpenAISettings}
            />
          </div>
        )}
      </div>

      {/* quick open */}
      {showQuickOpen && (
        <div className="fixed inset-0 z-[75] flex items-start justify-center bg-slate-950/60 px-4 pt-[14vh] backdrop-blur-sm" onClick={() => setShowQuickOpen(false)}>
          <div
            className="animate-scale-in w-full max-w-md overflow-hidden rounded-xl border border-slate-700/70 bg-slate-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-slate-800 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-slate-500" />
              <input
                autoFocus
                value={quickQuery}
                onChange={(event) => setQuickQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && quickResults[0]) {
                    openFile(quickResults[0]);
                    setShowQuickOpen(false);
                  }
                  if (event.key === 'Escape') setShowQuickOpen(false);
                }}
                placeholder="نام فایل را بنویسید…"
                className="flex-1 bg-transparent text-[12px] text-slate-100 placeholder-slate-500 focus:outline-none"
              />
              <kbd className="kbd">ESC</kbd>
            </div>
            <div className="max-h-[42vh] overflow-y-auto p-1">
              {quickResults.length === 0 ? (
                <p className="px-3 py-6 text-center text-[11px] text-slate-500">فایلی مطابق این نام نیست.</p>
              ) : (
                quickResults.map((path) => (
                  <button
                    key={path}
                    onClick={() => {
                      openFile(path);
                      setShowQuickOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] text-slate-300 hover:bg-slate-800/70"
                    dir="ltr"
                  >
                    <FilePlus2 className="h-3 w-3 shrink-0 text-slate-600" />
                    <span className="truncate">{path}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* regenerate prompt */}
      <PromptDialog
        open={regenerateOpen}
        title="تولید مجدد سورس"
        description="فایل‌های فعلی با خروجی تازه‌ی ایجنت جایگزین می‌شوند. اگر تغییر ذخیره‌نشده دارید، اول ذخیره کنید. می‌توانید دستور اصلاح هم بنویسید (اختیاری)."
        label="دستور اصلاح (اختیاری)"
        initialValue={instructions}
        confirmLabel="تولید مجدد"
        onCancel={() => setRegenerateOpen(false)}
        onConfirm={(value) => {
          setRegenerateOpen(false);
          setInstructions(value);
          void generate(value);
        }}
      />

      {/* rename */}
      <PromptDialog
        open={Boolean(renameTarget)}
        title="تغییر نام فایل"
        description="مسیر کامل را وارد کنید؛ پوشه‌های تازه هم ساخته می‌شوند."
        label="مسیر جدید"
        initialValue={renameTarget ?? ''}
        validate={(value) => {
          if (!isValidFilePath(value)) return 'مسیر نامعتبر است. مثال: src/utils/helpers.py';
          if (value !== renameTarget && files[value] !== undefined) return 'فایلی با این مسیر از قبل وجود دارد.';
          if (renameTarget && value === renameTarget) return 'مسیر جدید با مسیر فعلی یکسان است.';
          return null;
        }}
        onCancel={() => setRenameTarget(null)}
        onConfirm={(value) => {
          if (renameTarget) renameFile(renameTarget, value);
          setRenameTarget(null);
        }}
      />

      {/* delete */}
      <PromptDialog
        open={Boolean(deleteTarget)}
        title="حذف فایل"
        description={`«${deleteTarget ?? ''}» از پروژه حذف می‌شود. این عمل با «ذخیره» نهایی می‌شود؛ برای بازگرداندن می‌توانید دوباره تولید کنید.`}
        label="برای تأیید، نام فایل را بنویسید"
        initialValue=""
        tone="danger"
        confirmLabel="حذف کن"
        validate={(value) => {
          const name = (deleteTarget ?? '').split('/').pop();
          return value === name || value === deleteTarget ? null : `نام فایل «${name}» را دقیقاً بنویسید.`;
        }}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) deleteFile(deleteTarget);
          setDeleteTarget(null);
        }}
      />

      {/* new file */}
      <PromptDialog
        open={newFileFolder !== null}
        title="فایل جدید"
        description="مسیر می‌تواند پوشه هم داشته باشد؛ مثلاً src/utils/helpers.py یا docs/README.md"
        label="مسیر فایل"
        initialValue={uniquePath(files, newFileFolder ?? '', 'main.py')}
        confirmLabel="ساخت فایل"
        validate={(value) => {
          if (!isValidFilePath(value)) return 'مسیر نامعتبر است. مثال: src/main.py';
          if (files[value] !== undefined) return 'فایلی با این مسیر از قبل وجود دارد.';
          return null;
        }}
        onCancel={() => setNewFileFolder(null)}
        onConfirm={(value) => {
          createFile(value);
          setNewFileFolder(null);
        }}
      />
    </div>
  );
};

export default CodeWorkspace;
