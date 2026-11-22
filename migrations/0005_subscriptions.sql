-- Paid Subscriptions & Licensing System for Dollarino
CREATE TABLE IF NOT EXISTS subscription_plans (
  code TEXT PRIMARY KEY,
  name_fa TEXT NOT NULL,
  name_en TEXT NOT NULL,
  description_fa TEXT,
  description_en TEXT,
  price_usd REAL NOT NULL DEFAULT 0,
  price_toman INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 30,
  max_live_exchanges INTEGER NOT NULL DEFAULT 2,
  allow_ai_trading INTEGER NOT NULL DEFAULT 1,
  allow_codexbot INTEGER NOT NULL DEFAULT 1,
  allow_copy_trade INTEGER NOT NULL DEFAULT 1,
  allow_live_trading INTEGER NOT NULL DEFAULT 1,
  features_json TEXT NOT NULL DEFAULT '[]',
  is_popular INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_REVIEW', -- 'ACTIVE' | 'PENDING_REVIEW' | 'REJECTED' | 'EXPIRED' | 'REVOKED'
  payment_method TEXT NOT NULL DEFAULT 'USDT_TRC20', -- 'USDT_TRC20' | 'CARD_TO_CARD' | 'ADMIN_GRANT' | 'FREE_DEMO'
  payment_reference TEXT,
  amount_usd REAL NOT NULL DEFAULT 0,
  payer_note TEXT,
  started_at TEXT,
  expires_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  admin_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_subs_user_status ON user_subscriptions(user_id, status, expires_at DESC);

INSERT OR IGNORE INTO subscription_plans (
  code, name_fa, name_en, description_fa, description_en,
  price_usd, price_toman, duration_days, max_live_exchanges,
  allow_ai_trading, allow_codexbot, allow_copy_trade, allow_live_trading,
  features_json, is_popular, is_active, sort_order
) VALUES
(
  'free_demo',
  'تست دمو (Paper Demo)',
  'Paper Demo Trial',
  'مناسب برای آزمایش استراتژی‌ها و آشنایی با پلتفرم در حساب دمو',
  'Test strategies and Chart AI safely in Paper Demo mode',
  0, 0, 365, 0,
  0, 1, 0, 0,
  '["حساب دمو (Paper) با قیمت لحظه‌ای بازار","بک‌تست استراتژی‌های CodexBot","تست پارس سیگنال کانال تلگرام","نصب نسخه ویندوز و موبایل (PWA)"]',
  0, 1, 1
),
(
  'pro_monthly',
  'اشتراک حرفه‌ای ماهانه (Pro)',
  'Pro Monthly',
  'دسترسی کامل به ترید هوش مصنوعی، استراتژی CodexBot و کپی‌ترید تلگرام',
  'Full AI Trading, CodexBot Strategies & Telegram Copy-Trade on Toobit & KCEX',
  29, 1950000, 30, 2,
  1, 1, 1, 1,
  '["ترید خودکار با هوش مصنوعی (DeepSeek · Claude · GPT)","تمام استراتژی‌های CodexBot (Super v11 · SP2L · Mixer)","کپی‌ترید خودکار کانال تلگرام با فرمت اختصاصی شما","اتصال همزمان صرافی‌های Toobit و KCEX + حساب دمو"]',
  1, 1, 2
),
(
  'vip_quarterly',
  'اشتراک ویژه ۳ ماهه (VIP)',
  'VIP Quarterly (3 Months)',
  'بهترین ارزش خرید با ۳۲٪ تخفیف + پشتیبانی اختصاصی تلگرام',
  '3-Month VIP License with 32% savings and priority execution',
  59, 3950000, 90, 5,
  1, 1, 1, 1,
  '["۹۰ روز دسترسی کامل به تمام امکانات Pro","سقف بالاتر فراخوانی هوش مصنوعی و وب‌هوک لحظه‌ای","راه‌اندازی اختصاصی رله Toobit و بات تلگرام","پشتیبانی مستقیم ادمین و بروزرسانی‌های جدید"]',
  0, 1, 3
);

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('subscription_required', 'true'),
  ('usdt_trc20_wallet', 'TYourTRC20WalletAddressHereSetInAdminPanel'),
  ('iran_card_number', '6037-9975-0000-0000'),
  ('iran_card_holder', 'تنظیم در پنل مدیریت'),
  ('telegram_support', '@Dollarino_admin');
