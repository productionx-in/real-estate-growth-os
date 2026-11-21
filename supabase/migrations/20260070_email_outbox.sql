-- 20260070_email_outbox.sql — one outbox for every e-mail the application sends (lib/email/service.ts).
--
-- A row holds WHO (recipient), WHAT (template + payload), WHEN (next_attempt_at) and WHOSE (org_id), never the sender:
-- the sender, reply-to and provider are read from configuration when the e-mail is delivered, so changing them needs
-- no change to queued rows or jobs. Business events enqueue with enqueue_email() — inside their own transaction when
-- they run in SQL (transactional outbox), or right after their write in TypeScript — and a unique idempotency key
-- makes a repeated enqueue a no-op. Delivery (job 'email.deliver') claims rows with SKIP LOCKED, so concurrent
-- workers never take the same row; a claim that outlives its lock (crashed worker) is taken again, and the same
-- idempotency key is sent to the provider so a repeat is not a second e-mail. Failures: transient → retried with
-- exponential backoff; permanent → 'failed'; invalid sender/provider configuration → 'held' (never discarded) and
-- released automatically once the configuration is valid. Server-only: RLS on, no client grants.
-- Additive: nothing existing changes; existing jobs keep working and move onto the outbox in code.

CREATE TABLE IF NOT EXISTS public.email_outbox (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID REFERENCES public.organisations(id) ON DELETE CASCADE,  -- NULL: REGrow's own (website, staff)
  category            TEXT NOT NULL CHECK (category IN ('auth', 'account', 'report', 'buyer', 'sales', 'staff')),
  template            TEXT NOT NULL CHECK (template ~ '^[a-z][a-z0-9_.]{1,80}$'),
  recipient           TEXT NOT NULL CHECK (recipient ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(recipient) <= 320),
  payload             JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key     TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 256),
  status              TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'sent', 'held', 'failed', 'cancelled')),
  attempts            INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts        INTEGER NOT NULL DEFAULT 8 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_until        TIMESTAMPTZ,
  locked_by           TEXT,
  last_error          TEXT,
  last_error_kind     TEXT CHECK (last_error_kind IS NULL OR last_error_kind IN ('transient', 'permanent', 'config', 'skipped')),
  provider            TEXT,
  provider_message_id TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at             TIMESTAMPTZ,
  CONSTRAINT email_outbox_idempotency_key UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_email_outbox_due ON public.email_outbox (next_attempt_at) WHERE status IN ('queued', 'sending');
CREATE INDEX IF NOT EXISTS idx_email_outbox_attention ON public.email_outbox (status, updated_at DESC) WHERE status IN ('held', 'failed');
CREATE INDEX IF NOT EXISTS idx_email_outbox_org ON public.email_outbox (org_id, created_at DESC);

ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;  -- no policies: clients can never read or write it
REVOKE ALL ON public.email_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.email_outbox TO service_role;

-- Wake the delivery job for a moment (one job per minute at most: the key is the minute).
CREATE OR REPLACE FUNCTION public.email_outbox_wake(p_at TIMESTAMPTZ DEFAULT now())
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  PERFORM public.enqueue_job('email.deliver', '{}'::jsonb, NULL, greatest(p_at, now()),
                             'email.deliver:' || to_char(greatest(p_at, now()) AT TIME ZONE 'UTC', 'YYYYMMDDHH24MI'));
END $$;

-- Queue one e-mail. Same key again → the existing row's id, nothing new (safe to call from retries and triggers).
CREATE OR REPLACE FUNCTION public.enqueue_email(p_org UUID, p_category TEXT, p_template TEXT, p_recipient TEXT, p_payload JSONB,
                                                p_idempotency_key TEXT, p_send_after TIMESTAMPTZ DEFAULT now())
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.email_outbox (org_id, category, template, recipient, payload, idempotency_key, next_attempt_at)
  VALUES (p_org, p_category, p_template, lower(btrim(p_recipient)), coalesce(p_payload, '{}'::jsonb), p_idempotency_key, coalesce(p_send_after, now()))
  ON CONFLICT ON CONSTRAINT email_outbox_idempotency_key DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.email_outbox WHERE idempotency_key = p_idempotency_key;
    RETURN v_id;
  END IF;
  PERFORM public.email_outbox_wake(coalesce(p_send_after, now()));
  RETURN v_id;
