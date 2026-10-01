/*
# Digital Inspection Platform Schema

1. Overview
This migration creates the complete schema for an evidence-driven digital inspection platform.
It stores compliance rule sets, inspections, multi-view images, extracted fields,
evidence relationships, detected issues, human review decisions, and corrective actions.

2. New Tables
- `rule_sets`: Versioned compliance rule definitions (rule ID, version, active status)
- `inspections`: Main inspection records (passport ID, product name, score, status)
- `inspection_views`: Captured images per package side (front, back, left, right, top, bottom)
- `inspection_fields`: Semantically extracted fields with OCR confidence per view
- `inspection_evidence`: Evidence graph linking rules → fields → image regions
- `inspection_issues`: Detected compliance issues and cross-view contradictions
- `human_reviews`: Human reviewer decisions (accept/reject/edit/verify) stored separately from AI
- `corrective_actions`: Actionable tasks derived from issues (open → under review → corrected → verified)

3. Security
- RLS enabled on all tables.
- Single-tenant, no auth: all policies use `TO anon, authenticated` with `USING (true)` / `WITH CHECK (true)`
  because the data is intentionally shared/public for this inspection platform.

4. Important Notes
- All timestamps are timestamptz with DEFAULT now()
- JSONB columns store structured evidence, extracted data, and rule definitions
- Foreign keys use ON DELETE CASCADE for child tables so deleting an inspection cleans up all related data
- `confidence` is numeric(5,2) to store 0.00–100.00
*/

-- Rule Sets: versioned compliance rules
CREATE TABLE IF NOT EXISTS rule_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id text NOT NULL,
  version text NOT NULL,
  name text NOT NULL,
  description text,
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE (rule_set_id, version)
);

ALTER TABLE rule_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_rule_sets" ON rule_sets;
CREATE POLICY "anon_select_rule_sets" ON rule_sets FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_rule_sets" ON rule_sets;
CREATE POLICY "anon_insert_rule_sets" ON rule_sets FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_rule_sets" ON rule_sets;
CREATE POLICY "anon_update_rule_sets" ON rule_sets FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_rule_sets" ON rule_sets;
CREATE POLICY "anon_delete_rule_sets" ON rule_sets FOR DELETE
  TO anon, authenticated USING (true);

