# Commercial control centre, billing engine and payment gateway — architecture (for approval)

Status: proposal, 19 Nov 2026. Nothing implemented; nothing in production changed. Prices and packages are **not
final** (market research in progress): no amount in this document or in the code is an approved price.

## 1. What exists today (verified in code and schema)

| Piece | Today | Gap against the requirements |
|---|---|---|
| `subscription_plans` | Package: code, name, `target_org_type` (developer / channel_partner), tier, active flag | No draft/review/publish workflow, no retire, no audience "independent CP" |
| `subscription_plan_versions` | Version number, `is_current`, monthly + annual price, included seats, extra-seat price, project/unit/lead/storage/integration limits, `features` JSON, `trial_days` | Prices, allowances and trial terms are mixed in one row; no quarterly price; no effective dates or scheduled changes; `is_current` boolean instead of a status; no approval record |
| `org_subscriptions` | One per organisation: status, period dates, **contracted prices** (`contracted_base_price_cents`, `contracted_additional_seat_price_cents`), seats, read-only flags, payment-verification fields | Contract terms, lifecycle state and payment evidence are mixed in one row; no contract history; no discounts or add-ons |
| Seats | `included_seats` + `additional_seats` on the subscription **and** a separate `org_subscription_seat_purchases` table; the seat check sums all three | Two sources of truth for extra seats |
| `subscription_commercial_overrides` | One-off approved codes for custom seats/prices (staff provisioning) | Good basis for negotiated enterprise terms; not linked to quotes or approvals UI |
| `org_subscription_invoices` | Number, GST amount (single 18% function), subtotal, type (plan / seats / renewal), Razorpay order id; `gateway` constrained to `'razorpay'` | No tax configuration, no CGST/SGST/IGST split, no customer GSTIN/place of supply, no credit notes, no invoice series per financial year |
| `org_subscription_payments` | Payment reference (unique), invoice, amount, verified by/at | No provider, status, attempt history, refunds, settlements |
| Gateway | Razorpay: server-side order + signature + payment fetch verification, webhook signature check, idempotent settlement (`billing_settle_gateway_payment`) | Hard-wired to Razorpay; Cashfree is the intended gateway |
| `org_module_entitlements` | Per-organisation module on/off (5 modules) | Not derived from the package; no feature-level keys |
| Plan limits | DB triggers read limits from the subscription's plan version (migration 20260059) | Should read from per-organisation entitlements, so add-ons and overrides count |
| Hard-coded | Website prices in `lib/marketing/pricing.ts` (separate from the catalogue); GST 18% (`billing_gst_cents`); 7-day grace and 15-day renewal window in SQL/TS; trial plan picked by fixed codes; ₹25,000 setup fee on the website only | All must come from the catalogue / configuration |
| Audit | `org_audit_logs` (customer), `platform_audit_logs` (staff), both append-only | Reuse for every commercial action |

## 2. Target model — five separate layers

```
Package catalogue ──► Subscription contract ──► Entitlements ──► enforcement (DB + server)
 (what we sell,        (what this customer        (what this org
  versioned prices)     agreed, frozen terms)       may use now)
                              │
                              ▼
                    Billing engine ──► Invoices / credit notes (REGrow tax documents)
                              │
                              ▼
                    Payment provider adapter ──► Cashfree (first), Razorpay/others later
                    (transactions, refunds, settlements; never commercial rules)
```

### 2.1 Package catalogue
- `packages` — code, name, audience (`developer` | `agency` | `independent_cp`), status (`draft` | `active` | `retired`).
- `package_versions` — status `draft → in_review → published → retired`; `effective_from` / `effective_to` (scheduled
  changes); created_by, reviewed_by, published_by (maker–checker: the publisher must differ from the author).
- `package_prices` — version × billing cycle (`monthly` | `quarterly` | `annual`) × currency: amount, tax category.
- `package_allowances` — version × key (`seats_included`, `projects`, `inventory_units`, `leads`, `whatsapp_messages`, …)
  × limit (null = unlimited) — typed rows, not JSON, so the database can enforce them.
- `package_features` — version × feature/module key × enabled.
- `seat_pricing` — version × cycle: extra-seat price, minimum/maximum seats.
- `add_ons` + `add_on_versions` — optional modules or allowance packs with their own prices and allowances.
- `trial_offers` — audience, duration, allowances, eligibility rule (today: one per person per type), active window.
- `fees` — onboarding/setup fees per version.
- `promotions` / `coupons` — discount type (percent / fixed / free months), applicable packages and cycles, validity,
  maximum redemptions, per-customer limit; `coupon_redemptions`.

### 2.2 Subscription contract
- Evolve `org_subscriptions` into the **current contract** and add `subscription_contract_versions` (history): the package
  version, cycle, **frozen prices, allowances, features, add-ons, discounts and fees as agreed**, term dates, renewal terms,
  source (self-serve / quote / migration), approver for anything non-standard.
- Publishing a new package version **never** changes an existing contract. Moving customers to new terms is an explicit
  "price migration" operation: select contracts → preview the change per customer → approve → apply at their next
  renewal (or a set date) with notice → audited.
