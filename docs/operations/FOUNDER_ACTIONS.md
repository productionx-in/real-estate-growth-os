# What needs the founder — checklist

Everything here needs your accounts, a legal or business identity, or a production decision. Development does
not wait on any of it: each integration is built, tested and shows customers a clear "not set up yet" state
until its settings exist.

**How to set a value:** Vercel → project → Settings → Environment Variables → *Production* (and *Preview* with
test values), marked **Sensitive** for secrets, then redeploy. **Never paste a value into chat, a PR, an issue
or a document.** After a redeploy, *Platform console → Integrations* shows a yes/no for every setting below
(never the value), so you can check your work there.

The production address is **https://re.productionx.in** (live). URLs below use it.

---

## 1. Platform (do first)

- [ ] `ENCRYPTION_KEY` — a long random value (e.g. `openssl rand -base64 32`). Set it **once, before the first
      customer connects anything**, and never change it: stored tokens encrypted with another key cannot be read.
      Keep an offline copy in your password manager.
- [ ] `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_SITE_URL` = `https://re.productionx.in` (Production). Canonical URLs,
      Open Graph, e-mail links and Meta/Google redirect URLs are built from them.
- [ ] Supabase → Authentication → URL configuration: Site URL `https://re.productionx.in`, Redirect URLs
      `https://re.productionx.in/**` (keep the old address too until nobody uses it).
- [x] Contact address: re@productionx.in (support, sales and privacy; shown on Contact, Privacy and the chat assistant).
- [ ] Verify productionx.in as the sending domain in Resend (section 5); replies go to re@productionx.in.
- [ ] Weekly database backup: add GitHub secrets `SUPABASE_DB_URL` (Session pooler string) and `BACKUP_PASSPHRASE`,
      then run Actions → Database backup once (see `BACKUP_RECOVERY.md`).
- [ ] Confirm every *required* row in `ENVIRONMENT.md` (Supabase URL and keys, etc.) is set for Production.

## 2. Meta Lead Ads (Facebook & Instagram)

One central RE app at developers.facebook.com, owned by Production X's business portfolio.

- [ ] Business verification of the business portfolio that owns the app (legal name, address, documents).
- [ ] Create the app (type *Business*); add **Facebook Login for Business** and **Webhooks**.
- [ ] Facebook Login → Valid OAuth redirect URI: `https://re.productionx.in/api/integrations/meta/callback`
- [ ] Webhooks → **Page** → callback `https://re.productionx.in/api/webhooks/meta`, subscribe to **leadgen**; the verify token is
      the value you choose for `META_WEBHOOK_VERIFY_TOKEN`.
- [ ] App Review (screencast of the Connect flow — a demo workspace is ready for it): `pages_show_list`,
      `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`, `leads_retrieval`, `ads_read`,
      `ads_management`.
- [ ] Privacy policy URL, terms URL, data-deletion instructions URL and app icon in App settings → Basic
      (pages exist: `/privacy`, `/terms`; see `LEGAL_PUBLICATION.md`).
- [ ] Set in Vercel: `META_APP_ID`, `META_APP_SECRET` (secret), `META_WEBHOOK_VERIFY_TOKEN` (secret, any long
      random string), optional `META_API_VERSION` (defaults to v21.0).
- [ ] Switch the app to **Live** after review.

## 3. WhatsApp Cloud API (Embedded Signup)

Same Meta app as above.

- [ ] Add the **WhatsApp** product and apply to become a **Tech Provider** (needs business verification).
- [ ] Facebook Login for Business → Configurations → create a **WhatsApp Embedded Signup** configuration; copy its ID.
- [ ] App settings → Allowed domains for the JavaScript SDK: the production domain.
- [ ] Webhooks → **WhatsApp Business Account** → callback `https://re.productionx.in/api/webhooks/whatsapp`, subscribe to
      **messages** (same verify token).
- [ ] App Review: `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management`.
- [ ] Set in Vercel: `META_WA_CONFIG_ID`.
- [ ] Payment method on the Meta business account for conversation charges (customers can also bring their own).

## 4. Google Ads lead forms

- [ ] Google Cloud project owned by Production X: OAuth consent screen (External), with app name, logo, privacy and terms
      URLs and authorised domain; submit for **verification** (Google Ads scope is sensitive).
- [ ] Credentials → OAuth client (*Web application*), redirect URI `https://re.productionx.in/api/integrations/google/callback`.
- [ ] Google Ads **manager account** → API Center → apply for a **Basic access** developer token (describe RE
      as a lead-management tool reading lead-form submissions).
- [ ] Set in Vercel: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (secret), `GOOGLE_DEVELOPER_TOKEN` (secret);
      optional `GOOGLE_WEBHOOK_KEY`, `GOOGLE_REDIRECT_URI` (only if it differs from the one above).

## 5. Email (sending from RE and from customers' own domains)

- [ ] Resend account owned by Production X; verify RE’s sending domain there (DNS records at your registrar).
- [ ] Create a **production API key** with sending + domain access (customers' own domains are registered through
      it from *Integrations → Email domain*).
- [ ] Set in Vercel: `RESEND_API_KEY` (secret), `EMAIL_PROVIDER=resend`, `EMAIL_FROM_ADDRESS` (on the verified
      domain), optional `EMAIL_FROM_NAME`, `EMAIL_REPLY_TO`. Details: `EMAIL_SETUP.md`.

## 6. Optional services (turn on when wanted)

- [ ] **Rio AI assistant** — Anthropic console: create a production API key with a monthly spend limit; set
      `ANTHROPIC_API_KEY` (secret). Without it Rio answers from built-in help only.
- [ ] **Push notifications** — generate a VAPID key pair (`npx web-push generate-vapid-keys`); set
      `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` (secret), `VAPID_SUBJECT` (`mailto:` support address).
- [ ] **Online payments** — Cashfree merchant account (KYC); set `CASHFREE_APP_ID`, `CASHFREE_SECRET_KEY`
      (secret), `CASHFREE_ENVIRONMENT` (`sandbox` on Preview, `production` on Production). See `PAYMENTS_RUNBOOK.md`.

## 7. Per customer (with the customer, not in Vercel)

- [ ] Property portals (99acres, MagicBricks, Housing): the customer's portal account manager turns on lead push to
      the workspace's webhook URL shown in *Integrations*.
- [ ] Customer website and email domains: the customer adds the DNS records RE shows them; RE checks them
      automatically.

## 8. Decisions and approvals

- [ ] **Task #53 — customers hiding modules:** approve the recommendation in
      `docs/product/MODULE_VISIBILITY_RECOMMENDATION.md` (option A, owner + admin), or choose another option.
- [ ] Legal: final privacy policy, terms and data-processing agreement text reviewed by counsel
      (`LEGAL_PUBLICATION.md`); GST/invoice details for billing.
- [ ] Production merges and migrations continue under your standing approval; anything touching domains, DNS,
      authentication settings or payments waits for you.

## After you finish a section

Tell me "Meta is configured" (or similar) — no values — and I will verify end to end from the Platform console
readiness page and a test connection in a demo workspace.
