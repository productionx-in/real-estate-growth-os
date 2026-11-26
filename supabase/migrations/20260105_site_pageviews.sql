-- 20260105_site_pageviews.sql — first-party visitor flow for the public website (re.productionx.in), shown to
-- RE by PX staff in the platform console (Website analytics). Privacy by design: no cookies, no IP address, no
-- user agent string; a visit is a random id that lives only in the visitor's browser tab (sessionStorage).
-- Customer workspaces are never tracked here (the collector only accepts public website paths).
BEGIN;

CREATE TABLE IF NOT EXISTS public.site_pageviews (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  visit_id     TEXT NOT NULL CHECK (visit_id ~ '^[a-z0-9]{8,32}$'),
  seq          SMALLINT NOT NULL DEFAULT 1 CHECK (seq BETWEEN 1 AND 500),
  path         TEXT NOT NULL CHECK (path ~ '^/' AND length(path) <= 200),
  prev_path    TEXT CHECK (prev_path IS NULL OR (prev_path ~ '^/' AND length(prev_path) <= 200)),
  referrer_host TEXT CHECK (referrer_host IS NULL OR length(referrer_host) <= 120),
  utm_source   TEXT CHECK (utm_source IS NULL OR length(utm_source) <= 80),
  utm_medium   TEXT CHECK (utm_medium IS NULL OR length(utm_medium) <= 80),
  utm_campaign TEXT CHECK (utm_campaign IS NULL OR length(utm_campaign) <= 120),
  country      TEXT CHECK (country IS NULL OR country ~ '^[A-Z]{2}$'),
  device       TEXT NOT NULL DEFAULT 'desktop' CHECK (device IN ('mobile', 'tablet', 'desktop'))
);
CREATE INDEX IF NOT EXISTS site_pageviews_at_idx ON public.site_pageviews (at DESC);
CREATE INDEX IF NOT EXISTS site_pageviews_visit_idx ON public.site_pageviews (visit_id, seq);

ALTER TABLE public.site_pageviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_pageviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.site_pageviews TO service_role;

-- Keep 13 months (year-on-year comparisons), then delete.
CREATE OR REPLACE FUNCTION public.purge_site_pageviews() RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.site_pageviews WHERE at < now() - interval '13 months' RETURNING 1) SELECT count(*)::int FROM d
$$;
REVOKE ALL ON FUNCTION public.purge_site_pageviews() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_site_pageviews() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'repx-site-pageviews-purge';
    PERFORM cron.schedule('repx-site-pageviews-purge', '17 21 * * *', 'SELECT public.purge_site_pageviews()');
  END IF;
END $$;

COMMIT;
