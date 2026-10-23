import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Trash2,
  UserRound,
  Zap,
} from 'lucide-react';
import {
  MASKED_KEY,
  PROVIDER_LIST,
  providerPreset,
  validateConnectionDraft,
  type AIConfig,
  type AIConnection,
  type AIProfile,
  type AIProviderKind,
} from '../../shared/aiProviders';
import { isStandaloneMode } from '../utils/standaloneRuntime';
import {
  AIRequestError,
  fetchAIModels,
  getAIConfig,
  metaLabel,
  saveAIConfig,
  testAIConnectionRequest,
  type AIStatusPayload,
} from '../utils/aiClient';

interface AISettingsPanelProps {
  onChanged?: (status: AIStatusPayload) => void;
}

const emptyProfile: AIProfile = { name: '', headline: '', skills: [], portfolio: '', toneNotes: '' };

function Toggle({ value, onChange, label, hint }: { value: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="flex w-full items-start justify-between gap-3 text-right">
      <span>
        <span className="block text-xs font-medium text-slate-200">{label}</span>
        {hint && <span className="mt-0.5 block text-[11px] leading-relaxed text-slate-400">{hint}</span>}
      </span>
      <span className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${value ? 'bg-emerald-500' : 'bg-slate-700'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${value ? 'right-0.5' : 'right-[18px]'}`} />
      </span>
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="block text-[11px] font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="block text-[10px] leading-relaxed text-slate-500">{hint}</span>}
    </label>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:border-emerald-500/70 focus:outline-none';

export const AISettingsPanel: React.FC<AISettingsPanelProps> = ({ onChanged }) => {
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [status, setStatus] = useState<AIStatusPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [editing, setEditing] = useState<AIConnection | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<{ fast: string; strong: string } | null>(null);
  const [editorTest, setEditorTest] = useState<{ ok: boolean; message: string; latencyMs?: number } | null>(null);
  const [cardTest, setCardTest] = useState<Record<string, { ok: boolean; message: string; latencyMs?: number }>>({});
  const [expandedHelp, setExpandedHelp] = useState(false);

  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const applyLoaded = useCallback((data: { config: AIConfig; status: AIStatusPayload }) => {
    const normalizedConfig = { ...data.config, profile: { ...emptyProfile, ...(data.config.profile ?? {}) } };
    setConfig(normalizedConfig);
    setStatus(data.status);
    onChangedRef.current?.(data.status);
    if ((normalizedConfig.connections?.length ?? 0) === 0) {
      const first = PROVIDER_LIST[0];
      setEditing((current) =>
        current ?? {
          id: '',
          label: first.label,
          kind: first.kind,
          baseUrl: first.baseUrl,
          apiKey: '',
          modelFast: '',
          modelStrong: '',
          enabled: true,
          jsonMode: first.jsonMode,
        },
      );
      setIsNew(true);
    }
  }, []);

  const refresh = useCallback(async (isInitial = false) => {
    if (isInitial) {
      setLoading(true);
    } else {
      setBusy('refresh');
    }
    setLoadError(null);
    try {
      const data = await getAIConfig();
      applyLoaded(data);
    } catch (error: any) {
      setLoadError(error?.message ?? 'بارگذاری تنظیمات AI ناموفق بود.');
    } finally {
      setLoading(false);
      setBusy((curr) => (curr === 'refresh' ? null : curr));
    }
  }, [applyLoaded]);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

  const preset = editing ? providerPreset(editing.kind) : null;

  const startNew = () => {
    const first = PROVIDER_LIST[0];
    setEditing({
      id: '',
      label: first.label,
      kind: first.kind,
      baseUrl: first.baseUrl,
      apiKey: '',
      modelFast: '',
      modelStrong: '',
      enabled: true,
      jsonMode: first.jsonMode,
    });
    setIsNew(true);
    setModels([]);
    setRecommended(null);
    setEditorTest(null);
    setShowKey(false);
    setActionError(null);
  };

  const startEdit = (connection: AIConnection) => {
    setEditing({ ...connection, apiKey: '' });
    setIsNew(false);
    setModels([]);
    setRecommended(null);
    setEditorTest(null);
    setShowKey(false);
    setActionError(null);
  };

  const changeKind = (kind: AIProviderKind) => {
    const next = providerPreset(kind);
    setEditing((current) =>
      current
        ? {
            ...current,
            kind,
            label: next.label,
            baseUrl: next.baseUrl,
            jsonMode: next.jsonMode,
            apiKey: next.requiresKey ? current.apiKey : '',
            // کلید متعلق به provider قبلی است؛ برای kind جدید باید دوباره وارد شود.
            hasKey: current.kind === kind ? current.hasKey : false,
          }
        : current,
    );
    setModels([]);
    setRecommended(null);
    setEditorTest(null);
  };

  const editorBody = () => {
    if (!editing) return null;
    return {
      connection: { ...editing, apiKey: editing.apiKey && editing.apiKey !== MASKED_KEY ? editing.apiKey : undefined },
      connectionId: !isNew && editing.id ? editing.id : undefined,
    };
  };

  const handleFetchModels = async () => {
    const body = editorBody();
    if (!body || !editing) return;
    const invalid = validateConnectionDraft(editing);
    if (invalid) {
      setActionError(invalid);
      return;
    }
    setBusy('models');
    setActionError(null);
    try {
      const data = await fetchAIModels(body);
      setModels(data.models);
      setRecommended(data.recommended);
      setEditing((current) =>
        current
          ? {
              ...current,
              modelFast: current.modelFast || data.recommended.fast,
              modelStrong: current.modelStrong || data.recommended.strong,
            }
          : current,
      );
      setNotice(`${data.count.toLocaleString('fa-IR')} مدل پیدا شد؛ پیشنهاد خودکار اعمال شد.`);
    } catch (error: any) {
      setActionError(error?.message ?? 'دریافت مدل‌ها ناموفق بود.');
    } finally {
      setBusy(null);
    }
  };

  const handleTestDraft = async () => {
    const body = editorBody();
    if (!body || !editing) return;
    const invalid = validateConnectionDraft(editing);
    if (invalid) {
      setActionError(invalid);
      return;
    }
    setBusy('test');
    setActionError(null);
    setEditorTest(null);
    try {
      const data = await testAIConnectionRequest(body);
      setEditorTest({ ok: true, message: `${data.message}${data.model ? ` · ${data.model}` : ''}`, latencyMs: data.latencyMs });
      if (data.model) {
        setEditing((current) => (current ? { ...current, modelStrong: current.modelStrong || data.model! } : current));
      }
    } catch (error: any) {
      const payload = error instanceof AIRequestError ? error : null;
      setEditorTest({ ok: false, message: payload?.message ?? error?.message ?? 'اتصال ناموفق بود.' });
    } finally {
      setBusy(null);
    }
  };

  const patchConfig = (patch: Partial<AIConfig>) => setConfig((current) => (current ? { ...current, ...patch } : current));

  const persist = async (next: AIConfig, successMessage: string, busyKey: string) => {
    setBusy(busyKey);
    setActionError(null);
    try {
      const data = await saveAIConfig(next);
      applyLoaded(data);
      setNotice(successMessage);
      return true;
    } catch (error: any) {
      setActionError(error?.message ?? 'ذخیره‌ی تنظیمات ناموفق بود.');
      return false;
    } finally {
      setBusy(null);
    }
  };

  const saveConnection = async () => {
    if (!config || !editing) return;
    const invalid = validateConnectionDraft(editing);
    if (invalid) {
      setActionError(invalid);
      return;
    }
    const id = editing.id || (globalThis.crypto?.randomUUID?.() ?? `conn-${Date.now()}`);
    const connection: AIConnection = { ...editing, id, origin: 'ui' };
    const existingIndex = config.connections.findIndex((item) => item.id === id);
    const connections = [...config.connections];
    if (existingIndex >= 0) connections[existingIndex] = { ...connections[existingIndex], ...connection };
    else connections.push(connection);
    const next: AIConfig = { ...config, connections, activeId: isNew ? id : config.activeId || id };
    const ok = await persist(next, 'اتصال ذخیره شد. حالا یک تست بگیرید.', 'save-connection');
    if (ok) {
      setEditing(null);
      setIsNew(false);
      setModels([]);
      setEditorTest(null);
    }
  };

  const setActive = async (connection: AIConnection) => {
    if (!config) return;
    await persist({ ...config, activeId: connection.id }, `«${connection.label}» به‌عنوان provider فعال انتخاب شد.`, 'active');
  };

  const removeConnection = async (connection: AIConnection) => {
    if (!config) return;
    if (!window.confirm(`اتصال «${connection.label}» حذف شود؟`)) return;
    const connections = config.connections.filter((item) => item.id !== connection.id);
    const activeId = config.activeId === connection.id ? connections[0]?.id ?? null : config.activeId;
    await persist({ ...config, connections, activeId }, 'اتصال حذف شد.', 'delete');
  };

  const testSaved = async (connection: AIConnection) => {
    setBusy(`test-${connection.id}`);
    setActionError(null);
    try {
      const data = await testAIConnectionRequest({ connectionId: connection.id });
      setCardTest((current) => ({
        ...current,
        [connection.id]: { ok: true, message: `${data.message}${data.model ? ` · ${data.model}` : ''}`, latencyMs: data.latencyMs },
      }));
      void refresh();
    } catch (error: any) {
      setCardTest((current) => ({
        ...current,
        [connection.id]: { ok: false, message: error?.message ?? 'اتصال ناموفق بود.' },
      }));
    } finally {
      setBusy(null);
    }
  };

  const saveProfile = async () => {
    if (!config) return;
    await persist(config, 'پروفایل و تنظیمات ذخیره شد.', 'save-profile');
  };

  const updateProfile = (patch: Partial<AIProfile>) =>
    patchConfig({ profile: { ...(config?.profile ?? emptyProfile), ...patch } });

  const skillsText = useMemo(() => (config?.profile.skills ?? []).join('، '), [config?.profile.skills]);

  if (loading && !config) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
        <span>در حال خواندن تنظیمات هوش مصنوعی…</span>
      </div>
    );
  }

  if (loadError || !config) {
    return (
      <div className="space-y-3 rounded-xl border border-red-800/50 bg-red-950/20 p-5 text-xs text-red-200">
        <div className="flex items-center gap-2 font-bold">
          <AlertTriangle className="h-4 w-4" /> تنظیمات AI بارگذاری نشد.
        </div>
        <p>{loadError}</p>
        <button onClick={() => void refresh()} className="rounded-lg bg-slate-800 px-3 py-1.5 text-slate-200">
          تلاش مجدد
        </button>
      </div>
    );
  }

  const active = status?.provider ?? null;
  const statusColor = status?.configured ? 'emerald' : 'amber';

  return (
    <div className="space-y-5">
      {/* Status */}
      <div className={`rounded-xl border p-4 ${status?.configured ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/25 bg-amber-500/5'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className={`flex h-9 w-9 items-center justify-center rounded-lg border ${status?.configured ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' : 'border-amber-500/30 bg-amber-500/10 text-amber-400'}`}>
              {status?.configured ? <Zap className="h-4 w-4" /> : <KeyRound className="h-4 w-4" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <span>{status?.configured ? 'هوش مصنوعی آماده است' : 'هوش مصنوعی هنوز تنظیم نشده'}</span>
                <span className={`rounded border px-1.5 py-0.5 text-[10px] ${statusColor === 'emerald' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-amber-500/30 bg-amber-500/10 text-amber-300'}`}>
                  {status?.configured ? 'متصل' : 'نیاز به کلید'}
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                {status?.configured ? (
                  <>
                    provider فعال: <span className="text-slate-200">{active?.label}</span>
                    {' · '}مدل سریع: <span className="font-mono text-slate-200">{active?.modelFast || 'انتخاب خودکار'}</span>
                    {' · '}مدل قوی: <span className="font-mono text-slate-200">{active?.modelStrong || 'انتخاب خودکار'}</span>
                    {' · '}
                    منبع: {status.source === 'env' ? 'متغیرهای محیطی' : 'تنظیمات این برنامه'}
                  </>
                ) : (
                  'برای فعال‌شدن تحلیل، پروپوزال، دسته‌بندی، تولید کد و اجرای تست، یک provider اضافه کنید.'
                )}
              </p>
              {status?.warning && (
                <p className="flex items-center gap-1 text-[11px] text-amber-300">
                  <AlertTriangle className="h-3 w-3" /> {status.warning}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refresh()}
              disabled={busy === 'refresh'}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] text-slate-300 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> به‌روزرسانی
            </button>
            <button onClick={startNew} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400">
              <Plus className="h-3.5 w-3.5" /> افزودن provider
            </button>
          </div>
        </div>

        {active && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
            <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-slate-300">{active.baseUrl}</span>
            <span className="rounded bg-slate-900 px-2 py-0.5">{active.kindLabel}</span>
            <span className="rounded bg-slate-900 px-2 py-0.5">{active.gateway ? 'مسیریابی taskType در گیت‌وی' : 'API سازگار با OpenAI'}</span>
            {active.lastTest && (
              <span className={`rounded px-2 py-0.5 ${active.lastTest.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                آخرین تست: {active.lastTest.ok ? 'موفق' : 'ناموفق'}
                {typeof active.lastTest.latencyMs === 'number' ? ` · ${active.lastTest.latencyMs} ms` : ''}
              </span>
            )}
          </div>
        )}
      </div>

      {(notice || actionError) && (
        <div className={`flex items-start gap-2 rounded-lg border p-3 text-[11px] ${actionError ? 'border-red-800/50 bg-red-950/20 text-red-200' : 'border-emerald-800/40 bg-emerald-950/20 text-emerald-200'}`}>
          {actionError ? <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
          <span className="leading-relaxed">{actionError ?? notice}</span>
        </div>
      )}

      {/* Connections */}
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
            <Server className="h-3.5 w-3.5 text-sky-400" /> اتصال‌ها
          </h3>
          <span className="text-[10px] text-slate-500">{config.connections.length} اتصال · fallback {config.fallbackEnabled ? 'روشن' : 'خاموش'}</span>
        </div>

        {config.connections.length === 0 && (
          <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/[0.04] p-4">
            <p className="text-xs font-semibold text-slate-200">برای راه‌اندازی، این ۳ مرحله را انجام دهید:</p>
            <ol className="mt-2 grid gap-1 text-[11px] leading-5 text-slate-400 sm:grid-cols-3">
              <li><span className="text-emerald-300">۱.</span> سرویس هوش مصنوعی را انتخاب کنید.</li>
              <li><span className="text-emerald-300">۲.</span> کلید API همان سرویس را وارد کنید.</li>
              <li><span className="text-emerald-300">۳.</span> «تست اتصال» و بعد «ذخیره اتصال» را بزنید.</li>
            </ol>
            <p className="mt-2 text-[10px] leading-5 text-slate-500">کلید و سهمیه را سرویس‌دهنده‌ی انتخابی تعیین می‌کند؛ برنامه کلید یا پاسخ هوش مصنوعی را جعل نمی‌کند.</p>
          </div>
        )}

        <div className="space-y-2">
          {config.connections.map((connection) => {
            const isActive = config.activeId === connection.id || (!config.activeId && status?.provider?.id === connection.id);
            const presetInfo = providerPreset(connection.kind);
            const testResult = cardTest[connection.id] ?? (connection.lastTest ? { ok: connection.lastTest.ok, message: connection.lastTest.message ?? '', latencyMs: connection.lastTest.latencyMs } : null);
            return (
              <div key={connection.id} className={`rounded-xl border p-3 ${isActive ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800 bg-slate-900/40'}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <button type="button" onClick={() => void setActive(connection)} className="flex items-start gap-2 text-right">
                    <span className={`mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border ${isActive ? 'border-emerald-400 bg-emerald-400' : 'border-slate-600'}`}>
                      {isActive && <span className="h-1.5 w-1.5 rounded-full bg-slate-950" />}
                    </span>
                    <span>
                      <span className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-white">
                        {connection.label}
                        <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-normal text-slate-300">{presetInfo.label}</span>
                        {connection.origin === 'env' && <span className="rounded bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-normal text-sky-300">env</span>}
                        {!connection.enabled && <span className="rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-normal text-slate-300">غیرفعال</span>}
                        {presetInfo.local && <span className="rounded bg-indigo-500/10 px-1.5 py-0.5 text-[9px] font-normal text-indigo-300">محلی</span>}
                      </span>
                      <span className="mt-1 block font-mono text-[10px] text-slate-400">{connection.baseUrl}</span>
                      <span className="mt-0.5 block text-[10px] text-slate-400">
                        fast: <span className="font-mono text-slate-300">{connection.modelFast || 'خودکار'}</span> · strong:{' '}
                        <span className="font-mono text-slate-300">{connection.modelStrong || 'خودکار'}</span>
                        {connection.hasKey ? ' · کلید ذخیره شده' : presetInfo.requiresKey ? ' · بدون کلید' : ' · بدون نیاز به کلید'}
                      </span>
                    </span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => void testSaved(connection)}
                      disabled={busy === `test-${connection.id}`}
                      className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:text-white disabled:opacity-50"
                    >
                      {busy === `test-${connection.id}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <TestTube2 className="h-3 w-3" />} تست
                    </button>
                    {connection.origin !== 'env' && (
                      <>
                        <button onClick={() => startEdit(connection)} className="rounded-md border border-slate-700 bg-slate-900 p-1 text-slate-400 hover:text-white" title="ویرایش">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => void removeConnection(connection)} className="rounded-md border border-slate-700 bg-slate-900 p-1 text-slate-400 hover:text-red-300" title="حذف">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {testResult && (
                  <div className={`mt-2 rounded-md px-2 py-1 text-[10px] ${testResult.ok ? 'bg-emerald-500/10 text-emerald-300' : 'bg-red-500/10 text-red-300'}`}>
                    {testResult.ok ? '✓ ' : '✗ '}
                    {testResult.message || (testResult.ok ? 'اتصال موفق' : 'اتصال ناموفق')}
                    {testResult.latencyMs ? ` · ${testResult.latencyMs} ms` : ''}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Editor */}
      {editing && (
        <section className="space-y-4 rounded-xl border border-emerald-500/30 bg-slate-900/80 p-4 shadow-lg shadow-emerald-950/20">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
              <Cpu className="h-3.5 w-3.5 text-emerald-400" /> {isNew ? 'افزودن سریع سرویس هوش مصنوعی (Provider)' : `ویرایش «${editing.label}»`}
            </h3>
            <button onClick={() => setEditing(null)} className="text-[11px] text-slate-400 hover:text-white">
              بستن فرم
            </button>
          </div>

          {/* Visual Quick-Select Provider Cards */}
          <div className="space-y-1.5">
            <span className="block text-[11px] font-medium text-slate-300">۱. سرویس هوش مصنوعی خود را انتخاب کنید:</span>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-4">
              {PROVIDER_LIST.map((item) => {
                const selected = editing.kind === item.kind;
                return (
                  <button
                    key={item.kind}
                    type="button"
                    onClick={() => changeKind(item.kind)}
                    className={`flex flex-col items-start rounded-lg border px-2.5 py-2 text-right transition-all ${
                      selected
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-white shadow-sm'
                        : 'border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <span className="flex w-full items-center justify-between gap-1 text-[11px] font-bold">
                      <span className="truncate">{item.label.split(' ')[0]}</span>
                      {selected && <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />}
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-[9.5px] text-slate-400">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="نوع provider">
              <div className="relative">
                <select value={editing.kind} onChange={(event) => changeKind(event.target.value as AIProviderKind)} className={`${inputClass} appearance-none pl-8`}>
                  {PROVIDER_LIST.map((item) => (
                    <option key={item.kind} value={item.kind}>
                      {item.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
              </div>
            </Field>

            <Field label="نام نمایشی">
              <input value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} className={inputClass} placeholder="مثلاً Groq من" />
            </Field>

            <Field label="Base URL" hint="آدرس پایه‌ی سازگار با OpenAI (بدون /chat/completions).">
              <input value={editing.baseUrl} onChange={(event) => setEditing({ ...editing, baseUrl: event.target.value })} className={`${inputClass} font-mono dir-ltr text-left`} placeholder="https://api.openai.com/v1" />
            </Field>

            <Field
              label={preset?.requiresKey ? 'کلید API' : 'کلید API (اختیاری)'}
              hint={editing.hasKey
                ? 'کلید ذخیره شده است؛ برای تغییر، کلید تازه وارد کنید.'
                : isStandaloneMode()
                  ? 'در نسخه‌ی موبایل، کلید فقط در فضای خصوصی برنامه روی همین دستگاه ذخیره می‌شود.'
                  : 'کلید در پیکربندی محلی سرور ذخیره می‌شود و به مرورگر برنمی‌گردد.'}
            >
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={editing.apiKey ?? ''}
                  onChange={(event) => setEditing({ ...editing, apiKey: event.target.value })}
                  className={`${inputClass} pl-9 font-mono dir-ltr text-left`}
                  placeholder={editing.hasKey ? 'کلید ذخیره شده — برای تغییر وارد کنید' : preset?.local ? 'برای مدل محلی لازم نیست' : 'sk-…'}
                  autoComplete="off"
                />
                <button type="button" onClick={() => setShowKey((value) => !value)} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </Field>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[10px]">
            {preset?.keyUrl && (
              <a href={preset.keyUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-emerald-400 hover:underline">
                <KeyRound className="h-3 w-3" /> گرفتن کلید
              </a>
            )}
            {preset?.docsUrl && (
              <a href={preset.docsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-slate-400 hover:text-slate-200">
                <ExternalLink className="h-3 w-3" /> مستندات
              </a>
            )}
            <span className="text-slate-500">{preset?.hint}</span>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="مدل سریع (دسته‌بندی/استخراج)" hint="خالی = انتخاب خودکار از فهرست مدل‌ها">
              <input list="ai-model-options" value={editing.modelFast} onChange={(event) => setEditing({ ...editing, modelFast: event.target.value })} className={`${inputClass} font-mono dir-ltr text-left`} placeholder="auto" />
            </Field>
            <Field label="مدل قوی (تحلیل/پروپوزال/کد)" hint="خالی = انتخاب خودکار از فهرست مدل‌ها">
              <input list="ai-model-options" value={editing.modelStrong} onChange={(event) => setEditing({ ...editing, modelStrong: event.target.value })} className={`${inputClass} font-mono dir-ltr text-left`} placeholder="auto" />
            </Field>
            <datalist id="ai-model-options">
              {models.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => void handleFetchModels()}
              disabled={busy === 'models'}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200 hover:text-white disabled:opacity-50"
            >
              {busy === 'models' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              دریافت فهرست مدل‌ها
            </button>
            <button
              onClick={() => void handleTestDraft()}
              disabled={busy === 'test'}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-[11px] text-slate-200 hover:text-white disabled:opacity-50"
            >
              {busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <TestTube2 className="h-3.5 w-3.5" />}
              تست اتصال
            </button>
            <button onClick={() => void saveConnection()} disabled={busy === 'save-connection'} className="mr-auto flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-[11px] font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
              {busy === 'save-connection' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              ذخیره اتصال
            </button>
          </div>

          {recommended && (
            <p className="text-[10px] text-slate-500">
              پیشنهاد خودکار: fast=<span className="font-mono text-slate-300">{recommended.fast || '—'}</span> · strong=
              <span className="font-mono text-slate-300">{recommended.strong || '—'}</span>
            </p>
          )}

          {editorTest && (
            <div className={`rounded-lg px-3 py-2 text-[11px] ${editorTest.ok ? 'bg-emerald-500/10 text-emerald-200' : 'bg-red-500/10 text-red-200'}`}>
              {editorTest.ok ? '✓ ' : '✗ '}
              {editorTest.message}
              {editorTest.latencyMs ? ` · ${editorTest.latencyMs} ms` : ''}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Toggle value={editing.enabled} onChange={(value) => setEditing({ ...editing, enabled: value })} label="فعال" hint="اتصال‌های غیرفعال در چرخه‌ی fallback استفاده نمی‌شوند." />
            <Toggle value={editing.jsonMode} onChange={(value) => setEditing({ ...editing, jsonMode: value })} label="JSON mode" hint="در صورت پشتیبانی provider، خروجی ساختاریافته را دقیق‌تر می‌کند." />
          </div>
        </section>
      )}

      {/* Profile */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
          <UserRound className="h-3.5 w-3.5 text-amber-400" /> پروفایل من (در تحلیل، پروپوزال و کد استفاده می‌شود)
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="نام / برند">
            <input value={config.profile.name} onChange={(event) => updateProfile({ name: event.target.value })} className={inputClass} placeholder="مثلاً مهسا رضایی" />
          </Field>
          <Field label="عنوان حرفه‌ای">
            <input value={config.profile.headline} onChange={(event) => updateProfile({ headline: event.target.value })} className={inputClass} placeholder="برنامه‌نویس پایتون و اتوماسیون" />
          </Field>
          <Field label="مهارت‌ها (با ویرگول جدا کنید)">
            <input
              value={skillsText}
              onChange={(event) => updateProfile({ skills: event.target.value.split(/[,،]/).map((item) => item.trim()).filter(Boolean) })}
              className={inputClass}
              placeholder="Python، FastAPI، Pandas، طراحی لوگو"
            />
          </Field>
          <Field label="نرخ ساعتی هدف (تومان)">
            <input
              type="number"
              value={config.profile.hourlyRate ?? ''}
              onChange={(event) => updateProfile({ hourlyRate: Number(event.target.value) || undefined })}
              className={`${inputClass} font-mono tabular-nums`}
              placeholder="مثلاً 500000"
            />
          </Field>
        </div>
        <Field label="نمونه‌کار / اعتبار" hint="هر چیزی که به مدل کمک کند پیشنهاد واقعی‌تر بنویسد.">
          <textarea rows={3} value={config.profile.portfolio} onChange={(event) => updateProfile({ portfolio: event.target.value })} className={inputClass} placeholder="۲ پروژه‌ی مشابه، لینک گیت‌هاب، بازخورد کارفرما…" />
        </Field>
        <Field label="نکات لحن و ترجیح‌ها" hint="مثلاً «کوتاه بنویس»، «خودم را ارشد نشان نده»، «همیشه تست تحویل می‌دهم».">
          <textarea rows={2} value={config.profile.toneNotes} onChange={(event) => updateProfile({ toneNotes: event.target.value })} className={inputClass} />
        </Field>
      </section>

      {/* Advanced */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
        <h3 className="flex items-center gap-1.5 text-xs font-bold text-white">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> رفتار و کیفیت
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Toggle
            value={config.fallbackEnabled}
            onChange={(value) => patchConfig({ fallbackEnabled: value })}
            label="Fallback خودکار"
            hint="اگر provider فعال خطا داد، اتصال‌های سالم بعدی امتحان می‌شوند."
          />
          <Toggle
            value={config.allowCodeExecution}
            onChange={(value) => patchConfig({ allowCodeExecution: value })}
            label="اجرای تست کد تولیدشده"
            hint="تست‌ها در پوشه‌ی موقت و با مهلت اجرا می‌شوند؛ sandbox کامل نیست."
          />
          <Field label={`دمای مدل: ${config.temperature.toFixed(2)}`} hint="کمتر = دقیق‌تر و قابل‌تکرارتر، بیشتر = خلاق‌تر.">
            <input type="range" min={0} max={1} step={0.05} value={config.temperature} onChange={(event) => patchConfig({ temperature: Number(event.target.value) })} className="w-full accent-emerald-500" />
          </Field>
          <Field label="مهلت هر درخواست (ms)">
            <input type="number" min={5000} max={600000} step={5000} value={config.timeoutMs} onChange={(event) => patchConfig({ timeoutMs: Number(event.target.value) })} className={`${inputClass} font-mono tabular-nums`} />
          </Field>
          <Field label="عمر کش تحلیل (ساعت)" hint="صفر = بدون کش. تحلیل پروژه‌های تکراری رایگان می‌شود.">
            <input type="number" min={0} max={8760} value={config.cacheTtlHours} onChange={(event) => patchConfig({ cacheTtlHours: Number(event.target.value) })} className={`${inputClass} font-mono tabular-nums`} />
          </Field>
          <Field label="حریم خصوصی (گیت‌وی)" hint="private فقط providerهایی را استفاده می‌کند که روی داده آموزش نمی‌دهند.">
            <select value={config.privacy} onChange={(event) => patchConfig({ privacy: event.target.value as 'any' | 'private' })} className={inputClass}>
              <option value="any">any — هر provider</option>
              <option value="private">private — بدون آموزش روی داده</option>
            </select>
          </Field>
        </div>

        <button onClick={() => setExpandedHelp((value) => !value)} className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300">
          <ChevronDown className={`h-3 w-3 transition-transform ${expandedHelp ? 'rotate-180' : ''}`} /> این تنظیمات کجا ذخیره می‌شود؟
        </button>
        {expandedHelp && (
          <p className="rounded-lg bg-slate-950/60 p-3 text-[10px] leading-relaxed text-slate-400">
            {isStandaloneMode()
              ? 'در نسخه‌ی مستقل موبایل، تنظیمات provider و کلید API به‌صورت محلی در فضای خصوصی برنامه روی همین گوشی نگه‌داری می‌شود؛ برای استفاده از سرویس‌های آنلاین، اینترنت و کلید معتبر همان سرویس لازم است.'
              : <>کلیدها در فایل <span className="font-mono text-slate-300">data/ai-config.json</span> روی همان ماشینی که سرور را اجرا می‌کنید ذخیره می‌شوند (مجوز 0600) و در پاسخ‌های API ماسک می‌شوند. این فایل در <span className="font-mono">.gitignore</span> است. اگر فقط از متغیرهای محیطی استفاده می‌کنید، همان providerها به‌صورت env و فقط‌خواندنی نمایش داده می‌شوند.</>}
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3">
        <p className="flex items-center gap-1 text-[10px] text-slate-500">
          <Sparkles className="h-3 w-3 text-emerald-400" />
          همه‌ی امکانات AI همین‌جا پیکربندی می‌شوند؛ نیازی به ری‌استارت نیست.
        </p>
        <button onClick={() => void saveProfile()} disabled={busy === 'save-profile'} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">
          {busy === 'save-profile' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          ذخیره پروفایل و تنظیمات
        </button>
      </div>
    </div>
  );
};
