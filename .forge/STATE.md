# STATE — as of 2026-10-23
## Milestone: M1 (Features) + AI درون‌برنامه‌ای + بازطراحی کامل UI (workbench)
## Specs
- SPEC-001, SPEC-002: DRAFT (کد پیاده شده، ولی سند تأیید نشده)
- SPEC-003 Safety & Hardening: APPROVED (T-003 OPEN؛ R5 احراز هویت API و R7 حذف فایل قدیمی باز)
- SPEC-004 Live Feed: APPROVED (T-004 OPEN؛ R2/R4/R5/R6 انجام شد، R7 اعلان تلگرام باز)
- SPEC-005 Outcome Tracking: APPROVED (T-005 OPEN — نه SQLite، نه /api/bids، نه /api/stats)
- SPEC-006 LLM via Konkred gateway: APPROVED (T-006 DONE) — R1/R2 با SPEC-008 supersede شد
- SPEC-007 Personal mode: **DRAFT — پیاده‌سازی شده، منتظر تأیید مالک** (T-007 DONE)
- SPEC-008 AI providers in-app: **APPROVED (2026-10-23)** — T-008 پیاده‌سازی کامل، فقط تست با کلید واقعی باز
- SPEC-009 Workbench UI overhaul: **DRAFT — پیاده‌سازی کامل به درخواست مالک** (T-009 OPEN)
## Decisions (user)
- 2026-10-10: Gemini فقط از konklancer حذف شد؛ privacy=any؛ fusion=normalization.
- 2026-10-12: حالت شخصی = فید واقعی اسکنر، بدون داده‌ی ساختگی در مسیر پیش‌فرض.
- 2026-10-23: SPEC-008 تأیید شد («تایید می‌کنم»)؛ پیش از پوش نهایی، UI باید کاملاً متحول شود
  (چگالی، جست‌وجوی پیشرفته، درخت فولدر، ادیتور چند-پنلی، الهام از VS Code/Antigravity/Blackbox).
## Next up (ordered)
1. تأیید SPEC-009 و SPEC-007 (خروج از DRAFT)؛ سپس SPEC-001/002.
2. تست زنده‌ی AI با کلید واقعی provider روی ماشین مالک (این محیط فقط mock دارد).
3. T-003 R5: احراز هویت `/api/*` (+ هدر در فرانت) قبل از در معرض شبکه گذاشتن.
4. T-004 R7: اعلان اختیاری تلگرام برای پروژه‌های بالای آستانه.
5. T-005: SQLite + `POST /api/bids` + `GET /api/stats` (مبنای قیمت‌گذاری مبتنی بر نتیجه).
6. کالیبراسیون انتخابگر یک پلتفرم واقعی و ثبت آن در platforms.json.
## Android APK (Standalone v2.0)
- **کاملاً مستقل (Standalone):** کل باندل وب (`dist/*` شامل رابط کاربری، موتور AI ایزومورفیک و ۱۳۲ پروژه‌ی واقعی `cloud-feed.jsonl`) داخل `mobile/www/` و APK بسته‌بندی می‌شود (`src/utils/standaloneRuntime.ts`).
- **بدون وابستگی به سرور خارجی:** `mobile/capacitor.config.ts` دیگر به آدرس موقت e2b وصل نمی‌شود و اپ از داخل خود گوشی (`https://localhost`) اجرا می‌شود و هرگز خطای Not Found نمی‌دهد.
- **امضای ثابت و سازگاری نصب:** با کلید PKCS12 پایدار (`v1SigningEnabled` + `v2SigningEnabled`)، `targetSdkVersion = 35` و شناسه پکیج `com.rearbitra.konklancer.app` (`versionCode 2`) بیلد Release امضاشده تولید و در Release `apk-latest` (`--latest`) با هر سه نام `konklancer.apk`, `konklancer-debug.apk`, `app-debug.apk` منتشر می‌شود.

