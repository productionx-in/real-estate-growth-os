-- 20260060_payment_providers.sql — provider-independent payments (docs/design/payment-provider-migration.md).
--
-- Additive. Razorpay keeps working exactly as before and its records are preserved: invoices keep gateway and
-- gateway_order_id, payments keep payment_reference ('razorpay:pay_…'); new columns are backfilled from them.
-- Founder decisions (19 Nov 2026) enforced here:
--   * only the Platform Owner (platform role super_admin) changes the primary gateway or a gateway's status;
--   * every refund needs approval by an authorised person other than the requester; above the configured
--     threshold (₹10,000) two independent approvers;
--   * no automatic failover (a primary is changed only by a person);
--   * a verified provider outage gives affected customers the configured extra days (3) to pay;
--   * recurring payments (mandates) stay disabled until switched on in billing_settings;
--   * contracts and agreed prices are never touched by anything here.
-- Every table: RLS on, no client policies, no anon/authenticated grants — server (service role) only.

-- ── 0. Settings (one row) ───────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id                                   BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
  refund_second_approval_above_cents   BIGINT  NOT NULL DEFAULT 1000000 CHECK (refund_second_approval_above_cents >= 0), -- ₹10,000
  outage_grace_days                    INTEGER NOT NULL DEFAULT 3 CHECK (outage_grace_days BETWEEN 0 AND 30),
  recurring_payments_enabled           BOOLEAN NOT NULL DEFAULT false,
  mandate_pre_debit_notice_hours       INTEGER NOT NULL DEFAULT 24 CHECK (mandate_pre_debit_notice_hours >= 24),
  gst_rate_bps                         INTEGER NOT NULL DEFAULT 1800 CHECK (gst_rate_bps BETWEEN 0 AND 5000),
  sac_code                             TEXT,      -- confirm with the accountant before invoices show it
  supplier_legal_name                  TEXT,
  supplier_gstin                       TEXT CHECK (supplier_gstin IS NULL OR supplier_gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  supplier_state_code                  TEXT CHECK (supplier_state_code IS NULL OR supplier_state_code ~ '^[0-9]{2}$'),
  updated_by                           UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at                           TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.billing_settings (id) VALUES (true) ON CONFLICT DO NOTHING;

-- GST rate now comes from settings (same 18% default, so every existing amount is unchanged).
CREATE OR REPLACE FUNCTION public.billing_gst_cents(p_subtotal BIGINT)
RETURNS BIGINT LANGUAGE sql STABLE SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT round(p_subtotal * coalesce((SELECT gst_rate_bps FROM public.billing_settings WHERE id), 1800) / 10000.0)::bigint $$;

-- ── 1. Providers and gateway configuration ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_providers (
  code              TEXT PRIMARY KEY CHECK (code ~ '^[a-z]+$'),
  name              TEXT NOT NULL,
  supports_mandates BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO public.payment_providers (code, name, supports_mandates) VALUES
  ('razorpay', 'Razorpay', true), ('cashfree', 'Cashfree Payments', true)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.payment_gateway_configs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment       TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  -- disabled → sandbox_validated (test passed) → enabled (may take payments) ; draining = no new checkouts but still
  -- verifies, settles, refunds and reconciles ; suspended = stopped by the owner (webhooks still recorded).
  status            TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('disabled', 'sandbox_validated', 'enabled', 'draining', 'suspended')),
  is_primary        BOOLEAN NOT NULL DEFAULT false,
  public_key_id     TEXT,          -- publishable identifier only; secrets live in server env, never here
  last_webhook_at   TIMESTAMPTZ,
  last_health_at    TIMESTAMPTZ,
  last_health_ok    BOOLEAN,
  last_health_error TEXT,
  notes             TEXT,
  updated_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, environment),
  CHECK (NOT is_primary OR status = 'enabled')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_gateway_one_primary_per_env ON public.payment_gateway_configs (environment) WHERE is_primary;

-- Razorpay stays the primary provider (today's behaviour). Cashfree starts disabled in both environments.
INSERT INTO public.payment_gateway_configs (provider, environment, status, is_primary, notes) VALUES
  ('razorpay', 'live', 'enabled', true, 'Existing integration (migration 20260056); primary until the Platform Owner switches.'),
  ('razorpay', 'test', 'enabled', true, 'Existing integration; test keys.'),
  ('cashfree', 'test', 'disabled', false, 'Sandbox: enable after merchant sandbox credentials are configured.'),
  ('cashfree', 'live', 'disabled', false, 'Live: only after sandbox validation, merchant approval and Platform Owner approval.')
ON CONFLICT (provider, environment) DO NOTHING;

-- Invoices: any registered provider (was: 'razorpay' only). Existing rows are unchanged.
ALTER TABLE public.org_subscription_invoices DROP CONSTRAINT IF EXISTS org_subscription_invoices_gateway_check;
ALTER TABLE public.org_subscription_invoices
  ADD COLUMN IF NOT EXISTS payment_environment TEXT CHECK (payment_environment IS NULL OR payment_environment IN ('test', 'live'));
DO $$ BEGIN
  ALTER TABLE public.org_subscription_invoices ADD CONSTRAINT org_subscription_invoices_gateway_fkey FOREIGN KEY (gateway) REFERENCES public.payment_providers(code);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 2. Payment attempts (one per provider order) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_attempts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id          UUID NOT NULL REFERENCES public.org_subscription_invoices(id) ON DELETE RESTRICT,
  org_id              UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  provider            TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment         TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  provider_order_id   TEXT NOT NULL,
  checkout_session    TEXT,  -- provider checkout handle given to the browser (e.g. Cashfree payment_session_id); not a secret
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  currency            TEXT NOT NULL DEFAULT 'INR',
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending', 'captured', 'failed', 'expired', 'superseded', 'canceled')),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at          TIMESTAMPTZ,
  last_checked_at     TIMESTAMPTZ,
  check_count         INTEGER NOT NULL DEFAULT 0,
  captured_payment_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, provider_order_id)
);
-- At most one open attempt per invoice: a second checkout reuses it or supersedes it explicitly.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_attempts_one_open ON public.payment_attempts (invoice_id) WHERE status IN ('created', 'pending');
CREATE INDEX IF NOT EXISTS idx_payment_attempts_open ON public.payment_attempts (status, last_checked_at) WHERE status IN ('created', 'pending');

-- Backfill: every Razorpay order already on an invoice becomes attempt #1 (environment from the stored key prefix is
-- unknown at this point; existing orders were created with the configured keys, recorded as 'live').
INSERT INTO public.payment_attempts (invoice_id, org_id, provider, environment, provider_order_id, amount_cents, currency, status, created_by, created_at, captured_payment_id)
SELECT i.id, i.org_id, 'razorpay', coalesce(i.payment_environment, 'live'), i.gateway_order_id, i.amount_cents, i.currency,
       CASE WHEN i.status = 'paid' THEN 'captured' WHEN i.status = 'issued' THEN 'created' ELSE 'canceled' END,
       i.checkout_by, i.created_at,
       CASE WHEN i.payment_reference LIKE 'razorpay:%' THEN substr(i.payment_reference, 10) END
  FROM public.org_subscription_invoices i
 WHERE i.gateway_order_id IS NOT NULL
ON CONFLICT (provider, environment, provider_order_id) DO NOTHING;
UPDATE public.org_subscription_invoices SET payment_environment = 'live' WHERE gateway_order_id IS NOT NULL AND payment_environment IS NULL;

-- ── 3. Payments: provider, environment, lifecycle (existing rows backfilled, reference unchanged) ─
ALTER TABLE public.org_subscription_payments
  ADD COLUMN IF NOT EXISTS provider            TEXT REFERENCES public.payment_providers(code),
  ADD COLUMN IF NOT EXISTS environment         TEXT CHECK (environment IS NULL OR environment IN ('test', 'live')),
  ADD COLUMN IF NOT EXISTS provider_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS attempt_id          UUID REFERENCES public.payment_attempts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS method              TEXT,
  ADD COLUMN IF NOT EXISTS status              TEXT NOT NULL DEFAULT 'captured' CHECK (status IN ('captured', 'partially_refunded', 'refunded', 'disputed')),
  ADD COLUMN IF NOT EXISTS refunded_cents      BIGINT NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  ADD COLUMN IF NOT EXISTS fee_cents           BIGINT,
  ADD COLUMN IF NOT EXISTS tax_on_fee_cents    BIGINT,
  ADD COLUMN IF NOT EXISTS settlement_id       UUID,
  ADD COLUMN IF NOT EXISTS settled_at          TIMESTAMPTZ;
UPDATE public.org_subscription_payments
   SET provider = 'razorpay', environment = 'live', provider_payment_id = substr(payment_reference, 10)
 WHERE payment_reference LIKE 'razorpay:%' AND provider IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_provider_ref ON public.org_subscription_payments (provider, environment, provider_payment_id) WHERE provider IS NOT NULL;
