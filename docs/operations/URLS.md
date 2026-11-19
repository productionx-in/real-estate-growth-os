# REGrow URLs, domains and the domain-change checklist

All absolute URLs come from `lib/site/urls.ts`. No domain is written in the code (`tests/site-urls.test.mjs` fails if
one is added). Moving REGrow to its production domain is a configuration change in four places, listed below.

## 1. How the code builds URLs

| Variable | Used for | If unset |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Marketing site: canonical URLs, sitemap, robots `Host`, Open Graph, structured data, `/llms.txt` | The app URL (today both are served by one deployment) |
| `NEXT_PUBLIC_APP_URL` | Application: invitation links, Google/Meta OAuth callbacks, payment return/notify URLs, push links, embed snippets, webhook URLs shown to customers, API examples | `VERCEL_PROJECT_PRODUCTION_URL` (set by Vercel), then the request's own origin |
| `GOOGLE_REDIRECT_URI` | Overrides the Google OAuth callback | `<app URL>/api/integrations/google/callback` |

Since this change, invitation links and OAuth callbacks no longer follow the request's `Host` header: a preview
deployment or an alternate host cannot produce links or `redirect_uri`s that differ from the registered ones.

**Current production values cannot be read from this environment** (the automation account sees the Vercel team but
not its projects, and outbound HTTPS to the site is blocked). Confirm them with the checklist below.

## 2. Domain-change checklist (do in this order; needs the owner — nothing here is changed automatically)

Replace `app.example.in` / `www.example.in` with the real hosts. If the marketing site and the app share one host,
use the same value for both.

### Vercel (Project → Settings)
1. **Domains:** add the production domain(s); make the canonical one primary and redirect the others to it
   (e.g. apex → `www`, or the reverse). Wait for the certificate.
2. **Environment Variables → Production:** set `NEXT_PUBLIC_APP_URL=https://app.example.in` and
   `NEXT_PUBLIC_SITE_URL=https://www.example.in` (no trailing slash). Leave Preview without them, so previews keep
   their own URLs.
3. Redeploy production (Deployments → … → Redeploy) — `NEXT_PUBLIC_*` values are built into the bundle.

### Supabase (Authentication → URL Configuration)
4. **Site URL:** `https://app.example.in`.
5. **Redirect URLs:** `https://app.example.in/auth/callback`, `https://app.example.in/**` (and, only if previews must
   sign in, the preview pattern `https://*-productionx.vercel.app/**`).
6. **Email templates** (Authentication → Email Templates): regenerate with `node scripts/build-auth-email-templates.mjs`
   if their links or branding mention a host.

### Third parties (each console lists exact redirect / webhook URLs)
7. **Google Cloud** OAuth client → Authorised redirect URI: `https://app.example.in/api/integrations/google/callback`.
8. **Meta** app → Facebook Login → Valid OAuth Redirect URIs: `https://app.example.in/api/integrations/meta/callback`;
   Webhooks: `https://app.example.in/api/webhooks/meta` (and WhatsApp: `/api/webhooks/whatsapp`).
9. **Razorpay** dashboard → Webhooks: `https://app.example.in/api/webhooks/razorpay` (same secret as today).
10. **Cashfree** (only when enabling it): webhook `https://app.example.in/api/webhooks/cashfree`; return URLs are built
    by the code from `NEXT_PUBLIC_APP_URL`.
11. **Resend:** verify the sending domain (SPF, DKIM, DMARC) and set `RESEND_FROM_EMAIL` to an address on it.
12. **Customers' websites:** embed snippets copied before the change point at the old host — keep the old host
    redirecting (301) to the new one for at least 90 days.

### Search engines
13. Google Search Console and Bing Webmaster Tools: verify the domain (DNS TXT), submit `https://www.example.in/sitemap.xml`.

### Verify (from any machine)
```bash
curl -sI https://www.example.in/ | grep -i -E 'HTTP/|location'
```
```bash
curl -s https://www.example.in/robots.txt
```
```bash
curl -s https://www.example.in/sitemap.xml | grep -o '<loc>[^<]*' | head
```
```bash
curl -s https://www.example.in/ | grep -o '<link rel="canonical"[^>]*>'
```
```bash
curl -sI https://app.example.in/select-org | grep -i x-robots-tag
```
Then: send yourself a workspace invitation and check the link host; run "Forgot password" and check the link host;
connect a test Meta/Google account from Integrations (no `redirect_uri_mismatch`).

## 3. Routes

| Purpose | Route |
|---|---|
| Marketing pages | `/`, `/features`, `/real-estate-crm`, `/inventory-management`, `/sales-operations`, `/site-visits-and-bookings`, `/channel-partner-management`, `/sales-analytics`, `/integrations`, `/developers`, `/agencies`, `/migration`, `/resources/…`, `/pricing`, `/demo`, `/leakage-audit` (`lib/marketing/site-pages.ts`) |
| Legal and company | `/privacy`, `/terms`, `/refund-policy`, `/contact` (noindex until `LEGAL.confirmed`) |
| Sign in | `/login?for=developer|agency|staff` |
| Password reset | email link → `/auth/callback?next=/reset-password` → `/reset-password` |
| Accept an invitation | `/invite/<token>` |
| Staff console | `/platform` (MFA required) |
| Self-service sign-up | not live (`ROUTES.signup` is `null` until approved) |
| Buyer project showroom | `/p/<slug>` (published microsites only) |
| Document shared with a buyer | `/d/<token>` |
| Website form embed | `<app>/forms/embed.js`, iframe `<app>/forms/view?connectionId=…`, posts to `/api/forms/submit` |
| Lead webhooks | `/api/webhooks/{meta,google,whatsapp,portals,inbound}/…` |
| Payment webhooks | `/api/webhooks/razorpay`, `/api/webhooks/cashfree` |
| Payment return (redirect flows) | `/api/billing/payments/return?provider=…&order_id=…` |
| Customer API | `/api/v1/{leads,projects,inventory}` |
| SEO / AI files | `/robots.txt`, `/sitemap.xml`, `/llms.txt` |

Only marketing pages, confirmed legal pages and published showrooms are indexable; every other response carries
`X-Robots-Tag: noindex, nofollow` (`proxy.ts`).
