# REGrow — What We Learn From Each Platform (and How We Differ)

**Date:** 2026-11-16 · Rule: learn product *patterns*; never copy proprietary code, branding, UI assets or protected designs.
Phases: **P1** = REGrow Leads launch (M1–M3) · **P2** = 2027 expansion · **Later**.

| # | Platform → capability | Customer problem solved | REGrow's differentiated version | Phase | Licensing / privacy / IP concerns |
|---|---|---|---|---|---|
| 1 | **Sell.Do** → real-estate-specific lead routing (project/skill routing, stickiness, timed escalation) | Right rep gets the lead; unclaimed leads don't die | Same mechanics, plus **measured first-action time**, low-noise WhatsApp alerts, mandatory next follow-up, explainable "why assigned" log | P1 | None (generic pattern). Do not reuse Sell.Do UI/screens. |
| 2 | **Sell.Do** → CP login / white-label CP portal | Brokers see inventory, register leads | Agencies are **independent orgs** with their own CRM; developer shares projects explicitly; registrations are protected records | P2 | Agency data ownership must be contractual + enforced (RLS). |
| 3 | **Salesforce** → layered permission model (profiles, roles, sharing rules) | Enterprises control who sees what | Three separate layers: **entitlements** (org bought), **roles** (user can do), **relationship grants** (other org may access) — simple defaults, no admin consultant needed | P1 (roles) / P2 (grants) | None. |
| 4 | **Salesforce** → extensibility (custom objects/fields) | Every developer differs | Limited, typed custom fields on leads/units only; no arbitrary custom objects until enterprise demand | Later | Custom fields complicate RLS & migrations — keep bounded. |
| 5 | **HubSpot** → onboarding & time-to-value (guided setup, free tier ladder) | Small teams adopt without consultants | Guided "connect your first source in 5 minutes" setup; free **Leakage Audit** as top of funnel instead of a free tier | P1 | None. |
| 6 | **HubSpot** → modular "hubs" packaging | Buy only what you need | Families as modules with one entitlement system; never paywall reminders/assignment | P1 (entitlement helper) | None. |
| 7 | **Zoho** → affordable INR pricing, cross-product integration | Price-sensitive Indian SMBs | Transparent INR org pricing, no seat minimums; all modules share one data model (no sync) | P1 | None. |
| 8 | **Apollo** → credits & usage-based monetisation | Pay for expensive data only when used | Usage metering for variable-cost services (WhatsApp, telephony); credits only for licensed data | P1 (metering) / Later (data) | **Do not** assume API subscription grants resale; residential buyers ≠ B2B data; DPDP. |
| 9 | **Apollo** → provider integrations | Enrichment inside the workflow | Customer-owned API keys (licence stays with customer) | Later | Written provider terms required. |
| 10 | **Power BI** → semantic model + dashboards | Owners want answers across data | Opinionated built-in dashboards (speed-to-lead, source quality, inventory velocity, collections); CSV/API export for BI users | P1 (speed-to-lead) / P2 | Do not embed Power BI (licence cost per viewer); export instead. |
| 11 | **TeleCRM / Privyr** → mobile-first rep experience, WhatsApp-native | Field reps live on phones | PWA with ≤2 taps from alert to call; WhatsApp alerts and daily agenda | P1 | WhatsApp templates need approval; staff opt-in. |
| 12 | **CP aggregators (Anarock CP, BeyondWalls, MyMagnet)** → broker network access | Brokers find inventory; developers get reach | REGrow does **not** intermediate deals or take brokerage; it is neutral infrastructure owned by each party | Later | Avoid becoming a broker (RERA agent obligations). |

## Where REGrow deliberately differs
1. Sell the **outcome** (response time), measure it, show it.
2. **Agency independence** as an architectural property, not a portal login.
3. **No paywall on basic CRM hygiene.**
4. **Compliance by design** (processor role, consent, retention, audit) as a selling point for DPDP-era buyers in 2027.