## Known issues
- `npm install` به `--legacy-peer-deps` نیاز دارد؛ `vite.config.ts` از `__dirname` استفاده می‌کند (هشدار Vite).
- باندل اصلی ~1.1MB است (هشدار حجم چانک)؛ code-split انجام نشده.
- این محیط مرورگر/Chromium ندارد؛ بررسی UI با tsc + build + رندر SSR انجام می‌شود، نه اسکرین‌شات.
- `freelance_pro_engine.py` هنوز در ریشه است (اجرا نمی‌شود؛ حذفش تصمیم مالک است).
- احراز هویت ندارد؛ پیش‌فرض فقط برای اجرای محلی شخصی مناسب است.

## 2026-10-12 (session-005): اسکن همه‌ی دسته‌ها + خودکالیبراسیون DOM
- دامنه‌ی اسکن از «کد/ربات» به همه‌ی دسته‌های قابل تولید با AI باز شد (`shared/taxonomy.json`، منبع واحد سه‌لایه).
- مسیر واقعی اسکن: `autoscan` (زنده + کشف ساختار) / `probe --save` / `autoscan --html` (مرورگر).
- **باز و مهم:** تأیید انتخابگرها روی HTML زنده باید روی کامپیوتر کاربر انجام شود؛ این محیط به سایت‌ها TCP ندارد.
- **باز:** Playwright برای سایت‌های JS-محور (کارلنسر) پیاده نشده.

### اسکنر — کالیبراسیون واقعی و مسیر ابری (2026-10-12)
- انتخابگرهای کارلنسر/پونیشا روی HTML واقعی تأیید و در `platforms.json` ثبت شد (`scan_selectors_verified`).
- گارد «آیتم ناوبری نیست» + الگوی مسیر پروژه (`project_path_pattern`) + دستور `prune`؛ ۴۷ ردیف زباله از فید واقعی حذف شد (۱۵۵→۱۰۸).
- مسیر شبکه‌ی کامل دومرتبه اثبات شد: روی سایت آزمایشی محلی (`http://127.0.0.1:8123`) ربات‌ها/robots خوانده شد، ساختار خودکار کشف شد (`main.listing > div`, امتیاز ۸۶٫۸) و ۶ پروژه با بودجه/پیشنهاد/زمان و دسته‌های گرافیک/ترجمه/اتوماسیون/مستندسازی/ویدیو/صدا نوشته شد.
- مسیر ابری: `POST /api/bridge/cloud-scan` → کامیت `scan-request.json` → رانر گیت‌هاب. باگ: پیام کامیت `[skip ci]` داشت و ورک‌فلو اجرا نمی‌شد؛ اصلاح شد.
- محیط سندباکس: `fetch` نود گواهی TLS را تأیید نمی‌کند → مسیر پشتیبان `gh api` اضافه شد؛ `transport` در `/api/bridge/cloud` گزارش می‌شود.


## 2026-10-20 (session-006): هوش مصنوعی کامل و درون‌برنامه‌ای (SPEC-008)
- دلیل: درخواست مالک — «تمام امکانات هوش مصنوعی کامل فانکشنال و کاتینگ‌اج». دیگر لازم نیست
  Konkred gateway جداگانه اجرا شود؛ provider از «تنظیمات → هوش مصنوعی» انتخاب می‌شود.
- لایه‌ی جدید: `shared/aiProviders.ts`, `server/aiEngine.ts`, `server/aiConfig.ts`,
  `server/aiTasks.ts`, `server/codeRunner.ts` + بازنویسی endpointهای AI در `server.ts`.
- کلیدها فقط سمت سرور (`data/ai-config.json`, 0600، gitignored)؛ مرورگر فقط mask را می‌بیند.
- صادق‌سازی: AutoPilot دیگر ادعای ارسال خودکار ندارد؛ «تحلیل خودکار» اختیاری و پیش‌فرض خاموش است،
  «حالت سایبورگ» = تولید پیش‌نویس خودکار، اجرای تست واقعی با `allowCodeExecution` (پیش‌فرض خاموش).
- تأیید: `npx tsc --noEmit` تمیز؛ `npx tsx --test server/*.test.ts` → 57/57؛ E2E با mock provider.
- باز: SPEC-008 DRAFT است؛ تست با کلید واقعی provider انجام نشده (کلید در محیط نیست).

