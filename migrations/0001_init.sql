-- Dollarino (دلارینو) — Cloudflare D1 Initial Schema

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',         -- 'owner' | 'admin' | 'user'
  is_blocked INTEGER NOT NULL DEFAULT 0,
  telegram_id TEXT UNIQUE,
  telegram_username TEXT,
  telegram_first_name TEXT,
  telegram_link_code TEXT,
  telegram_link_expires_at TEXT,
  telegram_state TEXT,                       -- JSON state for multi-step Telegram input
  telegram_admin_perms TEXT DEFAULT '{}',    -- JSON permissions for delegated admins
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Personal or shared Telegram bots registered inside the platform
CREATE TABLE IF NOT EXISTS telegram_bots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  bot_username TEXT,
  bot_token_masked TEXT NOT NULL,
  encrypted_bot_token TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  signal_channel_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Exchange API connections (Paper, Toobit, Bitunix, KCEX placeholder)
CREATE TABLE IF NOT EXISTS exchange_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,                    -- 'paper' | 'toobit' | 'bitunix' | 'kcex'
  label TEXT NOT NULL,
  is_testnet INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 0,
  api_key_masked TEXT NOT NULL,
  encrypted_credentials TEXT NOT NULL,       -- AES-256-GCM JSON
  last_test_status TEXT,
  last_tested_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- BYO AI connections (Anthropic, OpenAI, Gemini, OpenAI-Compatible)
