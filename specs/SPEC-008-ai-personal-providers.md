---
id: SPEC-008
title: AI providers configured in-app (personal use) — direct APIs + optional Konkred gateway
type: spec
status: APPROVED
version: 1.0.0
tags: [ai, llm, providers, streaming, honesty, personal]
depends_on: [SPEC-004, SPEC-006, SPEC-007]
supersedes: "SPEC-006 §3.1 R1/R2 and §6 (provider keys) — user decision 2026-10-20: AI must work without a separately-run gateway"
---

# SPEC-008 — AI providers configured in-app

## 1. Summary
`SPEC-006` assumed every model call goes through a separately deployed Konkred gateway and that
Konklancer stores **no** provider key. The owner asked (2026-10-20) that **every AI feature works for
personal use without running another service**, configured from inside the app.

This spec keeps SPEC-006's honesty rules (no fabricated output, mock guard, clear errors, caching)
and adds a first-class provider layer:

- 12 provider presets, all through the OpenAI-compatible `/chat/completions` contract;
- keys stored **server-side only** (`data/ai-config.json`, mode 0600, atomic write, gitignored);
- optional Konkred gateway preset kept, but no longer required;
- model discovery (`GET /models`) and a real connection test;
- streaming proposal/solution generation (SSE over POST), honest partial results, real test execution.

> وضعیت: **APPROVED** — مالک پروژه در تاریخ ۲۰۲۶-۱۰-۲۳ در چت این سند را با عبارت «تایید می‌کنم»
> تأیید کرد (پس از تحویل پیاده‌سازی و شواهد تست). از این نسخه به بعد، تغییر فقط با ADR یا `-v2` مجاز است.

## 2. Provider layer

### 2.1 Presets
`shared/aiProviders.ts` is the single source of presets (shared by server and browser):

| kind | base URL | key |
|---|---|---|
| `openai` | `https://api.openai.com/v1` | required |
| `openrouter` | `https://openrouter.ai/api/v1` | required |
| `groq` | `https://api.groq.com/openai/v1` | required |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai` | required |
| `deepseek` | `https://api.deepseek.com/v1` | required |
| `mistral` | `https://api.mistral.ai/v1` | required |
| `cerebras` | `https://api.cerebras.ai/v1` | required |
| `together` | `https://api.together.xyz/v1` | required |
| `ollama` | `http://localhost:11434/v1` | none |
| `lmstudio` | `http://localhost:1234/v1` | none |
| `gateway` | `http://localhost:4000` (Konkred) | required |
| `custom` | user-provided | optional |

`normalizeBaseUrl()` strips trailing slashes and a pasted `/chat/completions`, `/completions` or
`/models` suffix.

### 2.2 Storage
- R1. File: `KONKLANCER_AI_CONFIG_FILE` or `data/ai-config.json`; `mkdir 0700`, write `0600`,
  write-temp-then-rename. `data/` is gitignored.
