// SPEC-008 tests — engine, config store, AI tasks, code runner.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  chat,
  chatStream,
  LLMError,
  clearModelCache,
  parseJsonLoose,
  type ChatTarget,
} from './aiEngine';
import {
  aiStatus,
  loadAIConfig,
  publicAIConfig,
  saveAIConfig,
  validateConfigDraft,
  type LoadedAIConfig,
} from './aiConfig';
import {
  analyzeJob,
  categorizeJobAI,
  critiqueProposal,
  generateSolution,
  sanitizeSolutionFiles,
  writeProposalStream,
} from './aiTasks';
import { planTests, runGeneratedTests } from './codeRunner';
import { defaultAIConfig, MASKED_KEY, normalizeBaseUrl, type AIConnection } from '../shared/aiProviders';

type Handler = (body: any, req: http.IncomingMessage, res: http.ServerResponse) => void;

async function mockProvider(handler: Handler) {
  const hits: { body: any; headers: http.IncomingHttpHeaders; url: string }[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      hits.push({ body, headers: req.headers, url: req.url ?? '' });
      handler(body, req, res);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  return {
    url: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

const sendJson = (res: http.ServerResponse, body: unknown, status = 200) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};

const completion = (content: string, model = 'test-model') => ({
  id: 'cmpl-1',
  model,
  choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
});

const sendCompletion = (res: http.ServerResponse, content: string, model = 'test-model') => sendJson(res, completion(content, model));

const cacheDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'konk-ai-'));
let uniqueCounter = 0;
const unique = (label: string) => `${label}-${Date.now()}-${++uniqueCounter}`;

function testTarget(url: string, extra: Partial<ChatTarget> = {}): ChatTarget {
  return {
    id: 'test-conn',
    kind: 'openai',
    label: 'Mock OpenAI',
    baseUrl: url,
    apiKey: 'sk-test-key',
    models: { fast: 'mock-fast-mini', strong: 'mock-strong-pro' },
    jsonMode: true,
    temperature: 0.2,
    timeoutMs: 4_000,
    cacheDir: cacheDir(),
    cacheTtlMs: 60_000,
    ...extra,
  };
}

function loadedWith(url: string, extra: Partial<AIConnection> = {}): LoadedAIConfig {
  const connection: AIConnection = {
    id: 'ui-1',
    label: 'Mock',
    kind: 'openai',
    baseUrl: url,
    apiKey: 'sk-test-key',
    modelFast: 'mock-fast-mini',
    modelStrong: 'mock-strong-pro',
    enabled: true,
    jsonMode: true,
    origin: 'ui',
    ...extra,
  };
  return {
    config: { ...defaultAIConfig(), connections: [connection], activeId: connection.id, temperature: 0.2 },
    source: 'file',
    filePath: '/tmp/none',
  };
}

/* ------------------------------------------------------------------ */
/* engine                                                              */
/* ------------------------------------------------------------------ */

test('chat: sends auth/model/messages and returns text + usage metadata', async () => {
  const provider = await mockProvider((_body, _req, res) => sendCompletion(res, '{"ok":true}', 'gpt-test'));
  try {
    const result = await chat(
      { messages: [{ role: 'user', content: 'سلام' }], json: true, modelTier: 'strong' },
      testTarget(provider.url),
    );
    assert.equal(result.text, '{"ok":true}');
    assert.equal(result.meta.model, 'gpt-test');
    assert.equal(result.meta.usage?.totalTokens, 20);
    assert.equal(provider.hits[0].headers.authorization, 'Bearer sk-test-key');
    assert.equal(provider.hits[0].body.model, 'mock-strong-pro');
    assert.deepEqual(provider.hits[0].body.response_format, { type: 'json_object' });
  } finally {
    await provider.close();
  }
});

test('chat: fast/strong tier routing uses the configured models', async () => {
  const provider = await mockProvider((_body, _req, res) => sendCompletion(res, 'ok'));
  try {
    await chat({ messages: [{ role: 'user', content: 'a' }], modelTier: 'fast' }, testTarget(provider.url));
    await chat({ messages: [{ role: 'user', content: 'b' }], modelTier: 'strong' }, testTarget(provider.url));
    assert.equal(provider.hits[0].body.model, 'mock-fast-mini');
    assert.equal(provider.hits[1].body.model, 'mock-strong-pro');
  } finally {
    await provider.close();
  }
});

