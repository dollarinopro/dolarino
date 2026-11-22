-- Dollarino v9.6: Enterprise Referral Commission & Withdrawal System + Security Hardening

ALTER TABLE users ADD COLUMN signup_ip_hash TEXT;
ALTER TABLE users ADD COLUMN signup_ua_hash TEXT;
ALTER TABLE users ADD COLUMN referral_balance_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN referral_total_earned_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN referral_tier TEXT NOT NULL DEFAULT 'BRONZE';

ALTER TABLE referrals ADD COLUMN commission_usd REAL NOT NULL DEFAULT 0;
ALTER TABLE referrals ADD COLUMN subscription_id TEXT;
ALTER TABLE referrals ADD COLUMN fraud_flag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE referrals ADD COLUMN fraud_reason TEXT;
ALTER TABLE referrals ADD COLUMN unlocked_at TEXT;

CREATE TABLE IF NOT EXISTS referral_withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount_usd REAL NOT NULL,
  target_type TEXT NOT NULL DEFAULT 'USDT_WALLET',
  wallet_address TEXT,
  network TEXT DEFAULT 'BEP20',
  status TEXT NOT NULL DEFAULT 'PENDING',
  admin_note TEXT,
  tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_ref_withdrawals_user ON referral_withdrawals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ref_withdrawals_status ON referral_withdrawals(status, created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  k TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 1
);

-- Prevent duplicate non-empty TXIDs / payment references across subscription orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_sub_orders_unique_ref
  ON user_subscriptions(payment_reference)
  WHERE payment_reference IS NOT NULL AND TRIM(payment_reference) != '' AND payment_method IN ('USDT_TRC20', 'TRUST_WALLET_BEP20', 'CARD_TO_CARD');
