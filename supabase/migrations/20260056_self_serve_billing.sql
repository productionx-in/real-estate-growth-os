-- 20260056_self_serve_billing.sql
-- Self-serve plans and billing: an owner or admin can start a trial, choose a plan, add seats and renew,
-- and pay invoices online (Razorpay). Every amount is computed here in the database from the catalogue,
-- never taken from the browser; payments are settled only by the server after Razorpay's signature checks.
--
-- 1. Catalogue: the two published plans (lib/marketing/pricing.ts), INR, excluding GST.
-- 2. Invoices carry the GST split, the plan they buy, and the Razorpay order they are paid through.
-- 3. Service-role functions: start trial, issue plan / seat / renewal invoices, settle a gateway payment.
-- 4. Fixes: free-tier provisioning wrote status 'trialing' (not allowed; it is 'trial'), so it always failed;
--    auth_shares_team now answers only for the caller's own organisation.
BEGIN;

-- ── 1. Catalogue ────────────────────────────────────────────────────────────────────────────────
INSERT INTO public.subscription_plans (code, tier, name, target_org_type, description, is_active)
VALUES
  ('leads', 'growth', 'REGrow Leads', 'developer', 'Developers running Meta, Google and portal campaigns', true),
  ('agencies', 'starter', 'REGrow for Agencies', 'channel_partner', 'Channel-partner agencies and brokerages', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.subscription_plan_versions
  (plan_id, version_number, is_current, included_seats, currency, base_price_monthly_cents, base_price_annual_cents, additional_seat_price_cents, features)
SELECT p.id, 1, true, v.seats, 'INR', v.monthly, v.annual, v.seat, '{}'::jsonb
FROM public.subscription_plans p
JOIN (VALUES ('leads', 10, 1200000::bigint, 12000000::bigint, 90000::bigint),
             ('agencies', 5, 499900::bigint, 4999000::bigint, 60000::bigint)) AS v(code, seats, monthly, annual, seat)
  ON v.code = p.code
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plan_versions x WHERE x.plan_id = p.id);

-- ── 2. Invoice details ──────────────────────────────────────────────────────────────────────────
ALTER TABLE public.org_subscription_invoices
  ADD COLUMN IF NOT EXISTS subtotal_cents BIGINT CHECK (subtotal_cents IS NULL OR subtotal_cents > 0),
  ADD COLUMN IF NOT EXISTS tax_cents BIGINT NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES public.subscription_plan_versions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT CHECK (billing_cycle IS NULL OR billing_cycle IN ('monthly', 'annual')),
  ADD COLUMN IF NOT EXISTS gateway TEXT CHECK (gateway IS NULL OR gateway = 'razorpay'),
  ADD COLUMN IF NOT EXISTS gateway_order_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS checkout_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS issued_by_profile UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- GST on SaaS in India: 18%.
CREATE OR REPLACE FUNCTION public.billing_gst_cents(p_subtotal BIGINT)
RETURNS BIGINT LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT round(p_subtotal * 0.18)::bigint $$;

CREATE OR REPLACE FUNCTION public.billing_invoice_number(p_prefix TEXT, p_org UUID)
RETURNS TEXT LANGUAGE sql VOLATILE SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT p_prefix || '-' || to_char(now(), 'YYYYMM') || '-' || upper(substring(replace(p_org::text, '-', ''), 1, 8))
             || '-' || upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 6)) $$;

-- The current version of the plan a workspace of this type can buy (one per type).
CREATE OR REPLACE FUNCTION public.billing_plan_for(p_org UUID, p_plan_code TEXT)
RETURNS TABLE (version_id UUID, plan_code TEXT, tier TEXT, included_seats INT, monthly BIGINT, annual BIGINT, seat BIGINT)
LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT v.id, p.code, p.tier, v.included_seats, v.base_price_monthly_cents, v.base_price_annual_cents, v.additional_seat_price_cents
  FROM public.subscription_plans p
  JOIN public.subscription_plan_versions v ON v.plan_id = p.id AND v.is_current
  JOIN public.organisations o ON o.id = p_org AND o.type = p.target_org_type
  WHERE p.code = p_plan_code AND p.is_active AND v.base_price_monthly_cents > 0 AND v.base_price_annual_cents > 0
$$;

