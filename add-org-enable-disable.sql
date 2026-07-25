-- Soft enable/disable for Deliver companies + ProjectRequesta organizations.

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE sc_organizations ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
