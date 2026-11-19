# Payment providers — Razorpay preservation, provider abstraction and Cashfree introduction (for approval)

Status: implemented on branch claude/payments-foundation (migration 20260060, lib/payments/*), 19 Nov 2026. Not merged; no production billing or payment configuration changed. Operations: docs/operations/PAYMENTS_RUNBOOK.md. Founder decisions of 19 Nov 2026 applied: Platform Owner (super_admin) alone changes the primary gateway; every refund approved by someone else, two approvers above ₹10,000; UPI AutoPay first; no automatic failover; 3 extra days after a verified outage.
Companion to `billing-and-commercial-control.md` (this document replaces its §2.5, §6 step 6 and decision 3).
No price or package in the code or database is approved; nothing here depends on prices.

Founder direction (19 Nov 2026): this is an **improvement and provider-abstraction project**, not a new integration.
Cashfree is the intended primary provider, subject to merchant approval, commercial confirmation and sandbox testing.
Razorpay is **kept and not disabled**; its records are preserved. Only one provider is offered to customers at a time,
and Cashfree is offered only after complete validation. The catalogue, contracts, entitlements and billing engine never
depend on a provider.

## 1. What exists today (verified 19 Nov 2026)

### Code (migration 20260056, `lib/billing/razorpay.ts`, three routes)

| Piece | Behaviour | Gap |
|---|---|---|
| Checkout `POST /api/billing/invoices/[id]/checkout` | Owner/admin only; creates **one** Razorpay order per invoice for exactly the invoice amount; a concurrent checkout reuses the first order (`gateway_order_id IS NULL` guard) | Order id stored on the invoice, so there is no history if an order expires or is replaced |
| Confirm `POST /api/billing/razorpay/confirm` | Checks the checkout signature, **re-reads the payment from Razorpay**, settles only if `captured` | Razorpay-specific field names in the API |
| Webhook `POST /api/webhooks/razorpay` | HMAC over the raw body with the webhook secret; 503 if no secret; handles `payment.captured` / `order.paid` only | Events are **not stored** (no event id, no replay protection beyond idempotent settlement, no audit of rejected events); refunds, disputes and failures are ignored |
| `billing_settle_gateway_payment()` | Locks on the payment reference; idempotent; checks order↔invoice, amount and currency; activates/renews/adds seats; writes `org_audit_logs` | Payment reference hard-prefixed `razorpay:`; a **second payment for a paid invoice is refused and only logged** — the money is not recorded anywhere for refund |
| `org_subscription_invoices.gateway` | `CHECK (gateway IS NULL OR gateway = 'razorpay')`; `gateway_order_id` **globally** unique | Needs a provider list and uniqueness per provider |
| `org_subscription_payments` | Reference (unique), invoice, amount, verified by/at | No provider, status, method, fees, refunds or settlement link |
| Mandates / Razorpay Subscriptions | **None.** All renewals are manual invoices paid one at a time | — |
| Refunds, disputes, settlements | **None** in code | — |

### Production data (read-only query, project `rtbvzqwwhefyyuhpoznu`)

| Record | Count |
|---|---|
| Subscriptions | 8 (7 `trial` — the 30-day transition — and 1 `pending_payment`) |
| Invoices | 1, status `issued`, **no gateway, no Razorpay order** |
| Payments (`org_subscription_payments`) | **0** |
| Razorpay orders referenced by invoices | **0** |
| Mandates / recurring subscriptions | 0 (not supported) |

**So in our database there are no Razorpay customers, payments, orders or mandates to migrate today.** Two things I cannot
see from here and you should confirm: (a) whether `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
are set in Vercel production (the Vercel connection cannot list the project), and (b) whether the Razorpay dashboard holds
any payment taken outside this code (e.g. a payment link created by hand). The migration plan below is written so it is
correct even if real Razorpay payments exist by the time it ships.

## 2. Principles

1. **REGrow owns the commercial truth**: prices, contracts, GST, discounts, seats, schedules, lifecycle, entitlements and
   invoice numbers. A provider only moves money and reports what happened.
2. **Provider-neutral core, provider-specific edges**: provider code sits behind one adapter interface; nothing above the
   adapter imports a provider module or reads a provider field name.
3. **Every external reference is namespaced** `(provider, environment, external id)` — never a bare id.
4. **One provider is "primary for new checkouts"**; every enabled provider keeps receiving webhooks, verifying, refunding and
   reconciling its own records indefinitely.
5. **Nothing is ever rewritten or deleted**: historical rows keep their provider; migrations only add columns and backfill.
6. **No activation from a browser redirect**; activation only after server-to-server verification or a verified webhook.

## 3. Adapter design

```
lib/payments/
  types.ts          PaymentProvider interface, neutral types (Money, OrderRef, PaymentStatus, RefundStatus …)
  registry.ts       providerFor(name, env) ; primaryProvider() — reads payment_gateway_configs + server env
  razorpay/         adapter.ts (wraps today's lib/billing/razorpay.ts, unchanged behaviour), webhook.ts, map.ts
  cashfree/         adapter.ts, webhook.ts, map.ts  (built against the sandbox only until approved)
lib/billing/        engine — calls the registry, never a provider module directly
app/api/webhooks/razorpay   kept at the same URL (already registered in Razorpay) → generic handler('razorpay')
app/api/webhooks/cashfree   new → generic handler('cashfree')
```

Interface (each method returns neutral types; unsupported capabilities return `not_supported`, never throw silently):

| Method | Purpose |
|---|---|
| `createOrder(invoice, attempt)` | Order for exactly the invoice amount; idempotency key = attempt id |
| `getCheckoutParams(order)` | What the browser needs (public key / session id) — never a secret |
| `verifyReturn(params)` | Signature/session check of the browser return, **then** `fetchPayment` |
| `fetchPayment(ref)` / `fetchOrder(ref)` | Server-to-server status |
| `verifyWebhook(rawBody, headers)` | Provider-specific signature and timestamp check |
| `parseWebhook(rawBody)` | → neutral event: `payment.captured/failed`, `refund.processed/failed`, `dispute.*`, `mandate.*`, `settlement.*`, `unknown` + provider event id |
| `refund(payment, amount, idempotencyKey)` / `fetchRefund` | Refunds |
| `fetchSettlements(range)` / `fetchSettlementItems(id)` | Reconciliation |
| `createMandate / fetchMandate / cancelMandate / chargeMandate` | Recurring (later phase) |
| `healthCheck()` | Cheap authenticated call used by monitoring |

Razorpay webhook specifics: `X-Razorpay-Signature` = HMAC-SHA256(raw body, webhook secret); event id from the
`X-Razorpay-Event-Id` header. Cashfree specifics (to confirm against their current docs in sandbox): `x-webhook-signature`
= base64 HMAC-SHA256(`x-webhook-timestamp` + raw body, secret), with a timestamp tolerance to stop replays. Each adapter
owns its verification; the generic handler never parses an unverified body.

## 4. Data model changes (additive)

| Table / change | Contents |
|---|---|
| `payment_providers` (reference) | `razorpay`, `cashfree` — replaces the `gateway = 'razorpay'` CHECK with a foreign key |
| `payment_gateway_configs` | provider × environment (`test`/`live`): status (`disabled`, `sandbox_validated`, `enabled`, `primary`, `draining`, `suspended`), public key id, webhook URL, last webhook seen, last health result, changed_by/approved_by. **Secrets stay in server env / Supabase Vault**, never in this table, never sent to a browser |
| `payment_attempts` | invoice × provider × environment × provider order id (**unique per provider+env**), amount, currency, status (`created`, `pending`, `captured`, `failed`, `expired`, `canceled`), created_by, expires_at. Replaces "one order on the invoice"; the invoice's `gateway_order_id` is kept and backfilled as attempt #1 |
| `org_subscription_payments` (extend) | + `provider`, `environment`, `provider_payment_id`, `attempt_id`, `method`, `status` (`captured`, `refunded`, `partially_refunded`, `disputed`, `unapplied`), `fee_cents`, `tax_on_fee_cents`, `settlement_id`. Unique `(provider, environment, provider_payment_id)`. Existing `payment_reference` (`razorpay:pay_…`) kept as is |
| `payment_webhook_events` | provider, environment, provider event id, **unique (provider, environment, event_id)**, type, signature_valid, payload (stored encrypted or minimised — no card data is ever sent by either provider), received_at, processed_at, outcome, error, attempts |
| `unapplied_payments` (or `status = 'unapplied'`) | Money received that cannot be applied (duplicate, late after cancellation, amount mismatch). Always visible to finance until refunded or applied by an approved action |
| `refunds` | payment, amount, reason, credit note, requested_by, approved_by, provider refund id (unique per provider), idempotency key, status (`requested`, `approved`, `submitted`, `processed`, `failed`, `rejected`) |
| `disputes` | payment, provider dispute id, reason, amount, status (`open`, `evidence_submitted`, `won`, `lost`, `closed`), respond_by, evidence refs, handled_by |
| `mandates` | org, contract, provider, environment, provider mandate/subscription id, method (UPI Autopay / e-NACH / card), max amount, frequency, status (`created`, `pending_authorisation`, `active`, `paused`, `cancelled`, `failed`, `expired`), authorised_at, cancelled_at/by/reason, next charge date |
| `mandate_charges` | mandate × invoice; pre-debit notification sent at (RBI rule), charge attempt status, retries |
| `settlements`, `settlement_items` | provider settlement id + UTR, amount, fees, tax on fees, items → payment / refund / dispute adjustments |
| `reconciliation_runs`, `reconciliation_items` | matched / missing in REGrow / missing at provider / amount mismatch / unsettled after N days; resolution and resolver |
| `gateway_health_checks` | provider × env × time: check type, ok, latency, error |

All tables: RLS on, **no client policies**; read and write only through server routes and SECURITY DEFINER functions
granted to `service_role`. Customer owners/admins read their own payments/refunds/mandates through server routes scoped
by `org_id`. Staff access by role (§10).

## 5. Migration of the existing Razorpay implementation

What happens to each kind of existing record:

| Existing record | Today in production | What the migration does | What changes for the customer |
|---|---|---|---|
| Customers / subscriptions (`org_subscriptions`) | 8, none paid via Razorpay | Nothing provider-related is stored on the contract; contracts are untouched. A subscription never records "its" provider — each invoice is paid through whichever provider is primary when they pay | Nothing |
| Invoices | 1 issued, no gateway | `gateway` CHECK replaced by FK to `payment_providers` (`razorpay` stays valid); `gateway_order_id` kept; any invoice with an order is backfilled into `payment_attempts` as attempt #1 (provider `razorpay`, env `live`). Invoice numbers, amounts and status untouched | Nothing |
| Payments | 0 | Backfill `provider = 'razorpay'`, `environment = 'live'`, `provider_payment_id` = the part after `razorpay:` in `payment_reference`; `payment_reference` unchanged. Unique key added after backfill | Nothing |
| Razorpay orders open at cut-over | 0 | Remain valid attempts; a payment on them is still verified and settled through the Razorpay adapter even after Cashfree is primary | They can still pay a link/checkout they already opened |
| Mandates | 0 (not supported) | None to migrate. Rule for the future: an active mandate stays on the provider where it was authorised until it ends or the customer re-authorises (mandates cannot be moved between providers) | — |
| Refunds / disputes on Razorpay payments | none recorded | Always executed through the provider that took the payment, whatever the primary provider is | — |
| Webhook URL `/api/webhooks/razorpay` | registered (if keys set) | Same URL, same secret; it starts storing events | — |
| Env vars `RAZORPAY_*` | unknown in production | Unchanged. The adapter reads the same variables | — |

Migration steps (each its own PR, each additive and reversible):

1. **M1 — Schema only.** Add the reference/config/attempt/event tables; extend payments; replace the CHECK with an FK;
   backfill; unique keys. No code path changes. Rollback: drop the new tables/columns (they hold no data yet beyond backfill
   copies; originals untouched).
2. **M2 — Razorpay behind the adapter.** Move today's code into `lib/payments/razorpay/` with **identical behaviour**;
   checkout/confirm/webhook routes call the registry. Webhook now records events (unique id) before processing, and stores
   duplicate/late payments as `unapplied` instead of only logging. Contract tests: every existing Razorpay unit test and the
   recorded payloads pass unchanged. Rollback: revert the PR (schema stays; it is compatible with the old code).
3. **M3 — Neutral settlement function** `billing_settle_payment(provider, env, attempt_ref, payment_id, amount, currency)`;
   the old `billing_settle_gateway_payment` stays as a wrapper calling it with `razorpay` so nothing breaks.
4. **M4 — Refunds, disputes, reconciliation, health** for Razorpay (the only live provider), plus Platform Admin screens.
5. **M5 — Cashfree adapter in sandbox only** (`environment = 'test'`); not selectable as primary in live.
6. **M6 — Cashfree live** only after the validation gate (§9) and your separate approval; then the switch procedure (§8).
7. **M7 — Mandates** (later phase, after manual renewals have run cleanly on the primary provider).

## 6. Duplicate-payment prevention (including during a provider switch)

- **One open attempt per invoice at a time**, enforced by a partial unique index `(invoice_id) WHERE status IN ('created','pending')`.
  Opening checkout again reuses the open attempt if it is on the current primary provider; if the primary changed, the old
  attempt is first **checked with its provider** — if captured, settle it and stop; if still open, cancel/expire it at the
  provider where supported, mark it `superseded`, then create the new one.
- **Settlement is idempotent per `(provider, env, provider_payment_id)`** and the invoice row is locked; an invoice can be
  `paid` only once.
- **A second successful payment for the same invoice** (both providers captured, or two attempts on one provider) is
  recorded as `unapplied`, alerted to finance, and refunded through the provider that took it after approval — never silently
  dropped, never applied twice. (Today it is only logged; M2 fixes this.)
- **Provider-side idempotency keys** on order creation and refunds (attempt id / refund id), so a network retry never creates
  a second order or refund.
- During a switch, the old provider is put in `draining` (no new orders, still verifies, settles, refunds, reconciles), never
  `disabled`, until its last attempt is closed and its last settlement reconciled.

## 7. Webhook verification and idempotency (per provider)

1. Read the raw body (size limit); select the adapter by URL; **verify signature first** (and timestamp window where the
   provider signs one); invalid → 401, stored with `signature_valid = false`, counted for health alerts.
2. Insert into `payment_webhook_events` with the provider event id; **unique conflict → 200 "duplicate"** and stop.
3. Process in a transaction: map to a neutral event; apply by **status precedence** (e.g. `captured` beats `failed`,
   `refunded` follows `captured`), so out-of-order delivery cannot move a record backwards.
4. Outcome stored. Expected refusals (unknown order, mismatch) → 200 with the outcome recorded (provider stops retrying,
   finance sees it). Unexpected errors → 500 so the provider retries; a sweeper job re-processes `failed` events.
5. Never trust the webhook payload alone for money: captured payments are re-fetched from the provider API before settlement
   when the payload lacks a field we need, and always during reconciliation.
6. Separate webhook secrets per provider and environment; test-environment events can never touch live records
   (`environment` is part of every key).

## 8. Switching the primary provider (procedure)

Preconditions: new provider `sandbox_validated` **and** live keys verified by a ₹1 (or minimum) live payment and refund made by
staff on an internal test organisation; Platform Admin shows both healthy; your written approval.

1. Announce internally; no customer communication needed (invoice amounts and contracts do not change).
2. Super admin (second person approves) sets the new provider `primary` and the old one `draining` — one audited transaction;
   only one `primary` per environment (unique partial index).
3. From that moment **new** attempts use the new provider. Open attempts on the old provider stay payable and are handled
   by §6.
4. Webhooks, refunds, disputes and reconciliation continue on **both**. Mandates authorised on the old provider keep
   charging there until they end, or the customer re-authorises on the new provider at renewal (we ask; never forced
   mid-term).
5. Monitor for 7 days: conversion, failures, webhook lag, reconciliation. **Rollback** = the same switch in reverse (set the old
   provider `primary` again) — no data moves, because records always carry their own provider.
6. The old provider is never disabled while it has an open attempt, an active mandate, an unreconciled settlement, an open
   dispute, or a refund in progress. Razorpay stays `enabled` (fallback) per your instruction.

Contracts, invoices, entitlements, prices and lifecycle states are not touched by a switch.

## 9. Cashfree validation gate (before it can be primary)

Sandbox: order → payment (UPI, card, netbanking) → return verification → webhook (valid, invalid signature, replay, duplicate,
out of order) → refund (full, partial, failed) → settlement fetch and reconciliation → dispute simulation where available →
health check → outage simulation (API timeout). Live: merchant approval, commercial terms confirmed, live keys in server env
only, webhook registered on the confirmed production domain, one internal live payment + refund reconciled. Each item has a
test or a recorded check in the PR.

## 10. Lifecycles

**Refunds**: finance requests (amount ≤ captured − already refunded, reason) → second person approves above a configurable
threshold (super admin) → credit note drafted → adapter `refund` with idempotency key → `submitted` → webhook / poll →
`processed` (credit note finalised, payment `refunded`/`partially_refunded`) or `failed` (alert, credit note stays draft).
Contract effects (cancel, reduce seats) are a separate, explicit action — a refund alone never changes entitlements.

**Disputes / chargebacks**: webhook opens a `dispute` (amount held), alert to finance with the respond-by date; evidence
(invoice, audit trail of usage, terms acceptance) attached and submitted; `won` → closed; `lost` → payment adjusted, credit note,
and finance decides on the contract (no automatic suspension). Fees recorded from the settlement.

**Mandates** (later phase): customer owner starts authorisation → provider page (UPI Autopay / e-NACH / card) → webhook
`active` → before each charge, a pre-debit notification (RBI: at least 24 h before; provider-handled where supported) →
charge for the **invoice REGrow issued**, amount ≤ mandate max → success settles the invoice; failure → retries per provider
rules then the normal past-due grace. Cancellation by the customer (in REGrow or their bank/UPI app) or by finance → webhook
→ `cancelled`; the contract continues on manual renewal. Status changes all audited; mandate never changes prices.

**Failed payments**: attempt `failed`, invoice stays `issued`, customer sees retry; existing 7-day past-due grace applies.

## 11. Outages and failures

| Situation | Handling |
|---|---|
| Provider API timeout at order creation | Error to the user ("try again in a minute"); no attempt saved without an order id; retry is safe (idempotency key) |
| Provider down during return verification | Attempt stays `pending`; webhook or the poller (every 10 min for 48 h) settles it; never activated from the redirect |
| Webhooks delayed or failing | Poller re-fetches `pending` attempts; reconciliation catches the rest; health alert after N minutes without events while attempts are pending |
| Primary provider outage (sustained) | Platform Admin shows it; super admin can switch primary (§8) as a manual decision — **no automatic failover**, so a customer can never be charged on both providers |
| Our server down when the webhook fires | Provider retries; idempotent processing |
| Invalid signatures spike | Alert (possible secret mismatch or attack); events stored, not processed |
| Grace protection | If the primary provider was unavailable when a renewal was due, staff can extend the grace period from the console (audited) |

## 12. Reconciliation (payment → settlement)

Daily job per provider/env: fetch settlements and items since the last run → match each item to a `payment`, `refund` or
`dispute` by provider id → compare amounts and fees → produce `reconciliation_items`: matched, missing in REGrow (captured at the
provider but not recorded — re-fetch and settle or mark unapplied), missing at provider, amount mismatch, captured but unsettled
after the expected T+N days. Finance resolves each exception with a note (audited). Bank UTRs stored for matching with the bank
statement. Fees and GST on fees recorded for accounting. Revenue reports use REGrow invoices, never provider totals.

## 13. Platform Admin — gateway health and payments

- Per provider × environment card: status (primary / enabled / draining / disabled), last successful API check and latency,
  last webhook received, webhook failures (24 h), invalid signatures (24 h), pending attempts older than 30 min, payment
  success rate (24 h / 7 d), unreconciled items, open disputes and their deadlines.
- Lists: attempts, payments, unapplied payments, refunds (with approve / reject), disputes, mandates, webhook events (with
  "re-process" for failed ones — super admin), reconciliation exceptions.
- Actions and who may do them: switch primary — super admin + second approver; approve refunds — finance admin, super admin
  above threshold; resolve reconciliation — finance admin; view — finance admin, super admin. Sales and support: no access
  to payments. Secrets: write-only fields that set server-side secrets (or instructions to set env vars), shown masked.
- Every action written to `platform_audit_logs`; customer-affecting ones also to the customer's `org_audit_logs`.

## 14. Tests

Real-database suites: backfill preserves every existing row; one open attempt per invoice; idempotent settlement per provider;
duplicate payment → unapplied, never double-applied; webhook duplicate/replay/out-of-order/invalid signature per provider;
test-environment events cannot touch live rows; switch procedure (old attempts still settle, refunds go to the original provider,
only one primary); refund approval and limits; dispute lifecycle; mandate status transitions; reconciliation classification;
cross-tenant isolation for every customer-facing read. Adapter contract tests: the same suite runs against Razorpay and
Cashfree adapters with recorded sandbox payloads. Existing Razorpay tests unchanged and green throughout.

## 15. Deployment and rollback

Each step (M1–M7) is a separate PR and migration, merged only with your approval, production checked read-only before and after.
No step changes production billing or payment configuration (keys, webhook registrations, primary provider) — those are
separate, explicitly approved operations performed after the code is live. Rollback per step as listed in §5; switching
providers is reversible by configuration alone.

## 16. Decisions needed

1. Confirm whether Razorpay live keys are configured in production and whether any Razorpay payments exist outside REGrow.
2. Refund approval threshold, and who (by name/role) may switch the primary provider.
3. Mandates: which methods first (UPI Autopay, e-NACH, card) — after manual renewals are proven.
4. Grace extension policy when a provider outage prevented payment.
5. Approve M1–M3 (no behaviour change, no configuration change) as the first implementation work, when you are ready.
