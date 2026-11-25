-- 20260095_listing_commercial_owner_emails.sql
-- Agency listings, part 2 (after 20260079):
--   * Commercial details on a listing: how far it is fitted out (bare shell / warm shell / plug and play), seats or
--     workstations, shop frontage, and parking. Used to match office, shop and co-working needs.
--   * What a commercial buyer or tenant wants (leads_all): fit-out levels they accept and the fewest seats they need.
--     The live-leads view is recreated (20260073 rule).
--   * When the owner was last e-mailed about the listing and with which message (the e-mail itself goes through the
--     outbox, 20260035), so an agent sees it was sent and the same message cannot be sent twice in a day.
-- Additive only. No new grants: listings stays server-only (RLS on, no client privileges).

BEGIN;

ALTER TABLE public.listings
  ADD COLUMN IF NOT EXISTS fit_out TEXT CHECK (fit_out IS NULL OR fit_out IN ('bare_shell', 'warm_shell', 'plug_and_play')),
  ADD COLUMN IF NOT EXISTS seats INTEGER CHECK (seats IS NULL OR seats BETWEEN 1 AND 100000),
  ADD COLUMN IF NOT EXISTS frontage_ft NUMERIC CHECK (frontage_ft IS NULL OR frontage_ft > 0 AND frontage_ft < 10000),
  ADD COLUMN IF NOT EXISTS parking INTEGER CHECK (parking IS NULL OR parking BETWEEN 0 AND 100000),
  ADD COLUMN IF NOT EXISTS owner_emailed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS owner_email_kind TEXT CHECK (owner_email_kind IS NULL OR owner_email_kind IN ('listed', 'update'));

ALTER TABLE public.leads_all
  ADD COLUMN IF NOT EXISTS req_fit_out TEXT[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(req_fit_out) <= 3 AND req_fit_out <@ ARRAY['bare_shell', 'warm_shell', 'plug_and_play']::text[]),
  ADD COLUMN IF NOT EXISTS req_min_seats INTEGER CHECK (req_min_seats IS NULL OR req_min_seats BETWEEN 1 AND 100000);

CREATE OR REPLACE VIEW public.leads WITH (security_invoker = true) AS
  SELECT * FROM public.leads_all WHERE deleted_at IS NULL;

COMMIT;