ALTER TABLE public.org_subscription_payments DROP CONSTRAINT IF EXISTS org_subscription_payments_refund_bound;
ALTER TABLE public.org_subscription_payments ADD CONSTRAINT org_subscription_payments_refund_bound CHECK (refunded_cents <= amount_cents);

-- ── 4. Money received that cannot be applied (duplicate, late, mismatched) ─────────────────────
CREATE TABLE IF NOT EXISTS public.unapplied_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment         TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  provider_payment_id TEXT NOT NULL,
  provider_order_id   TEXT,
  attempt_id          UUID REFERENCES public.payment_attempts(id) ON DELETE RESTRICT,
  invoice_id          UUID REFERENCES public.org_subscription_invoices(id) ON DELETE RESTRICT,
  org_id              UUID REFERENCES public.organisations(id) ON DELETE RESTRICT,
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  currency            TEXT NOT NULL,
  reason              TEXT NOT NULL CHECK (reason IN ('invoice_already_paid', 'invoice_not_payable', 'amount_mismatch', 'currency_mismatch')),
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'refund_requested', 'refunded', 'resolved')),
  resolution_note     TEXT,
  resolved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  refunded_cents      BIGINT NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, provider_payment_id),
  CHECK (refunded_cents <= amount_cents)
);

-- ── 5. Webhook events (stored before processing; unique per provider event) ─────────────────────
CREATE TABLE IF NOT EXISTS public.payment_webhook_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider        TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment     TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  event_id        TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  payload         JSONB,                -- provider payloads carry no card data; stored for audit and re-processing
  received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at    TIMESTAMPTZ,
  outcome         TEXT CHECK (outcome IS NULL OR outcome IN ('processed', 'ignored', 'refused', 'failed')),
  detail          TEXT,
  attempts        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (provider, environment, event_id)
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_failed ON public.payment_webhook_events (outcome, received_at) WHERE outcome = 'failed';

-- ── 6. Refunds, approvals, credit notes ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_refunds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id          UUID REFERENCES public.org_subscription_payments(id) ON DELETE RESTRICT,
  unapplied_id        UUID REFERENCES public.unapplied_payments(id) ON DELETE RESTRICT,
  org_id              UUID REFERENCES public.organisations(id) ON DELETE RESTRICT,
  provider            TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment         TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  provider_payment_id TEXT NOT NULL,
  amount_cents        BIGINT NOT NULL CHECK (amount_cents > 0),
  currency            TEXT NOT NULL,
  reason              TEXT NOT NULL CHECK (length(btrim(reason)) BETWEEN 5 AND 500),
  approvals_required  INTEGER NOT NULL CHECK (approvals_required IN (1, 2)),
  status              TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'approved', 'submitted', 'processed', 'failed', 'rejected')),
  idempotency_key     UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  provider_refund_id  TEXT,
  failure_reason      TEXT,
  requested_by        UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  credit_note_id      UUID,
  CHECK ((payment_id IS NULL) <> (unapplied_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refunds_provider_ref ON public.payment_refunds (provider, environment, provider_refund_id) WHERE provider_refund_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.payment_refund_approvals (
  refund_id   UUID NOT NULL REFERENCES public.payment_refunds(id) ON DELETE RESTRICT,
  approver    UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approver_role public.platform_role NOT NULL,
  decision    TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  note        TEXT,
  decided_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (refund_id, approver)
);

CREATE TABLE IF NOT EXISTS public.billing_document_series (
  series     TEXT NOT NULL,             -- 'CN' (credit notes); invoices keep their existing numbering
  fiscal_year TEXT NOT NULL,            -- e.g. '2026-27'
  last_number INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (series, fiscal_year)
);

CREATE TABLE IF NOT EXISTS public.credit_notes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number        TEXT NOT NULL UNIQUE,
  org_id        UUID REFERENCES public.organisations(id) ON DELETE RESTRICT,
  invoice_id    UUID REFERENCES public.org_subscription_invoices(id) ON DELETE RESTRICT,
  refund_id     UUID NOT NULL UNIQUE REFERENCES public.payment_refunds(id) ON DELETE RESTRICT,
  subtotal_cents BIGINT NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents     BIGINT NOT NULL CHECK (tax_cents >= 0),
  total_cents   BIGINT NOT NULL CHECK (total_cents > 0),
  currency      TEXT NOT NULL,
  reason        TEXT NOT NULL,
  issued_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 7. Disputes ─────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_disputes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider            TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment         TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  provider_dispute_id TEXT NOT NULL,
  provider_payment_id TEXT NOT NULL,
  payment_id          UUID REFERENCES public.org_subscription_payments(id) ON DELETE RESTRICT,
  org_id              UUID REFERENCES public.organisations(id) ON DELETE RESTRICT,
  amount_cents        BIGINT NOT NULL CHECK (amount_cents >= 0),
  reason              TEXT,
  status              TEXT NOT NULL CHECK (status IN ('open', 'under_review', 'won', 'lost', 'closed')),
  respond_by          TIMESTAMPTZ,
  evidence_note       TEXT,
  handled_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, provider_dispute_id)
);

-- ── 8. Settlements and reconciliation ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_settlements (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider               TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment            TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  provider_settlement_id TEXT NOT NULL,
  utr                    TEXT,
  amount_cents           BIGINT NOT NULL,
  fees_cents             BIGINT NOT NULL DEFAULT 0,
  tax_on_fees_cents      BIGINT NOT NULL DEFAULT 0,
  settled_at             TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, provider_settlement_id)
);
DO $$ BEGIN
  ALTER TABLE public.org_subscription_payments ADD CONSTRAINT org_subscription_payments_settlement_fkey FOREIGN KEY (settlement_id) REFERENCES public.payment_settlements(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment  TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  period_from  TIMESTAMPTZ NOT NULL,
  period_to    TIMESTAMPTZ NOT NULL,
  status       TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  matched      INTEGER NOT NULL DEFAULT 0,
  exceptions   INTEGER NOT NULL DEFAULT 0,
  error        TEXT,
  started_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- null = scheduled job
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.payment_reconciliation_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID NOT NULL REFERENCES public.payment_reconciliation_runs(id) ON DELETE RESTRICT,
  kind                TEXT NOT NULL CHECK (kind IN ('matched', 'missing_in_regrow', 'missing_at_provider', 'amount_mismatch', 'unsettled_overdue')),
  provider_payment_id TEXT,
  payment_id          UUID REFERENCES public.org_subscription_payments(id) ON DELETE RESTRICT,
  settlement_id       UUID REFERENCES public.payment_settlements(id) ON DELETE RESTRICT,
  expected_cents      BIGINT,
  actual_cents        BIGINT,
  status              TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution_note     TEXT,
  resolved_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_recon_items_open ON public.payment_reconciliation_items (status, kind) WHERE status = 'open' AND kind <> 'matched';

-- ── 9. Health checks and verified outages ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_gateway_health_checks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider    TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  ok          BOOLEAN NOT NULL,
  latency_ms  INTEGER,
  error       TEXT,
  checked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_health_checks_recent ON public.payment_gateway_health_checks (provider, environment, checked_at DESC);

CREATE TABLE IF NOT EXISTS public.payment_provider_outages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider     TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment  TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  started_at   TIMESTAMPTZ NOT NULL,
  ended_at     TIMESTAMPTZ NOT NULL,
  evidence     TEXT NOT NULL CHECK (length(btrim(evidence)) >= 10), -- provider status page / incident reference
  verified_by  UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  verified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  grace_days   INTEGER NOT NULL,
  affected     INTEGER NOT NULL DEFAULT 0,
  CHECK (ended_at > started_at)
);

ALTER TABLE public.org_subscriptions ADD COLUMN IF NOT EXISTS outage_grace_until TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.payment_outage_extensions (
  outage_id       UUID NOT NULL REFERENCES public.payment_provider_outages(id) ON DELETE RESTRICT,
  subscription_id UUID NOT NULL REFERENCES public.org_subscriptions(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL,
  previous_deadline TIMESTAMPTZ,
  new_deadline    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (outage_id, subscription_id)
);

-- ── 10. Mandates (recurring payments; disabled until billing_settings.recurring_payments_enabled) ──
CREATE TABLE IF NOT EXISTS public.payment_mandates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organisations(id) ON DELETE RESTRICT,
  subscription_id     UUID NOT NULL REFERENCES public.org_subscriptions(id) ON DELETE RESTRICT,
  provider            TEXT NOT NULL REFERENCES public.payment_providers(code),
  environment         TEXT NOT NULL CHECK (environment IN ('test', 'live')),
  provider_mandate_id TEXT,
  method              TEXT NOT NULL CHECK (method IN ('upi_autopay', 'enach', 'card')),
  max_amount_cents    BIGINT NOT NULL CHECK (max_amount_cents > 0),
  frequency           TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('monthly', 'quarterly', 'annual', 'as_presented')),
  status              TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'pending_authorisation', 'active', 'paused', 'cancelled', 'failed', 'expired')),
  authorisation_url   TEXT,
  authorised_at       TIMESTAMPTZ,
  cancelled_at        TIMESTAMPTZ,
  cancelled_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  cancel_reason       TEXT,
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_mandates_provider_ref ON public.payment_mandates (provider, environment, provider_mandate_id) WHERE provider_mandate_id IS NOT NULL;
-- One live mandate per subscription.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mandates_one_live ON public.payment_mandates (subscription_id) WHERE status IN ('created', 'pending_authorisation', 'active', 'paused');