## 2026-10-23 (session-007): بازطراحی کامل UI/UX (SPEC-009)
- دلیل: درخواست مالک پیش از پوش نهایی — «UIUX رو کلا متحول کن… ریسپانسیو و بدون باگ LAYOUT…
  جست‌وجو راحت‌تر… نمایش پروژه‌ها کم‌جاگیرتر… پروژه به‌صورت فولدر/ساب‌فولدر… ادیت در پنل‌های
  مختلف قابل بسته شدن… الهام از VS Code و ANTIGRAVITY و BLACKBOX».
- لایه‌ی جدید: `src/index.css` (توکن در `@layer components`)، `Header`, `StatusBar`+`MobileNav`,
  `CommandPalette` (Ctrl/⌘+K)، `JobHunter` (master–detail + عملگرهای جست‌وجو)، و
  `src/components/workspace/*` (`fileTree`, `highlight`, `CodeEditor`, `FileTree`, `MarkdownView`,
  `PromptDialog`, `WorkspaceTerminal`, `WorkspaceInspector`).
- `CodeWorkspace` بازنویسی شد: سه پنل با عرض قابل درگ و قابل بستن (Ctrl+B/I/J)، تب‌های باز،
  جست‌وجوی محتوا + `Ctrl+P`، ذخیره‌ی همه، تولید استریمی با پیشرفت واقعی، ترمینال تست واقعی،
  حالت موبایل چهارحالته. `App` روی شل `100dvh` بازنویسی شد و پالت/وضعیت/ناوبری موبایل وصل شدند.
- صادق‌سازی: هیچ شمارنده/لاگ ساختگی اضافه نشد؛ خروجی تست و رویدادهای ایجنت همه از سرور می‌آیند.
- تأیید: `npx tsc --noEmit` تمیز؛ 57/57 تست سرور؛ `vite build` سالم؛ SSR smoke برای ۱۵ کامپوننت؛
  E2E استریم با mock provider (plan→file-start→file-done→done) و `/api/run-tests` واقعی.
- باز: SPEC-009 DRAFT است؛ بازبینی چشمی روی مرورگر واقعی انجام نشده (محیط بدون مرورگر).

## 2026-10-23 — بازخورد واقعی دستگاه پس از انتشار APK
- مشکل spin در تصویر با یک حلقه‌ی effect واقعی مرتبط بود: callback وضعیت AI در والد inline بود و هویت آن هر rerender عوض می‌شد؛ loader تنظیمات دوباره اجرا می‌شد. `AISettingsPanel` اکنون callback را در ref نگه می‌دارد و request اولیه فقط یک بار اجرا می‌شود. تست React+JSDOM ثابت کرد با rerender والد فقط یک GET انجام می‌شود.
- فرم افزودن provider در حالت خالی از قبل باز است، انتخاب provider بصری و مراحل گرفتن کلید/تست/ذخیره واضح‌اند. متن ذخیره‌سازی در APK می‌گوید کلید در فضای خصوصی همان گوشی می‌ماند.
- محیط توسعه از تب «محیط توسعه» دسکتاپ / «کدنویسی» موبایل و Ctrl+K قابل دسترسی است. اگر پروژه‌ای انتخاب نشده باشد، صفحه مسیر «پروژه‌ها → انتخاب پروژه → تولید کد» و ابزارهای Explorer/Editor/AI/Terminal را توضیح می‌دهد.
- پنل پایپ‌لاین responsive و برچسب‌دار شد؛ ادعاهای ثابت ۴۵ دقیقه و ۹۸٪ حذف؛ منتشرکردن کد دیگر وضعیت را به تکمیل/پرداخت تبدیل نمی‌کند.
- راستی‌آزمایی این دور: tsc تمیز، 57/57 تست TypeScript، build موفق، 54/54 تست پایتون، regression JSDOM یک درخواست تنظیمات.
- باز: باید commit و push شود تا CI APK تازه بسازد؛ سپس نصب/تست provider واقعی و بازبینی چشمی روی دستگاه مالک لازم است. کلید/provider واقعی در این محیط موجود نیست.
