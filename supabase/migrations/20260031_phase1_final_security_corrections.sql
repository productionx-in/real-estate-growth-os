-- Migration 0031: 20260031_phase1_final_security_corrections.sql
-- Production X: Phase 1 Final Corrective Pass
-- 1. Correct subscription activation, payment verification, and billing lifecycle (no duplicate activation, no billing reset)
-- 2. Authoritative payment obligation/ledger (payment reference uniqueness, amount/currency validation)
-- 3. Strict plan version, org-type, and seat validation inside provisioning transaction
-- 4. Correct pending subscription billing dates (no future period dates for pending_payment)
-- 5. Safe, non-destructive status check constraint replacement
-- 6. Atomic one-time Super Admin bootstrap under table lock
BEGIN;

-- ============================================================================
-- 1. SUBSCRIPTION LIFECYCLE SCHEMA EXTENSIONS & SAFE CONSTRAINT REPLACEMENT
-- ============================================================================

-- Safely identify and drop ONLY the status CHECK constraint on org_subscriptions
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.org_subscriptions'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%status%ANY%'
  ) LOOP
    EXECUTE format('ALTER TABLE public.org_subscriptions DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.org_subscriptions
  DROP CONSTRAINT IF EXISTS org_subscriptions_status_check;

ALTER TABLE public.org_subscriptions
  ADD CONSTRAINT org_subscriptions_status_check
  CHECK (status IN ('pending_payment', 'trial', 'active', 'past_due', 'canceled', 'expired'));

-- Track payment verification, commercial approval overrides, and activation timestamps
ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payment_reference TEXT,
  ADD COLUMN IF NOT EXISTS payment_amount_cents BIGINT,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS commercial_override_approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS commercial_override_reason TEXT;

-- Enforce global uniqueness on payment_reference to prevent reference reuse across subscriptions
CREATE UNIQUE INDEX IF NOT EXISTS uq_org_subscriptions_payment_ref
  ON public.org_subscriptions(payment_reference)
  WHERE payment_reference IS NOT NULL;


-- ============================================================================
-- 2. AUTHORITATIVE SUBSCRIPTION INVOICES / PAYMENT OBLIGATIONS TABLE
-- ============================================================================
-- Smallest safe, schema-consistent payment ledger to prevent arbitrary payment activations
CREATE TABLE IF NOT EXISTS public.org_subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.org_subscriptions(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  currency TEXT NOT NULL DEFAULT 'INR',
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'paid', 'void', 'canceled')),
  due_date TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  paid_at TIMESTAMPTZ,
  payment_reference TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_org ON public.org_subscription_invoices(org_id);
CREATE INDEX IF NOT EXISTS idx_sub_invoices_sub ON public.org_subscription_invoices(subscription_id, status);

ALTER TABLE public.org_subscription_invoices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.org_subscription_invoices FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.org_subscription_invoices FROM authenticated;
GRANT SELECT ON TABLE public.org_subscription_invoices TO authenticated, service_role;


-- ============================================================================
-- 3. ATOMIC DATABASE-LEVEL ONE-TIME BOOTSTRAP ENFORCEMENT
-- ============================================================================

