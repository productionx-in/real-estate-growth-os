-- ============================================================================
-- READ-ONLY PREFLIGHT AUDIT BEFORE MIGRATIONS 0016, 0017, and 0018
-- Run against database BEFORE applying the reconciliation migrations.
-- This script is 100% read-only. It performs NO writes, updates, or deletions.
-- A ready database MUST return ZERO CONFLICT ROWS.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- SECTION 1: Migration 0016 Tenant Integrity & Immutability Preflight
-- ----------------------------------------------------------------------------

-- Check 1.1: Existing Cross-Tenant Lead-to-Project References
SELECT 
  l.id AS conflicting_lead_id,
  l.name AS lead_name,
  l.org_id AS lead_org_id,
  l.project_id AS referenced_project_id,
  p.org_id AS project_org_id,
  'CONFLICT: Lead belongs to a different organisation than its assigned project' AS issue
FROM public.leads l
JOIN public.projects p ON l.project_id = p.id
WHERE l.project_id IS NOT NULL 
  AND l.org_id IS DISTINCT FROM p.org_id;

-- Check 1.2: Existing Orphaned Lead-to-Project References
SELECT 
  l.id AS orphaned_lead_id,
  l.name AS lead_name,
  l.org_id AS lead_org_id,
  l.project_id AS missing_project_id,
  'CONFLICT: Lead references a project_id that does not exist in public.projects' AS issue
FROM public.leads l
LEFT JOIN public.projects p ON l.project_id = p.id
WHERE l.project_id IS NOT NULL 
  AND p.id IS NULL;

-- Check 1.3: Existing Cross-Tenant Connection References on Leads
SELECT 
  l.id AS conflicting_lead_id,
  l.name AS lead_name,
  l.org_id AS lead_org_id,
  l.connection_id,
  c.org_id AS connection_org_id,
  'CONFLICT: Lead belongs to a different organisation than its integration connection' AS issue
FROM public.leads l
JOIN public.integration_connections c ON l.connection_id = c.id
WHERE l.connection_id IS NOT NULL 
  AND l.org_id IS DISTINCT FROM c.org_id;

-- Check 1.4: Existing Cross-Tenant Duplicate References on Leads
SELECT 
  l.id AS conflicting_lead_id,
  l.name AS lead_name,
  l.org_id AS lead_org_id,
  l.duplicate_of_id,
  d.org_id AS original_lead_org_id,
  'CONFLICT: duplicate_of_id links to a lead in a different organisation' AS issue
FROM public.leads l
JOIN public.leads d ON l.duplicate_of_id = d.id
WHERE l.duplicate_of_id IS NOT NULL 
  AND l.org_id IS DISTINCT FROM d.org_id;

-- Check 1.5: Unambiguous Null Organisation IDs Check
SELECT 'projects' AS table_name, id AS record_id, 'Null org_id found on project record' AS issue
FROM public.projects WHERE org_id IS NULL
UNION ALL
SELECT 'leads' AS table_name, id AS record_id, 'Null org_id found on lead record' AS issue
FROM public.leads WHERE org_id IS NULL
UNION ALL
SELECT 'integration_connections' AS table_name, id AS record_id, 'Null org_id found on connection record' AS issue
FROM public.integration_connections WHERE org_id IS NULL;

-- Check 1.6: Name Collision Check for Intended Migration 0016 Triggers
SELECT 
  tgrelid::regclass AS table_name,
  tgname AS existing_trigger_name,
  'CONFLICT: Trigger name already exists. Migration 0016 will fail safely.' AS issue
FROM pg_trigger
WHERE tgname IN (
  'trg_project_org_immutable',
  'trg_connection_org_immutable',
  'trg_lead_project_and_org_integrity'
);

-- ----------------------------------------------------------------------------
-- SECTION 2: Migration 0017 Inventory RPC & Function Security Preflight
-- ----------------------------------------------------------------------------

-- Check 2.1: Verify target functions exist before altering
SELECT 
  proname,
  prosecdef AS is_security_definer,
  proconfig AS current_search_path,
  'INFO: Function state prior to hardening' AS note
