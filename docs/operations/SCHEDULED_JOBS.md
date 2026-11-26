# Scheduled jobs and monitoring

Jobs run inside the production database (`pg_cron`, installed by the migrations). Some call the app's job worker over
HTTPS (`/api/jobs/run`), which needs the setup in `JOB_WORKER_SETUP.md`.

| Job | Schedule (UTC) | Does |
|---|---|---|
| `regrow-job-worker` | every minute | Wakes the app's worker when a queued job is due: notification delivery, site-visit messages, payment jobs |
| `regrow-lead-responses` | every minute | First-response timers and nudges for new leads |
| `regrow-billing-periods` | every 15 min | Ends expired trials and periods, applies billing holds and grace |
| `regrow-payments-poll` | every 10 min | Confirms pending checkouts with the gateway, polls submitted refunds, retries failed signed webhooks |
| `regrow-payments-health` | every 5 min | Checks each enabled gateway's API, then raises or resolves payment alerts (e-mailed to the Platform Owner and finance) |
| `regrow-payments-reconcile` | 21:30 daily (03:00 IST) | Compares gateway settlements with RE by PX's records |
| `regrow-payments-mandates` | hourly at :07 | UPI AutoPay cycles. Does nothing while recurring payments are disabled. |

## Health check (read-only, Supabase SQL editor)

```sql
-- every job is scheduled and active
select jobname, schedule, active from cron.job order by jobname;
```

```sql
-- recent failures of the database jobs
select j.jobname, d.status, d.return_message, d.start_time
from cron.job_run_details d join cron.job j on j.jobid = d.jobid
where d.status <> 'succeeded' order by d.start_time desc limit 20;
```

```sql
-- the worker's HTTP calls (200 healthy; 401 secret mismatch; 503 env var missing)
select status_code, created from net._http_response order by created desc limit 10;
```

```sql
-- queue: anything 'dead' needs looking at
select kind, status, count(*) from public.scheduled_jobs group by 1, 2 order by 1, 2;
```

```sql
-- open payment alerts
select kind, scope, detail, opened_at from public.payment_alerts where resolved_at is null;
```

## What alerts you today

- **Payment problems.** E-mailed automatically (`PAYMENTS_RUNBOOK.md` §7a).
- **Everything else.** Nothing pages anyone yet. Until an uptime monitor is added, run the checks above weekly. A
  simple external uptime check on `/login` (any uptime service) is the cheapest next step. It needs an account the
  owner chooses.