CREATE TABLE IF NOT EXISTS public.payment_mandate_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id  UUID NOT NULL REFERENCES public.payment_mandates(id) ON DELETE RESTRICT,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  source      TEXT NOT NULL CHECK (source IN ('customer', 'staff', 'provider', 'system')),
  actor       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payment_mandate_charges (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mandate_id            UUID NOT NULL REFERENCES public.payment_mandates(id) ON DELETE RESTRICT,
  invoice_id            UUID NOT NULL REFERENCES public.org_subscription_invoices(id) ON DELETE RESTRICT,
  amount_cents          BIGINT NOT NULL CHECK (amount_cents > 0),
  status                TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'notified', 'submitted', 'succeeded', 'failed', 'canceled')),
  pre_debit_notified_at TIMESTAMPTZ,
  charge_after          TIMESTAMPTZ,
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  next_retry_at         TIMESTAMPTZ,
  provider_charge_id    TEXT,
  failure_reason        TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mandate_id, invoice_id)
);

-- ── 11. Customer GST profile and the tax split on invoices ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.org_billing_profiles (
  org_id          UUID PRIMARY KEY REFERENCES public.organisations(id) ON DELETE CASCADE,
  legal_name      TEXT NOT NULL CHECK (length(btrim(legal_name)) BETWEEN 2 AND 200),
  gstin           TEXT CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
  billing_address TEXT,
  state_code      TEXT CHECK (state_code IS NULL OR state_code ~ '^[0-9]{2}$'),
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_subscription_invoices
  ADD COLUMN IF NOT EXISTS supplier_state_code TEXT,
  ADD COLUMN IF NOT EXISTS place_of_supply     TEXT,
  ADD COLUMN IF NOT EXISTS cgst_cents          BIGINT,
  ADD COLUMN IF NOT EXISTS sgst_cents          BIGINT,
  ADD COLUMN IF NOT EXISTS igst_cents          BIGINT,
  ADD COLUMN IF NOT EXISTS customer_gstin      TEXT,
  ADD COLUMN IF NOT EXISTS gst_rate_bps        INTEGER;

-- Snapshot the tax split when an invoice is created. If the supplier's or the customer's state is not configured,
-- the split stays empty (never guessed); the total tax is unaffected.
CREATE OR REPLACE FUNCTION public.billing_invoice_tax_snapshot()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE s RECORD; p RECORD;
BEGIN
  SELECT supplier_state_code, gst_rate_bps INTO s FROM public.billing_settings WHERE id;
  SELECT gstin, state_code INTO p FROM public.org_billing_profiles WHERE org_id = NEW.org_id;
  NEW.gst_rate_bps := s.gst_rate_bps;
  NEW.supplier_state_code := s.supplier_state_code;
  NEW.place_of_supply := p.state_code;
  NEW.customer_gstin := p.gstin;
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
DROP TRIGGER IF EXISTS trg_invoice_tax_snapshot ON public.org_subscription_invoices;
CREATE TRIGGER trg_invoice_tax_snapshot BEFORE INSERT ON public.org_subscription_invoices
  FOR EACH ROW EXECUTE FUNCTION public.billing_invoice_tax_snapshot();

-- ── 12. Helpers ─────────────────────────────────────────────────────────────────────────────────
-- The platform role of an active staff member, or an error if they are not one of the allowed roles.
CREATE OR REPLACE FUNCTION public.payments_staff_role(p_actor UUID, p_allowed public.platform_role[])
RETURNS public.platform_role LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v public.platform_role;
BEGIN
  SELECT role INTO v FROM public.platform_users WHERE user_id = p_actor AND is_active;
  IF v IS NULL OR NOT (v = ANY (p_allowed)) THEN
    RAISE EXCEPTION 'payments: not permitted for this staff role' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.payments_audit(p_actor UUID, p_role public.platform_role, p_action TEXT, p_type TEXT, p_id UUID, p_meta JSONB)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  INSERT INTO public.platform_audit_logs (actor_user_id, actor_role, action, target_entity_type, target_entity_id, metadata)
  VALUES (p_actor, p_role, p_action, p_type, p_id, coalesce(p_meta, '{}'::jsonb));
$$;

-- ── 13. Gateway administration (Platform Owner only) ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payment_gateway_set_status(p_actor UUID, p_provider TEXT, p_env TEXT, p_status TEXT, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_role public.platform_role; c RECORD; t RECORD;
BEGIN
  v_role := public.payments_staff_role(p_actor, ARRAY['super_admin']::public.platform_role[]);
  IF coalesce(btrim(p_note), '') = '' THEN RAISE EXCEPTION 'payments: a reason is required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO c FROM public.payment_gateway_configs WHERE provider = p_provider AND environment = p_env FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'payments: unknown gateway' USING ERRCODE = 'no_data_found'; END IF;
  IF c.is_primary AND p_status <> 'enabled' THEN
    RAISE EXCEPTION 'payments: switch the primary gateway to another provider first' USING ERRCODE = 'check_violation';
  END IF;
  -- A live gateway can be enabled only after its sandbox has been validated.
  IF p_env = 'live' AND p_status = 'enabled' AND c.status NOT IN ('enabled', 'draining', 'suspended') THEN
    SELECT status INTO t FROM public.payment_gateway_configs WHERE provider = p_provider AND environment = 'test';
    IF t.status NOT IN ('sandbox_validated', 'enabled') THEN
      RAISE EXCEPTION 'payments: validate the sandbox before enabling live payments' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  UPDATE public.payment_gateway_configs SET status = p_status, updated_by = p_actor, updated_at = now(), notes = p_note WHERE id = c.id;
  PERFORM public.payments_audit(p_actor, v_role, 'payments.gateway_status_changed', 'payment_gateway_configs', c.id,
    jsonb_build_object('provider', p_provider, 'environment', p_env, 'from', c.status, 'to', p_status, 'note', p_note));
  RETURN jsonb_build_object('provider', p_provider, 'environment', p_env, 'status', p_status);
END;
$$;

-- Switch the primary provider for new checkouts. Never automatic. The old primary is put into 'draining': it stops
-- taking new checkouts but keeps verifying, settling, refunding and reconciling its own payments.
CREATE OR REPLACE FUNCTION public.payment_gateway_set_primary(p_actor UUID, p_provider TEXT, p_env TEXT, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_role public.platform_role; c RECORD; old RECORD;
BEGIN
  v_role := public.payments_staff_role(p_actor, ARRAY['super_admin']::public.platform_role[]);
  IF coalesce(btrim(p_note), '') = '' THEN RAISE EXCEPTION 'payments: a reason is required' USING ERRCODE = 'check_violation'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('payment_primary_' || p_env));
  SELECT * INTO c FROM public.payment_gateway_configs WHERE provider = p_provider AND environment = p_env FOR UPDATE;
  IF c.id IS NULL THEN RAISE EXCEPTION 'payments: unknown gateway' USING ERRCODE = 'no_data_found'; END IF;
  IF c.is_primary THEN RETURN jsonb_build_object('status', 'unchanged'); END IF;
  IF c.status <> 'enabled' THEN RAISE EXCEPTION 'payments: enable the gateway before making it primary' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO old FROM public.payment_gateway_configs WHERE environment = p_env AND is_primary FOR UPDATE;
  IF old.id IS NOT NULL THEN
    UPDATE public.payment_gateway_configs SET is_primary = false, status = 'draining', updated_by = p_actor, updated_at = now() WHERE id = old.id;
  END IF;
  UPDATE public.payment_gateway_configs SET is_primary = true, updated_by = p_actor, updated_at = now() WHERE id = c.id;
  PERFORM public.payments_audit(p_actor, v_role, 'payments.primary_gateway_changed', 'payment_gateway_configs', c.id,
    jsonb_build_object('environment', p_env, 'from', old.provider, 'to', p_provider, 'note', p_note));
  RETURN jsonb_build_object('status', 'switched', 'from', old.provider, 'to', p_provider);
END;
$$;

-- ── 14. Attempts ────────────────────────────────────────────────────────────────────────────────
-- The open attempt for an invoice on a provider, or null. Used by checkout to reuse an order.
CREATE OR REPLACE FUNCTION public.payment_open_attempt(p_invoice UUID)
RETURNS SETOF public.payment_attempts LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$ SELECT * FROM public.payment_attempts WHERE invoice_id = p_invoice AND status IN ('created', 'pending') $$;

-- Record a new provider order for an unpaid invoice. Fails if another attempt is still open (the caller must first
-- check that attempt with its provider and close it with payment_attempt_close).
CREATE OR REPLACE FUNCTION public.payment_attempt_create(p_invoice UUID, p_org UUID, p_provider TEXT, p_env TEXT, p_order_id TEXT,
  p_session TEXT, p_amount BIGINT, p_currency TEXT, p_actor UUID, p_expires TIMESTAMPTZ)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE i RECORD; v UUID;
BEGIN
  SELECT * INTO i FROM public.org_subscription_invoices WHERE id = p_invoice AND org_id = p_org FOR UPDATE;
  IF i.id IS NULL THEN RAISE EXCEPTION 'billing: invoice not found' USING ERRCODE = 'no_data_found'; END IF;
  IF i.status <> 'issued' THEN RAISE EXCEPTION 'billing: invoice is %', i.status USING ERRCODE = 'check_violation'; END IF;
  IF p_amount <> i.amount_cents OR upper(p_currency) <> upper(i.currency) THEN
    RAISE EXCEPTION 'billing: order amount does not match the invoice' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.payment_attempts (invoice_id, org_id, provider, environment, provider_order_id, checkout_session, amount_cents, currency, created_by, expires_at)
  VALUES (p_invoice, p_org, p_provider, p_env, p_order_id, p_session, p_amount, upper(p_currency), p_actor, p_expires)
  RETURNING id INTO v;
  UPDATE public.org_subscription_invoices SET gateway = p_provider, payment_environment = p_env, gateway_order_id = p_order_id,
         checkout_by = coalesce(p_actor, checkout_by), updated_at = now()
   WHERE id = p_invoice;
  RETURN v;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_attempt_close(p_attempt UUID, p_status TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF p_status NOT IN ('failed', 'expired', 'superseded', 'canceled', 'pending') THEN
    RAISE EXCEPTION 'payments: invalid attempt status' USING ERRCODE = 'check_violation';
  END IF;
  -- Never move a captured attempt backwards.
  UPDATE public.payment_attempts SET status = p_status, updated_at = now(), last_checked_at = now(), check_count = check_count + 1
   WHERE id = p_attempt AND status IN ('created', 'pending');
END;
$$;

-- ── 15. Settlement (provider-independent) ───────────────────────────────────────────────────────
-- Applies a payment the server has verified with the provider. Idempotent per (provider, environment, payment).
-- Money that cannot be applied (invoice already paid or no longer payable, amount or currency differs) is recorded
-- as an unapplied payment for finance to refund — it is never dropped and never applied twice.
CREATE OR REPLACE FUNCTION public.billing_settle_payment(p_provider TEXT, p_env TEXT, p_order_id TEXT, p_payment_id TEXT,
  p_amount_cents BIGINT, p_currency TEXT, p_method TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_att RECORD; v_inv RECORD; v_sub RECORD; v_plan RECORD; v_paid RECORD; v_end TIMESTAMPTZ; v_ref TEXT; v_reason TEXT; v_found BOOLEAN := false;
BEGIN
  IF coalesce(btrim(p_order_id), '') = '' OR coalesce(btrim(p_payment_id), '') = '' THEN
    RAISE EXCEPTION 'billing: order and payment ids are required' USING ERRCODE = 'check_violation';
  END IF;
  IF p_env NOT IN ('test', 'live') THEN RAISE EXCEPTION 'billing: invalid environment' USING ERRCODE = 'check_violation'; END IF;
  v_ref := p_provider || ':' || btrim(p_payment_id);
  PERFORM pg_advisory_xact_lock(hashtext('payment_ref_' || p_env || ':' || v_ref));

  SELECT * INTO v_att FROM public.payment_attempts WHERE provider = p_provider AND environment = p_env AND provider_order_id = p_order_id FOR UPDATE;
  IF v_att.id IS NULL THEN
    -- An order created before attempts existed (legacy Razorpay checkout): adopt it from the invoice — only a
    -- Razorpay order of the same environment that no attempt records (a test payment can never reach a live order).
    IF p_provider = 'razorpay' AND NOT EXISTS (SELECT 1 FROM public.payment_attempts WHERE provider = p_provider AND provider_order_id = p_order_id) THEN
      SELECT * INTO v_inv FROM public.org_subscription_invoices
       WHERE gateway = 'razorpay' AND gateway_order_id = p_order_id AND coalesce(payment_environment, 'live') = p_env FOR UPDATE;
      v_found := FOUND;
    END IF;
    IF NOT v_found THEN RAISE EXCEPTION 'billing: unknown order' USING ERRCODE = 'no_data_found'; END IF;
    INSERT INTO public.payment_attempts (invoice_id, org_id, provider, environment, provider_order_id, amount_cents, currency, status, created_by)
    VALUES (v_inv.id, v_inv.org_id, p_provider, p_env, p_order_id, v_inv.amount_cents, v_inv.currency,
            CASE WHEN v_inv.status = 'issued' AND NOT EXISTS (SELECT 1 FROM public.payment_attempts a WHERE a.invoice_id = v_inv.id AND a.status IN ('created', 'pending')) THEN 'created' ELSE 'superseded' END,
            v_inv.checkout_by)
    RETURNING * INTO v_att;
  END IF;
  SELECT * INTO v_inv FROM public.org_subscription_invoices WHERE id = v_att.invoice_id FOR UPDATE;

  -- Same payment again (browser confirmation and webhook, or a webhook retry): nothing changes.
  SELECT * INTO v_paid FROM public.org_subscription_payments WHERE provider = p_provider AND environment = p_env AND provider_payment_id = p_payment_id;
  IF v_paid.id IS NULL THEN SELECT * INTO v_paid FROM public.org_subscription_payments WHERE payment_reference = v_ref; END IF;
  IF v_paid.id IS NOT NULL THEN
    IF v_paid.invoice_id = v_inv.id THEN
      RETURN jsonb_build_object('status', 'already_settled', 'invoice_id', v_inv.id, 'org_id', v_inv.org_id);
    END IF;
    RAISE EXCEPTION 'billing: payment already settled for another invoice' USING ERRCODE = 'unique_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.unapplied_payments WHERE provider = p_provider AND environment = p_env AND provider_payment_id = p_payment_id) THEN
    RETURN jsonb_build_object('status', 'unapplied', 'invoice_id', v_inv.id, 'org_id', v_inv.org_id, 'reason', 'already_recorded');
  END IF;

  v_reason := CASE
    WHEN v_inv.status = 'paid' THEN 'invoice_already_paid'
    WHEN v_inv.status <> 'issued' THEN 'invoice_not_payable'
    WHEN upper(p_currency) <> upper(v_inv.currency) THEN 'currency_mismatch'
    WHEN p_amount_cents <> v_inv.amount_cents THEN 'amount_mismatch'
  END;
  IF v_reason IS NOT NULL THEN
    INSERT INTO public.unapplied_payments (provider, environment, provider_payment_id, provider_order_id, attempt_id, invoice_id, org_id, amount_cents, currency, reason)
    VALUES (p_provider, p_env, p_payment_id, p_order_id, v_att.id, v_inv.id, v_inv.org_id, greatest(p_amount_cents, 1), upper(p_currency), v_reason);
    UPDATE public.payment_attempts SET status = CASE WHEN status IN ('created', 'pending') THEN 'captured' ELSE status END,
           captured_payment_id = coalesce(captured_payment_id, p_payment_id), updated_at = now() WHERE id = v_att.id;
    INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_label, action, target_type, target_id, metadata)
    VALUES (v_inv.org_id, 'system', 'REGrow billing', 'billing.payment_unapplied', 'org_subscription_invoices', v_inv.id::text,
      jsonb_build_object('invoice_number', v_inv.invoice_number, 'payment', v_ref, 'amount_cents', p_amount_cents, 'reason', v_reason));
    RETURN jsonb_build_object('status', 'unapplied', 'invoice_id', v_inv.id, 'org_id', v_inv.org_id, 'reason', v_reason);
  END IF;
  IF v_inv.checkout_by IS NULL THEN RAISE EXCEPTION 'billing: invoice has no checkout' USING ERRCODE = 'check_violation'; END IF;

  SELECT * INTO v_sub FROM public.org_subscriptions WHERE id = v_inv.subscription_id FOR UPDATE;

  INSERT INTO public.org_subscription_payments (payment_reference, invoice_id, subscription_id, org_id, amount_cents, currency, verified_by, verified_at,
                                                provider, environment, provider_payment_id, attempt_id, method)
  VALUES (v_ref, v_inv.id, v_inv.subscription_id, v_inv.org_id, p_amount_cents, upper(p_currency), v_inv.checkout_by, now(),
          p_provider, p_env, p_payment_id, v_att.id, p_method);
  UPDATE public.payment_attempts SET status = 'captured', captured_payment_id = p_payment_id, updated_at = now() WHERE id = v_att.id;
  -- Any other open attempt for this invoice can no longer be paid usefully.
  UPDATE public.payment_attempts SET status = 'superseded', updated_at = now() WHERE invoice_id = v_inv.id AND id <> v_att.id AND status IN ('created', 'pending');
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
      payment_reference = v_ref, payment_amount_cents = p_amount_cents, activated_at = coalesce(activated_at, now()),
      outage_grace_until = NULL, updated_at = now()
    WHERE id = v_sub.id;
  ELSIF v_inv.invoice_type = 'additional_seats' THEN
    UPDATE public.org_subscriptions SET additional_seats = additional_seats + v_inv.seat_quantity, updated_at = now() WHERE id = v_sub.id;
  ELSE -- renewal
    v_end := greatest(coalesce(v_sub.current_period_end, now()), now() - INTERVAL '1 second')
           + CASE WHEN v_sub.billing_cycle = 'annual' THEN INTERVAL '1 year' ELSE INTERVAL '1 month' END;
    UPDATE public.org_subscriptions SET status = 'active', current_period_end = v_end, outage_grace_until = NULL, updated_at = now() WHERE id = v_sub.id;
  END IF;

  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_user_id, actor_label, action, target_type, target_id, metadata)
  VALUES (v_inv.org_id, 'system', v_inv.checkout_by, (SELECT name FROM public.payment_providers WHERE code = p_provider), 'billing.payment_received',
    'org_subscription_invoices', v_inv.id::text,
    jsonb_build_object('invoice_number', v_inv.invoice_number, 'type', v_inv.invoice_type, 'amount_cents', p_amount_cents, 'payment', v_ref, 'environment', p_env));
  RETURN jsonb_build_object('status', 'settled', 'invoice_id', v_inv.id, 'org_id', v_inv.org_id, 'type', v_inv.invoice_type);
END;
$$;

-- The original Razorpay entry point keeps its signature and behaviour (callers and tests unchanged). Environment is
-- taken from the invoice (the order was created there), 'live' for legacy orders.
CREATE OR REPLACE FUNCTION public.billing_settle_gateway_payment(p_order_id TEXT, p_payment_id TEXT, p_amount_cents BIGINT, p_currency TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_env TEXT;
BEGIN
  SELECT coalesce((SELECT environment FROM public.payment_attempts WHERE provider = 'razorpay' AND provider_order_id = p_order_id ORDER BY created_at DESC LIMIT 1),
                  (SELECT payment_environment FROM public.org_subscription_invoices WHERE gateway = 'razorpay' AND gateway_order_id = p_order_id), 'live')
    INTO v_env;
  RETURN public.billing_settle_payment('razorpay', v_env, p_order_id, p_payment_id, p_amount_cents, p_currency, NULL);
END;
$$;

-- ── 16. Webhook events ──────────────────────────────────────────────────────────────────────────
-- Stores the event; returns 'new' or 'duplicate' (a duplicate already processed successfully is not processed again).
CREATE OR REPLACE FUNCTION public.payment_webhook_record(p_provider TEXT, p_env TEXT, p_event_id TEXT, p_type TEXT, p_signature_valid BOOLEAN, p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v RECORD;
BEGIN
  INSERT INTO public.payment_webhook_events (provider, environment, event_id, event_type, signature_valid, payload)
  VALUES (p_provider, p_env, p_event_id, p_type, p_signature_valid, CASE WHEN p_signature_valid THEN p_payload END)
  ON CONFLICT (provider, environment, event_id) DO NOTHING
  RETURNING * INTO v;
  IF v.id IS NULL THEN
    SELECT * INTO v FROM public.payment_webhook_events WHERE provider = p_provider AND environment = p_env AND event_id = p_event_id FOR UPDATE;
    UPDATE public.payment_webhook_events SET attempts = attempts + 1 WHERE id = v.id;
    RETURN jsonb_build_object('id', v.id, 'state', CASE WHEN v.outcome IN ('processed', 'ignored', 'refused') THEN 'duplicate' ELSE 'retry' END);
  END IF;
  IF p_signature_valid THEN
    UPDATE public.payment_gateway_configs SET last_webhook_at = now() WHERE provider = p_provider AND environment = p_env;
  END IF;
  RETURN jsonb_build_object('id', v.id, 'state', 'new');
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_webhook_outcome(p_event UUID, p_outcome TEXT, p_detail TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.payment_webhook_events SET outcome = p_outcome, detail = left(p_detail, 500), processed_at = now(), attempts = attempts + 1 WHERE id = p_event;
$$;

-- ── 17. Refunds ─────────────────────────────────────────────────────────────────────────────────
-- Request: finance admin or Platform Owner, with a reason, for at most what is left of the payment.
CREATE OR REPLACE FUNCTION public.payment_refund_request(p_actor UUID, p_payment UUID, p_unapplied UUID, p_amount BIGINT, p_reason TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_role public.platform_role; p RECORD; v_left BIGINT; v_pending BIGINT; v_threshold BIGINT; v_id UUID;
BEGIN
  v_role := public.payments_staff_role(p_actor, ARRAY['super_admin', 'finance_admin']::public.platform_role[]);
  IF (p_payment IS NULL) = (p_unapplied IS NULL) THEN RAISE EXCEPTION 'payments: refund one payment' USING ERRCODE = 'check_violation'; END IF;
  IF p_payment IS NOT NULL THEN
    SELECT id, org_id, provider, environment, provider_payment_id, amount_cents, refunded_cents, currency INTO p
      FROM public.org_subscription_payments WHERE id = p_payment FOR UPDATE;
  ELSE
    SELECT id, org_id, provider, environment, provider_payment_id, amount_cents, refunded_cents, currency INTO p
      FROM public.unapplied_payments WHERE id = p_unapplied FOR UPDATE;
  END IF;
  IF p.id IS NULL THEN RAISE EXCEPTION 'payments: payment not found' USING ERRCODE = 'no_data_found'; END IF;
  IF p.provider IS NULL THEN RAISE EXCEPTION 'payments: this payment was recorded manually; refund it outside the gateway' USING ERRCODE = 'check_violation'; END IF;
  SELECT coalesce(sum(amount_cents), 0) INTO v_pending FROM public.payment_refunds
   WHERE (payment_id = p_payment OR unapplied_id = p_unapplied) AND status IN ('requested', 'approved', 'submitted');
  v_left := p.amount_cents - p.refunded_cents - v_pending;
  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_left THEN
    RAISE EXCEPTION 'payments: refund amount must be between 1 and % paise', v_left USING ERRCODE = 'check_violation';
  END IF;
  SELECT refund_second_approval_above_cents INTO v_threshold FROM public.billing_settings WHERE id;
  INSERT INTO public.payment_refunds (payment_id, unapplied_id, org_id, provider, environment, provider_payment_id, amount_cents, currency, reason, approvals_required, requested_by)
  VALUES (p_payment, p_unapplied, p.org_id, p.provider, p.environment, p.provider_payment_id, p_amount, p.currency, btrim(p_reason),
          CASE WHEN p_amount > v_threshold THEN 2 ELSE 1 END, p_actor)
  RETURNING id INTO v_id;
  IF p_unapplied IS NOT NULL THEN UPDATE public.unapplied_payments SET status = 'refund_requested' WHERE id = p_unapplied AND status = 'open'; END IF;
  PERFORM public.payments_audit(p_actor, v_role, 'payments.refund_requested', 'payment_refunds', v_id,
    jsonb_build_object('amount_cents', p_amount, 'reason', p_reason, 'org_id', p.org_id, 'payment', p.provider || ':' || p.provider_payment_id));
  RETURN v_id;
END;
$$;

-- Approve or reject. The requester can never approve their own refund; two different approvers above the threshold.
CREATE OR REPLACE FUNCTION public.payment_refund_decide(p_actor UUID, p_refund UUID, p_decision TEXT, p_note TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_role public.platform_role; r RECORD; v_count INT;
BEGIN
  v_role := public.payments_staff_role(p_actor, ARRAY['super_admin', 'finance_admin']::public.platform_role[]);
  IF p_decision NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'payments: invalid decision' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO r FROM public.payment_refunds WHERE id = p_refund FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'payments: refund not found' USING ERRCODE = 'no_data_found'; END IF;
  IF r.status <> 'requested' THEN RAISE EXCEPTION 'payments: refund is already %', r.status USING ERRCODE = 'check_violation'; END IF;
  IF r.requested_by = p_actor THEN RAISE EXCEPTION 'payments: the requester cannot approve their own refund' USING ERRCODE = 'insufficient_privilege'; END IF;
  INSERT INTO public.payment_refund_approvals (refund_id, approver, approver_role, decision, note) VALUES (p_refund, p_actor, v_role, p_decision, p_note)
  ON CONFLICT (refund_id, approver) DO NOTHING;
  IF NOT FOUND THEN RAISE EXCEPTION 'payments: you have already decided this refund' USING ERRCODE = 'unique_violation'; END IF;
  IF p_decision = 'rejected' THEN
    UPDATE public.payment_refunds SET status = 'rejected', completed_at = now() WHERE id = p_refund;
    IF r.unapplied_id IS NOT NULL THEN UPDATE public.unapplied_payments SET status = 'open' WHERE id = r.unapplied_id AND status = 'refund_requested'; END IF;
  ELSE
    SELECT count(*) INTO v_count FROM public.payment_refund_approvals WHERE refund_id = p_refund AND decision = 'approved';
    IF v_count >= r.approvals_required THEN UPDATE public.payment_refunds SET status = 'approved' WHERE id = p_refund; END IF;
  END IF;
  PERFORM public.payments_audit(p_actor, v_role, 'payments.refund_' || p_decision, 'payment_refunds', p_refund,
    jsonb_build_object('amount_cents', r.amount_cents, 'note', p_note, 'org_id', r.org_id));
  RETURN jsonb_build_object('status', (SELECT status FROM public.payment_refunds WHERE id = p_refund));
END;
$$;

-- The server has sent an approved refund to its provider (the provider that took the payment).
CREATE OR REPLACE FUNCTION public.payment_refund_submitted(p_refund UUID, p_provider_refund_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  UPDATE public.payment_refunds SET status = 'submitted', provider_refund_id = p_provider_refund_id, submitted_at = now()
   WHERE id = p_refund AND status = 'approved';
  IF NOT FOUND THEN RAISE EXCEPTION 'payments: only an approved refund can be submitted' USING ERRCODE = 'check_violation'; END IF;
END;
$$;

-- Final result from the provider (webhook or poll). Idempotent. On success: payment marked refunded, credit note issued.
CREATE OR REPLACE FUNCTION public.payment_refund_result(p_provider TEXT, p_env TEXT, p_provider_refund_id TEXT, p_idempotency_key UUID, p_status TEXT, p_failure TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r RECORD; v_fy TEXT; v_n INT; v_cn UUID; v_inv RECORD; v_has_inv BOOLEAN := false; v_tax BIGINT; v_now TIMESTAMPTZ := now();
BEGIN
  IF p_status NOT IN ('processed', 'failed') THEN RAISE EXCEPTION 'payments: invalid refund result' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO r FROM public.payment_refunds
   WHERE provider = p_provider AND environment = p_env
     AND ((p_provider_refund_id IS NOT NULL AND provider_refund_id = p_provider_refund_id) OR (p_idempotency_key IS NOT NULL AND idempotency_key = p_idempotency_key))
   FOR UPDATE;
  IF r.id IS NULL THEN RETURN jsonb_build_object('status', 'unknown_refund'); END IF;
  IF r.status IN ('processed', 'failed') THEN RETURN jsonb_build_object('status', 'already_' || r.status, 'refund_id', r.id); END IF;
  IF r.status NOT IN ('submitted', 'approved') THEN RAISE EXCEPTION 'payments: refund is %', r.status USING ERRCODE = 'check_violation'; END IF;
  IF p_status = 'failed' THEN
    UPDATE public.payment_refunds SET status = 'failed', failure_reason = left(p_failure, 300), completed_at = v_now,
           provider_refund_id = coalesce(provider_refund_id, p_provider_refund_id) WHERE id = r.id;
    RETURN jsonb_build_object('status', 'failed', 'refund_id', r.id);
  END IF;

  IF r.payment_id IS NOT NULL THEN
    UPDATE public.org_subscription_payments SET refunded_cents = refunded_cents + r.amount_cents,
           status = CASE WHEN refunded_cents + r.amount_cents >= amount_cents THEN 'refunded' ELSE 'partially_refunded' END
     WHERE id = r.payment_id;
    SELECT i.* INTO v_inv FROM public.org_subscription_invoices i JOIN public.org_subscription_payments p ON p.invoice_id = i.id WHERE p.id = r.payment_id;
    v_has_inv := FOUND;
  ELSE
    UPDATE public.unapplied_payments SET refunded_cents = refunded_cents + r.amount_cents,
           status = CASE WHEN refunded_cents + r.amount_cents >= amount_cents THEN 'refunded' ELSE status END
     WHERE id = r.unapplied_id;
  END IF;

  -- A credit note only reverses a tax invoice: refunds of unapplied money (never invoiced) need none.
  IF v_has_inv THEN
    v_fy := CASE WHEN extract(month FROM v_now AT TIME ZONE 'Asia/Kolkata') >= 4
                 THEN to_char(v_now AT TIME ZONE 'Asia/Kolkata', 'YYYY') || '-' || to_char((v_now AT TIME ZONE 'Asia/Kolkata') + INTERVAL '1 year', 'YY')
                 ELSE to_char((v_now AT TIME ZONE 'Asia/Kolkata') - INTERVAL '1 year', 'YYYY') || '-' || to_char(v_now AT TIME ZONE 'Asia/Kolkata', 'YY') END;
    INSERT INTO public.billing_document_series (series, fiscal_year, last_number) VALUES ('CN', v_fy, 1)
    ON CONFLICT (series, fiscal_year) DO UPDATE SET last_number = billing_document_series.last_number + 1
    RETURNING last_number INTO v_n;
    -- Tax reversed in the same proportion as the invoice.
    v_tax := CASE WHEN v_inv.amount_cents > 0 THEN round(r.amount_cents::numeric * coalesce(v_inv.tax_cents, 0) / v_inv.amount_cents)::bigint ELSE 0 END;
    INSERT INTO public.credit_notes (number, org_id, invoice_id, refund_id, subtotal_cents, tax_cents, total_cents, currency, reason)
    VALUES ('CN/' || v_fy || '/' || lpad(v_n::text, 5, '0'), r.org_id, v_inv.id, r.id, r.amount_cents - v_tax, v_tax, r.amount_cents, r.currency, r.reason)
    RETURNING id INTO v_cn;
  END IF;
  UPDATE public.payment_refunds SET status = 'processed', completed_at = v_now, credit_note_id = v_cn,
         provider_refund_id = coalesce(provider_refund_id, p_provider_refund_id) WHERE id = r.id;
  IF r.org_id IS NOT NULL THEN
    INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_label, action, target_type, target_id, metadata)
    VALUES (r.org_id, 'system', 'REGrow billing', 'billing.refund_processed', 'payment_refunds', r.id::text,
      jsonb_build_object('amount_cents', r.amount_cents, 'credit_note', (SELECT number FROM public.credit_notes WHERE id = v_cn)));
  END IF;
  RETURN jsonb_build_object('status', 'processed', 'refund_id', r.id, 'credit_note_id', v_cn);
END;
$$;

-- ── 18. Disputes ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payment_dispute_record(p_provider TEXT, p_env TEXT, p_dispute_id TEXT, p_payment_id TEXT, p_amount BIGINT,
  p_status TEXT, p_reason TEXT, p_respond_by TIMESTAMPTZ)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE d RECORD; p RECORD; rank_new INT; rank_old INT;
BEGIN
  IF p_status NOT IN ('open', 'under_review', 'won', 'lost', 'closed') THEN RAISE EXCEPTION 'payments: invalid dispute status' USING ERRCODE = 'check_violation'; END IF;
  SELECT id, org_id INTO p FROM public.org_subscription_payments WHERE provider = p_provider AND environment = p_env AND provider_payment_id = p_payment_id;
  SELECT * INTO d FROM public.payment_disputes WHERE provider = p_provider AND environment = p_env AND provider_dispute_id = p_dispute_id FOR UPDATE;
  rank_new := array_position(ARRAY['open', 'under_review', 'won', 'lost', 'closed'], p_status);
  IF d.id IS NULL THEN
    INSERT INTO public.payment_disputes (provider, environment, provider_dispute_id, provider_payment_id, payment_id, org_id, amount_cents, reason, status, respond_by)
    VALUES (p_provider, p_env, p_dispute_id, p_payment_id, p.id, p.org_id, greatest(coalesce(p_amount, 0), 0), p_reason, p_status, p_respond_by)
    RETURNING * INTO d;
    IF p.id IS NOT NULL THEN UPDATE public.org_subscription_payments SET status = 'disputed' WHERE id = p.id AND status IN ('captured', 'partially_refunded'); END IF;
    RETURN jsonb_build_object('status', 'created', 'dispute_id', d.id);
  END IF;
  rank_old := array_position(ARRAY['open', 'under_review', 'won', 'lost', 'closed'], d.status);
  -- Out-of-order events never move a dispute backwards.
  IF rank_new <= rank_old THEN RETURN jsonb_build_object('status', 'unchanged', 'dispute_id', d.id); END IF;
  UPDATE public.payment_disputes SET status = p_status, respond_by = coalesce(p_respond_by, respond_by), updated_at = now() WHERE id = d.id;
  IF p_status = 'won' AND p.id IS NOT NULL THEN
    UPDATE public.org_subscription_payments SET status = CASE WHEN refunded_cents > 0 THEN 'partially_refunded' ELSE 'captured' END WHERE id = p.id AND status = 'disputed';
  END IF;
  RETURN jsonb_build_object('status', 'updated', 'dispute_id', d.id);
END;
$$;

-- ── 19. Verified outage → extra days to pay ─────────────────────────────────────────────────────
-- Affected: subscriptions whose payment deadline (period end, or the past-due grace end) fell during the outage or
-- within the grace days after it. Each gets outage_grace_until = deadline + grace days (at least outage end + grace).
CREATE OR REPLACE FUNCTION public.payment_outage_record(p_actor UUID, p_provider TEXT, p_env TEXT, p_started TIMESTAMPTZ, p_ended TIMESTAMPTZ, p_evidence TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v_role public.platform_role; v_days INT; v_id UUID; s RECORD; v_deadline TIMESTAMPTZ; v_new TIMESTAMPTZ; v_n INT := 0;
BEGIN
  v_role := public.payments_staff_role(p_actor, ARRAY['super_admin']::public.platform_role[]);
  IF p_ended <= p_started OR p_ended > now() + INTERVAL '1 hour' THEN RAISE EXCEPTION 'payments: invalid outage window' USING ERRCODE = 'check_violation'; END IF;
  SELECT outage_grace_days INTO v_days FROM public.billing_settings WHERE id;
  INSERT INTO public.payment_provider_outages (provider, environment, started_at, ended_at, evidence, verified_by, grace_days)
  VALUES (p_provider, p_env, p_started, p_ended, p_evidence, p_actor, v_days) RETURNING id INTO v_id;
  FOR s IN SELECT * FROM public.org_subscriptions WHERE status IN ('active', 'past_due') FOR UPDATE LOOP
    v_deadline := CASE WHEN s.status = 'past_due' THEN coalesce(s.grace_period_ends_at, s.current_period_end + INTERVAL '7 days') ELSE s.current_period_end END;
    IF v_deadline IS NULL OR v_deadline < p_started OR v_deadline > p_ended + make_interval(days => v_days) THEN CONTINUE; END IF;
    v_new := greatest(v_deadline, p_ended) + make_interval(days => v_days);
    IF s.outage_grace_until IS NOT NULL AND s.outage_grace_until >= v_new THEN CONTINUE; END IF;
    UPDATE public.org_subscriptions SET outage_grace_until = v_new, updated_at = now() WHERE id = s.id;
    INSERT INTO public.payment_outage_extensions (outage_id, subscription_id, org_id, previous_deadline, new_deadline) VALUES (v_id, s.id, s.org_id, v_deadline, v_new);
    INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_label, action, target_type, target_id, metadata)
    VALUES (s.org_id, 'system', 'REGrow billing', 'billing.outage_grace_granted', 'org_subscriptions', s.id::text,
      jsonb_build_object('provider', p_provider, 'days', v_days, 'pay_by', v_new));
    v_n := v_n + 1;
  END LOOP;
  UPDATE public.payment_provider_outages SET affected = v_n WHERE id = v_id;
  PERFORM public.payments_audit(p_actor, v_role, 'payments.outage_recorded', 'payment_provider_outages', v_id,
    jsonb_build_object('provider', p_provider, 'environment', p_env, 'started', p_started, 'ended', p_ended, 'affected', v_n, 'evidence', p_evidence));
  RETURN jsonb_build_object('outage_id', v_id, 'affected', v_n, 'grace_days', v_days);
END;
$$;

-- Period enforcement honours an outage extension (same rules as 20260059 otherwise).
CREATE OR REPLACE FUNCTION public.billing_enforce_periods(p_now TIMESTAMPTZ DEFAULT now())
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE r RECORD; v_overdue INT := 0; v_expired INT := 0;
BEGIN
  FOR r IN SELECT id, org_id FROM public.org_subscriptions
            WHERE status = 'active' AND current_period_end < p_now FOR UPDATE SKIP LOCKED LOOP
    UPDATE public.org_subscriptions SET status = 'past_due', grace_period_ends_at = p_now + INTERVAL '7 days', updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_label, action, target_type, target_id, metadata)
    VALUES (r.org_id, 'system', 'REGrow billing', 'billing.payment_overdue', 'org_subscriptions', r.id::text,
      jsonb_build_object('grace_days', 7));
    v_overdue := v_overdue + 1;
  END LOOP;

  FOR r IN SELECT id, org_id, status FROM public.org_subscriptions
            WHERE ((status IN ('trial', 'pending_payment', 'canceled') AND current_period_end < p_now)
               OR (status = 'past_due' AND coalesce(grace_period_ends_at, current_period_end + INTERVAL '7 days') < p_now))
              AND (outage_grace_until IS NULL OR outage_grace_until < p_now)
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

-- ── 20. Mandates ────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payment_mandate_create(p_actor UUID, p_org UUID, p_provider TEXT, p_env TEXT, p_method TEXT, p_max BIGINT, p_frequency TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE s RECORD; v UUID; g RECORD;
BEGIN
  IF NOT (SELECT recurring_payments_enabled FROM public.billing_settings WHERE id) THEN
    RAISE EXCEPTION 'payments: recurring payments are not enabled' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT * INTO g FROM public.payment_gateway_configs WHERE provider = p_provider AND environment = p_env;
  IF g.status IS DISTINCT FROM 'enabled' THEN RAISE EXCEPTION 'payments: gateway is not enabled' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO s FROM public.org_subscriptions WHERE org_id = p_org AND status IN ('active', 'past_due') FOR UPDATE;
  IF s.id IS NULL THEN RAISE EXCEPTION 'payments: an active subscription is required' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.payment_mandates (org_id, subscription_id, provider, environment, method, max_amount_cents, frequency, created_by)
  VALUES (p_org, s.id, p_provider, p_env, p_method, p_max, p_frequency, p_actor) RETURNING id INTO v;
  INSERT INTO public.payment_mandate_events (mandate_id, to_status, source, actor) VALUES (v, 'created', 'customer', p_actor);
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_user_id, action, target_type, target_id, metadata)
  VALUES (p_org, 'member', p_actor, 'billing.mandate_created', 'payment_mandates', v::text, jsonb_build_object('method', p_method, 'max_amount_cents', p_max));
  RETURN v;
END;
$$;

-- Allowed transitions; anything else is refused (provider events arriving out of order are ignored, not applied).
CREATE OR REPLACE FUNCTION public.payment_mandate_transition(p_mandate UUID, p_to TEXT, p_source TEXT, p_actor UUID, p_detail TEXT, p_provider_ref TEXT DEFAULT NULL, p_auth_url TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE m RECORD; ok BOOLEAN;
BEGIN
  SELECT * INTO m FROM public.payment_mandates WHERE id = p_mandate FOR UPDATE;
  IF m.id IS NULL THEN RAISE EXCEPTION 'payments: mandate not found' USING ERRCODE = 'no_data_found'; END IF;
  IF m.status = p_to THEN RETURN jsonb_build_object('status', 'unchanged'); END IF;
  ok := (m.status, p_to) IN (('created', 'pending_authorisation'), ('created', 'failed'), ('created', 'cancelled'),
          ('pending_authorisation', 'active'), ('pending_authorisation', 'failed'), ('pending_authorisation', 'cancelled'), ('pending_authorisation', 'expired'),
          ('active', 'paused'), ('active', 'cancelled'), ('active', 'expired'), ('paused', 'active'), ('paused', 'cancelled'), ('paused', 'expired'));
  IF NOT ok THEN RETURN jsonb_build_object('status', 'ignored', 'from', m.status, 'to', p_to); END IF;
  UPDATE public.payment_mandates SET status = p_to, updated_at = now(),
         provider_mandate_id = coalesce(provider_mandate_id, p_provider_ref), authorisation_url = coalesce(p_auth_url, authorisation_url),
         authorised_at = CASE WHEN p_to = 'active' THEN coalesce(authorised_at, now()) ELSE authorised_at END,
         cancelled_at = CASE WHEN p_to = 'cancelled' THEN now() ELSE cancelled_at END,
         cancelled_by = CASE WHEN p_to = 'cancelled' THEN p_actor ELSE cancelled_by END,
         cancel_reason = CASE WHEN p_to = 'cancelled' THEN p_detail ELSE cancel_reason END
   WHERE id = m.id;
  -- A mandate that stops leaves pending charges unsent; the invoice stays payable manually.
  IF p_to IN ('cancelled', 'expired', 'failed') THEN
    UPDATE public.payment_mandate_charges SET status = 'canceled', updated_at = now() WHERE mandate_id = m.id AND status IN ('scheduled', 'notified');
  END IF;
  INSERT INTO public.payment_mandate_events (mandate_id, from_status, to_status, source, actor, detail) VALUES (m.id, m.status, p_to, p_source, p_actor, p_detail);
  INSERT INTO public.org_audit_logs (org_id, actor_kind, actor_user_id, actor_label, action, target_type, target_id, metadata)
  VALUES (m.org_id, CASE p_source WHEN 'customer' THEN 'member' WHEN 'staff' THEN 'platform' ELSE 'system' END, p_actor,
          CASE WHEN p_source = 'provider' THEN (SELECT name FROM public.payment_providers WHERE code = m.provider) END,
          'billing.mandate_' || p_to, 'payment_mandates', m.id::text, jsonb_build_object('from', m.status, 'detail', p_detail));
  RETURN jsonb_build_object('status', 'changed', 'from', m.status, 'to', p_to);
END;
$$;

-- Schedule a charge for an invoice on an active mandate; it may be sent only after the pre-debit notice period.
CREATE OR REPLACE FUNCTION public.payment_mandate_schedule_charge(p_mandate UUID, p_invoice UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE m RECORD; i RECORD; v UUID;
BEGIN
  IF NOT (SELECT recurring_payments_enabled FROM public.billing_settings WHERE id) THEN
    RAISE EXCEPTION 'payments: recurring payments are not enabled' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT * INTO m FROM public.payment_mandates WHERE id = p_mandate FOR UPDATE;
  SELECT * INTO i FROM public.org_subscription_invoices WHERE id = p_invoice;
  IF m.status <> 'active' THEN RAISE EXCEPTION 'payments: mandate is %', m.status USING ERRCODE = 'check_violation'; END IF;
  IF i.org_id <> m.org_id OR i.status <> 'issued' THEN RAISE EXCEPTION 'payments: invoice cannot be charged' USING ERRCODE = 'check_violation'; END IF;
  IF i.amount_cents > m.max_amount_cents THEN RAISE EXCEPTION 'payments: invoice exceeds the mandate limit' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.payment_mandate_charges (mandate_id, invoice_id, amount_cents) VALUES (m.id, i.id, i.amount_cents)
  ON CONFLICT (mandate_id, invoice_id) DO NOTHING RETURNING id INTO v;
  RETURN coalesce(v, (SELECT id FROM public.payment_mandate_charges WHERE mandate_id = m.id AND invoice_id = i.id));
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_mandate_charge_notified(p_charge UUID)
RETURNS TIMESTAMPTZ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v TIMESTAMPTZ;
BEGIN
  UPDATE public.payment_mandate_charges
     SET status = 'notified', pre_debit_notified_at = now(),
         charge_after = now() + make_interval(hours => (SELECT mandate_pre_debit_notice_hours FROM public.billing_settings WHERE id)), updated_at = now()
   WHERE id = p_charge AND status = 'scheduled' RETURNING charge_after INTO v;
  IF v IS NULL THEN RAISE EXCEPTION 'payments: charge is not awaiting notice' USING ERRCODE = 'check_violation'; END IF;
  RETURN v;
END;
$$;

-- The charge may be sent to the provider only after notice, while the mandate is active and the invoice unpaid.
CREATE OR REPLACE FUNCTION public.payment_mandate_charge_submit(p_charge UUID, p_provider_charge_id TEXT, p_now TIMESTAMPTZ DEFAULT now())
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE v RECORD;
BEGIN
  IF NOT (SELECT recurring_payments_enabled FROM public.billing_settings WHERE id) THEN
    RAISE EXCEPTION 'payments: recurring payments are not enabled' USING ERRCODE = 'feature_not_supported';
  END IF;
  SELECT ch.*, m.status AS mandate_status, i.status AS invoice_status INTO v
    FROM public.payment_mandate_charges ch JOIN public.payment_mandates m ON m.id = ch.mandate_id JOIN public.org_subscription_invoices i ON i.id = ch.invoice_id
   WHERE ch.id = p_charge FOR UPDATE OF ch;
  IF v.status NOT IN ('notified', 'failed') OR v.charge_after IS NULL OR v.charge_after > p_now THEN
    RAISE EXCEPTION 'payments: pre-debit notice period has not passed' USING ERRCODE = 'check_violation';
  END IF;
  IF v.mandate_status <> 'active' OR v.invoice_status <> 'issued' THEN RAISE EXCEPTION 'payments: charge no longer valid' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.payment_mandate_charges SET status = 'submitted', provider_charge_id = p_provider_charge_id, attempt_count = attempt_count + 1, updated_at = now() WHERE id = p_charge;
END;
$$;

CREATE OR REPLACE FUNCTION public.payment_mandate_charge_result(p_charge UUID, p_succeeded BOOLEAN, p_failure TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  -- Success is settled through billing_settle_payment like any payment; this records the charge outcome. A failed
  -- debit can be retried (after a new notice where the rules require) up to 3 attempts; the normal grace rules apply.
  UPDATE public.payment_mandate_charges SET
    status = CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
    failure_reason = CASE WHEN p_succeeded THEN NULL ELSE left(p_failure, 300) END,
    next_retry_at = CASE WHEN p_succeeded OR attempt_count >= 3 THEN NULL ELSE now() + INTERVAL '1 day' END,
    updated_at = now()
  WHERE id = p_charge AND status = 'submitted';
  IF NOT FOUND THEN RAISE EXCEPTION 'payments: charge is not awaiting a result' USING ERRCODE = 'check_violation'; END IF;
END;
$$;

-- ── 21. Health ──────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.payment_health_record(p_provider TEXT, p_env TEXT, p_ok BOOLEAN, p_latency INTEGER, p_error TEXT)
RETURNS VOID LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  INSERT INTO public.payment_gateway_health_checks (provider, environment, ok, latency_ms, error) VALUES (p_provider, p_env, p_ok, p_latency, left(p_error, 300));
  UPDATE public.payment_gateway_configs SET last_health_at = now(), last_health_ok = p_ok, last_health_error = CASE WHEN p_ok THEN NULL ELSE left(p_error, 300) END
   WHERE provider = p_provider AND environment = p_env;
  DELETE FROM public.payment_gateway_health_checks WHERE checked_at < now() - INTERVAL '30 days';
$$;

-- ── 22. Security: RLS on, no client access ──────────────────────────────────────────────────────
DO $$
DECLARE t TEXT; f TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['billing_settings', 'payment_providers', 'payment_gateway_configs', 'payment_attempts', 'unapplied_payments',
    'payment_webhook_events', 'payment_refunds', 'payment_refund_approvals', 'billing_document_series', 'credit_notes', 'payment_disputes',
    'payment_settlements', 'payment_reconciliation_runs', 'payment_reconciliation_items', 'payment_gateway_health_checks',
    'payment_provider_outages', 'payment_outage_extensions', 'payment_mandates', 'payment_mandate_events', 'payment_mandate_charges', 'org_billing_profiles']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
  FOREACH f IN ARRAY ARRAY[
    'public.billing_gst_cents(bigint)', 'public.billing_invoice_tax_snapshot()', 'public.payments_staff_role(uuid, public.platform_role[])',
    'public.payments_audit(uuid, public.platform_role, text, text, uuid, jsonb)',
    'public.payment_gateway_set_status(uuid, text, text, text, text)', 'public.payment_gateway_set_primary(uuid, text, text, text)',
    'public.payment_open_attempt(uuid)', 'public.payment_attempt_create(uuid, uuid, text, text, text, text, bigint, text, uuid, timestamptz)',
    'public.payment_attempt_close(uuid, text)',
    'public.billing_settle_payment(text, text, text, text, bigint, text, text)', 'public.billing_settle_gateway_payment(text, text, bigint, text)',
    'public.payment_webhook_record(text, text, text, text, boolean, jsonb)', 'public.payment_webhook_outcome(uuid, text, text)',
    'public.payment_refund_request(uuid, uuid, uuid, bigint, text)', 'public.payment_refund_decide(uuid, uuid, text, text)',
    'public.payment_refund_submitted(uuid, text)', 'public.payment_refund_result(text, text, text, uuid, text, text)',
    'public.payment_dispute_record(text, text, text, text, bigint, text, text, timestamptz)',
    'public.payment_outage_record(uuid, text, text, timestamptz, timestamptz, text)', 'public.billing_enforce_periods(timestamptz)',
    'public.payment_mandate_create(uuid, uuid, text, text, text, bigint, text)',
    'public.payment_mandate_transition(uuid, text, text, uuid, text, text, text)', 'public.payment_mandate_schedule_charge(uuid, uuid)',
    'public.payment_mandate_charge_notified(uuid)', 'public.payment_mandate_charge_submit(uuid, text, timestamptz)',
    'public.payment_mandate_charge_result(uuid, boolean, text)', 'public.payment_health_record(text, text, boolean, integer, text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- ── 23. Scheduled maintenance (jobs run by the existing worker) ─────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('regrow-payments-poll', 'regrow-payments-health', 'regrow-payments-reconcile', 'regrow-payments-mandates');
  PERFORM cron.schedule('regrow-payments-poll', '*/10 * * * *',
    $q$SELECT public.enqueue_job('payments.poll_pending', '{}'::jsonb, NULL, now(), 'payments.poll_pending:' || to_char(now(), 'YYYYMMDDHH24MI'))$q$);
  PERFORM cron.schedule('regrow-payments-health', '*/5 * * * *',
    $q$SELECT public.enqueue_job('payments.health_check', '{}'::jsonb, NULL, now(), 'payments.health_check:' || to_char(now(), 'YYYYMMDDHH24MI'))$q$);
  PERFORM cron.schedule('regrow-payments-reconcile', '30 21 * * *', -- 03:00 IST
    $q$SELECT public.enqueue_job('payments.reconcile', '{}'::jsonb, NULL, now(), 'payments.reconcile:' || to_char(now(), 'YYYYMMDD'))$q$);
  -- Recurring payments: the job does nothing while billing_settings.recurring_payments_enabled is false.
  PERFORM cron.schedule('regrow-payments-mandates', '7 * * * *',
    $q$SELECT public.enqueue_job('payments.mandate_cycle', '{}'::jsonb, NULL, now(), 'payments.mandate_cycle:' || to_char(now(), 'YYYYMMDDHH24'))$q$);
END $$;
