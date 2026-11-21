-- 20260068_customer_lifecycle_emails.sql — e-mails to customers about their account: workspace ready, trial ending
-- and ended, invoice issued, payment received or failed, workspace suspended / deactivated / restored.
-- An hourly job (lib/jobs/customer-emails.ts) finds what happened and e-mails each workspace's owners and admins.
-- customer_email_log records every e-mail so the same one is never sent twice (unique dedupe_key). It holds no
-- message text or addresses, only what was sent and how many people got it. Server-only: no client access.
-- Additive: nothing existing changes.

CREATE TABLE IF NOT EXISTS public.customer_email_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID REFERENCES public.organisations(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('welcome', 'trial_ending', 'trial_ended', 'invoice_issued', 'payment_received',
                                            'payment_failed', 'workspace_state')),
  dedupe_key  TEXT NOT NULL UNIQUE,
  recipients  INTEGER NOT NULL DEFAULT 0 CHECK (recipients >= 0),
  status      TEXT NOT NULL CHECK (status IN ('sent', 'partial', 'skipped')),
  detail      TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_email_log_org ON public.customer_email_log (org_id, created_at DESC);

ALTER TABLE public.customer_email_log ENABLE ROW LEVEL SECURITY;
-- No policies: nobody but the service role (which bypasses RLS) can read or write it.
REVOKE ALL ON public.customer_email_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_email_log TO service_role;

-- Hourly, at minute 13. The job does nothing (and records nothing) while e-mail is not configured.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-customer-emails';
    PERFORM cron.schedule('regrow-customer-emails', '13 * * * *',
      $q$SELECT public.enqueue_job('email.customer_lifecycle', '{}'::jsonb, NULL, now(), 'email.customer_lifecycle:' || to_char(now(), 'YYYYMMDDHH24'))$q$);
  END IF;
END $$;
