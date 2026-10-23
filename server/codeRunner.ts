/**
 * SPEC-008 — اجرای واقعی تست‌های کدِ تولیدشده.
 *
 * قبلاً دکمه‌ی «اجرای تست» یک لاگ ساختگی نشان می‌داد. این ماژول همان دکمه را واقعی می‌کند:
 * فایل‌ها در یک پوشه‌ی موقت نوشته می‌شوند، دستور تست مناسب (pytest/unittest/node --test)
 * با مهلت و سقف خروجی اجرا می‌شود و پوشه پاک می‌شود.
 *
 * محدودیت صادقانه: این اجرا sandbox امنیتی کامل نیست؛ فقط با کلیک خود کاربر و برای کدی که
 * خودش تولید کرده اجرا می‌شود. متغیرهای محیطی حساس حذف می‌شوند و مهلت/سقف خروجی اعمال می‌شود.
 */
import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { sanitizeSolutionFiles } from './aiTasks';

export interface RunResult {
  ok: boolean;
  command: string;
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  files: string[];
  note: string;
  error?: string;
}

export interface TestPlan {
  command: string;
  args: string[];
  runner: 'pytest' | 'unittest' | 'python-runner' | 'node-test';
}

const TEST_FILE = /(^|\/)(test_[^/]+\.py|[^/]+_test\.py|tests?\.py)$/i;
const NODE_TEST_FILE = /(^|\/)[^/]+\.test\.(?:c|m)?js$/i;

function hasPythonModule(python: string, module: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(python, ['-c', `import ${module}`], { timeout: 8_000, env: { PATH: process.env.PATH, HOME: os.tmpdir() } }, (error) => {
      resolve(!error);
    });
  });
}

/** انتخاب دستور تست بر پایه‌ی فایل‌های موجود. */
export async function planTests(files: Record<string, string>, python = process.env.KONKLANCER_PYTHON || 'python3'): Promise<TestPlan | { error: string }> {
  const paths = Object.keys(files);
  const hasPythonTests = paths.some((file) => TEST_FILE.test(file));
  if (hasPythonTests) {
    if (await hasPythonModule(python, 'pytest')) {
      return { command: python, args: ['-m', 'pytest', '-q', '--disable-warnings', '-p', 'no:cacheprovider'], runner: 'pytest' };
    }
    // بدون pytest، هم تست‌های سبک unittest و هم توابع test_* ساده را اجرا می‌کنیم
    // (pytest-style). اگر هیچ تستی پیدا نشود، خروجی غیرصفر می‌دهد — نه «سبز» جعلی.
    return { command: python, args: ['_konklancer_runner.py'], runner: 'python-runner' };
  }
  if (paths.some((file) => NODE_TEST_FILE.test(file))) {
    return { command: process.execPath, args: ['--test'], runner: 'node-test' };
  }
  if (paths.some((file) => file.endsWith('.py'))) {
    return {
      error:
        'فایل تست پایتون پیدا نشد. ایجنت باید فایلی مثل test_main.py بسازد؛ دوباره سورس را تولید کنید یا خودتان تست اضافه کنید.',
    };
  }
  if (paths.some((file) => /\.(?:c|m)?js$/.test(file))) {
    return {
      error:
        'فایل تست جاوااسکریپت پیدا نشد. فایلی مثل app.test.js لازم است (node --test).',
    };
  }
  return { error: 'هیچ فایل تست قابل اجرایی در پروژه نیست.' };
}

/**
 * اجراکننده‌ی سبک تست پایتون برای محیط‌هایی که pytest نصب نیست.
 * هم توابع `test_*` را صدا می‌زند و هم تست‌های unittest را کشف می‌کند.
 * اگر هیچ تستی پیدا نشود با کد ۲ خارج می‌شود تا «اجرای موفقِ خالی» گزارش نشود.
 */
const PYTHON_RUNNER = String.raw`import importlib.util
import pathlib
import sys
import traceback
import unittest

ROOT = pathlib.Path.cwd()
RUNNER_NAME = "_konklancer_runner.py"


def run_function_tests():
    total = 0
    passed = 0
    files = sorted(
        p for p in ROOT.rglob("*.py")
        if p.name != RUNNER_NAME and (p.name.startswith("test_") or p.name.endswith("_test.py"))
    )
    for file_path in files:
        rel = file_path.relative_to(ROOT)
        module_name = "konklancer_test_" + str(rel.with_suffix("")).replace("/", "_").replace("\\", "_")
        sys.path.insert(0, str(file_path.parent))
        spec = importlib.util.spec_from_file_location(module_name, file_path)
        module = importlib.util.module_from_spec(spec)
        try:
            spec.loader.exec_module(module)
        except Exception:
            total += 1
            print(f"FAIL import {rel}")
            traceback.print_exc()
            continue
        for attr in sorted(dir(module)):
            if not attr.startswith("test_"):
                continue
            fn = getattr(module, attr)
            if not callable(fn):
                continue
            total += 1
            try:
                fn()
                print(f"PASS {rel}::{attr}")
                passed += 1
            except Exception:
                print(f"FAIL {rel}::{attr}")
                traceback.print_exc()
    return total, passed


def run_unittest_tests():
    loader = unittest.TestLoader()
    suite = loader.discover(str(ROOT))
    count = suite.countTestCases()
    if count == 0:
        return 0, 0
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    return count, count - len(result.failures) - len(result.errors)


total, passed = run_function_tests()
u_total, u_passed = run_unittest_tests()
total += u_total
passed += u_passed
print(f"RAN {total} TESTS · PASSED {passed} · FAILED {total - passed}")
if total == 0:
    print("NO TESTS FOUND")
    sys.exit(2)
sys.exit(0 if passed == total else 1)
`;

