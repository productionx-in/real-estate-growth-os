-- ============================================================================
-- supabase/migrations/20260017_close_inventory_rpc_and_harden_functions.sql
-- Migration 0017: Close Inventory RPC Exposure & Harden SECURITY DEFINER Functions
--
-- TARGET DATABASE: Supabase connected to Vercel Production (PostgreSQL 17.11)
-- PREREQUISITES:
--   - Applied migrations: 20260001 through 20260016
-- ============================================================================

BEGIN;

SET LOCAL lock_timeout = '4s';

-- ----------------------------------------------------------------------------
-- 1. Redefine and Harden transition_inventory_status_atomic
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_inventory_status_atomic(
  p_inventory_id UUID,
  p_expected_status public.inventory_status,
  p_new_status public.inventory_status,
  p_changed_by UUID,
  p_reason TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id UUID,
  org_id UUID,
  project_id UUID,
  unit_number TEXT,
  status public.inventory_status
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_current_status public.inventory_status;
  v_org_id UUID;
  v_project_id UUID;
  v_unit_number TEXT;
  v_is_valid_transition BOOLEAN := FALSE;
  v_actor_role public.member_role;
BEGIN
  -- 1a. Mandatory Actor Validation (Reject null or unsupplied actor)
  IF p_changed_by IS NULL THEN
    RAISE EXCEPTION 'Actor profile ID (p_changed_by) is mandatory and cannot be null';
  END IF;

  -- 1b. Atomic row-level lock on the target unit
  SELECT inv.status, inv.org_id, inv.project_id, inv.unit_number
  INTO v_current_status, v_org_id, v_project_id, v_unit_number
  FROM public.inventory_items inv
  WHERE inv.id = p_inventory_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory unit % not found', p_inventory_id;
  END IF;

  -- 1c. Optimistic concurrency control
  IF v_current_status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'Concurrent modification conflict: inventory status is %, expected %',
      v_current_status, p_expected_status;
  END IF;

  -- 1d. Exact Application State Machine Validation (Preserving types/inventory.ts)
  IF v_current_status = 'available' AND p_new_status IN ('on_hold', 'booked', 'blocked') THEN
    v_is_valid_transition := TRUE;
  ELSIF v_current_status = 'on_hold' AND p_new_status IN ('available', 'booked') THEN
    v_is_valid_transition := TRUE;
  ELSIF v_current_status = 'booked' AND p_new_status IN ('available', 'sold') THEN
    v_is_valid_transition := TRUE;
  ELSIF v_current_status = 'blocked' AND p_new_status = 'available' THEN
    v_is_valid_transition := TRUE;
  END IF;

  IF NOT v_is_valid_transition THEN
    RAISE EXCEPTION 'Illegal status transition: cannot move from % to %',
      v_current_status, p_new_status;
  END IF;

  -- 1e. Trust Boundary Validation:
  -- The function is invoked via service_role, so p_changed_by represents the authenticated
  -- profile forwarded by the trusted API layer. The database validates that p_changed_by
  -- is an active member of v_org_id with a role authorized for this specific transition.
  SELECT om.role INTO v_actor_role
  FROM public.org_members om
  WHERE om.org_id = v_org_id 
    AND om.profile_id = p_changed_by;

  IF v_actor_role IS NULL THEN
    RAISE EXCEPTION 'Permission denied: actor % is not a member of organisation %', 
      p_changed_by, v_org_id;
  END IF;

  IF v_actor_role = 'readonly' THEN
    RAISE EXCEPTION 'Permission denied: readonly accounts cannot change inventory status';
  END IF;

  -- Exact role matrix from app/api/inventory/[inventoryId]/status/route.ts:
  -- 'booked', 'sold', 'blocked' require manager, admin, or owner.
  -- 'available', 'on_hold' allow sales_exec, manager, admin, or owner.
  IF p_new_status IN ('booked', 'sold', 'blocked') AND v_actor_role NOT IN ('owner', 'admin', 'manager') THEN
    RAISE EXCEPTION 'Permission denied: status % requires manager, admin, or owner role (actor has %)', 
      p_new_status, v_actor_role;
  END IF;

  -- 1f. Perform status update
  UPDATE public.inventory_items
  SET status = p_new_status,
      updated_at = pg_catalog.now()
  WHERE public.inventory_items.id = p_inventory_id;

  -- 1g. Append immutable audit history record inside the same ACID transaction
  INSERT INTO public.inventory_status_history (
    inventory_id,
    org_id,
    previous_status,
    new_status,
    changed_by,
    reason,
    metadata,
    created_at
  ) VALUES (
    p_inventory_id,
    v_org_id,
    v_current_status,
    p_new_status,
    p_changed_by,
    p_reason,
    p_metadata,
    pg_catalog.now()
  );

  RETURN QUERY
  SELECT p_inventory_id, v_org_id, v_project_id, v_unit_number, p_new_status;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1h. Revoke External PostgREST Execution Grants
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.transition_inventory_status_atomic(
  UUID, public.inventory_status, public.inventory_status, UUID, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;

-- Retain execute strictly for trusted service role and database administrator
GRANT EXECUTE ON FUNCTION public.transition_inventory_status_atomic(
  UUID, public.inventory_status, public.inventory_status, UUID, TEXT, JSONB
) TO service_role, postgres;

-- ----------------------------------------------------------------------------
-- 2. Harden Helper Functions with Fixed search_path (Preserving RLS Grants)
-- ----------------------------------------------------------------------------
ALTER FUNCTION public.auth_profile_id() SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.auth_is_member_of_org(uuid) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.auth_has_role_in_org(uuid, text[]) SET search_path = pg_catalog, public, pg_temp;
ALTER FUNCTION public.auth_org_id() SET search_path = pg_catalog, public, pg_temp;

-- ----------------------------------------------------------------------------
-- 3. Harden Trigger-Only Functions (Revoke Unnecessary Direct Execution)
-- ----------------------------------------------------------------------------
-- Triggers run under system/trigger internal rights; direct EXECUTE is not required.
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public, pg_temp;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO postgres, service_role;

-- Re-qualify auto_assign_lead queries to ensure safe execution
CREATE OR REPLACE FUNCTION public.auto_assign_lead()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_assignee_id UUID;
BEGIN
  IF NEW.assigned_to IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT om.profile_id
  INTO v_assignee_id
  FROM public.org_members om
  WHERE om.org_id = NEW.org_id
    AND om.role = 'sales_exec'
  ORDER BY (
    SELECT count(*)
    FROM public.leads l
    WHERE l.assigned_to = om.profile_id
      AND l.org_id = NEW.org_id
      AND l.status NOT IN ('booked', 'lost', 'junk')
  ) ASC,
  om.joined_at ASC
  LIMIT 1;

  IF v_assignee_id IS NOT NULL THEN
    NEW.assigned_to := v_assignee_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.auto_assign_lead() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_assign_lead() TO postgres, service_role;

COMMIT;
