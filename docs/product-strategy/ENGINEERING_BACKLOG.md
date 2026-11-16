# REGrow — Engineering Backlog (M0 → M3, then Phase 2)

**Status:** Approved direction (founders, 2026-11-16) · Source of scope: LEAD_ENGINE_PRODUCT_SPEC.md, STRATEGIC_RECOMMENDATIONS.md
**Sizing:** S ≤ 1 day · M 2–3 days · L ~1 week (single engineer with AI assistance; estimates, not commitments)
**Owner:** ENG = engineering · FND = founders (business/account actions) · CUS = customer #1
**Definition of done (every engineering item):** RLS + server-side authorisation on any new table/route · real-DB test for
every new table/RPC including a cross-tenant negative test · tests import production code · CI green under pipefail ·
no production migration/merge/deploy without explicit founder approval.

---

## M0 — Hardening (prerequisite) · target: 1 week

| ID | Item | Owner | Size | Status | Acceptance criteria |
|---|---|---|---|---|---|
| M0-1 | Fix live subscription-catalog exposure (migration 0035) | ENG | M | ✅ merged (PR #2), live in prod | anon has no privilege on the 3 tables; seat reservation & provisioning unaffected (36 real-DB checks) |
| M0-2 | CI must not mask failures; fix 3 hidden failing DB suites | ENG | M | ✅ merged (PR #3) | pipefail on all steps; all Phase 1 DB suites pass from clean reset on Node 20 |
| M0-3 | Active-membership enforcement across API + page guard | ENG | M | ✅ merged (PR #4) | 26 lookups + 3 deny-list checks require `status='active'`; regression guard test |
| M0-4 | Sales write role gates (readonly refused; CP creation manager+) | ENG | S | ✅ merged (PR #4) | unit tests on real `lib/auth/permissions.ts` |
| M0-5 | Cross-tenant FK triggers on 6 sales tables (migration 0036) | ENG | M | ✅ merged (PR #4), live in prod | 24 real-DB checks; fail without migration |
| M0-6 | **Review & merge** #2 → #3 → #4 (retarget #4 to main) | FND | S | ✅ done 2026-11-16 (approved) | merged in order; Vercel production deploys succeeded for 5b555ee, 96eccc3, f1607ac |
| M0-7 | **Apply 0035 (+0036) to production** | FND+ENG | S | ✅ done 2026-11-16 (auto-applied on merge — see note) | Supabase advisor no longer reports `rls_disabled_in_public` for the 3 tables; read-only verification queries recorded |
| M0-8 | Enable Supabase leaked-password protection; review 14 mutable-search-path functions | ENG | S | todo | advisor warnings cleared or justified |
| M0-9 | **Meta Business Verification + App Review** (`leads_retrieval`, `pages_manage_ads`, `pages_show_list`, `pages_read_engagement`, `ads_management` as needed) for app named **REGrow** | FND | — (calendar time) | todo — start now | Business verified; App Review submitted with screencast; privacy policy + data-deletion URLs live on REGrow domain |
| M0-10 | REGrow WhatsApp Business account + display name + utility templates (`new_lead_alert`, `lead_reassigned`, `followup_due`, `daily_agenda`) | FND | — | todo | templates approved |
| M0-11 | Decide REGrow production domains & email sending domain (SPF/DKIM/DMARC) | FND | — | todo | domains chosen; DNS configured |
| M0-12 | Supabase Pro with PITR backups before customer #1 go-live; consider region (prod is `ap-northeast-1`; India users favour `ap-south-1`) | FND+ENG | S | todo | PITR on; region decision recorded |

> **Deployment fact discovered during M0 (2026-11-16):** merging to `main` automatically applies new
> `supabase/migrations/*` to the **production** database (migration 0035 appeared in
> `supabase_migrations.schema_migrations` within a minute of merging PR #2; 0036 likewise after PR #4) and Vercel deploys
> the app to production. There is **no staging step**. Until a staging project exists, every PR that adds a migration
> must be treated as a production change: real-DB tests in CI, a read-only production pre-check, and explicit founder approval
> before merge. New backlog item **M0-13**.

| ID | Item | Owner | Size | Status | Acceptance criteria |
|---|---|---|---|---|---|
| M0-13 | Create a Supabase **staging** project (or Supabase branching) + Vercel preview env bound to it; require migrations to pass staging before `main` | FND+ENG | M | todo | a PR's migration runs on staging automatically; production only on merge |

### M0 customer actions (in parallel)
| ID | Item | Owner |
|---|---|---|
| C-1 | 45-minute discovery call (questions in spec §9); agree 30-day pilot success criterion | FND + CUS |
| C-2 | Sell.Do lead export (last 90 days) for baseline response-time measurement and import | CUS |
| C-3 | Portal accounts: 99acres / Housing.com dashboard access for webhook setup; MagicBricks account-manager contact | CUS |
| C-4 | Google Ads lead-form asset list; Meta Pages/ad accounts list; current Meta→CRM connector in use | CUS |
| C-5 | Team roster: users, roles, teams, shifts, projects each team handles | CUS |

---

## M1 — Capture & Route · target: ~3 weeks after M0

| ID | Item | Size | Acceptance criteria |
|---|---|---|---|
| M1-1 | `lib/brand.ts` + Branding Phase 1 (UI/email copy → REGrow) | S | grep shows no "Production X" in user-visible strings (BRANDING_MIGRATION_PLAN class A–C) |
| M1-2 | Teams: `teams`, `team_members` (weight, daily capacity, on-duty), `team_schedules`, `member_leaves` + admin UI | L | RLS + tests; manager can manage only own org teams |
| M1-3 | Routing rules engine: ordered rules (project/source/campaign/language/budget), round-robin cursor (row-locked), least-open option, stickiness window, fallback queue; `lead_assignments.reason` | L | deterministic tests incl. concurrency (two leads, one cursor); explainable "why assigned" |
| M1-4 | Replace `auto_assign_lead()` DB trigger with the router (feature-flagged per org) | M | old trigger disabled only for orgs on the router; migration reversible |
| M1-5 | Notification outbox: `notifications`, `notification_deliveries` (idempotent per event/recipient/channel) + in-app inbox UI | M | no duplicate alerts on retry; RLS: users read only their own |
| M1-6 | Web Push (VAPID) + `push_subscriptions` + PWA manifest/service worker | M | Android Chrome receives alert ≤ 10 s after assignment |
| M1-7 | WhatsApp staff alerts via approved utility templates; staff opt-in capture | M | delivery status stored; opt-out honoured |
| M1-8 | Job runner: `scheduled_jobs` + `pg_cron` (1-min) → worker with `SKIP LOCKED`, retries, dead-letter | M | job lag p95 < 60 s; idempotent handlers; tests |
| M1-9 | Source verification with live payloads: Google lead form (key check), website form, generic signed webhook (Meta bridge), 99acres, Housing.com; parsers fixed against captured samples | L | each source → lead in < 5 s; payload fixtures committed (PII-scrubbed) |
| M1-10 | Phone normalisation (E.164, +91 default) + dedup on normalised phone; returning-lead stickiness alert | S | tests incl. Indian number formats |
| M1-11 | Ingest reconciliation: every inbound event → lead / duplicate / rejection record | S | "0 lost leads" report query |
| M1-12 | E2E HTTP security tests (Playwright, real sessions): deactivated user 403, readonly sales write 403, cross-tenant ids 400 | M | runs in CI against local stack |
| M1-13 | Fix the 23 dead RLS policies (`profile_id = auth.uid()`) on 0020/0022/0023/0024 tables using `auth_is_member_of_org` / `auth_has_role_in_org` with per-command policies | M | real-DB RLS tests as `authenticated` per table |
| M1-14 | Entitlement helper skeleton: `modules`, `org_module_entitlements`, `requireModule()`; seed `leads` module for all orgs | M | route-level check + tests; separate from roles |
| M1-15 | Branding Phase 2: contracts (`rg_live_` keys, `x-regrow-*` headers, embed IDs) with dual acceptance; remove insecure default webhook secret | M | old & new accepted for 90 days; tests |

**M1 exit:** customer #1's sources all flow; p95 ingest → first alert ≤ 60 s over 7 days.

---

## M2 — Respond & Follow up · target: ~3 weeks

| ID | Item | Size | Acceptance criteria |
|---|---|---|---|
| M2-1 | Lead columns: `first_action_at`, `sla_due_at`, `sla_state`, `next_follow_up_at`, `priority` (+ indexes leading with `org_id`) | S | migration + backfill safe on prod |
| M2-2 | SLA engine: 3-min nudge, 5-min reassign, 10-min manager alert; shift-aware clock | L | timing tests with fake clock; reassignment audited |
| M2-3 | Dispositions (2-tap) with mandatory next follow-up for non-terminal outcomes | M | cannot save a non-terminal disposition without a follow-up time |
| M2-4 | `lead_tasks` + reminders (T-15, overdue +15) + not-reachable retry cadence | M | reminders fire within 60 s of due |
| M2-5 | Daily 9 AM agenda (WhatsApp + push) per rep; quiet hours | S | one message per rep per day |
| M2-6 | Rep PWA screens: Now / Today / Lead / On-duty; tap-to-call (`tel:`) and WhatsApp (`wa.me`) logging as first action | L | new lead actioned in ≤ 2 taps from notification |
| M2-7 | Buyer acknowledgement WhatsApp (optional, consent notice) | S | template approved; off by default |

**M2 exit:** pilot success criterion measurable from the product.

---

## M3 — Prove & Repeat · target: ~2–3 weeks

| ID | Item | Size | Acceptance criteria |
|---|---|---|---|
| M3-1 | Speed-to-lead dashboard (median/p90 first action, % ≤ 5 min by rep/team/source/project/hour) | M | numbers reconcile with raw activity data |
| M3-2 | Source-quality dashboard (junk %, connected %, site-visit %) | M | per campaign/form |
| M3-3 | Owner weekly summary (WhatsApp/email) | S | single headline metric + at-risk count |
| M3-4 | Sell.Do importer (CSV) preserving owner, source, created_at, history notes | M | dry-run preview; idempotent re-import |
| M3-5 | Lead Leakage Audit report generator from any CSV export | M | 1-page report in < 2 min |
| M3-6 | Native Meta lead ads (after App Review), multiple ad accounts/Pages per org | M | bridge connector retired for customer #1 |
| M3-7 | Self-serve onboarding: connect-a-source wizard, routing templates | M | customer #2 onboarded without engineering |
| M3-8 | Observability: error tracking, SLO dashboard (ingest→alert, job lag, webhook failures), alerting to founders | M | alerts tested |
| M3-9 | DPDP basics: DPA template, retention settings, deletion workflow, export audit log | M | legal review of templates (FND) |

---

## Phase 2 backlog (2027, after REGrow Leads has paying customers)

| ID | Item | Notes |
|---|---|---|
| P2-1 | Cloud telephony (Exotel/Knowlarity/Ozonetel evaluation): masked click-to-call, recording, connected-call SLA | strongest upgrade to the promise |
| P2-2 | **Phase 2 branch hardening before merge:** 0034 RPCs → service_role-only or `auth.uid()` membership checks; revoke direct DML on payments/milestones/audit; add 0034 to CI with real-DB tests; fix `GET /api/leads` over-exposure (Phase 2 only); renumber 0033/0034 after 0035/0036 | security findings C2–C4 from handover audit |
| P2-3 | Main's non-atomic hold flow (`blockInventoryUnit` check-then-insert race) — superseded by Phase 2 `hold_inventory_unit_atomic`; do not ship holds to customers before P2-2 | |
| P2-4 | Immutable audit triggers on `lead_activities`, `lead_assignments`, `inventory_status_history`, payments, registrations | |
| P2-5 | Site visits, pipeline, team performance (REGrow Sales) | |
| P2-6 | Partner Network: `org_relationships`, `project_partner_grants`, `deal_registrations` (protection windows, dispute workflow), agency workspace | validate with 10 agencies first |
| P2-7 | Billing: usage metering (`usage_events`), Razorpay, invoices for add-ons | |
| P2-8 | Hygiene: constant-time cron-secret comparison; receipt numbering via sequence; archive superseded root docs | |

## Order of work this week
1. ~~FND: review/merge #2 → #3 → #4~~ (done 2026-11-16). FND: start M0-9/M0-10/M0-11/M0-13 (calendar-time items).
2. FND+CUS: discovery call (C-1) and data requests (C-2…C-5).
3. ENG: M0-8, then M1-1, M1-8 (job runner) and M1-9 (source verification) as soon as customer payload samples arrive.