- R2. Env fallback (read-only connections, merged into the same list):
  `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY`/`GOOGLE_API_KEY`,
  `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `CEREBRAS_API_KEY`, `TOGETHER_API_KEY`, `OLLAMA_BASE_URL`,
  `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL_FAST`/`AI_MODEL_STRONG`, and
  `KONKRED_GATEWAY_URL` + `KONKRED_API_KEY`.
- R3. The API never returns a real key. `apiKey` is replaced with `MASKED_KEY` and `hasKey: true`.
  Logs never print keys or prompt text.
- R4. Saving keeps the previous key when the browser echoes the mask or an empty string; switching
  `kind` never reuses the previous provider's key.
- R5. Validation is server-side: bad kind, non-`http(s)` base URL or a missing required key is a
  `400 AI_CONFIG_INVALID`; rows are never silently dropped.

## 3. HTTP surface

| method | path | contract |
|---|---|---|
| GET | `/api/ai/status` | `configured`, `source: file\|env\|none`, active provider, usable connections, profileReady, toggles |
| GET | `/api/ai/config` | full config (masked keys) + status + preset catalogue |
| PUT | `/api/ai/config` | validated save, returns config + status |
| POST | `/api/ai/models` | `{connectionId}` or `{connection}` → `models[]`, `recommended{fast,strong}` |
| POST | `/api/ai/test` | one minimal completion; returns latency/model/reply and stores `lastTest` |
| POST | `/api/categorize-job` | `{title, description}` → `{tag, source: ai\|rules, confidence, meta}` |
| POST | `/api/analyze-job` | flat job fields → analysis fields + `analysis`, `meta`, `partial`, `warnings` |
| POST | `/api/generate-proposal` | proposal + `proposedPrice(Formatted)` + `deliveryTime` + `meta` |
| POST | `/api/generate-proposal/stream` | SSE `start` → `delta{text}` → `done{proposal,meta}` / `error` |
| POST | `/api/critique-proposal` | `{proposal, job}` → `critique{score,verdict,strengths,improvements,rewrittenOpening}` |
| POST | `/api/generate-solution` | `{...job, instructions?}` → `{files, plan, warnings, meta}` |
| POST | `/api/generate-solution/stream` | SSE `start` → `progress{stage,message,path?,index?,total?}` → `done{files,plan,warnings,meta}` / `error` |
| POST | `/api/run-tests` | `{files, timeoutMs?}` → real execution result (see §5) |

- R6. JSON errors always carry `{success:false, code, error}`; AI-dependent errors add
  `requiresAIConfig` when the fix is "configure a provider". Codes:
  `AI_NOT_CONFIGURED` (503), `AI_AUTH` (401), `AI_RATE_LIMITED` (429), `AI_TIMEOUT` (504),
  `AI_BAD_RESPONSE` (502), `AI_UNAVAILABLE` (503), `AI_MODEL_NOT_FOUND` (502), `AI_MODELS_UNSUPPORTED` (502),
  `AI_BAD_REQUEST` (400), `AI_CONFIG_INVALID` (400), `AI_CONFIG_WRITE_FAILED` (500).
- R7. SSE endpoints use POST + body, so the browser reads them with `fetch` +
  `ReadableStream` (`src/utils/aiClient.ts`); `EventSource` is not used.
- R8. With no configured provider, every AI endpoint returns `503 AI_NOT_CONFIGURED` with a
  Persian message pointing to «تنظیمات → هوش مصنوعی»; the UI shows a banner and a CTA.

## 4. Engine and tasks

- R9. `server/aiEngine.ts` speaks the OpenAI-compatible chat contract (`messages`, `temperature`,
  `max_tokens`, `response_format`, `stream`), supports `gateway` mode (`taskType`, `privacy`) and
  auto-discovers models when the connection has none.
- R10. Compatibility fallbacks on HTTP 400 mentioning `response_format`, `json`, `max_tokens`,
  `max_completion_tokens`, `unsupported`, `unrecognized` or `not supported`: retry without
  `response_format`, without `max_tokens`, then with `max_completion_tokens`. 429 → one retry after
  `Retry-After` (≤60 s); 5xx/timeout → one backoff retry.
- R11. Cache: disk cache keyed by `connection id + model + task cacheKey`; TTL from config
  (`cacheTtlHours`, `0` disables). Only responses accepted by the task validator are cached; a broken
  JSON reply is never replayed.
- R12. Mock guard: a `mock*` model returned by the **gateway** preset is `AI_UNAVAILABLE`; a mock
  provider configured on purpose (local testing) is allowed, but its output is never presented as a
  real analysis when the call fails.
- R13. `analyzeJob` requires a title and a description, includes the user profile, and returns
  `matchScore`/`matchReason` only when the model supplied them. Missing numbers stay `null` and set
  `partial: true`; nothing is invented.
- R14. `writeProposalStream` writes in Persian, respects `tone`, price, delivery time and extra notes,
  and refuses to send an empty proposal (`AI_BAD_RESPONSE`).
- R15. `generateSolution` first asks for a plan (≤6 files), then generates files with concurrency 2
  (`file-start`/`file-done` progress). Paths are sanitized: no absolute paths, `..`, blocked
  extensions (`exe`, `dll`, `so`, `dylib`, `bin`, `class`, `jar`), ≤220 KB per file and ≤1.5 MB total.
  A single-shot fallback (JSON `{files}`) is used when the plan is unusable.
- R16. `categorizeJobAI` only accepts keys from `shared/taxonomy.json`; otherwise the rule-based
  category (`source: rules`) is used.

## 5. Real test execution
- R17. `/api/run-tests` is disabled unless `allowCodeExecution` is true (default **false**) and
  returns `403 CODE_EXECUTION_DISABLED` otherwise.
- R18. Files are written to a fresh temp directory; env is scrubbed to `PATH`/`HOME`/`LANG`;
  timeout clamped to 60 s, stdout/stderr capped; the temp directory is removed afterwards.
- R19. Runner choice: `pytest` when importable, otherwise the bundled `python-runner`
  (imports `test_*.py` / `*_test.py`, runs module-level `test_*`, then `unittest` discover).
  Zero discovered tests is exit code 2 (`NO TESTS FOUND`) — never a fake pass. JS tests use
  `node --test`.
- R20. Result: `{ok, command, exitCode, durationMs, stdout, stderr, timedOut, files, note, error?}`.
  Honest limitation: this is **not** a security sandbox; it only runs user-triggered, AI-generated
  code locally.

## 6. UI
- R21. `Settings → هوش مصنوعی` (AISettingsPanel): add/edit/delete connections, choose active provider,
  fetch models, test connection, profile (skills, portfolio, tone notes, hourly rate), fallback,
  temperature, timeout, cache TTL, privacy and code-execution toggles.
- R22. `Header` shows the active model (or «AI · تنظیم نشده»); an amber banner appears until a
  provider is configured. Errors with `requiresAIConfig` deep-link to the AI tab.
- R23. `AIEvaluatorModal` runs `/api/analyze-job` on demand, shows automation/match/price/risk,
  red flags, next steps, `partial` warnings and model metadata; results are stored on the job.
- R24. `ProposalStudioModal` streams the proposal, supports tone switching (regenerates), stop,
  copy, price/delivery/extra notes, critique and "insert suggested opening".
- R25. `CodeWorkspace` streams the solution with a real progress log, file tabs, bundle download,
  plan/run instructions and a **real** «اجرای تست» button with terminal output.
- R26. No AI surface displays fabricated numbers or logs. Labels like «Sandbox Active» / «Code Quality
  100%» are forbidden.

## 7. Acceptance criteria
- AC-1: With no provider and no env keys, `/api/analyze-job`, `/api/generate-proposal`,
  `/api/generate-solution` return `503 AI_NOT_CONFIGURED` + `requiresAIConfig: true`.
- AC-2: `PUT /api/ai/config` with `baseUrl: "ftp://nope"` returns `400 AI_CONFIG_INVALID` and the
  stored connections are unchanged.
- AC-3: `GET /api/ai/config` never contains a real key (masked only); the file is mode `0600`.
- AC-4: A valid OpenAI-compatible endpoint passes `POST /api/ai/test` with a measured latency.
- AC-5: `POST /api/generate-proposal/stream` emits at least one `delta` and a final `done` whose text
  equals the concatenated deltas.
- AC-6: Two identical analyses hit the cache on the second call (`meta.cached === true`, no upstream
  request); an invalid JSON reply is never cached.
- AC-7: A provider answering `400 Unsupported parameter: max_tokens` still succeeds via a fallback
  variant.
- AC-8: `/api/run-tests` on a passing `test_main.py` returns `ok: true`; on a failing test returns
  `ok: false` with the failing output; with execution disabled returns `403 CODE_EXECUTION_DISABLED`.
- AC-9: `analyzeJob` with a model reply missing `recommendedBid` returns `recommendedBid: null` and
  `partial: true` (no invented price).
- AC-10: `npx tsx --test server/*.test.ts` covers the above and passes.

## 8. Decisions and open questions
- D1 (2026-10-20, owner): AI must work without running the Konkred gateway; providers are configured
  in the app. This supersedes SPEC-006 R1/R2 and the "no provider key" non-goal.
- D2: Provider keys stay server-side; the browser only ever sees the mask.
- D3: Code execution is opt-in and off by default.
- D4 (2026-10-23, owner): این سند و سوپرسمپشن SPEC-006 تأیید شد («تایید می‌کنم»).
- Q1: پیش‌فرض `privacy` برای providerهای مستقیم `any` می‌ماند (SPEC-006 D2)؛ با تغییر در تنظیمات
  قابل تغییر است. همچنان باز: تست زنده با کلید واقعی provider روی ماشین مالک انجام نشده است.

## 9. Non-goals
- Multi-model voting/ensembles.
- Auto-bidding or auto-submitting proposals (the app stays read-only towards platforms).
- Reimplementing the Konkred gateway inside this repo.
- A hardened sandbox for arbitrary code execution.
