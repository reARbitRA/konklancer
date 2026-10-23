# TRACE
## Traceability Matrix
- SPEC-003 R1 → GitHubDispatcher.tsx (isPrivate default true)
- SPEC-003 R2 → App.tsx settings/sessionStorage
- SPEC-003 R3 → server/contentFilter.ts, server.ts analyze-job / generate-proposal / generate-solution
- SPEC-003 R4 → server.ts DEFAULT_JOBS, src/data/mockJobs.ts
- SPEC-003 R6 → App.tsx autoStart={false}
- SPEC-004 R1 → server.ts DEMO_FEED
- SPEC-003 R5, R7 → not yet (T-003 / Q1)
- SPEC-006 → server/llm.ts (callLLM, isMockModel, readLLMConfig), server/llm.test.ts (7 tests), server.ts (4 call sites, sendLLMError), .env.example
- SPEC-006 R4 (mock guard) → server/llm.ts isMockModel + test "mock simulator answer is rejected"
- SPEC-006 R7 (cache) → server/llm.ts cacheKey + test "cacheKey"
- SPEC-006 R5 (retry) → server/llm.ts loop + test "429 is retried"
- SPEC-004 R2/R4/R5 → server/scannerBridge.ts (readProjects, buildFeed, scoreProject)، server.ts (/api/jobs, trigger-scan, interval)
- SPEC-004 R3 → scanner/platforms.json (scan_enabled + scan_selectors)، readScanTargets
- SPEC-004 R6 (tiered taskType) → server.ts categorizeJobServer ({taskType:'extraction'}) و callLLM با taskType
- SPEC-007 R1–R3 → readScanConfig، readScanTargets، runScanner (قفل) + .env.example
- SPEC-007 R4 → server.ts (setInterval بر پایه KONKLANCER_SCAN_INTERVAL_MIN، پیش‌فرض خاموش)
- SPEC-007 R5 → scanner/konklancer_scan.py (cmd_parse_file --out، cmd_parse_telegram_file) + docs/PERSONAL-SETUP.md بخش ۴-الف
- SPEC-007 R7/R8 → cmd_toggle، RobotsCache.block_reason + پیام‌های تفکیک‌شده در fetch_html
- SPEC-007 R9–R13 → server.ts (/api/jobs source، /api/bridge/status)، src/components/FeedStatusBar.tsx، App.tsx (refreshFeed, mergeFeedJobs, scan:done)
- SPEC-007 R12 → src/types.ts (url/score/scoreReasons/source/scrapedAt) + JobHunter.tsx (لینک صفحه‌ی پروژه و چیپ امتیاز)
- SPEC-007 R14/R15 → server/scannerBridge.ts scoreProject + KONKLANCER_SCAN_MIN_SCORE
- SPEC-004 R7 (اعلان تلگرام) → هنوز پیاده نشده

## 2026-10-12 · T-007 (session-005) · طیف دسته‌ها + اسکنر واقعی
- منبع: درخواست صریح کاربر (فارسی): «پروژه‌ها فقط کد نویسی و ربات سازی نباید محدود باشه… ترجمه، طراحی، پوستر، بروشور، گرافیک… باید اسکن کنه» و «اسکنر رو دقیق و واقعی و نه ماک‌آپ تنظیم کن».
- تصمیم‌ها: (۱) دسته فقط متادیتا/فیلتر صریح است، نه گیت؛ (۲) کشف ساختار از خود DOM، نه هاردکد؛ (۳) مسیر HTML مرورگر به‌عنوان تضمین‌گاه همیشه در دسترس؛ (۴) ادعای تأییدنشده بودن نامزدها در کد و مستندات.
- شواهد: pytest 33/33، npm test 24/24، tsc/build سالم، E2E آفلاین با فیکسچرهای کارت/جدول/SPA.
- محدودیت صریح: صفر تماس موفق با سایت واقعی در این محیط؛ تأیید زنده = وظیفه‌ی کاربر روی ماشین خودش.


