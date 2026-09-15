-- Migration: add PayGo installment loan tables + customer acquisition-cost columns
-- Run this against your Supabase database in the SQL editor if you already ran
-- the previous migrations and the earlier tables already exist.

-- 1. Acquisition tracking on customers (feeds CAC vs LTV reporting)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS acquisition_channel VARCHAR(50),
  ADD COLUMN IF NOT EXISTS acquisition_cost_rwf INTEGER;

-- 2. Loans table — one row per installment plan
CREATE TABLE IF NOT EXISTS loans (
  id                     SERIAL PRIMARY KEY,
  loan_number            VARCHAR(50) NOT NULL UNIQUE,
  order_id               INTEGER REFERENCES orders(id),
  customer_id            INTEGER NOT NULL REFERENCES customers(id),
  principal_rwf          INTEGER NOT NULL,
  down_payment_rwf       INTEGER DEFAULT 0,
  interest_rate_bps      INTEGER DEFAULT 0,
  term_months            INTEGER NOT NULL,
  total_payable_rwf      INTEGER NOT NULL,
  status                 VARCHAR(20) DEFAULT 'active',
  guarantor_type         VARCHAR(20) DEFAULT 'none',
  guarantor_name         VARCHAR(100),
  guarantor_phone        VARCHAR(20),
  disbursed_at           TIMESTAMP DEFAULT NOW(),
  expected_payoff_date   TIMESTAMP,
  completed_at           TIMESTAMP,
  notes                  TEXT,
  created_at             TIMESTAMP DEFAULT NOW(),
  updated_at             TIMESTAMP DEFAULT NOW()
);

-- 3. Installments table — one row per scheduled payment
CREATE TABLE IF NOT EXISTS installments (
  id                   SERIAL PRIMARY KEY,
  loan_id              INTEGER NOT NULL REFERENCES loans(id),
  installment_number   INTEGER NOT NULL,
  due_date             TIMESTAMP NOT NULL,
  amount_due_rwf       INTEGER NOT NULL,
  amount_paid_rwf      INTEGER DEFAULT 0,
  penalty_rwf          INTEGER DEFAULT 0,
  status               VARCHAR(20) DEFAULT 'upcoming',
  paid_at              TIMESTAMP,
  reminder_sent_at     TIMESTAMP,
  overdue_alert_sent_at TIMESTAMP,
  created_at           TIMESTAMP DEFAULT NOW(),
  updated_at           TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installments_loan_id ON installments(loan_id);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);

-- 4. Loan transactions table — audit trail (disbursement / payment / penalty / waiver)
CREATE TABLE IF NOT EXISTS loan_transactions (
  id                    SERIAL PRIMARY KEY,
  loan_id               INTEGER NOT NULL REFERENCES loans(id),
  installment_id        INTEGER REFERENCES installments(id),
  type                  VARCHAR(20) NOT NULL,
  amount_rwf            INTEGER NOT NULL,
  method                VARCHAR(30),
  phone                 VARCHAR(20),
  momo_transaction_id   VARCHAR(100),
  admin_id              INTEGER REFERENCES admins(id),
  note                  TEXT,
  created_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_transactions_loan_id ON loan_transactions(loan_id);
