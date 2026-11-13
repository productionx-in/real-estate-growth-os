-- ============================================================================
-- READ-ONLY PREFLIGHT CHECK FOR MIGRATION 20260015
-- Run against database BEFORE applying migration 20260015_crm_integration_readiness.sql.
-- This script is completely read-only. It performs NO writes, deletions or merges.
-- It executes cleanly on both a clean pre-migration database and an updated database.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Check 1: Verify core parent tables exist
-- ----------------------------------------------------------------------------
SELECT 
  t.table_name,
  CASE 
    WHEN count(*) = 4 THEN 'ALL_PARENT_TABLES_EXIST_OK'
    ELSE 'MISSING_PARENT_TABLES_ABORT'
  END AS check_1_status
FROM (VALUES ('organisations'), ('projects'), ('profiles'), ('leads')) AS t(table_name)
LEFT JOIN information_schema.tables ist 
  ON ist.table_schema = 'public' AND ist.table_name = t.table_name
GROUP BY t.table_name;

-- ----------------------------------------------------------------------------
-- Check 2: Verify RLS helper security functions exist
-- ----------------------------------------------------------------------------
SELECT 
  f.func_name,
  CASE 
    WHEN p.proname IS NOT NULL THEN 'SECURITY_FUNCTION_EXISTS_OK'
    ELSE 'SECURITY_FUNCTION_MISSING_ABORT'
  END AS check_2_status
FROM (VALUES ('auth_is_member_of_org'), ('auth_has_role_in_org'), ('update_updated_at_column')) AS f(func_name)
LEFT JOIN pg_proc p ON p.proname = f.func_name;

-- ----------------------------------------------------------------------------
-- Check 3: Collision & Previous Deployment Inspection — Integration Tables
-- Distinguishes clean state vs existing deployment vs partial deployment
-- ----------------------------------------------------------------------------
WITH target_tables AS (
  SELECT unnest(ARRAY['integration_connections', 'integration_project_mappings', 'integration_event_logs']) AS tbl
),
matched_tables AS (
  SELECT t.tbl, ist.table_name
  FROM target_tables t
  LEFT JOIN information_schema.tables ist 
    ON ist.table_schema = 'public' AND ist.table_name = t.tbl
)
SELECT 
  tbl AS target_table,
  CASE 
    WHEN table_name IS NULL THEN 
      'CLEAN_PRE_MIGRATION_STATE: Table does not exist yet (expected for new migration).'
    WHEN (SELECT count(table_name) FROM matched_tables) = 3 THEN 
      'EXISTING_DEPLOYMENT_DETECTED: Table already deployed. Migration 0015 will safely use IF NOT EXISTS.'
    ELSE 
      'PARTIAL_PREVIOUS_MIGRATION_OR_COLLISION: Only a subset of integration tables exists. Review manually.'
  END AS deployment_status
FROM matched_tables;

-- ----------------------------------------------------------------------------
-- Check 4: Collision & Previous Deployment Inspection — Leads Attribution Columns
-- Distinguishes clean state vs existing deployment vs partial deployment
-- ----------------------------------------------------------------------------
WITH target_cols AS (
  SELECT unnest(ARRAY[
    'source_platform', 'campaign_name', 'campaign_id', 'ad_name', 'ad_id',
    'form_name', 'form_id', 'external_lead_id', 'source_url', 'connection_id',
    'source_metadata', 'idempotency_key', 'is_duplicate', 'duplicate_of_id'
  ]) AS col
),
matched_cols AS (
  SELECT tc.col, isc.column_name
  FROM target_cols tc
  LEFT JOIN information_schema.columns isc 
    ON isc.table_schema = 'public' AND isc.table_name = 'leads' AND isc.column_name = tc.col
)
SELECT 
  col AS target_column,
  CASE 
    WHEN column_name IS NULL THEN 
      'CLEAN_PRE_MIGRATION_STATE: Column does not exist on leads yet (expected).'
    WHEN (SELECT count(column_name) FROM matched_cols) = 14 THEN 
      'EXISTING_DEPLOYMENT_DETECTED: All Stage 3G columns already exist on leads.'
    ELSE 
      'PARTIAL_PREVIOUS_MIGRATION_OR_COLLISION: Subset of columns exists on leads. Review manually.'
  END AS column_status
FROM matched_cols;

-- ----------------------------------------------------------------------------
-- Check 5A: ORPHANED PROJECT CHECK — Leads with non-null project_id referencing non-existent project
-- Must return 0 rows before migration proceeds!
-- ----------------------------------------------------------------------------
SELECT 
  l.id AS orphaned_lead_id,
  l.org_id AS lead_org_id,
  l.project_id AS referenced_project_id,
  'ORPHANED_PROJECT_REFERENCE_CONFLICT' AS conflict_type,
  'ACTION REQUIRED: Lead references a project_id that does not exist in public.projects' AS resolution
FROM public.leads l
LEFT JOIN public.projects p ON l.project_id = p.id
WHERE l.project_id IS NOT NULL AND p.id IS NULL;

-- ----------------------------------------------------------------------------
-- Check 5B: CROSS-TENANT PROJECT CHECK — Leads referencing project belonging to a DIFFERENT organisation
-- Must return 0 rows before migration proceeds!
-- ----------------------------------------------------------------------------
SELECT 
  l.id AS conflicting_lead_id,
  l.org_id AS lead_org_id,
  l.project_id AS referenced_project_id,
  p.org_id AS project_org_id,
  'CROSS_TENANT_LEAD_PROJECT_CONFLICT' AS conflict_type,
  'ACTION REQUIRED: Lead org_id does not match referenced project org_id' AS resolution
