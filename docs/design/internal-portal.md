# Platform Admin Console and Internal Sales & Support Portal — plan (for approval)

Status: proposal, updated 19 Nov 2026. Separate workstream; no code until approved. **No production staff account is
created or activated without the owner's approval.** The commercial control centre (pricing & packages, subscriptions,
billing, payments) is specified in `docs/design/billing-and-commercial-control.md` and is part of the Platform Admin
experience.

## 1. Separate experiences and permission systems

| Experience | Who | Where | Permissions from |
|---|---|---|---|
| **Platform Admin Console** | You and authorised platform administrators | `/platform` (exists, basic) | `platform_users` role + MFA |
| **Internal Sales** | INFYN sales employees | `/platform/sales` | `platform_users` role + MFA |
| **Internal Support** | INFYN support employees | `/platform/support` | `platform_users` role + MFA |
| **Customer Workspace** | Developers, agencies, independent CPs | `/<workspace>` (unchanged) | `org_members` role |

Platform roles live in `platform_users`, entirely separate from customer membership: being a customer owner never
grants a platform role, and a platform role never grants membership in any customer workspace.

## 2. What exists (verified)

- `platform_users` with roles `super_admin`, `platform_admin`, `finance_admin`, `support_agent`, `sales_rep`, `auditor`;
  MFA (AAL2) required for the console and sensitive actions; immutable `platform_audit_logs`.
- Console: organisation list (metadata only), organisation page (suspend/reactivate, module switches), staff audit log,
  provisioning form.
- Customer-approved, time-limited, audited support access (`support_access_grants`).
- Demo requests stored in `customer_onboarding_requests`, with an API for sales reps but **no screen**.
- **Production has no platform accounts** — nobody can open the console yet. Creating the first one is a one-off step
  you run with your own authenticator app (`scripts/bootstrap-super-admin.mjs`).

## 3. Permissions (✔ allowed · — not allowed)

| | Owner (super_admin) | Platform admin | Finance | Sales manager (new) | Sales executive | Support | Auditor |
|---|---|---|---|---|---|---|---|
| Dashboard (real figures) | ✔ | ✔ | ✔ | pipeline | own | cases | read |
| Organisation list (metadata, no business data) | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | read |
| Suspend / reactivate / provision / delete | ✔ | — | — | — | — | — | — |
| Plans, trials, seats, payments | ✔ | — | ✔ | extend trial | — | — | read |
| Verification review | ✔ | ✔ | — | — | — | — | read |
| Prospects and pipeline | ✔ | — | — | all | own + unassigned | — | read |
| Support cases | ✔ | ✔ | — | — | — | ✔ | read |
| Customer CRM records | only via customer-approved support grant | ← | **never** | **never** | **never** | via grant | — |
| Staff accounts and roles | ✔ | — | — | — | — | — | — |

## 4. New data (separate from customer data; RLS on, server-only)

- **Sales**: `internal_prospects` (company, type, segment, source, campaign, stage, owner, lost reason, linked trial
  workspace), `internal_prospect_contacts`, `internal_activities` (call, email, meeting, note), `internal_tasks`.
  Pipeline: New → Contacted → Interested → Qualified → Demo scheduled → Demo done → Trial started → Trial active →
  Negotiation → Won / Lost. Existing demo requests become prospects.
- **Support**: `support_cases` (organisation, requester, priority, status, assignee), `support_case_messages`
  (internal or customer-visible), case events; customers open and follow cases from a Help page in their workspace.
- **Dashboard**: organisations by type and status, paying vs trial, MRR (active plans as a monthly amount, before GST),
  trial conversion, churn, seat use, pending verifications, open cases — all calculated from live tables, no sample figures.
- Every staff action is written to `platform_audit_logs`.

## 5. Account bootstrap and first platform administrator

- **First administrator** (one-off, run by you): `scripts/bootstrap-super-admin.mjs` already exists — atomic, refuses if a super
  admin exists, requires `INITIAL_SUPER_ADMIN_EMAIL` and a ≥32-character `PLATFORM_BOOTSTRAP_SECRET`, requires a verified TOTP
  factor on that account, writes the platform audit log. Proposed hardening before use: run it only from a trusted machine
  against production with the secret supplied at run time (never stored), rotate/remove the secret afterwards, and record
  the run in the platform audit log (already done by the script). **Not run without your approval.**
- **Further staff**: invited by a super admin from the console with a role; the invitee must sign in and enrol TOTP before
  any console page loads (AAL2 already enforced); roles can be changed or revoked only by a super admin; every change is
  audited; staff accounts are reviewed quarterly (report in the console).
- **Separation**: a staff account has no customer-workspace membership by default; if a person is also a customer, the two
  roles never combine (platform checks read `platform_users`, workspace checks read `org_members`).
- **Break-glass**: emergency support access stays super-admin only, reason required, customer notified, audited (exists).

## 6. Data model and migration plan (not applied)

- New tables: `internal_prospects`, `internal_prospect_contacts`, `internal_activities`, `internal_tasks`, `support_cases`,
  `support_case_messages`, `support_case_events`, `platform_announcements`, plus the commercial tables in the billing design.
- Role list gains `sales_manager` (and `support_manager` if needed) — additive change to the `platform_users` role check.
- RLS: all internal tables RLS on, no client access; every route uses `authenticatePlatformAdmin([...roles], requireMfa)`;
  sales queries are scoped to own/unassigned prospects for executives; support sees customer data only through an active
  `support_access_grants` row (existing, time-limited, audited).
- Tests: role matrix (each role allowed/denied per route), no customer CRM table reachable from sales routes, support access
  expires on time, every write audited, customer owner without a platform role is refused everywhere in `/platform`.
- Rollback: additive tables and routes behind the console's role checks; removing a role's menu and routes disables it.

## 7. Phases (each its own PR)

1. Console core: real-figures dashboard, richer organisation list (type, plan, trial end, read-only state, seats),
   staff account management. (~3–4 days)
1b. Commercial control centre, initial release (packages, versions, prices, allowances, trial offers, contracts view, tax
   configuration, invoices/credit notes, gateway status, transactions, webhook monitor, refund approvals) — see the billing
   design for its own phases. (~2–3 weeks across several PRs)
2. Sales portal: prospects, contacts, activities, follow-ups, demo scheduling, pipeline, lost-reason report. (~4–5 days)
3. Support: cases, customer Help page, escalation, reports. (~3–4 days)
4. Verification queue, announcements, access-log view.

## 8. Decisions needed

1. Is your first sales hire a **sales manager** (sees all prospects) or **sales executive** (own + unassigned)?
2. May support staff also work sales prospects?
3. May finance staff change plans, or only you?
4. Customer support channel: in-app only, or in-app plus email replies?
5. Routes: under `/platform` (proposed) or `/internal`?
6. When will you create the first platform account in production?