test('chat: discovers models when none configured and picks a chat model', async () => {
  clearModelCache();
  const provider = await mockProvider((_body, req, res) => {
    if (req.url?.includes('/models')) {
      return sendJson(res, { data: [{ id: 'text-embedding-3-small' }, { id: 'gpt-4o-mini' }, { id: 'gpt-4o' }] });
    }
    sendCompletion(res, 'picked');
  });
  try {
    const result = await chat(
      { messages: [{ role: 'user', content: 'x' }] },
      testTarget(provider.url, { models: { fast: '', strong: '' } }),
    );
    assert.equal(result.text, 'picked');
    const chatHit = provider.hits.find((hit) => !JSON.stringify(hit.body).includes('embedding') && hit.body?.messages);
    assert.equal(chatHit?.body.model, 'gpt-4o');
  } finally {
    await provider.close();
  }
});

test('chat: 429 is retried once (Retry-After) then succeeds', async () => {
  let calls = 0;
  const provider = await mockProvider((_body, _req, res) => {
    calls++;
    if (calls === 1) {
      res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '0' });
      return res.end(JSON.stringify({ error: { message: 'rate limited' } }));
    }
    sendCompletion(res, 'after-retry');
  });
  try {
    const result = await chat({ messages: [{ role: 'user', content: 'x' }] }, testTarget(provider.url));
    assert.equal(result.text, 'after-retry');
    assert.equal(provider.hits.length, 2);
    assert.equal(result.meta.attempts, 2);
  } finally {
    await provider.close();
  }
});

test('chat: 400 about response_format retries without it (compatibility)', async () => {
  let calls = 0;
  const provider = await mockProvider((_body, _req, res) => {
    calls++;
    if (calls === 1) {
      return sendJson(res, { error: { message: 'response_format is not supported by this model' } }, 400);
    }
    sendCompletion(res, '{"ok":1}');
  });
  try {
    const result = await chat({ messages: [{ role: 'user', content: 'x' }], json: true }, testTarget(provider.url));
    assert.equal(result.text, '{"ok":1}');
    assert.equal(provider.hits.length, 2);
    assert.equal(provider.hits[1].body.response_format, undefined);
  } finally {
    await provider.close();
  }
});

test('chat: gateway base without a version gets the /v1 prefix', async () => {
  const provider = await mockProvider((_body, _req, res) => sendCompletion(res, 'ok'));
  try {
    const target = testTarget(provider.url, { gateway: true, kind: 'gateway' });
    const result = await chat(
      { messages: [{ role: 'user', content: 'hello' }], taskType: 'general' },
      target,
    );
    assert.equal(result.text, 'ok');
    assert.equal(provider.hits[0].url, '/v1/chat/completions');
    assert.equal(provider.hits[0].body.taskType, 'general');
    assert.equal(provider.hits[0].body.privacy, 'any');
  } finally {
    await provider.close();
  }
});

test('chat: mock:* answer is rejected as AI_UNAVAILABLE (gateway guard)', async () => {
  const provider = await mockProvider((_body, _req, res) => sendCompletion(res, 'offline simulator', 'mock:atlas-70b'));
  try {
    await assert.rejects(
      chat({ messages: [{ role: 'user', content: 'x' }] }, testTarget(provider.url, { gateway: true })),
      (error: any) => error instanceof LLMError && error.code === 'AI_UNAVAILABLE',
    );
  } finally {
    await provider.close();
  }
});

test('chat: cacheKey serves the second call from disk', async () => {
  const provider = await mockProvider((_body, _req, res) => sendCompletion(res, 'cached-answer'));
  const target = testTarget(provider.url);
  try {
    const first = await chat({ messages: [{ role: 'user', content: 'x' }], cacheKey: 'job-42' }, target);
    const second = await chat({ messages: [{ role: 'user', content: 'x' }], cacheKey: 'job-42' }, target);
    assert.equal(first.meta.cached, false);
    assert.equal(second.meta.cached, true);
    assert.equal(provider.hits.length, 1);
  } finally {
    await provider.close();
  }
});

test('chat: 401 maps to AI_AUTH without a second call', async () => {
  const provider = await mockProvider((_body, _req, res) => sendJson(res, { error: { message: 'bad key' } }, 401));
  try {
    await assert.rejects(chat({ messages: [{ role: 'user', content: 'x' }] }, testTarget(provider.url)), (error: any) => {
      assert.equal(error.code, 'AI_AUTH');
      return true;
    });
    assert.equal(provider.hits.length, 1);
  } finally {
    await provider.close();
  }
});

