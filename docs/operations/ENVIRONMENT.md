# Environment variables

Set in Vercel → Project → Settings → Environment Variables. **Production** and **Preview** are separate: never put live
payment keys in Preview. Values marked *secret* must be marked Sensitive in Vercel and never appear in code, logs, PRs
or chat. `NEXT_PUBLIC_*` values are public by design (they are built into the browser bundle) — never put a secret in one.

| Variable | Secret | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | | yes | Supabase anon key (RLS applies) |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | yes | Server-only database access (bypasses RLS) |
| `NEXT_PUBLIC_APP_URL` | | production | Application origin — see `URLS.md` |
| `NEXT_PUBLIC_SITE_URL` | | optional | Marketing origin if different from the app |
| `NEXT_PUBLIC_PRICES_PUBLISHED` | | no | `true` shows prices on the website (only once approved) |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | | optional | REGrow's WhatsApp number with country code (e.g. `919876543210`). Shows "Chat on WhatsApp" in the parrot help bubble on the website and in workspaces; hidden while unset. Redeploy after changing it. |
| `ENCRYPTION_KEY` | secret | yes | Encrypts stored integration credentials |
| `JOB_WORKER_SECRET` | secret | yes | ≥ 32 chars; must equal Vault secret `regrow_job_worker_secret` (`JOB_WORKER_SETUP.md`) |
| `RESEND_API_KEY` | secret | yes | Transactional email |
| `RESEND_FROM_EMAIL` | | yes | Sender address on a verified domain |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | private key secret | for push | Web push notifications |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`, `KV_REST_API_TOKEN`) | token secret | optional | Rate limiting store; without it the database store is used |
| `REGROW_DEMO_FORM_CONNECTION_ID` | | yes | Website-form connection in REGrow's own workspace (demo/contact form) |
| `META_APP_ID`, `META_APP_SECRET`, `META_API_VERSION`, `META_WEBHOOK_VERIFY_TOKEN` | secret, token | for Meta | Meta lead ads |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | secret | for WhatsApp | WhatsApp Business |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DEVELOPER_TOKEN`, `GOOGLE_WEBHOOK_KEY`, `GOOGLE_REDIRECT_URI` | secret | for Google | Google Ads lead forms |
| `PAYMENTS_ENVIRONMENT` | | production | `live` on Production, `test` on Preview (keys of the other environment are refused) |
| `RAZORPAY_KEY_ID` | | for payments | `rzp_live_…` on Production |
| `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | secret | for payments | Razorpay API and webhook signatures |
| `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENVIRONMENT` | secret key | only when enabling Cashfree | `sandbox` on Preview, `production` on Production (`PAYMENTS_RUNBOOK.md`) |
| `PLATFORM_BOOTSTRAP_SECRET`, `INITIAL_SUPER_ADMIN_*` | secret | **never in Vercel** | Used only once, on the owner's machine, by `scripts/bootstrap-super-admin.mjs` (`PLATFORM_OWNER_SETUP.md`) |

Set automatically by Vercel: `VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`, `NODE_ENV`.

## Checking what is set (owner, from a trusted machine)

```bash
npx vercel@latest env ls production
```
```bash
npx vercel@latest env ls preview
```
Compare against the table. Do not print values (`env pull` writes secrets to disk; delete the file afterwards if used).