-- Inspections: main compliance passport records
CREATE TABLE IF NOT EXISTS inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passport_id text NOT NULL UNIQUE,
  product_name text,
  product_category text,
  overall_score numeric(5,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress',
  rule_set_id text,
  rule_version text,
  engine_version text DEFAULT '1.0.0',
  summary jsonb DEFAULT '{}'::jsonb,
  reviewer_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inspections" ON inspections;
CREATE POLICY "anon_select_inspections" ON inspections FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inspections" ON inspections;
CREATE POLICY "anon_insert_inspections" ON inspections FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inspections" ON inspections;
CREATE POLICY "anon_update_inspections" ON inspections FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inspections" ON inspections;
CREATE POLICY "anon_delete_inspections" ON inspections FOR DELETE
  TO anon, authenticated USING (true);

-- Inspection Views: captured images per package side
CREATE TABLE IF NOT EXISTS inspection_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  view_label text NOT NULL,
  image_url text NOT NULL,
  image_quality numeric(5,2) DEFAULT 0,
  ocr_raw_text text,
  processing_status text DEFAULT 'pending',
  processing_log jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inspection_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inspection_views" ON inspection_views;
CREATE POLICY "anon_select_inspection_views" ON inspection_views FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inspection_views" ON inspection_views;
CREATE POLICY "anon_insert_inspection_views" ON inspection_views FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inspection_views" ON inspection_views;
CREATE POLICY "anon_update_inspection_views" ON inspection_views FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inspection_views" ON inspection_views;
CREATE POLICY "anon_delete_inspection_views" ON inspection_views FOR DELETE
  TO anon, authenticated USING (true);

-- Inspection Fields: extracted semantic fields with confidence
CREATE TABLE IF NOT EXISTS inspection_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  view_id uuid REFERENCES inspection_views(id) ON DELETE CASCADE,
  field_name text NOT NULL,
  field_value text,
  confidence numeric(5,2) DEFAULT 0,
  ocr_confidence numeric(5,2) DEFAULT 0,
  bbox jsonb,
  status text DEFAULT 'detected',
  source text DEFAULT 'ai',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inspection_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inspection_fields" ON inspection_fields;
CREATE POLICY "anon_select_inspection_fields" ON inspection_fields FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inspection_fields" ON inspection_fields;
CREATE POLICY "anon_insert_inspection_fields" ON inspection_fields FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inspection_fields" ON inspection_fields;
CREATE POLICY "anon_update_inspection_fields" ON inspection_fields FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inspection_fields" ON inspection_fields;
CREATE POLICY "anon_delete_inspection_fields" ON inspection_fields FOR DELETE
  TO anon, authenticated USING (true);

-- Inspection Evidence: evidence graph linking rules to fields to image regions
CREATE TABLE IF NOT EXISTS inspection_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  rule_id text NOT NULL,
  rule_description text,
  field_id uuid REFERENCES inspection_fields(id) ON DELETE CASCADE,
  view_id uuid REFERENCES inspection_views(id) ON DELETE CASCADE,
  bbox jsonb,
  ocr_confidence numeric(5,2) DEFAULT 0,
  validation_result text NOT NULL DEFAULT 'pending',
  validation_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inspection_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inspection_evidence" ON inspection_evidence;
CREATE POLICY "anon_select_inspection_evidence" ON inspection_evidence FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inspection_evidence" ON inspection_evidence;
CREATE POLICY "anon_insert_inspection_evidence" ON inspection_evidence FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inspection_evidence" ON inspection_evidence;
CREATE POLICY "anon_update_inspection_evidence" ON inspection_evidence FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inspection_evidence" ON inspection_evidence;
CREATE POLICY "anon_delete_inspection_evidence" ON inspection_evidence FOR DELETE
  TO anon, authenticated USING (true);

-- Inspection Issues: detected compliance issues and cross-view contradictions
CREATE TABLE IF NOT EXISTS inspection_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  issue_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  field_name text,
  rule_id text,
  description text NOT NULL,
  details jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'open',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE inspection_issues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_inspection_issues" ON inspection_issues;
CREATE POLICY "anon_select_inspection_issues" ON inspection_issues FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_inspection_issues" ON inspection_issues;
CREATE POLICY "anon_insert_inspection_issues" ON inspection_issues FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_inspection_issues" ON inspection_issues;
CREATE POLICY "anon_update_inspection_issues" ON inspection_issues FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_inspection_issues" ON inspection_issues;
CREATE POLICY "anon_delete_inspection_issues" ON inspection_issues FOR DELETE
  TO anon, authenticated USING (true);

-- Human Reviews: reviewer decisions stored separately from AI results
CREATE TABLE IF NOT EXISTS human_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  field_id uuid REFERENCES inspection_fields(id) ON DELETE CASCADE,
  issue_id uuid REFERENCES inspection_issues(id) ON DELETE CASCADE,
  reviewer_name text NOT NULL,
  decision text NOT NULL,
  original_value text,
  corrected_value text,
  comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE human_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_human_reviews" ON human_reviews;
CREATE POLICY "anon_select_human_reviews" ON human_reviews FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_human_reviews" ON human_reviews;
CREATE POLICY "anon_insert_human_reviews" ON human_reviews FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_human_reviews" ON human_reviews;
CREATE POLICY "anon_update_human_reviews" ON human_reviews FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_human_reviews" ON human_reviews;
CREATE POLICY "anon_delete_human_reviews" ON human_reviews FOR DELETE
  TO anon, authenticated USING (true);

-- Corrective Actions: actionable tasks from issues
CREATE TABLE IF NOT EXISTS corrective_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  issue_id uuid REFERENCES inspection_issues(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open',
  assigned_to text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE corrective_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_corrective_actions" ON corrective_actions;
CREATE POLICY "anon_select_corrective_actions" ON corrective_actions FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_corrective_actions" ON corrective_actions;
CREATE POLICY "anon_insert_corrective_actions" ON corrective_actions FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_corrective_actions" ON corrective_actions;
CREATE POLICY "anon_update_corrective_actions" ON corrective_actions FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_corrective_actions" ON corrective_actions;
CREATE POLICY "anon_delete_corrective_actions" ON corrective_actions FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_inspections_passport_id ON inspections(passport_id);
CREATE INDEX IF NOT EXISTS idx_inspection_views_inspection_id ON inspection_views(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_fields_inspection_id ON inspection_fields(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_evidence_inspection_id ON inspection_evidence(inspection_id);
CREATE INDEX IF NOT EXISTS idx_inspection_issues_inspection_id ON inspection_issues(inspection_id);
CREATE INDEX IF NOT EXISTS idx_human_reviews_inspection_id ON human_reviews(inspection_id);
CREATE INDEX IF NOT EXISTS idx_corrective_actions_inspection_id ON corrective_actions(inspection_id);