-- ── 3a. Start a 14-day trial (once; only for a workspace with no subscription yet) ─────────────
CREATE OR REPLACE FUNCTION public.billing_start_trial(p_org UUID, p_plan_code TEXT, p_actor_profile UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_plan RECORD; v_id UUID;
BEGIN
  SELECT * INTO v_plan FROM public.billing_plan_for(p_org, p_plan_code);
  IF v_plan.version_id IS NULL THEN RAISE EXCEPTION 'billing: no such plan for this workspace' USING ERRCODE = 'check_violation'; END IF;
  PERFORM 1 FROM public.organisations WHERE id = p_org FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.org_subscriptions WHERE org_id = p_org) THEN
    RAISE EXCEPTION 'billing: this workspace already has a subscription' USING ERRCODE = 'unique_violation';
  END IF;
  INSERT INTO public.org_subscriptions (org_id, plan_tier, plan_version_id, included_seats, additional_seats, status, billing_cycle,
    current_period_start, current_period_end, contracted_base_price_cents, contracted_additional_seat_price_cents, contracted_currency)
  VALUES (p_org, v_plan.tier, v_plan.version_id, v_plan.included_seats, 0, 'trial', 'monthly',
    now(), now() + INTERVAL '14 days', v_plan.monthly, v_plan.seat, 'INR')
  RETURNING id INTO v_id;
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_profile_id, action, target_type, target_id, metadata)
  VALUES (p_org, 'member', p_actor_profile, 'billing.trial_started', 'org_subscriptions', v_id::text, jsonb_build_object('plan', p_plan_code, 'days', 14));
  RETURN v_id;
END;
$$;

-- ── 3b. Choose a plan: an invoice for the first period. Paying it activates the plan. ──────────
CREATE OR REPLACE FUNCTION public.billing_issue_plan_invoice(p_org UUID, p_plan_code TEXT, p_cycle TEXT, p_actor_profile UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_plan RECORD; v_sub RECORD; v_sub_id UUID; v_subtotal BIGINT; v_inv UUID;
BEGIN
  IF p_cycle NOT IN ('monthly', 'annual') THEN RAISE EXCEPTION 'billing: cycle must be monthly or annual' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO v_plan FROM public.billing_plan_for(p_org, p_plan_code);
  IF v_plan.version_id IS NULL THEN RAISE EXCEPTION 'billing: no such plan for this workspace' USING ERRCODE = 'check_violation'; END IF;
  PERFORM 1 FROM public.organisations WHERE id = p_org FOR UPDATE;
  SELECT * INTO v_sub FROM public.org_subscriptions WHERE org_id = p_org FOR UPDATE;
  IF v_sub.id IS NOT NULL AND v_sub.status IN ('active', 'past_due') THEN
    RAISE EXCEPTION 'billing: the workspace already has an active plan; renew or add seats instead' USING ERRCODE = 'check_violation';
  END IF;
  IF v_sub.id IS NULL THEN
    INSERT INTO public.org_subscriptions (org_id, plan_tier, plan_version_id, included_seats, additional_seats, status, billing_cycle,
      contracted_base_price_cents, contracted_additional_seat_price_cents, contracted_currency)
    VALUES (p_org, v_plan.tier, v_plan.version_id, v_plan.included_seats, 0, 'pending_payment', p_cycle,
      CASE WHEN p_cycle = 'annual' THEN v_plan.annual ELSE v_plan.monthly END, v_plan.seat, 'INR')
    RETURNING id INTO v_sub_id;
  ELSE
    v_sub_id := v_sub.id;
  END IF;
  -- One open plan invoice at a time: an earlier unpaid one is voided.
  UPDATE public.org_subscription_invoices SET status = 'void', updated_at = now()
   WHERE org_id = p_org AND invoice_type = 'subscription' AND status = 'issued';
  v_subtotal := CASE WHEN p_cycle = 'annual' THEN v_plan.annual ELSE v_plan.monthly END;
  INSERT INTO public.org_subscription_invoices (org_id, subscription_id, invoice_number, currency, amount_cents, subtotal_cents, tax_cents,
    status, due_date, invoice_type, plan_version_id, billing_cycle, issued_by_profile)
  VALUES (p_org, v_sub_id, public.billing_invoice_number('PLAN', p_org), 'INR', v_subtotal + public.billing_gst_cents(v_subtotal), v_subtotal,
    public.billing_gst_cents(v_subtotal), 'issued', now() + INTERVAL '7 days', 'subscription', v_plan.version_id, p_cycle, p_actor_profile)
  RETURNING id INTO v_inv;
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_profile_id, action, target_type, target_id, metadata)
  VALUES (p_org, 'member', p_actor_profile, 'billing.invoice_issued', 'org_subscription_invoices', v_inv::text,
    jsonb_build_object('type', 'subscription', 'plan', p_plan_code, 'cycle', p_cycle, 'subtotal_cents', v_subtotal));
  RETURN v_inv;
