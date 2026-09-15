-- Corrective migration: reshape a pre-existing (empty) loans/installments
-- schema to match what the backend code expects. Safe to run because both
-- tables have 0 rows at the time this was written — verify that's still
-- true before running in any other environment:
--   SELECT count(*) FROM loans; SELECT count(*) FROM installments;

BEGIN;

-- ============================================================
-- LOANS
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loans' AND column_name = 'start_date'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'loans' AND column_name = 'disbursed_at'
  ) THEN
    ALTER TABLE loans RENAME COLUMN start_date TO disbursed_at;
  END IF;
END $$;

ALTER TABLE loans ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE loans ADD COLUMN IF NOT EXISTS loan_number VARCHAR(50);
ALTER TABLE loans ADD COLUMN IF NOT EXISTS total_payable_rwf INTEGER;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS guarantor_type VARCHAR(20) DEFAULT 'none';
ALTER TABLE loans ADD COLUMN IF NOT EXISTS notes TEXT;

ALTER TABLE loans ALTER COLUMN total_payable_rwf SET NOT NULL;
ALTER TABLE loans ALTER COLUMN loan_number SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'loans_loan_number_unique'
  ) THEN
    ALTER TABLE loans ADD CONSTRAINT loans_loan_number_unique UNIQUE (loan_number);
  END IF;
END $$;

-- ============================================================
-- INSTALLMENTS
-- ============================================================
ALTER TABLE installments ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMP;
ALTER TABLE installments ADD COLUMN IF NOT EXISTS overdue_alert_sent_at TIMESTAMP;

-- ============================================================
-- LOAN_TRANSACTIONS — additive only, safe regardless of current shape
-- ============================================================
ALTER TABLE loan_transactions ADD COLUMN IF NOT EXISTS type VARCHAR(20);
ALTER TABLE loan_transactions ADD COLUMN IF NOT EXISTS amount_rwf INTEGER;
ALTER TABLE loan_transactions ADD COLUMN IF NOT EXISTS method VARCHAR(30);
ALTER TABLE loan_transactions ADD COLUMN IF NOT EXISTS phone VARCHAR(20);
ALTER TABLE loan_transactions ADD COLUMN IF NOT EXISTS momo_transaction_id VARCHAR(100);
ALTER TABLE loan_transactions ADD COLUMN IF NOT EXISTS admin_id INTEGER REFERENCES admins(id);
ALTER TABLE loan_transactions ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE loan_transactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();

COMMIT;
