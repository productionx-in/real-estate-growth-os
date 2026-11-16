# REGrow — Competitor Research

**Accessed:** 2026-11-16 · **Method:** web search (search-engine summaries of the cited pages). Direct page fetches were
blocked by the research environment's network policy, so **vendor pages were not read first-hand**. Every fact carries a confidence:
**H** = official/primary or several independent consistent sources · **M** = consistent secondary sources · **L** = single, vendor-authored or aggregator source.
Prices are list/indicative, exclude GST unless stated, and **must be re-verified before use in sales material**.

---

## 1. Landscape in one picture

| Layer | Who | What they own |
|---|---|---|
| Global horizontal CRM | Salesforce, HubSpot, Zoho | Extensible CRM; real-estate workflows only via customisation/partners |
| India horizontal sales CRM (speed/telecalling) | LeadSquared, TeleCRM, Kylas, Privyr | Lead capture, distribution, calling, follow-ups — industry-agnostic |
| India real-estate CRM / ERP | **Sell.Do**, PropFlo, Buildesk, Leadrat, Makanify, Realatic, Farvision (ERP) | Developer workflows: inventory, site visits, bookings, CP portals, post-sales |
| CP networks / aggregators | Anarock CP, Square Yards, PropTiger partner hub, BeyondWalls, MyMagnet, PropertyPistol Syndicate; developer-owned CP portals (e.g. Godrej) | Broker access to inventory and payouts |
| Data / intelligence | Apollo (B2B people data), Propstack + Zapkey, Square Yards data (property transaction records), Power BI (BI tooling) | Data and analytics |

---

## 2. Competitor profiles