- Lifecycle state stays on the subscription (`trial`, `active`, `past_due`/grace, `suspended`/read-only, `canceled`,
  `expired`, `archived`) — the existing job keeps enforcing it; grace and renewal-window lengths move to configuration.

### 2.3 Entitlements
- `org_entitlements` — one row per organisation × key: limit or enabled, **source** (contract, add-on, override, trial),
  valid from/to. Rebuilt in the same transaction whenever the contract, add-ons or overrides change.
- The existing limit triggers and module checks read `org_entitlements` instead of the plan version — so add-ons and
  negotiated terms are enforced on the server and in the database, never only in the UI.

### 2.4 Billing engine (REGrow-owned, gateway-independent)
- Computes every amount on the server from the contract: base price for the cycle, extra seats (prorated), add-ons,
  discounts, fees, then tax from **tax configuration**; nothing is taken from the browser.
- `tax_rates` — tax type (GST), rate, SAC code, effective dates, reviewed_by. Place-of-supply logic: supplier state vs the
  customer's billing state → CGST + SGST or IGST.
- `billing_profiles` — per organisation: legal name, GSTIN (validated format), billing address and state.
- `invoice_series` — per financial year, gap-free numbering under a lock; invoices are immutable once issued.
- `credit_notes` — linked to an invoice; reasons (refund, price correction, cancellation); approval required.
- A gateway receipt is never a tax invoice; REGrow issues the invoice.

### 2.5 Payment provider adapter
- Interface: `createOrder`, `createPaymentLink`, `verifyPayment` (server-to-server fetch), `verifyWebhook`,
  `refund`, `fetchSettlements`, later `createMandate`. One implementation per provider; chosen by configuration.
- Tables: `payment_transactions` (provider, environment, order/payment ids, amount, status, verified_at, raw response
  hash), `payment_webhook_events` (provider, provider event id **unique**, signature valid, received/processed at,
  outcome), `refunds` (requested_by, approved_by, provider refund id, status), `settlements` + `settlement_items`
  (amount, fees, tax on fees, UTR), `reconciliation_runs` + `reconciliation_items` (matched / mismatched / missing).
- `payment_gateway_configs` — provider, environment (test/live), public key id, status, last webhook seen; **secrets live in
  the server environment or Supabase Vault**, are write-only in the admin UI (shown masked) and never reach a browser.

## 3. Payment flows and controls

- **Checkout** (manual renewals first): invoice issued → provider order created for exactly the invoice amount →
  customer pays → **server verifies with the provider API** → idempotent settlement marks the invoice paid and updates
  the contract. A browser redirect never activates anything (the existing Razorpay flow already follows this).
- **Webhooks**: signature verified before parsing; event id stored first (unique) so duplicates are no-ops; processing
  is idempotent and retries safely; the same settlement function as checkout; out-of-order events handled by status
  precedence; unknown events stored and ignored.
- **Refunds**: requested by finance with a reason; approval by a second person (super admin) above a configurable
  amount; credit note issued; provider refund called; status tracked from the provider; all audited.
- **Manual payments** (bank transfer): recorded only by finance with evidence reference, approved by a second person;
  never "mark as paid" without both.
- **Failed / pending payments**: invoice stays issued; reminders; existing grace and read-only rules apply; retry links.
- **Recurring mandates**: later, once the lifecycle has run on manual renewals.
- Every action writes `platform_audit_logs` and the customer's `org_audit_logs`; customer payment data is visible to the
  customer's owners/admins (their own organisation only) and to finance staff — not to sales or support.

## 4. Failure and recovery scenarios (designed for)

| Scenario | Handling |
|---|---|
| Customer closes the tab after paying | Webhook settles; or the next reconciliation run fetches the payment |
| Webhook arrives twice / out of order | Unique event id; status precedence; idempotent settlement |
| Webhook signature invalid | Rejected (401), stored as invalid, alert |
| Provider API down at verification | Payment stays pending; retried by job; never marked paid on the redirect |
| Amount mismatch | Settlement refused; flagged for finance |
| Paid twice for one invoice | Second payment flagged for refund (existing rule: never applied twice) |
| Refund fails at provider | Refund stays `failed`; credit note not finalised; alert |
| Settlement differs from transactions | Reconciliation item `mismatch` for finance |

## 5. Platform Admin — Commercial control centre (feature classification)

