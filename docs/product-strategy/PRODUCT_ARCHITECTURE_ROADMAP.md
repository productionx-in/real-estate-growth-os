# REGrow — Product Architecture & Roadmap

**Date:** 2026-11-16 · Principle: **simplest architecture that scales safely** — a modular monolith on the current stack
(Next.js on Vercel + Supabase Postgres/Auth), with explicit extraction boundaries. No microservices.

## 1. Module map and dependencies

```
                ┌───────────────── Platform core (exists) ─────────────────┐
                │ Orgs · Members/Roles · Seats/Billing · Audit · Auth/MFA   │
                │ + NEW: Entitlements · Jobs/Outbox · Notifications         │
                └──────────────┬───────────────────────────────┬───────────┘
          ┌────────────────────┼───────────────┐               │
   REGrow Leads (P1)     CRM & Sales (P2)   Operations (exists/P2)   Partner Network (P2)
   capture·routing·SLA   visits·pipeline    projects·inventory·       relationships·project grants·
   follow-ups·alerts     performance        holds·bookings·collections deal registration·commissions
          └────────── Intelligence: BI dashboards (P1→P2) · Market/Buyer data (Later) ──────────┘
```
Dependency rule: families depend on platform core, never on each other's tables directly — they call module services.
Partner Network depends on Operations (projects/inventory) and Leads (registrations reference leads by id, never copy them).

## 2. Phased roadmap
| Phase | Window (est.) | Scope | Gate |
|---|---|---|---|
| **M0 Hardening** | 1 week | PR #2, PR #3 merged after review; 0035 applied to prod (approval required); fix lead-list over-exposure & cross-tenant FK gaps; entitlement helper skeleton | Advisor clean; CI truthful |
| **M1 Capture & Route** | ~3 weeks | Teams, routing rules, round robin/availability, notifications outbox, web push, WhatsApp staff alerts, source verification (Google, web, portals, Meta bridge) | Customer #1 live on all sources |
| **M2 Respond & Follow up** | ~3 weeks | Job runner (pg_cron), SLA escalation, dispositions, follow-up tasks/reminders, daily agenda, mobile PWA | Pilot criterion measurable |
| **M3 Prove & Repeat** | ~2–3 weeks | Speed-to-lead & source dashboards, Sell.Do importer, owner summary, Leakage Audit report, native Meta | Case study; self-serve onboarding for #2–#3 |
| **P2a Sales** | Q1–Q2 2027 | Site visits, pipeline, team performance, telephony integration | 10 paying customers |
| **P2b Operations** | Q2 2027 | Harden & merge Phase 2 (fix 0034 RPC grants, direct-DML policies, add DB tests) | Security review passed |
| **P2c Partner Network** | Q2–Q3 2027 | `org_relationships`, `project_partner_grants`, `deal_registrations` (protection windows, dispute workflow), agency workspace | 10 agency interviews validate need |
| Later | 2028+ | Market/buyer intelligence (licensed), enterprise (SSO, custom roles), regional expansion, extraction of workers if needed | — |

## 3. Scalability architecture (recommendations)
| Area | Recommendation |
|---|---|
| Multi-tenant DB | Shared schema, `org_id` on every row, RLS enabled on every table **with tests per table** (the PR #2 incident shows the cost of skipping this). Composite indexes leading with `org_id`. |
| Isolation enforcement | Server-side checks (`lib/auth/tenant.ts`) **and** RLS that actually matches (`profiles.auth_user_id = auth.uid()` via helper functions — fix the 23 dead policies). Minimise service-role use to RPCs with explicit checks. |
| Cross-org relationships | `org_relationships(developer_org, agency_org, status)` → `project_partner_grants(relationship, project, permissions, expires_at)` → `deal_registrations(agency_org, agency_lead_ref, project, buyer_disclosed_fields, protected_until, status)`. Developer sees only disclosed fields; agency lead row never leaves agency tenancy. |
| Roles | Keep org roles; add team roles (manager of team) for routing/visibility; project-scoped access table for large orgs. |
| Entitlements | `modules`, `plan_modules`, `org_module_entitlements` (source: plan / add-on / trial / override) + one `requireModule()` server helper + DB function for RLS where needed. Separate from roles and relationship grants. |
| Billing & metering | Keep existing invoice/payment model (0031–0032); add `usage_events` (org, meter, quantity, idempotency_key) aggregated monthly. Payment gateway (Razorpay) when self-serve billing is needed. |
| Jobs | `scheduled_jobs` table + `pg_cron` every minute → worker; `SKIP LOCKED`; idempotent handlers; dead-letter after N attempts. |
| Notifications & webhooks | Transactional outbox; delivery workers per channel; provider message ids; retries with backoff. |
| Integrations | Keep the existing inbound framework (signature verification, rate limits, event log, dedup). Version outbound webhooks (`v1` payloads) — and rename `x-px-*` headers now while no subscriber exists. |
| API versioning | `/api/v1` exists; additive changes only within a version; deprecation headers. |
| Audit | Append-only audit tables with UPDATE/DELETE-blocking triggers (exists only for platform logs — extend to lead activities, assignments, registrations, payments). |
| Data retention | Per-org retention settings; scheduled purge/anonymisation jobs (DPDP). |
| Backups / DR | Supabase Pro PITR before first paying customer; quarterly restore drill; documented RPO/RTO. |
| Observability | Structured logs with org_id/request_id; error tracking (e.g. Sentry); SLO dashboards: ingest→alert latency, job lag, webhook failure rate. |
| Performance | Index on (`org_id`, `assigned_to`, `sla_state`, `next_follow_up_at`); keyset pagination; materialised daily metrics for dashboards. |
| Security testing | Real-DB RLS tests per table (pattern from PR #2), cross-tenant negative tests per API, dependency scanning, Supabase advisor in CI. |
| Regional expansion | Single region (Supabase in ap-south-1 is preferable for India latency — current prod is ap-northeast-1; evaluate migration before scale) ; per-region deployments only for data-residency demands. |
| Enterprise customisation | Typed custom fields, configurable pipelines/dispositions, SSO (SAML) — not custom code per customer. |

## 4. Extraction boundaries (only if load requires)
1. Notification delivery worker (high fan-out, provider rate limits).
2. Inbound webhook ingestion (burst traffic from ad campaigns).
3. Reporting/analytics (read replica or warehouse).
Each already sits behind a table-based interface (outbox, inbound event log, materialised metrics), so extraction is a deployment change, not a rewrite.
