import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { LockKeyhole, LogOut } from 'lucide-react';
import { AUTH_EXPIRED, getApiToken, logout, setApiToken } from '../utils/api';

// The application (and its sockets/effects) mounts only after successful authentication.
export function PersonalAccess({ children }: { children: ReactNode }) {
  const [state, setState] = useState<'checking' | 'locked' | 'ready'>('checking');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const token = getApiToken();
    fetch('/api/jobs', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    }).then(res => {
      if (res.ok) setState('ready');
      else {
        if (res.status === 401) setApiToken('');
        else setError('سرور پاسخ مناسب نداد؛ دوباره تلاش کنید.');
        setState('locked');
      }
    }).catch(() => {
      if (!controller.signal.aborted) {
        setError('اتصال به سرور برقرار نشد؛ دوباره تلاش کنید.');
        setState('locked');
      }
    });
    const expire = () => { controller.abort(); setState('locked'); setPassword(''); };
    window.addEventListener(AUTH_EXPIRED, expire);
    return () => { controller.abort(); window.removeEventListener(AUTH_EXPIRED, expire); };
  }, []);

  async function unlock(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const token = password.trim();
      const res = await fetch('/api/jobs', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(res.status === 401 ? 'رمز ورود درست نیست.' : 'سرور در دسترس نیست؛ دوباره تلاش کنید.');
      setApiToken(token);
      setPassword('');
      setState('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ورود ناموفق بود.');
    } finally { setBusy(false); }
  }

  if (state === 'ready') return <>
    <div dir="rtl" className="flex items-center justify-between gap-4 border-b border-slate-800 bg-slate-900 px-5 py-2 text-xs text-slate-400">
      <span>فضای شخصی · اطلاعات ورود فقط در این تب نگه‌داری می‌شود</span>
      <button onClick={logout} className="flex items-center gap-2 text-slate-200 hover:text-emerald-400"><LogOut size={14} />قفل کردن</button>
    </div>
    {children}
  </>;

  return <main dir="rtl" className="min-h-screen flex items-center justify-center bg-slate-950 p-6">
    <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
      <LockKeyhole className="mb-6 text-emerald-400" size={32} />
      <p className="mb-2 text-sm text-emerald-400">Konklancer · نسخه شخصی</p>
      <h1 className="mb-3 text-2xl font-bold text-white">ورود به فضای کاری شما</h1>
      {state === 'checking' ? <p className="text-slate-400" role="status">در حال بررسی اتصال…</p> : <form onSubmit={unlock}>
        <p className="mb-6 text-sm leading-7 text-slate-400">برای دسترسی به پروژه‌ها و بک‌اند، رمز شخصی سرور را وارد کنید. این رمز، توکن گیت‌هاب یا کلید هوش مصنوعی نیست.</p>
        <label htmlFor="personal-password" className="mb-2 block text-sm text-slate-200">رمز ورود شخصی</label>
        <input id="personal-password" type="password" dir="ltr" autoComplete="current-password" required autoFocus value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-emerald-500" />
        {error && <p role="alert" className="mt-3 text-sm text-rose-400">{error}</p>}
        <button disabled={busy} type="submit" className="mt-5 w-full rounded-lg bg-emerald-500 py-3 font-bold text-slate-950 hover:bg-emerald-400 disabled:opacity-50">{busy ? 'در حال اتصال…' : 'ورود به برنامه'}</button>
      </form>}
    </section>
  </main>;
}
