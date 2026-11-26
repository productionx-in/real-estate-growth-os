# RE by PX — commercial rules (decided 2026-11-18)

The founder delegated these decisions ("you do the math … keep in product info"). They are recorded here and in
`DECISIONS_LOG.md` (DEC-022). Each line says whether it is **enforced in code**, **planned** (which PR), or a
**policy** for people. Change a rule here first, then in code.

## Plans and prices (INR, excluding 18% GST)

| Plan | For | Monthly | Annual | Included users | Extra user / month | Status |
|---|---|---|---|---|---|---|
| RE for Agencies | Channel-partner agencies | ₹4,999 | ₹49,990 | 5 | ₹600 | Live (catalogue = website) |
| RE by PX Leads | Developers | ₹12,000 | ₹1,20,000 | 10 | ₹900 | Live (catalogue = website) |
| Enterprise | Groups, custom terms | Quote | Quote | Contract | Contract | Sales-assisted (platform provisioning) |
| Independent CP | Individual brokers | ₹1,499 | ₹14,990 | 1 | ₹600, at most 1 extra (2 users max) | **Planned** (own PR). Capped so it never undercuts Agencies: 2 users = ₹2,099 vs Agencies ₹4,999 for 5. |

Annual = 10 × monthly (two months free). Prices come only from the versioned catalogue
(`subscription_plan_versions`); the browser never sends an amount.

## Seats

- Every organisation has its own subscription and its own seats; nothing is shared between organisations,
  including organisations with the same owner. **Enforced.**
- One person in two organisations uses one seat in each; one membership = one seat whatever the role. **Enforced.**
- **Pending invitations reserve a seat** until accepted, revoked or expired (7 days). Decision: keep this — it
  stops a workspace inviting more people than it pays for and the reservation frees itself in a week. **Enforced.**
- Deactivating a member frees the seat at once. **Enforced.**
- Simultaneous invitations cannot exceed the seats (row lock). **Enforced.**

## Free trial

- 14 days, no card, verified email (sign-up PR). **Trial plan enforced; sign-up planned.**
- Limits: **5 users, 1,000 leads, 5 projects, 500 inventory units** — same for developers and agencies. The
  trial must let a real team run its real pipeline for two weeks and see the value before paying (founder,
  2026-11-18); the limits exist only to stop abuse, not to squeeze the trial. **Enforced in
  the database** (migration 20260059), including against direct API calls and simultaneous requests.
- Enquiries from connected sources (webhooks, forms, portals, WhatsApp, the customer API) are **always saved**,
  even over the lead limit — a buyer enquiry is never lost. Manual entry and CSV import stop at the limit. **Enforced.**
- **One trial per person per organisation type, for life.** Someone who runs an agency and a developer business
  gets one trial for each; a second workspace of the same type starts without a trial and must choose a plan.
  **Enforced** (`trial_grants`). RE by PX staff can still provision any workspace through platform provisioning.
- Upgrade any time during or after the trial; data and team stay. **Enforced.**

## End of a trial or paid period

- Trial ends → the workspace becomes **read-only** immediately (no grace): everything is kept and viewable, new
  enquiries are still captured, nobody can change records. **Enforced** (job every 15 minutes).
- Paid period ends → **7 days "payment overdue" with full access**, then read-only. **Enforced.**
- Owners and admins keep access to Plan & billing while read-only, and paying restores the workspace at once.
  **Enforced.** A suspension by RE by PX staff is not lifted by paying.
- Data is never deleted for non-payment. Export during read-only: owners can request it from support (self-serve
  export while read-only is **planned**).

## Existing customers (before self-serve)

- Every workspace that had no subscription gets a **30-day transition** on its type's plan (Leads or Agencies),
  with at least as many seats as it has members and no trial limits. After 30 days unpaid it becomes read-only
  like any other. Staff can extend it from the platform console. **Applied by migration 20260059 when merged.**

## Organisations, types and verification

- A person may own or belong to many organisations; each is an independent tenant. **Enforced.**
- An organisation's type (developer / agency) is set at creation and cannot be changed by customers. **Enforced in
  the app; a database guard is planned (verification PR).**
- Verification is per organisation. Unverified organisations can use their own CRM fully; **cross-organisation
  actions (sending or accepting partnership requests, sharing projects, registering buyers) need verification.**
  Evidence: developer — legal name plus GSTIN or RERA promoter registration; agency — legal name plus RERA agent
  registration or GSTIN. Reviewed by RE by PX staff; shared phone/email/owner is a reason to review, never to block
  or merge. Workspaces provisioned by staff before self-serve count as verified. **Planned (verification PR).**

## Website and acquisition

- Calls to action, in order: **Start free 14-day trial**, **Explore demo** (read-only sample workspace with fictional
  data), **Book a demo**. The 30-day paid pilot moves to the Book-a-demo page as an option for larger teams.
  **Planned (website PR, after sign-up and demo are live).**
- No speed, ROI or integration claims on the website without evidence; integrations that need the customer's own
  provider setup say so.

## Illustrative revenue (not a forecast)

| Segment | Assumed users | Monthly per organisation |
|---|---|---|
| Agency | 8 (5 + 3 × ₹600) | ₹6,799 |
| Developer | 18 (10 + 8 × ₹900) | ₹19,200 |
| Independent CP | 1 | ₹1,499 |

100 organisations (40 / 30 / 30) → ₹8,92,930 a month before GST (≈ ₹1.07 crore a year). Assumptions to validate
with real customers: average users per organisation, monthly vs annual mix (annual is ~17% cheaper), payment
fees (~2%), trial-to-paid conversion and churn.
