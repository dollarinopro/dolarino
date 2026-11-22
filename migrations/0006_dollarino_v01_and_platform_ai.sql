-- Dollarino v5 Upgrade: Centralized Owner Multi-AI Consensus Engine (1-3 models) + Dollarino V0.1 Master Strategy

CREATE TABLE IF NOT EXISTS platform_ai_engines (
  id TEXT PRIMARY KEY,
  slot_order INTEGER NOT NULL DEFAULT 1,
  provider TEXT NOT NULL,                  -- 'deepseek' | 'openai' | 'anthropic' | 'gemini' | 'openai_compatible'
  label TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  weight INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1,
  api_key_masked TEXT NOT NULL,
  encrypted_api_key TEXT NOT NULL,
  temperature REAL NOT NULL DEFAULT 0.2,
  max_tokens INTEGER NOT NULL DEFAULT 1536,
  daily_call_cap INTEGER NOT NULL DEFAULT 500,
  calls_today INTEGER NOT NULL DEFAULT 0,
  calls_reset_date TEXT,
  last_test_status TEXT DEFAULT 'UNTESTED',
  last_tested_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS platform_ai_signals (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  candle_ts INTEGER NOT NULL,
  consensus_mode TEXT NOT NULL,
  model_count INTEGER NOT NULL DEFAULT 1,
  action TEXT NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  entry REAL NOT NULL DEFAULT 0,
  stop_loss REAL NOT NULL DEFAULT 0,
  tp1 REAL NOT NULL DEFAULT 0,
  tp2 REAL NOT NULL DEFAULT 0,
  tp3 REAL NOT NULL DEFAULT 0,
  leverage INTEGER NOT NULL DEFAULT 5,
  rr_ratio REAL NOT NULL DEFAULT 0,
  thesis TEXT NOT NULL DEFAULT '',
  invalidation TEXT NOT NULL DEFAULT '',
  model_votes_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_platform_ai_signals_lookup
  ON platform_ai_signals(symbol, timeframe, created_at DESC);

ALTER TABLE bot_configs ADD COLUMN auto_scan_top INTEGER NOT NULL DEFAULT 0;

INSERT OR IGNORE INTO system_settings (key, value) VALUES ('ai_consensus_mode', 'ENSEMBLE_AUTO');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('ai_cache_ttl_sec', '180');
INSERT OR IGNORE INTO system_settings (key, value) VALUES ('default_strategy_key', 'dollarino_v01');
