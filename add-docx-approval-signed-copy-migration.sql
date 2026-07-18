-- Adds: an APPROVED status for SOWs (an internal review step distinct from the vendor's own
-- signature), and — on both sows and deliverables — an internal approval stamp plus the ability
-- to attach the executed/signed copy as a PDF (stored inline as base64 text, so no external
-- object storage needs to be provisioned).

ALTER TYPE sow_status ADD VALUE IF NOT EXISTS 'APPROVED';

ALTER TABLE sows ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS signed_document_filename text;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS signed_document_data text;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS signed_document_uploaded_at timestamp;
ALTER TABLE sows ADD COLUMN IF NOT EXISTS signed_document_uploaded_by text;

ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS approved_by text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS approved_at timestamp;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS signed_document_filename text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS signed_document_data text;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS signed_document_uploaded_at timestamp;
ALTER TABLE deliverables ADD COLUMN IF NOT EXISTS signed_document_uploaded_by text;
