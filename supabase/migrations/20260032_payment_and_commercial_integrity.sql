-- Migration 0032: 20260032_payment_and_commercial_integrity.sql
-- Production X: Payment Verification, Commercial Integrity & Security Hardening (Pass 4 Final)
-- 1. Exact PostgreSQL Function Identity Signatures for all REVOKE/GRANT statements
-- 2. Permanent, Immutable One-Time Super Admin Bootstrap State (platform_bootstrap_state)
-- 3. Commercial Override Approval Workflow (No self-approval, independent seat & price overrides)
-- 4. Contracted Subscription Snapshot (Contracted base price, add-seat price, currency, override tracking)
-- 5. Safe Deduplication Remediation & Single Current Plan Version Unique Index
-- 6. Plan Concurrency Locking (FOR SHARE OF sp, pv)
-- 7. Payment Reference Advisory Lock Concurrency Serialization
-- 8. Atomic Invitation Token Rotation with Expiry Bounds (<= 30 days) and Attempt-Protected Delivery Outcome
-- 9. Complete Audit Schema Consistency (actor_user_id, actor_role, action, target_entity_type, target_entity_id, metadata)
BEGIN;

-- Ensure platform_admin role exists on platform_role enum
ALTER TYPE public.platform_role ADD VALUE IF NOT EXISTS 'platform_admin';

