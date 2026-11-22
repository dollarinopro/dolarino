-- Dollarino v7.1: Full Telegram Bot Admin Suite, Wallet Balance, Magic Web Auth & Gift Credit Support

ALTER TABLE users ADD COLUMN wallet_balance_usdt REAL NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN admin_panel_last_active_at TEXT;
ALTER TABLE users ADD COLUMN web_magic_token TEXT;
ALTER TABLE users ADD COLUMN web_magic_expires_at TEXT;

ALTER TABLE gift_codes ADD COLUMN code_type TEXT NOT NULL DEFAULT 'SUBSCRIPTION';
ALTER TABLE gift_codes ADD COLUMN credit_usdt REAL NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('bot_help_text', '📚 راهنمای سریع ربات و پلتفرم دلارینو\n\n۱. ابتدا از منوی «اتصال به صرافی 🔗» صرافی Toobit یا KCEX (یا دمو Paper Mode) را متصل کنید.\n۲. از بخش «تنظیمات ⚙️ -> تنظیم مقادیر معاملات 🪛» درصد مارجین (پیشنهادی ۱۰٪)، اهرم و تقسیم تارگت‌ها (۵۰٪ / ۲۵٪ / ۲۵٪) را تنظیم کنید.\n۳. حالت «اتوترید 🤖» را روشن کنید تا سیگنال‌های کانال @Dollarino_official یا هوش مصنوعی خودکار اجرا شوند؛ یا «دستی ترید 💪» را انتخاب کنید.\n۴. با زدن TP1 نیمی از معامله بسته شده و حد ضرر به نقطه ورود منتقل می‌شود (ریسک‌فری خودکار).'),
  ('bot_help_media_url', ''),
  ('bot_private_admin_only', 'false'),
  ('signal_channel_handle', '@Dollarino_official'),
  ('default_margin_pct', '10'),
  ('default_max_leverage', '20'),
  ('usdt_to_toman_rate', '70000'),
  ('max_login_attempts', '5');
