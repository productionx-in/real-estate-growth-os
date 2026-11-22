# Environment variables

Set in Vercel → Project → Settings → Environment Variables. **Production** and **Preview** are separate: never put live
payment keys in Preview. Values marked *secret* must be marked Sensitive in Vercel and never appear in code, logs, PRs
or chat. `NEXT_PUBLIC_*` values are public by design (they are built into the browser bundle) — never put a secret in one.

| Variable | Secret | Required | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | | yes | Supabase anon key (RLS applies) |
| `REGROW_SALES_NOTIFY_EMAIL` | | no | Comma-separated addresses that get an e-mail for every website demo/contact request |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | yes | Server-only database access (bypasses RLS) |
| `NEXT_PUBLIC_APP_URL` | | production | Application origin — see `URLS.md` |
| `NEXT_PUBLIC_SITE_URL` | | optional | Marketing origin if different from the app |
| `NEXT_PUBLIC_PRICES_PUBLISHED` | | no | `true` shows prices on the website (only once approved) |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | | optional | REGrow's WhatsApp number with country code (e.g. `919876543210`). Shows "Chat on WhatsApp" in the parrot help bubble on the website and in workspaces; hidden while unset. Redeploy after changing it. |
| `ANTHROPIC_API_KEY` | secret | optional | Rio's AI on Claude (see `docs/design/rio-assistant.md`). Mark Sensitive. |
| `REGROW_MODEL_ANTHROPIC` | | optional | Claude model for Rio; default `claude-opus-5-5` (`REGROW_ASSISTANT_MODEL` also accepted). |
| `OPENAI_API_KEY` | secret | optional | Rio's AI on OpenAI. Needs `REGROW_MODEL_OPENAI`. Mark Sensitive. |
| `REGROW_MODEL_OPENAI` | | with OpenAI | The OpenAI model name to use (no default). |
| `GEMINI_API_KEY` | secret | optional | Rio's AI on Google Gemini. Needs `REGROW_MODEL_GEMINI`. Mark Sensitive. |
| `REGROW_MODEL_GEMINI` | | with Gemini | The Gemini model name to use (no default). |
| `REGROW_ASSISTANT_PROVIDER` | | optional | `anthropic`, `openai` or `gemini`: tried first; other configured providers are fallbacks. Without any key Rio uses its offline answers. |
| `ENCRYPTION_KEY` | secret | yes | Encrypts stored integration credentials |
| `JOB_WORKER_SECRET` | secret | yes | ≥ 32 chars; must equal Vault secret `regrow_job_worker_secret` (`JOB_WORKER_SETUP.md`) |
| `EMAIL_PROVIDER` | | recommended | `resend` (production), `mock` (tests/local) or `none`. Default: `resend` when `RESEND_API_KEY` is set |
| `EMAIL_FROM_ADDRESS` | | yes | Sender address on a domain verified with the provider (e.g. `noreply@yourdomain`) |
| `EMAIL_FROM_NAME` | | no | Sender display name (default `REGrow`) |
| `EMAIL_REPLY_TO` | | no | Where replies to application e-mails go (e.g. your support address) |
| `EMAIL_PROVIDER_TIMEOUT_MS` | | no | How long to wait for the provider before retrying (default 10000) |
| `RESEND_API_KEY` | secret | with Resend | Provider credential. Mark Sensitive |
| `RESEND_FROM_EMAIL`, `RESEND_REPLY_TO` | | legacy | Still read when the `EMAIL_*` names are absent; remove once `EMAIL_*` are set |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | private key secret | for push | Web push notifications |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL`, `KV_REST_API_TOKEN`) | token secret | optional | Rate limiting store; without it the database store is used |
| `REGROW_DEMO_FORM_CONNECTION_ID` | | yes | Website-form connection in REGrow's own workspace (demo/contact form) |
| `META_APP_ID`, `META_APP_SECRET`, `META_API_VERSION`, `META_WEBHOOK_VERIFY_TOKEN` | secret, token | for Meta | The one central Meta app: Lead Ads **and** WhatsApp Cloud API. Webhooks fail closed (503) without the verify token and secret |
| `META_WA_CONFIG_ID` | | for WhatsApp | WhatsApp Embedded Signup configuration id (Facebook Login for Business → Configurations). Public; enables “Connect WhatsApp number” |
| `WHATSAPP_APP_SECRET`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | secret | legacy | Read only when the `META_*` names are absent |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_DEVELOPER_TOKEN`, `GOOGLE_WEBHOOK_KEY`, `GOOGLE_REDIRECT_URI` | secret | for Google | Google Ads lead forms |
| `PAYMENTS_ENVIRONMENT` | | production | `live` on Production, `test` on Preview (keys of the other environment are refused) |
| `RAZORPAY_KEY_ID` | | for payments | `rzp_live_…` on Production |
| `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | secret | for payments | Razorpay API and webhook signatures |
| `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`, `CASHFREE_ENVIRONMENT` | secret key | only when enabling Cashfree | `sandbox` on Preview, `production` on Production (`PAYMENTS_RUNBOOK.md`) |
| `PLATFORM_BOOTSTRAP_SECRET`, `INITIAL_SUPER_ADMIN_*` | secret | **never in Vercel** | Used only once, on the owner's machine, by `scripts/bootstrap-super-admin.mjs` (`PLATFORM_OWNER_SETUP.md`) |

Set automatically by Vercel: `VERCEL_ENV`, `VERCEL_PROJECT_PRODUCTION_URL`, `NODE_ENV`.

## Supabase Auth: links in e-mails (password reset, sign-up, sign-in links)

Set these in the Supabase dashboard (production project). Without them a reset link opens the homepage.

1. **Authentication → URL Configuration**
   - **Site URL**: `https://regrowthos.vercel.app` (the production address, no trailing slash).
   - **Redirect URLs**: add `https://regrowthos.vercel.app/**` (and your custom domain the same way once it is live).
