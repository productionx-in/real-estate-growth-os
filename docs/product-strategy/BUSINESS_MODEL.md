# REGrow — Business Model, Pricing & Unit Economics

**Status:** Proposal for founder approval · **Date:** 2026-11-16
**Important:** All prices are *proposals* and all economics are *illustrative scenarios built on stated assumptions*.
None of this is company performance data. Replace assumptions with real numbers as soon as they exist.

---

## 1. Model: hybrid, organisation-first

Our starting hypothesis (hybrid modular SaaS) holds, with three corrections from the research:

1. **Organisation base fee + included seats + extra seats**, not pure per-user. Per-user pricing makes customers ration
   logins — fatal for a product whose value is "every salesperson gets every lead instantly". The codebase already models
   `included_seats + additional_seats` (migrations 0025–0032), so this costs nothing to implement.
2. **Outcome-anchored, not feature-anchored.** Price against the cost of lost leads (ad spend), not against Zoho's ₹800/user.
3. **Usage only where our cost is variable** (WhatsApp messages, telephony minutes, data enrichment). Never meter basic CRM
   actions (reminders, assignment) — the brief already rules this out and it is a competitive weakness of Sell.Do (AI/comms add-ons).

## 2. Packaging (proposed)

| Package | For | Includes | Proposed list price (INR, ex-GST) |
|---|---|---|---|
| **REGrow Leads** *(launch product)* | Developers/agencies running paid lead gen with 5–30 sales staff | All lead sources, routing + SLA escalation, follow-ups & reminders, mobile PWA, manager dashboard, Sell.Do/CSV import, 10 users | **₹12,000 / month** (annual prepaid: ₹1,20,000/yr = 2 months free) |
| Extra users | — | — | ₹900 / user / month |
| **REGrow Sales** *(next)* | Developers wanting full CRM | Leads + site visits, pipeline, team performance, 20 users | ₹24,000 / month |
| **REGrow Operations** add-on | Developers | Projects, inventory, holds/bookings, collections | + ₹10,000 / month per org (≤5 active projects), project tiers above |
| **REGrow Partner Network** add-on (developer side) | Developers with CPs | Agency onboarding, project sharing, deal registration, protection windows, commissions | + ₹8,000 / month |
| **REGrow for Agencies** | Independent CP agencies | Agency CRM, multi-developer registrations, commission tracking, 5 agents | ₹4,999 / month; agents ₹600/user. **Free tier** for agencies invited by a paying developer (limited to that developer's projects) — network seeding |
| **Enterprise** | 100+ seats, multiple cities | SSO, custom roles, data residency options, SLA, API volume | Quote |

**Usage (pass-through + margin):** staff WhatsApp alerts — 5,000/month included per org, then at cost + 20%;
buyer-facing WhatsApp — at cost + 20%; telephony minutes (Phase 2) — at cost + margin; data enrichment — credits (§5).

**One-time onboarding:** ₹25,000 (source connections, routing setup, Sell.Do data import, team training).
Waived for annual prepay during the founding-customer period.

### Why these numbers (anchors, all to be validated)
| Anchor | Evidence | Conf. |
|---|---|---|
| Sell.Do ~₹1,799/user/month → ~₹18,000 for 10 users, min 5 users | Aggregator | L |
| Zoho CRM Professional ₹1,400/user/month (no real-estate workflows) | Several consistent guides | M |
| TeleCRM ~₹799/user/month (commodity lead CRM) | Aggregator | L |
| LeadSquared Lite ~₹2,500/user/month, 20-user minimum | Reseller | L |
| Indian RE CRM band ₹700–3,000+/user/month | Vendor-neutral roundup | L |

REGrow Leads at ₹12,000 for 10 users = **₹1,200/user effective**: below Sell.Do, above commodity tools, justified by the
real-estate-specific outcome. Customer value check: a developer spending ₹5,00,000/month on ads who rescues even 5% of
leaked leads recovers ~₹25,000/month of ad value — 2× the subscription (illustrative).

## 3. Founding-customer offer (first customer and next 4)
- 30-day paid pilot at ₹12,000 (credited to the annual plan if they convert), **success criterion agreed up front**
  (e.g. "≥90% of leads actioned within 5 minutes by day 30").
- Annual plan price locked for 24 months; onboarding waived.
- In return: named case study with before/after response-time data, 2 reference calls, weekly 30-minute feedback session.
- Do **not** discount below list on monthly price — discount via onboarding waiver and price lock (protects future pricing).

## 4. Revenue streams ranked by timing
1. Subscription — REGrow Leads (now).
2. Onboarding/implementation fees (now).
3. Seat expansion as sales teams grow (now).
4. Usage pass-through (WhatsApp now; telephony Phase 2).
5. Module upsell — Sales, Operations, Partner Network (2027).
6. Agency subscriptions via network effect (2027).
7. API/integration tier (only when customers ask).
8. Intelligence credits (only after legal review — see §5).

## 5. Buyer Intelligence — commercial model recommendation
- **Do not** build a prospect-list product on Apollo or similar for residential buyers: wrong data category (B2B), thin India
  coverage, unverified resale rights, and DPDP exposure (see STRATEGIC_RECOMMENDATIONS §D6).
- **Do** offer (later): (a) consent-based enrichment of the customer's *own* leads; (b) market intelligence from licensed
  property-transaction datasets (Propstack/Zapkey, Square Yards data) **only under a written redistribution licence**;
  (c) **customer-owned API keys** for any third-party enrichment provider, so the licence relationship is theirs, not ours.
- Preferred model when it happens: **hybrid** — customer-owned keys by default; centrally managed credits only where a provider grants a written resale/embedding licence.

## 6. Unit economics — illustrative scenarios

### Assumptions (replace with actuals)
| Assumption | Conservative | Base | Aggressive | Basis |
|---|---|---|---|---|
| ARPA (MRR per org) | ₹10,000 | ₹15,000 | ₹25,000 | Package mix: Leads only → Leads + seats/add-ons |
| Infra cost per org/month | ₹1,500 | ₹1,000 | ₹800 | Supabase Pro + Vercel Pro amortised over customers (assumption) |
| WhatsApp alerts per org/month | ₹600 | ₹400 | ₹400 | ~4,000 utility msgs × ~₹0.115 (M) |
| Support cost per org/month | ₹2,500 | ₹1,500 | ₹1,500 | Founder/CS time allocation |
| **Gross margin** | **~54%** | **~81%** | **~89%** | (ARPA − above)/ARPA |
| CAC (founder-led + referral) | ₹1,00,000 | ₹60,000 | ₹30,000 | Time + demos + travel; agency-referral channel lowers it |
| Monthly logo churn | 3% | 2% | 1.5% | SMB SaaS norms (assumption) |
| Fixed monthly burn (team, tools) | ₹6,00,000 | ₹4,00,000 | ₹4,00,000 | **Founders to supply** |

### Outputs
| Metric | Conservative | Base | Aggressive |
|---|---|---|---|
| Gross profit per org/month | ₹5,400 | ₹12,100 | ₹22,300 |
| CAC payback | ~18.5 months | ~5 months | ~1.3 months |
| LTV (GP ÷ churn) | ₹1.8 L | ₹6.05 L | ₹14.9 L |
| LTV : CAC | 1.8 | 10.1 | 49.6 |
| **Break-even customers** (fixed burn ÷ GP/org) | **~111** | **~33** | **~18** |
| Customers at month 12 (assumed ramp) | 10 | 25 | 50 |
| MRR at month 12 | ₹1.0 L | ₹3.75 L | ₹12.5 L |

**Reading:** the conservative case fails mainly because of *support cost at low ARPA*. The business only works if
(1) onboarding is productised (self-serve source connection, templates) and (2) ARPA rises through seats and add-ons.
Those two levers matter more than list price.

## 7. Market size for the launch wedge (illustrative, bottom-up)
- Telangana RERA portal: ~11,000+ registered projects, ~5,200–5,300 registered agents (L — blogs citing the portal; verify on rera.telangana.gov.in).
- Assume 2,000–3,000 distinct active promoters in Telangana and that 10–20% run paid lead generation with ≥5 sales staff → **200–600 ICP organisations** in the launch state.
- At ₹15,000 ARPA → ₹30 L–₹90 L MRR serviceable in Telangana alone; Maharashtra (MahaRERA ~32,000 active agents, M) and Bengaluru are the next markets.
- Top-7-city housing: 3,95,625 units sold in 2025 (−14%), value > ₹6 lakh crore (+6%) — ANAROCK (H). Falling volumes + rising prices = developers spend more per lead and **care more about not wasting leads** — supportive of the wedge.

## 8. What would change this model
- If the first customer's reason for leaving Sell.Do is price → lean harder on transparent pricing.
- If agencies, not developers, show the strongest pull → lead with REGrow for Agencies and use developer modules as upsell.
- If telephony is a must-have for proof of response → bring Phase 2 telephony forward and price it as included minutes.
