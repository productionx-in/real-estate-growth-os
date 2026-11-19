# Payments runbook — Razorpay preserved, Cashfree ready for validation, UPI AutoPay off

Applies to migration `20260060_payment_providers.sql` and `lib/payments/*`. Design: `docs/design/payment-provider-migration.md`.
Nothing in this document has been done in production. Every production step below needs the founder's separate approval.

## 1. What exists

| Area | Where | State after deploy (no configuration change) |
|---|---|---|
| Provider-independent adapter | `lib/payments/types.ts`, `registry.ts`, `service.ts` | Active; Razorpay is the primary (as today) |
| Razorpay | `lib/payments/razorpay/adapter.ts` (wraps the unchanged `lib/billing/razorpay.ts`) | Works exactly as before; same env vars, same webhook URL |
| Cashfree | `lib/payments/cashfree/adapter.ts` | Built; **disabled** in both environments; never used until enabled |
| Payment attempts, webhook events, unapplied money | migration 20260060 | Recorded for every checkout and event |
| Refunds with approvals, credit notes | `payment_refunds`, `payment_refund_approvals`, `credit_notes` | Available in Platform Admin → Payments |
| Disputes | `payment_disputes` | Recorded from webhooks |
| Reconciliation | `payment_settlements`, `payment_reconciliation_*`; job daily 03:00 IST | Runs for every non-disabled provider with credentials |
| Health | `payment_gateway_health_checks`; job every 5 min | Shown in Platform Admin |
| Verified outages | `payment_provider_outages`; 3 extra days | Platform Owner records them |
| GST configuration | `billing_settings` (rate 18%, SAC, supplier GSTIN/state), `org_billing_profiles` | Same 18% as today; CGST/SGST/IGST split appears once supplier and customer states are set |
| UPI AutoPay mandates | `payment_mandates`, `payment_mandate_charges`; job hourly | **Disabled** (`recurring_payments_enabled = false`) |

Roles (platform staff): **Platform Owner = `super_admin`** — gateway status, primary gateway, verified outages, webhook
re-processing. **Finance admin** — refund requests and approvals (never their own), reconciliation. **Auditor** — read.
Sales and support have no access to payments.

## 2. Merchant onboarding (Cashfree) — what the business must provide

1. Cashfree merchant account (Payment Gateway), KYC: business PAN, GST certificate, certificate of incorporation, bank
   account in the company's name (cancelled cheque), authorised signatory ID and address proof, business address proof.
2. Website requirements Cashfree checks: Privacy Policy, Terms, **Refund & Cancellation Policy** and **Contact page**
   (the last two do not exist yet), pricing information, business name matching the registered entity.
3. Commercial confirmation: transaction rates (UPI, cards, net banking), settlement cycle, refund fees.
4. UPI AutoPay (Subscriptions product) activation is a separate approval on the Cashfree account.
5. Sandbox: create test keys in the Cashfree merchant dashboard (Developers → API keys, Test mode).

## 3. Secure configuration (never in the repository, never in the browser)

Set in Vercel (Project → Settings → Environment Variables), **Production** and **Preview** separately:

| Variable | Value | Notes |
|---|---|---|
| `PAYMENTS_ENVIRONMENT` | `test` on Preview, `live` on Production | Keys of the other environment are refused by the code |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | unchanged | Keep as they are |
| `CASHFREE_APP_ID` | from Cashfree dashboard | |
| `CASHFREE_SECRET_KEY` | from Cashfree dashboard | Also signs Cashfree webhooks; mark as Sensitive |
| `CASHFREE_ENVIRONMENT` | `sandbox` (Preview) / `production` (Production) | |
| `NEXT_PUBLIC_APP_URL` | the confirmed app domain | Return and notify URLs are built from it |

Webhook URLs to register in each provider dashboard (on the confirmed production domain):
- Razorpay: `https://<app domain>/api/webhooks/razorpay` (unchanged). Events: payment.captured, payment.failed, order.paid,
  refund.processed, refund.failed, payment.dispute.* .
- Cashfree: `https://<app domain>/api/webhooks/cashfree`. Events: payment success/failed/user dropped, refund status,
  dispute created/updated/closed, subscription status changed, subscription payment success/failed.

## 4. Validation gate — Cashfree before it can take a real payment

Run on a Preview deployment with sandbox keys and `PAYMENTS_ENVIRONMENT=test`, against a staging Supabase project:

| # | Check | How |
|---|---|---|
| 1 | Order created for the invoice amount | Pay a test invoice from Plan & billing |
| 2 | UPI success, card success, net banking success | Cashfree test instruments |
| 3 | Failed payment, user-dropped payment | Test instruments that fail |
| 4 | Pending then delayed success | UPI collect left pending, then completed; confirm the poller settles it |
| 5 | Duplicate webhook | Resend the event from the dashboard; one payment only |
| 6 | Invalid signature | `curl` with a wrong signature → 401, recorded |
| 7 | Second payment for a paid invoice | Shows under Unapplied money |
| 8 | Refund ≤ ₹10,000 (one approver) and > ₹10,000 (two) | Platform Admin → Payments |
| 9 | Refund failure path | Cashfree test refund failure |
| 10 | Settlement reconciliation | "Reconcile cashfree" after a test settlement |
| 11 | Dispute | Cashfree test dispute, if available in sandbox |
| 12 | Outage behaviour | Wrong `CASHFREE_SECRET_KEY` on a preview → checkout refuses, health shows failing, nothing activates |
| 13 | Recorded responses | Replace `tests/fixtures/cashfree.mjs` shapes with the recorded sandbox payloads and re-run `npm test` + p22 |

When all pass: Platform Owner sets Cashfree **test** to `sandbox_validated`.

