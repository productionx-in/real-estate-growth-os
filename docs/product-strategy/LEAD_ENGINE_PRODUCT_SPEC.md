# REGrow Lead Engine — Product Design (MVP for first paying customer)

**Status:** Design proposal for founder approval · **Date:** 2026-11-16 · **Owner:** REGrow by INFYN Group
**Scope:** The first sellable REGrow product. Nothing in this document is implemented yet.

---

## 1. The customer's request, restated as an outcome

> "Source all leads from Meta, Google and real-estate portals, assign them to salespeople within minutes,
> and remind them to follow up."

The customer is buying **speed-to-lead and follow-up discipline**, not a list of features.

Critical finding: their current CRM, Sell.Do, already advertises round-robin, project/skill routing, lead stickiness,
capacity-aware assignment and timer-based escalation of unclaimed leads ([Sell.Do lead routing](https://www.sell.do/real-estate-crm/sales-and-pre-sales/lead-routing),
[Sell.Do lead distribution](https://www.sell.do/real-estate-crm/lead-distribution), accessed 2026-11-16 via search summary, confidence M).
So **parity will not win**. The design therefore optimises for three things Sell.Do users publicly complain about —
complexity, notification noise, and weak calling/follow-up ergonomics ([Capterra](https://www.capterra.com/p/151826/Sell-Do/reviews/),
[G2](https://www.g2.com/products/selldo), confidence M) — and for **provable response time**.

**Product promise (proposed):** *"Every lead reaches the right salesperson in under 60 seconds, and nobody can sit on it.
If a lead isn't called in 5 minutes, it moves — and the manager sees it."*

> ⚠️ Must validate before building (see §9): **why** this customer is leaving Sell.Do. If the true reason is something
> else (price, contract renewal, support, a specific broken integration), the MVP scope changes.

---

## 2. Users and jobs

| User | Job to be done | Where they work |
|---|---|---|
| **Sales executive** (pre-sales / tele-caller / closing exec) | Know instantly a lead arrived, call it, record outcome, never miss a follow-up | Phone (mostly Android), WhatsApp |
| **Sales manager / team lead** | Ensure no lead is ignored; balance load; see who is slow | Phone + laptop |
| **Marketing head / agency** | Know which source/campaign produces real leads, not junk | Laptop |
| **Owner / director** | Am I losing money on ads because nobody calls back? | Phone, weekly glance |
| **REGrow admin (customer side)** | Connect sources, set routing rules, manage team | Laptop, one-time setup |

---

## 3. MVP scope (what ships to the first customer)

### 3.1 Lead sources (ingest)

| Source | Mechanism | Needs from customer | Lead time / risk |
|---|---|---|---|
| **Google Ads lead forms** | Google POSTs to our webhook URL with a shared key (`google_key`) | Paste URL + key into each lead-form asset | **Low.** No Google review. Code exists (`app/api/webhooks/google`). |
| **Website / landing pages** | Our embeddable form or plain HTML POST | Add snippet | **Low.** Exists (`app/api/forms/submit`, `app/forms/embed.js`). |
| **99acres, Housing.com** | Portal pushes enquiries to our webhook (configured in seller dashboard) | Access to their portal accounts; one live test enquiry each | **Medium.** Our portal parsers (`lib/integrations/portals/*`) were written without real payload samples — must be verified against live payloads. |
| **MagicBricks** | Push set up via MagicBricks account manager | Customer requests it from their account manager | **Medium–High** (third-party dependency). |
| **Email-parsing fallback** | Inbound address per customer; parse portal notification emails | Auto-forward rule in their mailbox | Fallback when a portal won't push. Not built. |
| **Meta (Facebook/Instagram) lead ads — native** | Webhook + Graph API retrieval via central REGrow Meta app | Connect Page(s) & ad account(s) via OAuth | **High.** Requires Meta **Business Verification + App Review for `leads_retrieval`, `pages_manage_ads`** with a recorded screencast ([Meta docs](https://developers.facebook.com/docs/development/release/access-verification/)). Duration not published. **Start immediately.** |
| **Meta — bridge for day 1** | Customer's existing Meta→CRM connector (Zapier/Pabbly/LeadsBridge) or Meta's CRM-integration feature posts to our **generic signed webhook** | One connector setup | **Low.** Generic inbound webhook exists (`app/api/webhooks/inbound/[connectionId]`). Replaced by native once App Review passes. |
| **Manual + CSV/Excel import** | UI form / bulk import | — | Exists. |
| **Sell.Do history import** | CSV export from Sell.Do → mapped import, preserving owner & source | Sell.Do export | Small build on existing import. |

Must support **multiple Meta ad accounts and Pages per customer** (an explicit Sell.Do complaint).

### 3.2 Ingest pipeline (per lead, target < 5 s)
1. Verify signature/key, rate-limit (exists).
2. Normalise: phone → E.164 (+91 default), name casing, source/campaign/ad/form attribution.
3. **Deduplicate** (exists: `lib/integrations/deduplication.ts` — external-event dup, same-customer re-enquiry, separate enquiry).
   Re-enquiry by a known buyer → **sticky** to the existing owner, bump priority, notify owner ("returning lead").
4. Map to project (exists: `integration_project_mappings` by form/campaign/portal id).
5. **Route** (§3.3) → assign → **notify** (§3.4) → start **first-response SLA timer** (§3.5).
6. Write immutable activity trail (`lead_activities`).

### 3.3 Routing rules (simple by default, powerful when needed)

Ordered rule list per organisation; first match wins:

- **Match on:** project, source, campaign/form, language, budget band, city/NRI flag, time of day.
- **Target:** a **team** (new) → member selection strategy:
  - *Round robin* (default) — weighted, skips unavailable members.
  - *Least open leads* (today's DB trigger behaviour, kept as an option).
- **Availability:** on-duty toggle in the app, working hours per team, leave dates, **daily capacity cap**.
- **Stickiness:** known buyer → previous owner if active (configurable window, e.g. 90 days).
- **Fallback:** no one available → team manager + "unassigned" queue with alert.

Replaces the current project-blind `auto_assign_lead()` trigger (migration 0008/0017) with an application-level router that is testable and auditable. Every assignment records *why* (rule id, strategy) in `lead_assignments`.

### 3.4 Notifications (the differentiator is reliability + low noise)

Channels, in order of reliability for Indian field sales teams:

| Channel | Use | Cost (indicative) | Notes |
|---|---|---|---|
| **WhatsApp utility template to the salesperson** | "New lead: Name, project, source — tap to call" | ~₹0.115/message India utility rate ([BSP summary](https://baat.ai/blog/whatsapp-api-pricing-india), confidence M; verify on Meta rate card) | Needs REGrow WhatsApp Business account + approved templates + rep opt-in. Highest open rate. |
| **Web push (installed PWA)** | Real-time alert with action buttons | Free | Android works well; iOS requires PWA installed (iOS 16.4+). |
| **In-app inbox** | Source of truth for all alerts | Free | Exists nowhere today — build. |
| **Email** | Manager digests only | ~Free | Exists (`lib/email/adapter.ts`). |
| SMS | Not in MVP | — | India DLT registration overhead; WhatsApp covers the need. |

**Noise control (answering the "alerts bug a lot" complaint):** one alert per event per person, quiet hours outside the
person's shift (queued to shift start), escalation goes to **one** manager not the whole team, and a daily 9 AM agenda
instead of dozens of overdue pings.

### 3.5 First-response SLA and escalation (the core of the promise)

Per-team configurable; default:

| T+ | If lead still has no first action* | Action |
|---|---|---|
| 0 | — | Assign + notify owner |
| 3 min | none | Second nudge to owner (push + WhatsApp) |
| 5 min | none | **Reassign** to next available member (round robin), notify both, log SLA breach |
| 10 min | none | Notify team manager; lead marked **"At risk"** |

\* *First action* = a logged call attempt (tap-to-call from the app), WhatsApp click, or disposition. MVP cannot prove a
call connected; that needs cloud telephony (Phase 2, §7). We measure **"first action time"** honestly and say so.

Outside working hours: SLA clock starts at shift start; an optional auto-WhatsApp acknowledgement to the **buyer**
("Thanks for your interest in <Project>, our advisor will call you at 10 AM") — requires buyer-facing WhatsApp template and consent notice (see §8).

### 3.6 Follow-ups and reminders
- After every call attempt the rep must pick a **disposition** (2 taps): Connected-Interested / Callback / Not reachable /
  Not interested / Junk / Site visit fixed. Each disposition (except terminal ones) **requires a next follow-up time**.
- Reminders: 15 min before follow-up (push + in-app), WhatsApp if still not done 15 min after due, manager sees overdue list.
- Not-reachable cadence: auto-schedule retries (e.g. +2 h, next morning, +2 days) — configurable.
- **Daily 9 AM agenda** per rep on WhatsApp: "Today: 6 follow-ups, 2 overdue, 1 site visit."

### 3.7 Salesperson app (mobile-first PWA, no app-store dependency)
Screens: **Now** (new + overdue), **Today** (scheduled), **Lead** (one-tap Call / WhatsApp, disposition, next follow-up, notes, history), **On-duty toggle**.
Design target: a new lead is actioned in **≤ 2 taps** from the notification.

### 3.8 Manager & owner dashboard
- **Speed-to-lead:** median and 90th-percentile first-action time; % within 5 min — by rep, team, source, project, hour.
- **Leakage:** unattended leads, SLA breaches, reassignments, overdue follow-ups.
- **Source quality:** leads, junk %, connected %, site-visit % by source/campaign → "which ad spend is wasted".
- **Weekly owner email/WhatsApp summary** (single number: "92% of leads called within 5 min; 14 leads at risk").

### 3.9 Explicitly NOT in the MVP
Inventory, holds, bookings, collections, channel-partner network, deal registration, buyer intelligence, AI scoring,
marketing drips, telephony, native iOS/Android apps, custom fields builder. (All remain on the roadmap; none is needed to deliver the promise.)

---

## 4. Reuse vs build (evidence from repository audit, `main` @ 6aa536e)

| Capability | Status | Evidence |
|---|---|---|
| Multi-tenant orgs, invites, seats, roles | ✅ Reuse | `lib/auth/tenant.ts`, migrations 0025–0032 |
| Inbound webhook framework, HMAC/key verification, rate limiting | ✅ Reuse | `lib/integrations/inbound.ts`, `webhooks/*`, migration 0019 |
| Deduplication | ✅ Reuse | `lib/integrations/deduplication.ts` |
| Google lead-form webhook | ✅ Reuse, verify live | `app/api/webhooks/google/*` |
| Website forms + embed | ✅ Reuse | `app/api/forms/submit`, `app/forms/embed.js` |
| Portal webhooks | ⚠️ Rewrite parsers against real payloads | `lib/integrations/portals/*` |
| Meta OAuth/webhook | ⚠️ Code exists; **central app not registered**, no App Review | `lib/integrations/meta/*`; `PROJECT_STATUS.md` §4 |
| Project mapping of sources | ✅ Reuse | `integration_project_mappings` |
| Lead CRM UI (list, detail, notes, status) | ✅ Reuse, simplify for mobile | `app/(dashboard)/[orgSlug]/leads/*` |
| Assignment | ❌ Replace | DB trigger `auto_assign_lead()` is org-wide, project-blind, no availability |
| Teams / reporting lines | ❌ Build | none |
| Follow-up date, tasks, reminders | ❌ Build | no column/table exists |
| Notifications (any channel to staff) | ❌ Build | none |
| SLA timers / scheduled jobs | ❌ Build | no scheduler executes anything (workflow engine has `delay_scheduled` but no runner) |
| Response-time metrics | ❌ Build | none |

**Engineering prerequisites (must be done first):** merge PR #2 (live RLS exposure) and PR #3 (CI integrity) after review;
fix the `GET /api/leads` over-exposure and cross-tenant FK gaps found in the audit, because this product puts lead PII on every phone.
**Phase 2 (bookings) is NOT a prerequisite** — keep it parked.

---

## 5. Data model additions (proposal; all tables RLS-enabled from day one with tests, per PR #2 lesson)

- `teams`, `team_members` (role in team, weight, daily_capacity, is_on_duty)
- `team_schedules` (working hours, timezone `Asia/Kolkata`), `member_leaves`
- `routing_rules` (org, priority, match JSON, team_id, strategy, sticky_days, active, version)
- `leads` + columns: `first_action_at`, `sla_due_at`, `sla_state`, `next_follow_up_at`, `priority`, `source_detail` (campaign/ad/form ids)
- `lead_tasks` (follow-ups: due_at, type, status, completed_at, created_by_rule)
- `lead_dispositions` (or typed `lead_activities` entries — preferred: extend `activity_type`)
- `notifications` (recipient, type, payload, read_at), `notification_deliveries` (channel, provider_message_id, status, attempts) — idempotent by (`event_id`, `recipient`, `channel`)
- `push_subscriptions` (per device), `member_contact_channels` (WhatsApp opt-in timestamp)
- `scheduled_jobs` (due_at, kind, payload, locked_until, attempts) — the SLA/reminder engine

---

## 6. Architecture decisions for the MVP

| Decision | Recommendation | Why | Alternative rejected |
|---|---|---|---|
| Job runner for SLA/reminders (needs ~1-minute precision) | **Postgres job table + Supabase `pg_cron` (every minute) invoking a worker** (Supabase Edge Function or authenticated Next.js route via `pg_net`), `FOR UPDATE SKIP LOCKED` claiming | Stays inside the existing stack; transactional with lead state; Phase 2 already uses SKIP LOCKED pattern | GitHub Actions cron (best-effort, ≥5 min, already noted as unreliable in repo); Vercel Hobby cron (daily only); new queue vendor (unnecessary now) |
| Routing location | Application service (TypeScript) called inside the ingest transaction via an RPC that locks the team's round-robin cursor | Testable, explainable, versioned rules | Keep DB trigger (opaque, project-blind) |
| Notification fan-out | Outbox table written in the same transaction as the assignment; worker delivers | No lost alerts, idempotent retries | Calling WhatsApp inline in the webhook request |
| Mobile | PWA (Next.js) with Web Push | No app-store delay; one codebase | Native apps (later, if telephony/call-log needs them) |
| Meta | Bridge via generic webhook now; native after App Review | Removes the biggest schedule risk from the first sale | Waiting for App Review before go-live |

---

## 7. Phase 2 of the Lead Engine (after first customer is live)
- **Cloud telephony** (Exotel / Knowlarity / Ozonetel — evaluate): click-to-call masking, call recording, *proven* connected-call response time, missed-call capture as a lead source. Biggest upgrade to the promise.
- Native Meta (post App Review), MagicBricks/other portals, JustDial/IndiaMART if relevant.
- AI: lead quality scoring from dispositions; call-summary notes (only with consent).
- Buyer-facing WhatsApp acknowledgement and nurture (consent-based).
- Two-way sync with Sell.Do or other CRMs for customers who keep their CRM for post-sales (coexistence mode).

---

## 8. Compliance built into the design
- **DPDP Act 2023 / Rules 2025:** REGrow is the customer's **data processor**; the developer is the data fiduciary. Need: DPA with each customer, purpose-limited processing, retention settings, deletion on request, breach-notification runbook. Core duties apply ~May 2027 (confidence M; verify Gazette).
- **TRAI TCCCPR (2025 amendment):** REGrow does not place calls in MVP; when telephony is added, promotional calling must respect the 140-series/DLT rules ([TRAI PR 11/2025](https://cms.trai.gov.in/sites/default/files/2025-02/PR_No.11of2025.pdf)).
- **WhatsApp:** staff alerts use utility templates with staff opt-in; buyer messages only with consent and approved templates.
- Lead PII on phones: short-lived sessions, no PII in push payload previews by default (configurable), audit log of exports.

---

## 9. Validation required before build (questions for the customer — 45-minute discovery call)
1. **Why are you leaving Sell.Do?** What exactly fails today? (Ask for 3 recent examples of lost/late leads.)
2. When does the Sell.Do contract end? Will Sell.Do keep running for inventory/bookings/post-sales? (Determines replace vs coexist.)
3. Monthly lead volume per source; number of projects; number of sales users, managers, shifts; languages.
4. Monthly ad spend on Meta and Google; who runs the ads (in-house or agency)?
5. Current response time (do they know it?) and their target.
6. Which portals, and do they already receive push/real-time leads from them?
7. Telephony in use (personal mobiles? cloud telephony?).
8. Who is the buyer and who signs? Budget expectation; payment preference (monthly/annual).
9. Success criteria for a 30-day pilot (e.g. "≥90% leads actioned within 5 min").

**Acceptance criteria for MVP go-live (proposed):**
- p95 ingest-to-notification ≤ 60 s for Google, website, portal and bridged Meta leads over 7 consecutive days.
- 0 lost leads (every received webhook reconciles to a lead or an explicit duplicate/rejection log).
- SLA reassignment fires within 60 s of breach; follow-up reminders within 60 s of due.
- Customer can see per-rep first-action times for every lead.