END;
$$;

-- ── 3c. Add seats to an active plan: charged for the rest of the current period only. ─────────
CREATE OR REPLACE FUNCTION public.billing_issue_seat_invoice(p_org UUID, p_seats INT, p_actor_profile UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_sub RECORD; v_cycle_price BIGINT; v_ratio NUMERIC; v_subtotal BIGINT; v_inv UUID;
BEGIN
  IF p_seats IS NULL OR p_seats < 1 OR p_seats > 500 THEN RAISE EXCEPTION 'billing: seats must be between 1 and 500' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO v_sub FROM public.org_subscriptions WHERE org_id = p_org FOR UPDATE;
  IF v_sub.id IS NULL OR v_sub.status <> 'active' OR v_sub.current_period_end IS NULL OR v_sub.current_period_end <= now() THEN
    RAISE EXCEPTION 'billing: seats can be added to an active plan only' USING ERRCODE = 'check_violation';
  END IF;
  IF coalesce(v_sub.contracted_additional_seat_price_cents, 0) <= 0 THEN
    RAISE EXCEPTION 'billing: this plan has no seat price; contact us to add seats' USING ERRCODE = 'check_violation';
  END IF;
  v_cycle_price := v_sub.contracted_additional_seat_price_cents * CASE WHEN v_sub.billing_cycle = 'annual' THEN 10 ELSE 1 END;
  v_ratio := LEAST(1, GREATEST(0,
    extract(epoch FROM (v_sub.current_period_end - now())) / NULLIF(extract(epoch FROM (v_sub.current_period_end - coalesce(v_sub.current_period_start, now() - INTERVAL '1 month'))), 0)));
  v_subtotal := GREATEST(100, ceil(p_seats * v_cycle_price * coalesce(v_ratio, 1))::bigint);
  INSERT INTO public.org_subscription_invoices (org_id, subscription_id, invoice_number, currency, amount_cents, subtotal_cents, tax_cents,
    status, due_date, invoice_type, seat_quantity, unit_price_cents, billing_cycle, issued_by_profile)
  VALUES (p_org, v_sub.id, public.billing_invoice_number('SEAT', p_org), 'INR', v_subtotal + public.billing_gst_cents(v_subtotal), v_subtotal,
    public.billing_gst_cents(v_subtotal), 'issued', now() + INTERVAL '7 days', 'additional_seats', p_seats, v_cycle_price, v_sub.billing_cycle, p_actor_profile)
  RETURNING id INTO v_inv;
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_profile_id, action, target_type, target_id, metadata)
  VALUES (p_org, 'member', p_actor_profile, 'billing.invoice_issued', 'org_subscription_invoices', v_inv::text,
    jsonb_build_object('type', 'additional_seats', 'seats', p_seats, 'subtotal_cents', v_subtotal));
  RETURN v_inv;
END;
$$;

