/*
# Add field_name to inspection_evidence and timeline to inspections

1. Changes
- Add `field_name` column to `inspection_evidence` so evidence nodes retain their field association even when no field_id exists (e.g. "not detected" evidence)
- Add `timeline` jsonb column to `inspections` to persist the full processing timeline across reloads

2. Security
- No security changes. Existing RLS policies cover the new columns automatically.
*/

ALTER TABLE inspection_evidence ADD COLUMN IF NOT EXISTS field_name text;
ALTER TABLE inspections ADD COLUMN IF NOT EXISTS timeline jsonb DEFAULT '[]'::jsonb;
