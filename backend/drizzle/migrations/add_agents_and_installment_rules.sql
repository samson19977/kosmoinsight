-- Migration: Agents/Resellers module + PayGo installment eligibility rules
-- + full Rwanda location hierarchy on customers.
--
-- Run this against Supabase (SQL Editor) before deploying the code that
-- depends on it.

-- 1. Full location hierarchy on customers (District already existed).
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS sector VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cell VARCHAR(100),
  ADD COLUMN IF NOT EXISTS source VARCHAR(30) DEFAULT 'order';

-- 2. Agents/resellers table.
CREATE TABLE IF NOT EXISTS agents (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(100) NOT NULL,
  code                  VARCHAR(50) NOT NULL UNIQUE,
  phone                 VARCHAR(20) NOT NULL,
  email                 VARCHAR(100),
  region                VARCHAR(50),
  district              VARCHAR(100),
  commission_rate_bps   INTEGER NOT NULL DEFAULT 1500,
  status                VARCHAR(20) NOT NULL DEFAULT 'active',
  source                VARCHAR(30) DEFAULT 'admin',
  notes                 TEXT,
  created_at            TIMESTAMP DEFAULT NOW(),
  updated_at            TIMESTAMP DEFAULT NOW()
);

-- 3. Now that agents exists, link customers and orders to it.
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS agent_id INTEGER REFERENCES agents(id),
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'web';

CREATE INDEX IF NOT EXISTS idx_customers_agent_id ON customers(agent_id);
CREATE INDEX IF NOT EXISTS idx_orders_agent_id ON orders(agent_id);

-- 4. Agent commission ledger — append-only, never a mutable balance.
CREATE TABLE IF NOT EXISTS agent_commissions (
  id                    SERIAL PRIMARY KEY,
  agent_id              INTEGER NOT NULL REFERENCES agents(id),
  order_id              INTEGER REFERENCES orders(id),
  loan_id               INTEGER REFERENCES loans(id),
  sale_amount_rwf       INTEGER NOT NULL,
  commission_rate_bps   INTEGER NOT NULL,
  commission_rwf        INTEGER NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at               TIMESTAMP,
  note                  TEXT,
  created_at            TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_commissions_agent_id ON agent_commissions(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_commissions_status ON agent_commissions(status);
-- Prevents the same order (or loan) from ever generating a commission twice,
-- however many times a payment-confirmation path fires for it.
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commissions_unique_order ON agent_commissions(order_id) WHERE order_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_commissions_unique_loan ON agent_commissions(loan_id) WHERE loan_id IS NOT NULL;

-- 5. Platform-wide settings (key/value) — seeds the default commission rate.
CREATE TABLE IF NOT EXISTS settings (
  key           VARCHAR(100) PRIMARY KEY,
  value         TEXT NOT NULL,
  updated_at    TIMESTAMP DEFAULT NOW()
);

INSERT INTO settings (key, value)
VALUES ('default_agent_commission_bps', '1500')
ON CONFLICT (key) DO NOTHING;

-- 6. PayGo installment eligibility flag on products, defaulted off, then
-- switched on for Medium Package specifically — the only product Kosmotive
-- currently wants available on an installment plan.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS installment_eligible BOOLEAN DEFAULT FALSE;

UPDATE products
SET installment_eligible = TRUE
WHERE name ILIKE 'Medium Package%';
