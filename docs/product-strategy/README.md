# REGrow by INFYN Group — Product Strategy

**Date:** 2026-11-16 · **Status:** Stage 3 (Decide) complete → awaiting founder review (Stage 4). No product code has been changed.

## Executive summary
1. **Sell the outcome, not the CRM.** Customer #1 asked for lead capture → assignment within minutes → follow-up reminders.
   Their current CRM (Sell.Do) already advertises those features, so feature parity will not win. REGrow's first product,
   **REGrow Leads**, promises and *proves* speed-to-lead: every lead to the right person in < 60 s, reassigned if not actioned in 5 minutes, every follow-up enforced.
2. **Most of the plumbing exists; the core of the ask does not.** Ingestion, deduplication, Google/web webhooks and the
   multi-tenant foundation are built. Routing rules, notifications, reminders, SLA timers, a job runner and response-time
   metrics are not. Meta needs App Review (start now; bridge via a connector meanwhile).
3. **Price:** ₹12,000/month per organisation including 10 users, ₹900/extra user, annual = 10 months, onboarding ₹25,000 (waived for founding customers). Never paywall reminders or assignment.
4. **Sell through people who already see the pain:** the developer's ad agency (revenue share), portal account managers,
   and customer #1's referrals, using a free 48-hour **Lead Leakage Audit** as the only outbound offer.
5. **Postpone Buyer Intelligence.** Apollo-style data is B2B, weak for Indian consumer mobiles, licence-restricted and DPDP-exposed.
6. **The long-term moat is the Partner Network** (agencies as independent orgs with protected, project-specific deal registration) — build it after REGrow Leads has paying customers.
7. **Fix security and CI first** (PRs #2 and #3), because REGrow Leads puts buyer PII on every salesperson's phone.

## Documents
| Document | Purpose |
|---|---|
| [LEAD_ENGINE_PRODUCT_SPEC.md](LEAD_ENGINE_PRODUCT_SPEC.md) | **The product to build first** — scope, flows, SLA design, data model, reuse vs build, acceptance criteria, customer discovery questions |
| [STRATEGIC_RECOMMENDATIONS.md](STRATEGIC_RECOMMENDATIONS.md) | SWOT, the ten decisions, next milestones, approvals needed |
| [BUSINESS_MODEL.md](BUSINESS_MODEL.md) | Packaging, pricing, founding-customer offer, unit-economics scenarios, market size |
| [GO_TO_MARKET.md](GO_TO_MARKET.md) | ICP, low-cost sales motions, 90-day targets |
| [COMPETITOR_RESEARCH.md](COMPETITOR_RESEARCH.md) | Evidence-graded competitor profiles and comparison matrix |
| [PRODUCT_INSPIRATION_AND_DIFFERENTIATION.md](PRODUCT_INSPIRATION_AND_DIFFERENTIATION.md) | What we learn from each platform and how we differ |
| [PRODUCT_VISION.md](PRODUCT_VISION.md) | Positioning, problems, segments, product families |
| [PRODUCT_ARCHITECTURE_ROADMAP.md](PRODUCT_ARCHITECTURE_ROADMAP.md) | Module map, phases, scalability architecture |
| [BRANDING_MIGRATION_PLAN.md](BRANDING_MIGRATION_PLAN.md) | Classified "Production X" inventory and a phased, safe rename to REGrow |

## Evidence conventions
Confidence **H/M/L** on every external fact; prices are indicative and must be re-verified; all economics are illustrative
scenarios with labelled assumptions. Research used search-engine summaries because direct page access was blocked in the
research environment — see STRATEGIC_RECOMMENDATIONS §5.
