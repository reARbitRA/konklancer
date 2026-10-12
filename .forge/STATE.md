# STATE — as of 2026-10-12
## Milestone: M1 (Features) + Safety hardening + LLM gateway + Personal mode (فید واقعی)
## Specs
- SPEC-001, SPEC-002: DRAFT (کد پیاده شده، ولی سند تأیید نشده)
- SPEC-003 Safety & Hardening: APPROVED (T-003 DOING؛ R5 API auth و R7 حذف فایل قدیمی باز)
- SPEC-004 Live Feed: APPROVED (T-004: R2/R4/R5/R6 انجام شد؛ R7 اعلان تلگرام باز)
- SPEC-005 Outcome Tracking: APPROVED (T-005 OPEN — نه SQLite، نه /api/bids، نه /api/stats)
- SPEC-006 LLM via Konkred gateway: APPROVED (T-006 DONE)
- SPEC-007 Personal mode: **DRAFT — پیاده‌سازی شده، منتظر تأیید مالک** (T-007 DONE)
## Decisions (user)
- 2026-10-10: Gemini فقط از konklancer حذف شد؛ privacy=any؛ fusion=normalization.
- 2026-10-12: حالت شخصی = فید واقعی اسکنر، بدون داده‌ی ساختگی در مسیر پیش‌فرض؛ مسیر «ذخیره‌ی صفحه در مرورگر» به‌عنوان راه بی‌دردسرِ جمع‌آوری داده.
## Next up (ordered)
1. تأیید SPEC-007 (Q1) و سپس SPEC-001/002 را از DRAFT خارج کن یا کد را با سند هم‌راست کن.
2. T-004 R7: اعلان اختیاری تلگرام برای پروژه‌های بالای آستانه.
3. T-003 R5: احراز هویت `/api/*` (+ هدر در فرانت) برای اینکه سرور را بتوان روی شبکه گذاشت.
4. T-005: SQLite + `POST /api/bids` + `GET /api/stats` (تمایز اصلی محصول و مبنای قیمت‌گذاری).
5. کالیبراسیون انتخابگر یک پلتفرم واقعی (parscoders/ponisha) و ثبت آن در platforms.json.
## Known issues
- `npm install` به `--legacy-peer-deps` نیاز دارد؛ `vite.config.ts` از `__dirname` استفاده می‌کند (هشدار Vite).
- دکمه‌ی «اجرای تست» در CodeWorkspace شبیه‌سازی‌شده است و باید حذف یا واقعی شود.
- `freelance_pro_engine.py` هنوز در ریشه است (اجرا نمی‌شود؛ حذفش تصمیم مالک است).
- احراز هویت ندارد؛ پیش‌فرض فقط برای اجرای محلی شخصی مناسب است.

## 2026-10-12 (session-005): اسکن همه‌ی دسته‌ها + خودکالیبراسیون DOM
- دامنه‌ی اسکن از «کد/ربات» به همه‌ی دسته‌های قابل تولید با AI باز شد (`shared/taxonomy.json`، منبع واحد سه‌لایه).
- مسیر واقعی اسکن: `autoscan` (زنده + کشف ساختار) / `probe --save` / `autoscan --html` (مرورگر).
- **باز و مهم:** تأیید انتخابگرها روی HTML زنده باید روی کامپیوتر کاربر انجام شود؛ این محیط به سایت‌ها TCP ندارد.
- **باز:** Playwright برای سایت‌های JS-محور (کارلنسر) پیاده نشده.
