---
id: SPEC-006
title: LLM access through Konkred gateway (free-tier pool, rotation, task routing)
type: spec
status: DRAFT
version: 0.1.0
tags: [llm, gateway, routing, cost]
supersedes: "SPEC-003 Q2 (model names) — answered by user: remove the Gemini model from konklancer"
depends_on: [SPEC-003, SPEC-004]
---

# SPEC-006 — LLM access through Konkred gateway

## 1. Summary
Konklancer stops calling Google Gemini directly. All LLM calls go to the Konkred gateway
(`reARbitRA/konkred-AI-ecosystem`, `gateway/`), which owns the free-tier key pool, per-key quota
accounting, rotation, fallback, response cache and in-flight deduplication. Konklancer only holds
one gateway credential.

## 2. Verified facts about the gateway (checked 2026-10-10)
- Gateway tests: `npm test` in `gateway/` → 31/31 pass, zero runtime dependencies (Node ≥ 20).
- Endpoints: `POST /v1/chat/completions` (OpenAI shape, accepts `taskType`), `POST /api/ai`, `GET /api/health`.
- Auth: `Authorization: Bearer <key>` checked against `USERS_JSON` on the gateway.
- Providers in registry: gemini, groq, cerebras, mistral, openrouter, cloudflare, github, mock (19 models).
- Key pool: multiple keys per provider (`<PROVIDER>_API_KEYS`); sliding-window RPM/TPM and daily/monthly
  quotas per key; cooldown on 429/401; learns limits from response headers.
- Routing: `taskType` → preferred models (`policies.registry.json`); failover to next candidate.
- "Fusion" in the gateway = response normalization + context trimming. It is **not** multi-model voting.
- **Important:** with no live keys (or all cooling down) the gateway answers HTTP 200 with a
  `mock:*` model and text "offline simulator". Konklancer must never treat that as real output.
- Local test: gateway started with one user key; `/v1/chat/completions` returned 200 via `mock:atlas-70b`.

## 3. Behavioral Contract
### 3.1 Interface (Konklancer side)
- Env: `KONKRED_GATEWAY_URL` (e.g. `http://localhost:4000`), `KONKRED_API_KEY`.
- Single function `callLLM({ taskType, system, user, maxTokens, privacy })` in `server/llm.ts`.
- Calls `POST {KONKRED_GATEWAY_URL}/v1/chat/completions` with `taskType`, `messages`, `max_tokens`, `privacy`.
- Returns `{ text, model, provider, cached, attempts }`.

### 3.2 Rules
- R1. Konklancer contains no provider SDK and no provider key. `@google/genai` is removed after migration.
- R2. No model name is hardcoded in Konklancer. Model choice is the gateway's job, driven by `taskType`.
- R3. Task mapping (tiering through the gateway):
  - `extraction` — structured fields from a job post, classification (cheap/fast tier)
  - `summarization` — short summaries
  - `general` — analysis and proposal writing
  - `code-generation` — solution code (strongest tier)
- R4. **Mock guard:** a response whose `model` starts with `mock:` or whose provider is `mock` is an error
  (`AI_UNAVAILABLE`). It must never be shown as analysis, proposal or code.
- R5. Errors: gateway 429 → wait `retryAfterSec` (max 60 s) then one retry; 5xx/timeout → one retry with
  backoff; 401 → configuration error shown to the user. No infinite loops.
- R6. Privacy: default `privacy: "private"` (excludes providers whose registry says `trainsOnData: true`).
  Requires user decision — see Open Questions.
- R7. Konklancer keeps its own cache for analyses keyed by sha256(taskType + job text) (SPEC-004 R4).
  The gateway cache is additional, not a replacement.
- R8. The rule-based pre-filter (SPEC-004 R5) runs before any `callLLM` call.
- R9. Gateway is a separate service (its own repo/deploy). It is **not** copied into this repo.
- R10. Konklancer's `/api/*` responses that depend on the gateway include `aiAvailable: boolean` and
  the gateway `model`, so the UI can show when a result came from a fallback model.

## 4. Acceptance Criteria
- AC-1: Given `KONKRED_GATEWAY_URL` pointing to a running gateway with a live key, when `analyze-job` runs,
  then the request reaches `/v1/chat/completions` with `taskType: "general"` and the response is shown with its model.
- AC-2: Given the gateway returns `model: "mock:atlas-70b"`, when analysis runs, then the API returns
  `aiAvailable: false` and no analysis text.
- AC-3: Given gateway 429 with `retryAfterSec: 3`, when called, then Konklancer waits and retries once, then returns an error if it fails again.
- AC-4: Given no provider SDK, when `npm ls @google/genai` is run, then the package is absent.
- AC-5: Given the same job text twice, when analysed, then the second call does not reach the gateway (Konklancer cache hit).
- AC-6: Given `KONKRED_GATEWAY_URL` unset, when the app starts, then it logs a clear warning and AI endpoints return `503 AI_NOT_CONFIGURED`.

## 5. Open Questions (user decision needed)
- Q1. **`freelance_pro_engine.py`:** delete from the working tree (recommended; it contains auto-bid and
  anti-bot logic that is out of scope; it stays in git history), or keep it as a non-running archive?
- Q2. **Gemini scope:** remove Gemini from Konklancer only (gateway keeps it as one option), or also
  disable the `gemini` provider in the gateway registry?
- Q3. **Privacy default** (R6): `private` (client data never goes to providers that train on data — this excludes
  Gemini and Mistral in the current registry), or `any` (more models available, more free-tier headroom)?
- Q4. **"Fusion":** keep the gateway meaning (normalization and trimming, one model per request), or add
  multi-model ensemble (ask 2–3 models and merge)? Ensemble uses 2–3× the free quota per request and is a
  separate feature, so it would need its own spec.

## 6. Non-goals
- Running the gateway inside this repo.
- Multi-model voting (unless Q4 says so).
- Storing provider keys in Konklancer.
