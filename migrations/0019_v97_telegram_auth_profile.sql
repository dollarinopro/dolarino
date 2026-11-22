-- Migration v9.7: Telegram-First KYC Onboarding & Complete User Profile Editing (except locked phone)

ALTER TABLE users ADD COLUMN has_custom_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN display_bio TEXT;

UPDATE users
SET has_custom_password = 1
WHERE email NOT LIKE '%@telegram.dollarino.local' AND email NOT LIKE '%@dollarino.app';

INSERT INTO system_settings (key, value, updated_at) VALUES
  ('telegram_only_signup', 'true', datetime('now')),
  ('require_telegram_phone_kyc', 'true', datetime('now'))
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now');
