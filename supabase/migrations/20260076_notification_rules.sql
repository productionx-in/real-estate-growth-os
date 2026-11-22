-- 20260076_notification_rules.sql
-- Who gets which alert, and a weekly digest:
--   * profiles.notification_prefs: each person's push choices per alert type and quiet hours (India time), checked by
--     lib/notifications/prefs.ts. Only the push alert is affected; the in-app inbox always gets every notification.
--   * org_settings.notifications: the workspace's defaults for the same choices (owners and admins).
--   * profiles.email_weekly_digest + a Monday 08:13 IST job (email.weekly_digest) for owners, admins and managers.
-- The customer e-mail log and outbox learn the new kind ('weekly_manager', a report e-mail like the daily ones).
-- Additive only.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(notification_prefs) = 'object' AND pg_column_size(notification_prefs) < 4096),
  ADD COLUMN IF NOT EXISTS email_weekly_digest BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN public.profiles.notification_prefs IS 'Push alert choices and quiet hours (Settings → My notifications).';
COMMENT ON COLUMN public.profiles.email_weekly_digest IS 'false: no Monday digest e-mail for this person.';

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS notifications JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(notifications) = 'object' AND pg_column_size(notifications) < 4096);

ALTER TABLE public.customer_email_log DROP CONSTRAINT IF EXISTS customer_email_log_kind_check;
ALTER TABLE public.customer_email_log ADD CONSTRAINT customer_email_log_kind_check
  CHECK (kind IN ('welcome', 'trial_ending', 'trial_ended', 'invoice_issued', 'payment_received', 'payment_failed', 'workspace_state',
                  'plan_active', 'member_joined', 'daily_member', 'daily_manager', 'weekly_manager'));

-- Same as 20260070, with weekly e-mails counted as report e-mails (not account e-mails).
CREATE OR REPLACE FUNCTION public.enqueue_customer_email(p_org UUID, p_kind TEXT, p_event_key TEXT, p_recipients TEXT[],
                                                         p_template TEXT, p_payload JSONB)
RETURNS SETOF UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE r TEXT; n INTEGER := coalesce(array_length(p_recipients, 1), 0);
        v_category TEXT := CASE WHEN p_kind LIKE 'daily_%' OR p_kind LIKE 'weekly_%' THEN 'report' ELSE 'account' END;
BEGIN
  INSERT INTO public.customer_email_log (org_id, kind, dedupe_key, recipients, status, detail)
  VALUES (p_org, p_kind, p_event_key, n, CASE WHEN n > 0 THEN 'sent' ELSE 'skipped' END,
          CASE WHEN n > 0 THEN 'queued in email_outbox' ELSE 'no usable e-mail' END)
  ON CONFLICT (dedupe_key) DO NOTHING;
  IF NOT FOUND THEN RETURN; END IF;
  FOREACH r IN ARRAY coalesce(p_recipients, ARRAY[]::TEXT[]) LOOP
    RETURN NEXT public.enqueue_email(p_org, v_category, p_template, r, p_payload, p_event_key || ':' || lower(btrim(r)));
  END LOOP;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-weekly-digest';
    PERFORM cron.schedule('regrow-weekly-digest', '43 2 * * 1',
      $q$SELECT public.enqueue_job('email.weekly_digest', '{}'::jsonb, NULL, now(), 'email.weekly_digest:' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'IYYY-IW'))$q$);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.enqueue_customer_email(UUID, TEXT, TEXT, TEXT[], TEXT, JSONB) FROM PUBLIC, anon, authenticated;

COMMIT;
