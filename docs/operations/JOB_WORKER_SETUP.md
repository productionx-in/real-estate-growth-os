# Job worker setup (notifications delivery, reminders, SLA)

Migration `20260039` installs `pg_cron` and `pg_net` and schedules `public.regrow_invoke_job_worker()` every minute.
**It does nothing until the three values below exist.** In-app notifications work without them; only external
delivery (web push, WhatsApp) and future timed jobs (reminders, SLA escalation) need the worker.

## 1. Generate one secret (≥ 32 characters)
```bash
openssl rand -hex 32
```

## 2. Vercel → Project → Settings → Environment Variables (Production)
| Name | Value |
|---|---|
| `JOB_WORKER_SECRET` | the secret from step 1 |

Redeploy so the variable is picked up.

## 3. Supabase → SQL editor (production project) — run once
```sql
select vault.create_secret('https://<production-domain>/api/jobs/run', 'regrow_job_worker_url');
select vault.create_secret('<the same secret as JOB_WORKER_SECRET>', 'regrow_job_worker_secret');
```

## 4. Verify
```sql
-- cron is scheduled
select jobname, schedule, active from cron.job where jobname = 'regrow-job-worker';
-- recent worker calls (status_code 200 = healthy, 401 = secret mismatch, 503 = env var missing)
select id, status_code, created from net._http_response order by created desc limit 5;
-- queue health
select status, count(*) from public.scheduled_jobs group by status;
```

## Rotating the secret
Update `JOB_WORKER_SECRET` in Vercel and redeploy, then:
```sql
select vault.update_secret((select id from vault.secrets where name = 'regrow_job_worker_secret'), '<new secret>');
```

## Behaviour
- The worker claims due jobs with `FOR UPDATE SKIP LOCKED`; overlapping invocations never process the same job.
- Failures retry with exponential backoff (30 s → 30 min cap) and become `dead` after `max_attempts` (default 6).
- The worker is woken only when a job is due, so idle minutes cost nothing.
