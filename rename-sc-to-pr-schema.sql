-- Renames every ProjectRequesta (formerly "KeelConnect") schema identifier from its old
-- sc_* prefix to the new pr_* prefix, to match src/lib/db/schema.ts after the Executa /
-- ProjectRequesta rebrand. All renames are metadata-only (no data movement, no downtime),
-- but the app code and this migration must land together -- the renamed columns/tables in
-- schema.ts will not resolve against the old sc_* names once this app version is deployed.
--
-- Run this once, after the previous migrations (reapply-all-migrations.sql and friends)
-- have already been applied, and before/alongside deploying the renamed application code.

-- 1. Tables
ALTER TABLE IF EXISTS sc_organizations RENAME TO pr_organizations;
ALTER TABLE IF EXISTS sc_org_members RENAME TO pr_org_members;
ALTER TABLE IF EXISTS sc_compliance_records RENAME TO pr_compliance_records;
ALTER TABLE IF EXISTS sc_projects RENAME TO pr_projects;
ALTER TABLE IF EXISTS sc_bids RENAME TO pr_bids;
ALTER TABLE IF EXISTS sc_negotiation_entries RENAME TO pr_negotiation_entries;
ALTER TABLE IF EXISTS sc_agreements RENAME TO pr_agreements;
ALTER TABLE IF EXISTS sc_agreement_parties RENAME TO pr_agreement_parties;
ALTER TABLE IF EXISTS sc_milestones RENAME TO pr_milestones;
ALTER TABLE IF EXISTS sc_payments RENAME TO pr_payments;
ALTER TABLE IF EXISTS sc_disputes RENAME TO pr_disputes;
ALTER TABLE IF EXISTS sc_agreement_change_requests RENAME TO pr_agreement_change_requests;
ALTER TABLE IF EXISTS sc_reviews RENAME TO pr_reviews;

-- 2. Enum types
ALTER TYPE sc_org_type RENAME TO pr_org_type;
ALTER TYPE sc_verification_status RENAME TO pr_verification_status;
ALTER TYPE sc_role RENAME TO pr_role;
ALTER TYPE sc_project_status RENAME TO pr_project_status;
ALTER TYPE sc_engagement_model RENAME TO pr_engagement_model;
ALTER TYPE sc_location_requirement RENAME TO pr_location_requirement;
ALTER TYPE sc_request_type RENAME TO pr_request_type;
ALTER TYPE sc_rate_type RENAME TO pr_rate_type;
ALTER TYPE sc_bid_status RENAME TO pr_bid_status;
ALTER TYPE sc_agreement_type RENAME TO pr_agreement_type;
ALTER TYPE sc_agreement_status RENAME TO pr_agreement_status;
ALTER TYPE sc_agreement_party_role RENAME TO pr_agreement_party_role;
ALTER TYPE sc_milestone_status RENAME TO pr_milestone_status;
ALTER TYPE sc_payment_direction RENAME TO pr_payment_direction;
ALTER TYPE sc_payment_status RENAME TO pr_payment_status;
ALTER TYPE sc_compliance_type RENAME TO pr_compliance_type;
ALTER TYPE sc_dispute_status RENAME TO pr_dispute_status;
ALTER TYPE sc_change_request_status RENAME TO pr_change_request_status;

-- 3. Columns (on the already-renamed tables above, plus the two cross-references from the
-- core Deliver schema: tasks.sc_project_id, the task-bridge FK from #233, and
-- audit_log.sc_organization_id, the reverse link from #242).
ALTER TABLE tasks RENAME COLUMN sc_project_id TO pr_project_id;
ALTER TABLE audit_log RENAME COLUMN sc_organization_id TO pr_organization_id;

ALTER TABLE pr_org_members RENAME COLUMN sc_organization_id TO pr_organization_id;
ALTER TABLE pr_compliance_records RENAME COLUMN sc_organization_id TO pr_organization_id;
ALTER TABLE pr_bids RENAME COLUMN sc_project_id TO pr_project_id;
ALTER TABLE pr_negotiation_entries RENAME COLUMN sc_bid_id TO pr_bid_id;
ALTER TABLE pr_agreements RENAME COLUMN sc_project_id TO pr_project_id;
ALTER TABLE pr_agreements RENAME COLUMN sc_bid_id TO pr_bid_id;
ALTER TABLE pr_agreement_parties RENAME COLUMN sc_agreement_id TO pr_agreement_id;
ALTER TABLE pr_agreement_parties RENAME COLUMN sc_organization_id TO pr_organization_id;
ALTER TABLE pr_milestones RENAME COLUMN sc_agreement_id TO pr_agreement_id;
ALTER TABLE pr_payments RENAME COLUMN sc_milestone_id TO pr_milestone_id;
ALTER TABLE pr_disputes RENAME COLUMN sc_project_id TO pr_project_id;
ALTER TABLE pr_disputes RENAME COLUMN sc_agreement_id TO pr_agreement_id;
ALTER TABLE pr_agreement_change_requests RENAME COLUMN sc_agreement_id TO pr_agreement_id;
ALTER TABLE pr_reviews RENAME COLUMN sc_project_id TO pr_project_id;

-- 4. Constraint (unique index on pr_org_members, was sc_org_member_uq)
ALTER TABLE IF EXISTS pr_org_members RENAME CONSTRAINT sc_org_member_uq TO pr_org_member_uq;
