# konklancer scanner

اسکنر فقط‌خواندنی برای جمع‌آوری **لیست پروژه‌های عمومی** از پلتفرم‌های فریلنسری ایران و کانال‌های تلگرامی پروژه.

## فایل‌ها

| فایل | کاربرد |
|---|---|
| `platforms.json` | فهرست اصلاح‌شده پلتفرم‌ها با وضعیت، کمیسیون، آمار و منبع هر مورد |
| `telegram_sources.json` | کانال‌های تلگرامی پیدا شده؛ `scan_enabled` پیش‌فرض `false` است |
| `konklancer_scan.py` | اسکنر (CLI) |
| `tests/` | تست‌های آفلاین با فیکسچرهای ساختگی |
| `out/` | خروجی‌ها (در `.gitignore`) |

## نصب و اجرای تست

```bash
pip install httpx beautifulsoup4 pytest
python -m pytest -q scanner/tests
```

## دستورها

```bash
python -m scanner.konklancer_scan list                        # وضعیت پلتفرم‌ها و کانال‌های تلگرام
python -m scanner.konklancer_scan snapshot --platform parscoders   # یک صفحه برای کالیبره کردن
python -m scanner.konklancer_scan parse-file --platform parscoders --html FILE.html \
    --selectors-json '{"item":"...","title":"..."}' --include پایتون,python --out scanner/out/projects.jsonl
python -m scanner.konklancer_scan parse-telegram-file --channel workarc --html tg.html --out scanner/out/projects.jsonl
python -m scanner.konklancer_scan scan --platform parscoders --pages 2 --include پایتون,python
python -m scanner.konklancer_scan scan --telegram --include پایتون

# فعال/غیرفعال کردن یک منبع برای اسکن خودکار
python -m scanner.konklancer_scan enable  --telegram workarc     # بدون نیاز به انتخابگر
python -m scanner.konklancer_scan enable  --platform parscoders  # فقط بعد از ثبت scan_selectors
python -m scanner.konklancer_scan disable --telegram workarc
```

`parse-file --out` و `parse-telegram-file` مسیر «صفحه را در مرورگر ذخیره کن و همان‌جا تجزیه کن» را
پوشش می‌دهند: بدون هیچ درخواست خودکار به سایت، رکوردها در فید JSONL نوشته و در UI دیده می‌شوند
(جزئیات: `docs/PERSONAL-SETUP.md`).

پیام‌های توقف در `fetch_html` تفکیک شده‌اند: منع صریح `robots.txt`، خطای ۵xx و خطای شبکه (بی‌دسترسی)
هر کدام پیام جدا دارند؛ در هر سه حالت آن میزبان برای همان اجرا کنار گذاشته می‌شود.

## چرا هیچ پلتفرمی هنوز اسکن نمی‌شود؟

عمداً. انتخابگرهای CSS (`scan_selectors`) برای هیچ سایتی ثبت نشده، چون ساختار HTML واقعی سایت‌ها باید از روی صفحه زنده خوانده شود. روند پیشنهادی:

1. `snapshot --platform X` را اجرا کنید؛ فایل `scanner/out/snapshots/X.html` ذخیره می‌شود.
2. در آن فایل، کلاس‌های آیتم پروژه، عنوان، لینک، بودجه و تعداد پیشنهاد را پیدا کنید.
3. در `platforms.json` کلید `scan_selectors` را اضافه کنید، مثلاً `{"item": ".xyz", "title": ".xyz-title", "link": "a"}`.
4. `parse-file` را روی همان فایل اجرا کنید تا خروجی را بررسی کنید.
5. فقط بعد از این مراحل، `scan_enabled` را `true` کنید.

## قواعد ایمنی که در کد اجرا می‌شوند

- **robots.txt** هر میزبان قبل از هر درخواست بررسی می‌شود. اگر robots با خطای ۵xx یا خطای شبکه پاسخ دهد، همه درخواست‌ها برای آن میزبان متوقف می‌شوند.
- **محدودیت نرخ**: پیش‌فرض ۸ ثانیه فاصله بین درخواست‌ها برای هر میزبان.
- **ریدایرکت خارج از دامنه** متوقف می‌کند. این قاعده برای دامنه‌هایی مثل `karishe.com` و `hamiworks.com` که اکنون به سایت‌های تبلیغاتی یا قمار می‌روند لازم است.
- **فقط GET**. هیچ فرم، پیشنهاد یا POST ارسال نمی‌شود.
- **بدون کوکی ورود**، بدون مرورگر شخصی و بدون دور زدن کپچا یا سیستم ضدربات.

## محدودیت‌های شناخته‌شده

- robots.txt با stdlib پیاده‌سازی شده و wildcard (مثل `/api*`) را کامل نمی‌فهمد. قبل از فعال‌سازی هر سایت، robots.txt آن را دستی بخوانید.
- تنظیمات `robots` در `platforms.json` در بررسی ۱۰ اکتبر ۲۰۲۶ انجام شد و ممکن است قدیمی شود.
- لنسریفای (پارس فریلنسر) با `active_flagged` علامت خورده و اسکن نمی‌شود، چون صفحه اصلی آن آگهی‌های جعل مدرک احراز هویت دارد.
- پروژه‌های تلگرام فقط از پیش‌نمایش عمومی (`t.me/s/`) خوانده می‌شوند. هر پیام پروژه بالقوه است و قبل از هر اقدامی باید بررسی شود.

## آنچه عمداً در این ابزار نیست

- ارسال خودکار پیشنهاد (Auto-Bid)
- ورود با حساب یا استفاده از مرورگر شخصی از طریق CDP
- دور زدن ضدربات، کپچا یا fingerprinting
- تحویل خودکار کد به کارفرما یا انتشار خودکار مخزن عمومی در GitHub

اسکریپت قدیمی `freelance_pro_engine.py` در ریشه مخزن این موارد را دارد. با توجه به شرایط استفاده پلتفرم‌ها، توصیه می‌شود اجرا نشود.
