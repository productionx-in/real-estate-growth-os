-- Migration 0032: 20260032_payment_and_commercial_integrity.sql
-- Production X: Payment Verification & Commercial Integrity Fix (Pass 2)
-- 1. Correct pending subscription billing dates (Strict NULL for paid pending_payment)
-- 2. Authoritative Commercial Override Approval Ledger
-- 3. Canonical Payment Settlement Transaction Ledger (single authoritative reference uniqueness)
-- 4. Subscription-specific Invoice Settlement RPC (strict amount, currency, status, lock-order & idempotent replay)
-- 5. Strict Plan Version, Pricing, Org-Type, and Seat Validation inside Provisioning (no fallback, no ambiguity, no fake prices)
-- 6. Onboarding Request Integrity (FOR UPDATE lock, eligible status, matching company_type, atomic 1-row update)
-- 7. Calendar Billing Anniversary Calculations (INTERVAL '1 year' / INTERVAL '1 month')
-- 8. Invitation Delivery State Tracking (delivery_status, delivery_attempts, last_delivery_error)
-- 9. Atomic & Concurrency-Safe Super Admin Bootstrap Procedure (pg_advisory_xact_lock, identity match, TOTP check, atomic audit)
-- 10. Explicit Revoke & Grant Enforcement (REVOKE from PUBLIC/anon/authenticated, GRANT only to service_role)
BEGIN;

-- ============================================================================
-- 1. INVITATION DELIVERY STATE COLUMNS
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
-- 2. AUTHORITATIVE COMMERCIAL OVERRIDES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.subscription_commercial_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  plan_version_id UUID NOT NULL REFERENCES public.subscription_plan_versions(id) ON DELETE RESTRICT,
  target_org_type public.org_type NOT NULL,
  approved_included_seats INTEGER NOT NULL CHECK (approved_included_seats > 0),
  custom_price_annual_cents BIGINT,
  custom_price_monthly_cents BIGINT,
  custom_additional_seat_price_cents BIGINT,
  approved_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'consumed', 'revoked', 'expired')),
  consumed_at TIMESTAMPTZ,
  consumed_org_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commercial_overrides_lookup 
  ON public.subscription_commercial_overrides(code, plan_version_id, status);

ALTER TABLE public.subscription_commercial_overrides ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.subscription_commercial_overrides FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.subscription_commercial_overrides FROM authenticated;
GRANT SELECT ON TABLE public.subscription_commercial_overrides TO authenticated, service_role;


