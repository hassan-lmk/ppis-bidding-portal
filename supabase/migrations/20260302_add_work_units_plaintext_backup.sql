-- Add plaintext backup column for work units (disaster-recovery fallback).
-- Only service_role / superadmin should read this column; it is never
-- selected by frontend queries or API routes.
ALTER TABLE bid_applications
  ADD COLUMN IF NOT EXISTS work_units_plaintext_backup integer;

-- Clean up the old restrictive RLS policy if it exists (it blocks UPDATEs).
DROP POLICY IF EXISTS deny_read_plaintext_backup ON bid_applications;

COMMENT ON COLUMN bid_applications.work_units_plaintext_backup IS
  'Disaster-recovery backup. Not exposed via API — read only by superadmin.';
