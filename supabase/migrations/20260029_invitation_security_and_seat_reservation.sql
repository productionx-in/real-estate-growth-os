-- Migration 0029: 20260029_invitation_security_and_seat_reservation.sql
-- Production X Authoritative Invitation Security, Dynamic Plans & Atomic Seat Reservation
BEGIN;

-- 1. Base Subscription Plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target_org_type public.org_type NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Versioned Plan Configurations
CREATE TABLE IF NOT EXISTS public.subscription_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  included_seats INTEGER NOT NULL CHECK (included_seats >= 0),
  max_projects INTEGER,
  max_inventory_units INTEGER,
  max_storage_bytes BIGINT,
  max_integrations INTEGER,
  intelligence_credits_monthly INTEGER,
  currency TEXT NOT NULL DEFAULT 'INR',
  base_price_monthly_cents BIGINT NOT NULL DEFAULT 0,
  base_price_annual_cents BIGINT NOT NULL DEFAULT 0,
  additional_seat_price_cents BIGINT NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version_number)
);

-- 3. Purchased Seat Add-Ons Table
CREATE TABLE IF NOT EXISTS public.org_subscription_seat_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.org_subscriptions(id) ON DELETE CASCADE,
  seats_added INTEGER NOT NULL CHECK (seats_added > 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_seat_purchases_org ON public.org_subscription_seat_purchases(org_id, status);

-- 4. Explicit and complete alteration of org_subscriptions before dependent functions
ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES public.subscription_plan_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS grace_period_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_read_only BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_only_reason TEXT,
  ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_verified_payment_id UUID,
  ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restored_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_org_subscriptions_readonly ON public.org_subscriptions(is_read_only);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_grace ON public.org_subscriptions(grace_period_ends_at);
CREATE INDEX IF NOT EXISTS idx_org_subscriptions_plan_version ON public.org_subscriptions(plan_version_id);

-- 5. Zero-Assumption Legacy Backfill Preserving Customer-Specific Entitlements
INSERT INTO public.subscription_plans (code, name, target_org_type, description)
VALUES 
  ('developer_legacy_v1', 'Developer Legacy Baseline', 'developer', 'Preserved legacy developer baseline plan template'),
  ('cp_legacy_v1', 'Channel Partner Legacy Baseline', 'channel_partner', 'Preserved legacy channel partner baseline plan template')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.subscription_plan_versions (
  plan_id, version_number, is_current, included_seats, max_projects, max_inventory_units, max_storage_bytes, max_integrations, intelligence_credits_monthly
) VALUES
  ((SELECT id FROM public.subscription_plans WHERE code = 'developer_legacy_v1'), 1, true, 0, NULL, NULL, NULL, NULL, NULL),
  ((SELECT id FROM public.subscription_plans WHERE code = 'cp_legacy_v1'), 1, true, 0, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (plan_id, version_number) DO NOTHING;

UPDATE public.org_subscriptions s
SET plan_version_id = CASE
  WHEN o.type = 'channel_partner' THEN (SELECT id FROM public.subscription_plan_versions WHERE plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'cp_legacy_v1') AND version_number = 1)
  ELSE (SELECT id FROM public.subscription_plan_versions WHERE plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'developer_legacy_v1') AND version_number = 1)
END
FROM public.organisations o
WHERE s.org_id = o.id AND s.plan_version_id IS NULL;

-- 6. Direct Mutation Revocation & Protected RLS on org_invitations
REVOKE INSERT, UPDATE, DELETE ON public.org_invitations FROM PUBLIC, authenticated, anon;

DROP POLICY IF EXISTS "admins_manage_org_invitations" ON public.org_invitations;
DROP POLICY IF EXISTS "public_verify_invitation_token" ON public.org_invitations;

CREATE POLICY "admins_read_org_invitations" ON public.org_invitations
  FOR SELECT USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

