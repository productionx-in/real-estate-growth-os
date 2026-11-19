# Incident response

An incident is anything that stops customers working, loses or exposes data, or takes or refunds money wrongly.

## First 30 minutes

1. **Decide the severity.**

   | Severity | Means |
   |---|---|
   | Sev 1 | Data exposed to the wrong customer or person, money taken wrongly, or everyone down |
   | Sev 2 | A core feature down for many customers (sign-in, leads, payments) |
   | Sev 3 | Degraded, or one customer affected |

2. **Start a log** — a private document with times, what was seen and what was done.
3. **Contain the problem.**
   - **Bad deploy.** In Vercel, promote the previous deployment.
   - **Payment gateway failing.** Platform Admin → Payments shows the alert. There is no automatic failover. Switch the
     primary gateway only if the other one is enabled and the outage is long, and record a verified outage so affected
     customers get grace days. See `PAYMENTS_RUNBOOK.md` §7.
   - **Suspected leaked secret.** Rotate it now (`SECURITY.md`), before investigating.
   - **Suspected access by the wrong person.** Deactivate the staff account, or revoke the support grant in Platform
     Admin → Organisations.
   - **Data exposure.** Stop the leak first, for example by rolling back the deploy. Do not delete evidence: the audit
     logs are append-only for this reason.

## Investigate

- **Platform Admin → Audit log** for staff actions. Each customer's audit log covers their members' actions.
- **Vercel → Logs** and **Supabase → Logs** (API, Postgres, Auth) for errors around the time.
- **Payments:** the webhook events and reconciliation pages in Platform Admin → Payments, and the gateway dashboards.
- **Scheduled jobs:** see `SCHEDULED_JOBS.md`.

## Tell people

- For customers affected by a Sev 1 or 2, tell them what happened, what data or money was involved, and what was done.
  Be plain and prompt.
- For a personal-data breach, India's DPDP Act 2023 requires notifying the Data Protection Board and the affected
  people. Agree the wording and timing with your legal adviser, and record when each notice was sent.
- Payment incidents may also need reporting to the gateway.

## Afterwards

Within a week, write a short review covering timeline, cause, impact, what worked, and what changes so it can't
recur. Track each fix as a PR with a test that would have caught it.
