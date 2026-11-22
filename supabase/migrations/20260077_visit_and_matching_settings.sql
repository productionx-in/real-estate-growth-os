-- 20260077_visit_and_matching_settings.sql
-- Settings → Site visits and Settings → Matching rules: two more sections in the server-only org_settings table
-- (20260074), validated by lib/settings/workspace.ts. Read by the buyer-message job (site_visit.notify), the visit
-- scheduler (daily limit), the calendar (check-in distance) and property matching. Additive only.

BEGIN;

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS visits   JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(visits) = 'object' AND pg_column_size(visits) < 4096),
  ADD COLUMN IF NOT EXISTS matching JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(matching) = 'object' AND pg_column_size(matching) < 4096);

-- Routing log filters (Your team → Assignment log): by outcome over time.
CREATE INDEX IF NOT EXISTS idx_routing_decisions_org_outcome ON public.lead_routing_decisions (org_id, outcome, decided_at DESC);

COMMIT;
