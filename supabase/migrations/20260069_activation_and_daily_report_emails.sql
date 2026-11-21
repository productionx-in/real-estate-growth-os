-- 20260069_activation_and_daily_report_emails.sql — more e-mails to the people who use REGrow:
--   * plan_active     the workspace's paid plan is active (after activation or payment)
--   * member_joined   a team member accepted their invitation: a welcome to them, with their role and first steps
--   * daily_member    8 AM IST: each person's day (their new leads, leads waiting for a first call, follow-ups,
--                     site visits) — lib/jobs/daily-reports.ts
--   * daily_manager   8 AM IST: the team's day for owners, admins and managers
-- profiles.email_daily_report lets each person turn the daily e-mails off (account e-mails always go out).
-- Additive: one CHECK widened, one column with a default, one schedule.

ALTER TABLE public.customer_email_log DROP CONSTRAINT IF EXISTS customer_email_log_kind_check;
ALTER TABLE public.customer_email_log ADD CONSTRAINT customer_email_log_kind_check
  CHECK (kind IN ('welcome', 'trial_ending', 'trial_ended', 'invoice_issued', 'payment_received', 'payment_failed', 'workspace_state',
                  'plan_active', 'member_joined', 'daily_member', 'daily_manager'));

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email_daily_report BOOLEAN NOT NULL DEFAULT true;
COMMENT ON COLUMN public.profiles.email_daily_report IS 'false: no daily report e-mails for this person (set from /account/notifications).';

-- 02:31 UTC = 08:01 IST, every day. The job does nothing while e-mail is not configured.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'regrow-daily-reports';
    PERFORM cron.schedule('regrow-daily-reports', '31 2 * * *',
      $q$SELECT public.enqueue_job('email.daily_reports', '{}'::jsonb, NULL, now(), 'email.daily_reports:' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD'))$q$);
  END IF;
END $$;