FROM public.leads l
JOIN public.projects p ON l.project_id = p.id
WHERE l.project_id IS NOT NULL AND l.org_id <> p.org_id;

-- ----------------------------------------------------------------------------
-- Check 6: Safe Read-Only Duplicate (org_id, idempotency_key) Check
-- Uses dynamic execution guard so it executes cleanly even if column does not exist yet
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_col_exists BOOLEAN;
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'idempotency_key'
  ) INTO v_col_exists;

  IF NOT v_col_exists THEN
    RAISE NOTICE 'Check 6 Info: Column leads.idempotency_key does not exist yet (clean pre-migration state). Check deferred.';
  ELSE
    FOR v_rec IN 
      EXECUTE 'SELECT org_id, idempotency_key, count(*) AS cnt, array_agg(id::text) AS ids ' ||
              'FROM public.leads WHERE idempotency_key IS NOT NULL ' ||
              'GROUP BY org_id, idempotency_key HAVING count(*) > 1'
    LOOP
      v_count := v_count + 1;
      RAISE WARNING 'Check 6 CONFLICT: Duplicate (org_id, idempotency_key) found on leads: org %, key %, count %, ids %',
        v_rec.org_id, v_rec.idempotency_key, v_rec.cnt, v_rec.ids;
    END LOOP;
    IF v_count = 0 THEN
      RAISE NOTICE 'Check 6 Passed: leads.idempotency_key exists and has 0 duplicates.';
    END IF;
  END IF;
END $$;

SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'idempotency_key'
    ) THEN 'DEFERRED: leads.idempotency_key does not exist yet (clean pre-migration state)'
    ELSE 'CHECK_EXECUTED: Verify DO block notices for duplicate status'
  END AS check_6_idempotency_preflight;

-- ----------------------------------------------------------------------------
-- Check 7: Safe Read-Only Duplicate (connection_id, external_lead_id) Check
-- Uses dynamic execution guard so it executes cleanly even if columns do not exist yet
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_cols_exist BOOLEAN;
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'external_lead_id'
  ) INTO v_cols_exist;

  IF NOT v_cols_exist THEN
    RAISE NOTICE 'Check 7 Info: Column leads.external_lead_id does not exist yet (clean pre-migration state). Check deferred.';
  ELSE
    FOR v_rec IN 
      EXECUTE 'SELECT connection_id, external_lead_id, count(*) AS cnt, array_agg(id::text) AS ids ' ||
              'FROM public.leads WHERE connection_id IS NOT NULL AND external_lead_id IS NOT NULL ' ||
              'GROUP BY connection_id, external_lead_id HAVING count(*) > 1'
    LOOP
      v_count := v_count + 1;
      RAISE WARNING 'Check 7 CONFLICT: Duplicate (connection_id, external_lead_id) found on leads: conn %, ext_id %, count %, ids %',
        v_rec.connection_id, v_rec.external_lead_id, v_rec.cnt, v_rec.ids;
    END LOOP;
    IF v_count = 0 THEN
      RAISE NOTICE 'Check 7 Passed: leads.external_lead_id exists and has 0 duplicates.';
    END IF;
  END IF;
END $$;

SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'external_lead_id'
    ) THEN 'DEFERRED: leads.external_lead_id does not exist yet (clean pre-migration state)'
    ELSE 'CHECK_EXECUTED: Verify DO block notices for duplicate status'
  END AS check_7_external_lead_preflight;

-- ----------------------------------------------------------------------------
-- Check 8: Safe Read-Only Duplicate (connection_id, external_event_id) Check on Event Logs
-- Handles both clean database (table does not exist yet) and existing table
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_count INT := 0;
  v_rec RECORD;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'integration_event_logs'
  ) INTO v_table_exists;

  IF NOT v_table_exists THEN
    RAISE NOTICE 'Check 8 Info: Table public.integration_event_logs does not exist yet. Check deferred until after migration 0015 is applied.';
  ELSE
    FOR v_rec IN 
      EXECUTE 'SELECT connection_id, external_event_id, count(*) AS cnt, array_agg(id::text) AS ids ' ||
              'FROM public.integration_event_logs ' ||
              'WHERE connection_id IS NOT NULL AND external_event_id IS NOT NULL ' ||
              'GROUP BY connection_id, external_event_id HAVING count(*) > 1'
    LOOP
      v_count := v_count + 1;
      RAISE WARNING 'Check 8 CONFLICT: Duplicate (connection_id, external_event_id) found in event logs: conn %, ext_event %, count %, ids %',
        v_rec.connection_id, v_rec.external_event_id, v_rec.cnt, v_rec.ids;
    END LOOP;
    IF v_count = 0 THEN
      RAISE NOTICE 'Check 8 Passed: public.integration_event_logs exists and has 0 duplicates.';
    END IF;
  END IF;
END $$;

SELECT 
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'integration_event_logs'
    ) THEN 'DEFERRED: public.integration_event_logs does not exist yet (clean pre-migration state). Safe to migrate.'
    ELSE 'TABLE_EXISTS: Check 8 executed dynamically. Verify DO block notices.'
  END AS check_8_event_logs_preflight;

-- ----------------------------------------------------------------------------
-- Check 9: Existing Lead and Organisation Data Distribution
-- ----------------------------------------------------------------------------
SELECT 
  count(*) AS total_existing_leads,
  count(project_id) AS leads_with_project,
  count(*) - count(project_id) AS unmapped_leads_with_null_project,
  count(assigned_to) AS leads_with_assignee,
  count(DISTINCT org_id) AS distinct_organisations
FROM public.leads;
