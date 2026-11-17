-- 20260048_function_grant_hardening.sql
-- Closes function grants flagged by the Supabase security advisor after the Phase 0–6 release.
--
-- 1. increment_rate_limit — meant for the server only (20260019 granted it to service_role but never revoked the
--    default PUBLIC grant), so anyone with the public API key could inflate webhook rate-limit buckets and get
--    real lead deliveries refused. Server only now.
-- 2. verify_invitation_token — the app validates invitations on the server with the service role; nothing signed
--    in or anonymous needs to call it. Server only now.
-- 3. enforce_onboarding_request_field_immutability — a trigger function; triggers do not need EXECUTE grants.
-- 4. reserve_employee_seat_atomic — signed-in owners/admins use it (it checks auth.uid() and the caller's role
--    itself and already refuses anonymous callers); the anonymous grant is removed as defence in depth.
-- 5. Fixed search_path on functions that had none, so a caller cannot redirect unqualified names to their own
--    objects. 'extensions' stays on the path for pgcrypto/uuid helpers.
--
-- Deliberately unchanged: auth_has_role_in_org, auth_is_member_of_org, auth_is_platform_role, auth_org_id,
-- auth_profile_id. Row-level-security policies call them as the querying user, and they only describe that
-- user (anonymous callers get NULL/false), so they must stay executable.

BEGIN;

REVOKE ALL ON FUNCTION public.increment_rate_limit(TEXT, BIGINT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(TEXT, BIGINT, BIGINT) TO service_role;

REVOKE ALL ON FUNCTION public.verify_invitation_token(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_invitation_token(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.enforce_onboarding_request_field_immutability() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.reserve_employee_seat_atomic(UUID, TEXT, public.member_role, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reserve_employee_seat_atomic(UUID, TEXT, public.member_role, TIMESTAMPTZ) TO authenticated, service_role;

DO $$
DECLARE f REGPROCEDURE;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('update_updated_at_column', 'auth_app_role', 'is_manager', 'is_admin', 'custom_access_token_hook',
                        'validate_hierarchy_node_consistency', 'validate_inventory_item_integrity', 'check_mapping_same_org',
                        'check_lead_duplicate_same_org', 'check_lead_integration_same_org', 'check_project_org_immutable',
                        'check_connection_org_immutable', 'prevent_audit_log_mutation', 'prevent_bootstrap_state_mutation')
      AND NOT coalesce(array_to_string(p.proconfig, ',') LIKE '%search_path=%pg_catalog%', false)
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = pg_catalog, public, extensions, pg_temp', f);
  END LOOP;
END $$;

COMMIT;
