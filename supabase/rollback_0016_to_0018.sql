-- ============================================================================
-- EMERGENCY ROLLBACK SCRIPT FOR MIGRATIONS 0016, 0017, and 0018
-- Removes ONLY objects introduced or modified by Migrations 0016, 0017, and 0018.
-- Does NOT drop or alter existing production tables or historical customer data.
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';

-- ----------------------------------------------------------------------------
-- Rollback Migration 0018
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_handle_member_removal_from_leads ON public.org_members;
DROP FUNCTION IF EXISTS public.handle_member_removal_from_leads();

DROP TRIGGER IF EXISTS trg_check_hierarchy_node_tenant_integrity ON public.project_hierarchy_nodes;
DROP FUNCTION IF EXISTS public.check_hierarchy_node_tenant_integrity();

DROP TRIGGER IF EXISTS trg_lead_assignments_prevent_truncate ON public.lead_assignments;
DROP FUNCTION IF EXISTS public.prevent_lead_assignment_truncate();

DROP TRIGGER IF EXISTS trg_lead_assignment_integrity ON public.lead_assignments;
DROP FUNCTION IF EXISTS public.check_lead_assignment_integrity();

DROP TRIGGER IF EXISTS trigger_03_validate_lead_assigned_to ON public.leads;
DROP FUNCTION IF EXISTS public.validate_lead_assigned_to();

DROP TRIGGER IF EXISTS trigger_02_auto_assign_lead ON public.leads;

DROP TRIGGER IF EXISTS trigger_01_check_lead_assignment_input ON public.leads;
DROP FUNCTION IF EXISTS public.check_lead_assignment_input();

-- ----------------------------------------------------------------------------
-- Rollback Migration 0016
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_lead_project_and_org_integrity ON public.leads;
DROP FUNCTION IF EXISTS public.check_lead_project_and_org_integrity();

DROP TRIGGER IF EXISTS trg_connection_org_immutable ON public.integration_connections;
DROP FUNCTION IF EXISTS public.check_connection_org_immutable();

DROP TRIGGER IF EXISTS trg_project_org_immutable ON public.projects;
DROP FUNCTION IF EXISTS public.check_project_org_immutable();

COMMIT;