## 5. Production activation (each step needs the founder's approval)

1. Merge the PR (applies migration 20260060). Check production read-only before and after:
   `select provider, environment, status, is_primary from payment_gateway_configs;` → Razorpay primary, Cashfree disabled.
   Existing invoices, payments and subscriptions unchanged (counts and totals identical).
2. Set the Cashfree production variables in Vercel; register the Cashfree production webhook.
3. Platform Owner: Cashfree **live** → `enabled` (refused unless test is `sandbox_validated`).
4. At a quiet hour, Platform Owner: **Make primary** Cashfree (live). Razorpay becomes `draining`: it no longer takes
   new checkouts but still verifies, settles, refunds and reconciles its own payments. Razorpay is not disabled.
5. Immediately pay the smallest invoice of an internal organisation through Cashfree, refund it through the approval
   flow, and reconcile it after settlement. If anything fails, make Razorpay primary again (section 7).
6. Watch Platform Admin → Payments for 7 days: success rate, webhook failures, invalid signatures, stuck checkouts,
   reconciliation exceptions.

Recurring payments (UPI AutoPay) stay off until Cashfree approves Subscriptions and the mandate tests pass in sandbox;
then `update billing_settings set recurring_payments_enabled = true` (founder approval).

## 6. What happens to existing Razorpay customers and records

| Record | Effect |
|---|---|
| Subscriptions and contracts | Unchanged. Contracts never store a provider; prices are the contracted prices |
| Invoices | Unchanged; `gateway` now references a provider list (Razorpay stays valid) |
| Payments | Backfilled `provider='razorpay'`, `environment='live'`; `payment_reference` unchanged |
| Open Razorpay orders | Recorded as attempts; still payable and settled through Razorpay after any switch |
| Mandates | None exist today |
| Refunds / disputes on Razorpay payments | Always handled through Razorpay, whatever the primary provider |

## 7. Rollback and recovery

| Situation | Action |
|---|---|
| Cashfree misbehaves after becoming primary | Platform Owner: make Razorpay primary again (Razorpay `draining` → `enabled` → Make primary). No data moves; Cashfree payments keep settling, refunding and reconciling |
| Provider outage | No automatic failover. Record the verified outage in Platform Admin (3 extra days for affected customers). Switch primary manually only if the outage is long and the other provider is enabled |
| Webhooks failing | Platform Admin shows failures; fix the cause, then re-process failed events (Platform Owner). The poller settles paid checkouts meanwhile |
| Money received but not applied | Platform Admin → Unapplied money → request refund (approval required) |
| Code rollback | Revert the PR's application code: migration 20260060 is additive and compatible with the previous code (the old `billing_settle_gateway_payment` keeps its signature) |
| Database rollback | Not needed for a code rollback. If the migration itself must be reverted: drop the new tables and columns (only new data is lost; no existing row was changed except the backfilled provider columns) — only with founder approval |

## 7a. Alerts and day-to-day operation (migration 20260062)

Checked every 5 minutes with the gateway health job. Each alert is e-mailed to the Platform Owner and finance staff
when it opens and once a day while it stays open, appears under **Platform Admin → Payments → Open alerts**, and
closes itself when the condition clears.

| Alert | Opens when | What to do |
|---|---|---|
| gateway unhealthy | An enabled gateway failed its last 3 health checks | Check the provider status page and credentials; record a verified outage if it is the provider's |
| invalid signatures | 5+ webhook calls with a bad signature in an hour | The webhook secret changed or someone is forging calls: compare the secret with the provider dashboard |
| webhook failures | A signed event still fails after 5 automatic retries | Fix the cause, then re-process it (Platform Owner) |
| stuck checkouts | 3+ checkouts unconfirmed for over 2 hours | Check webhook delivery in the provider dashboard |
| unapplied money | Money received but not applied for over a day | Refund it (needs approval) or resolve it |
| dispute deadline | A dispute must be answered within 3 days | Respond in the provider dashboard |
| refund failed / refund stuck | A refund failed, or stayed submitted over 3 days (refund status is polled hourly) | Check with the provider; re-request if needed |
| reconciliation exceptions | An exception open for over 2 days | Investigate and resolve with a note |
| GST unconfigured | A paying customer exists and the supplier GST particulars are incomplete | Enter them (below) |

**GST particulars.** The Platform Owner enters the supplier legal name, GSTIN, state code and SAC code from the
accountant in Platform Admin → Payments → GST on invoices. They are validated (state code 01–38 or 97, GSTIN's first
two digits = state, SAC 6 digits starting 99), recorded in the platform audit log, and copied onto each invoice when it
is issued — a later change never alters an issued invoice. Customers enter their registered name, GSTIN and state on
**Plan & billing → Business details for invoices** (owners/admins; recorded in their audit log). An invoice is called
a *Tax invoice* only when every particular is present; it shows CGST + SGST when both parties are in the same state,
IGST otherwise. Nothing is pre-filled: until the accountant confirms the values, invoices remain pro-forma / receipts.

## 8. Outstanding external dependencies

1. Cashfree merchant approval, commercial terms and sandbox keys (blocks the validation gate and go-live).
2. This build environment cannot reach `sandbox.cashfree.com` or `api.razorpay.com`; sandbox runs must happen on a
   Preview deployment or with network access granted.
3. Refund & Cancellation Policy and Contact pages, and the legal company details for Privacy/Terms.
4. Confirmed production domain (webhook and return URLs).
5. Accountant confirmation: supplier legal name, GSTIN, state and SAC code (then entered in Platform Admin → Payments).
6. Cashfree UPI AutoPay (Subscriptions) approval before recurring payments are enabled.
