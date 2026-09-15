-- Migration: automated MoMo collection support for PayGo loans.
-- Adds status tracking to loan_transactions so pending MoMo request-to-pay
-- pushes can be reconciled automatically by the background job.

ALTER TABLE loan_transactions
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'completed';

CREATE INDEX IF NOT EXISTS idx_loan_transactions_status ON loan_transactions(status);
CREATE INDEX IF NOT EXISTS idx_loan_transactions_momo_txn ON loan_transactions(momo_transaction_id);
