-- Migration 0028: 20260028_tenant_isolation_rls_hardening.sql
-- Production X Tenant Isolation Hardening: Enforces Active Membership
BEGIN;

CREATE OR REPLACE FUNCTION public.auth_has_role_in_org(
  check_org_id UUID,
  allowed_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.org_members om
    JOIN public.profiles p ON p.id = om.profile_id
    WHERE om.org_id = check_org_id
      AND p.auth_user_id = auth.uid()
      AND om.role::text = ANY(allowed_roles)
      AND om.status = 'active' -- CRITICAL SECURITY ENFORCEMENT: Rejects deactivated and suspended members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auth_has_role_in_org(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_has_role_in_org(UUID, TEXT[]) TO authenticated, service_role;

COMMIT;
