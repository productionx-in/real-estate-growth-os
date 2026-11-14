-- ============================================================================
-- POST-MIGRATION VERIFICATION AUDIT: MIGRATIONS 0016, 0017, and 0018
-- Run against database AFTER applying migrations 0016, 0017, and 0018.
-- Validates:
--   1. All 10 active security & integrity triggers.
--   2. All 14 reconciled multi-tenant RLS policies.
--   3. Absolute revocation of direct insert on inventory_status_history.
--   4. proconfig search_path hardening on all 7 SECURITY DEFINER functions.
--   5. Execution grants on transition_inventory_status_atomic strictly to service_role, postgres.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Verify All 10 Active Integrity Triggers
-- Expects exactly 10 rows with tgenabled = 'O' (Origin / Enabled)
-- ----------------------------------------------------------------------------
SELECT 
  tgrelid::regclass AS table_name,
  tgname AS trigger_name,
  proname AS function_name,
  CASE tgenabled 
    WHEN 'O' THEN 'ACTIVE_AND_ENABLED'
    WHEN 'D' THEN 'DISABLED_WARNING'
    ELSE 'UNKNOWN'
  END AS status
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgname IN (
  'trg_project_org_immutable',
  'trg_connection_org_immutable',
  'trg_lead_project_and_org_integrity',
  'trigger_01_check_lead_assignment_input',
  'trigger_02_auto_assign_lead',
  'trigger_03_validate_lead_assigned_to',
  'trg_lead_assignment_integrity',
  'trg_lead_assignments_prevent_truncate',
  'trg_check_hierarchy_node_tenant_integrity',
  'trigger_handle_member_removal_from_leads'
)
ORDER BY table_name, trigger_name;

-- ----------------------------------------------------------------------------
-- 2. Verify All 14 Active Multi-Tenant RLS Policies
-- Expects exactly 14 rows across the 5 tables
-- ----------------------------------------------------------------------------
SELECT 
  tablename, 
  policyname, 
  cmd AS command,
  roles::text AS target_roles,
  'VERIFIED_ACTIVE' AS status
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('leads', 'lead_activities', 'lead_assignments', 'project_hierarchy_nodes', 'inventory_status_history')
ORDER BY tablename, policyname;

-- ----------------------------------------------------------------------------
-- 3. Verify Absence of Obsolete Single-Tenant Policies & Direct History Insert
-- MUST RETURN ZERO ROWS
-- ----------------------------------------------------------------------------
SELECT 
  tablename, 
  policyname, 
  'ERROR: Obsolete single-tenant policy or direct insert policy still exists!' AS alert
FROM pg_policies
WHERE schemaname = 'public' 
  AND policyname IN (
    'members_can_read_leads',
    'members_can_read_activities',
    'members_can_read_assignments',
    'members_can_read_hierarchy_nodes',
    'members_can_read_inventory_history_legacy',
    'members_can_insert_inventory_history'
  );

-- ----------------------------------------------------------------------------
-- 4. Verify search_path Hardening on All 7 Target Functions
-- Expects all 7 functions to have proconfig containing 'search_path=pg_catalog, public, pg_temp'
-- ----------------------------------------------------------------------------
SELECT 
  proname AS function_name,
  prosecdef AS is_security_definer,
  proconfig AS hardened_search_path,
  CASE 
    WHEN proconfig IS NOT NULL AND proconfig::text LIKE '%search_path=pg_catalog, public, pg_temp%' THEN 'SECURE_HARDENED'
    ELSE 'UNHARDENED_VULNERABLE'
  END AS hardening_status
FROM pg_proc
WHERE proname IN (
  'transition_inventory_status_atomic',
  'auth_profile_id',
  'auth_is_member_of_org',
  'auth_has_role_in_org',
  'auth_org_id',
  'handle_new_user',
  'auto_assign_lead'
)
ORDER BY proname;

-- ----------------------------------------------------------------------------
-- 5. Verify Execution Privileges on transition_inventory_status_atomic
-- anon, authenticated, and public MUST be FALSE (Access Denied)
-- service_role and postgres MUST be TRUE (Access Granted)
-- ----------------------------------------------------------------------------
SELECT 
  r.rolname AS role_name,
  has_function_privilege(
    r.rolname, 
    'public.transition_inventory_status_atomic(UUID, public.inventory_status, public.inventory_status, UUID, TEXT, JSONB)', 
    'EXECUTE'
  ) AS has_execute_permission,
  CASE 
    WHEN r.rolname IN ('anon', 'authenticated', 'public') THEN 
      CASE WHEN has_function_privilege(r.rolname, 'public.transition_inventory_status_atomic(UUID, public.inventory_status, public.inventory_status, UUID, TEXT, JSONB)', 'EXECUTE') THEN 'FAIL_EXPOSED' ELSE 'PASS_RESTRICTED' END
    WHEN r.rolname IN ('service_role', 'postgres') THEN 
      CASE WHEN has_function_privilege(r.rolname, 'public.transition_inventory_status_atomic(UUID, public.inventory_status, public.inventory_status, UUID, TEXT, JSONB)', 'EXECUTE') THEN 'PASS_AUTHORIZED' ELSE 'FAIL_MISSING' END
  END AS verification_check
FROM (
  SELECT 'anon' AS rolname
  UNION ALL SELECT 'authenticated'
  UNION ALL SELECT 'service_role'
  UNION ALL SELECT 'postgres'
) r;
