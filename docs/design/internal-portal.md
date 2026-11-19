# Platform Admin Console and Internal Sales & Support Portal — plan (for approval)

Status: proposal, 19 Nov 2026. Separate workstream; no code until approved.

## 1. Three experiences, three permission systems

| Experience | Who | Where | Permissions from |
|---|---|---|---|
| **Platform Admin Console** | You and authorised platform administrators | `/platform` (exists, basic) | `platform_users` role + MFA |
| **Internal Sales & Support Portal** | INFYN sales and support employees | `/platform/sales`, `/platform/support` (same sign-in, separate menus) | `platform_users` role + MFA |
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

## 5. Phases (each its own PR)

1. Console core: real-figures dashboard, richer organisation list (type, plan, trial end, read-only state, seats),
   extend trial / change plan / add seats, staff account management. (~3–4 days)
2. Sales portal: prospects, contacts, activities, follow-ups, demo scheduling, pipeline, lost-reason report. (~4–5 days)
3. Support: cases, customer Help page, escalation, reports. (~3–4 days)
4. Verification queue, announcements, access-log view.

## 6. Decisions needed

1. Is your first sales hire a **sales manager** (sees all prospects) or **sales executive** (own + unassigned)?
2. May support staff also work sales prospects?
3. May finance staff change plans, or only you?
4. Customer support channel: in-app only, or in-app plus email replies?
5. Routes: under `/platform` (proposed) or `/internal`?
6. When will you create the first platform account in production?
