-- Migration 0010: Spot & Futures support, Dual-Direction / Hedge Mode controls, and Tamper-Proof Verified Profit Cards

ALTER TABLE bot_configs ADD COLUMN market_type TEXT NOT NULL DEFAULT 'FUTURES';
ALTER TABLE bot_configs ADD COLUMN direction_mode TEXT NOT NULL DEFAULT 'BOTH';
ALTER TABLE bot_configs ADD COLUMN hedge_mode INTEGER NOT NULL DEFAULT 0;

ALTER TABLE trades ADD COLUMN market_type TEXT NOT NULL DEFAULT 'FUTURES';

CREATE TABLE IF NOT EXISTS verified_profit_cards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'LIVE',
  period TEXT NOT NULL DEFAULT '7D',
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  trades_count INTEGER NOT NULL,
  win_rate REAL NOT NULL,
  net_pnl_usd REAL NOT NULL,
  roi_pct REAL NOT NULL,
  profit_factor REAL NOT NULL,
  exchange_provider TEXT NOT NULL DEFAULT 'TOOBIT',
  strategy_name TEXT NOT NULL DEFAULT 'dollarino_v01',
  payload_json TEXT NOT NULL,
  hmac_signature TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_verified_cards_user ON verified_profit_cards(user_id, issued_at);
