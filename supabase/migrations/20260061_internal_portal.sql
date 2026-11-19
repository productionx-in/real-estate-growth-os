-- 20260061_internal_portal.sql — REGrow's internal experiences (docs/design/internal-portal.md):
--   Platform Admin (super_admin, platform_admin), Internal Sales (sales_manager, sales_rep), Internal Support
--   (support_agent), Finance (finance_admin), Auditor (read-only).
-- Sales works REGrow's own prospects — never customer CRM data. Support works customer-opened cases; customer business
-- data stays reachable only through a customer-approved, time-limited, audited support grant (migration 20260046).
-- All tables: RLS on, no client grants; every read and write goes through server routes that check the platform role
-- (lib/platform/*) and write platform_audit_logs. Additive: nothing existing changes.

-- A sales manager sees every prospect; a sales executive (sales_rep) sees their own and unassigned ones.
ALTER TYPE public.platform_role ADD VALUE IF NOT EXISTS 'sales_manager';

CREATE TABLE IF NOT EXISTS public.internal_prospects (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name      TEXT NOT NULL CHECK (length(btrim(company_name)) BETWEEN 2 AND 200),
  org_type          TEXT NOT NULL DEFAULT 'developer' CHECK (org_type IN ('developer', 'channel_partner')),
  city              TEXT,
  team_size         INTEGER CHECK (team_size IS NULL OR team_size > 0),
  source            TEXT NOT NULL DEFAULT 'other' CHECK (source IN ('website', 'referral', 'event', 'outbound', 'partner', 'other')),
  campaign          TEXT,
  stage             TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'interested', 'qualified', 'demo_scheduled', 'demo_done',
                      'trial_started', 'negotiation', 'won', 'lost')),
  lost_reason       TEXT,
  owner_user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_name      TEXT,
  contact_email     TEXT CHECK (contact_email IS NULL OR contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  contact_phone     TEXT,
  notes             TEXT,
  next_follow_up_at TIMESTAMPTZ,
  linked_org_id     UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  source_ref        TEXT UNIQUE,     -- e.g. 'website-request:<lead id>' so a request is imported once
  created_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (stage <> 'lost' OR lost_reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_internal_prospects_owner ON public.internal_prospects (owner_user_id, stage);
CREATE INDEX IF NOT EXISTS idx_internal_prospects_follow ON public.internal_prospects (next_follow_up_at) WHERE stage NOT IN ('won', 'lost');

CREATE TABLE IF NOT EXISTS public.internal_prospect_activities (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES public.internal_prospects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('call', 'email', 'meeting', 'note', 'stage_change', 'assignment')),
  body        TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
  actor       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prospect_activities ON public.internal_prospect_activities (prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.support_cases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  opened_by_profile UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  subject           TEXT NOT NULL CHECK (length(btrim(subject)) BETWEEN 3 AND 200),
  category          TEXT NOT NULL DEFAULT 'question' CHECK (category IN ('question', 'problem', 'billing', 'data_request', 'feature_request')),
  priority          TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status            TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed')),
  assignee_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_support_cases_org ON public.support_cases (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_cases_queue ON public.support_cases (status, priority, created_at);

CREATE TABLE IF NOT EXISTS public.support_case_messages (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id      UUID NOT NULL REFERENCES public.support_cases(id) ON DELETE CASCADE,
  author_kind  TEXT NOT NULL CHECK (author_kind IN ('customer', 'staff')),
  author_user  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_label TEXT,
  body         TEXT NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 8000),
  -- Internal notes are staff-only and never shown to the customer.
  internal     BOOLEAN NOT NULL DEFAULT false CHECK (NOT internal OR author_kind = 'staff'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_case_messages ON public.support_case_messages (case_id, created_at);

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['internal_prospects', 'internal_prospect_activities', 'support_cases', 'support_case_messages'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Staff management finds an existing account by email (server only). Accounts are never created here.
CREATE OR REPLACE FUNCTION public.platform_account_id_by_email(p_email TEXT)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, auth, pg_temp
AS $$ SELECT id FROM auth.users WHERE lower(email) = lower(btrim(p_email)) AND deleted_at IS NULL LIMIT 1 $$;
REVOKE ALL ON FUNCTION public.platform_account_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_account_id_by_email(text) TO service_role;
