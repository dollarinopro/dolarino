-- Dollarino v8.0: Paid-Only Access, Verified Copy Traders, Trainable My AI & Online Support Desk

CREATE TABLE IF NOT EXISTS copy_traders (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  handle TEXT,
  avatar_url TEXT,
  bio_fa TEXT,
  bio_en TEXT,
  specialty TEXT NOT NULL DEFAULT 'AI & Futures',
  win_rate REAL NOT NULL DEFAULT 74.0,
  roi_30d_pct REAL NOT NULL DEFAULT 42.5,
  max_drawdown_pct REAL NOT NULL DEFAULT 6.2,
  followers_count INTEGER NOT NULL DEFAULT 0,
  min_allocation_usd REAL NOT NULL DEFAULT 50,
  risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
  is_verified INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS copy_trader_trades (
  id TEXT PRIMARY KEY,
  trader_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'LONG',
  leverage INTEGER NOT NULL DEFAULT 5,
  entry_price TEXT NOT NULL,
  exit_price TEXT,
  stop_loss TEXT,
  tp1 TEXT,
  status TEXT NOT NULL DEFAULT 'OPEN',
  pnl_pct REAL NOT NULL DEFAULT 0,
  note TEXT,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  FOREIGN KEY (trader_id) REFERENCES copy_traders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_copy_trader_trades_tid ON copy_trader_trades(trader_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS copy_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  trader_id TEXT NOT NULL,
  allocation_usd REAL NOT NULL DEFAULT 100,
  risk_multiplier REAL NOT NULL DEFAULT 1.0,
  auto_mirror INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, trader_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (trader_id) REFERENCES copy_traders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_ai_agents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT 'هوش مصنوعی شخصی من',
  training_notes TEXT NOT NULL DEFAULT '',
  system_rules_json TEXT NOT NULL DEFAULT '{}',
  is_active_for_trading INTEGER NOT NULL DEFAULT 0,
  last_trained_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_ai_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  extracted_rules_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_ai_messages_uid ON user_ai_messages(user_id, created_at ASC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'پشتیبانی آنلاین دلارینو',
  status TEXT NOT NULL DEFAULT 'OPEN',
  channel TEXT NOT NULL DEFAULT 'WEB',
  last_message_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  sender_role TEXT NOT NULL DEFAULT 'user',
  sender_name TEXT,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at ASC);

-- Enforce paid-only subscriptions: disable free_demo from public signup and enforce subscription_required=true
UPDATE subscription_plans SET is_active = 0 WHERE code = 'free_demo';

INSERT OR REPLACE INTO system_settings (key, value) VALUES
  ('subscription_required', 'true');

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('telegram_support', '@Dollarino_admin'),
  ('online_support_enabled', 'true');

-- Seed initial Admin-Verified Copy Traders & realistic active trades (editable/deletable from Admin Panel)
INSERT OR IGNORE INTO copy_traders (
  id, display_name, handle, bio_fa, bio_en, specialty, win_rate, roi_30d_pct, max_drawdown_pct, followers_count, min_allocation_usd, risk_level, is_verified, is_active
) VALUES
(
  'ct_aria_quant',
  'آریا کوانت (تاییدشده دلارینو)',
  '@aria_quant',
  'معامله‌گر تاییدشده BTC و ETH با مدیریت ریسک دقیق ۱:۲.۵ و استاپ‌لاس الزامی روی تمام پوزیشن‌ها.',
  'Verified BTC & ETH trend-follower with strict 1:2.5 risk-reward discipline.',
  'BTC/ETH Futures',
  76.4,
  48.2,
  5.4,
  318,
  100,
  'LOW',
  1,
  1
),
(
  'ct_parsa_scalp',
  'پارسا اسکلپر (حرفه‌ای)',
  '@parsa_scalp',
  'اسکلپ سریع در تایم‌فریم ۱۵ دقیقه روی SOL، BNB و XRP بر پایه مومنتوم و شکست سطوح.',
  'Fast 15m momentum scalper on SOL, BNB, and XRP.',
  'Altcoin Scalping',
  71.8,
  64.9,
  9.1,
  245,
  50,
  'MEDIUM',
  1,
  1
),
(
  'ct_negin_ai',
  'نگین ترید (ترکیبی هوش مصنوعی)',
  '@negin_ai',
  'ترکیب پرایس‌اکشن و تاییدیه هوش مصنوعی دلارینو برای شکار حرکت‌های بزرگ بازار.',
  'Combines clean price action with multi-timeframe AI confirmation.',
  'Swing & AI Hybrid',
  79.2,
  39.6,
  4.3,
  412,
  100,
  'LOW',
  1,
  1
);

INSERT OR IGNORE INTO copy_trader_trades (
  id, trader_id, symbol, direction, leverage, entry_price, exit_price, stop_loss, tp1, status, pnl_pct, note
) VALUES
(
  'ctt_1', 'ct_aria_quant', 'BTCUSDT', 'LONG', 5, '91250', NULL, '89800', '94500', 'OPEN', 3.4, 'شکست مقاومت کلیدی همراه با تثبیت حجم'
),
(
  'ctt_2', 'ct_aria_quant', 'ETHUSDT', 'LONG', 5, '3120', '3265', '3045', '3250', 'CLOSED', 23.2, 'تارگت اول و دوم با موفقیت بسته شد'
),
(
  'ctt_3', 'ct_parsa_scalp', 'SOLUSDT', 'LONG', 8, '198.4', NULL, '192.0', '212.0', 'OPEN', 4.8, 'مومنتوم صعودی تایم ۱۵ دقیقه'
),
(
  'ctt_4', 'ct_negin_ai', 'BNBUSDT', 'LONG', 4, '625.0', '658.5', '610.0', '655.0', 'CLOSED', 21.4, 'تاییدیه ریسک‌فری و خروج کامل روی تارگت'
);
