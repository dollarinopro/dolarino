-- v9.5 Migration: Telegram default avatar sync, Dual AI/Human support mode, and Live Price Alerts
ALTER TABLE users ADD COLUMN telegram_avatar_file_id TEXT;
ALTER TABLE users ADD COLUMN avatar_custom INTEGER NOT NULL DEFAULT 0;

ALTER TABLE support_tickets ADD COLUMN support_mode TEXT NOT NULL DEFAULT 'AI_ASSISTANT';
ALTER TABLE support_tickets ADD COLUMN escalated_at TEXT;

CREATE TABLE IF NOT EXISTS price_alerts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'ABOVE',
  target_price REAL NOT NULL,
  note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  triggered_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user_active ON price_alerts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(is_active, symbol);
