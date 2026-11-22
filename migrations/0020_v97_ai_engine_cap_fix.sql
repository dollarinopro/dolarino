-- Raise default platform AI daily call cap to 50,000, reset accidental non-LLM pre-check burn,
-- and repair Hilinkup model typo ('deep' -> 'baidu/deepseek-v4.1-flash-1017') if present.

UPDATE platform_ai_engines
SET daily_call_cap = 50000
WHERE daily_call_cap <= 500;

UPDATE platform_ai_engines
SET calls_today = 0;

UPDATE platform_ai_engines
SET model = 'baidu/deepseek-v4.1-flash-1017',
    last_test_status = 'MODEL_AUTO_REPAIRED',
    updated_at = datetime('now')
WHERE LOWER(TRIM(model)) = 'deep'
  AND COALESCE(base_url, '') LIKE '%hilinkup.com%';