-- ============================================================================
-- 3. CANONICAL PAYMENT SETTLEMENT TRANSACTION LEDGER
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
-- 4. PROVISIONING TRANSACTION (provision_organisation_atomic)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.provision_organisation_atomic(
  p_actor_auth_id UUID,
  p_org_name TEXT,
  p_org_slug TEXT,
  p_org_type public.org_type,
  p_plan_tier TEXT,
  p_included_seats INTEGER DEFAULT NULL,
  p_billing_cycle TEXT DEFAULT 'annual',
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
  v_override_record RECORD;
  v_onboarding_request RECORD;
  v_rows_updated INTEGER;
  v_initial_sub_status TEXT;
  v_period_start TIMESTAMPTZ;
  v_period_end TIMESTAMPTZ;
  v_invoice_num TEXT;
  v_invoice_amount_cents BIGINT;
  v_new_sub_id UUID;
  v_new_invitation_id UUID;
  v_normalized_email TEXT;
  v_effective_override_approved_by UUID := NULL;
  v_effective_override_reason TEXT := NULL;
BEGIN
  -- 1. Authorization: Platform Super Admin ONLY
  IF p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: actor ID cannot be null';
  END IF;

  SELECT role INTO v_caller_role
  FROM public.platform_admins
  WHERE user_id = p_actor_auth_id
    AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: caller % is not an active platform super_admin', p_actor_auth_id;
  END IF;

  -- 2. Input validation
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
    RAISE EXCEPTION 'Validation error: invalid billing_cycle %', p_billing_cycle;
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

    -- Reject already-provisioned requests
    IF v_onboarding_request.status = 'provisioned' THEN
      RAISE EXCEPTION 'Conflict error: onboarding request % has already been provisioned for organisation %',
        p_onboarding_request_id, v_onboarding_request.provisioned_org_id;
    END IF;

    -- Reject rejected requests
    IF v_onboarding_request.status = 'rejected' THEN
      RAISE EXCEPTION 'Invalid state: onboarding request % has been rejected and cannot be provisioned',
        p_onboarding_request_id;
    END IF;

    -- Require an eligible, explicitly provisionable status (approved or pending_approval)
    IF v_onboarding_request.status NOT IN ('approved', 'pending_approval') THEN
      RAISE EXCEPTION 'Invalid state: onboarding request % is in status %, expected approved or pending_approval',
        p_onboarding_request_id, v_onboarding_request.status;
    END IF;

    -- Verify intended organisation type matches p_org_type exactly
    IF v_onboarding_request.company_type IS DISTINCT FROM p_org_type THEN
      RAISE EXCEPTION 'Validation error: onboarding request company_type (%) does not match requested organisation type (%)',
        v_onboarding_request.company_type, p_org_type;
    END IF;
  END IF;

  -- 5. Authoritative Plan Version & Pricing Validation (NO FALLBACK, NO AMBIGUITY)
  SELECT count(*)
  INTO v_matching_plan_count
  FROM public.subscription_plans sp
  JOIN public.subscription_plan_versions pv ON pv.plan_id = sp.id
  WHERE sp.tier = p_plan_tier
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

  SELECT 
    sp.id,
    sp.is_active,
    sp.target_org_type,
    sp.price_annual_cents,
    sp.price_monthly_cents,
    sp.additional_seat_price_cents,
    sp.included_seats,
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
  WHERE sp.tier = p_plan_tier
    AND sp.target_org_type = p_org_type
    AND sp.is_active = true
    AND pv.is_current = true;

  -- Validate baseline plan pricing
  IF p_plan_tier != 'free' THEN
    IF v_plan_price_annual_cents IS NULL OR v_plan_price_annual_cents <= 0 THEN
      RAISE EXCEPTION 'Validation error: plan price_annual_cents must be positive for paid tier %, found %',
        p_plan_tier, v_plan_price_annual_cents;
    END IF;
    IF v_plan_price_monthly_cents IS NULL OR v_plan_price_monthly_cents <= 0 THEN
      RAISE EXCEPTION 'Validation error: plan price_monthly_cents must be positive for paid tier %, found %',
        p_plan_tier, v_plan_price_monthly_cents;
    END IF;
    IF v_plan_add_seat_price_cents IS NULL OR v_plan_add_seat_price_cents < 0 THEN
      RAISE EXCEPTION 'Validation error: plan additional_seat_price_cents cannot be negative for tier %, found %',
        p_plan_tier, v_plan_add_seat_price_cents;
    END IF;
  END IF;

  -- 6. Derive or Validate Included Seats & Commercial Overrides
  IF p_included_seats IS NULL THEN
    v_effective_included_seats := v_plan_default_included_seats;
  ELSE
    v_effective_included_seats := p_included_seats;
  END IF;

  IF v_effective_included_seats < 1 THEN
    RAISE EXCEPTION 'Validation error: included_seats must be at least 1, received %', v_effective_included_seats;
  END IF;

  IF v_effective_included_seats != v_plan_default_included_seats THEN
    IF p_commercial_override_code IS NULL OR trim(p_commercial_override_code) = '' THEN
      RAISE EXCEPTION 'Commercial policy violation: requested seats (%) differs from plan baseline (%) without an independent commercial override code',
        v_effective_included_seats, v_plan_default_included_seats;
    END IF;

    -- Validate independent commercial override record
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

    IF v_override_record.approved_included_seats < v_effective_included_seats THEN
      RAISE EXCEPTION 'Commercial policy violation: override code approves up to % seats, but % seats were requested',
        v_override_record.approved_included_seats, v_effective_included_seats;
    END IF;

    -- Validate custom override pricing if specified
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
  END IF;

  -- 7. Determine Subscription Status & Strict Billing Dates
  IF p_plan_tier = 'free' THEN
    v_initial_sub_status := 'trialing';
    v_period_start := now();
    v_period_end := now() + INTERVAL '14 days';
  ELSE
    -- Paid subscriptions MUST enter pending_payment with NULL paid period dates
    v_initial_sub_status := 'pending_payment';
    v_period_start := NULL;
    v_period_end := NULL;
  END IF;

  -- 8. Create Organisation Row
  INSERT INTO public.organisations (
    name,
    slug,
    org_type,
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

  -- Consume commercial override if one was used
  IF v_override_record.id IS NOT NULL THEN
    UPDATE public.subscription_commercial_overrides
    SET status = 'consumed',
        consumed_at = now(),
        consumed_org_id = v_new_org_id,
        updated_at = now()
    WHERE id = v_override_record.id;
  END IF;

  -- 9. Create Subscription Row
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
    v_effective_included_seats,
    0,
    v_initial_sub_status,
    p_billing_cycle,
    NULL,
    NULL,
    v_effective_override_approved_by,
    v_effective_override_reason
  )
  RETURNING id INTO v_new_sub_id;

  -- 10. Generate Authoritative Invoice (FOR PAID SUBSCRIPTIONS ONLY)
  IF p_plan_tier != 'free' THEN
    v_invoice_num := 'INV-' || to_char(now(), 'YYYYMM') || '-' || upper(substring(replace(v_new_org_id::text, '-', ''), 1, 8));
    
    IF p_billing_cycle = 'annual' THEN
      v_invoice_amount_cents := COALESCE(v_override_record.custom_price_annual_cents, v_plan_price_annual_cents);
    ELSE
      v_invoice_amount_cents := COALESCE(v_override_record.custom_price_monthly_cents, v_plan_price_monthly_cents);
    END IF;

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
    );
  END IF;

  -- 11. Handle Owner Member / Invitation
  SELECT id INTO v_owner_user_id
  FROM auth.users
  WHERE lower(email) = v_normalized_email;

  IF v_owner_user_id IS NOT NULL THEN
    INSERT INTO public.org_members (
      org_id,
      user_id,
      role,
      status,
      created_at,
      updated_at
    ) VALUES (
      v_new_org_id,
      v_owner_user_id,
      'owner',
      'active',
      now(),
      now()
    );
  END IF;

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
    p_actor_auth_id,
    p_invitation_token_hash,
    p_token_expires_at,
    'pending',
    0,
    now(),
    now()
  )
  RETURNING id INTO v_new_invitation_id;

  -- 12. Update Onboarding Request (if linked) - ATOMIC 1-ROW UPDATE
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

  -- 13. Write WORM Platform Audit Log
  INSERT INTO public.platform_audit_logs (
    actor_id,
    action,
    target_resource,
    target_id,
    details,
    ip_address,
    user_agent
  ) VALUES (
    p_actor_auth_id,
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
    p_user_agent
  );

  RETURN jsonb_build_object(
    'org_id', v_new_org_id,
    'org_slug', trim(p_org_slug),
    'subscription_id', v_new_sub_id,
    'subscription_status', v_initial_sub_status,
    'invoice_number', v_invoice_num,
    'invoice_amount_cents', v_invoice_amount_cents,
    'invitation_id', v_new_invitation_id,
    'owner_email', v_normalized_email,
    'included_seats', v_effective_included_seats
  );