FROM pg_proc
WHERE proname IN (
  'transition_inventory_status_atomic',
  'auth_profile_id',
  'auth_is_member_of_org',
  'auth_has_role_in_org',
  'auth_org_id',
  'handle_new_user',
  'auto_assign_lead'
);

-- Check 2.2: Verify inventory tables exist
SELECT 
  table_name,
  'OK: Table exists' AS status
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('inventory_items', 'inventory_status_history');

-- ----------------------------------------------------------------------------
-- SECTION 3: Migration 0018 Multi-Tenant Policies & Hierarchy Preflight
-- ----------------------------------------------------------------------------

-- Check 3.1: Hierarchy Node Cross-Tenant or Cross-Project Parent Reference Check
SELECT 
  c.id AS child_node_id,
  c.name AS child_name,
  c.org_id AS child_org_id,
  c.project_id AS child_proj_id,
  p.id AS parent_node_id,
  p.org_id AS parent_org_id,
  p.project_id AS parent_proj_id,
  CASE 
    WHEN c.org_id IS DISTINCT FROM p.org_id THEN 'CONFLICT: Child and parent belong to different organisations'
    WHEN c.project_id IS DISTINCT FROM p.project_id THEN 'CONFLICT: Child and parent belong to different projects'
  END AS issue
FROM public.project_hierarchy_nodes c
JOIN public.project_hierarchy_nodes p ON c.parent_id = p.id
WHERE c.parent_id IS NOT NULL 
  AND (c.org_id IS DISTINCT FROM p.org_id OR c.project_id IS DISTINCT FROM p.project_id);

-- Check 3.2: Hierarchy Cycles and Depth Boundary Check in Existing Data
WITH RECURSIVE node_tree AS (
  SELECT 
    id, 
    parent_id, 
    project_id,
    1 AS depth, 
    ARRAY[id] AS visited,
    FALSE AS is_cycle
  FROM public.project_hierarchy_nodes
  WHERE parent_id IS NULL
  UNION ALL
  SELECT 
    c.id, 
    c.parent_id, 
    c.project_id,
    nt.depth + 1, 
    nt.visited || c.id,
    c.id = ANY(nt.visited) AS is_cycle
  FROM public.project_hierarchy_nodes c
  JOIN node_tree nt ON c.parent_id = nt.id
  WHERE NOT nt.is_cycle AND nt.depth < 25
)
SELECT 
  id AS node_id,
  project_id,
  depth,
  is_cycle,
  CASE 
    WHEN is_cycle THEN 'CONFLICT: Cycle detected in existing hierarchy'
    WHEN depth > 20 THEN 'CONFLICT: Node exceeds maximum depth of 20 levels'
  END AS issue
FROM node_tree
WHERE is_cycle OR depth > 20;

-- Check 3.3: Self-referencing Hierarchy Nodes Check
SELECT 
  id AS node_id, 
  name, 
  parent_id, 
  'CONFLICT: Node is its own parent' AS issue
FROM public.project_hierarchy_nodes
WHERE id = parent_id;

-- Check 3.4: Leads with Cross-Tenant or Non-Member Assigned_To
SELECT 
  l.id AS lead_id,
  l.name AS lead_name,
  l.org_id AS lead_org_id,
  l.assigned_to,
  om.role AS assignee_role,
  CASE 
    WHEN om.profile_id IS NULL THEN 'CONFLICT: Assignee is not a member of the lead organisation'
    WHEN om.role = 'readonly' THEN 'CONFLICT: Assignee has readonly role and cannot hold lead assignments'
  END AS issue
FROM public.leads l
LEFT JOIN public.org_members om 
  ON om.org_id = l.org_id AND om.profile_id = l.assigned_to
WHERE l.assigned_to IS NOT NULL 
  AND (om.profile_id IS NULL OR om.role = 'readonly');

-- Check 3.5: Current Policy Inventory on Target 5 Tables
-- Shows existing policies that will be dropped and replaced
SELECT 
  tablename, 
  policyname, 
  roles::text AS target_roles,
  cmd AS command
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('leads', 'lead_activities', 'lead_assignments', 'project_hierarchy_nodes', 'inventory_status_history')
ORDER BY tablename, policyname;