function writeSafeFiles(root: string, files: Record<string, string>): string[] {
  const written: string[] = [];
  for (const [relative, content] of Object.entries(files)) {
    const clean = relative.replace(/^\.\//, '');
    const target = path.resolve(root, clean);
    if (!target.startsWith(root + path.sep) || clean.includes('..') || clean.startsWith('/')) continue;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, { mode: 0o600 });
    written.push(clean);
  }
  return written;
}

const OUTPUT_CAP = 48_000;

export async function runGeneratedTests(
  inputFiles: Record<string, string>,
  options: { timeoutMs?: number } = {},
): Promise<RunResult> {
  const started = Date.now();
  const sanitized = sanitizeSolutionFiles(inputFiles);
  const files = sanitized.files;
  const fileNames = Object.keys(files);
  const base: RunResult = {
    ok: false,
    command: '',
    exitCode: null,
    durationMs: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    files: fileNames,
    note: 'اجرای محلی در پوشه‌ی موقت؛ بدون اتصال شبکه و بدون sandbox کامل. فقط کد تولیدشده‌ی خودتان را اجرا کنید.',
  };
  if (fileNames.length === 0) {
    return { ...base, error: 'هیچ فایل معتبری برای اجرا وجود ندارد.' };
  }

  const python = process.env.KONKLANCER_PYTHON || 'python3';
  const plan = await planTests(files, python);
  if ('error' in plan) return { ...base, error: plan.error };

  const timeoutMs = Math.min(60_000, Math.max(2_000, options.timeoutMs ?? 25_000));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'konklancer-run-'));
  try {
    if (plan.runner === 'python-runner') files['_konklancer_runner.py'] = PYTHON_RUNNER;
    writeSafeFiles(root, files);
    const result = await new Promise<RunResult>((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let killedForOutput = false;
      const child = execFile(
        plan.command,
        plan.args,
        {
          cwd: root,
          timeout: timeoutMs,
          killSignal: 'SIGKILL',
          maxBuffer: 2 * 1024 * 1024,
          env: {
            PATH: process.env.PATH,
            HOME: root,
            TMPDIR: root,
            TEMP: root,
            TMP: root,
            LANG: 'C.UTF-8',
            LC_ALL: 'C.UTF-8',
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
            PYTHONDONTWRITEBYTECODE: '1',
            PYTHONPATH: root,
            NO_COLOR: '1',
            FORCE_COLOR: '0',
          },
        },
        (error: any) => {
          const exitCode = typeof error?.code === 'number' ? error.code : error ? null : 0;
          const timeoutFlag = Boolean(error?.killed || error?.signal === 'SIGKILL');
          resolve({
            ok: !error && !timedOut && !killedForOutput,
            command: [path.basename(plan.command), ...plan.args].join(' '),
            exitCode: timedOut ? null : exitCode,
            durationMs: Date.now() - started,
            stdout: stdout.slice(0, OUTPUT_CAP),
            stderr: stderr.slice(0, OUTPUT_CAP),
            timedOut: timedOut || timeoutFlag,
            files: fileNames,
            note: base.note,
          });
        },
      );

      const append = (chunks: string, next: string) => {
        if (chunks.length >= OUTPUT_CAP) {
          if (!killedForOutput) {
            killedForOutput = true;
            child.kill('SIGKILL');
          }
          return chunks;
        }
        return chunks + next;
      };

      child.stdout?.on('data', (chunk) => {
        stdout = append(stdout, String(chunk));
      });
      child.stderr?.on('data', (chunk) => {
        stderr = append(stderr, String(chunk));
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs + 500);
      child.on('close', () => clearTimeout(timer));
    });

    return { ...result, durationMs: Date.now() - started };
  } catch (error) {
    const message = (error as any)?.code === 'ENOENT'
      ? `مفسر پایتون پیدا نشد (${python}). KONKLANCER_PYTHON را تنظیم کنید یا python3 را نصب کنید.`
      : (error as Error)?.message ?? 'اجرا ناموفق بود.';
    return { ...base, command: [path.basename(plan.command), ...plan.args].join(' '), error: message };
  } finally {
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      /* پاک‌سازی بهترین‌تلاش */
    }
  }
}
