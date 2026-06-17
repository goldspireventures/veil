-- Organization admin console (self-serve org creation)

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS admin_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS admin_email TEXT;

CREATE INDEX IF NOT EXISTS idx_organizations_admin_hash
  ON organizations(admin_token_hash)
  WHERE admin_token_hash IS NOT NULL;

ALTER TABLE join_codes
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
