# REGrow — Strategic Recommendations

**Status:** For founder review · **Date:** 2026-11-16 · Evidence: see COMPETITOR_RESEARCH.md (confidence-graded) and the repository audit.

---

## 1. SWOT

| | Helpful | Harmful |
|---|---|---|
| **Internal** | **Strengths**<br>• A paying customer ready now, with a concrete, measurable need.<br>• Solid multi-tenant foundation already built: org isolation, closed-SaaS provisioning, seats, audit logs, inbound webhook framework, deduplication, project/inventory model.<br>• Real-estate-specific data model (projects → hierarchy → units) that horizontal tools lack.<br>• Architecture designed from day one for **independent agencies + cross-org permissions** — rare in this market.<br>• Lean cost base; Supabase + Vercel scale cheaply to hundreds of orgs. | **Weaknesses**<br>• Nothing yet notifies, reminds or escalates — the core of the customer's ask is unbuilt.<br>• Meta integration not live (central app unregistered, no App Review).<br>• Portal parsers unverified against real payloads.<br>• Test suite historically did not exercise production code; CI masked failures (fixed in PR #3, pending merge).<br>• Live security exposure in production (fix in PR #2, pending).<br>• No brand, case study, website or references yet; small team. |
| **External** | **Opportunities**<br>• Developers' cost per lead is rising while volumes fall (2025 top-7 sales −14% units, +6% value — ANAROCK) → wasted leads hurt more.<br>• Incumbent users complain about complexity, alert noise, weak calling/follow-up, multi-ad-account gaps.<br>• Marketing agencies are an untapped, motivated distribution channel.<br>• Agencies juggle many developer portals; no agency-owned multi-developer system found.<br>• INR transparent pricing without seat minimums is uncommon among RE specialists. | **Threats**<br>• Sell.Do already has routing/escalation features; it can match price at renewal.<br>• Commodity lead CRMs (TeleCRM ~₹799/user, Privyr, Kylas) compress the wedge's price.<br>• Large CP aggregators (Anarock, Square Yards, PropTiger) own broker relationships.<br>• Meta platform dependency (App Review, policy changes, pricing).<br>• DPDP obligations from ~May 2027 and TRAI telemarketing rules raise compliance cost.<br>• Founder bandwidth: building, selling and supporting simultaneously. |

**SWOT strategy:** Use the *paying customer + foundation* (S) to attack *incumbent usability gaps* (O) with an
**outcome promise**, not feature parity (counter to T1/T2). Use *agencies as channel* (O) to offset *no brand* (W).
Fix *security/CI* (W) before putting lead PII on phones.

---

## 2. Decisions

Each: recommendation · reasoning · alternatives considered · main risks · evidence strength / validation needed.

### D1. First paying segment
**Recommendation:** Residential **developers with 5–30 sales staff running paid lead generation**, Hyderabad first.
- *Why:* the ready customer is one; the pain is acute and measurable; developer is the economic buyer and the hub that later brings agencies onto the network.
- *Alternatives:* (a) CP agencies first — strongest long-term differentiation, but lower ARPA, many small buyers, and the network is worthless without developers on it; (b) large developers — long cycles, Salesforce incumbency.
- *Risks:* wedge commoditisation. *Evidence:* one customer + market signals (M). *Validate:* 10 discovery calls/audits in 60 days.

### D2. Initial ICP
See GO_TO_MARKET §2. **Disqualify** anyone needing ERP/accounting or >100 seats in 2027.

### D3. Minimum commercially valuable product (MCVP)
**REGrow Leads** (LEAD_ENGINE_PRODUCT_SPEC): multi-source capture → rule routing → instant mobile/WhatsApp alert →
5-minute SLA with reassignment/escalation → mandatory next follow-up + reminders → speed-to-lead dashboard.
- *Why:* exactly the customer's request, framed as a provable outcome.
- *Alternative:* full CRM + inventory + bookings first (the Phase 2 path) — slower to revenue and not what the buyer asked for.
- *Risk:* too thin vs. Sell.Do. Mitigation: proof metrics + simplicity + coexistence mode.

### D4. Core subscription contents
All lead sources, routing, SLA escalation, reminders, mobile app, dashboards, CSV/Sell.Do import, audit log, 10 users.
**Never paywall:** reminders, assignment, deduplication, basic reports (brief requirement; also our differentiation vs add-on-heavy incumbents).

### D5. Paid add-ons
Extra seats; REGrow Sales; Operations (inventory/bookings/collections); Partner Network; usage (WhatsApp beyond allowance, telephony); Enterprise.

