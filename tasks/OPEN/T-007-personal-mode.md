---
id: T-007
title: Personal mode — scanner feed wired to UI, env config, scheduling, browser-save path (SPEC-004 + SPEC-007)
spec: SPEC-007
status: DONE
branch: arena/bb8cb4b4-konklancer
verification: "npm test && npx tsc --noEmit && npm run build && python3 -m pytest -q scanner/tests && curl /api/jobs (source=scanner) && POST /api/bridge/trigger-scan"
---
## Done
- `server/scannerBridge.ts`: خواندن JSONL، نگاشت `Project → FeedJob` (بودجه‌ی فارسی/لاتین، ریال، بازه‌ها،
  تعداد پیشنهاد)، امتیاز پیش‌فیلتر ۰–۱۰۰ با دلایل، فیلتر include/exclude، `readScanTargets`،
  `readScanConfig`، `runScanner` با قفل.
- `server.ts`: `/api/jobs` = فید واقعی با `source: scanner|demo|empty`؛ `POST /api/bridge/trigger-scan`
  و رویداد سوکت `scan:trigger` اسکن واقعی را اجرا و `job:new` / `scan:done` پوش می‌کنند؛
  `/api/bridge/status` صادقانه (بدون latency ساختگی)؛ اسکن دوره‌ای اختیاری؛ لاگ وضعیت در راه‌اندازی.
- فرانت‌اند: `FeedStatusBar` (منبع فید، زمان آخرین اسکن، دکمه‌ی اسکن)، حذف داده‌ی ساختگی از مسیر
  پیش‌فرض، لینک «صفحه‌ی پروژه» و چیپ امتیاز فید روی کارت‌ها، نمایش شفاف وضعیت در `AutoPilotPanel`.
- اسکنر: `enable`/`disable` برای پلتفرم و کانال، `parse-file --out` و `parse-telegram-file` (مسیر
  «ذخیره‌ی صفحه در مرورگر»)، تفکیک پیام توقف robots (منع/۵xx/شبکه)، `list` گویاتر.
- اسناد: `docs/PERSONAL-SETUP.md` (راه‌اندازی شخصی گام‌به‌گام)، به‌روزرسانی README و scanner/README.
- تست‌ها: ۱۹ تست Node (۱۲ تازه) + ۱۹ تست Python (۴ تازه).
## Verified
- `npm test` ۱۹/۱۹ · `pytest scanner/tests` ۱۹/۱۹ · `tsc --noEmit` بدون خطا · `vite build` موفق.
- E2E: فید ساختگی در `/tmp` با ۳ پروژه → `/api/jobs` با `source: scanner` و امتیاز/دلایل درست؛
  `POST /api/bridge/trigger-scan` اسکنر واقعی را اجرا کرد (spawn + robots + خروج تمیز) و
  `parse-file --out` دو رکورد تازه به فید اضافه کرد که بی‌درنگ در API دیده شد.
## Not verified
- اسکن واقعی یک پلتفرم/کانال (شبکه‌ی محیط توسعه به t.me و سایت‌های ایرانی دسترسی ندارد؛ نیاز به
  اجرای مالک پروژه روی ماشین خودش).
## Open
- SPEC-007 در وضعیت DRAFT است و نیاز به تأیید مالک دارد (پیش‌فرض UI تغییر کرده است).
- `SPEC-004 R7` (اعلان تلگرام برای پروژه‌های بالای آستانه) هنوز پیاده نشده است.
