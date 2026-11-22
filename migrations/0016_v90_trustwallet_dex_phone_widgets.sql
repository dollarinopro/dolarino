-- Migration 0016: v9.0 Trust Wallet DApp + DexScreener DEX Trades + Telegram Contact KYC + Mobile PWA Widgets + Extension

ALTER TABLE users ADD COLUMN phone_number TEXT;
ALTER TABLE users ADD COLUMN phone_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN phone_verified_at TEXT;
ALTER TABLE users ADD COLUMN trust_wallet_address TEXT;
ALTER TABLE users ADD COLUMN trust_wallet_tron TEXT;
ALTER TABLE users ADD COLUMN trust_wallet_solana TEXT;
ALTER TABLE users ADD COLUMN trust_wallet_verified INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN trust_wallet_connected_at TEXT;
ALTER TABLE users ADD COLUMN ui_mode TEXT NOT NULL DEFAULT 'simple';
ALTER TABLE users ADD COLUMN mobile_widgets_json TEXT;
ALTER TABLE users ADD COLUMN extension_api_key TEXT;

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_trust_wallet ON users(trust_wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_ext_key ON users(extension_api_key);

CREATE TABLE IF NOT EXISTS dex_trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  chain_id TEXT NOT NULL,
  dex_id TEXT,
  pair_address TEXT NOT NULL,
  token_address TEXT NOT NULL,
  token_symbol TEXT NOT NULL,
  quote_symbol TEXT NOT NULL DEFAULT 'USDT',
  direction TEXT NOT NULL DEFAULT 'BUY',
  amount_usd REAL NOT NULL,
  token_qty REAL NOT NULL DEFAULT 0,
  entry_price_usd REAL NOT NULL,
  exit_price_usd REAL,
  stop_loss_usd REAL,
  tp1_usd REAL,
  wallet_address TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING_SIGN',
  realized_pnl_usd REAL NOT NULL DEFAULT 0,
  realized_pnl_pct REAL NOT NULL DEFAULT 0,
  note TEXT,
  opened_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_dex_trades_user_status ON dex_trades(user_id, status, opened_at);
CREATE INDEX IF NOT EXISTS idx_dex_trades_token ON dex_trades(chain_id, token_address);

INSERT OR IGNORE INTO system_settings (key, value) VALUES
  ('require_telegram_phone_kyc', 'true'),
  ('trust_wallet_evm_receiver', ''),
  ('trust_wallet_sol_receiver', ''),
  ('trust_wallet_ton_receiver', '');
