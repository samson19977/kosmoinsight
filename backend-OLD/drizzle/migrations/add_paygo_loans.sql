-- Migration: PayGo installment loans (loans, installments, loan_transactions)
-- + customer acquisition-cost columns for CAC/LTV metrics.
-- Run this against your Supabase database in the SQL editor.

-- 1. Customer acquisition columns (for CAC/LTV)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS acquisition_channel VARCHAR(50),
  ADD COLUMN IF NOT EXISTS acquisition_cost_rwf INTEGER;

-- 2. LOANS — one row per installment plan
CREATE TABLE IF NOT EXISTS loans (
  id                     SERIAL PRIMARY KEY,
  order_id               INTEGER NOT NULL REFERENCES orders(id),
  customer_id            INTEGER NOT NULL REFERENCES customers(id),
  principal_rwf          INTEGER NOT NULL,
  down_payment_rwf       INTEGER NOT NULL DEFAULT 0,
  interest_rate_bps      INTEGER NOT NULL DEFAULT 0,
  term_months            INTEGER NOT NULL,
  status                 VARCHAR(30) NOT NULL DEFAULT 'active',
  guarantor_name         VARCHAR(100),
  guarantor_phone        VARCHAR(20),
  acquisition_channel    VARCHAR(50),
  start_date             TIMESTAMP DEFAULT NOW(),
  expected_payoff_date   TIMESTAMP,
  completed_at           TIMESTAMP,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loans_customer_id ON loans(customer_id);
CREATE INDEX IF NOT EXISTS idx_loans_order_id ON loans(order_id);
CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status);

-- 3. INSTALLMENTS — one row per scheduled payment
CREATE TABLE IF NOT EXISTS installments (
  id                     SERIAL PRIMARY KEY,
  loan_id                INTEGER NOT NULL REFERENCES loans(id),
  installment_number     INTEGER NOT NULL,
  due_date               TIMESTAMP NOT NULL,
  amount_due_rwf         INTEGER NOT NULL,
  amount_paid_rwf        INTEGER NOT NULL DEFAULT 0,
  penalty_rwf            INTEGER NOT NULL DEFAULT 0,
  status                 VARCHAR(30) NOT NULL DEFAULT 'upcoming',
  paid_at                TIMESTAMP,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installments_loan_id ON installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);

-- 4. LOAN_TRANSACTIONS — audit trail (disbursement, payment, penalty, waiver)
CREATE TABLE IF NOT EXISTS loan_transactions (
  id                     SERIAL PRIMARY KEY,
  loan_id                INTEGER NOT NULL REFERENCES loans(id),
  installment_id         INTEGER REFERENCES installments(id),
  type                   VARCHAR(30) NOT NULL,
  amount_rwf             INTEGER NOT NULL,
  payment_method         VARCHAR(50),
  momo_transaction_id    VARCHAR(100),
  admin_id               INTEGER REFERENCES admins(id),
  note                   TEXT,
  created_at             TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_transactions_loan_id ON loan_transactions(loan_id);