-- ============================================================================
-- 1. DROP OBSOLETE OVERLOADED FUNCTIONS FROM PRIOR INTERIM MIGRATIONS
-- ============================================================================
DROP FUNCTION IF EXISTS public.provision_organisation_atomic(UUID, TEXT, TEXT, public.org_type, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.provision_organisation_atomic(UUID, TEXT, TEXT, public.org_type, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.provision_organisation_atomic(UUID, TEXT, TEXT, public.org_type, TEXT, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.verify_payment_and_activate_subscription(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.bootstrap_initial_super_admin_atomic(UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.record_invitation_delivery_outcome(UUID, TEXT, TEXT);


-- ============================================================================
-- 2. INVITATION DELIVERY STATE COLUMNS
-- ============================================================================
ALTER TABLE public.org_invitations
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (delivery_status IN ('pending', 'delivered', 'failed')),
  ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_org_invitations_delivery 
  ON public.org_invitations(delivery_status, status);


-- ============================================================================
-- 3. PLAN CONCURRENCY & SINGLE CURRENT VERSION REMEDIATION
-- ============================================================================
ALTER TABLE public.subscription_plans 
  ADD COLUMN IF NOT EXISTS tier TEXT;

UPDATE public.subscription_plans 
SET tier = split_part(code, '_', 1) 
WHERE tier IS NULL;

-- Safe Diagnostic & Remediation Path:
-- If any plan has duplicate is_current = true rows, preserve only the highest version_number as current
WITH ranked_current_versions AS (
  SELECT id, plan_id, version_number,
         ROW_NUMBER() OVER (PARTITION BY plan_id ORDER BY version_number DESC, created_at DESC) as rn
  FROM public.subscription_plan_versions
  WHERE is_current = true
)
UPDATE public.subscription_plan_versions
SET is_current = false
WHERE id IN (
  SELECT id FROM ranked_current_versions WHERE rn > 1
);

-- Enforce exactly one current version per plan
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_current_plan_version 
  ON public.subscription_plan_versions(plan_id) 
  WHERE is_current = true;


-- ============================================================================
-- 4. PERMANENT IMMUTABLE BOOTSTRAP STATE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.platform_bootstrap_state (
  is_completed BOOLEAN PRIMARY KEY DEFAULT true CHECK (is_completed = true),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  initial_super_admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  initial_super_admin_record_id UUID NOT NULL REFERENCES public.platform_users(id) ON DELETE RESTRICT,
  audit_log_id UUID NOT NULL REFERENCES public.platform_audit_logs(id) ON DELETE RESTRICT
);

ALTER TABLE public.platform_bootstrap_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_bootstrap_state FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.platform_bootstrap_state TO service_role;

-- WORM Trigger: Permanently blocks UPDATE or DELETE on bootstrap state
CREATE OR REPLACE FUNCTION public.prevent_bootstrap_state_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Security Violation: platform_bootstrap_state is immutable and permanently one-time. It cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_bootstrap_state_mutation ON public.platform_bootstrap_state;
CREATE TRIGGER trg_prevent_bootstrap_state_mutation
  BEFORE UPDATE OR DELETE ON public.platform_bootstrap_state
  FOR EACH ROW EXECUTE FUNCTION public.prevent_bootstrap_state_mutation();


-- ============================================================================
-- 5. AUTHORITATIVE COMMERCIAL OVERRIDES TABLE & WORKFLOW
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_commercial_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  plan_version_id UUID NOT NULL REFERENCES public.subscription_plan_versions(id) ON DELETE RESTRICT,
  target_org_type public.org_type NOT NULL,
  approved_included_seats INTEGER CHECK (approved_included_seats > 0),
  custom_price_annual_cents BIGINT,
  custom_price_monthly_cents BIGINT,
  custom_additional_seat_price_cents BIGINT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('draft', 'pending_approval', 'approved', 'consumed', 'revoked', 'expired')),
  consumed_at TIMESTAMPTZ,
  consumed_org_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT no_self_approval CHECK (approved_by IS NULL OR approved_by != created_by)
);

CREATE INDEX IF NOT EXISTS idx_commercial_overrides_lookup 
  ON public.subscription_commercial_overrides(code, plan_version_id, status);

ALTER TABLE public.subscription_commercial_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_commercial_overrides FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.subscription_commercial_overrides FROM authenticated;
GRANT SELECT ON TABLE public.subscription_commercial_overrides TO authenticated, service_role;


-- Alter org_subscriptions to hold complete immutable commercial contract snapshot
ALTER TABLE public.org_subscriptions
  ALTER COLUMN current_period_start DROP NOT NULL,
  ALTER COLUMN current_period_end DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS contracted_base_price_cents BIGINT,
  ADD COLUMN IF NOT EXISTS contracted_additional_seat_price_cents BIGINT,
  ADD COLUMN IF NOT EXISTS contracted_currency TEXT DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS commercial_override_id UUID REFERENCES public.subscription_commercial_overrides(id) ON DELETE SET NULL;

-- Alter org_subscription_invoices to record invoice type, seat quantity, and unit price
ALTER TABLE public.org_subscription_invoices
  ADD COLUMN IF NOT EXISTS invoice_type TEXT NOT NULL DEFAULT 'subscription' CHECK (invoice_type IN ('subscription', 'renewal', 'additional_seats')),
  ADD COLUMN IF NOT EXISTS seat_quantity INTEGER DEFAULT NULL CHECK (seat_quantity IS NULL OR seat_quantity > 0),
  ADD COLUMN IF NOT EXISTS unit_price_cents BIGINT DEFAULT NULL CHECK (unit_price_cents IS NULL OR unit_price_cents > 0);


-- RPC: Create Commercial Override (Strict Role Enforcement: super_admin or platform_admin ONLY)
CREATE OR REPLACE FUNCTION public.create_commercial_override_atomic(
  p_actor_auth_id UUID,
  p_code TEXT,
  p_plan_version_id UUID,
  p_target_org_type public.org_type,
  p_approved_included_seats INTEGER,
  p_reason TEXT,
  p_custom_price_annual_cents BIGINT DEFAULT NULL,
  p_custom_price_monthly_cents BIGINT DEFAULT NULL,
  p_custom_additional_seat_price_cents BIGINT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_role public.platform_role;
  v_new_id UUID;
BEGIN
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Access denied: caller % lacks commercial override creation authority', p_actor_auth_id;
  END IF;

  IF trim(p_code) = '' THEN
    RAISE EXCEPTION 'Validation error: override code cannot be empty';
  END IF;

  IF p_approved_included_seats IS NOT NULL AND p_approved_included_seats < 1 THEN
    RAISE EXCEPTION 'Validation error: approved_included_seats must be at least 1';
  END IF;

  IF p_custom_price_annual_cents IS NOT NULL AND p_custom_price_annual_cents <= 0 THEN
    RAISE EXCEPTION 'Validation error: custom_price_annual_cents must be positive';
  END IF;

  IF p_custom_price_monthly_cents IS NOT NULL AND p_custom_price_monthly_cents <= 0 THEN
    RAISE EXCEPTION 'Validation error: custom_price_monthly_cents must be positive';
  END IF;

  IF p_custom_additional_seat_price_cents IS NOT NULL AND p_custom_additional_seat_price_cents < 0 THEN
    RAISE EXCEPTION 'Validation error: custom_additional_seat_price_cents cannot be negative';
  END IF;

  IF trim(p_reason) = '' THEN
    RAISE EXCEPTION 'Validation error: override reason cannot be empty';
  END IF;

  INSERT INTO public.subscription_commercial_overrides (
    code,
    plan_version_id,
    target_org_type,
    approved_included_seats,
    custom_price_annual_cents,
    custom_price_monthly_cents,
    custom_additional_seat_price_cents,
    created_by,
    reason,
    status
  ) VALUES (
    trim(p_code),
    p_plan_version_id,
    p_target_org_type,
    p_approved_included_seats,
    p_custom_price_annual_cents,
    p_custom_price_monthly_cents,
    p_custom_additional_seat_price_cents,
    p_actor_auth_id,
    trim(p_reason),
    'pending_approval'
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_actor_auth_id,
    v_caller_role,
    'create_commercial_override',
    'subscription_commercial_overrides',
    v_new_id,
    jsonb_build_object(
      'code', trim(p_code),
      'plan_version_id', p_plan_version_id,
      'target_org_type', p_target_org_type,
      'approved_seats', p_approved_included_seats,
      'reason', trim(p_reason),
      'status', 'pending_approval'
    ),
    p_ip_address,
    p_user_agent,
    now()
  );

  RETURN jsonb_build_object('override_id', v_new_id, 'code', trim(p_code), 'status', 'pending_approval');
END;
$$;


-- RPC: Approve Commercial Override (Strict Super Admin Only & No Self-Approval)
CREATE OR REPLACE FUNCTION public.approve_commercial_override_atomic(
  p_actor_auth_id UUID,
  p_override_id UUID,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_role public.platform_role;
  v_override RECORD;
BEGIN
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: caller % is not an active platform super_admin', p_actor_auth_id;
  END IF;

  SELECT * INTO v_override
  FROM public.subscription_commercial_overrides
  WHERE id = p_override_id
  FOR UPDATE;

  IF v_override.id IS NULL THEN
    RAISE EXCEPTION 'Validation error: commercial override % not found', p_override_id;
  END IF;

  IF v_override.status != 'pending_approval' THEN
    RAISE EXCEPTION 'Invalid state: commercial override is in status %, expected pending_approval', v_override.status;
  END IF;

  -- CRITICAL: Prevent self-approval
  IF v_override.created_by = p_actor_auth_id THEN
    RAISE EXCEPTION 'Permission denied: creator % cannot self-approve their own commercial override. A separate Super Admin must review.', p_actor_auth_id;
  END IF;

  UPDATE public.subscription_commercial_overrides
  SET status = 'approved',
      approved_by = p_actor_auth_id,
      approved_at = now(),
      updated_at = now()
  WHERE id = p_override_id;

  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_actor_auth_id,
    v_caller_role,
    'approve_commercial_override',
    'subscription_commercial_overrides',
    p_override_id,
    jsonb_build_object(
      'code', v_override.code,
      'approved_by', p_actor_auth_id,
      'created_by', v_override.created_by,
      'approved_seats', v_override.approved_included_seats
    ),
    p_ip_address,
    p_user_agent,
    now()
  );

  RETURN jsonb_build_object('override_id', p_override_id, 'status', 'approved');
END;
$$;


-- RPC: Revoke Commercial Override
CREATE OR REPLACE FUNCTION public.revoke_commercial_override_atomic(
  p_actor_auth_id UUID,
  p_override_id UUID,
  p_reason TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_role public.platform_role;
  v_override RECORD;
BEGIN
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: caller % is not an active platform super_admin', p_actor_auth_id;
  END IF;

  SELECT * INTO v_override
  FROM public.subscription_commercial_overrides
  WHERE id = p_override_id
  FOR UPDATE;

  IF v_override.id IS NULL THEN
    RAISE EXCEPTION 'Validation error: commercial override % not found', p_override_id;
  END IF;

  IF v_override.status IN ('consumed', 'revoked', 'expired') THEN
    RAISE EXCEPTION 'Invalid state: cannot revoke commercial override in status %', v_override.status;
  END IF;

  UPDATE public.subscription_commercial_overrides
  SET status = 'revoked',
      revoked_by = p_actor_auth_id,
      revoked_at = now(),
      revocation_reason = trim(p_reason),
      updated_at = now()
  WHERE id = p_override_id;

  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_actor_auth_id,
    v_caller_role,
    'revoke_commercial_override',
    'subscription_commercial_overrides',
    p_override_id,
    jsonb_build_object(
      'code', v_override.code,
      'revoked_by', p_actor_auth_id,
      'reason', trim(p_reason)
    ),
    p_ip_address,
    p_user_agent,
    now()
  );

  RETURN jsonb_build_object('override_id', p_override_id, 'status', 'revoked');
END;
$$;


-- ============================================================================
-- 6. CANONICAL PAYMENT SETTLEMENT TRANSACTION LEDGER
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.org_subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_reference TEXT NOT NULL UNIQUE,
  invoice_id UUID NOT NULL REFERENCES public.org_subscription_invoices(id) ON DELETE RESTRICT,
  subscription_id UUID NOT NULL REFERENCES public.org_subscriptions(id) ON DELETE RESTRICT,
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  verified_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_payments_org ON public.org_subscription_payments(org_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_sub ON public.org_subscription_payments(subscription_id);
CREATE INDEX IF NOT EXISTS idx_sub_payments_inv ON public.org_subscription_payments(invoice_id);

ALTER TABLE public.org_subscription_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.org_subscription_payments FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.org_subscription_payments FROM authenticated;
GRANT SELECT ON TABLE public.org_subscription_payments TO authenticated, service_role;


-- ============================================================================
-- 7. PROVISIONING TRANSACTION (provision_organisation_atomic)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.provision_organisation_atomic(
  p_actor_auth_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_org_type public.org_type,
  p_plan_tier TEXT,
  p_billing_cycle TEXT,
  p_included_seats INTEGER DEFAULT NULL,
  p_owner_email TEXT DEFAULT NULL,
  p_invitation_token_hash TEXT DEFAULT NULL,
  p_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_onboarding_request_id UUID DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL,
  p_commercial_override_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_role public.platform_role;
  v_new_org_id UUID;
  v_owner_user_id UUID;
  v_matching_plan_count INTEGER;
  v_plan_id UUID;
  v_plan_version_id UUID;
  v_plan_price_annual_cents BIGINT;
  v_plan_price_monthly_cents BIGINT;
  v_plan_add_seat_price_cents BIGINT;
  v_plan_default_included_seats INTEGER;
  v_plan_active BOOLEAN;
  v_plan_target_org_type public.org_type;
  v_effective_included_seats INTEGER;
  v_effective_base_price_cents BIGINT;
  v_effective_add_seat_price_cents BIGINT;
  v_override_record public.subscription_commercial_overrides%ROWTYPE;
  v_onboarding_request RECORD;
  v_rows_updated INTEGER;
  v_initial_sub_status TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_invoice_num TEXT;
  v_invoice_amount_cents BIGINT;
  v_new_sub_id UUID;
  v_new_invoice_id UUID;
  v_new_invitation_id UUID;
  v_actor_profile_id UUID;
  v_normalized_email TEXT;
  v_effective_override_approved_by UUID := NULL;
  v_effective_override_reason TEXT := NULL;
BEGIN
  -- 1. Authorization: Platform Super Admin ONLY
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id
    AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: caller % is not an active platform super_admin', p_actor_auth_id;
  END IF;

  -- Resolve or auto-create profile for actor (required for org_invitations foreign key)
  SELECT id INTO v_actor_profile_id
  FROM public.profiles
  WHERE auth_user_id = p_actor_auth_id;

  IF v_actor_profile_id IS NULL THEN
    INSERT INTO public.profiles (auth_user_id, full_name)
    VALUES (p_actor_auth_id, 'Platform Super Admin')
    RETURNING id INTO v_actor_profile_id;
  END IF;

  -- 2. Input validation - NO silent defaults permitted
  IF trim(p_org_name) = '' THEN
    RAISE EXCEPTION 'Validation error: organisation name cannot be empty';
  END IF;

  IF trim(p_org_slug) = '' THEN
    RAISE EXCEPTION 'Validation error: organisation slug cannot be empty';
  END IF;

  IF p_org_type NOT IN ('developer', 'channel_partner') THEN
    RAISE EXCEPTION 'Validation error: invalid org_type %', p_org_type;
  END IF;

  IF p_plan_tier NOT IN ('free', 'starter', 'growth', 'enterprise') THEN
    RAISE EXCEPTION 'Validation error: invalid plan_tier %', p_plan_tier;
  END IF;

  IF p_billing_cycle NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Validation error: invalid billing_cycle % (must be explicitly monthly or annual)', p_billing_cycle;
  END IF;

  v_normalized_email := lower(trim(p_owner_email));
  IF v_normalized_email = '' OR v_normalized_email NOT LIKE '%@%.%' THEN
    RAISE EXCEPTION 'Validation error: invalid owner email %', p_owner_email;
  END IF;

  IF p_invitation_token_hash IS NULL OR length(p_invitation_token_hash) < 32 THEN
    RAISE EXCEPTION 'Validation error: invitation_token_hash must be a valid cryptographic hash';
  END IF;

  IF p_token_expires_at <= now() THEN
    RAISE EXCEPTION 'Validation error: token_expires_at must be in the future';
  END IF;

  -- 3. Verify slug uniqueness
  IF EXISTS (SELECT 1 FROM public.organisations WHERE slug = trim(p_org_slug)) THEN
    RAISE EXCEPTION 'Conflict error: organisation with slug % already exists', trim(p_org_slug);
  END IF;

  -- 4. Onboarding Request Integrity & Row Locking (if supplied)
  IF p_onboarding_request_id IS NOT NULL THEN
    SELECT * INTO v_onboarding_request
    FROM public.customer_onboarding_requests
    WHERE id = p_onboarding_request_id
    FOR UPDATE;

    IF v_onboarding_request.id IS NULL THEN
      RAISE EXCEPTION 'Validation error: onboarding request % does not exist', p_onboarding_request_id;
    END IF;

    IF v_onboarding_request.status = 'provisioned' THEN
      RAISE EXCEPTION 'Conflict error: onboarding request % has already been provisioned for organisation %',
        p_onboarding_request_id, v_onboarding_request.provisioned_org_id;
    END IF;

    IF v_onboarding_request.status = 'rejected' THEN
      RAISE EXCEPTION 'Invalid state: onboarding request % has been rejected and cannot be provisioned',
        p_onboarding_request_id;
    END IF;

    IF v_onboarding_request.status NOT IN ('approved', 'pending_approval') THEN
      RAISE EXCEPTION 'Invalid state: onboarding request % is in status %, expected approved or pending_approval',
        p_onboarding_request_id, v_onboarding_request.status;
    END IF;

    IF v_onboarding_request.company_type IS DISTINCT FROM p_org_type THEN
      RAISE EXCEPTION 'Validation error: onboarding request company_type (%) does not match requested organisation type (%)',
        v_onboarding_request.company_type, p_org_type;
    END IF;
  END IF;

  -- 5. Authoritative Plan Version & Pricing Validation (LOCKED FOR SHARE)
  SELECT count(*)
  INTO v_matching_plan_count
  FROM public.subscription_plans sp
  JOIN public.subscription_plan_versions pv ON pv.plan_id = sp.id
  WHERE (sp.tier = p_plan_tier OR sp.code = p_plan_tier OR sp.code = p_plan_tier || '_' || p_org_type)
    AND sp.target_org_type = p_org_type
    AND sp.is_active = true
    AND pv.is_current = true;

  IF v_matching_plan_count = 0 THEN
    RAISE EXCEPTION 'Validation error: no active, current plan version found for tier % and organisation type %',
      p_plan_tier, p_org_type;
  ELSIF v_matching_plan_count > 1 THEN
    RAISE EXCEPTION 'Ambiguity error: multiple (%) current plan versions found for tier % and organisation type %',
      v_matching_plan_count, p_plan_tier, p_org_type;
  END IF;

  -- Authoritatively select prices and seats from the locked plan and plan-version rows
  SELECT 
    sp.id,
    sp.is_active,
    sp.target_org_type,
    pv.base_price_annual_cents,
    pv.base_price_monthly_cents,
    pv.additional_seat_price_cents,
    pv.included_seats,
    pv.id
  INTO STRICT
    v_plan_id,
    v_plan_active,
    v_plan_target_org_type,
    v_plan_price_annual_cents,
    v_plan_price_monthly_cents,
    v_plan_add_seat_price_cents,
    v_plan_default_included_seats,
    v_plan_version_id
  FROM public.subscription_plans sp
  JOIN public.subscription_plan_versions pv ON pv.plan_id = sp.id
  WHERE (sp.tier = p_plan_tier OR sp.code = p_plan_tier OR sp.code = p_plan_tier || '_' || p_org_type)
    AND sp.target_org_type = p_org_type
    AND sp.is_active = true
    AND pv.is_current = true
  FOR SHARE OF sp, pv;

  -- Validate baseline plan pricing
  IF p_plan_tier != 'free' THEN
    IF v_plan_price_annual_cents IS NULL OR v_plan_price_annual_cents <= 0 THEN
      RAISE EXCEPTION 'Validation error: plan base_price_annual_cents must be positive for paid tier %, found %',
        p_plan_tier, v_plan_price_annual_cents;
    END IF;
    IF v_plan_price_monthly_cents IS NULL OR v_plan_price_monthly_cents <= 0 THEN
      RAISE EXCEPTION 'Validation error: plan base_price_monthly_cents must be positive for paid tier %, found %',
        p_plan_tier, v_plan_price_monthly_cents;
    END IF;
    IF v_plan_add_seat_price_cents IS NULL OR v_plan_add_seat_price_cents < 0 THEN
      RAISE EXCEPTION 'Validation error: plan additional_seat_price_cents cannot be negative for tier %, found %',
        p_plan_tier, v_plan_add_seat_price_cents;
    END IF;
  END IF;

  -- 6. Derive Seats and Process Independent Commercial Overrides
  IF p_included_seats IS NULL THEN
    v_effective_included_seats := v_plan_default_included_seats;
  ELSE
    v_effective_included_seats := p_included_seats;
  END IF;

  IF v_effective_included_seats < 1 THEN
    RAISE EXCEPTION 'Validation error: included_seats must be at least 1, received %', v_effective_included_seats;
  END IF;

  -- Handle Commercial Override if code supplied
  IF p_commercial_override_code IS NOT NULL AND trim(p_commercial_override_code) != '' THEN
    SELECT * INTO v_override_record
    FROM public.subscription_commercial_overrides
    WHERE code = trim(p_commercial_override_code)
      AND plan_version_id = v_plan_version_id
      AND target_org_type = p_org_type
      AND status = 'approved'
      AND expires_at > now()
    FOR UPDATE;

    IF v_override_record.id IS NULL THEN
      RAISE EXCEPTION 'Commercial policy violation: invalid, expired, or unapproved commercial override code % for this plan version and org type',
        p_commercial_override_code;
    END IF;

    -- Validate approved seats ceiling if override specifies seat allowance
    IF v_override_record.approved_included_seats IS NOT NULL THEN
      IF p_included_seats IS NULL THEN
        v_effective_included_seats := v_override_record.approved_included_seats;
      ELSIF v_override_record.approved_included_seats < v_effective_included_seats THEN
        RAISE EXCEPTION 'Commercial policy violation: override code approves up to % seats, but % seats were requested',
          v_override_record.approved_included_seats, v_effective_included_seats;
      END IF;
    END IF;

    -- Validate custom override pricing
    IF v_override_record.custom_price_annual_cents IS NOT NULL AND v_override_record.custom_price_annual_cents <= 0 THEN
      RAISE EXCEPTION 'Commercial policy violation: custom_price_annual_cents must be positive, found %',
        v_override_record.custom_price_annual_cents;
    END IF;
    IF v_override_record.custom_price_monthly_cents IS NOT NULL AND v_override_record.custom_price_monthly_cents <= 0 THEN
      RAISE EXCEPTION 'Commercial policy violation: custom_price_monthly_cents must be positive, found %',
        v_override_record.custom_price_monthly_cents;
    END IF;
    IF v_override_record.custom_additional_seat_price_cents IS NOT NULL AND v_override_record.custom_additional_seat_price_cents < 0 THEN
      RAISE EXCEPTION 'Commercial policy violation: custom_additional_seat_price_cents cannot be negative, found %',
        v_override_record.custom_additional_seat_price_cents;
    END IF;

    v_effective_override_approved_by := v_override_record.approved_by;
    v_effective_override_reason := v_override_record.reason;
  ELSE
    -- If no override supplied, requested seats cannot differ from plan default
    IF v_effective_included_seats != v_plan_default_included_seats THEN
      RAISE EXCEPTION 'Commercial policy violation: requested seats (%) differs from plan baseline (%) without an independent commercial override code',
        v_effective_included_seats, v_plan_default_included_seats;
    END IF;
  END IF;

  -- 7. Determine Contracted Prices (Snapshotting Plan Baseline or Approved Custom Terms)
  IF p_billing_cycle = 'annual' THEN
    v_effective_base_price_cents := COALESCE(v_override_record.custom_price_annual_cents, v_plan_price_annual_cents);
  ELSE
    v_effective_base_price_cents := COALESCE(v_override_record.custom_price_monthly_cents, v_plan_price_monthly_cents);
  END IF;

  v_effective_add_seat_price_cents := COALESCE(v_override_record.custom_additional_seat_price_cents, v_plan_add_seat_price_cents);

  -- 8. Determine Subscription Status & Strict Billing Dates
  IF p_plan_tier = 'free' THEN
    v_initial_sub_status := 'trialing';
    v_period_start := now();
    v_period_end := now() + INTERVAL '14 days';
  ELSE
    v_initial_sub_status := 'pending_payment';
    v_period_start := NULL;
    v_period_end := NULL;
  END IF;

  -- 9. Create Organisation Row
  INSERT INTO public.organisations (
    name,
    slug,
    type,
    created_at,
    updated_at
  ) VALUES (
    trim(p_org_name),
    trim(p_org_slug),
    p_org_type,
    now(),
    now()
  )
  RETURNING id INTO v_new_org_id;

  -- 10. Consume commercial override if one was used
  IF v_override_record.id IS NOT NULL THEN
    UPDATE public.subscription_commercial_overrides
    SET status = 'consumed',
        consumed_at = now(),
        consumed_org_id = v_new_org_id,
        updated_at = now()
    WHERE id = v_override_record.id;

    INSERT INTO public.platform_audit_logs (
      actor_user_id,
      actor_role,
      action,
      target_entity_type,
      target_entity_id,
      metadata,
      ip_address,
      user_agent,
      created_at
    ) VALUES (
      p_actor_auth_id,
      v_caller_role,
      'consume_commercial_override',
      'subscription_commercial_overrides',
      v_override_record.id,
      jsonb_build_object(
        'code', v_override_record.code,
        'consumed_by_org_id', v_new_org_id,
        'consumed_at', now()
      ),
      p_ip_address,
      p_user_agent,
      now()
    );
  END IF;

  -- 11. Create Subscription Row with Immutable Commercial Contract Snapshot
  INSERT INTO public.org_subscriptions (
    org_id,
    plan_tier,
    plan_version_id,
    included_seats,
    additional_seats,
    status,
    billing_cycle,
    current_period_start,
    current_period_end,
    contracted_base_price_cents,
    contracted_additional_seat_price_cents,
    contracted_currency,
    commercial_override_id,
    commercial_override_approved_by,
    commercial_override_reason
  ) VALUES (
    v_new_org_id,
    p_plan_tier,
    v_plan_version_id,
    v_effective_included_seats,
    0,
    v_initial_sub_status,
    p_billing_cycle,
    NULL,
    NULL,
    v_effective_base_price_cents,
    v_effective_add_seat_price_cents,
    'INR',
    v_override_record.id,
    v_effective_override_approved_by,
    v_effective_override_reason
  )
  RETURNING id INTO v_new_sub_id;

  -- 12. Generate Authoritative Invoice using Contracted Base Price
  IF p_plan_tier != 'free' THEN
    v_invoice_num := 'INV-' || to_char(now(), 'YYYYMM') || '-' || upper(substring(replace(v_new_org_id::text, '-', ''), 1, 8));
    v_invoice_amount_cents := v_effective_base_price_cents;

    IF v_invoice_amount_cents IS NULL OR v_invoice_amount_cents <= 0 THEN
      RAISE EXCEPTION 'Billing configuration error: authoritative plan price is zero or null for paid tier %', p_plan_tier;
    END IF;

    INSERT INTO public.org_subscription_invoices (
      org_id,
      subscription_id,
      invoice_number,
      amount_cents,
      currency,
      status,
      due_date
    ) VALUES (
      v_new_org_id,
      v_new_sub_id,
      v_invoice_num,
      v_invoice_amount_cents,
      'INR',
      'issued',
      now() + INTERVAL '14 days'
    )
    RETURNING id INTO v_new_invoice_id;
  END IF;

  -- 13. Create Primary Owner Invitation Record
  INSERT INTO public.org_invitations (
    org_id,
    email,
    role,
    status,
    invited_by,
    token_hash,
    expires_at,
    delivery_status,
    delivery_attempts,
    created_at,
    updated_at
  ) VALUES (
    v_new_org_id,
    v_normalized_email,
    'owner',
    'pending',
    v_actor_profile_id,
    p_invitation_token_hash,
    p_token_expires_at,
    'pending',
    1, -- Canonical convention: initial creation initiates attempt 1
    now(),
    now()
  )
  RETURNING id INTO v_new_invitation_id;

  -- 14. Update Onboarding Request (if linked) - ATOMIC 1-ROW UPDATE
  IF p_onboarding_request_id IS NOT NULL THEN
    UPDATE public.customer_onboarding_requests
    SET status = 'provisioned',
        provisioned_org_id = v_new_org_id,
        reviewed_by = p_actor_auth_id,
        reviewed_at = now(),
        review_notes = 'Provisioned via atomic workflow',
        updated_at = now()
    WHERE id = p_onboarding_request_id
      AND status = v_onboarding_request.status;

    GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
    IF v_rows_updated != 1 THEN
      RAISE EXCEPTION 'Concurrency error: onboarding request % was modified concurrently during provisioning',
        p_onboarding_request_id;
    END IF;
  END IF;

  -- 15. Write Platform Audit Log using ACTUAL SCHEMA COLUMNS
  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_actor_auth_id,
    v_caller_role,
    'provision_organisation',
    'organisations',
    v_new_org_id,
    jsonb_build_object(
      'org_name', p_org_name,
      'org_slug', p_org_slug,
      'org_type', p_org_type,
      'plan_tier', p_plan_tier,
      'plan_version_id', v_plan_version_id,
      'included_seats', v_effective_included_seats,
      'billing_cycle', p_billing_cycle,
      'contracted_base_price_cents', v_effective_base_price_cents,
      'contracted_additional_seat_price_cents', v_effective_add_seat_price_cents,
      'subscription_status', v_initial_sub_status,
      'initial_paid_dates_null', (p_plan_tier != 'free'),
      'invoice_generated', v_invoice_num,
      'invoice_amount_cents', v_invoice_amount_cents,
      'owner_email', v_normalized_email,
      'invitation_id', v_new_invitation_id,
      'onboarding_request_id', p_onboarding_request_id,
      'commercial_override_code', p_commercial_override_code
    ),
    p_ip_address,
    p_user_agent,
    now()
  );

  RETURN jsonb_build_object(
    'status', 'provisioned',
    'org_id', v_new_org_id,
    'org_slug', trim(p_org_slug),
    'subscription_id', v_new_sub_id,
    'subscription_status', v_initial_sub_status,
    'invoice_number', v_invoice_num,
    'invoice_id', v_new_invoice_id,
    'invoice_amount_cents', v_invoice_amount_cents,
    'invitation_id', v_new_invitation_id,
    'owner_email', v_normalized_email,
    'included_seats', v_effective_included_seats,
    'contracted_base_price_cents', v_effective_base_price_cents,
    'contracted_additional_seat_price_cents', v_effective_add_seat_price_cents
  );
END;
$$;


-- ============================================================================
-- 8. SUBSCRIPTION-SPECIFIC PAYMENT VERIFICATION & ACTIVATION RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_payment_and_activate_subscription(
  p_actor_auth_id UUID,
  p_org_id UUID,
  p_subscription_id UUID,
  p_invoice_number TEXT,
  p_payment_reference TEXT,
  p_amount_cents BIGINT,
  p_currency TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_role public.platform_role;
  v_sub RECORD;
  v_invoice RECORD;
  v_existing_payment RECORD;
  v_new_period_start TIMESTAMPTZ;
  v_new_period_end TIMESTAMPTZ;
  v_clean_ref TEXT;
BEGIN
  -- 1. Authorization: Platform Super Admin ONLY
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id
    AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: caller % is not an active platform super_admin', p_actor_auth_id;
  END IF;

  -- 2. Input validation - NO silent defaults
  IF p_org_id IS NULL OR p_subscription_id IS NULL THEN
    RAISE EXCEPTION 'Validation error: org_id and subscription_id cannot be null';
  END IF;

  IF trim(p_invoice_number) = '' THEN
    RAISE EXCEPTION 'Validation error: invoice_number cannot be empty';
  END IF;

  v_clean_ref := trim(p_payment_reference);
  IF v_clean_ref = '' THEN
    RAISE EXCEPTION 'Validation error: payment_reference cannot be empty';
  END IF;

  IF p_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Validation error: amount_cents must be positive, received %', p_amount_cents;
  END IF;

  IF trim(p_currency) = '' THEN
    RAISE EXCEPTION 'Validation error: currency cannot be empty';
  END IF;

  -- 3. Concurrency Serialization: Dedicated transaction advisory lock on payment reference
  PERFORM pg_advisory_xact_lock(hashtext('payment_ref_' || v_clean_ref));

  -- 4. Lock Subscription Row First (Strict Lock Order: Subscription -> Invoice)
  SELECT * INTO v_sub
  FROM public.org_subscriptions
  WHERE id = p_subscription_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Validation error: subscription % does not exist for organisation %', p_subscription_id, p_org_id;
  END IF;

  -- 5. Lock Invoice Row Second
  SELECT * INTO v_invoice
  FROM public.org_subscription_invoices
  WHERE invoice_number = trim(p_invoice_number)
    AND subscription_id = p_subscription_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF v_invoice.id IS NULL THEN
    RAISE EXCEPTION 'Validation error: invoice % does not exist for subscription % and organisation %',
      p_invoice_number, p_subscription_id, p_org_id;
  END IF;

  -- 6. Canonical Payment Reference Settlement Check (Global Uniqueness & Idempotent Replay)
  SELECT * INTO v_existing_payment
  FROM public.org_subscription_payments
  WHERE payment_reference = v_clean_ref;

  IF v_existing_payment.id IS NOT NULL THEN
    -- Check if this is an identical idempotent replay for the exact same invoice & subscription
    IF v_existing_payment.subscription_id = p_subscription_id
       AND v_existing_payment.invoice_id = v_invoice.id
       AND v_existing_payment.amount_cents = p_amount_cents
       AND v_existing_payment.currency = p_currency THEN
      -- Exact replay: return existing state without modifying dates or inserting duplicate payment
      RETURN jsonb_build_object(
        'status', 'already_verified',
        'subscription_id', v_sub.id,
        'subscription_status', v_sub.status,
        'invoice_id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'payment_id', v_existing_payment.id,
        'current_period_start', v_sub.current_period_start,
        'current_period_end', v_sub.current_period_end,
        'message', 'Payment reference was previously settled with identical parameters'
      );
    ELSE
      -- Reference exists for another invoice, subscription, or amount: reject conflict
      RAISE EXCEPTION 'Conflict error: payment_reference % has already been settled for invoice % and subscription %',
        v_clean_ref, v_existing_payment.invoice_id, v_existing_payment.subscription_id;
    END IF;
  END IF;

  -- 7. Invoice Validation
  IF v_invoice.status != 'issued' THEN
    RAISE EXCEPTION 'Invalid state: invoice % is in status %, expected issued', v_invoice.invoice_number, v_invoice.status;
  END IF;

  IF v_invoice.amount_cents != p_amount_cents THEN
    RAISE EXCEPTION 'Validation error: submitted amount % does not match invoice obligation %', p_amount_cents, v_invoice.amount_cents;
  END IF;

  IF v_invoice.currency != p_currency THEN
    RAISE EXCEPTION 'Validation error: submitted currency % does not match invoice currency %', p_currency, v_invoice.currency;
  END IF;

  -- 8. Insert Canonical Payment Transaction Record
  INSERT INTO public.org_subscription_payments (
    payment_reference,
    invoice_id,
    subscription_id,
    org_id,
    amount_cents,
    currency,
    verified_by,
    verified_at,
    created_at
  ) VALUES (
    v_clean_ref,
    v_invoice.id,
    v_sub.id,
    p_org_id,
    p_amount_cents,
    p_currency,
    p_actor_auth_id,
    now(),
    now()
  );

  -- 9. Settle Invoice to Paid
  UPDATE public.org_subscription_invoices
  SET status = 'paid',
      paid_at = now(),
      payment_reference = v_clean_ref,
      updated_at = now()
  WHERE id = v_invoice.id;

  -- 10. Process Payment Effect Based on Authoritative Invoice Type
  IF v_invoice.invoice_type = 'additional_seats' THEN
    -- A. Additional Seats Payment: Subscription must already be active
    IF v_sub.status != 'active' THEN
      RAISE EXCEPTION 'Invalid state: subscription is in status %, expected active to activate additional seats.', v_sub.status;
    END IF;

    IF v_invoice.seat_quantity IS NULL OR v_invoice.seat_quantity <= 0 THEN
      RAISE EXCEPTION 'Data integrity error: additional_seats invoice % has invalid seat_quantity %', v_invoice.invoice_number, v_invoice.seat_quantity;
    END IF;

    -- Atomically activate additional seats ONLY upon verified payment!
    UPDATE public.org_subscriptions
    SET additional_seats = additional_seats + v_invoice.seat_quantity,
        updated_at = now()
    WHERE id = v_sub.id;

    -- Audit Log for Seat Activation
    INSERT INTO public.platform_audit_logs (
      actor_user_id,
      actor_role,
      action,
      target_entity_type,
      target_entity_id,
      metadata,
      ip_address,
      user_agent,
      created_at
    ) VALUES (
      p_actor_auth_id,
      v_caller_role,
      'activate_additional_seats',
      'org_subscriptions',
      v_sub.id,
      jsonb_build_object(
        'org_id', p_org_id,
        'invoice_id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'payment_reference', v_clean_ref,
        'amount_cents', p_amount_cents,
        'currency', p_currency,
        'seats_activated', v_invoice.seat_quantity,
        'previous_additional_seats', v_sub.additional_seats,
        'new_total_additional_seats', v_sub.additional_seats + v_invoice.seat_quantity,
        'new_total_usable_seats', v_sub.included_seats + v_sub.additional_seats + v_invoice.seat_quantity
      ),
      p_ip_address,
      p_user_agent,
      now()
    );

    RETURN jsonb_build_object(
      'status', 'activated',
      'invoice_type', 'additional_seats',
      'subscription_id', v_sub.id,
      'subscription_status', v_sub.status,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'payment_reference', v_clean_ref,
      'seats_activated', v_invoice.seat_quantity,
      'seats_added', v_invoice.seat_quantity,
      'total_additional_seats', v_sub.additional_seats + v_invoice.seat_quantity,
      'total_usable_seats', v_sub.included_seats + v_sub.additional_seats + v_invoice.seat_quantity,
      'message', 'Payment verified and additional seats activated successfully'
    );

  ELSIF v_invoice.invoice_type = 'renewal' THEN
    -- B. Renewal Payment: Subscription must be active or past_due
    IF v_sub.status NOT IN ('active', 'past_due') THEN
      RAISE EXCEPTION 'Invalid state: subscription is in status %, expected active or past_due for renewal.', v_sub.status;
    END IF;

    IF v_sub.billing_cycle = 'annual' THEN
      v_new_period_end := COALESCE(v_sub.current_period_end, now()) + INTERVAL '1 year';
    ELSE
      v_new_period_end := COALESCE(v_sub.current_period_end, now()) + INTERVAL '1 month';
    END IF;

    UPDATE public.org_subscriptions
    SET status = 'active',
        current_period_end = v_new_period_end,
        updated_at = now()
    WHERE id = v_sub.id;

    -- Audit Log for Renewal
    INSERT INTO public.platform_audit_logs (
      actor_user_id,
      actor_role,
      action,
      target_entity_type,
      target_entity_id,
      metadata,
      ip_address,
      user_agent,
      created_at
    ) VALUES (
      p_actor_auth_id,
      v_caller_role,
      'renew_subscription',
      'org_subscriptions',
      v_sub.id,
      jsonb_build_object(
        'org_id', p_org_id,
        'invoice_id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'payment_reference', v_clean_ref,
        'amount_cents', p_amount_cents,
        'currency', p_currency,
        'previous_status', v_sub.status,
        'new_status', 'active',
        'current_period_end', v_new_period_end
      ),
      p_ip_address,
      p_user_agent,
      now()
    );

    RETURN jsonb_build_object(
      'status', 'renewed',
      'subscription_id', v_sub.id,
      'subscription_status', 'active',
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'payment_reference', v_clean_ref,
      'current_period_start', v_sub.current_period_start,
      'current_period_end', v_new_period_end,
      'message', 'Renewal payment verified and subscription renewed successfully'
    );

  ELSE
    -- C. Initial Subscription Activation: Subscription must be pending_payment
    IF v_sub.status != 'pending_payment' THEN
      RAISE EXCEPTION 'Invalid state: subscription is in status %, expected pending_payment. Duplicate activation rejected.', v_sub.status;
    END IF;

    v_new_period_start := now();
    IF v_sub.billing_cycle = 'annual' THEN
      v_new_period_end := v_new_period_start + INTERVAL '1 year';
    ELSE
      v_new_period_end := v_new_period_start + INTERVAL '1 month';
    END IF;

    UPDATE public.org_subscriptions
    SET status = 'active',
        current_period_start = v_new_period_start,
        current_period_end = v_new_period_end,
        updated_at = now()
    WHERE id = v_sub.id;

    -- Audit Log for Initial Subscription Activation
    INSERT INTO public.platform_audit_logs (
      actor_user_id,
      actor_role,
      action,
      target_entity_type,
      target_entity_id,
      metadata,
      ip_address,
      user_agent,
      created_at
    ) VALUES (
      p_actor_auth_id,
      v_caller_role,
      'verify_payment_and_activate_subscription',
      'org_subscriptions',
      v_sub.id,
      jsonb_build_object(
        'org_id', p_org_id,
        'invoice_id', v_invoice.id,
        'invoice_number', v_invoice.invoice_number,
        'payment_reference', v_clean_ref,
        'amount_cents', p_amount_cents,
        'currency', p_currency,
        'previous_status', v_sub.status,
        'new_status', 'active',
        'current_period_start', v_new_period_start,
        'current_period_end', v_new_period_end
      ),
      p_ip_address,
      p_user_agent,
      now()
    );

    RETURN jsonb_build_object(
      'status', 'activated',
      'subscription_id', v_sub.id,
      'subscription_status', 'active',
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'payment_reference', v_clean_ref,
      'current_period_start', v_new_period_start,
      'current_period_end', v_new_period_end,
      'message', 'Initial subscription payment verified and workspace activated'
    );
  END IF;
END;
$$;


-- ============================================================================
-- 9. ATOMIC INVITATION TOKEN ROTATION PROCEDURE (BOUNDED EXPIRY & ATTRIBUTE PROTECTION)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.rotate_invitation_token_atomic(
  p_actor_auth_id UUID,
  p_invitation_id UUID,
  p_new_token_hash TEXT,
  p_new_expires_at TIMESTAMPTZ,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_role public.platform_role;
  v_invitation RECORD;
  v_org RECORD;
BEGIN
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'platform_admin') THEN
    RAISE EXCEPTION 'Access denied: caller % is not an authorized platform administrator', p_actor_auth_id;
  END IF;

  -- Validate new expiration bounds
  IF p_new_expires_at IS NULL OR p_new_expires_at <= now() THEN
    RAISE EXCEPTION 'Validation error: new expiration must be non-null and strictly in the future';
  END IF;

  -- Enforce sensible maximum invitation lifetime of 30 days
  IF p_new_expires_at > (now() + INTERVAL '30 days') THEN
    RAISE EXCEPTION 'Validation error: new expiration cannot exceed 30 days from now';
  END IF;

  IF p_new_token_hash IS NULL OR length(p_new_token_hash) < 32 THEN
    RAISE EXCEPTION 'Validation error: invalid cryptographic token hash';
  END IF;

  -- Lock invitation row FOR UPDATE
  SELECT * INTO v_invitation
  FROM public.org_invitations
  WHERE id = p_invitation_id
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Validation error: invitation % not found', p_invitation_id;
  END IF;

  IF v_invitation.status != 'pending' THEN
    RAISE EXCEPTION 'Invalid state: invitation is in status %, expected pending. Accepted or canceled invitations cannot be rotated.', v_invitation.status;
  END IF;

  IF v_invitation.expires_at <= now() THEN
    RAISE EXCEPTION 'Invalid state: invitation % has already expired. Generate a replacement invitation instead.', p_invitation_id;
  END IF;

  -- Update token, increment attempt counter and set pending delivery
  UPDATE public.org_invitations
  SET token_hash = p_new_token_hash,
      expires_at = p_new_expires_at,
      delivery_status = 'pending',
      delivery_attempts = delivery_attempts + 1,
      delivery_updated_at = now(),
      updated_at = now()
  WHERE id = p_invitation_id;

  SELECT name INTO v_org FROM public.organisations WHERE id = v_invitation.org_id;

  -- Write audit log atomically
  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_actor_auth_id,
    v_caller_role,
    'rotate_invitation_token',
    'org_invitations',
    p_invitation_id,
    jsonb_build_object(
      'email', v_invitation.email,
      'org_id', v_invitation.org_id,
      'delivery_attempts', v_invitation.delivery_attempts + 1,
      'expires_at', p_new_expires_at
    ),
    p_ip_address,
    p_user_agent,
    now()
  );

  RETURN jsonb_build_object(
    'invitation_id', p_invitation_id,
    'email', v_invitation.email,
    'org_name', v_org.name,
    'role', v_invitation.role,
    'attempts', v_invitation.delivery_attempts + 1,
    'expires_at', p_new_expires_at
  );
END;
$$;


-- Helper RPC: Record post-dispatch delivery outcome protected by expected_attempts
CREATE OR REPLACE FUNCTION public.record_invitation_delivery_outcome(
  p_invitation_id UUID,
  p_delivery_status TEXT,
  p_expected_attempts INTEGER,
  p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  IF p_delivery_status NOT IN ('delivered', 'failed') THEN
    RAISE EXCEPTION 'Invalid delivery_status %', p_delivery_status;
  END IF;

  UPDATE public.org_invitations
  SET delivery_status = p_delivery_status,
      last_delivery_error = p_error_message,
      delivery_updated_at = now()
  WHERE id = p_invitation_id
    AND delivery_attempts = p_expected_attempts;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('success', (v_rows = 1), 'rows_updated', v_rows);
END;
$$;


-- ============================================================================
-- 10. ATOMIC, PERMANENTLY ONE-TIME SUPER ADMIN BOOTSTRAP RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_initial_super_admin_atomic(
  p_target_user_id UUID,
  p_target_email TEXT,
  p_has_verified_totp BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_auth_user RECORD;
  v_existing_admin RECORD;
  v_new_admin_id UUID;
  v_audit_id UUID;
BEGIN
  -- 1. Database-Level Concurrency Guard
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_initial_super_admin'));

  -- 2. Check Permanent Bootstrap Completion Marker
  IF EXISTS (SELECT 1 FROM public.platform_bootstrap_state WHERE is_completed = true) THEN
    RAISE EXCEPTION 'Bootstrap permanently closed: initial platform bootstrap was already completed. Subsequent bootstrap attempts are prohibited.';
  END IF;

  -- 3. Verify target user identity strictly in auth.users
  SELECT id, email INTO v_auth_user
  FROM auth.users
  WHERE id = p_target_user_id;

  IF v_auth_user.id IS NULL THEN
    RAISE EXCEPTION 'User not found: target user ID % does not exist in auth.users', p_target_user_id;
  END IF;

  IF lower(trim(v_auth_user.email)) != lower(trim(p_target_email)) THEN
    RAISE EXCEPTION 'Identity mismatch: auth user email % does not match target email %',
      v_auth_user.email, p_target_email;
  END IF;

  -- 4. CRITICAL PRIVILEGE ESCALATION FIX: Disallow any existing platform administrator
  SELECT role, is_active INTO v_existing_admin
  FROM public.platform_users
  WHERE user_id = p_target_user_id;

  IF v_existing_admin.role IS NOT NULL THEN
    RAISE EXCEPTION 'Privilege escalation rejected: target user % is already an existing platform administrator (role: %, active: %). Initial bootstrap cannot be used to upgrade or reactivate existing administrators.',
      p_target_user_id, v_existing_admin.role, v_existing_admin.is_active;
  END IF;

  -- 5. Verify TOTP factor check flag passed by verified admin API
  IF p_has_verified_totp IS NOT TRUE THEN
    RAISE EXCEPTION 'Security violation: target user must have a verified TOTP MFA factor enrolled before bootstrap assignment';
  END IF;

  -- 6. Plain INSERT into platform_users (NO ON CONFLICT DO UPDATE)
  INSERT INTO public.platform_users (
    user_id,
    role,
    is_active,
    mfa_enforced,
    created_at,
    updated_at
  ) VALUES (
    p_target_user_id,
    'super_admin'::public.platform_role,
    true,
    true,
    now(),
    now()
  )
  RETURNING id INTO v_new_admin_id;

  -- 7. Atomically insert platform_audit_logs record
  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    created_at
  ) VALUES (
    p_target_user_id,
    'super_admin',
    'bootstrap_initial_super_admin',
    'platform_users',
    v_new_admin_id,
    jsonb_build_object(
      'email', lower(trim(p_target_email)),
      'role', 'super_admin',
      'is_active', true,
      'has_verified_totp', true,
      'bootstrapped_at', now()
    ),
    now()
  )
  RETURNING id INTO v_audit_id;

  IF v_audit_id IS NULL THEN
    RAISE EXCEPTION 'Audit failure: failed to create immutable audit trail for super_admin bootstrap';
  END IF;

  -- 8. Atomically insert permanent singleton bootstrap completion marker
  INSERT INTO public.platform_bootstrap_state (
    is_completed,
    completed_at,
    initial_super_admin_user_id,
    initial_super_admin_record_id,
    audit_log_id
  ) VALUES (
    true,
    now(),
    p_target_user_id,
    v_new_admin_id,
    v_audit_id
  );

  RETURN jsonb_build_object(
    'status', 'bootstrapped',
    'admin_id', v_new_admin_id,
    'user_id', p_target_user_id,
    'email', lower(trim(p_target_email)),
    'audit_id', v_audit_id
  );
END;
$$;


-- ============================================================================
-- 11. CONTRACTED RENEWAL INVOICE GENERATION RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.generate_subscription_renewal_invoice_atomic(
  p_actor_auth_id UUID,
  p_org_id UUID,
  p_subscription_id UUID,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_role public.platform_role;
  v_sub RECORD;
  v_invoice_num TEXT;
  v_renewal_amount_cents BIGINT;
  v_new_invoice_id UUID;
  v_audit_id UUID;
BEGIN
  -- 1. Authorization: Platform Super Admin or Finance Admin
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id
    AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin') THEN
    RAISE EXCEPTION 'Access denied: caller % is not authorized to generate renewal invoices', p_actor_auth_id;
  END IF;

  -- 2. Lock Subscription Row
  SELECT * INTO v_sub
  FROM public.org_subscriptions
  WHERE id = p_subscription_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Validation error: subscription % does not exist for organisation %', p_subscription_id, p_org_id;
  END IF;

  IF v_sub.status NOT IN ('active', 'past_due') THEN
    RAISE EXCEPTION 'Invalid state: subscription is in status %, renewal invoices can only be generated for active or past_due subscriptions', v_sub.status;
  END IF;

  -- 3. Calculate Renewal Obligation strictly from IMMUTABLE CONTRACTED SNAPSHOT
  -- Renewal = contracted_base_price_cents + (additional_seats * contracted_additional_seat_price_cents)
  v_renewal_amount_cents := COALESCE(v_sub.contracted_base_price_cents, 0) + 
    (COALESCE(v_sub.additional_seats, 0) * COALESCE(v_sub.contracted_additional_seat_price_cents, 0));

  IF v_renewal_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Billing error: calculated renewal obligation is zero or negative (%)', v_renewal_amount_cents;
  END IF;

  v_invoice_num := 'REN-' || to_char(now(), 'YYYYMM') || '-' || upper(substring(replace(p_org_id::text, '-', ''), 1, 8)) || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 4));

  -- 4. Persist Authoritative Renewal Invoice
  INSERT INTO public.org_subscription_invoices (
    org_id,
    subscription_id,
    invoice_number,
    amount_cents,
    currency,
    status,
    due_date,
    created_at,
    updated_at
  ) VALUES (
    p_org_id,
    v_sub.id,
    v_invoice_num,
    v_renewal_amount_cents,
    COALESCE(v_sub.contracted_currency, 'INR'),
    'issued',
    now() + INTERVAL '14 days',
    now(),
    now()
  )
  RETURNING id INTO v_new_invoice_id;

  -- 5. Audit Log
  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_actor_auth_id,
    v_caller_role,
    'generate_subscription_renewal_invoice',
    'org_subscription_invoices',
    v_new_invoice_id,
    jsonb_build_object(
      'invoice_number', v_invoice_num,
      'amount_cents', v_renewal_amount_cents,
      'currency', COALESCE(v_sub.contracted_currency, 'INR'),
      'contracted_base_price_cents', v_sub.contracted_base_price_cents,
      'contracted_additional_seat_price_cents', v_sub.contracted_additional_seat_price_cents,
      'additional_seats', v_sub.additional_seats
    ),
    p_ip_address,
    p_user_agent,
    now()
  )
  RETURNING id INTO v_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_new_invoice_id,
    'invoice_number', v_invoice_num,
    'amount_cents', v_renewal_amount_cents,
    'currency', COALESCE(v_sub.contracted_currency, 'INR'),
    'due_date', now() + INTERVAL '14 days'
  );
END;
$$;


-- ============================================================================
-- 12. CONTRACTED ADDITIONAL SEAT PURCHASE RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.purchase_additional_seats_atomic(
  p_actor_auth_id UUID,
  p_org_id UUID,
  p_additional_seats_count INTEGER,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_role public.platform_role;
  v_sub RECORD;
  v_invoice_num TEXT;
  v_addon_amount_cents BIGINT;
  v_new_invoice_id UUID;
  v_updated_total_seats INTEGER;
BEGIN
  -- 1. Authorization: Platform Super Admin, Finance Admin, or Sales Rep
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id
    AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('super_admin', 'finance_admin', 'sales_rep') THEN
    RAISE EXCEPTION 'Access denied: caller % is not authorized to expand seats', p_actor_auth_id;
  END IF;

  IF p_additional_seats_count IS NULL OR p_additional_seats_count <= 0 THEN
    RAISE EXCEPTION 'Validation error: additional seats count must be positive, received %', p_additional_seats_count;
  END IF;

  -- 2. Lock Subscription Row
  SELECT * INTO v_sub
  FROM public.org_subscriptions
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Validation error: subscription does not exist for organisation %', p_org_id;
  END IF;

  IF v_sub.status != 'active' THEN
    RAISE EXCEPTION 'Invalid state: seats can only be added to active subscriptions, current status is %', v_sub.status;
  END IF;

  -- 3. Calculate Seat Expansion Obligation from CONTRACTED SNAPSHOT
  v_addon_amount_cents := p_additional_seats_count * COALESCE(v_sub.contracted_additional_seat_price_cents, 0);

  IF v_addon_amount_cents <= 0 THEN
    RAISE EXCEPTION 'Billing error: contracted additional seat price is zero or not configured for subscription %', v_sub.id;
  END IF;

  v_invoice_num := 'SEAT-' || to_char(now(), 'YYYYMM') || '-' || upper(substring(replace(p_org_id::text, '-', ''), 1, 8)) || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 4));

  -- 4. Persist Seat Expansion Invoice (Obligation Created; Seats NOT Granted Until Payment Verified)
  INSERT INTO public.org_subscription_invoices (
    org_id,
    subscription_id,
    invoice_number,
    invoice_type,
    seat_quantity,
    unit_price_cents,
    amount_cents,
    currency,
    status,
    due_date,
    created_at,
    updated_at
  ) VALUES (
    p_org_id,
    v_sub.id,
    v_invoice_num,
    'additional_seats',
    p_additional_seats_count,
    v_sub.contracted_additional_seat_price_cents,
    v_addon_amount_cents,
    COALESCE(v_sub.contracted_currency, 'INR'),
    'issued',
    now() + INTERVAL '14 days',
    now(),
    now()
  )
  RETURNING id INTO v_new_invoice_id;

  -- 5. Audit Log (Usable seats remain unchanged at invoice creation)
  INSERT INTO public.platform_audit_logs (
    actor_user_id,
    actor_role,
    action,
    target_entity_type,
    target_entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  ) VALUES (
    p_actor_auth_id,
    v_caller_role,
    'create_additional_seats_invoice',
    'org_subscriptions',
    v_sub.id,
    jsonb_build_object(
      'additional_seats_requested', p_additional_seats_count,
      'current_usable_additional_seats', v_sub.additional_seats,
      'invoice_id', v_new_invoice_id,
      'invoice_number', v_invoice_num,
      'amount_cents', v_addon_amount_cents,
      'contracted_additional_seat_price_cents', v_sub.contracted_additional_seat_price_cents,
      'status', 'issued_pending_payment'
    ),
    p_ip_address,
    p_user_agent,
    now()
  );

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_new_invoice_id,
    'invoice_number', v_invoice_num,
    'seats_requested', p_additional_seats_count,
    'usable_additional_seats', v_sub.additional_seats,
    'total_usable_seats', v_sub.included_seats + v_sub.additional_seats,
    'amount_cents', v_addon_amount_cents,
    'currency', COALESCE(v_sub.contracted_currency, 'INR'),
    'status', 'issued_pending_payment',
    'message', 'Additional seat purchase obligation created and invoice issued. Usable seats activate only upon payment verification.'
  );
END;
$$;


-- ============================================================================
-- 13. EXPLICIT POSTGRESQL FUNCTION IDENTITY SIGNATURE REVOKES & GRANTS
-- ============================================================================

-- 1. provision_organisation_atomic
REVOKE ALL ON FUNCTION public.provision_organisation_atomic(
  UUID, TEXT, TEXT, public.org_type, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.provision_organisation_atomic(
  UUID, TEXT, TEXT, public.org_type, TEXT, TEXT, INTEGER, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT
) TO service_role;

-- 2. verify_payment_and_activate_subscription
REVOKE ALL ON FUNCTION public.verify_payment_and_activate_subscription(
  UUID, UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verify_payment_and_activate_subscription(
  UUID, UUID, UUID, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT
) TO service_role;

-- 3. rotate_invitation_token_atomic
REVOKE ALL ON FUNCTION public.rotate_invitation_token_atomic(
  UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.rotate_invitation_token_atomic(
  UUID, UUID, TEXT, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;

-- 4. record_invitation_delivery_outcome
REVOKE ALL ON FUNCTION public.record_invitation_delivery_outcome(
  UUID, TEXT, INTEGER, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_invitation_delivery_outcome(
  UUID, TEXT, INTEGER, TEXT
) TO service_role;

-- 5. bootstrap_initial_super_admin_atomic
REVOKE ALL ON FUNCTION public.bootstrap_initial_super_admin_atomic(
  UUID, TEXT, BOOLEAN
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.bootstrap_initial_super_admin_atomic(
  UUID, TEXT, BOOLEAN
) TO service_role;

-- 6. create_commercial_override_atomic
REVOKE ALL ON FUNCTION public.create_commercial_override_atomic(
  UUID, TEXT, UUID, public.org_type, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.create_commercial_override_atomic(
  UUID, TEXT, UUID, public.org_type, INTEGER, TEXT, BIGINT, BIGINT, BIGINT, TEXT, TEXT
) TO service_role;

-- 7. approve_commercial_override_atomic
REVOKE ALL ON FUNCTION public.approve_commercial_override_atomic(
  UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.approve_commercial_override_atomic(
  UUID, UUID, TEXT, TEXT
) TO service_role;

-- 8. revoke_commercial_override_atomic
REVOKE ALL ON FUNCTION public.revoke_commercial_override_atomic(
  UUID, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.revoke_commercial_override_atomic(
  UUID, UUID, TEXT, TEXT, TEXT
) TO service_role;

-- 9. generate_subscription_renewal_invoice_atomic
REVOKE ALL ON FUNCTION public.generate_subscription_renewal_invoice_atomic(
  UUID, UUID, UUID, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.generate_subscription_renewal_invoice_atomic(
  UUID, UUID, UUID, TEXT, TEXT
) TO service_role;

-- 10. purchase_additional_seats_atomic
REVOKE ALL ON FUNCTION public.purchase_additional_seats_atomic(
  UUID, UUID, INTEGER, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.purchase_additional_seats_atomic(
  UUID, UUID, INTEGER, TEXT, TEXT
) TO service_role;

COMMIT;
