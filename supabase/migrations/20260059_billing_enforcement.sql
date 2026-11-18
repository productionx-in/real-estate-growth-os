-- 20260059_billing_enforcement.sql
-- Makes the commercial rules real (docs/product/COMMERCIAL_RULES.md, DEC-022):
--   1. Trial plans: 14 days, 3 users, 100 leads, 2 projects, 50 inventory units, one trial per person per
--      organisation type (trial_grants).
--   2. Plan limits enforced in the database for projects, inventory units and leads. Leads captured from a
--      source (webhooks, forms, portals, the customer API) are always saved, even over the limit: no buyer
--      enquiry is lost. Manual entry and CSV import stop at the limit.
--   3. A scheduled job ends trials and unpaid periods: an active plan past its end date is "payment overdue"
--      for 7 days with full access; then (and immediately for an ended trial) the subscription expires and
--      the workspace becomes read-only through the existing organisation suspension (20260044), marked as a
--      billing hold. Data is never deleted.
--   4. Paying for a plan lifts a billing hold automatically (a suspension by REGrow staff is never lifted by a
--      payment).
--   5. Every existing workspace without a subscription gets a 30-day transition period on its type's plan.
BEGIN;

-- ── 1. Catalogue: lead limit and trial plans ────────────────────────────────────────────────────
ALTER TABLE public.subscription_plan_versions
  ADD COLUMN IF NOT EXISTS max_leads INTEGER CHECK (max_leads IS NULL OR max_leads >= 0),
  ADD COLUMN IF NOT EXISTS trial_days INTEGER CHECK (trial_days IS NULL OR trial_days BETWEEN 1 AND 90);

INSERT INTO public.subscription_plans (code, tier, name, target_org_type, description, is_active)
VALUES
  ('trial_developer', 'free', 'Free trial — developer', 'developer', '14-day free trial for developers', true),
  ('trial_agency', 'free', 'Free trial — agency', 'channel_partner', '14-day free trial for channel-partner agencies', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.subscription_plan_versions
  (plan_id, version_number, is_current, included_seats, max_projects, max_inventory_units, max_leads, trial_days, currency,
   base_price_monthly_cents, base_price_annual_cents, additional_seat_price_cents, features)
SELECT p.id, 1, true, 3, 2, 50, 100, 14, 'INR', 0, 0, 0, '{}'::jsonb
FROM public.subscription_plans p
WHERE p.code IN ('trial_developer', 'trial_agency')
  AND NOT EXISTS (SELECT 1 FROM public.subscription_plan_versions x WHERE x.plan_id = p.id);

-- ── 2. Trial eligibility: one trial per person per organisation type ────────────────────────────
-- A person who runs both an agency and a developer business gets one trial for each; creating another
-- workspace of the same type does not start another trial.
CREATE TABLE IF NOT EXISTS public.trial_grants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID NOT NULL,
  org_type      public.org_type NOT NULL,
  org_id        UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (auth_user_id, org_type)
);
ALTER TABLE public.trial_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.trial_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.trial_grants TO service_role;

-- ── 3. Billing hold marker on the organisation ──────────────────────────────────────────────────
ALTER TABLE public.organisations
  ADD COLUMN IF NOT EXISTS billing_hold BOOLEAN NOT NULL DEFAULT false;

-- ── 4. Plan limits ──────────────────────────────────────────────────────────────────────────────
-- The limit that applies to an organisation now, from its subscription's plan version (NULL = no limit).
CREATE OR REPLACE FUNCTION public.plan_limit(p_org UUID, p_kind TEXT)
RETURNS INTEGER LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  SELECT CASE p_kind WHEN 'projects' THEN v.max_projects WHEN 'inventory' THEN v.max_inventory_units WHEN 'leads' THEN v.max_leads END
  FROM public.org_subscriptions s
  JOIN public.subscription_plan_versions v ON v.id = s.plan_version_id
  WHERE s.org_id = p_org