END;
$$;


-- ============================================================================
-- 5. SUBSCRIPTION-SPECIFIC PAYMENT VERIFICATION & ACTIVATION RPC
-- ============================================================================

CREATE OR REPLACE FUNCTION public.verify_payment_and_activate_subscription(
  p_actor_auth_id UUID,
  p_org_id UUID,
  p_subscription_id UUID,
  p_invoice_number TEXT,
  p_payment_reference TEXT,
  p_amount_cents BIGINT,
  p_currency TEXT DEFAULT 'INR',
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
  FROM public.platform_admins
  WHERE user_id = p_actor_auth_id
    AND is_active = true;

  IF v_caller_role IS NULL OR v_caller_role != 'super_admin' THEN
    RAISE EXCEPTION 'Access denied: caller % is not an active platform super_admin', p_actor_auth_id;
  END IF;

  -- 2. Input validation
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

  -- 3. Lock Subscription Row First (Strict Lock Order: Subscription -> Invoice)
  SELECT * INTO v_sub
  FROM public.org_subscriptions
  WHERE id = p_subscription_id
    AND org_id = p_org_id
  FOR UPDATE;

  IF v_sub.id IS NULL THEN
    RAISE EXCEPTION 'Validation error: subscription % does not exist for organisation %', p_subscription_id, p_org_id;
  END IF;

  -- 4. Lock Invoice Row Second
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

  -- 5. Canonical Payment Reference Settlement Check (Global Uniqueness & Idempotent Replay)
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

  -- 6. Subscription State Validation
  IF v_sub.status != 'pending_payment' THEN
    RAISE EXCEPTION 'Invalid state: subscription is in status %, expected pending_payment. Duplicate activation rejected.', v_sub.status;
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

  -- 8. Compute Paid Billing Anniversary Dates (CALENDAR INTERVALS: 1 year / 1 month)
  v_new_period_start := now();
  IF v_sub.billing_cycle = 'annual' THEN
    v_new_period_end := v_new_period_start + INTERVAL '1 year';
  ELSE
    v_new_period_end := v_new_period_start + INTERVAL '1 month';
  END IF;

  -- 9. Insert Canonical Payment Transaction Record
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

  -- 10. Settle Invoice
  UPDATE public.org_subscription_invoices
  SET status = 'paid',
      paid_at = now(),
      payment_reference = v_clean_ref,
      updated_at = now()
  WHERE id = v_invoice.id;

  -- 11. Activate Subscription with Established Anniversary Dates
  UPDATE public.org_subscriptions
  SET status = 'active',
      current_period_start = v_new_period_start,
      current_period_end = v_new_period_end,
      updated_at = now()
  WHERE id = v_sub.id;

  -- 12. Write WORM Platform Audit Log
  INSERT INTO public.platform_audit_logs (
    actor_id,
    action,
    target_resource,
    target_id,
    details,
    ip_address,
    user_agent
  ) VALUES (
    p_actor_auth_id,
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
    p_user_agent
  );

  RETURN jsonb_build_object(
    'status', 'activated',
    'subscription_id', v_sub.id,
    'subscription_status', 'active',
    'invoice_id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'payment_reference', v_clean_ref,
    'current_period_start', v_new_period_start,
    'current_period_end', v_new_period_end
  );
END;
$$;


-- ============================================================================
-- 6. ATOMIC & CONCURRENCY-SAFE SUPER ADMIN BOOTSTRAP RPC
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
  v_admin_count INTEGER;
  v_auth_user RECORD;
  v_new_admin_id UUID;
  v_audit_id UUID;
BEGIN
  -- 1. Database-Level Concurrency Guard
  -- Acquire an exclusive advisory transaction lock on a dedicated 64-bit key
  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_initial_super_admin'));

  -- Check if any active super_admin already exists
  SELECT count(*) INTO v_admin_count
  FROM public.platform_admins
  WHERE role = 'super_admin'
    AND is_active = true;

  IF v_admin_count > 0 THEN
    RAISE EXCEPTION 'Bootstrap locked: % active super_admin(s) already exist. Initial bootstrap is permanently closed.',
      v_admin_count;
  END IF;

  -- 2. Verify target user identity strictly in auth.users
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

  -- 3. Verify TOTP factor check flag passed by verified admin API
  IF p_has_verified_totp IS NOT TRUE THEN
    RAISE EXCEPTION 'Security violation: target user must have a verified TOTP MFA factor enrolled before bootstrap assignment';
  END IF;

  -- 4. Atomically insert into platform_admins
  INSERT INTO public.platform_admins (
    user_id,
    role,
    is_active,
    created_by,
    created_at,
    updated_at
  ) VALUES (
    p_target_user_id,
    'super_admin',
    true,
    p_target_user_id,
    now(),
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET role = 'super_admin',
      is_active = true,
      updated_at = now()
  RETURNING id INTO v_new_admin_id;

  -- 5. Atomically insert platform_audit_logs record
  -- If this insert fails, the transaction automatically rolls back
  INSERT INTO public.platform_audit_logs (
    actor_id,
    action,
    target_resource,
    target_id,
    details,
    created_at
  ) VALUES (
    p_target_user_id,
    'bootstrap_initial_super_admin',
    'platform_admins',
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
-- 7. EXPLICIT REVOKE & GRANT ENFORCEMENT
-- ============================================================================

-- Revoke all direct execution from PUBLIC, anon, and authenticated
REVOKE ALL ON FUNCTION public.provision_organisation_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_organisation_atomic TO service_role;

REVOKE ALL ON FUNCTION public.verify_payment_and_activate_subscription FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_payment_and_activate_subscription TO service_role;

REVOKE ALL ON FUNCTION public.bootstrap_initial_super_admin_atomic FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bootstrap_initial_super_admin_atomic TO service_role;

COMMIT;
