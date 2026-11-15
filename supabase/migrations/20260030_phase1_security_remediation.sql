-- Migration 0030: 20260030_phase1_security_remediation.sql
-- Production X: Phase 1 Security Fix Pass
-- 1. Tighten reserve_employee_seat_atomic authorization & role restrictions inside SECURITY DEFINER
-- 2. Transactional organisation provisioning stored procedure (single atomic DB operation)
-- 3. Append-only WORM triggers & strict INSERT security on platform_audit_logs
BEGIN;

-- ============================================================================
-- 1. SECURE THE INVITATION RPC: reserve_employee_seat_atomic()
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reserve_employee_seat_atomic(
  p_org_id UUID,
  p_email TEXT,
  p_role public.member_role,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (success BOOLEAN, invitation_id UUID, raw_token TEXT, error_message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_auth_id UUID;
  v_caller_profile_id UUID;
  v_caller_role public.member_role;
  v_sub RECORD;
  v_total_allowed_seats INTEGER;
  v_purchased_additional_seats INTEGER;
  v_active_members INTEGER;
  v_pending_invites INTEGER;
  v_new_invitation_id UUID;
  v_raw_token TEXT;
  v_token_hash TEXT;
BEGIN
  -- 1. Derive caller identity strictly from authenticated auth.uid()
  v_caller_auth_id := auth.uid();
  IF v_caller_auth_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Unauthorised: Authentication required.'::TEXT;
    RETURN;
  END IF;

  -- 2. Verify caller is an ACTIVE member of the specified organisation and resolve profile
  SELECT p.id, om.role INTO v_caller_profile_id, v_caller_role
  FROM public.profiles p
  JOIN public.org_members om ON om.profile_id = p.id
  WHERE p.auth_user_id = v_caller_auth_id
    AND om.org_id = p_org_id
    AND om.status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: Caller is not an active member of this organisation.'::TEXT;
    RETURN;
  END IF;

  -- 3. Verify invitation authority (only owner or admin can invite)
  IF v_caller_role NOT IN ('owner'::public.member_role, 'admin'::public.member_role) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: Only owners and admins can invite team members.'::TEXT;
    RETURN;
  END IF;

  -- 4. Reject assigning owner role through ordinary employee invitation
  -- The owner role cannot be assigned via employee invitation. Only non-owner roles are permitted.
  IF p_role = 'owner'::public.member_role THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: The owner role cannot be assigned via employee invitation.'::TEXT;
    RETURN;
  END IF;

  -- 5. Validate the requested role against approved invitation roles
  IF p_role NOT IN ('admin'::public.member_role, 'manager'::public.member_role, 'sales_exec'::public.member_role, 'readonly'::public.member_role) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Invalid role: Requested role is not an approved member invitation role.'::TEXT;
    RETURN;
  END IF;

  -- 6. CRITICAL CONCURRENCY SAFEGUARD: Lock subscription row FIRST to serialize reservations
  SELECT s.id, s.status, s.is_read_only, s.included_seats, s.additional_seats
  INTO v_sub
  FROM public.org_subscriptions s
  WHERE s.org_id = p_org_id
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'No active subscription found for organisation.'::TEXT;
    RETURN;
  END IF;

  IF v_sub.is_read_only THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Workspace is locked in read-only mode due to expired subscription.'::TEXT;
    RETURN;
  END IF;

  IF v_sub.status NOT IN ('active', 'trial') THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Subscription status does not permit adding new members.'::TEXT;
    RETURN;
  END IF;

  -- 7. RECHECK UNDER LOCK: Verify no existing active pending invitation for this email in this org
  IF EXISTS (
    SELECT 1 FROM public.org_invitations
    WHERE org_id = p_org_id
      AND lower(email) = lower(trim(p_email))
      AND status = 'pending'
      AND expires_at > now()
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'An active pending invitation already exists for this email address.'::TEXT;
    RETURN;
  END IF;

  -- 8. RECHECK UNDER LOCK: Verify target email is not already an active member in this org
  IF EXISTS (
    SELECT 1 FROM public.org_members om
    JOIN public.profiles p ON p.id = om.profile_id
    JOIN auth.users u ON u.id = p.auth_user_id
    WHERE om.org_id = p_org_id
      AND om.status = 'active'
      AND lower(u.email) = lower(trim(p_email))
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'User is already an active member of this organisation.'::TEXT;
    RETURN;
  END IF;

  -- 9. Compute total seats preserving organisation-specific contract & add-ons
  SELECT COALESCE(SUM(seats_added), 0)::INTEGER INTO v_purchased_additional_seats
  FROM public.org_subscription_seat_purchases
  WHERE org_id = p_org_id AND status = 'active';

  v_total_allowed_seats := v_sub.included_seats + v_sub.additional_seats + v_purchased_additional_seats;

  -- 10. Count active members and unexpired pending invitations under lock
  SELECT COUNT(*)::INTEGER INTO v_active_members
  FROM public.org_members
  WHERE org_id = p_org_id AND status = 'active';

  SELECT COUNT(*)::INTEGER INTO v_pending_invites
  FROM public.org_invitations
  WHERE org_id = p_org_id AND status = 'pending' AND expires_at > now();

  -- 11. Assert capacity
  IF (v_active_members + v_pending_invites + 1) > v_total_allowed_seats THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
      format('Seat limit reached (%s/%s seats). Please purchase additional seats before inviting staff.',
             (v_active_members + v_pending_invites), v_total_allowed_seats)::TEXT;
    RETURN;
  END IF;

  -- 12. Cryptographically Secure Server-Side Token Generation
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  -- 13. Atomically insert invitation reservation
  INSERT INTO public.org_invitations (
    org_id, invited_by, email, role, token_hash, status, expires_at
  ) VALUES (
    p_org_id, v_caller_profile_id, lower(trim(p_email)), p_role, v_token_hash, 'pending', p_expires_at
  ) RETURNING id INTO v_new_invitation_id;

  RETURN QUERY SELECT true, v_new_invitation_id, v_raw_token, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_employee_seat_atomic(UUID, TEXT, public.member_role, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_employee_seat_atomic(UUID, TEXT, public.member_role, TIMESTAMPTZ) TO authenticated, service_role;


-- ============================================================================
-- 2. ATOMIC ORGANISATION PROVISIONING STORED PROCEDURE
-- ============================================================================

CREATE OR REPLACE FUNCTION public.provision_organisation_atomic(
  p_actor_auth_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_org_type public.org_type,
  p_plan_tier TEXT,
  p_included_seats INTEGER,
  p_billing_cycle TEXT,
  p_admin_email TEXT,
  p_admin_name TEXT,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ,
  p_onboarding_request_id UUID DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID,
  org_slug TEXT,
  subscription_id UUID,
  invitation_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor_platform_user_id UUID;
  v_actor_role public.platform_role;
  v_actor_profile_id UUID;
  v_new_org_id UUID;
  v_plan_version_id UUID;
  v_new_sub_id UUID;
  v_new_invite_id UUID;
  v_legacy_plan public.org_plan;
BEGIN
  -- A. Verify caller is an active Platform Super Admin
  SELECT id, role INTO v_actor_platform_user_id, v_actor_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id
    AND is_active = true;

  IF NOT FOUND OR v_actor_role != 'super_admin'::public.platform_role THEN
    RAISE EXCEPTION 'Forbidden: Only Platform Super Admins can provision organisations.';
  END IF;

  -- B. Resolve or create profile for actor
  SELECT id INTO v_actor_profile_id
  FROM public.profiles
  WHERE auth_user_id = p_actor_auth_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (auth_user_id, full_name)
    VALUES (p_actor_auth_id, COALESCE(p_admin_name, 'Platform Super Admin'))
    RETURNING id INTO v_actor_profile_id;
  END IF;

  -- C. Validate slug uniqueness
  IF EXISTS (SELECT 1 FROM public.organisations WHERE slug = p_org_slug) THEN
    RAISE EXCEPTION 'Conflict: Organisation slug "%" is already in use.', p_org_slug;
  END IF;

  -- D. Validate seats
  IF p_included_seats < 1 THEN
    RAISE EXCEPTION 'Validation: Included seats must be at least 1.';
  END IF;

  -- E. Determine legacy plan enum value for compatibility
  IF p_plan_tier = 'free' THEN
    v_legacy_plan := 'free'::public.org_plan;
  ELSIF p_plan_tier = 'enterprise' THEN
    v_legacy_plan := 'enterprise'::public.org_plan;
  ELSE
    v_legacy_plan := 'growth'::public.org_plan;
  END IF;

  -- F. Create Organisation Record
  INSERT INTO public.organisations (name, slug, type, plan)
  VALUES (trim(p_org_name), trim(p_org_slug), p_org_type, v_legacy_plan)
  RETURNING id INTO v_new_org_id;

  -- G. Resolve current plan version for target plan
  SELECT pv.id INTO v_plan_version_id
  FROM public.subscription_plan_versions pv
  JOIN public.subscription_plans sp ON sp.id = pv.plan_id
  WHERE (sp.code = p_plan_tier OR sp.code = (p_org_type::text || '_legacy_v1'))
    AND pv.is_current = true
  LIMIT 1;

  -- H. Create Subscription Record
  INSERT INTO public.org_subscriptions (
    org_id,
    plan_tier,
    plan_version_id,
    included_seats,
    additional_seats,
    status,
    billing_cycle,
    current_period_start,
    current_period_end
  ) VALUES (
    v_new_org_id,
    p_plan_tier,
    v_plan_version_id,
    p_included_seats,
    0,
    'active',
    p_billing_cycle,
    now(),
    CASE WHEN p_billing_cycle = 'annual' THEN now() + INTERVAL '365 days' ELSE now() + INTERVAL '30 days' END
  ) RETURNING id INTO v_new_sub_id;

  -- I. Create Primary Owner Invitation Record
  INSERT INTO public.org_invitations (
    org_id,
    invited_by,
    email,
    role,
    token_hash,
    status,
    expires_at
  ) VALUES (
    v_new_org_id,
    v_actor_profile_id,
    lower(trim(p_admin_email)),
    'owner'::public.member_role,
    p_token_hash,
    'pending',
    p_expires_at
  ) RETURNING id INTO v_new_invite_id;

  -- J. Update Onboarding Request (if linked)
  IF p_onboarding_request_id IS NOT NULL THEN
    UPDATE public.customer_onboarding_requests
    SET
      status = 'provisioned'::public.onboarding_request_status,
      provisioned_org_id = v_new_org_id,
      reviewed_by = p_actor_auth_id,
      reviewed_at = now(),
      updated_at = now()
    WHERE id = p_onboarding_request_id;
  END IF;

  -- K. Write Immutable Platform Audit Log
  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    ip_address,
    user_agent
  ) VALUES (
    p_actor_auth_id,
    'super_admin'::public.platform_role,
    'organisation.provision',
    'organisation',
    v_new_org_id,
    jsonb_build_object(
      'name', trim(p_org_name),
      'slug', trim(p_org_slug),
      'type', p_org_type::text,
      'plan_tier', p_plan_tier,
      'included_seats', p_included_seats,
      'billing_cycle', p_billing_cycle,
      'admin_email', lower(trim(p_admin_email)),
      'invitation_id', v_new_invite_id,
      'onboarding_request_id', p_onboarding_request_id
    ),
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT v_new_org_id, trim(p_org_slug), v_new_sub_id, v_new_invite_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_organisation_atomic(
  UUID, TEXT, TEXT, public.org_type, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.provision_organisation_atomic(
  UUID, TEXT, TEXT, public.org_type, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT
) TO service_role;


-- ============================================================================
-- 3. AUDIT IMMUTABILITY TRIGGER & RLS HARDENING
-- ============================================================================

-- Strengthen audit log trigger function to reject both UPDATE and DELETE explicitly
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Security Violation: platform_audit_logs records are immutable and cannot be updated.';
  ELSIF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Security Violation: platform_audit_logs records are append-only and cannot be deleted.';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_immutable_platform_audit_logs ON public.platform_audit_logs;
CREATE TRIGGER trg_immutable_platform_audit_logs
  BEFORE UPDATE OR DELETE ON public.platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Ensure direct mutations on platform_audit_logs remain completely revoked from all standard roles
REVOKE ALL ON TABLE public.platform_audit_logs FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.platform_audit_logs FROM authenticated;
GRANT SELECT ON TABLE public.platform_audit_logs TO authenticated;

COMMIT;
