---
id: T-009
title: Workbench UI overhaul (SPEC-009) — shell, advanced search, multi-pane code studio
spec: SPEC-009
status: OPEN
created: 2026-10-23
verification: npx tsc --noEmit && npx tsx --test server/*.test.ts && npx vite build
---

# T-009 — UI/UX workbench overhaul

## Goal
بازطراحی کامل رابط کاربری برای استفاده‌ی شخصی، با چگالی بالاتر، جست‌وجوی پیشرفته‌تر، نمایش پروژه
به‌صورت درخت فولدر/ساب‌فولدر و ادیتور چند-پنلی قابل بسته‌شدن؛ بدون هیچ داده‌ی ساختگی.

## Scope (implemented)
- [x] `src/index.css` — توکن‌ها و کامپوننت‌های پایه در `@layer components` (قابل override با utility)
- [x] `src/components/Header.tsx` — هدر ۵۶px، تب‌های اصلی، دکمه‌ی جست‌وجوی سراسری، وضعیت مدل
- [x] `src/components/StatusBar.tsx` — نوار وضعیت پایین (md+) + `MobileNav` (<md)
- [x] `src/components/CommandPalette.tsx` — Ctrl/⌘+K، دستورها + جست‌وجوی پروژه
- [x] `src/components/JobHunter.tsx` — بازنویسی master–detail، `parseQuery` (عملگرها)، فیلترهای
      ماندگار، امتیاز، ناوبری کیبورد، bottom-sheet موبایل، پرش از پالت
- [x] `src/components/workspace/{fileTree,highlight,CodeEditor,FileTree,MarkdownView,PromptDialog,
      WorkspaceTerminal,WorkspaceInspector}.tsx` — درخت فایل، هایلایت، ادیتور، مستندات، ترمینال، بازرس
- [x] `src/components/CodeWorkspace.tsx` — بازنویسی کامل: سه پنل قابل تغییر عرض/بستن، تب‌های باز،
      جست‌وجوی محتوا، ذخیره‌ی همه، تولید/بازتولید استریمی، اجرای واقعی تست، GitHub، حالت موبایل
- [x] `src/App.tsx` — شل `100dvh`، اتصال پالت/وضعیت/ناوبری موبایل، canvas تمام‌ارتفاع
- [x] `src/components/FeedStatusBar.tsx` — نسخه‌ی نواری فشرده؛ `index.html` — برند Konklancer
- [x] SPEC-009 (DRAFT) + `specs/INDEX.md`

## Verification (2026-10-23)
- `npx tsc --noEmit` → clean (به‌جز خطای از پیش موجود `mobile/capacitor.config.ts`)
- `npx tsx --test server/*.test.ts` → 57/57
- `npx vite build` → OK (فقط هشدار حجم چانک)
- SSR smoke: Header، StatusBar، MobileNav، CommandPalette، FeedStatusBar، JobHunter (با/بدون داده)،
  CodeWorkspace، WorkspaceTerminal، WorkspaceInspector، MarkdownView، CodeEditor، FileTree،
  PromptDialog و App همه بدون خطا رندر شدند
- E2E استریم با mock provider: `plan → file-start×3 → file-done×3 → done` + `files/plan/meta` واقعی
- `/api/run-tests` با allowCodeExecution: `ok:true`, exit 0, pytest harness؛ خاموش → 403 صادقانه
- بدون provider: `/api/generate-solution` → `503 AI_NOT_CONFIGURED` + `requiresAIConfig:true`

## Open
- [ ] تأیید SPEC-009 توسط مالک (برای خروج از DRAFT)
- [ ] بازبینی چشمی روی مرورگر واقعی (این محیط مرورگر/Chromium ندارد؛ بررسی با SSR + build)
- [ ] Code-split کردن باندل (~1.1MB) در صورت نیاز

## Follow-up after owner device feedback (2026-10-23)
- Clearer navigation labels: the code tab is now «محیط توسعه» on desktop and «کدنویسی» on mobile; the blank workspace explains the project-selection → «تولید کد» path and enumerates Explorer, editor/tabs, AI tools, and terminal.
- Replaced the unlabeled D3 pipeline bars with responsive, labeled stage cards; preserved all stages and live counts.
- Removed unsupported fixed claims (45-minute delivery and 98% satisfaction), made stage/value labels explicit about manual recording and estimates, and keep a GitHub code publish in «آماده‌ی تحویل» rather than marking the job completed/paid.
- Verified: `npx tsc --noEmit`; `npm test` 57/57; `npm run build`; scanner suite 54/54; AI settings rerender regression harness (single config fetch).