2. **Authentication → Emails → Templates**: paste the HTML from `supabase/templates/` (generated by
   `node scripts/build-auth-email-templates.mjs`) into *Reset password*, *Confirm sign up*, *Magic link* and
   *Change email*, with the subjects in `supabase/config.toml`. These templates link to
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=…`, which works on any device. Supabase's default
   template uses a one-time code that only works in the browser that asked for the e-mail.
3. **Authentication → SMTP**: custom SMTP (Resend) so e-mails reach customers, not only project members.

The app copes with every shape Supabase may send back (`/auth/confirm`, `/auth/callback?code=`, the homepage with
`?code=`, `#access_token=` or `#error_code=`) and explains expired, already-used and other-device links on the
sign-in page (`lib/auth/recovery.ts`).

## Application e-mail (sender, provider, outbox)

All application e-mails (invitations, account and billing e-mails, daily reports, site-visit reminders, demo requests,
payment alerts) go through one outbox (`email_outbox`, `lib/email/service.ts`). The sender is read from the variables
above **when each e-mail is delivered** — never stored with queued e-mails or jobs — so a change applies to everything
still waiting. If the sender or provider is invalid, e-mails are **held** (not lost) and Platform Owners are alerted;
they go out automatically once it is fixed. Status, held/failed counts and a retry button: Platform Admin → E-mail.

**Changing the sender address**

1. Verify the new domain with the provider (Resend → Domains) and wait until it shows *Verified*.
2. Set `EMAIL_FROM_ADDRESS` (and `EMAIL_FROM_NAME` / `EMAIL_REPLY_TO` if they change) for Production in Vercel.
3. Redeploy. Check Platform Admin → E-mail: *Configuration valid*, nothing held.
4. Supabase Auth e-mails are separate — change the sender in Supabase → Authentication → SMTP too if you want the same
   address there.

Supabase Auth e-mails (password reset, sign-up confirmation, magic link, e-mail change) are **not** sent by the app:
Supabase sends them through its own SMTP settings below. Changing `EMAIL_*` does not affect them, and vice versa.

## Checking what is set (owner, from a trusted machine)

```bash
npx vercel@latest env ls production
```
```bash
npx vercel@latest env ls preview
```
Compare against the table. Do not print values (`env pull` writes secrets to disk; delete the file afterwards if used).
