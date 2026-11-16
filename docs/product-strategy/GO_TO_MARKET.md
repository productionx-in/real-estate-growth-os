# REGrow — Go-to-Market: Sell Fast With Minimal Marketing

**Status:** Proposal · **Date:** 2026-11-16 · **Constraint from founders:** minimal paid marketing, minimal cold email/calls.

---

## 1. Principle: sell where the pain is already visible and someone else already has the relationship

A developer's lead-leakage problem is visible to three parties who are **not** the developer's CRM vendor:
1. **The performance-marketing agency** running the developer's Meta/Google ads — blamed for "junk leads" every month.
2. **The portal account managers** (99acres / MagicBricks / Housing) — blamed when "portal leads don't convert".
3. **The developer's own channel partners** — who see the developer's sales team ignore their walk-ins.

REGrow's fastest, cheapest path is to make these parties look good. Cold outreach to developers is the slowest path.

## 2. Ideal customer profile for the first 25 customers

| Attribute | ICP |
|---|---|
| Type | Real-estate developer (residential), 1–6 active projects |
| Geography | Hyderabad/Telangana first (founder proximity, same market as customer #1) |
| Sales team | 5–30 sales staff, at least one manager |
| Lead generation | Spends on Meta and/or Google lead ads and ≥1 portal; ≥300 leads/month |
| Current tool | Sell.Do, LeadSquared, TeleCRM, spreadsheets + WhatsApp groups |
| Trigger events | New project launch, CRM contract renewal, new marketing agency, sales head change, complaint about lead quality |
| Buyer | Sales head / marketing head; signer = owner/director |
| Disqualifiers | Needs full ERP/accounting on day 1; >100 seats; wants on-premise |

## 3. The five motions (ranked by speed × cost)

### Motion 1 — Lighthouse: customer #1 done perfectly (weeks 0–6)
- Run the 30-day success-criterion pilot (BUSINESS_MODEL §3). Measure **before** (from their Sell.Do export: time from lead
  creation to first activity) and **after** (REGrow first-action times).
- Deliverable: a one-page case study — "From X hours to Y minutes; Z% more leads reached; ₹W of ad spend rescued".
- Ask for introductions *on day 30, not day 300*: their marketing agency, their portal account managers, two developer peers.

### Motion 2 — Marketing-agency partner programme (highest leverage)
- Agencies serving real-estate developers each manage 5–30 developer accounts and own the lead pipe.
- Offer: free REGrow agency workspace showing **lead-quality and response-time reports for each developer client**
  ("prove your leads are good — and that the sales team is the bottleneck"), plus **20% recurring revenue share for 12 months** on referred customers.
- Ask: introduce REGrow when a developer complains about lead quality.
- Target: 5 agencies in Hyderabad in quarter 1. (Finding them: they are the agencies already running ads for customer #1 and its peers — no cold list needed.)

### Motion 3 — "Free Lead Leakage Audit" (the only outbound we do)
- A 48-hour diagnostic: the developer shares last month's lead export (any CRM or sheet); we return a 1-page report —
  median response time, % never contacted, leads by source untouched > 24 h, estimated ₹ of ad spend wasted.
- Delivered as a REGrow page; 70% of the work is automated from the CSV import we are building anyway.
- Converts curiosity into a quantified problem. Offered via agencies, CREDAI chapter events, and LinkedIn posts by founders.
- **Data handling:** process under a signed NDA/DPA, delete after the report (DPDP — we are a processor).

### Motion 4 — Founder-led content with proof (low cost)
- Two posts/week by founders on LinkedIn/WhatsApp groups: anonymised speed-to-lead data from audits and the lighthouse.
- One talk/demo at a CREDAI Hyderabad or real-estate marketers' meetup per quarter.
- No paid ads until CAC payback is proven < 6 months.

### Motion 5 — Switch offer for Sell.Do / LeadSquared users (at renewal)
- "Keep your CRM for post-sales; put REGrow in front of it for lead capture and response" (coexistence), or full migration with our importer.
- Time it to their renewal date (ask in every discovery call; keep a renewal calendar).

## 4. Sales process (founder-led, target cycle ≤ 3 weeks)
1. Intro (agency/referral) → 2. 30-min discovery (questions in LEAD_ENGINE_PRODUCT_SPEC §9) → 3. Leakage Audit (48 h) →
4. Demo on **their own data** → 5. Paid 30-day pilot with success criterion → 6. Annual conversion.

Collateral needed (built with Core-Skills, see §7): one-page case study, Leakage Audit report template, 2-minute demo video,
pricing page, pilot agreement + DPA, agency partner one-pager.

## 5. 90-day targets (to be agreed)
| Metric | Day 30 | Day 60 | Day 90 |
|---|---|---|---|
| Customer #1 live, success criterion met | ✅ | — | — |
| Agency partners signed | 1 | 3 | 5 |
| Leakage Audits delivered | 3 | 10 | 20 |
| Paid pilots | 1 | 3 | 6 |
| Paying customers | 1 | 3 | 5 |

## 6. Risks to the GTM
- **Customer #1 churns or the pilot fails** → no lighthouse. Mitigation: agree measurable criterion; founders on call during week 1.
- **Agencies see REGrow as a threat** (exposing bad lead quality). Mitigation: position reports as proof of *their* value; let them control what is shared.
- **Meta App Review delay** → bridge connector for Meta (spec §3.1).
- **Sell.Do counter-offers on price** at renewal. Mitigation: sell outcome + simplicity, not price.

## 7. Core-Skills toolkit to use for GTM execution (no changes to Core-Skills)
| Need | Skill |
|---|---|
| Pricing page & packaging tests | `/pricing`, `/offers` |
| Case study, one-pagers, positioning | `/product-marketing`, `/copywriting`, `/sales-enablement` |
| Agency partner programme | `/referrals`, `/co-marketing` |
| Landing page for Leakage Audit | `/cro`, `/signup` |
| WhatsApp nurture of trial users | `/whatsapp-marketing` |
| Launch plan | `/launch`, `/marketing-plan` |
| Measuring funnel | `/analytics` |
Brand work (REGrow identity) should start with `/brand-context`, which the other brand skills read.
