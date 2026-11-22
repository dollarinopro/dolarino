-- Align subscription plans with Dollarino Spec (Monthly $20, Quarterly $50, Semiannual $90, Annual $160)
-- Plus add Referral & Gift Code infrastructure and default 50%/25%/25% TP split support.

CREATE TABLE IF NOT EXISTS gift_codes (
  code TEXT PRIMARY KEY,
  plan_code TEXT NOT NULL DEFAULT 'pro_monthly',
  duration_days INTEGER NOT NULL DEFAULT 30,
  discount_pct INTEGER NOT NULL DEFAULT 100,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_by TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS gift_redemptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redeemed_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(code, user_id),
  FOREIGN KEY (code) REFERENCES gift_codes(code) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL,
  reward_days INTEGER NOT NULL DEFAULT 7,
  status TEXT NOT NULL DEFAULT 'REGISTERED', -- 'REGISTERED' | 'REWARDED'
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Update existing Monthly & Quarterly plans to exact Dollarino pricing (20 / 50 USDT) and seed 6-month (90) & 12-month (160)
UPDATE subscription_plans
SET price_usd = 20,
    price_toman = 1400000,
    duration_days = 30,
    updated_at = datetime('now')
WHERE code = 'pro_monthly' AND price_usd = 29;

UPDATE subscription_plans
SET price_usd = 50,
    price_toman = 3450000,
    duration_days = 90,
    updated_at = datetime('now')
WHERE code = 'vip_quarterly' AND price_usd = 59;

INSERT OR IGNORE INTO subscription_plans (
  code, name_fa, name_en, description_fa, description_en,
  price_usd, price_toman, duration_days, max_live_exchanges,
  allow_ai_trading, allow_codexbot, allow_copy_trade, allow_live_trading,
  features_json, is_popular, is_active, sort_order
) VALUES
(
  'pro_semiannual',
  'اشتراک ۶ ماهه (نصف‌سال)',
  'Semiannual (6 Months)',
  '۱۸۰ روز دسترسی کامل به اتوترید، کپی‌ترید، هوش مصنوعی و صرافی‌ها با ۲۵٪ تخفیف',
  '180 days full AI, Strategy & Toobit/KCEX access (25% savings)',
  90, 6200000, 180, 5,
  1, 1, 1, 1,
  '["۱۸۰ روز دسترسی نامحدود به تمام امکانات حرفه‌ای","اتوترید و کپی‌ترید خودکار تلگرام بدون محدودیت","تحلیل چارت با هوش مصنوعی مرکزی دلارینو","صرفه‌جویی ۳۰ دلار نسبت به خرید ماهانه"]',
  0, 1, 4
),
(
  'pro_annual',
  'اشتراک سالانه (۱۲ ماهه)',
  'Annual (12 Months)',
  '۳۶۵ روز دسترسی کامل طلایی با ۳۳٪ تخفیف ویژه معامله‌گران مداوم',
  '365 days full access with maximum 33% annual savings',
  160, 11000000, 365, 10,
  1, 1, 1, 1,
  '["۳۶۵ روز دسترسی کامل به تمام موتورها و صرافی‌ها","اولویت پردازش سیگنال و رله اختصاصی","پشتیبانی مستقیم تیم فنی دلارینو","بیشترین تخفیف سالانه (۸۰ دلار صرفه‌جویی)"]',
  0, 1, 5
);
