-- Migration 0002: Strategy Flow, 8-Channel Signal Mixer, Margin Mode, and Pending Limit Orders

ALTER TABLE bot_configs ADD COLUMN margin_mode TEXT NOT NULL DEFAULT 'ISOLATED';
ALTER TABLE bot_configs ADD COLUMN mixer_threshold INTEGER NOT NULL DEFAULT 65;
ALTER TABLE bot_configs ADD COLUMN mixer_weights_json TEXT NOT NULL DEFAULT '{"trend":20,"momentum":15,"liquiditySweep":20,"fvg":15,"volatility":10,"volume":10,"structure":5,"meanReversion":5}';
ALTER TABLE bot_configs ADD COLUMN strategy_flow_json TEXT NOT NULL DEFAULT '{"nodes":[{"id":"trigger","enabled":true,"intervalSec":15},{"id":"market","enabled":true,"depthLevels":15},{"id":"strategy","enabled":true},{"id":"ai_gate","enabled":false,"minConfidence":65},{"id":"risk_gate","enabled":true},{"id":"executor","enabled":true,"threeTp":true}]}';

CREATE TABLE IF NOT EXISTS pending_orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  mode TEXT NOT NULL,
  exchange_provider TEXT NOT NULL,
  symbol TEXT NOT NULL,
  strategy_key TEXT NOT NULL,
  direction TEXT NOT NULL,
  order_type TEXT NOT NULL DEFAULT 'LIMIT',
  price TEXT NOT NULL,
  quantity TEXT NOT NULL,
  leverage INTEGER NOT NULL,
  stop_loss TEXT NOT NULL,
  tp1 TEXT NOT NULL,
  tp2 TEXT,
  tp3 TEXT,
  bars_remaining INTEGER NOT NULL DEFAULT 6,
  status TEXT NOT NULL DEFAULT 'PENDING', -- 'PENDING'|'FILLED'|'EXPIRED'|'CANCELLED'
  exchange_order_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pending_user_status ON pending_orders(user_id, status);