END $$;

-- Customer account and report e-mails: the event's log row and its outbox rows in ONE transaction, so an event is
-- never recorded without its e-mails (or the other way round). An event already logged (before this migration too)
-- is a no-op: no duplicate sends during the switch-over.
CREATE OR REPLACE FUNCTION public.enqueue_customer_email(p_org UUID, p_kind TEXT, p_event_key TEXT, p_recipients TEXT[],
                                                         p_template TEXT, p_payload JSONB)
RETURNS SETOF UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r TEXT; n INTEGER := coalesce(array_length(p_recipients, 1), 0);
        v_category TEXT := CASE WHEN p_kind LIKE 'daily_%' THEN 'report' ELSE 'account' END;
BEGIN
  INSERT INTO public.customer_email_log (org_id, kind, dedupe_key, recipients, status, detail)
  VALUES (p_org, p_kind, p_event_key, n, CASE WHEN n > 0 THEN 'sent' ELSE 'skipped' END,
          CASE WHEN n > 0 THEN 'queued in email_outbox' ELSE 'no usable e-mail' END)
  ON CONFLICT (dedupe_key) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;                  -- this event was already handled (before or after the switch)
  FOREACH r IN ARRAY coalesce(p_recipients, ARRAY[]::TEXT[]) LOOP
    RETURN NEXT public.enqueue_email(p_org, v_category, p_template, r, p_payload, p_event_key || ':' || lower(btrim(r)));
  END LOOP;
END $$;

-- Claim one row by id, for the immediate first attempt right after a business event (same rules as claim_emails).
CREATE OR REPLACE FUNCTION public.claim_email(p_id UUID, p_worker TEXT, p_lock_seconds INTEGER DEFAULT 120)
RETURNS SETOF public.email_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RETURN QUERY
  UPDATE public.email_outbox o
     SET status = 'sending', attempts = o.attempts + 1, locked_by = p_worker,
         locked_until = now() + make_interval(secs => greatest(p_lock_seconds, 15)), updated_at = now()
   WHERE o.id = (SELECT id FROM public.email_outbox
                  WHERE id = p_id AND ((status = 'queued' AND next_attempt_at <= now()) OR (status = 'sending' AND locked_until < now()))
                  FOR UPDATE SKIP LOCKED)
  RETURNING o.*;
END $$;

-- Take due rows for delivery. Includes rows whose claim expired (a worker that crashed mid-send).
CREATE OR REPLACE FUNCTION public.claim_emails(p_limit INTEGER, p_worker TEXT, p_lock_seconds INTEGER DEFAULT 120)
RETURNS SETOF public.email_outbox LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  RETURN QUERY
  UPDATE public.email_outbox o
     SET status = 'sending', attempts = o.attempts + 1, locked_by = p_worker,
         locked_until = now() + make_interval(secs => greatest(p_lock_seconds, 15)), updated_at = now()
   WHERE o.id IN (
     SELECT id FROM public.email_outbox
      WHERE (status = 'queued' AND next_attempt_at <= now())
         OR (status = 'sending' AND locked_until < now())
      ORDER BY next_attempt_at
      LIMIT greatest(least(p_limit, 100), 1)
      FOR UPDATE SKIP LOCKED)
  RETURNING o.*;
END $$;