CREATE TABLE IF NOT EXISTS ai_connections (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,                    -- 'anthropic' | 'openai' | 'gemini' | 'openai_compatible'
  label TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  api_key_masked TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  temperature REAL NOT NULL DEFAULT 0.15,
  max_tokens INTEGER NOT NULL DEFAULT 1024,
  daily_call_cap INTEGER NOT NULL DEFAULT 40,
  calls_today INTEGER NOT NULL DEFAULT 0,
  calls_reset_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- User bot configuration & trading quantities (3-TP + Margin % + Risk-Free)
CREATE TABLE IF NOT EXISTS bot_configs (
  user_id TEXT PRIMARY KEY,
  bot_state TEXT NOT NULL DEFAULT 'STOPPED', -- 'STOPPED'|'RUNNING_PAPER'|'RUNNING_LIVE'|'PAUSED_DAILY_LOSS'
  trading_mode TEXT NOT NULL DEFAULT 'PAPER',-- 'PAPER' | 'LIVE'
  trade_execution_mode TEXT NOT NULL DEFAULT 'AUTO', -- 'AUTO' | 'MANUAL_CONFIRM'
  notifications_enabled INTEGER NOT NULL DEFAULT 1,
  symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
  strategy_key TEXT NOT NULL DEFAULT 'sp2l',
  entry_timeframe TEXT NOT NULL DEFAULT '15m',
  higher_timeframe TEXT NOT NULL DEFAULT '1h',
  margin_pct REAL NOT NULL DEFAULT 10.0,     -- Default 10% of available margin
  use_signal_leverage INTEGER NOT NULL DEFAULT 1,
  max_leverage INTEGER NOT NULL DEFAULT 20,
  tp1_close_pct REAL NOT NULL DEFAULT 50.0,  -- TP1 closes 50% + moves SL to Entry (Risk-Free)
  tp2_close_pct REAL NOT NULL DEFAULT 25.0,  -- TP2 closes 25% + moves SL to TP1
  tp3_close_pct REAL NOT NULL DEFAULT 25.0,  -- TP3 closes remaining 25%
  auto_breakeven_on_tp1 INTEGER NOT NULL DEFAULT 1,
  move_sl_to_tp1_on_tp2 INTEGER NOT NULL DEFAULT 1,
  daily_max_loss_pct REAL NOT NULL DEFAULT 5.0,
  max_open_positions INTEGER NOT NULL DEFAULT 3,
  block_weekends INTEGER NOT NULL DEFAULT 0,
  macro_blackout INTEGER NOT NULL DEFAULT 0,
  ai_gate_enabled INTEGER NOT NULL DEFAULT 0,
  ai_min_confidence INTEGER NOT NULL DEFAULT 65,
  webhook_secret TEXT NOT NULL,
  signal_channel_handle TEXT DEFAULT '@Dollarinoofficial',
  paper_balance TEXT NOT NULL DEFAULT '10000',
  strategy_params_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- TradingView / Strategy / Channel Signals
CREATE TABLE IF NOT EXISTS signals (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  source TEXT NOT NULL,                      -- 'strategy' | 'tradingview_webhook' | 'telegram_channel' | 'manual_test'
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,                   -- 'LONG' | 'SHORT'
  timeframe TEXT NOT NULL,
  price TEXT NOT NULL,
  stop_loss TEXT NOT NULL,
  leverage INTEGER NOT NULL,
  tp1 TEXT NOT NULL,
  tp2 TEXT,
  tp3 TEXT,
  sl_pct TEXT,
  tp1_pct TEXT,
  tp2_pct TEXT,
  tp3_pct TEXT,
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NEW',        -- 'NEW' | 'PENDING_CONFIRM' | 'EXECUTED' | 'DISMISSED' | 'REJECTED'
  telegram_message_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Positions & 3-TP staged trades
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  signal_id TEXT,
  mode TEXT NOT NULL,                        -- 'PAPER' | 'LIVE'
  exchange_provider TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy_key TEXT NOT NULL,
  direction TEXT NOT NULL,                   -- 'LONG' | 'SHORT'
  status TEXT NOT NULL DEFAULT 'OPEN',       -- 'OPEN' | 'CLOSED'
  entry_price TEXT NOT NULL,
  exit_price TEXT,
  initial_quantity TEXT NOT NULL,
  remaining_quantity TEXT NOT NULL,
  leverage INTEGER NOT NULL,
  margin_used TEXT NOT NULL,
  current_stop_loss TEXT NOT NULL,
  initial_stop_loss TEXT NOT NULL,
  tp1 TEXT NOT NULL,
  tp2 TEXT,
  tp3 TEXT,
  tp1_hit INTEGER NOT NULL DEFAULT 0,
  tp2_hit INTEGER NOT NULL DEFAULT 0,
  tp3_hit INTEGER NOT NULL DEFAULT 0,
  risk_free_active INTEGER NOT NULL DEFAULT 0,
  realized_pnl TEXT NOT NULL DEFAULT '0',
  fees_paid TEXT NOT NULL DEFAULT '0',
  exit_reason TEXT,                          -- 'TP1_PARTIAL'|'TP2_PARTIAL'|'TP3'|'SL'|'RISK_FREE_SL'|'MANUAL'|'KILL_SWITCH'
  exchange_order_id TEXT,
  client_id TEXT UNIQUE NOT NULL,
  ai_confidence INTEGER,
  ai_reasoning TEXT,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Audit logs & AI reasoning records
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,                    -- 'SIGNAL'|'AI'|'RISK'|'ORDER'|'TELEGRAM'|'SYSTEM'|'ERROR'
  level TEXT NOT NULL DEFAULT 'INFO',
  symbol TEXT,
  message TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Chart AI conversations
CREATE TABLE IF NOT EXISTS chart_ai_chats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  title TEXT NOT NULL,
  messages_json TEXT NOT NULL,
  annotations_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- System settings (editable by instance owner from Telegram Admin Panel or Web)
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('help_text', '📚 راهنمای دلارینو (Dollarino)\n\n۱. ابتدا از بخش «اتصال به صرافی» کلید API صرافی Toobit یا حالت Paper را متصل کنید.\n۲. در «تنظیمات ← تنظیم مقادیر معاملات» درصد مارجین (پیش‌فرض ۱۰٪) و درصد خروج TP1/TP2/TP3 (۵۰/۲۵/۲۵) را بررسی کنید.\n۳. در حالت «اتوترید»، سیگنال‌های کانال یا TradingView بلافاصله اجرا می‌شوند و در حالت «دستی ترید»، دکمه تایید زیر سیگنال نمایش داده می‌شود.\n\n🆔 @Dollarinoofficial'),
  ('official_channel', '@Dollarinoofficial'),
  ('support_handle', '@Dollarino_admin'),
  ('default_margin_pct', '10'),
  ('max_allowed_leverage', '25'),
  ('login_fail_limit', '5'),
  ('login_block_minutes', '15');

CREATE INDEX IF NOT EXISTS idx_trades_user_status ON trades(user_id, status, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_user_created ON signals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_logs_user_created ON audit_logs(user_id, created_at DESC);
