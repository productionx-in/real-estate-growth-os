-- Migration 20260037: require_active_membership_everywhere
-- REGrow — completes the M0 "only an active membership grants access" rule at the database layer.
--
-- Found while building lead routing (M1):
--   1. auth_is_member_of_org() — used by RLS SELECT policies — ignored org_members.status, so a
--      deactivated or suspended member could still read their former organisation's rows through the
--      user (RLS) client. (auth_has_role_in_org() already required status = 'active' since 0028.)
--   2. validate_lead_assigned_to() (trigger on leads) accepted deactivated/suspended members as assignees.
--   3. auto_assign_lead() (legacy distribution) could pick deactivated/suspended sales executives.
-- This migration only narrows access; it does not modify any row.

BEGIN;

-- 1. RLS membership helper: active members only
CREATE OR REPLACE FUNCTION public.auth_is_member_of_org(check_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_id = check_org_id
      AND profile_id = public.auth_profile_id()
      AND status = 'active'
  );
$$;

-- 2. Lead assignee must be an ACTIVE, non-readonly member
CREATE OR REPLACE FUNCTION public.validate_lead_assigned_to()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_assignee_role public.member_role;
BEGIN
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to OR NEW.org_id IS DISTINCT FROM OLD.org_id) THEN
    SELECT om.role INTO v_assignee_role
    FROM public.org_members om
    WHERE om.org_id = NEW.org_id
      AND om.profile_id = NEW.assigned_to
      AND om.status = 'active';

    IF v_assignee_role IS NULL THEN
      RAISE EXCEPTION 'Assignment rejected: assignee is not an active member of this organisation'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_assignee_role = 'readonly' THEN
      RAISE EXCEPTION 'Assignment rejected: readonly members cannot be assigned leads'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_lead_assigned_to() FROM PUBLIC, anon, authenticated;

-- 3. Legacy distribution: active sales executives only (superseded per organisation by routing rules in 0038)
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
    AND om.status = 'active'
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
