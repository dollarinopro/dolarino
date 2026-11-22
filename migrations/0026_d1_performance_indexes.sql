-- v9.9.4: Performance covering indexes to eliminate D1 full-table scans on cron/DO loops
CREATE INDEX IF NOT EXISTS idx_trades_status_user ON trades(status, user_id);
CREATE INDEX IF NOT EXISTS idx_bot_configs_state_user ON bot_configs(bot_state, user_id);
CREATE INDEX IF NOT EXISTS idx_copy_subs_user_active ON copy_subscriptions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_copy_subs_trader_active ON copy_subscriptions(trader_id, is_active);
CREATE INDEX IF NOT EXISTS idx_signals_created_desc ON signals(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_desc ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_channel_news_created_desc ON channel_news(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_ai_active_slot ON platform_ai_engines(is_active, slot_order);
