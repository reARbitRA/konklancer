---
id: T-008
title: AI providers configured in-app (SPEC-008) — direct APIs + optional gateway
spec: SPEC-008
status: OPEN
created: 2026-10-20
verification: npx tsc --noEmit && npx tsx --test server/*.test.ts
---

# T-008 — AI personal providers

## Goal
همه‌ی امکانات AI بدون نیاز به اجرای جداگانه‌ی Konkred gateway، از داخل خود برنامه قابل
پیکربندی و استفاده باشند و هیچ خروجی ساختگی نمایش داده نشود.

## Scope (implemented)
- [x] `shared/aiProviders.ts` — ۱۲ preset، `normalizeBaseUrl`, `pickModels`, `validateConnectionDraft`
- [x] `server/aiEngine.ts` — chat/chatStream، streaming، retry، compatibility variants، cache، mock guard
- [x] `server/aiConfig.ts` — store 0600، env merge، masking، validation، test/models helpers
- [x] `server/aiTasks.ts` — analyze، proposal (+stream)، critique، categorize، generateSolution
- [x] `server/codeRunner.ts` — اجرای واقعی pytest/unittest/python-runner/node --test
- [x] `server.ts` — `/api/ai/*`, `/api/analyze-job`, proposal/critique/solution (+SSE), `/api/run-tests`
- [x] UI — Settings AI tab، هدر و بنر وضعیت، AIEvaluator، ProposalStudio، CodeWorkspace
- [x] AutoPilot صادق: toggle تحلیل خودکار (پیش‌فرض خاموش) + حالت سایبورگ = پیش‌نویس خودکار
- [x] SPEC-008 (DRAFT) + `.env.example`

## Verification (2026-10-20)
- `npx tsc --noEmit` → clean (به‌جز خطای از پیش موجود `mobile/capacitor.config.ts`)
- `npx tsx --test server/*.test.ts` → 57/57
- E2E با provider سازگار OpenAI روی `127.0.0.1:4141`: status/config/test/models، analyze،
  proposal (SSE)، critique، categorize، solution (SSE)، run-tests (pass/fail/disabled)
- منفی: بدون provider → `503 AI_NOT_CONFIGURED`; PUT خراب → `400 AI_CONFIG_INVALID`

## Open
- [x] تأیید SPEC-008 توسط مالک — ۲۰۲۶-۱۰-۲۳ («تایید می‌کنم»)؛ SPEC-006 R1/R2 superseded
- [ ] تأیید زنده روی یک provider واقعی (کلید در این محیط موجود نیست؛ E2E فقط با mock انجام شد)
- [ ] احراز هویت `/api/*` (T-003 R5) — پیش‌فرض فقط برای اجرای محلی شخصی مناسب است
