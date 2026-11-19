-- 20260062_payments_operations.sql — operating the payment system safely (additive; no existing row changes).
--   1. Payment alerts: one open alert per condition, emailed when it opens and daily while open, resolved automatically.
--   2. GST configuration: validated (GSTIN state prefix = state code, valid state codes, SAC format) and changed only by
--      the Platform Owner, audited. Nothing is assumed: empty values stay empty and the tax split stays blank.
--   3. Invoices snapshot the supplier's GSTIN, legal name and SAC code at issue, so a later settings change never
--      alters an issued invoice.

-- ── 1. Alerts ───────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind             TEXT NOT NULL CHECK (kind IN ('gateway_unhealthy', 'webhook_failures', 'invalid_signatures', 'stuck_checkouts',
                     'unapplied_money', 'dispute_deadline', 'refund_failed', 'refund_stuck', 'reconciliation_exceptions', 'gst_unconfigured')),
  scope            TEXT NOT NULL DEFAULT '',   -- e.g. 'razorpay:live'
  detail           TEXT NOT NULL,
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_notified_at TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_alerts_open ON public.payment_alerts (kind, scope) WHERE resolved_at IS NULL;

-- Opens or refreshes an alert; returns true when staff should be notified now (new, or a daily reminder while open).
CREATE OR REPLACE FUNCTION public.payment_alert_raise(p_kind TEXT, p_scope TEXT, p_detail TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE a RECORD;
BEGIN
  SELECT * INTO a FROM public.payment_alerts WHERE kind = p_kind AND scope = coalesce(p_scope, '') AND resolved_at IS NULL FOR UPDATE;
  IF a.id IS NULL THEN
    INSERT INTO public.payment_alerts (kind, scope, detail, last_notified_at) VALUES (p_kind, coalesce(p_scope, ''), left(p_detail, 500), now());
    RETURN true;
  END IF;
  IF a.last_notified_at IS NULL OR a.last_notified_at < now() - INTERVAL '24 hours' THEN
    UPDATE public.payment_alerts SET detail = left(p_detail, 500), last_seen_at = now(), last_notified_at = now() WHERE id = a.id;
    RETURN true;
  END IF;
  UPDATE public.payment_alerts SET detail = left(p_detail, 500), last_seen_at = now() WHERE id = a.id;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_alert_resolve(p_kind TEXT, p_scope TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$ UPDATE public.payment_alerts SET resolved_at = now() WHERE kind = p_kind AND scope = coalesce(p_scope, '') AND resolved_at IS NULL $$;

-- ── 2. GST validation ───────────────────────────────────────────────────────────────────────────
-- Valid GST state codes: 01–38 and 97 (Other Territory).
CREATE OR REPLACE FUNCTION public.gst_state_code_valid(p_code TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = pg_catalog, pg_temp
AS $$ SELECT p_code IS NULL OR (p_code ~ '^[0-9]{2}$' AND ((p_code::int BETWEEN 1 AND 38) OR p_code = '97')) $$;

CREATE OR REPLACE FUNCTION public.gst_validate_party()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_gstin TEXT; v_state TEXT; v_sac TEXT; v_row JSONB := to_jsonb(NEW);
BEGIN
  -- Read fields through JSON: the two tables have different columns, and PL/pgSQL resolves NEW.<column> per table.
  IF TG_TABLE_NAME = 'billing_settings' THEN
    v_gstin := v_row ->> 'supplier_gstin'; v_state := v_row ->> 'supplier_state_code'; v_sac := v_row ->> 'sac_code';
  ELSE v_gstin := v_row ->> 'gstin'; v_state := v_row ->> 'state_code'; END IF;
  IF NOT public.gst_state_code_valid(v_state) THEN
    RAISE EXCEPTION 'billing: % is not a valid GST state code', v_state USING ERRCODE = 'check_violation';
  END IF;
  IF v_gstin IS NOT NULL AND v_state IS NOT NULL AND left(v_gstin, 2) <> v_state THEN
    RAISE EXCEPTION 'billing: the GSTIN belongs to state %, not %', left(v_gstin, 2), v_state USING ERRCODE = 'check_violation';
  END IF;
  IF v_sac IS NOT NULL AND v_sac !~ '^99[0-9]{4}$' THEN
    RAISE EXCEPTION 'billing: a SAC code for services has 6 digits starting with 99' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_billing_settings_gst ON public.billing_settings;
CREATE TRIGGER trg_billing_settings_gst BEFORE INSERT OR UPDATE ON public.billing_settings FOR EACH ROW EXECUTE FUNCTION public.gst_validate_party();
DROP TRIGGER IF EXISTS trg_billing_profiles_gst ON public.org_billing_profiles;
CREATE TRIGGER trg_billing_profiles_gst BEFORE INSERT OR UPDATE ON public.org_billing_profiles FOR EACH ROW EXECUTE FUNCTION public.gst_validate_party();

-- Supplier GST particulars: Platform Owner only, audited; applies to invoices issued afterwards.
CREATE OR REPLACE FUNCTION public.billing_settings_update_gst(p_actor UUID, p_legal_name TEXT, p_gstin TEXT, p_state TEXT, p_sac TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_role public.platform_role; old RECORD;
BEGIN
  v_role := public.payments_staff_role(p_actor, ARRAY['super_admin']::public.platform_role[]);
  SELECT supplier_legal_name, supplier_gstin, supplier_state_code, sac_code INTO old FROM public.billing_settings WHERE id FOR UPDATE;
  UPDATE public.billing_settings SET
    supplier_legal_name = nullif(btrim(p_legal_name), ''), supplier_gstin = nullif(upper(btrim(p_gstin)), ''),
    supplier_state_code = nullif(btrim(p_state), ''), sac_code = nullif(btrim(p_sac), ''), updated_by = p_actor, updated_at = now()
  WHERE id;
  PERFORM public.payments_audit(p_actor, v_role, 'payments.gst_settings_changed', 'billing_settings', p_actor,
    jsonb_build_object('from', to_jsonb(old), 'to', jsonb_build_object('supplier_legal_name', p_legal_name, 'supplier_gstin', p_gstin, 'supplier_state_code', p_state, 'sac_code', p_sac)));
  RETURN jsonb_build_object('status', 'updated');
END;
$$;

-- ── 3. Invoice snapshot of the supplier's particulars ───────────────────────────────────────────
ALTER TABLE public.org_subscription_invoices
  ADD COLUMN IF NOT EXISTS supplier_gstin       TEXT,
  ADD COLUMN IF NOT EXISTS supplier_legal_name  TEXT,
  ADD COLUMN IF NOT EXISTS sac_code             TEXT,
  ADD COLUMN IF NOT EXISTS customer_legal_name  TEXT;

CREATE OR REPLACE FUNCTION public.billing_invoice_tax_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE s RECORD; p RECORD;
BEGIN
  SELECT supplier_state_code, supplier_gstin, supplier_legal_name, sac_code, gst_rate_bps INTO s FROM public.billing_settings WHERE id;
  SELECT gstin, state_code, legal_name INTO p FROM public.org_billing_profiles WHERE org_id = NEW.org_id;
  NEW.gst_rate_bps := s.gst_rate_bps;
  NEW.supplier_state_code := s.supplier_state_code;
  NEW.supplier_gstin := s.supplier_gstin;
  NEW.supplier_legal_name := s.supplier_legal_name;
  NEW.sac_code := s.sac_code;
  NEW.place_of_supply := p.state_code;
  NEW.customer_gstin := p.gstin;
  NEW.customer_legal_name := p.legal_name;
  IF s.supplier_state_code IS NOT NULL AND p.state_code IS NOT NULL AND coalesce(NEW.tax_cents, 0) > 0 THEN
    IF s.supplier_state_code = p.state_code THEN
      NEW.cgst_cents := NEW.tax_cents / 2; NEW.sgst_cents := NEW.tax_cents - NEW.tax_cents / 2; NEW.igst_cents := 0;
    ELSE
      NEW.igst_cents := NEW.tax_cents; NEW.cgst_cents := 0; NEW.sgst_cents := 0;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ── Security ────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.payment_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payment_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_alerts TO service_role;
DO $$
DECLARE f TEXT;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.payment_alert_raise(text, text, text)', 'public.payment_alert_resolve(text, text)',
    'public.billing_settings_update_gst(uuid, text, text, text, text)', 'public.gst_validate_party()', 'public.billing_invoice_tax_snapshot()']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;
