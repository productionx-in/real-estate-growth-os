-- ============================================================================
-- READ-ONLY PREFLIGHT CHECK FOR MIGRATION 20260015
-- Run against database BEFORE applying migration 20260015_crm_integration_readiness.sql.
-- This script is completely read-only. It performs NO writes, deletions or merges.
-- ============================================================================

-- Check 1: Verify core parent tables exist
SELECT table_name, 'PARENT_TABLE_EXISTS' AS status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('organisations', 'projects', 'profiles', 'leads');

-- Check 2: Verify RLS helper security functions exist
SELECT proname, 'SECURITY_FUNCTION_EXISTS' AS status
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND proname IN ('auth_is_member_of_org', 'auth_has_role_in_org', 'update_updated_at_column');

-- Check 3: Check whether any of the new tables already exist (collision check)
SELECT table_name, 'TABLE_ALREADY_EXISTS_WARNING' AS status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('integration_connections', 'integration_project_mappings', 'integration_event_logs');

-- Check 4: Check whether any of the new column names on leads already exist
SELECT column_name, 'COLUMN_ALREADY_EXISTS_WARNING' AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leads'
  AND column_name IN (
    'source_platform', 'campaign_name', 'campaign_id', 'ad_name', 'ad_id',
    'form_name', 'form_id', 'external_lead_id', 'source_url', 'connection_id',
    'source_metadata', 'idempotency_key', 'is_duplicate', 'duplicate_of_id'
  );

-- Check 5: Verify existing lead record distribution and integrity
SELECT 
  count(*) AS total_existing_leads,
  count(project_id) AS leads_with_project,
  count(assigned_to) AS leads_with_assignee,
  count(DISTINCT org_id) AS distinct_organisations
FROM public.leads;

-- Check 6: Verify existing lead_source enum values
SELECT enumlabel 
FROM pg_enum 
WHERE enumtypid = 'lead_source'::regtype;
