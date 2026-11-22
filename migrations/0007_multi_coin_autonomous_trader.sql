-- Dollarino v5.1: Multi-Coin Autonomous Market Scanner + Full Trader Freedom + Unified Branding

ALTER TABLE bot_configs ADD COLUMN scan_scope TEXT NOT NULL DEFAULT 'ALL_MARKET'; -- 'SINGLE' | 'TOP_COINS' | 'ALL_MARKET'
ALTER TABLE bot_configs ADD COLUMN allow_auto_flip INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_configs ADD COLUMN allow_pyramiding INTEGER NOT NULL DEFAULT 0;
ALTER TABLE bot_configs ADD COLUMN watchlist_json TEXT NOT NULL DEFAULT '["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT","XRPUSDT","DOGEUSDT","AVAXUSDT","SUIUSDT","TONUSDT","LINKUSDT"]';

UPDATE bot_configs
SET auto_scan_top = 1,
    max_open_positions = CASE WHEN max_open_positions < 6 THEN 6 ELSE max_open_positions END
WHERE scan_scope = 'ALL_MARKET';

UPDATE subscription_plans
SET description_fa = 'مناسب برای آزمایش استراتژی منتخب دلارینو و آشنایی با پلتفرم در حساب دمو',
    description_en = 'Test Dollarino Select strategy safely in Paper Demo mode',
    features_json = '["حساب دمو رایگان با قیمت لحظه‌ای بازار","اجرای استراتژی منتخب دلارینو (موتور دُرنا)","اسکن همزمان چند ارز برتر بازار","نصب اپلیکیشن موبایل و ویندوز (PWA)"]'
WHERE code = 'free_demo';

UPDATE subscription_plans
SET description_fa = 'دسترسی کامل به هوش مصنوعی دلارینو، استراتژی منتخب دلارینو و کپی ترید دلارینو',
    description_en = 'Full Dollarino AI, Dollarino Select (Dorna V1) & Dollarino Copy-Trade on Toobit & KCEX',
    features_json = '["ترید خودکار با هوش مصنوعی دلارینو (بدون نیاز به API شخصی)","استراتژی منتخب دلارینو با اسکن آزاد کل بازار (۳۰+ ارز)","کپی ترید دلارینو خودکار از کانال تلگرام و وب‌هوک","اتصال همزمان صرافی‌های Toobit و KCEX + حساب دمو"]'
WHERE code = 'pro_monthly';

UPDATE subscription_plans
SET description_fa = '۹۰ روز دسترسی کامل به تمام امکانات + اسکن سریع کل بازار و پشتیبانی اختصاصی',
    description_en = '90 days full VIP access with multi-coin priority scanning & dedicated support',
    features_json = '["۹۰ روز دسترسی کامل به هوش مصنوعی، استراتژی منتخب و کپی ترید دلارینو","اولویت پردازش چندارزی و تا ۲۰ پوزیشن همزمان","راه‌اندازی اختصاصی رله Toobit و ربات تلگرام","پشتیبانی مستقیم مدیریت و بروزرسانی‌های جدید"]'
WHERE code = 'vip_quarterly';