-- ── 3d. Renew: the next period (plan + extra seats), from 15 days before the period ends. ──────
CREATE OR REPLACE FUNCTION public.billing_issue_renewal_invoice(p_org UUID, p_actor_profile UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_sub RECORD; v_subtotal BIGINT; v_inv UUID;
BEGIN
  SELECT * INTO v_sub FROM public.org_subscriptions WHERE org_id = p_org FOR UPDATE;
  IF v_sub.id IS NULL OR v_sub.status NOT IN ('active', 'past_due') THEN
    RAISE EXCEPTION 'billing: only an active plan can be renewed' USING ERRCODE = 'check_violation';
  END IF;
  IF v_sub.current_period_end IS NOT NULL AND v_sub.current_period_end > now() + INTERVAL '15 days' THEN
    RAISE EXCEPTION 'billing: renewal opens 15 days before the period ends' USING ERRCODE = 'check_violation';
  END IF;
  SELECT id INTO v_inv FROM public.org_subscription_invoices
   WHERE org_id = p_org AND invoice_type = 'renewal' AND status = 'issued' ORDER BY created_at DESC LIMIT 1;
  IF v_inv IS NOT NULL THEN RETURN v_inv; END IF; -- one open renewal at a time
  v_subtotal := coalesce(v_sub.contracted_base_price_cents, 0)
              + v_sub.additional_seats * coalesce(v_sub.contracted_additional_seat_price_cents, 0) * CASE WHEN v_sub.billing_cycle = 'annual' THEN 10 ELSE 1 END;
  IF v_subtotal <= 0 THEN RAISE EXCEPTION 'billing: this plan has no price; contact us to renew' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.org_subscription_invoices (org_id, subscription_id, invoice_number, currency, amount_cents, subtotal_cents, tax_cents,
    status, due_date, invoice_type, plan_version_id, billing_cycle, issued_by_profile)
  VALUES (p_org, v_sub.id, public.billing_invoice_number('RENEW', p_org), coalesce(v_sub.contracted_currency, 'INR'),
    v_subtotal + public.billing_gst_cents(v_subtotal), v_subtotal, public.billing_gst_cents(v_subtotal), 'issued',
    coalesce(v_sub.current_period_end, now() + INTERVAL '7 days'), 'renewal', v_sub.plan_version_id, v_sub.billing_cycle, p_actor_profile)
  RETURNING id INTO v_inv;
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_profile_id, action, target_type, target_id, metadata)
  VALUES (p_org, 'member', p_actor_profile, 'billing.invoice_issued', 'org_subscription_invoices', v_inv::text,
    jsonb_build_object('type', 'renewal', 'subtotal_cents', v_subtotal));
  RETURN v_inv;
END;
$$;

-- ── 3e. Settle a payment Razorpay has confirmed (server only, after signature verification). ────
-- Idempotent per payment id; the order must be the one created for this invoice, and the amount and
-- currency must equal the invoice. The effect depends on the invoice type, as in the platform's
-- manual verification (verify_payment_and_activate_subscription), which is unchanged.
CREATE OR REPLACE FUNCTION public.billing_settle_gateway_payment(p_order_id TEXT, p_payment_id TEXT, p_amount_cents BIGINT, p_currency TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_inv RECORD; v_sub RECORD; v_plan RECORD; v_paid RECORD; v_end TIMESTAMPTZ; v_ref TEXT;
BEGIN
  IF coalesce(btrim(p_order_id), '') = '' OR coalesce(btrim(p_payment_id), '') = '' THEN
    RAISE EXCEPTION 'billing: order and payment ids are required' USING ERRCODE = 'check_violation';
  END IF;
  v_ref := 'razorpay:' || btrim(p_payment_id);
  PERFORM pg_advisory_xact_lock(hashtext('payment_ref_' || v_ref));
  SELECT * INTO v_inv FROM public.org_subscription_invoices WHERE gateway_order_id = p_order_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'billing: unknown order' USING ERRCODE = 'no_data_found'; END IF;

  SELECT * INTO v_paid FROM public.org_subscription_payments WHERE payment_reference = v_ref;
  IF v_paid.id IS NOT NULL THEN
    IF v_paid.invoice_id = v_inv.id THEN
      RETURN jsonb_build_object('status', 'already_settled', 'invoice_id', v_inv.id, 'org_id', v_inv.org_id);
    END IF;
    RAISE EXCEPTION 'billing: payment already settled for another invoice' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_inv.status = 'paid' THEN
    -- A second, different payment for an already-paid invoice: never applied twice (refund it in Razorpay).
    RAISE EXCEPTION 'billing: invoice already paid' USING ERRCODE = 'unique_violation';
  END IF;
  IF v_inv.status <> 'issued' THEN RAISE EXCEPTION 'billing: invoice is %', v_inv.status USING ERRCODE = 'check_violation'; END IF;
  IF p_amount_cents <> v_inv.amount_cents OR upper(p_currency) <> upper(v_inv.currency) THEN
    RAISE EXCEPTION 'billing: amount or currency does not match the invoice' USING ERRCODE = 'check_violation';
  END IF;
  IF v_inv.checkout_by IS NULL THEN RAISE EXCEPTION 'billing: invoice has no checkout' USING ERRCODE = 'check_violation'; END IF;

  SELECT * INTO v_sub FROM public.org_subscriptions WHERE id = v_inv.subscription_id FOR UPDATE;

  INSERT INTO public.org_subscription_payments (payment_reference, invoice_id, subscription_id, org_id, amount_cents, currency, verified_by, verified_at)
  VALUES (v_ref, v_inv.id, v_inv.subscription_id, v_inv.org_id, p_amount_cents, upper(p_currency), v_inv.checkout_by, now());
  UPDATE public.org_subscription_invoices SET status = 'paid', paid_at = now(), payment_reference = v_ref, updated_at = now() WHERE id = v_inv.id;

  IF v_inv.invoice_type = 'subscription' THEN
    SELECT p.tier, v.included_seats, v.base_price_monthly_cents, v.base_price_annual_cents, v.additional_seat_price_cents
      INTO v_plan
      FROM public.subscription_plan_versions v JOIN public.subscription_plans p ON p.id = v.plan_id WHERE v.id = v_inv.plan_version_id;
    v_end := now() + CASE WHEN v_inv.billing_cycle = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;
    UPDATE public.org_subscriptions SET
      status = 'active', plan_version_id = v_inv.plan_version_id, plan_tier = v_plan.tier, included_seats = v_plan.included_seats,
      billing_cycle = v_inv.billing_cycle, current_period_start = now(), current_period_end = v_end,
      contracted_base_price_cents = v_inv.subtotal_cents, contracted_additional_seat_price_cents = v_plan.additional_seat_price_cents,
      contracted_currency = v_inv.currency, last_verified_payment_id = NULL, payment_verified_at = now(),
      payment_reference = v_ref, payment_amount_cents = p_amount_cents, activated_at = coalesce(activated_at, now()), updated_at = now()
    WHERE id = v_sub.id;
  ELSIF v_inv.invoice_type = 'additional_seats' THEN
    UPDATE public.org_subscriptions SET additional_seats = additional_seats + v_inv.seat_quantity, updated_at = now() WHERE id = v_sub.id;
  ELSE -- renewal
    v_end := greatest(coalesce(v_sub.current_period_end, now()), now() - INTERVAL '1 second')
           + CASE WHEN v_sub.billing_cycle = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;
    UPDATE public.org_subscriptions SET status = 'active', current_period_end = v_end, updated_at = now() WHERE id = v_sub.id;
  END IF;

  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_user_id, actor_label, action, target_type, target_id, metadata)
  VALUES (v_inv.org_id, 'system', v_inv.checkout_by, 'Razorpay', 'billing.payment_received', 'org_subscription_invoices', v_inv.id::text,
    jsonb_build_object('invoice_number', v_inv.invoice_number, 'type', v_inv.invoice_type, 'amount_cents', p_amount_cents, 'payment', v_ref));
  RETURN jsonb_build_object('status', 'settled', 'invoice_id', v_inv.id, 'org_id', v_inv.org_id, 'type', v_inv.invoice_type);