-- Delivered. Only the worker holding the claim can record it (a stale worker cannot overwrite a newer outcome).
CREATE OR REPLACE FUNCTION public.complete_email(p_id UUID, p_worker TEXT, p_provider TEXT, p_message_id TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  UPDATE public.email_outbox SET status = 'sent', sent_at = now(), provider = p_provider, provider_message_id = left(p_message_id, 200),
         locked_until = NULL, locked_by = NULL, last_error = NULL, last_error_kind = NULL, updated_at = now()
   WHERE id = p_id AND status = 'sending' AND locked_by = p_worker;
  RETURN FOUND;
END $$;

-- Not delivered. transient → retry with backoff (30 s, 1, 2, 4 … min, capped at 1 h) until max_attempts, then
-- 'failed'; permanent → 'failed'; config → 'held' (the attempt is not counted) and re-checked in 5 minutes;
-- skipped → 'cancelled' (nothing to send any more, e.g. a site visit that was cancelled).
CREATE OR REPLACE FUNCTION public.fail_email(p_id UUID, p_worker TEXT, p_kind TEXT, p_error TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v public.email_outbox; v_status TEXT; v_next TIMESTAMPTZ := now();
BEGIN
  SELECT * INTO v FROM public.email_outbox WHERE id = p_id AND status = 'sending' AND locked_by = p_worker FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_claimed'; END IF;
  IF p_kind = 'config' THEN
    v_status := 'held'; v_next := now() + interval '5 minutes';
  ELSIF p_kind = 'skipped' THEN
    v_status := 'cancelled';
  ELSIF p_kind = 'permanent' OR v.attempts >= v.max_attempts THEN
    v_status := 'failed';
  ELSE
    v_status := 'queued';
    v_next := now() + least(make_interval(secs => 30 * power(2, greatest(v.attempts - 1, 0))), interval '1 hour');
  END IF;
  UPDATE public.email_outbox
     SET status = v_status, next_attempt_at = v_next, locked_until = NULL, locked_by = NULL,
         attempts = CASE WHEN p_kind = 'config' THEN greatest(attempts - 1, 0) ELSE attempts END,
         last_error = left(p_error, 500), last_error_kind = p_kind, updated_at = now()
   WHERE id = p_id;
  IF v_status IN ('queued', 'held') THEN PERFORM public.email_outbox_wake(v_next); END IF;
  RETURN v_status;
END $$;

-- Put held e-mails (configuration was invalid) and, on request, failed ones back in the queue.
CREATE OR REPLACE FUNCTION public.requeue_emails(p_ids UUID[] DEFAULT NULL, p_include_failed BOOLEAN DEFAULT false)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE n INTEGER;
BEGIN
  UPDATE public.email_outbox
     SET status = 'queued', next_attempt_at = now(), attempts = CASE WHEN status = 'failed' THEN 0 ELSE attempts END, updated_at = now()
   WHERE (status = 'held' OR (p_include_failed AND status = 'failed'))
     AND (p_ids IS NULL OR id = ANY (p_ids));
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n > 0 THEN PERFORM public.email_outbox_wake(now()); END IF;
  RETURN n;
END $$;

-- Safety net every 5 minutes: wakes delivery when anything is due, held, or stuck in an expired claim.
CREATE OR REPLACE FUNCTION public.email_outbox_sweep()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.email_outbox
              WHERE (status IN ('queued', 'held') AND next_attempt_at <= now()) OR (status = 'sending' AND locked_until < now())) THEN
    PERFORM public.email_outbox_wake(now());
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.email_outbox_wake(TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_email(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_customer_email(UUID, TEXT, TEXT, TEXT[], TEXT, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_emails(INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_email(UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_email(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_email(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.requeue_emails(UUID[], BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.email_outbox_sweep() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.email_outbox_wake(TIMESTAMPTZ), public.enqueue_email(UUID, TEXT, TEXT, TEXT, JSONB, TEXT, TIMESTAMPTZ),
  public.enqueue_customer_email(UUID, TEXT, TEXT, TEXT[], TEXT, JSONB), public.claim_emails(INTEGER, TEXT, INTEGER), public.claim_email(UUID, TEXT, INTEGER),
  public.complete_email(UUID, TEXT, TEXT, TEXT), public.fail_email(UUID, TEXT, TEXT, TEXT), public.requeue_emails(UUID[], BOOLEAN),
  public.email_outbox_sweep() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-email-outbox';
    PERFORM cron.schedule('regrow-email-outbox', '*/5 * * * *', 'SELECT public.email_outbox_sweep()');
  END IF;
END $$;