-- 7. Authoritative Atomic Seat Reservation Stored Procedure
-- Acquires subscription lock first, then validates duplicates and capacity
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
  SELECT p.id, om.role INTO v_caller_profile_id, v_caller_role
  FROM public.profiles p
  JOIN public.org_members om ON om.profile_id = p.id
  WHERE p.auth_user_id = auth.uid()
    AND om.org_id = p_org_id
    AND om.status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: Caller is not an active member of this organisation.'::TEXT;
    RETURN;
  END IF;

  -- 2. Verify invitation authority
  IF v_caller_role NOT IN ('owner'::public.member_role, 'admin'::public.member_role) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: Only owners and admins can invite team members.'::TEXT;
    RETURN;
  END IF;

  -- 3. Validate role delegation hierarchy (admin cannot invite owner)
  IF p_role = 'owner'::public.member_role AND v_caller_role != 'owner'::public.member_role THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, 'Forbidden: Only existing owners can delegate the owner role.'::TEXT;
    RETURN;
  END IF;

  -- 4. CRITICAL CONCURRENCY SAFEGUARD: Lock subscription row FIRST to serialize reservations
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

  -- 5. RECHECK UNDER LOCK: Verify no existing active pending invitation for this email
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

  -- 6. RECHECK UNDER LOCK: Schema-accurate check verifying user is not already an active member
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

  -- 7. Compute total seats preserving organisation-specific contract
  SELECT COALESCE(SUM(seats_added), 0)::INTEGER INTO v_purchased_additional_seats
  FROM public.org_subscription_seat_purchases
  WHERE org_id = p_org_id AND status = 'active';

  v_total_allowed_seats := v_sub.included_seats + v_sub.additional_seats + v_purchased_additional_seats;

  -- 8. Count active members and unexpired pending invitations under lock
  SELECT COUNT(*)::INTEGER INTO v_active_members
  FROM public.org_members
  WHERE org_id = p_org_id AND status = 'active';

  SELECT COUNT(*)::INTEGER INTO v_pending_invites
  FROM public.org_invitations
  WHERE org_id = p_org_id AND status = 'pending' AND expires_at > now();

  -- 9. Assert capacity
  IF (v_active_members + v_pending_invites + 1) > v_total_allowed_seats THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT,
      format('Seat limit reached (%s/%s seats). Please purchase additional seats before inviting staff.',
             (v_active_members + v_pending_invites), v_total_allowed_seats)::TEXT;
    RETURN;
  END IF;

  -- 10. Cryptographically Secure Server-Side Token Generation
  v_raw_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_raw_token, 'sha256'), 'hex');

  -- 11. Atomically insert invitation reservation
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

-- 8. Safe Invitation Token Verification Procedure (Does NOT expose token_hash)
CREATE OR REPLACE FUNCTION public.verify_invitation_token(p_raw_token TEXT)
RETURNS TABLE (
  invitation_id UUID,
  org_id UUID,
  org_name TEXT,
  org_slug TEXT,
  org_type public.org_type,
  email TEXT,
  role public.member_role,
  inviter_name TEXT,
  expires_at TIMESTAMPTZ,
  is_valid BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_token_hash TEXT;
BEGIN
  v_token_hash := encode(digest(trim(p_raw_token), 'sha256'), 'hex');
  
  RETURN QUERY
  SELECT 
    i.id AS invitation_id,
    o.id AS org_id,
    o.name AS org_name,
    o.slug AS org_slug,
    o.type AS org_type,
    i.email,
    i.role,
    COALESCE(p.full_name, 'An administrator') AS inviter_name,
    i.expires_at,
    (i.status = 'pending' AND i.expires_at > now()) AS is_valid
  FROM public.org_invitations i
  JOIN public.organisations o ON o.id = i.org_id
  LEFT JOIN public.profiles p ON p.id = i.invited_by
  WHERE i.token_hash = v_token_hash;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_invitation_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_invitation_token(TEXT) TO anon, authenticated, service_role;

COMMIT;
