# REGrow URLs and domains

All absolute URLs come from `lib/site/urls.ts`. No domain is written in the code (`tests/site-urls.test.mjs` fails if
one is added). To move REGrow to a new domain, change configuration only.

## Configuration (set in the hosting environment, per environment)

| Variable | Used for | If unset |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Marketing site: canonical URLs, sitemap, robots `Host`, Open Graph | Falls back to the app URL (today both are served by the same deployment) |
| `NEXT_PUBLIC_APP_URL` | Application: invitation and reset links, push-notification links, embed snippets, webhook URLs shown to customers, API examples | `VERCEL_PROJECT_PRODUCTION_URL` (set by Vercel), then the request's own origin |
| Supabase Auth → Site URL and Redirect URLs | Email confirmation, password reset and invitation sign-in links | Must list the app domain and `/auth/callback` (set in the Supabase dashboard; `supabase/config.toml` only covers local development) |

**Current production values could not be read from this repository or with the available access** (the Vercel
project's settings are not visible to the automation account). Confirm them in Vercel → Project → Settings → Domains
and Environment Variables, and in Supabase → Authentication → URL Configuration.

## Routes

| Purpose | Route |
|---|---|
| Home, pricing, demo, lead-leakage audit | `/`, `/pricing`, `/demo`, `/leakage-audit` |
| Privacy Policy, Terms | `/privacy`, `/terms` |
| Sign in | `/login` |
| Password reset | email link → `/auth/callback?next=/reset-password` → `/reset-password` |
| Accept an invitation | `/invite/<token>` |
| Self-service sign-up | not live (`ROUTES.signup` is `null` until approved) |
| Buyer project showroom | `/p/<slug>` (published microsites only) |
| Document shared with a buyer | `/d/<token>` |
| Website form embed | `<app>/forms/embed.js`, iframe `<app>/forms/view?connectionId=…`, posts to `/api/forms/submit` |
| Website capture script | `<app>/capture.js` |
| Lead webhooks | `/api/webhooks/{meta,google,whatsapp,portals,inbound}/…`; payments `/api/webhooks/razorpay` |
| Customer API | `/api/v1/{leads,projects,inventory}` |
| WhatsApp from the app | `https://wa.me/<buyer number>` (QuickContact; documents prefill a message with the document link) |
| SEO files | `/robots.txt`, `/sitemap.xml` (generated from `lib/site/urls.ts`) |

Only marketing pages and published showrooms are indexable; every other response carries
`X-Robots-Tag: noindex, nofollow` (`proxy.ts`).
