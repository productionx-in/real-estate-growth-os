-- Migration 20260039: notifications_and_job_queue
-- REGrow Lead Engine — M1-5 (notification outbox + in-app inbox) and M1-8 (job runner).
--
-- Design
--   * Notifications are created by a trigger on leads in the SAME transaction as the assignment, so an
--     assignment can never exist without its alert (transactional outbox). In-app delivery is immediate.
--   * External delivery (web push, WhatsApp — next PRs) runs from a durable job queue: each notification
--     enqueues one 'notification.dispatch' job; a worker endpoint claims jobs with FOR UPDATE SKIP LOCKED,
--     retries with exponential backoff and parks jobs as 'dead' after max_attempts.
--   * Scheduler: pg_cron calls public.regrow_invoke_job_worker() every minute; it POSTs to the worker via
--     pg_net ONLY when both Vault secrets exist ('regrow_job_worker_url', 'regrow_job_worker_secret').
--     Without them it is a no-op, so this migration is inert in any environment until configured.
--   * Notification text never contains the buyer's phone number or email (push previews are visible on
--     lock screens).

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================================
-- 1. Notifications (in-app inbox) and delivery attempts
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.notifications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  recipient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type                 TEXT NOT NULL CHECK (type IN ('lead_assigned', 'lead_unassigned')),
  title                TEXT NOT NULL,
  body                 TEXT NOT NULL,
  lead_id              UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  data                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key           TEXT NOT NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at              TIMESTAMPTZ,
  UNIQUE (recipient_profile_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS idx_notifications_inbox ON public.notifications (recipient_profile_id, org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON public.notifications (recipient_profile_id, org_id) WHERE read_at IS NULL;

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id     UUID NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  channel             TEXT NOT NULL CHECK (channel IN ('push', 'whatsapp', 'email')),
  status              TEXT NOT NULL CHECK (status IN ('sent', 'failed', 'skipped')),
  provider_message_id TEXT,
  detail              TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel)
);

-- ============================================================================
-- 2. Durable job queue
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind ~ '^[a-z_]+\.[a-z_]+$'),
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  run_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'dead')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 6 CHECK (max_attempts BETWEEN 1 AND 50),
  locked_until TIMESTAMPTZ,
  last_error   TEXT,
  dedupe_key   TEXT UNIQUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_due ON public.scheduled_jobs (run_at) WHERE status IN ('pending', 'running');

