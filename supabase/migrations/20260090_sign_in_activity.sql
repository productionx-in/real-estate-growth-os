-- 20260090_sign_in_activity.sql
-- Sign-in activity for workspace admins (Settings → Your team → Sign-in activity). Supabase removes a session when
-- its person signs out and does not keep a sign-in history here, so REGrow records one:
--   * sign_in_events — one row per sign-in (an auth session): when, from which address and browser, whether the
--     second step was completed, and when it ended (signed out, revoked or expired).
--   * Written by triggers on auth.sessions. The triggers can never block or fail a sign-in: any error is swallowed.
--   * Kept for 180 days (daily clean-up). Server-only: RLS on, no client privileges. Admins read it through the
--     server, and only for active members of their own workspace (lib/dal/sign-in-activity.ts).
-- Additive only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sign_in_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id  UUID NOT NULL,
  session_id    UUID NOT NULL UNIQUE,
  signed_in_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ,
  ended_at      TIMESTAMPTZ,
  ip            TEXT CHECK (ip IS NULL OR length(ip) <= 64),
  user_agent    TEXT CHECK (user_agent IS NULL OR length(user_agent) <= 400),
  second_step   BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_sign_in_events_user ON public.sign_in_events (auth_user_id, signed_in_at DESC);
CREATE INDEX IF NOT EXISTS idx_sign_in_events_time ON public.sign_in_events (signed_in_at);

ALTER TABLE public.sign_in_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sign_in_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON public.sign_in_events TO service_role;

CREATE OR REPLACE FUNCTION public.record_sign_in_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.sign_in_events (auth_user_id, session_id, signed_in_at, ip, user_agent, second_step)
      VALUES (NEW.user_id, NEW.id, coalesce(NEW.created_at, now()), left(host(NEW.ip), 64), left(NEW.user_agent, 400), NEW.aal::text = 'aal2')
      ON CONFLICT (session_id) DO NOTHING;
    ELSIF TG_OP = 'UPDATE' THEN
      UPDATE public.sign_in_events
         SET last_seen_at = greatest(coalesce(last_seen_at, signed_in_at), coalesce(NEW.refreshed_at::timestamptz, NEW.updated_at, now())),
             second_step = second_step OR NEW.aal::text = 'aal2'
       WHERE session_id = NEW.id;
    ELSIF TG_OP = 'DELETE' THEN
      UPDATE public.sign_in_events SET ended_at = now() WHERE session_id = OLD.id AND ended_at IS NULL;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL; -- never block a sign-in, refresh or sign-out because of the activity record
  END;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
REVOKE ALL ON FUNCTION public.record_sign_in_event() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_sign_in_event ON auth.sessions;
CREATE TRIGGER trg_record_sign_in_event AFTER INSERT OR UPDATE OR DELETE ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION public.record_sign_in_event();

-- Sessions that already exist (people signed in now) start the history.
INSERT INTO public.sign_in_events (auth_user_id, session_id, signed_in_at, last_seen_at, ip, user_agent, second_step)
SELECT s.user_id, s.id, s.created_at, coalesce(s.refreshed_at::timestamptz, s.updated_at), left(host(s.ip), 64), left(s.user_agent, 400), s.aal::text = 'aal2'
FROM auth.sessions s
ON CONFLICT (session_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.purge_old_sign_in_events()
RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp
AS $$
  WITH d AS (DELETE FROM public.sign_in_events WHERE signed_in_at < now() - interval '180 days' RETURNING 1)
  SELECT count(*)::integer FROM d;
$$;
REVOKE ALL ON FUNCTION public.purge_old_sign_in_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_sign_in_events() TO service_role;

COMMIT;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-sign-in-purge';
  PERFORM cron.schedule('regrow-sign-in-purge', '40 20 * * *', 'SELECT public.purge_old_sign_in_events()'); -- 02:10 IST
END;
$$;