### 2.1 Sell.Do — the incumbent at our first customer
- **Target:** Indian developers, mid-to-large; also brokers (Broker App). Vendor claims 1,000+ real-estate companies (self-reported, L). [G2](https://www.g2.com/products/selldo)
- **Modules:** marketing automation, pre-sales, sales, inventory & negotiations, channel partners (CP login, white-label CP portal, RERA-ready logins, commission tracking), post-sales, communication, reporting. (M) [Sell.Do llms.txt](https://www.sell.do/llms.txt), [Inventory & booking](https://www.sell.do/real-estate-crm/inventory-booking)
- **Lead routing:** round-robin, skill & project routing, stickiness, NRI rules, capacity-aware assignment, timer-based escalation of unclaimed leads. (M) [Lead routing](https://www.sell.do/real-estate-crm/sales-and-pre-sales/lead-routing), [Lead distribution](https://www.sell.do/real-estate-crm/lead-distribution)
- **Integrations:** campaign "input channels" with unique URLs per source, auto-assign to a team; lead-ads sync; Broker App standalone or on Salesforce/SAP. (M) [Support: input channels](https://support.sell.do/support/solutions/articles/6000020882-add-campaign-step-4-configure-input-channels)
- **Pricing:** quote-based, per active user, **minimum 5 users**; AI and communication channels usage-based; CP/inventory/AI frequently priced separately. (M — vendor's own pricing page/blog) One aggregator cites ₹1,799/user/month (L). [Pricing](https://www.sell.do/pricing), [Pricing blog](https://www.sell.do/blog/real-estate-crm-pricing-india-2026)
- **Reviews:** G2 ≈4.8 (129 reviews); Capterra mostly 5★ (134 reviews); Techjockey 4.0 (145). (M)
- **Complaints:** limited customisation; UI "complex and tedious"; weak click-to-call/call logging/follow-up management; **cannot connect multiple Facebook ad accounts**; alert noise; changes shipped without notice; occasional slow support. (M) [Capterra reviews](https://www.capterra.com/p/151826/Sell-Do/reviews/), [Software Finder](https://softwarefinder.com/sales-tools/sell-do)
- **Implication for REGrow:** do not compete on breadth. Compete on simplicity, reliable mobile alerts, follow-up ergonomics, multi-account ad capture and *provable* response time.

### 2.2 LeadSquared
- **Target:** high-volume B2C sales (education, BFSI, healthcare, real estate). (M)
- **Pricing:** sales plans Lite/Pro/Super/Ultimate quoted; an authorised reseller lists Lite ~₹2,500/user/month annual, **20-user minimum** (L); USD aggregators show $25/$50–60/$100 (L). Marketing Pro ₹90,000/account/year (M). [Pricing](https://www.leadsquared.com/pricing), [Reseller](https://itforsme.in/pricing/leadsquared-india)
- **Strength:** lead distribution, telephony, field-force at scale. **Weakness for us to exploit:** minimums and implementation weight for 5–30-seat developers; not real-estate native.

### 2.3 TeleCRM, Kylas, Privyr (India speed-to-lead tools)
- **TeleCRM:** ~₹799/user/month annual (L); native IndiaMART, JustDial, MagicBricks, 99acres, Facebook sources; real-estate workflows. [TeleCRM](https://telecrm.in/blog/top-10-crm-software/)
- **Kylas:** general SMB sales CRM; ~₹12,999/month "Elevate" package (L, conflicting). [Capterra](https://www.capterra.com/p/210630/Kylas/reviews/6303641/)
- **Privyr:** mobile lead CRM for agents/small teams; team cap 20; WhatsApp lead distribution sold as a per-lead credit (~$0.10/lead, L). [Fitgap](https://us.fitgap.com/products/050184/privyr)
- **Implication:** the *lead-routing wedge alone* is being commoditised at ₹800–2,500/user. REGrow must not price or position as "another lead CRM"; it must sell a real-estate outcome and expand into operations and the CP network.

### 2.4 Indian real-estate specialists
| Vendor | Positioning | CP features | Price signal | Conf. |
|---|---|---|---|---|
| PropFlo (Hyderabad) | AI real-estate CRM, pre- to post-sales | CP mgmt, broker domains, CP mobile CRM, commissions | ₹1,200/month listing | L |
| Buildesk | CRM + ERP for builders | CP app: leads, visits, bookings, commissions, live inventory | ₹12,000/user/year | L |
| Leadrat | Builders + CPs, India & Dubai | yes | ₹22,990/month | L |
| Makanify | Builders & brokers | Partner portal, commission tracking, anti-poaching tagging | n/a | L |
| Realatic | Brokers handling several developers | Multi-developer dashboards, cross-project matching | n/a | L |
| Farvision (Gamut) | Construction & property ERP | n/a (ERP) | n/a | M |

Sources: [Techjockey](https://www.techjockey.com/category/real-estate-crm-software), [Leadrat list](https://leadrat.com/top-17-real-estate-crm-in-india-in-2026/), [Buildesk CP app](https://buildesk.in/channel-partner-application/), [Makanify](https://makanify.com/channel-partner-management-for-builders), [Realatic](https://realatic.com/solutions/brokers/)

### 2.5 Salesforce
- **Pricing (USD/user/month, annual):** Starter ~$25, Pro Suite $100, Enterprise ~$175 (after Aug-2025 +6%), Unlimited ~$350. (M) [Redress Compliance](https://redresscompliance.com/salesforce-sales-cloud-pricing.html)
- **Indian RE users:** Tata Realty (Agentforce, May 2026 — H) [Press release](https://www.salesforce.com/in/news/press-releases/2026/05/19/tata-realty-sets-new-benchmarks-in-ai-led-customer-experience/); M3M (H) [Story](https://www.salesforce.com/in/customer-stories/m3m-india/); Godrej Properties (M) [PCQuest](https://www.pcquest.com/godrej-properties-salesforce-crm-implementation/).
- **Counter-signal:** Marathon Realty replaced "years of Salesforce customisation" with Zoho (M) [Zoho case](https://prezohoweb.zoho.com/crm/customers/marathon-realty.html).
- **Lesson:** enterprise permission model and extensibility; **not** our segment for 2027.

### 2.6 HubSpot
- **Pricing (USD/seat/month):** Starter $9–20 (sources conflict), Professional ~$90–100, Enterprise ~$150; USD billing. (M) [HubSpot blog](https://blog.hubspot.com/sales/hubspot-sales-hub-pricing)
- **Lesson:** onboarding, freemium-to-paid ladder, modular "hubs". Not real-estate native.

### 2.7 Zoho CRM
- **Pricing (INR/user/month, annual, ex-GST):** Standard ₹800, Professional ₹1,400, Enterprise ₹2,400, Ultimate ₹2,600; monthly ₹1,300/2,100/3,000/3,200; free ≤3 users. (M) [Cloudfy guide](https://cloudfysystems.com/blog/zoho-crm-pricing-india-2026)
- **RE users:** Brigade Group, Marathon Realty (M). Lacks native inventory/site-visit/CP workflows (M).
- **Lesson:** the INR price anchor most Indian buyers will compare against.

### 2.8 Apollo.io (Buyer Intelligence hypothesis)
- **What it is:** B2B contact/company data. Basic $49 / Professional $79 / Organization $119 per user/month annual (M); per-endpoint API credit rates published Jul-2026 (L); USD only. [Pricing summary](https://fullenrich.com/content/apollo-pricing)
- **India fit:** coverage thins outside tier-1 and for SMEs/mobiles; mobile accuracy is the top complaint (M). [SyncGTM](https://syncgtm.com/blog/best-b2b-database-india)
- **Resale/embedding rights: NOT VERIFIED** (terms page could not be read). Enforcement signal: Apify removed Apollo scrapers for ToS breach (M). [API terms](https://www.apollo.io/terms/api)
- **Conclusion:** homebuyers are mostly *consumers*, not B2B contacts. Apollo is a poor fit for residential buyer intelligence and carries DPDP risk. See `STRATEGIC_RECOMMENDATIONS.md` §D6.

### 2.9 Power BI
- Pro $10→$14, PPU $20→$24 per user/month from 1-Apr-2025. (H) [The Register](https://www.theregister.com/software/2025/04/02/microsoft-ups-the-price-for-power-bi-pro-by-40-percent/881318). Embedded pricing not retrieved.
- **Lesson:** customers want answers, not a BI tool. Build opinionated in-product dashboards (speed-to-lead, source quality, inventory velocity) and offer CSV/API export for those who use Power BI.

### 2.10 CP networks
BeyondWalls, MyMagnet, PropertyPistol Syndicate, Anarock CP, Square Yards, PropTiger partner hub; large developers run their own CP portals (e.g. `cp.godrejproperties.com`). Brokers are advised to register each lead in both their own CRM and every developer's portal (M) [Sell.Do broker apps blog](https://www.sell.do/blog/top-real-estate-broker-apps-for-agents).
**Implication:** the "agency works across many developers" need is real and currently solved by *duplication of effort*. No source found offering an agency-owned CRM that acts as the system of record for multi-developer deal registration — a hypothesis to validate, not a proven gap.

---

## 3. Comparison matrix
✅ native · 🟡 partial / via add-on or customisation · ❌ not offered · ? unknown. Based on the sources above (confidence M/L unless noted).

| Capability | Sell.Do | LeadSquared | TeleCRM/Kylas | PropFlo / Buildesk | Salesforce | HubSpot | Zoho | REGrow today (`main`) | REGrow target |
|---|---|---|---|---|---|---|---|---|---|
| CRM / lead mgmt | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-source capture (Meta, Google, portals) | ✅ | ✅ | ✅ | ✅ | 🟡 | 🟡 | 🟡 | 🟡 code, not live | ✅ |
| Rule-based routing + SLA escalation | ✅ | ✅ | 🟡 | ? | 🟡 | 🟡 | 🟡 | ❌ | ✅ (MVP) |
| Follow-up reminders | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ (MVP) |
| Provable speed-to-lead metrics | ? | 🟡 | 🟡 | ? | 🟡 | 🟡 | 🟡 | ❌ | ✅ (MVP, differentiator) |
| Project management | ✅ | ❌ | ❌ | ✅ | 🟡 | ❌ | 🟡 | ✅ | ✅ |
| Inventory | ✅ | ❌ | ❌ | ✅ | 🟡 | ❌ | 🟡 | ✅ | ✅ |
| Holds / bookings | ✅ | ❌ | ❌ | ✅ | 🟡 | ❌ | 🟡 | 🟡 Phase 2 branch | ✅ |
| Collections / post-sales | ✅ | ❌ | ❌ | ✅ | 🟡 | ❌ | 🟡 | 🟡 Phase 2 branch | ✅ |
| CP management (developer side) | ✅ | 🟡 | ❌ | ✅ | 🟡 | ❌ | ❌ | 🟡 contact list | ✅ |
| Agency as independent org, multi-developer | ❌? | ❌ | ❌ | 🟡 | ❌ | ❌ | ❌ | ❌ | ✅ (differentiator) |
| Deal registration / lead protection | 🟡 tagging | ❌ | ❌ | 🟡 | 🟡 | ❌ | ❌ | ❌ | ✅ |
| Buyer intelligence | ❌ | ❌ | ❌ | ❌ | 🟡 | 🟡 | 🟡 | ❌ | 🟡 consent-based only |
| Business intelligence | 🟡 | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ opinionated |
| Automation | ✅ | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | ❌ (no runner) | ✅ |
| Integrations / API | ✅ | ✅ | 🟡 | 🟡 | ✅ | ✅ | ✅ | 🟡 | ✅ |
| Multi-tenant SaaS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ + cross-org |
| Pricing model | Quote/user, min 5 | Quote/user, min 20 (reseller) | ₹800/user or package | ₹/month or ₹/user/yr | $/user | $/seat | ₹/user | n/a | Org base + seats + usage (see BUSINESS_MODEL) |

## 4. Market gaps REGrow can realistically address
1. **Outcome-guaranteed speed-to-lead for 5–50-seat developers** — incumbents have the features; customers still lose leads. Gap = adoption, simplicity, proof. *(validated only by one customer so far)*
2. **Agency-owned, multi-developer deal registration** with protected lead ownership — today solved by duplicate registration across many developer portals. *(hypothesis — validate with 10 agencies)*
3. **Transparent INR pricing without 5–20-seat minimums** for small/mid developers in tier-1/tier-2 markets. *(validate in sales calls)*
4. **Lead-source ROI for the marketing agency** that runs the developer's ads — usually blamed for "junk leads" with no data. *(GTM channel, see GO_TO_MARKET)*