$$;
REVOKE ALL ON FUNCTION public.plan_limit(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.plan_limit(UUID, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.enforce_plan_limit()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_kind TEXT := TG_ARGV[0]; v_limit INTEGER; v_count INTEGER; v_label TEXT;
BEGIN
  v_limit := public.plan_limit(NEW.org_id, v_kind);
  IF v_limit IS NULL THEN RETURN NEW; END IF;
  -- Captured enquiries are always kept: a lead with a receipt time, written by the server (not by a
  -- signed-in browser), is a buyer enquiry from a connected source.
  IF v_kind = 'leads' THEN
    IF to_jsonb(NEW) ->> 'received_at' IS NOT NULL AND coalesce(auth.role(), '') NOT IN ('authenticated', 'anon') THEN
      RETURN NEW;
    END IF;
  END IF;
  -- Serialise inserts of this kind for this organisation, so simultaneous requests cannot pass the limit.
  PERFORM pg_advisory_xact_lock(hashtextextended('plan_limit:' || v_kind || ':' || NEW.org_id::text, 0));
  EXECUTE format('SELECT count(*) FROM public.%I WHERE org_id = $1', TG_TABLE_NAME) INTO v_count USING NEW.org_id;
  IF v_count >= v_limit THEN
    v_label := CASE v_kind WHEN 'projects' THEN 'projects' WHEN 'inventory' THEN 'inventory units' ELSE 'leads' END;
    RAISE EXCEPTION 'plan limit: your plan includes % %. Choose a plan on the Plan & billing page to add more.', v_limit, v_label
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.enforce_plan_limit() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_plan_limit ON public.projects;
CREATE TRIGGER trg_projects_plan_limit BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('projects');
DROP TRIGGER IF EXISTS trg_inventory_plan_limit ON public.inventory_items;
CREATE TRIGGER trg_inventory_plan_limit BEFORE INSERT ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('inventory');
DROP TRIGGER IF EXISTS trg_leads_plan_limit ON public.leads;
CREATE TRIGGER trg_leads_plan_limit BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.enforce_plan_limit('leads');

-- ── 5. Starting a trial (replaces 20260056): trial plan limits, once per person per type ────────
CREATE OR REPLACE FUNCTION public.billing_start_trial(p_org UUID, p_plan_code TEXT, p_actor_profile UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_target RECORD; v_trial RECORD; v_type public.org_type; v_user UUID; v_id UUID;
BEGIN
  -- The plan the customer intends to buy must exist for this workspace's type.
  SELECT * INTO v_target FROM public.billing_plan_for(p_org, p_plan_code);
  IF v_target.version_id IS NULL THEN RAISE EXCEPTION 'billing: no such plan for this workspace' USING ERRCODE = 'check_violation'; END IF;
  SELECT type INTO v_type FROM public.organisations WHERE id = p_org FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.org_subscriptions WHERE org_id = p_org) THEN
    RAISE EXCEPTION 'billing: this workspace already has a subscription' USING ERRCODE = 'unique_violation';
  END IF;
  SELECT auth_user_id INTO v_user FROM public.profiles WHERE id = p_actor_profile;
  IF v_user IS NULL THEN RAISE EXCEPTION 'billing: unknown member' USING ERRCODE = 'check_violation'; END IF;
  IF EXISTS (SELECT 1 FROM public.trial_grants WHERE auth_user_id = v_user AND org_type = v_type) THEN
    RAISE EXCEPTION 'billing: you have already used the free trial for this type of workspace; choose a plan instead'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT v.id, v.included_seats, coalesce(v.trial_days, 14) AS days INTO v_trial
    FROM public.subscription_plans p JOIN public.subscription_plan_versions v ON v.plan_id = p.id AND v.is_current
   WHERE p.code = CASE v_type WHEN 'developer' THEN 'trial_developer' ELSE 'trial_agency' END AND p.is_active;
  IF v_trial.id IS NULL THEN RAISE EXCEPTION 'billing: trials are not available' USING ERRCODE = 'check_violation'; END IF;

  INSERT INTO public.trial_grants (auth_user_id, org_type, org_id) VALUES (v_user, v_type, p_org);
  INSERT INTO public.org_subscriptions (org_id, plan_tier, plan_version_id, included_seats, additional_seats, status, billing_cycle,
    current_period_start, current_period_end, contracted_base_price_cents, contracted_additional_seat_price_cents, contracted_currency)
  VALUES (p_org, 'free', v_trial.id, v_trial.included_seats, 0, 'trial', 'monthly',
    now(), now() + make_interval(days => v_trial.days), 0, 0, 'INR')
  RETURNING id INTO v_id;
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_profile_id, action, target_type, target_id, metadata)
  VALUES (p_org, 'member', p_actor_profile, 'billing.trial_started', 'org_subscriptions', v_id::text,
    jsonb_build_object('plan', p_plan_code, 'days', v_trial.days, 'seats', v_trial.included_seats));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.billing_start_trial(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.billing_start_trial(UUID, TEXT, UUID) TO service_role;

-- ── 6. Ending trials and unpaid periods ─────────────────────────────────────────────────────────
-- Read-only through the existing suspension; marked billing_hold so a payment can lift it. A workspace that
-- REGrow staff already suspended or deactivated is left as it is.
CREATE OR REPLACE FUNCTION public.billing_hold_org(p_org UUID, p_reason TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_state TEXT;
BEGIN
  SELECT lifecycle_state INTO v_state FROM public.organisations WHERE id = p_org FOR UPDATE;
  UPDATE public.org_subscriptions SET is_read_only = true, read_only_reason = p_reason, updated_at = now() WHERE org_id = p_org;
  IF v_state IN ('active', 'grace') THEN
    PERFORM public.set_organisation_lifecycle(p_org, 'suspended', 'billing: ' || p_reason, NULL, 'system', 'REGrow billing');
    UPDATE public.organisations SET billing_hold = true WHERE id = p_org;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_enforce_periods(p_now TIMESTAMPTZ DEFAULT now())
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r RECORD; v_overdue INT := 0; v_expired INT := 0;
BEGIN
  -- Paid period ended: 7 days of "payment overdue" with full access.
  FOR r IN SELECT id, org_id FROM public.org_subscriptions
            WHERE status = 'active' AND current_period_end < p_now FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.org_subscriptions SET status = 'past_due', grace_period_ends_at = p_now + INTERVAL '7 days', updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_label, action, target_type, target_id, metadata)
    VALUES (r.org_id, 'system', 'REGrow billing', 'billing.payment_overdue', 'org_subscriptions', r.id::text,
      jsonb_build_object('grace_days', 7));
    v_overdue := v_overdue + 1;
  END LOOP;

  -- Trial / awaiting payment / cancelled past the end date, or overdue past the grace period: expired, read-only.
  FOR r IN SELECT id, org_id, status FROM public.org_subscriptions
            WHERE (status IN ('trial', 'pending_payment', 'canceled') AND current_period_end < p_now)
               OR (status = 'past_due' AND coalesce(grace_period_ends_at, current_period_end + INTERVAL '7 days') < p_now)
            FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.org_subscriptions SET status = 'expired', updated_at = now() WHERE id = r.id;
    PERFORM public.billing_hold_org(r.org_id, CASE r.status WHEN 'trial' THEN 'trial_ended' ELSE 'subscription_expired' END);
    INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_label, action, target_type, target_id, metadata)
    VALUES (r.org_id, 'system', 'REGrow billing', 'billing.subscription_expired', 'org_subscriptions', r.id::text,
      jsonb_build_object('from', r.status));
    v_expired := v_expired + 1;
  END LOOP;
  RETURN jsonb_build_object('overdue', v_overdue, 'expired', v_expired);
END;
$$;

-- ── 7. Payment lifts a billing hold ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.billing_release_hold()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_org RECORD;
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    UPDATE public.org_subscriptions SET is_read_only = false, read_only_reason = NULL, grace_period_ends_at = NULL WHERE id = NEW.id;
    SELECT lifecycle_state, billing_hold INTO v_org FROM public.organisations WHERE id = NEW.org_id FOR UPDATE;
    IF v_org.billing_hold THEN
      IF v_org.lifecycle_state = 'suspended' THEN
        PERFORM public.set_organisation_lifecycle(NEW.org_id, 'active', 'billing: payment received', NULL, 'system', 'REGrow billing');
      END IF;
      UPDATE public.organisations SET billing_hold = false WHERE id = NEW.org_id;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS trg_org_subscriptions_release_hold ON public.org_subscriptions;
CREATE TRIGGER trg_org_subscriptions_release_hold AFTER UPDATE OF status ON public.org_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.billing_release_hold();

-- A suspension or deactivation by REGrow staff is never lifted by a payment.
CREATE OR REPLACE FUNCTION public.billing_hold_cleared_by_staff()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.billing_hold AND NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state
     AND coalesce(NEW.lifecycle_reason, '') NOT LIKE 'billing: %' THEN
    NEW.billing_hold := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_organisations_billing_hold ON public.organisations;
CREATE TRIGGER trg_organisations_billing_hold BEFORE UPDATE OF lifecycle_state ON public.organisations
  FOR EACH ROW EXECUTE FUNCTION public.billing_hold_cleared_by_staff();

DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.billing_hold_org(uuid, text)', 'public.billing_enforce_periods(timestamptz)',
                           'public.billing_release_hold()', 'public.billing_hold_cleared_by_staff()']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.billing_enforce_periods(timestamptz) TO service_role';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.billing_hold_org(uuid, text) TO service_role';
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-billing-periods';
  PERFORM cron.schedule('regrow-billing-periods', '*/15 * * * *', 'SELECT public.billing_enforce_periods()');
