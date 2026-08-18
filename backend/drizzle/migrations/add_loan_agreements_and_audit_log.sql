-- Migration: PayGo agreement acceptance records + generic admin audit log.
-- Run AFTER add_agents_and_installment_rules.sql / add_agent_auth.sql.

-- One row per PayGo loan, proving the customer reviewed and accepted the
-- financing terms before the loan was opened (total, down payment,
-- financed amount, term, schedule). The frontend checkbox is only UI;
-- this table is what makes the acceptance auditable after the fact.
CREATE TABLE IF NOT EXISTS loan_agreements (
  id SERIAL PRIMARY KEY,
  loan_id INTEGER NOT NULL UNIQUE REFERENCES loans(id),
  order_id INTEGER REFERENCES orders(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  agent_id INTEGER REFERENCES agents(id),
  terms_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  accepted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  ip_address VARCHAR(64),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loan_agreements_customer ON loan_agreements(customer_id);
CREATE INDEX IF NOT EXISTS idx_loan_agreements_agent ON loan_agreements(agent_id);

-- Generic append-only trail of sensitive admin actions (agent approval,
-- suspension, rejection, password reset, commission-rate changes, etc.)
-- — anything not already covered by a domain-specific ledger like
-- loan_transactions or stock_movements.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES admins(id),
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id INTEGER NOT NULL,
  details TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target ON admin_audit_log(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created ON admin_audit_log(created_at DESC);
