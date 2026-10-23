# اپ اندروید کنکلنسر (APK)

این پروژه یک پوسته‌ی سبک Capacitor است که رابط وب کنکلنسر را در Android WebView باز می‌کند.
**APK فقط یک پوسته است، نه سرور:** اسکنر، فید، مدل‌ها و اجرای تست روی سرور Node اجرا می‌شوند و
گوشی با همان سرور حرف می‌زند. پس APK همیشه به یک آدرس سرور **HTTPS** گره می‌خورد.

## ساخت APK (بدون نصب چیزی روی سیستم شما)

1. در GitHub به **Actions → Build Android APK → Run workflow** بروید.
2. در فیلد `server_url` آدرس HTTPS سرور خودتان را بگذارید (مثلاً `https://konklancer.example.com`).
3. پس از ~۲–۳ دقیقه، APK در دو جا آماده است:
   - **Releases → `apk-latest`** → فایل `konklancer-debug.apk` (لینک ثابت و مستقیم برای گوشی)
     `https://github.com/reARbitRA/konklancer/releases/download/apk-latest/konklancer-debug.apk`
   - Artifact همان اجرا (`konklancer-android-apk`) — برای دانلود نیاز به ورود به GitHub دارد.

### ساخت خودکار روی push
ورک‌فلو با هر تغییر در `mobile/**` یا خود فایل workflow روی شاخه‌های `arena/*` اجرا می‌شود و
آخرین بیلد را روی همان release چرخشی `apk-latest` به‌روز می‌کند.

### انتخاب آدرس سرور بدون ورودی دستی
یک متغیر مخزن بسازید: **Settings → Secrets and variables → Actions → Variables →
`KONKLANCER_SERVER_URL`** با آدرس دائمی سرور. ترتیب اولویت:

```
ورودی workflow_dispatch  →  vars.KONKLANCER_SERVER_URL  →  مقدار پیش‌فرض داخل workflow
```

## اجرای سرور برای گوشی

APK به `localhost` گوشی وصل نمی‌شود؛ باید آدرسی باشد که گوشی ببیند:

- **پایدار (پیشنهادشده):** سرور را روی یک VPS/سرویس با دامنه و HTTPS اجرا کنید
  (`PORT=3000 npm start` پشت یک reverse proxy مثل Caddy/Nginx).
- **موقت برای تست:** روی کامپیوتر خودتان `npm start` بزنید و با یک تونل HTTPS
  (مثل Cloudflare Tunnel یا ngrok) آدرس عمومی بگیرید؛ سپس APK را با همان آدرس بسازید.
- شبکه‌ی محلی با HTTP ساده پشتیبانی نمی‌شود (Capacitor config فقط `https` را می‌پذیرد).

## محدودیت‌های نسخه‌ی پیش‌نمایش (صادقانه)

- **آدرس پیش‌فرض فعلی موقتی است** (`https://3000-…e2b.app`): با خاموش‌شدن محیط پیش‌نمایش،
  APK به صفحه‌ی خطا می‌رسد. برای استفاده‌ی واقعی، آدرس دائمی خودتان را بدهید.
- APK کلیدهای provider را در خود ندارد؛ کلیدها فقط در `data/ai-config.json` سمت سرور می‌مانند.
- API احراز هویت ندارد. هر کسی که آدرس سرور را بداند می‌تواند `/api/*` را صدا بزند؛
  سرور را عمومی و بدون محافظ منتشر نکنید (T-003 R5 باز است).
- این بیلد **debug** است (با کلید debug امضا شده) و برای نصب شخصی کافی است، برای Play Store نه.
- اجرای تست کد (`/api/run-tests`) روی سرور انجام می‌شود، نه روی گوشی.
