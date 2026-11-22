# راهنمای استقرار یکپارچه Dollarino روی GitHub و Cloudflare

پروژه **دلارینو (Dollarino)** اکنون به‌صورت **یکپارچه (Full-Stack Cloudflare Workers + Static Assets + D1 + Durable Objects)** پیکربندی شده است تا خطای `404` در مسیرهای `/api/*` روی دامنه اصلی هرگز رخ ندهد.

---

## روش پیشنهادی: استقرار یکپارچه (Worker + Frontend روی یک دامنه)

### ۱. ساخت یا بررسی دیتابیس D1 و اعمال مایگریشن‌ها (`0001` تا `0018`)
```bash
npm ci
npx wrangler login
npx wrangler d1 migrations apply dollarino-db --remote
```

### ۲. تنظیم کلیدهای امنیتی (Secrets)
```bash
openssl rand -base64 32 | npx wrangler secret put MASTER_ENCRYPTION_KEY
openssl rand -hex 32 | npx wrangler secret put SESSION_JWT_SECRET
npx wrangler secret put PUBLIC_WEB_URL   # مثال: https://dollarino.pages.dev
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put HILINKUP_API_KEY # درگاه هوشمند Hilinkup (OpenAI-compatible)
```
> نکته: مقادیر پیش‌فرض `HILINKUP_BASE_URL` (`https://api.hilinkup.com/v1/chat/completions`)، `HILINKUP_MODEL` (`baidu/deepseek-v4.1-flash-1017`) و `DEFAULT_SIGNAL_CHANNEL` (`@Dollarino_official`) در `wrangler.toml` تنظیم شده‌اند و از تب «مدیریت -> موتور AI» هم قابل تغییر هستند.

### ۳. بیلد و استقرار یکپارچه
```bash
npm run build
npx wrangler deploy
```
با همین یک دستور، هم **فرانت‌اند (`apps/web/dist`)** و هم **بک‌اند (`/api/*`) + ربات ۲۴ ساعته (Durable Object)** روی یک آدرس واحد بالا می‌آیند و تمام دکمه‌ها و درخواست‌های API بلافاصله بدون خطای `404` کار می‌کنند.

سپس یک‌بار اندپوینت `POST /api/webhook/telegram/setup` را با حساب مدیر صدا بزنید تا Webhook و منوی ربات تلگرام (`@Dollarino_bot`) ثبت شوند، و مطمئن شوید `@Dollarino_bot` به عنوان ادمین با دسترسی ارسال پیام در کانال `@Dollarino_official` اضافه شده باشد.

---

## استفاده همزمان با Cloudflare Pages (در صورت اتصال به دامنه `pages.dev`)
اگر دامنه شما به Cloudflare Pages متصل است، یکی از دو روش زیر را انجام دهید تا `/api/*` روی `pages.dev` هم به Worker متصل شود:
1. در پنل Cloudflare -> پروژه Pages -> **Settings -> Functions / Bindings**:
   - یک **Service Binding** با نام **`WORKER_API`** به سرویس **`dollarino-worker`** اضافه کنید، **یا**
   - متغیر **`WORKER_URL`** را برابر آدرس Worker (مثل `https://dollarino-worker.<subdomain>.workers.dev`) بگذارید؛ فایل `functions/api/[[path]].ts` به‌طور خودکار تمام درخواست‌های `/api/*` را فوروارد می‌کند.
2. یا در متغیر محیطی بیلد فرانت‌اند **`VITE_API_BASE`** را روی آدرس Worker تنظیم کرده و `npm run build` بگیرید.

---

## امکانات پلتفرم اشتراکی دلارینو (نسخه v9.6)
- **پلتفرم تمام‌اشتراکی + تایید اتومات TRC20 / BEP20 + باشگاه رفرال چندسطحی ضدتقلب:** بررسی خودکار TXID تتر، سیستم رفرال برنز/نقره‌ای/طلایی (۱۵٪ تا ۲۲٪ + ۱۰٪ تمدیدها + ۷ روز هدیه) با مسدودسازی سوءاستفاده IP/دستگاه و تسویه آنی USDT در پنل ادمین.
- **سخت‌سازی کامل امنیتی و پایداری DEX:** محدودسازی نرخ (Rate Limiting) روی تمام مسیرهای حساس + فالبک خودکار `DexScreener -> GeckoTerminal` + فالبک‌های نرخ بازار.
- **اکستنشن مرورگر v9.6 (Chrome/Edge/Brave):** طراحی شیشه‌ای Liquid Glass ۴-تبه (ربات، بازارها، رادار DEX، اتصال و رفرال).
- **۴ موتور معاملاتی همگام (وب + `@Dollarino_bot`):** ۱) هوش مصنوعی دلارینو، ۲) هوش مصنوعی من (My AI)، ۳) استراتژی شکار (دُرنا V1)، ۴) کپی‌ترید تاییدشده با تایید انتشار ۲مرحله‌ای.
- **کارت سود و نتیجه بسته شدن سیگنال (Server PNG):** تولید خودکار تصویر رسمی (`@resvg/resvg-wasm` + فونت وزیر + واترمارک دلارینو + مهر حساب واقعی/دمو) در فرمت‌های ۱۶:۹ و ۳:۴ همراه با ارسال مستقیم به کانال `@Dollarino_official` و پیوی کاربر.
- **پشتیبانی آنلاین زنده و ضدکلاهبرداری:** تنها ربات رسمی `@Dollarino_bot` و کانال رسمی `@Dollarino_official` + چت تیکت داخل سایت همگام با پنل ادمین.
