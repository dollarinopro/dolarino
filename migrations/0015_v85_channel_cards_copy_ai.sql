-- Dollarino v8.5: Channel Publishing + Glass Buttons, News Desk, Result & Profit Cards (1Y / Horizontal / Vertical),
-- Verified Copy Trader Approval Flow, Anti-Scam No-Personal-DM Support, Hilinkup AI Base URL, and Referrals.

ALTER TABLE signals ADD COLUMN engine_source TEXT DEFAULT 'dollarino_v01';
ALTER TABLE signals ADD COLUMN engine_label TEXT;
ALTER TABLE signals ADD COLUMN channel_message_id INTEGER;
ALTER TABLE signals ADD COLUMN channel_chat_id TEXT;
ALTER TABLE signals ADD COLUMN tp1_hit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE signals ADD COLUMN tp2_hit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE signals ADD COLUMN tp3_hit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE signals ADD COLUMN trailing_sl TEXT;
ALTER TABLE signals ADD COLUMN closed_card_id TEXT;

ALTER TABLE trades ADD COLUMN engine_label TEXT;
ALTER TABLE trades ADD COLUMN closed_card_id TEXT;

ALTER TABLE copy_traders ADD COLUMN user_id TEXT;
ALTER TABLE copy_traders ADD COLUMN telegram_id TEXT;
ALTER TABLE copy_traders ADD COLUMN auto_ask_publish INTEGER NOT NULL DEFAULT 1;

ALTER TABLE copy_trader_trades ADD COLUMN publish_status TEXT NOT NULL DEFAULT 'PUBLISHED';
ALTER TABLE copy_trader_trades ADD COLUMN channel_message_id INTEGER;
ALTER TABLE copy_trader_trades ADD COLUMN source_trade_id TEXT;
ALTER TABLE copy_trader_trades ADD COLUMN tp2 TEXT;
ALTER TABLE copy_trader_trades ADD COLUMN tp3 TEXT;

ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE users ADD COLUMN referred_by TEXT;

CREATE TABLE IF NOT EXISTS channel_news (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL DEFAULT 'NEWS',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  media_url TEXT,
  button_label TEXT,
  button_url TEXT,
  channel_chat_id TEXT,
  channel_message_id INTEGER,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Enforce No Personal DM Support policy & Official @Dollarino_official / @Dollarino_bot channels
INSERT OR REPLACE INTO system_settings (key, value) VALUES
  ('official_channel', '@Dollarino_official'),
  ('signal_channel_handle', '@Dollarino_official'),
  ('telegram_support', '@Dollarino_bot'),
  ('support_handle', '@Dollarino_bot'),
  ('default_ai_base_url', 'https://api.hilinkup.com/v1'),
  ('auto_publish_signals_to_channel', 'true'),
  ('copy_publish_to_channel', 'true'),
  ('anti_scam_notice_fa', '⚠️ هشدار امنیتی: دلارینو هیچ اکانت پیوی شخصی برای پشتیبانی یا دریافت وجه ندارد. تنها راه ارتباطی رسمی: پشتیبانی آنلاین داخل سایت و ربات @Dollarino_bot و کانال @Dollarino_official است.'),
  ('anti_scam_notice_en', '⚠️ Security Notice: Dollarino NEVER operates personal DM accounts for support or payments. Only use Online Support inside the web app and @Dollarino_bot.');

-- Normalize any legacy @Dollarino_admin setting if already stored
UPDATE system_settings SET value = '@Dollarino_bot' WHERE key IN ('telegram_support', 'support_handle') AND value LIKE '%Dollarino_admin%';
