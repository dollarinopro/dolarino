-- Migration 0003: KIYA BOT ORG - super v11 (KBOs v11), Timetrade Risk Profile, Trailing Stop, and Wallet Ledger

ALTER TABLE bot_configs ADD COLUMN kbos_params_json TEXT NOT NULL DEFAULT '{"basisType":"ALMA","basisLen":2,"useRes":true,"intRes":18,"offsetSigma":5,"offsetALMA":0.85,"delayOffset":0,"tradeType":"BOTH","useAtr1":false,"useAtr2":false,"useVol":false,"useEmaRsi":false,"useEma200":false,"useAdx":false,"adxVariant":"ORIGINAL","adxThreshold":25,"useRsiCustom":false,"useBb":false,"useDemaAtr":true,"haCandles":true,"periodDema":7,"periodAtr":14,"factorAtr":1.7,"tp1Pct":1.5,"tp2Pct":3.0,"tp3Pct":4.5,"useTrail":true,"trailPct":2.0,"trailAfterTp1":true,"beAfterTp1":true,"mainRibbonLen":180}';
ALTER TABLE bot_configs ADD COLUMN risk_profile_json TEXT NOT NULL DEFAULT '{"preset":"balanced","marketBias":"neutral","preferredSession":"automatic","entryStyle":"balanced","maxSpread":0.5,"cooldownMinutes":10,"trailingStop":true,"trailingDistance":2.0,"allocatedAmount":5000}';
ALTER TABLE bot_configs ADD COLUMN trailing_stop_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_configs ADD COLUMN trailing_stop_pct REAL NOT NULL DEFAULT 2.0;
ALTER TABLE bot_configs ADD COLUMN trail_after_tp1 INTEGER NOT NULL DEFAULT 1;
ALTER TABLE bot_configs ADD COLUMN started_at TEXT;

ALTER TABLE trades ADD COLUMN highest_price TEXT;
ALTER TABLE trades ADD COLUMN lowest_price TEXT;
ALTER TABLE trades ADD COLUMN trailing_active INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'PAPER', -- 'PAPER' | 'LIVE'
  event_type TEXT NOT NULL,             -- 'DEPOSIT' | 'TOPUP' | 'STOP_SETTLE' | 'PNL_CREDIT' | 'WITHDRAW'
  amount_usd REAL NOT NULL,
  balance_after REAL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger(user_id, created_at DESC);