END;
$$;

-- ── 8. Existing workspaces without a subscription: 30-day transition on their type's plan ───────
-- No trial limits (they already hold data), the plan's seats, read-only only if still unpaid after 30 days.
INSERT INTO public.org_subscriptions (org_id, plan_tier, plan_version_id, included_seats, additional_seats, status, billing_cycle,
  current_period_start, current_period_end, contracted_base_price_cents, contracted_additional_seat_price_cents, contracted_currency)
SELECT o.id, p.tier, v.id, greatest(v.included_seats,
         (SELECT count(*) FROM public.org_members m WHERE m.org_id = o.id AND m.status = 'active')::int),
       0, 'trial', 'monthly', now(), now() + INTERVAL '30 days', v.base_price_monthly_cents, v.additional_seat_price_cents, 'INR'
FROM public.organisations o
JOIN public.subscription_plans p ON p.code = CASE o.type WHEN 'developer' THEN 'leads' ELSE 'agencies' END
JOIN public.subscription_plan_versions v ON v.plan_id = p.id AND v.is_current
WHERE NOT EXISTS (SELECT 1 FROM public.org_subscriptions s WHERE s.org_id = o.id)
ON CONFLICT (org_id) DO NOTHING;

INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_label, action, target_type, target_id, metadata)
SELECT s.org_id, 'system', 'REGrow billing', 'billing.transition_started', 'org_subscriptions', s.id::text,
       jsonb_build_object('days', 30)
FROM public.org_subscriptions s
WHERE s.status = 'trial' AND s.created_at >= now() - INTERVAL '1 minute'
  AND s.plan_version_id IN (SELECT v.id FROM public.subscription_plan_versions v JOIN public.subscription_plans p ON p.id = v.plan_id
                            WHERE p.code IN ('leads', 'agencies'));

-- Awaiting a first payment: at least the same 30 days from today.
UPDATE public.org_subscriptions SET current_period_end = greatest(current_period_end, now() + INTERVAL '30 days'), updated_at = now()
 WHERE status = 'pending_payment';

COMMIT;
