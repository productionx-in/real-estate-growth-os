# Self-service sign-up, free trial and Explore demo — plan (for approval)

Status: proposal, updated 19 Nov 2026. **Nothing is switched on publicly.** Built behind a disabled feature flag.
Packages and prices are **not final**: no trial duration, allowance, seat count or price is hard-coded — all come from the
commercial catalogue (`docs/design/billing-and-commercial-control.md`). Developer and agency onboarding are both supported.
The Explore demo is separate from registered customer accounts.

## 1. What already exists (verified)

| Piece | State |
|---|---|
| Accounts | Supabase Auth with email + password; password policy in `lib/auth/password-policy.ts`; `/auth/callback` handles email links. Locally, sign-up is enabled and email confirmation is **off** (`supabase/config.toml`); the production setting is not visible to us — **must be checked**. |
| Public sign-up | Disabled: `/register` redirects to `/login`; `POST /api/orgs` refuses everyone but REGrow super admins and is not transactional (an organisation can be created without its owner). |
| Staff provisioning | `provision_organisation_atomic` — one transaction, plan from the catalogue, owner invited by email. |
| Trial | `billing_start_trial` (migration 20260059): **14 days, 5 users, 1,000 leads, 5 projects, 500 units**; one trial per person per organisation type (`trial_grants`); limits enforced in the database; captured enquiries always saved. |
| Trial end | Scheduled job makes the workspace read-only; owner can still pay; paying restores it. |
| Seats | Atomic seat reservation; pending invitations hold a seat. |
| Rate limiting | `increment_rate_limit` (used by webhooks and public forms). |
| Invitations | Unchanged and keep working for employees. |
| Organisation types | Developer, channel partner agency. Independent CP has no plan yet. |

## 2. Proposed flow

1. **Start free trial** (`/signup`, hidden until launch): name, work email, password, phone, accept Terms and Privacy.
   Bot protection (honeypot + a CAPTCHA, see decisions), rate limits per IP and per email domain, disposable-email
   domains refused.
2. **Verify email**: Supabase sends the confirmation link; nothing is created until the email is confirmed.
3. **Create your workspace** (`/onboarding`, signed in, email confirmed): choose **Developer** or **Channel partner
   agency** (Independent CP appears only once its plan exists), business name, city.
4. One server function, `create_self_serve_workspace(user, name, type, request_id)`, in **one transaction**:
   checks the email is confirmed (from `auth.users`, not the browser); applies abuse limits; creates the organisation,
   the owner membership and the profile; starts the trial (or, if this person already used the trial for this type,
   creates the workspace on "choose a plan"); writes the audit entries; marks the organisation **unverified**.
   The `request_id` makes a double-click or retry return the same workspace — no duplicates, no orphan organisations.
   The organisation type comes from the server-validated choice, never from a hidden field, and cannot be changed later.
5. Owner lands in the workspace with the existing "Get REGrow ready" checklist (projects, lead sources, team, routing,
   alerts, import).
6. Inviting employees works exactly as today (seat-checked).
7. **Explore demo** (separate PR): a dedicated demo organisation with fictional data; visitors get a read-only session;
   reset nightly; rate-limited; no link to any customer organisation.

## 3. Security and abuse controls

- Email must be confirmed before any workspace exists (server-checked).
- **One trial per person per organisation type, for life** (already enforced); a person who runs an agency and a
  developer business gets one of each.
- At most **3 new workspaces per person per 30 days** without staff review; more go to a review queue.
- Per-IP and per-domain rate limits on sign-up and workspace creation; CAPTCHA on sign-up.
- Unverified workspaces can use their own CRM fully; **cross-organisation actions (partner requests, sharing projects,
  registering buyers) require verification** (separate verification PR).
- No client-supplied organisation IDs, roles, types or entitlements are trusted; every step re-checks on the server.
- Every creation, trial start and refusal is in the audit logs.

## 4. Trial terms are configuration, not code

The trial applied at sign-up is the **active trial offer** for the chosen audience in the commercial catalogue (duration,
allowances, eligibility rule). Today's values (14 days, 5 users, 1,000 leads, 5 projects, 500 units) exist only as data in
the trial plan rows and will become a draft trial offer to review with the final packaging. Required change before launch:
`billing_start_trial` reads the trial offer and writes per-organisation entitlements instead of reading fixed plan codes.

**Feature flag**: a `commercial_settings.self_serve_signup_enabled` value (default **false**) checked on the server by the
sign-up routes, the onboarding function and the website buttons; changeable only by a super admin in the CMS, audited.

**Demo separation**: the demo organisation is flagged `is_demo`; it is created by a staff script, never by sign-up; it can
never receive a membership through sign-up or invitation; demo sessions are read-only and cannot reach any other
organisation.

## 5. Affected tables, security, tests and rollback

- New: `signup_requests` (idempotency per person and request id, status), `commercial_settings`; organisations get
  `verification_status` and `is_demo`. No change to existing customer data.
- RLS: new tables server-only; the onboarding function is service-role only and derives the user from the verified session.
- Tests (real database): unconfirmed email refused; duplicate/abandoned creation; trial once per person per type; flag off
  refuses everything; manipulated IDs/types refused; rate limits; demo cannot be joined.
- Rollback: the flag off disables the whole flow; tables are additive.

## 6. Delivery (separate PRs)

1. `create_self_serve_workspace` + `/signup` + `/onboarding`, behind `SELF_SERVE_SIGNUP` (off) — with real-database
   tests: duplicate/abandoned creation, email-not-confirmed refusal, trial-per-type, rate limits, manipulated IDs.
2. Explore demo workspace.
3. Website: "Start free trial" and "Explore demo" buttons, shown only when the switch is on.
4. Launch: switch on after you approve, after confirming production Supabase Auth settings (confirmation on, SMTP
   sender configured).

## 7. Decisions needed

1. CAPTCHA provider: Cloudflare Turnstile (free, privacy-friendly) — confirm.
2. Workspace creation cap: 3 per person per 30 days — confirm.
3. Trial offer terms — after the pricing research.
4. Independent CP onboarding — after its package is defined.
