# Security overview

How RE by PX protects customer data, and what the owner must keep up. The design rules are in `CLAUDE.md`
("Non-negotiables"); this file is the operating view.

## Controls in place (enforced in code and tested)

- **Tenant isolation.** Every table has row-level security, and every query is scoped to the caller's organisation.
  Cross-tenant tests run in CI: `tests/db-integration/*`, with a clean reset of every migration on each run.
- **Server-side authorisation.** Every protected action is checked on the server (`lib/auth/tenant.ts`,
  `lib/auth/permissions.ts`, `lib/auth/platform.ts`). The UI only hides what the server already refuses.
- **Staff.** Staff never read customer business data. The console requires an authenticator (AAL2) on every screen,
  and every role is checked again by the database functions. Customer data is reachable only through a
  customer-approved, time-limited, audited support grant. There is no impersonation.
- **Audit trails.**
  - `platform_audit_logs` covers staff actions. It is append-only (database trigger).
  - `org_audit_logs` covers customer actions and is visible to each customer. It is also append-only.
- **Secrets.**
  - Secrets are held only in Vercel environment variables (marked Sensitive) and Supabase Vault, never in code.
  - Integration credentials are encrypted with `ENCRYPTION_KEY`.
  - Payment card and UPI details are handled by the gateway, never by RE by PX.
- **Webhooks.** Payment and lead webhooks are verified by signature, deduplicated and rate-limited.
- **Passwords and redirects.** Passwords follow `lib/auth/password-policy.ts`, and post-sign-in redirects go through
  `safeRedirectPath`.
- **E-mail to test domains.** Addresses on reserved test domains such as `example.test` are never sent mail.

## Owner responsibilities

| When | Do |
|---|---|
| Before launch | Set up the Platform Owner (`PLATFORM_OWNER_SETUP.md`). Check Supabase Auth URL settings (`URLS.md`). Confirm the backup plan (`BACKUP_RECOVERY.md`). |
| Every merge | Merging to `main` deploys and migrates production. Review the PR and check production read-only before and after. |
| Monthly | Run Supabase → Advisors (security and performance) and fix anything marked ERROR. Review payment alerts. |
| Quarterly | Review staff access (`STAFF_ONBOARDING.md`). Rotate `JOB_WORKER_SECRET` (`JOB_WORKER_SETUP.md`) and any key that has been shared. Check the GitHub Dependabot alerts on the default branch. |
| On departure | Deactivate the staff member the same day, and rotate any secret they could see. |

## Rotating a secret

1. Create the new value at the provider.
2. Update it in Vercel (Production, then Preview) and redeploy.
3. Revoke the old value.

For the Supabase service role key, rotate it in Supabase → Project settings → API, then update Vercel immediately. Every
server request fails until the new key is deployed, so do it at a quiet time.

## Reporting a vulnerability

Until a public security contact is published (`lib/legal.ts`), reports go to the owner directly. Handle them as an
incident (`INCIDENT_RESPONSE.md`).
