-- ============================================================================
-- supabase/migrations/20260016_reconcile_tenant_integrity.sql
-- Migration 0016: Production Reconciliation for Tenant Integrity & Immutability
--
-- TARGET DATABASE: Supabase connected to Vercel Production (PostgreSQL 17.11)
-- PREREQUISITES:
--   - Applied migrations: 20260011 through 20260015
--   - Verified preflight checks have run with 0 conflict rows
--
-- DESIGN HIGHLIGHTS:
--   1. Preserves existing production triggers (trg_check_mapping_same_org, etc.).
--   2. Fails safely if conflicting trigger names already exist (no DROP TRIGGER IF EXISTS).
--   3. Null-safe immutability checks using 'IS DISTINCT FROM'.
--   4. Hardened SECURITY DEFINER with fixed search_path = pg_catalog, public, pg_temp.
--   5. Privilege restriction: EXECUTE revoked from PUBLIC, anon, and authenticated.
--   6. Bounded lock wait: lock_timeout = '4s'.
-- ============================================================================

BEGIN;

-- 1. Bounded lock wait: abort transaction if table lock cannot be acquired in 4 seconds
SET LOCAL lock_timeout = '4s';

-- ----------------------------------------------------------------------------
-- 2. Project Organisation Immutability
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_project_org_immutable()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  -- Null-safe comparison prevents bypass via null transitions
  IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Project organisation ownership is immutable (attempted change from % to %)', 
      OLD.org_id, NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Fail safely: does NOT silently drop. Fails with 42710 if trigger already exists.
CREATE TRIGGER trg_project_org_immutable
  BEFORE UPDATE OF org_id ON public.projects
  FOR EACH ROW 
  EXECUTE FUNCTION public.check_project_org_immutable();

-- ----------------------------------------------------------------------------
-- 3. Integration Connection Organisation Immutability
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_connection_org_immutable()
RETURNS TRIGGER 
LANGUAGE plpgsql
AS $$
BEGIN
  -- Null-safe comparison prevents bypass via null transitions
  IF OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Integration connection organisation ownership is immutable (attempted change from % to %)', 
      OLD.org_id, NEW.org_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Fail safely: does NOT silently drop. Fails with 42710 if trigger already exists.
CREATE TRIGGER trg_connection_org_immutable
  BEFORE UPDATE OF org_id ON public.integration_connections
  FOR EACH ROW 
  EXECUTE FUNCTION public.check_connection_org_immutable();

-- ----------------------------------------------------------------------------
-- 4. Lead Project and Organisation Integrity Trigger
--
-- Security hardening:
--   - SECURITY DEFINER allows reliable verification of projects.org_id
--     without false rejections caused by restrictive user-level RLS views.
--   - Fixed search_path = pg_catalog, public, pg_temp prevents path-hijacking.
--   - Schema-qualified queries (public.projects).
--   - No dynamic SQL.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_lead_project_and_org_integrity()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_proj_org UUID;
BEGIN
  -- 4a. Lead organisation ownership is immutable (null-safe comparison)
  IF TG_OP = 'UPDATE' AND OLD.org_id IS DISTINCT FROM NEW.org_id THEN
    RAISE EXCEPTION 'Lead organisation ownership is immutable (attempted change from % to %)', 
      OLD.org_id, NEW.org_id;
  END IF;

  -- 4b. Lead-to-project organisation integrity (null allowed for unmapped leads)
  IF NEW.project_id IS NOT NULL THEN
    SELECT p.org_id INTO v_proj_org 
    FROM public.projects p 
    WHERE p.id = NEW.project_id;

    IF v_proj_org IS NULL THEN
      RAISE EXCEPTION 'Referenced project % does not exist', NEW.project_id;
    END IF;

    IF v_proj_org IS DISTINCT FROM NEW.org_id THEN
      RAISE EXCEPTION 'Lead project must belong to the same organisation (lead.org_id %, project.org_id %)', 
        NEW.org_id, v_proj_org;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- In PostgreSQL, triggers execute functions with trigger internal rights.
-- Calling users do NOT need EXECUTE permission to fire triggers on INSERT/UPDATE.
-- Revoking from PUBLIC, anon, and authenticated eliminates unnecessary attack surface.
REVOKE ALL ON FUNCTION public.check_lead_project_and_org_integrity() FROM PUBLIC, anon, authenticated;

-- Fail safely: does NOT silently drop. Fails with 42710 if trigger already exists.
CREATE TRIGGER trg_lead_project_and_org_integrity
  BEFORE INSERT OR UPDATE OF org_id, project_id ON public.leads
  FOR EACH ROW 
  EXECUTE FUNCTION public.check_lead_project_and_org_integrity();

COMMIT;
