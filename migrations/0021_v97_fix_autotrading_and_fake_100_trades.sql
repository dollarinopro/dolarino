-- Clean up historical corrupt PAPER trades caused by hardcoded fallback price=100,
-- reset negative/astronomical paper balances to $10,000, and sync bot_state for running bots without active live exchange.

DELETE FROM trades
WHERE ABS(CAST(realized_pnl AS REAL)) > 50000
   OR CAST(margin_used AS REAL) > 50000
   OR (exit_price = '100' AND ABS(CAST(entry_price AS REAL) - 100) > 15)
   OR (entry_price = '100' AND exit_price IS NOT NULL AND ABS(CAST(exit_price AS REAL) - 100) > 15);

UPDATE bot_configs
SET paper_balance = '10000.00',
    updated_at = datetime('now')
WHERE CAST(paper_balance AS REAL) <= 0
   OR CAST(paper_balance AS REAL) > 100000;

UPDATE bot_configs
SET bot_state = 'RUNNING_PAPER',
    trade_execution_mode = 'AUTO',
    auto_scan_top = 1,
    scan_scope = 'ALL_MARKET',
    updated_at = datetime('now')
WHERE bot_state IN ('RUNNING_LIVE', 'RUNNING_PAPER')
  AND NOT EXISTS (
    SELECT 1 FROM exchange_connections ec
    WHERE ec.user_id = bot_configs.user_id
      AND ec.is_active = 1
      AND ec.provider != 'paper'
  );
