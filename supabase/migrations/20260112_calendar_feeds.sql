-- 20260112_calendar_feeds.sql — calendar sync: a private subscription link per person per workspace, so their RE
-- follow-ups and site visits appear in Google Calendar, Apple Calendar (iPhone, Mac) or Outlook.
-- Only a SHA-256 hash of the link's secret is stored; the link is shown once and can be replaced or turned off.
-- Server-only table: RLS on with no policies, and no grants to anon or signed-in users.
CREATE TABLE IF NOT EXISTS public.calendar_feeds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  profile_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (org_id, profile_id)
);
CREATE INDEX IF NOT EXISTS idx_calendar_feeds_profile ON public.calendar_feeds (profile_id);

ALTER TABLE public.calendar_feeds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.calendar_feeds FROM anon, authenticated;
GRANT ALL ON public.calendar_feeds TO service_role;