| Capability | Initial release | Later phase | Future enterprise |
|---|---|---|---|
| Packages: create, edit, duplicate, activate/deactivate, retire; developer vs agency | ✔ | | |
| Versions with draft → review → publish, effective dates, scheduled changes, full history | ✔ | | |
| Monthly / quarterly / annual prices; included users; extra-seat pricing | ✔ | | |
| Allowances (projects, units, leads, …) and feature/module entitlements | ✔ | | |
| Trial offers (duration, allowances, eligibility) | ✔ | | |
| Onboarding fees | ✔ | | |
| Customer subscriptions: view contract, extend trial, change package at renewal, cancel, pause | ✔ (manual) | upgrades/downgrades with proration | |
| Tax configuration, billing profiles, GST invoices, credit notes | ✔ | | e-invoicing (IRN) when turnover requires |
| Gateway config status, transactions, webhook monitor | ✔ | | |
| Refund requests with approval | ✔ | | |
| Revenue dashboard (MRR, ARR, churn, renewals, trial conversion, revenue by package, ARPA, failed-payment recovery) | basic (MRR, ARR, active/trial counts) | full | |
| Coupons, promotions, discounts | | ✔ | |
| Add-ons and module pricing | | ✔ | |
| Price migration of existing customers | | ✔ | |
| Settlement reconciliation | | ✔ | |
| Payment links, failed-payment recovery campaigns | | ✔ | |
| Recurring mandates | | ✔ (after lifecycle proven) | |
| Usage metering (SMS, WhatsApp, API) | metering only, no billing | | usage-based billing after reconciliation exists |
| Custom quotations, negotiated contracts, approval workflows | | | ✔ (builds on `subscription_commercial_overrides`) |
| Pricing intelligence (package performance, price history analytics) | price history | analytics | ✔ |

## 6. Changes to the existing architecture (migration plan, not applied)

1. Add `package_versions` status/effective dates and split prices, allowances and features into their own tables;
   migrate existing `subscription_plan_versions` rows into them (same ids kept for references); mark the current
   ₹-figures as **unpublished drafts** pending the pricing decision.
2. Add contract history; copy each `org_subscriptions` row's frozen terms into version 1 of its contract.
3. Add `org_entitlements`; populate from contracts; switch the limit triggers and module checks to it (behaviour
   identical for existing customers; tests compare before/after).
4. Consolidate extra seats into one source (seat purchases become contract add-ons); keep the old columns read-only
   until verified, then drop.
5. Tax rates, billing profiles, invoice series, credit notes; `billing_gst_cents` reads the tax configuration.
6. Provider adapter: wrap the existing Razorpay code as the first adapter; add the transaction/webhook/refund tables;
   lift the `gateway = 'razorpay'` constraint to a provider list; Cashfree adapter once merchant onboarding is done.
7. The website reads published package versions instead of `lib/marketing/pricing.ts`.
8. Grace period, renewal window and trial eligibility move to a `commercial_settings` table edited in the CMS.

Every step is additive first (new tables, dual-read verified by tests), then the old path is removed — so each step can be
rolled back by switching reads back, without data loss.

## 7. Security and RLS

- All commercial tables: RLS on, no client policies, server-only (service role) — except customer read of **their own**
  invoices, credit notes and contract summary through server routes that check owner/admin.
- Staff permissions: `super_admin` (everything, publishes, approves); `finance_admin` (invoices, payments, refunds
  requests, reconciliation, tax profiles); `platform_admin` (packages draft/review, entitlements view); sales (read
  published catalogue, create quote drafts — enterprise phase); support (read a customer's plan summary only, no amounts
  beyond what the customer sees). Approval steps require a different person from the requester.
- Gateway secrets never in the database in plain text and never sent to a browser.

## 8. Test plan

Real-database suites for: version publish rules (maker–checker, effective dates, no edit after publish); contracts unchanged
by new versions; explicit price migration; entitlements rebuilt and enforced by triggers; tax split (intra/inter-state),
invoice series under concurrency, credit notes; webhook idempotency, invalid signature, out-of-order, amount mismatch,
duplicate payment; refund approval; reconciliation matching; cross-tenant isolation (an owner never sees another
organisation's invoices). Provider adapter tested against recorded sandbox responses; Cashfree sandbox end-to-end before live.

## 9. Cashfree merchant onboarding (needed before the adapter goes live)

Business PAN and GST certificate, bank account in the company's name, incorporation documents, business address, website
with **Privacy Policy, Terms, Refund & Cancellation Policy, Contact page and pricing** (Refund/Cancellation and Contact pages
do not exist yet), support email/phone, test then live API keys, webhook endpoint URL on the confirmed production domain.

## 10. Deployment and rollback

Each step is its own PR with a migration that is additive and reversible; production checked read-only before and after;
feature flags for the CMS sections and for the Cashfree adapter (test environment first); the Razorpay path stays until
Cashfree is verified live; rollback = switch the flag / reads back, never drop data in the same release that introduces
the replacement.

## 11. Now vs later

- **Can start now** (independent of prices and Cashfree): catalogue versioning and workflow, contracts history,
  entitlements layer, commercial settings, tax configuration and GST invoices/credit notes, adapter interface and
  transaction/webhook tables, admin CMS screens for all of these (in test data), website reading the catalogue.
- **Depends on your pricing decision**: publishing real packages, trial economics, website prices, any price migration.
- **Depends on Cashfree merchant approval**: Cashfree adapter live keys, payment links, settlements API, mandates.

## 12. Decisions needed

1. Approval rule: who may publish a price version, and the refund amount above which a second approver is needed.
2. Quarterly pricing at launch: yes / no.
3. Keep Razorpay as a fallback adapter, or remove it once Cashfree is live?
4. Supplier GST registration state (for place-of-supply) and SAC code — confirm with your accountant.
5. Refund and cancellation policy terms (needed for the website and for Cashfree).
