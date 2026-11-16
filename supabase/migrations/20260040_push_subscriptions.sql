-- 20260040_push_subscriptions.sql
-- REGrow M1-6: Web Push subscriptions (one row per browser/device a user enabled alerts on).
-- Written and read only by the server (service role) after the API has authenticated the caller;
-- clients never touch this table directly, so there are no grants to anon/authenticated.

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint      TEXT NOT NULL,
  p256dh        TEXT NOT NULL,
  auth          TEXT NOT NULL,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_success_at TIMESTAMPTZ,
  failure_count INTEGER NOT NULL DEFAULT 0 CHECK (failure_count >= 0),
  CONSTRAINT push_subscriptions_endpoint_https CHECK (endpoint ~ '^https://'),
  CONSTRAINT push_subscriptions_endpoint_len CHECK (char_length(endpoint) <= 2048),
  CONSTRAINT push_subscriptions_keys_len CHECK (char_length(p256dh) <= 256 AND char_length(auth) <= 64)
);

-- A device endpoint belongs to exactly one user at a time (re-subscribing on a shared device moves it).
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key ON public.push_subscriptions (endpoint);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_profile ON public.push_subscriptions (profile_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

COMMENT ON TABLE public.push_subscriptions IS
  'Web Push subscriptions per user device (M1-6). Server-only: managed through /api/push/subscription after authentication.';