END;
$$;

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.billing_start_trial(uuid, text, uuid)', 'public.billing_issue_plan_invoice(uuid, text, text, uuid)',
    'public.billing_issue_seat_invoice(uuid, integer, uuid)', 'public.billing_issue_renewal_invoice(uuid, uuid)',
    'public.billing_settle_gateway_payment(text, text, bigint, text)', 'public.billing_plan_for(uuid, text)',
    'public.billing_gst_cents(bigint)', 'public.billing_invoice_number(text, uuid)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ── 4. Fixes ────────────────────────────────────────────────────────────────────────────────────
-- A signed-in member may only ask about their own organisation's teams. Server-side callers (no signed-in
-- user, e.g. assignment triggers fired by the service role) are unaffected.
CREATE OR REPLACE FUNCTION public.auth_shares_team(p_org UUID, p_a UUID, p_b UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT p_a IS NOT NULL AND p_b IS NOT NULL
    AND (auth.uid() IS NULL OR public.auth_is_member_of_org(p_org))
    AND EXISTS (
      SELECT 1
      FROM public.team_members a
      JOIN public.team_members b ON b.team_id = a.team_id AND b.org_id = a.org_id
      JOIN public.teams t ON t.id = a.team_id AND t.is_active
      WHERE a.org_id = p_org AND a.profile_id = p_a AND b.profile_id = p_b
    );
$$;

CREATE OR REPLACE FUNCTION public.provision_organisation_atomic(p_actor_auth_id uuid, p_org_name text, p_org_slug text, p_org_type org_type, p_plan_tier text, p_billing_cycle text, p_included_seats integer DEFAULT NULL::integer, p_owner_email text DEFAULT NULL::text, p_invitation_token_hash text DEFAULT NULL::text, p_token_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_onboarding_request_id uuid DEFAULT NULL::uuid, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_commercial_override_code text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
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
    v_initial_sub_status := 'trial';
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
$function$

;

COMMIT;
