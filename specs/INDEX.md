# Specs Index

مرجع واحد فهرست اسناد. وضعیت هر سند از فرانت‌متر خودش خوانده می‌شود؛ این جدول برای نگاه سریع است
(آخرین به‌روزرسانی: ۲۰۲۶-۱۰-۲۳).

| Spec | عنوان | وضعیت | Task | خلاصه |
|---|---|---|---|---|
| SPEC-001 | GitHub workflow manager | DRAFT | T-001 (DONE) | ساخت مخزن خصوصی، کامیت فایل‌ها و تحویل |
| SPEC-002 | Browser notifications | DRAFT | T-002 (OPEN) | اعلان مرورگر برای پروژه‌های بالای آستانه |
| SPEC-003 | Safety & hardening | APPROVED | T-003 (OPEN) | فیلتر محتوا، پرچم‌ها، محدودیت‌های امنیتی؛ R5 (auth) باز |
| SPEC-004 | Live feed scanner | APPROVED | T-004 (OPEN) | فید واقعی از اسکنر، امتیازدهی، دسته‌بندی؛ R7 (تلگرام) باز |
| SPEC-005 | Outcome tracking | APPROVED | T-005 (OPEN) | ثبت نتیجه/درآمد؛ SQLite و `/api/bids` باز |
| SPEC-006 | LLM via Konkred gateway | APPROVED | T-006 (DONE) | مسیر پیش‌فرض LLM؛ R1/R2 با SPEC-008 جایگزین شد |
| SPEC-007 | Personal mode | DRAFT | T-007 (DONE) | اجرای شخصی، اسکن دوره‌ای، مسیرهای جمع‌آوری داده |
| SPEC-008 | AI providers in-app | APPROVED | T-008 (OPEN) | ۱۲ provider، کلید سمت سرور، streaming، اجرای واقعی تست |
| SPEC-009 | Workbench UI overhaul | DRAFT | T-009 (OPEN) | شل جدید، جست‌وجوی پیشرفته، استودیو کد چند-پنلی |

## قواعد
- سند با وضعیت `≥ APPROVED` فقط با ADR یا نسخه‌ی `-v2` تغییر می‌کند (AGENTS.md §2).
- هیچ کدی بدون سند `APPROVED` نوشته نمی‌شود؛ اسناد `DRAFT` که کد دارند، منتظر تأیید مالک‌اند.