## 2026-10-20 · T-008 (session-006) · SPEC-008
- SPEC-008 §2 → shared/aiProviders.ts (presets، normalizeBaseUrl، pickModels، validateConnectionDraft)
- SPEC-008 R1–R5 → server/aiConfig.ts + PUT /api/ai/config + .env.example
- SPEC-008 R6–R8 → server.ts (sendLLMError، SSE helpers) + src/utils/aiClient.ts
- SPEC-008 R9–R12 → server/aiEngine.ts (chat/chatStream، variants، cacheValidate، mock guard)
- SPEC-008 R13–R16 → server/aiTasks.ts
- SPEC-008 R17–R20 → server/codeRunner.ts + POST /api/run-tests
- SPEC-008 R21–R26 → AISettingsPanel، SettingsModal، Header، App (بنر)، AIEvaluatorModal،
  ProposalStudioModal، CodeWorkspace، AutoPilotPanel
- تست‌ها → server/ai.test.ts (۳۲ تست)؛ سایر: server/llm.test.ts و server/scannerBridge.test.ts

## 2026-10-23 · T-009 (session-007) · SPEC-009
- SPEC-009 R1–R6 → src/index.css (توکن‌ها، `@layer components`، `.code-*`، `.resize-handle`، `.sheet`)
- SPEC-009 R7–R10 → src/App.tsx (شل `100dvh`)، src/components/Header.tsx، src/components/StatusBar.tsx
- SPEC-009 R11–R16 → src/components/JobHunter.tsx (parseQuery، فیلتر ماندگار، master–detail، کیبورد)
- SPEC-009 R17–R18 → src/components/CommandPalette.tsx + App.tsx (`focusJobId`، Ctrl/⌘+K)
- SPEC-009 R19–R23 → src/components/workspace/{fileTree,FileTree,CodeEditor,highlight}.ts(x)
- SPEC-009 R24–R25 → src/components/workspace/{WorkspaceInspector,WorkspaceTerminal}.tsx
- SPEC-009 R26–R27 → src/components/CodeWorkspace.tsx (استریم، پنل‌های قابل بستن، حالت موبایل)
- SPEC-009 R28–R30 → src/components/workspace/MarkdownView.tsx، index.html (برند Konklancer)
- تست‌ها → SSR smoke (۱۵ کامپوننت) + E2E mock provider + 57/57 تست سرور؛ هیچ تست جدید سروری لازم نبود

## 2026-10-23 · T-009 (session-008) · Standalone APK + On-Device Runtime
- SPEC-008 / SPEC-009 (اجرای مستقل روی موبایل بدون سرور) → `src/utils/standaloneRuntime.ts`, `server/aiEngine.ts`, `server/aiConfig.ts`, `mobile/capacitor.config.ts`, `mobile/android/app/build.gradle`, `.github/workflows/build-android-apk.yml`
- SPEC-004 (فید پیش‌فرض از `scanner/cloud-feed.jsonl`) → `server.ts` (`loadFeedJobs`), `package.json` (`prebuild`), `scanner/tests/test_live_fixtures.py`


## 2026-10-23 · T-008/T-009 (session-009) · بازخورد دستگاه مالک
- SPEC-008 R21/R22 → `src/components/AISettingsPanel.tsx`: `onChangedRef` و `refresh` پایدار برای جلوگیری از چرخه‌ی fetch؛ setup خودکار provider و پیام ذخیره‌سازی درست برای APK.
- SPEC-009 R4/R10 → `src/components/Header.tsx`, `src/components/StatusBar.tsx`, `src/App.tsx`: تب محیط توسعه با نام واضح روی دسکتاپ/موبایل و در پالت.
- SPEC-009 R19/R24/R27 → `src/components/CodeWorkspace.tsx`: صفحه‌ی شروع با شرح درخت فایل، ادیتور، ابزار AI و ترمینال، و هدایت به پروژه.
- SPEC-009 honesty/accessibility → `src/components/PipelineDashboard.tsx` responsive stage cards؛ `PipelineBoard.tsx`, `JobHunter.tsx`, `AutoPilotPanel.tsx`, `App.tsx`: شمارش/ارزش برچسب‌خورده‌ی واقعی، وضعیت پیشنهاد و تکمیل دستی، و عدم ادعای تسویه پس از push.
- رگرسیون UI → JSDOM harness موقت: parent rerender حداکثر/دقیقاً یک config fetch؛ dependency جدیدی به پروژه افزوده نشد.
