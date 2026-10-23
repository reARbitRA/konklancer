import type { CapacitorConfig } from '@capacitor/cli';

// به صورت پیش‌فرض APK کاملاً مستقل (Standalone) است و کل رابط کاربری، فید پروژه‌ها و موتور هوش مصنوعی
// از داخل خود APK (`www/`) اجرا می‌شود — بدون نیاز به هیچ سرور خارجی.
// فقط اگر کاربر صریحاً آدرس سرور شخصی خودش را در CAPACITOR_SERVER_URL بگذارد، به آن وصل می‌شود.
const customServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();
let parsedServerUrl: URL | null = null;

if (customServerUrl) {
  parsedServerUrl = new URL(customServerUrl);
  if (parsedServerUrl.protocol !== 'https:') {
    throw new Error('The Android wrapper requires an HTTPS server URL.');
  }
}

const config: CapacitorConfig = {
  appId: 'com.rearbitra.konklancer.app',
  appName: 'Konklancer',
  webDir: 'www',
  server: parsedServerUrl
    ? {
        url: parsedServerUrl.origin,
        cleartext: false,
        allowNavigation: [parsedServerUrl.hostname],
      }
    : {
        androidScheme: 'https',
        cleartext: true,
      },
};

export default config;