### D6. Buyer Intelligence
**Recommendation: postpone prospect-data products; do not integrate Apollo for residential buyers.**
- *Why:* Apollo is B2B professional data with weak India mobile coverage (M); residential buyers are consumers; resale/embedding rights unverified; DPDP core duties and penalties (up to ₹250 Cr) ~May 2027 (M); TRAI restricts promotional calling (H).
- *Do instead (2027+):* consent-based enrichment of customers' own leads; licensed property-transaction market data (Propstack/Zapkey, Square Yards) under written redistribution licence; customer-owned API keys.
- *Validate:* legal opinion on processor vs. fiduciary roles; written terms from any provider.

### D7. Initial pricing model
Org base **₹12,000/month incl. 10 users**, ₹900/extra user, annual = 10× monthly, ₹25,000 onboarding (waived on annual for founders' cohort), usage pass-through for WhatsApp/telephony. See BUSINESS_MODEL.
- *Alternatives:* pure per-user (₹1,200/user) — market-standard but discourages logins; flat unlimited — under-monetises large teams.
- *Validate:* price with customers #1–5; watch objections at ₹12k vs ₹9k vs ₹15k.

### D8. Deliberately postpone
Buyer/prospect intelligence; lead marketplace; AI scoring; native mobile apps; ERP/accounting; marketing drips; microservices;
multi-region; custom-field builder; Phase 2 bookings merge (keep branch, harden later); full rebrand of infrastructure names.

### D9. Competitive differentiation
1. **Provable speed-to-lead** — response-time SLA with automatic reassignment and owner-level proof.
2. **Low-noise, WhatsApp-native workflow** for field sales teams.
3. **Transparent INR org pricing, no 5–20-seat minimums.**
4. **Later, the moat:** agencies as independent organisations with protected, project-specific deal registration across many developers — cross-org permissions designed in, not bolted on.

### D10. Architecture for the next 12–24 months
**Modular monolith** on the current stack (Next.js + Supabase Postgres + Vercel), with: Postgres job table + `pg_cron` worker,
transactional outbox for notifications/webhooks, RLS + server-side authorisation on every new table, entitlement checks in one
server helper, and clear module boundaries (`leads`, `routing`, `notifications`, `operations`, `partners`, `billing`). No microservices.
Extraction candidates *only if* load demands: notification delivery worker, webhook ingestion. See PRODUCT_ARCHITECTURE_ROADMAP.

### Next three product milestones
| # | Milestone | Exit criterion |
|---|---|---|
| **M0** (prerequisite, ~1 wk) | Merge PR #2 & #3 after review; apply 0035 to prod; fix `GET /api/leads` exposure and cross-tenant FK gaps; start Meta Business Verification + App Review | Security advisor clean for exposed tables; CI truthful |
| **M1** (~3 wks) | Lead capture + routing + instant alerts: Google, website, generic webhook (Meta bridge), 99acres/Housing verified; teams, rules, round-robin, availability; in-app + web push + WhatsApp alerts | Customer #1 receives all sources; p95 ingest→alert ≤ 60 s |
| **M2** (~3 wks) | SLA escalation + follow-ups: job runner, dispositions, reminders, reassignment, daily agenda; mobile PWA polish | 30-day pilot criterion measurable; reminders ≤ 60 s late |
| **M3** (~2–3 wks) | Proof & scale: speed-to-lead and source-quality dashboards, Sell.Do import, owner weekly summary, native Meta (if review passed), Leakage Audit report | Case study published; customers #2–3 onboarded without engineering help |

Durations are estimates for a small team and assume no scope additions.

---

## 3. Decisions requiring founder approval
1. **Wedge-first strategy** (REGrow Leads before CRM/Operations/Partner Network).
2. **Pricing:** ₹12,000/month incl. 10 users; founding-customer terms.
3. **Postpone Buyer Intelligence**; no Apollo integration.
4. **Phase 2 stays parked** (not merged) during M1–M3.
5. **Meta:** register INFYN Group business on Meta, complete Business Verification, submit App Review (owner action, requires company documents).
6. **WhatsApp Business account** for REGrow staff alerts (owner action: Meta Business, display name "REGrow", template approvals).
7. **Domains:** choose the production domain(s) for REGrow (blocks branding migration of URLs/emails).
8. **Agency revenue-share programme** (20% recurring, 12 months).
9. **Branding migration plan** (BRANDING_MIGRATION_PLAN.md) — approve phases 1–2.

## 4. Unresolved questions (need data)
- Why exactly is customer #1 leaving Sell.Do; renewal date; replace vs coexist?
- Customer #1 volumes, seats, sources, ad spend, telephony, success criterion.
- Founders' fixed monthly burn (drives break-even).
- Legal entity for contracts/DPAs (INFYN Group entity name) and GST registration for invoicing.
- Whether 99acres/Housing push payloads match our parsers (needs a live test enquiry).

## 5. Research limitations
Web research used search-engine summaries; vendor pages, Apollo terms and government gazettes were not read first-hand
because the research environment blocks direct fetches. Confidence levels are marked throughout. Before any public claim
or contract, verify the specific source.