CREATE OR REPLACE FUNCTION public.bootstrap_initial_super_admin_atomic(
  p_auth_user_id UUID,
  p_email TEXT,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  platform_user_id UUID,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_existing_count INTEGER;
  v_new_platform_user_id UUID;
  v_profile_id UUID;
BEGIN
  LOCK TABLE public.platform_users IN EXCLUSIVE MODE;

  SELECT COUNT(*)::INTEGER INTO v_existing_count
  FROM public.platform_users
  WHERE role = 'super_admin'::public.platform_role
    AND is_active = true;

  IF v_existing_count > 0 THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Security Alert: Platform Super Admin already bootstrapped. Multiple initialization blocked.'::TEXT;
    RETURN;
  END IF;

  SELECT id INTO v_profile_id
  FROM public.profiles
  WHERE auth_user_id = p_auth_user_id;

  IF NOT FOUND THEN
    INSERT INTO public.profiles (auth_user_id, full_name)
    VALUES (p_auth_user_id, 'Platform Super Admin')
    RETURNING id INTO v_profile_id;
  END IF;

  INSERT INTO public.platform_users (
    user_id,
    role,
    is_active,
    mfa_enforced
  ) VALUES (
    p_auth_user_id,
    'super_admin'::public.platform_role,
    true,
    true
  ) RETURNING id INTO v_new_platform_user_id;

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
    p_auth_user_id,
    'super_admin'::public.platform_role,
    'platform.bootstrap_super_admin',
    'platform_user',
    v_new_platform_user_id,
    jsonb_build_object(
      'email', lower(trim(p_email)),
      'mfa_enforced', true,
      'bootstrap_method', 'ONE_TIME_ATOMIC_LOCK'
    ),
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT true, v_new_platform_user_id, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.bootstrap_initial_super_admin_atomic(UUID, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_super_admin_atomic(UUID, TEXT, TEXT, TEXT) TO service_role;


-- ============================================================================
-- 4. STRENGTHENED PROVISIONING TRANSACTION (provision_organisation_atomic)
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
  p_commercial_override_reason TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  org_id UUID,
  org_slug TEXT,
  subscription_id UUID,
  invitation_id UUID,
  invoice_id UUID,
  invoice_number TEXT,
  initial_amount_cents BIGINT
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
  v_version_included_seats INTEGER;
  v_version_target_type public.org_type;
  v_base_price_cents BIGINT;
  v_additional_seat_price_cents BIGINT;
  v_calculated_amount_cents BIGINT;
  v_invoice_id UUID;
  v_invoice_num TEXT;
  v_new_sub_id UUID;
  v_new_invite_id UUID;
  v_legacy_plan public.org_plan;
  v_onboarding RECORD;
  v_initial_sub_status TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
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

  -- E. Authoritative Plan Version & Target Org Type Validation
  -- Strictly require sp.is_active = true, pv.is_current = true, and matching org type
  SELECT
    pv.id,
    pv.included_seats,
    sp.target_org_type,
    CASE WHEN p_billing_cycle = 'annual' THEN pv.base_price_annual_cents ELSE pv.base_price_monthly_cents END,
    pv.additional_seat_price_cents
  INTO
    v_plan_version_id,
    v_version_included_seats,
    v_version_target_type,
    v_base_price_cents,
    v_additional_seat_price_cents
  FROM public.subscription_plan_versions pv
  JOIN public.subscription_plans sp ON sp.id = pv.plan_id
  WHERE sp.code = p_plan_tier
    AND sp.is_active = true
    AND pv.is_current = true
    AND sp.target_org_type = p_org_type
  LIMIT 1;

  IF NOT FOUND THEN
    -- Fallback legacy plan baseline with EQUIVALENT strict validation
    SELECT
      pv.id,
      pv.included_seats,
      sp.target_org_type,
      CASE WHEN p_billing_cycle = 'annual' THEN pv.base_price_annual_cents ELSE pv.base_price_monthly_cents END,
      pv.additional_seat_price_cents
    INTO
      v_plan_version_id,
      v_version_included_seats,
      v_version_target_type,
      v_base_price_cents,
      v_additional_seat_price_cents
    FROM public.subscription_plan_versions pv
    JOIN public.subscription_plans sp ON sp.id = pv.plan_id
    WHERE sp.code = (p_org_type::text || '_legacy_v1')
      AND sp.is_active = true
      AND pv.is_current = true
      AND sp.target_org_type = p_org_type
    LIMIT 1;
  END IF;

  IF v_plan_version_id IS NULL THEN
    RAISE EXCEPTION 'Validation: No active plan version exists for plan code "%" matching org type "%".', p_plan_tier, p_org_type;
  END IF;

  -- F. Seat Allowance & Commercial Override Validation
  -- Compare requested included_seats with plan version standard
  IF p_included_seats != v_version_included_seats THEN
    IF p_commercial_override_reason IS NULL OR trim(p_commercial_override_reason) = '' THEN
      RAISE EXCEPTION 'Validation: Included seats (%s) does not match plan version baseline (%s). An auditable commercial override reason is required.',
        p_included_seats, v_version_included_seats;
    END IF;
  END IF;

  -- G. Lock & Validate Onboarding Request (if linked)
  IF p_onboarding_request_id IS NOT NULL THEN
    SELECT * INTO v_onboarding
    FROM public.customer_onboarding_requests
    WHERE id = p_onboarding_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Validation: Onboarding request "%" not found.', p_onboarding_request_id;
    END IF;

    IF v_onboarding.status NOT IN ('draft'::public.onboarding_request_status, 'pending_approval'::public.onboarding_request_status, 'approved'::public.onboarding_request_status) THEN
      RAISE EXCEPTION 'Conflict: Onboarding request is already "%" and cannot be provisioned again.', v_onboarding.status;
    END IF;

    IF v_onboarding.provisioned_org_id IS NOT NULL THEN
      RAISE EXCEPTION 'Conflict: Onboarding request has already provisioned organisation "%".', v_onboarding.provisioned_org_id;
    END IF;
  END IF;

  -- H. Determine legacy plan enum value for compatibility
  IF p_plan_tier = 'free' THEN
    v_legacy_plan := 'free'::public.org_plan;
  ELSIF p_plan_tier = 'enterprise' THEN
    v_legacy_plan := 'enterprise'::public.org_plan;
  ELSE
    v_legacy_plan := 'growth'::public.org_plan;
  END IF;

  -- I. Create Organisation Record
  INSERT INTO public.organisations (name, slug, type, plan)
  VALUES (trim(p_org_name), trim(p_org_slug), p_org_type, v_legacy_plan)
  RETURNING id INTO v_new_org_id;

  -- J. Subscription Setup with CORRECT PENDING BILLING DATES
  -- Paid tiers default to 'pending_payment'; billing period start/end remain NULL until payment verification
  -- Free/evaluation tiers use 'trial' and start immediate 14-day trial period
  IF p_plan_tier = 'free' THEN
    v_initial_sub_status := 'trial';
    v_period_start := now();
    v_period_end := now() + INTERVAL '14 days';
  ELSE
    v_initial_sub_status := 'pending_payment';
    v_period_start := NULL;
    v_period_end := NULL;
  END IF;

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
    commercial_override_approved_by,
    commercial_override_reason
  ) VALUES (
    v_new_org_id,
    p_plan_tier,
    v_plan_version_id,
    p_included_seats,
    0,
    v_initial_sub_status,
    p_billing_cycle,
    COALESCE(v_period_start, now()),
    COALESCE(v_period_end, now()),
    CASE WHEN p_included_seats != v_version_included_seats THEN p_actor_auth_id ELSE NULL END,
    p_commercial_override_reason
  ) RETURNING id INTO v_new_sub_id;

  -- K. Create Primary Owner Invitation Record
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

  -- L. Create Authoritative Subscription Invoice / Payment Obligation
  v_invoice_num := 'INV-' || to_char(now(), 'YYYYMM') || '-' || upper(substring(replace(v_new_org_id::text, '-', '') from 1 for 6));
  v_calculated_amount_cents := COALESCE(v_base_price_cents, 0);
  IF p_included_seats > v_version_included_seats THEN
    v_calculated_amount_cents := v_calculated_amount_cents + ((p_included_seats - v_version_included_seats) * COALESCE(v_additional_seat_price_cents, 0));
  END IF;

  INSERT INTO public.org_subscription_invoices (
    org_id,
    subscription_id,
    invoice_number,
    amount_cents,
    status
  ) VALUES (
    v_new_org_id,
    v_new_sub_id,
    v_invoice_num,
    GREATEST(v_calculated_amount_cents, 0),
    'issued'
  ) RETURNING id INTO v_invoice_id;

  -- M. Update Onboarding Request (if linked)
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

  -- N. Write Immutable Platform Audit Log (MUST commit inside transaction)
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
      'plan_version_id', v_plan_version_id,
      'included_seats', p_included_seats,
      'billing_cycle', p_billing_cycle,
      'initial_status', v_initial_sub_status,
      'invoice_id', v_invoice_id,
      'invoice_number', v_invoice_num,
      'invoice_amount_cents', v_calculated_amount_cents,
      'admin_email', lower(trim(p_admin_email)),
      'invitation_id', v_new_invite_id,
      'onboarding_request_id', p_onboarding_request_id,
      'commercial_override_reason', p_commercial_override_reason
    ),
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT
    v_new_org_id,
    trim(p_org_slug),
    v_new_sub_id,
    v_new_invite_id,
    v_invoice_id,
    v_invoice_num,
    v_calculated_amount_cents;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_organisation_atomic(
  UUID, TEXT, TEXT, public.org_type, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.provision_organisation_atomic(
  UUID, TEXT, TEXT, public.org_type, TEXT, INTEGER, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT
) TO service_role;


-- ============================================================================
-- 5. PAYMENT VERIFICATION & SUBSCRIPTION ACTIVATION RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_payment_and_activate_subscription(
  p_actor_auth_id UUID,
  p_org_id UUID,
  p_payment_reference TEXT,
  p_amount_cents BIGINT,
  p_invoice_number TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL,
  p_user_agent TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  subscription_id UUID,
  new_status TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_actor_role public.platform_role;
  v_sub RECORD;
  v_invoice RECORD;
  v_now TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_trimmed_ref TEXT;
BEGIN
  v_trimmed_ref := trim(p_payment_reference);

  -- 1. Authorization: Only active Platform Super Admins can verify payments
  SELECT role INTO v_actor_role
  FROM public.platform_users
  WHERE user_id = p_actor_auth_id
    AND is_active = true;

  IF NOT FOUND OR v_actor_role != 'super_admin'::public.platform_role THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      'Forbidden: Only Platform Super Admins can verify payment and activate subscriptions.'::TEXT;
    RETURN;
  END IF;

  -- 2. Lock subscription row
  SELECT * INTO v_sub
  FROM public.org_subscriptions
  WHERE org_id = p_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      'No subscription found for organisation.'::TEXT;
    RETURN;
  END IF;

  -- 3. Idempotency & Duplicate Prevention:
  -- If already active and payment reference matches, return existing activation without resetting anniversary
  IF v_sub.status = 'active' AND v_sub.payment_reference = v_trimmed_ref THEN
    RETURN QUERY SELECT true, v_sub.id, 'active'::TEXT, v_sub.current_period_start, v_sub.current_period_end, NULL::TEXT;
    RETURN;
  END IF;

  -- Reject duplicate activation of an already-active subscription (never reset billing anniversary)
  IF v_sub.status = 'active' THEN
    RETURN QUERY SELECT false, v_sub.id, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      'Conflict: Subscription is already active. Duplicate payment verification rejected to prevent billing reset.'::TEXT;
    RETURN;
  END IF;

  -- Must be in pending_payment state
  IF v_sub.status != 'pending_payment' THEN
    RETURN QUERY SELECT false, v_sub.id, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      format('Conflict: Subscription status is "%s". Only subscriptions in pending_payment status can be activated.', v_sub.status)::TEXT;
    RETURN;
  END IF;

  -- 4. Prevent Payment Reference Reuse across any other subscriptions
  IF EXISTS (
    SELECT 1 FROM public.org_subscriptions
    WHERE payment_reference = v_trimmed_ref
      AND id != v_sub.id
  ) THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
      'Security Violation: Payment reference has already been used for another subscription.'::TEXT;
    RETURN;
  END IF;

  -- 5. Validate Against Authoritative Invoice / Payment Obligation
  IF p_invoice_number IS NOT NULL AND trim(p_invoice_number) != '' THEN
    SELECT * INTO v_invoice
    FROM public.org_subscription_invoices
    WHERE invoice_number = trim(p_invoice_number)
      AND org_id = p_org_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        format('Validation: Invoice "%s" not found for this organisation.', p_invoice_number)::TEXT;
      RETURN;
    END IF;

    IF v_invoice.status = 'paid' AND v_invoice.payment_reference != v_trimmed_ref THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        'Conflict: Invoice is already settled with a different payment reference.'::TEXT;
      RETURN;
    END IF;

    IF p_amount_cents != v_invoice.amount_cents THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        format('Validation: Payment amount (%s cents) does not match invoice obligation (%s cents).', p_amount_cents, v_invoice.amount_cents)::TEXT;
      RETURN;
    END IF;
  ELSE
    -- If no invoice number supplied, match against the oldest unpaid issued invoice for this subscription
    SELECT * INTO v_invoice
    FROM public.org_subscription_invoices
    WHERE subscription_id = v_sub.id
      AND status = 'issued'
    ORDER BY created_at ASC
    LIMIT 1
    FOR UPDATE;

    IF FOUND AND p_amount_cents != v_invoice.amount_cents THEN
      RETURN QUERY SELECT false, NULL::UUID, NULL::TEXT, NULL::TIMESTAMPTZ, NULL::TIMESTAMPTZ,
        format('Validation: Payment amount (%s cents) does not match outstanding invoice obligation (%s cents).', p_amount_cents, v_invoice.amount_cents)::TEXT;
      RETURN;
    END IF;
  END IF;

  -- 6. Compute Anniversary Billing Start and End
  v_now := now();
  IF v_sub.billing_cycle = 'annual' THEN
    v_period_end := v_now + INTERVAL '365 days';
  ELSE
    v_period_end := v_now + INTERVAL '30 days';
  END IF;

  -- 7. Update Subscription to Active with Verified Payment Metadata
  UPDATE public.org_subscriptions
  SET
    status = 'active',
    current_period_start = v_now,
    current_period_end = v_period_end,
    activated_at = v_now,
    payment_verified_at = v_now,
    payment_verified_by = p_actor_auth_id,
    payment_reference = v_trimmed_ref,
    payment_amount_cents = p_amount_cents,
    is_read_only = false,
    read_only_reason = NULL,
    updated_at = v_now
  WHERE id = v_sub.id;

  -- 8. Update Invoice to Paid (if resolved)
  IF v_invoice.id IS NOT NULL THEN
    UPDATE public.org_subscription_invoices
    SET
      status = 'paid',
      paid_at = v_now,
      payment_reference = v_trimmed_ref,
      updated_at = v_now
    WHERE id = v_invoice.id;
  END IF;

  -- 9. Mandatory Platform Audit Log (commits inside same transaction)
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
    'subscription.payment_verified_and_activated',
    'org_subscription',
    v_sub.id,
    jsonb_build_object(
      'org_id', p_org_id,
      'payment_reference', v_trimmed_ref,
      'payment_amount_cents', p_amount_cents,
      'invoice_id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'billing_cycle', v_sub.billing_cycle,
      'current_period_start', v_now,
      'current_period_end', v_period_end
    ),
    p_ip_address,
    p_user_agent
  );

  RETURN QUERY SELECT true, v_sub.id, 'active'::TEXT, v_now, v_period_end, NULL::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_payment_and_activate_subscription(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_payment_and_activate_subscription(UUID, UUID, TEXT, BIGINT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