test('chatStream: emits real deltas and marks streamed metadata', async () => {
  const provider = await mockProvider((_body, _req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    for (const part of ['سلام', ' ', 'دنیا']) {
      res.write(`data: ${JSON.stringify({ model: 'stream-model', choices: [{ delta: { content: part } }] })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ model: 'stream-model', usage: { total_tokens: 7 } })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
  const deltas: string[] = [];
  try {
    const result = await chatStream({ messages: [{ role: 'user', content: 'x' }] }, testTarget(provider.url), (delta) =>
      deltas.push(delta),
    );
    assert.equal(result.text, 'سلام دنیا');
    assert.deepEqual(deltas, ['سلام', ' ', 'دنیا']);
    assert.equal(result.meta.streamed, true);
    assert.equal(result.meta.model, 'stream-model');
    assert.equal(result.meta.usage?.totalTokens, 7);
  } finally {
    await provider.close();
  }
});

test('chatStream: falls back to a complete JSON answer when provider ignores stream', async () => {
  const provider = await mockProvider((_body, _req, res) => sendCompletion(res, 'one-shot answer'));
  const deltas: string[] = [];
  try {
    const result = await chatStream({ messages: [{ role: 'user', content: 'x' }] }, testTarget(provider.url), (delta) =>
      deltas.push(delta),
    );
    assert.equal(result.text, 'one-shot answer');
    assert.equal(result.meta.streamed, false);
    assert.deepEqual(deltas, ['one-shot answer']);
  } finally {
    await provider.close();
  }
});

test('parseJsonLoose: fences, prose and arrays', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonLoose('نتیجه: {"a":2} است'), { a: 2 });
  assert.deepEqual(parseJsonLoose('[{"a":3}]'), [{ a: 3 }]);
  assert.equal(parseJsonLoose('not json'), null);
});

/* ------------------------------------------------------------------ */
/* tasks                                                               */
/* ------------------------------------------------------------------ */

test('analyzeJob: returns validated analysis and keeps unknown fields null', async () => {
  const provider = await mockProvider((_body, _req, res) =>
    sendCompletion(
      res,
      JSON.stringify({
        automatabilityScore: 88,
        matchScore: 71,
        recommendedBid: 4200000,
        suggestedDuration: '۶ ساعت',
        technicalStack: ['Python', 'FastAPI'],
        feasibilityReason: 'مسیر مشخص است.',
        riskLevel: 'low',
        winProbability: '۷۴٪',
        suggestedKicker: 'به فایل CSV اشاره کن.',
        matchReason: 'با مهارت من می‌خواند.',
        redFlags: ['داده‌ی ناقص'],
        nextSteps: ['درخواست نمونه فایل'],
        caveats: [],
      }),
    ),
  );
  try {
    const result = await analyzeJob(loadedWith(provider.url), {
      title: unique('اتوماسیون اکسل'),
      description: unique('یک اسکریپت پایتون برای پاکسازی فایل اکسل می‌خواهم.'),
      budget: 5000000,
    });
    assert.equal(result.analysis.automatabilityScore, 88);
    assert.equal(result.analysis.recommendedBid, 4200000);
    assert.equal(result.partial, false);
    assert.equal(provider.hits[0].body.response_format.type, 'json_object');
  } finally {
    await provider.close();
  }
});

test('analyzeJob: repairs invalid JSON output with a second request', async () => {
  let calls = 0;
  const provider = await mockProvider((_body, _req, res) => {
    calls++;
    if (calls === 1) return sendCompletion(res, 'متأسفم، JSON نیست');
    sendCompletion(res, JSON.stringify({ automatabilityScore: 60, feasibilityReason: 'قابل انجام است.' }));
  });
  try {
    const result = await analyzeJob(loadedWith(provider.url), { title: unique('x'), description: unique('y') });
    assert.equal(result.analysis.automatabilityScore, 60);
    assert.ok(result.warnings.some((warning) => warning.includes('ترمیم')));
    assert.equal(provider.hits.length, 2);
  } finally {
    await provider.close();
  }
});

test('analyzeJob: missing recommendedBid is null, not fabricated, and flagged', async () => {
  const provider = await mockProvider((_body, _req, res) =>
    sendCompletion(res, JSON.stringify({ automatabilityScore: 40, feasibilityReason: 'مبهم است.' })),
  );
  try {
    const result = await analyzeJob(loadedWith(provider.url), { title: unique('x'), description: unique('y') });
    assert.equal(result.analysis.recommendedBid, null);
    assert.ok(result.warnings.length > 0);
    assert.equal(result.partial, true);
  } finally {
    await provider.close();
  }
});

test('writeProposalStream: streams proposal text and uses profile', async () => {
  const provider = await mockProvider((_body, _req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ model: 'writer', choices: [{ delta: { content: 'سلام، ' } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ model: 'writer', choices: [{ delta: { content: 'پروژه را خواندم.' } }] })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  });
  const loaded = loadedWith(provider.url);
  loaded.config.profile = { ...loaded.config.profile, name: 'مهسا', skills: ['Python'] };
  try {
    let text = '';
    const result = await writeProposalStream(loaded, { title: 'ربات', description: 'توضیح کامل پروژه' }, (delta) => {
      text += delta;
    });
    assert.equal(text, 'سلام، پروژه را خواندم.');
    assert.equal(result.text, text);
    assert.match(JSON.stringify(provider.hits[0].body.messages), /مهسا/);
  } finally {
    await provider.close();
  }
});

test('critiqueProposal: validates score and improvements', async () => {
  const provider = await mockProvider((_body, _req, res) =>
    sendCompletion(
      res,
      JSON.stringify({ score: 64, verdict: 'قابل قبول', strengths: ['دقیق'], improvements: ['کوتاه‌تر کن'], rewrittenOpening: 'سلام' }),
    ),
  );
  try {
    const result = await critiqueProposal(loadedWith(provider.url), {
      proposal: 'متن پیشنهاد',
      job: { title: 'پروژه', description: 'توضیح' },
    });
    assert.equal(result.critique.score, 64);
    assert.deepEqual(result.critique.improvements, ['کوتاه‌تر کن']);
  } finally {
    await provider.close();
  }
});

test('categorizeJobAI: returns only a valid taxonomy key', async () => {
  const provider = await mockProvider((_body, _req, res) =>
    sendCompletion(res, JSON.stringify({ category: 'graphic', confidence: 0.91 })),
  );
  try {
    const result = await categorizeJobAI(loadedWith(provider.url), { title: unique('طراحی لوگو'), description: unique('لوگو فروشگاه') });
    assert.equal(result.category, 'graphic');
    assert.equal(result.confidence, 0.91);
  } finally {
    await provider.close();
  }
});

test('categorizeJobAI: invalid key falls back to null (rules apply upstream)', async () => {
  const provider = await mockProvider((_body, _req, res) => sendCompletion(res, JSON.stringify({ category: 'not-a-key' })));
  try {
    const result = await categorizeJobAI(loadedWith(provider.url), { title: unique('x'), description: unique('y') });
    assert.equal(result.category, null);
  } finally {
    await provider.close();
  }
});

test('generateSolution: agentic plan then per-file generation', async () => {
  const provider = await mockProvider((body, _req, res) => {
    const prompt = String(body?.messages?.at(-1)?.content ?? '');
    if (prompt.includes('نقشه‌ی فایل')) {
      return sendCompletion(
        res,
        JSON.stringify({
          projectName: 'csv-cleaner',
          stack: 'Python',
          summary: 'پاکسازی CSV',
          files: [
            { path: 'main.py', purpose: 'ورودی' },
            { path: 'test_main.py', purpose: 'تست' },
            { path: 'README.md', purpose: 'راهنما' },
          ],
          runInstructions: 'python3 -m pytest',
        }),
      );
    }
    if (prompt.includes('«test_main.py»')) {
      return sendCompletion(res, 'from main import ok\n\ndef test_ok():\n    assert ok() is True\n');
    }
    if (prompt.includes('«main.py»')) {
      return sendCompletion(res, '```python\ndef ok():\n    return True\n```');
    }
    return sendCompletion(res, '# راهنما');
  });
  try {
    const progress: string[] = [];
    const result = await generateSolution(
      loadedWith(provider.url),
      { title: 'CSV cleaner', description: 'پاکسازی فایل' },
      { onProgress: (event) => progress.push(event.stage) },
    );
    assert.deepEqual(Object.keys(result.files).sort(), ['README.md', 'main.py', 'test_main.py']);
    assert.match(result.files['main.py'], /def ok/);
    assert.ok(progress.includes('plan'));
    assert.ok(progress.includes('file-done'));
    assert.ok(progress.includes('done'));
  } finally {
    await provider.close();
  }
});

test('sanitizeSolutionFiles: rejects traversal and binary paths', () => {
  const result = sanitizeSolutionFiles({
    '../evil.py': 'x',
    '/etc/passwd': 'x',
    'ok/main.py': 'print(1)',
    'logo.png': 'binary',
  });
  assert.deepEqual(Object.keys(result.files), ['ok/main.py']);
  assert.equal(result.warnings.length, 3);
});

/* ------------------------------------------------------------------ */
/* config store                                                        */
/* ------------------------------------------------------------------ */

test('config: saves, masks keys, and keeps the old key when the mask is sent back', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konk-cfg-'));
  const env = { KONKLANCER_AI_CONFIG_FILE: path.join(dir, 'ai.json') } as NodeJS.ProcessEnv;
  const defaultConfig = defaultAIConfig();
  const connection: AIConnection = {
    id: 'ui-1',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-secret',
    modelFast: 'gpt-4o-mini',
    modelStrong: 'gpt-4o',
    enabled: true,
    jsonMode: true,
  };
  const saved = saveAIConfig({ ...defaultConfig, connections: [connection], activeId: 'ui-1' }, env);
  assert.equal(aiStatus(saved).configured, true);
  assert.equal(saved.config.connections[0].apiKey, 'sk-secret');

  const pub = publicAIConfig(saved);
  assert.equal(pub.connections[0].apiKey, MASKED_KEY);
  assert.equal(pub.connections[0].hasKey, true);

  const updated = saveAIConfig(
    {
      ...saved.config,
      connections: [{ ...pub.connections[0], apiKey: MASKED_KEY, label: 'OpenAI Pro' }],
      activeId: 'ui-1',
    },
    env,
  );
  assert.equal(updated.config.connections[0].apiKey, 'sk-secret');
  assert.equal(updated.config.connections[0].label, 'OpenAI Pro');
  const onDisk = JSON.parse(fs.readFileSync(env.KONKLANCER_AI_CONFIG_FILE!, 'utf8'));
  assert.equal(onDisk.connections[0].apiKey, 'sk-secret');
  assert.equal(onDisk.connections[0].hasKey, undefined);
});

test('config: env gateway key is discovered and marked read-only origin', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konk-cfg-'));
  const env = {
    KONKLANCER_AI_CONFIG_FILE: path.join(dir, 'ai.json'),
    KONKRED_GATEWAY_URL: 'http://localhost:4000',
    KONKRED_API_KEY: 'gateway-key',
  } as NodeJS.ProcessEnv;
  const loaded = loadAIConfig(env);
  assert.equal(loaded.source, 'env');
  assert.equal(loaded.config.connections[0].origin, 'env');
  assert.equal(aiStatus(loaded).configured, true);
  assert.equal(publicAIConfig(loaded).connections[0].hasKey, true);
});

/* ------------------------------------------------------------------ */
/* code runner                                                         */
/* ------------------------------------------------------------------ */

test('codeRunner: plans pytest/unittest for python tests', async () => {
  const plan = await planTests({ 'test_main.py': 'def test_x():\n    assert 1 == 1\n' }, 'python3');
  assert.ok('runner' in plan);
  assert.equal(['pytest', 'unittest', 'python-runner'].includes(plan.runner), true);
});

test('codeRunner: runs a passing python test for real', async () => {
  const result = await runGeneratedTests({
    'main.py': 'def add(a, b):\n    return a + b\n',
    'test_main.py': 'from main import add\n\ndef test_add():\n    assert add(2, 3) == 5\n',
  });
  assert.equal(result.ok, true);
  assert.equal(result.exitCode, 0);
  assert.match(`${result.stdout}${result.stderr}`, /passed|OK/i);
});

test('codeRunner: reports a failing test honestly', async () => {
  const result = await runGeneratedTests({
    'main.py': 'def add(a, b):\n    return a - b\n',
    'test_main.py': 'from main import add\n\ndef test_add():\n    assert add(2, 3) == 5\n',
  });
  assert.equal(result.ok, false);
  assert.notEqual(result.exitCode, 0);
});

test('codeRunner: no test file gives a clear error, not a fake pass', async () => {
  const result = await runGeneratedTests({ 'main.py': 'print("hi")\n' });
  assert.equal(result.ok, false);
  assert.match(String(result.error), /تست/);
});

/* ------------------------------------------------------------------ */
/* SPEC-008 — hardening                                                */
/* ------------------------------------------------------------------ */

test('config: validateConfigDraft rejects a bad URL/key instead of silently dropping the row', () => {
  const bad = validateConfigDraft({
    connections: [{ kind: 'openai', baseUrl: 'ftp://nope' } as any],
  });
  assert.match(bad ?? '', /http/);

  const noKey = validateConfigDraft({
    connections: [{ kind: 'openai', baseUrl: 'https://api.openai.com/v1' } as any],
  });
  assert.match(noKey ?? '', /کلید/);

  const ok = validateConfigDraft({
    connections: [{ kind: 'openai', baseUrl: 'https://api.openai.com/v1', apiKey: 'sk-live' } as any],
  });
  assert.equal(ok, null);

  const local = validateConfigDraft({
    connections: [{ kind: 'ollama', baseUrl: 'http://localhost:11434/v1' } as any],
  });
  assert.equal(local, null);
});

test('config: switching provider kind does not reuse the old provider key', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konk-cfg-'));
  const env = { KONKLANCER_AI_CONFIG_FILE: path.join(dir, 'ai.json') } as NodeJS.ProcessEnv;
  const base: AIConnection = {
    id: 'ui-1',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'sk-openai',
    modelFast: 'gpt-4o-mini',
    modelStrong: 'gpt-4o',
    enabled: true,
    jsonMode: true,
  };
  const saved = saveAIConfig({ ...defaultAIConfig(), connections: [base], activeId: base.id }, env);
  assert.equal(saved.config.connections[0].apiKey, 'sk-openai');

  const masked = publicAIConfig(saved).connections[0];
  const switched = saveAIConfig(
    {
      ...saved.config,
      connections: [
        { ...masked, kind: 'groq', baseUrl: 'https://api.groq.com/openai/v1', label: 'Groq' },
      ],
      activeId: base.id,
    },
    env,
  );
  assert.equal(switched.config.connections[0].kind, 'groq');
  assert.equal(switched.config.connections[0].apiKey, undefined);
});

test('config: public view reports the real config path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'konk-cfg-'));
  const file = path.join(dir, 'ai.json');
  const env = { KONKLANCER_AI_CONFIG_FILE: file } as NodeJS.ProcessEnv;
  const connection: AIConnection = {
    id: 'ui-1',
    label: 'Local',
    kind: 'ollama',
    baseUrl: 'http://localhost:11434/v1',
    modelFast: 'llama3.2',
    modelStrong: 'llama3.2',
    enabled: true,
    jsonMode: true,
  };
  const saved = saveAIConfig({ ...defaultAIConfig(), connections: [connection], activeId: connection.id }, env);
  const pub = publicAIConfig(saved) as any;
  assert.ok(String(pub.filePath).endsWith('ai.json'));
});

test('chat: an invalid reply is never cached (cacheValidate)', async () => {
  const provider = await mockProvider((_body, _req, res) => sendCompletion(res, 'not json at all'));
  try {
    const key = unique('cache-validate');
    const target = testTarget(provider.url);
    const validate = (text: string) => {
      try {
        JSON.parse(text);
        return true;
      } catch {
        return false;
      }
    };
    const request = {
      messages: [{ role: 'user' as const, content: 'hello' }],
      cacheKey: key,
      cacheValidate: validate,
    };
    await chat(request, target);
    await chat({ ...request, cacheValidate: validate }, target);
    assert.equal(provider.hits.length, 2, 'خراب‌ترین پاسخ نباید کش شود');
  } finally {
    await provider.close();
  }
});

test('chat: retries without max_tokens when the provider rejects the parameter', async () => {
  const provider = await mockProvider((body, _req, res) => {
    if (body.max_tokens) return sendJson(res, { error: { message: 'Unsupported parameter: max_tokens' } }, 400);
    sendCompletion(res, 'ok-without-max-tokens');
  });
  try {
    const result = await chat(
      { messages: [{ role: 'user', content: 'hello' }], maxTokens: 128 },
      testTarget(provider.url),
    );
    assert.equal(result.text, 'ok-without-max-tokens');
    assert.equal(provider.hits.length, 2);
    assert.equal(provider.hits[0].body.max_tokens, 128);
    assert.equal(provider.hits[1].body.max_tokens, undefined);
  } finally {
    await provider.close();
  }
});

test('normalizeBaseUrl: strips trailing slashes and a pasted endpoint path', () => {
  assert.equal(normalizeBaseUrl('https://api.example.com/v1/'), 'https://api.example.com/v1');
  assert.equal(normalizeBaseUrl('https://api.example.com/v1/chat/completions'), 'https://api.example.com/v1');
  assert.equal(normalizeBaseUrl('  http://localhost:11434/v1  '), 'http://localhost:11434/v1');
});
