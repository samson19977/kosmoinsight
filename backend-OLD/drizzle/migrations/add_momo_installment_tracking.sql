-- Adds pending-MoMo request tracking to installments, enabling customer
-- self-service PayGo payments (Request-to-Pay -> webhook/poll reconciliation).
-- Purely additive — safe to run regardless of existing row count.

ALTER TABLE installments
  ADD COLUMN IF NOT EXISTS pending_momo_reference_id VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pending_momo_amount_rwf INTEGER,
  ADD COLUMN IF NOT EXISTS pending_momo_phone VARCHAR(20),
  ADD COLUMN IF NOT EXISTS pending_momo_initiated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_installments_pending_momo_ref ON installments(pending_momo_reference_id);
