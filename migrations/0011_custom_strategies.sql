-- v7 Pro Quant Strategy IDE: User Pine Script, Python, & Visual Strategies
CREATE TABLE IF NOT EXISTS user_strategies (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  language TEXT NOT NULL DEFAULT 'pine' CHECK (language IN ('pine', 'python', 'visual')),
  code TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '15m',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_user_strategies_user ON user_strategies(user_id, updated_at DESC);

ALTER TABLE bot_configs ADD COLUMN active_custom_strategy_id TEXT;