CREATE OR REPLACE FUNCTION public.enqueue_job(
  p_kind TEXT, p_payload JSONB, p_org_id UUID DEFAULT NULL, p_run_at TIMESTAMPTZ DEFAULT now(), p_dedupe_key TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.scheduled_jobs (kind, payload, org_id, run_at, dedupe_key)
  VALUES (p_kind, coalesce(p_payload, '{}'::jsonb), p_org_id, coalesce(p_run_at, now()), p_dedupe_key)
  ON CONFLICT (dedupe_key) DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id; -- NULL when an identical job (same dedupe_key) already exists
END;
$$;

-- Claims due jobs (and jobs whose worker lock expired) without blocking other workers.
CREATE OR REPLACE FUNCTION public.claim_jobs(p_limit INTEGER DEFAULT 20, p_lock_seconds INTEGER DEFAULT 120)
RETURNS SETOF public.scheduled_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.scheduled_jobs j
  SET status = 'running',
      attempts = j.attempts + 1,
      locked_until = now() + make_interval(secs => greatest(p_lock_seconds, 10)),
      updated_at = now()
  WHERE j.id IN (
    SELECT s.id FROM public.scheduled_jobs s
    WHERE s.run_at <= now()
      AND (s.status = 'pending' OR (s.status = 'running' AND s.locked_until < now()))
    ORDER BY s.run_at
    LIMIT least(greatest(p_limit, 1), 100)
    FOR UPDATE SKIP LOCKED
  )
  RETURNING j.*;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_job(p_job_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
  UPDATE public.scheduled_jobs
  SET status = 'done', locked_until = NULL, last_error = NULL, updated_at = now()
  WHERE id = p_job_id AND status = 'running';
$$;

-- Failure: retry with exponential backoff (30 s, 1 m, 2 m, … capped at 30 m) or park as 'dead'.
CREATE OR REPLACE FUNCTION public.fail_job(p_job_id UUID, p_error TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_job public.scheduled_jobs%ROWTYPE;
BEGIN
  SELECT * INTO v_job FROM public.scheduled_jobs WHERE id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_job.status <> 'running' THEN
    RETURN 'ignored';
  END IF;
  IF v_job.attempts >= v_job.max_attempts THEN
    UPDATE public.scheduled_jobs
    SET status = 'dead', locked_until = NULL, last_error = left(p_error, 2000), updated_at = now()
    WHERE id = p_job_id;
    RETURN 'dead';
  END IF;
  UPDATE public.scheduled_jobs
  SET status = 'pending', locked_until = NULL, last_error = left(p_error, 2000),
      run_at = now() + least(make_interval(secs => 30 * power(2, v_job.attempts - 1)), interval '30 minutes'),
      updated_at = now()
  WHERE id = p_job_id;
  RETURN 'retry';
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_job(TEXT, JSONB, UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_jobs(INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_job(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_job(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_job(TEXT, JSONB, UUID, TIMESTAMPTZ, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_jobs(INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_job(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_job(UUID, TEXT) TO service_role;

-- ============================================================================
-- 3. Lead assignment → notification outbox (same transaction)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.notify_lead_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_project TEXT;
  v_actor   UUID := public.auth_profile_id();   -- NULL for service-role / system writes
  v_title   TEXT;
  v_body    TEXT;
  v_notif   UUID;
  v_mgr     RECORD;
  v_routed  BOOLEAN;
BEGIN
  SELECT p.name INTO v_project FROM public.projects p WHERE p.id = NEW.project_id;
  v_body := concat_ws(' · ', coalesce(v_project, 'No project'), replace(NEW.source::text, '_', ' '));

  -- (a) Someone now owns this lead → tell them (unless they assigned it to themselves)
  IF NEW.assigned_to IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
     AND NEW.assigned_to IS DISTINCT FROM v_actor THEN
    v_title := CASE WHEN TG_OP = 'INSERT' THEN 'New lead: ' ELSE 'Lead reassigned to you: ' END || left(NEW.name, 80);
    INSERT INTO public.notifications (org_id, recipient_profile_id, type, title, body, lead_id, data, dedupe_key)
    VALUES (NEW.org_id, NEW.assigned_to, 'lead_assigned', v_title, v_body, NEW.id,
            jsonb_build_object('lead_id', NEW.id, 'project_id', NEW.project_id, 'source', NEW.source),
            'lead_assigned:' || NEW.id || ':' || NEW.assigned_to || ':' || txid_current())
    ON CONFLICT (recipient_profile_id, dedupe_key) DO NOTHING
    RETURNING id INTO v_notif;
    IF v_notif IS NOT NULL THEN
      PERFORM public.enqueue_job('notification.dispatch', jsonb_build_object('notification_id', v_notif), NEW.org_id, now(), 'dispatch:' || v_notif);
    END IF;
  END IF;

  -- (b) A routed organisation could not assign this new lead → tell its managers
  IF TG_OP = 'INSERT' AND NEW.assigned_to IS NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.routing_rules r WHERE r.org_id = NEW.org_id AND r.is_active) INTO v_routed;
    IF v_routed THEN
      FOR v_mgr IN
        SELECT om.profile_id FROM public.org_members om
        WHERE om.org_id = NEW.org_id AND om.status = 'active' AND om.role IN ('owner', 'admin', 'manager')
      LOOP
        INSERT INTO public.notifications (org_id, recipient_profile_id, type, title, body, lead_id, data, dedupe_key)
        VALUES (NEW.org_id, v_mgr.profile_id, 'lead_unassigned', 'Unassigned lead: ' || left(NEW.name, 80), v_body, NEW.id,
                jsonb_build_object('lead_id', NEW.id, 'project_id', NEW.project_id, 'source', NEW.source),
                'lead_unassigned:' || NEW.id)
        ON CONFLICT (recipient_profile_id, dedupe_key) DO NOTHING
        RETURNING id INTO v_notif;
        IF v_notif IS NOT NULL THEN
          PERFORM public.enqueue_job('notification.dispatch', jsonb_build_object('notification_id', v_notif), NEW.org_id, now(), 'dispatch:' || v_notif);
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.notify_lead_assignment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_leads_notify_assignment ON public.leads;
CREATE TRIGGER trg_leads_notify_assignment
  AFTER INSERT OR UPDATE OF assigned_to ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_lead_assignment();

-- ============================================================================
-- 4. Scheduler: pg_cron → pg_net → worker endpoint (inert until Vault secrets exist)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.regrow_invoke_job_worker()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_url FROM vault.decrypted_secrets WHERE name = 'regrow_job_worker_url';
  SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'regrow_job_worker_secret';
  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NULL;                         -- not configured in this environment
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scheduled_jobs WHERE status IN ('pending', 'running') AND run_at <= now()) THEN
    RETURN NULL;                         -- nothing due: do not wake the worker
  END IF;
  RETURN net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
END;
$$;
REVOKE ALL ON FUNCTION public.regrow_invoke_job_worker() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-job-worker';
  PERFORM cron.schedule('regrow-job-worker', '* * * * *', 'SELECT public.regrow_invoke_job_worker()');
END;
$$;

-- ============================================================================
-- 5. Row Level Security & privileges
-- ============================================================================
ALTER TABLE public.notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_jobs          ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.notifications, public.notification_deliveries, public.scheduled_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;   -- marking read is the only client write
GRANT ALL ON public.notifications, public.notification_deliveries, public.scheduled_jobs TO service_role;

CREATE POLICY notifications_select_own ON public.notifications FOR SELECT TO authenticated
  USING (recipient_profile_id = public.auth_profile_id() AND public.auth_is_member_of_org(org_id));
CREATE POLICY notifications_mark_read_own ON public.notifications FOR UPDATE TO authenticated
  USING (recipient_profile_id = public.auth_profile_id() AND public.auth_is_member_of_org(org_id))
  WITH CHECK (recipient_profile_id = public.auth_profile_id());
-- notification_deliveries and scheduled_jobs: no client policies (service role only).

COMMIT;
