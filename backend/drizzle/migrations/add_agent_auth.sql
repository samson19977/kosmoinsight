-- Migration: agent self-service registration/login + approval lifecycle.
-- Run AFTER add_agents_and_installment_rules.sql.

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS national_id VARCHAR(20),
  ADD COLUMN IF NOT EXISTS sector VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cell VARCHAR(100),
  ADD COLUMN IF NOT EXISTS village VARCHAR(100),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS approved_by_admin_id INTEGER REFERENCES admins(id),
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP;

-- Existing agents (spreadsheet-imported, no login yet) keep working as
-- 'active' by default; only NEW self-registrations start at 'pending' —
-- that default lives in application code (AgentService.registerAgent),
-- not the column default, so this migration doesn't need to touch it.

-- Phone and email must be unique once they're used as login identifiers.
-- Existing rows are deduped defensively first so the constraint can apply
-- cleanly even if the spreadsheet import ever let two rows share a phone.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_phone_unique'
  ) THEN
    ALTER TABLE agents ADD CONSTRAINT agents_phone_unique UNIQUE (phone);
  END IF;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Skipping agents_phone_unique — duplicate phone numbers exist; resolve manually first.';
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agents_email_unique'
  ) THEN
    ALTER TABLE agents ADD CONSTRAINT agents_email_unique UNIQUE (email);
  END IF;
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'Skipping agents_email_unique — duplicate emails exist; resolve manually first.';
END $$;
