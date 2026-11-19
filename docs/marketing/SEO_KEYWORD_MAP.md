# REGrow website — keyword clusters, page map and content roadmap (implemented 19 Nov 2026)

One page per search intent. No duplicate landing pages, no location pages, no competitor names in navigation, titles or
copy. The page map in code is `lib/marketing/site-pages.ts`; capability claims come only from
`lib/marketing/capabilities.ts`. Keyword choices are based on the Indian real estate SaaS search intent researched in
`WEBSITE_SEO_AUDIT_2026-11.md`; search volumes were not measured (no keyword tool connected), so priorities reflect
intent and commercial value, not volume.

## Keyword clusters → pages

| Cluster | Representative queries | Page | Intent |
|---|---|---|---|
| Real estate CRM | real estate CRM software, property sales CRM, real estate lead management software, builder CRM software | `/real-estate-crm` | Commercial |
| Developer software | real estate developer software, builder sales management software, real estate sales team management | `/developers` | Commercial |
| Inventory management | real estate inventory management software, property inventory management software, builder inventory management, apartment inventory management, flat availability management, project-wise unit inventory | `/inventory-management` | Commercial |
| Inventory (informational) | how to manage real estate inventory, unit hold / blocking process, inventory absorption | `/resources/real-estate-inventory-management-guide` | Informational |
| Channel partner management | real estate channel partner management software, channel partner CRM, broker management software | `/channel-partner-management` | Commercial |
| Agency software | real estate agency management software, property broker lead management, channel partner CRM for agencies | `/agencies` | Commercial |
| Buyer registration (informational) | channel partner buyer registration process, broker registration conflicts | `/resources/channel-partner-buyer-registration` | Informational |
| Sales operations | real estate lead distribution, lead assignment rules, real estate sales tracking | `/sales-operations` | Commercial |
| Lead response (informational) | real estate lead response time, speed to lead real estate | `/resources/real-estate-lead-response-time` | Informational |
| Site visits and bookings | site visit management software, real estate booking management, booking and inventory tracking | `/site-visits-and-bookings` | Commercial |
| Analytics | real estate sales analytics, real estate sales reports | `/sales-analytics` | Commercial |
| Integrations | real estate CRM integrations, Meta lead ads CRM, property portal lead integration | `/integrations` | Commercial / navigational |
| Migration | CRM migration real estate, switch real estate CRM | `/migration` | Commercial |
| Brand / overview | REGrow, real estate growth operating system | `/`, `/features` | Navigational |

Not targeted (deliberately): "real estate project management software" in the construction sense. REGrow manages
sales-side projects (structure, inventory), not construction, so the term appears only where it is accurate.

## Implemented on every public page

- Unique `<title>` (≤ 80 characters) and meta description (70–200, mostly 145–170); canonical from the central URL
  configuration; Open Graph title, description and URL.
- One `h1`, sequential headings, breadcrumbs (visible and `BreadcrumbList`).
- Structured data: `Organization`, `WebSite`, `SoftwareApplication` everywhere; `WebPage` + `BreadcrumbList` on product,
  solution and resource pages; `Article` on guides. No ratings, reviews, awards, customer counts or prices.
  `FAQPage` is not used: FAQ rich results are restricted to authoritative government and health sites; the FAQs stay as
  visible content, which is what answer engines read.
- AEO: each product page opens with a direct answer ("What is real estate inventory management software?"), step-by-step
  workflow, capability list with honest status labels, FAQs written as real customer questions.
- AIO/GEO: consistent entity description (same descriptor, audiences and company on every page and in `/llms.txt`),
  capability register with explicit statuses, explicit "not available" list, cross-linked topic cluster
  (product page ↔ audience page ↔ guide).
- Indexing: every marketing page is listed once in `MARKETING_PATHS`, which drives public access (proxy), the sitemap,
  `robots.txt` allow list, the always-light theme and indexability. App, API, invitations and consoles stay `noindex`.
- Conversion: every product page has Book a demo, Request a consultation, Request a migration assessment and Contact the
  team; the demo form records which of these the visitor asked for.
- Prices: hidden until approved (`NEXT_PUBLIC_PRICES_PUBLISHED`), packages and inclusions still shown.

## Content roadmap (next articles, in priority order)

Each article must answer a real question from developers, sales managers or agencies and link to the product area it
relates to. One article per question; no location variants; written and reviewed by a person who knows the workflow.

| # | Working title | Answers | Links to |
|---|---|---|---|
| 1 | How to set up lead routing rules for a multi-project sales team | Who should get which lead, and how to keep it fair | `/sales-operations` |
| 2 | Site visit follow-up: what to do in the 48 hours after a visit | Turning visits into bookings | `/site-visits-and-bookings` |
| 3 | Unit holds and token amounts: a policy template for developers | How long to hold, when to release | `/inventory-management` |
| 4 | Choosing a real estate CRM: questions to ask before you buy | Selection criteria, without naming vendors | `/real-estate-crm`, `/migration` |
| 5 | Running a channel partner launch: sharing inventory and registrations | Partner operations at launch | `/channel-partner-management` |
| 6 | Sales team productivity in real estate: what managers should measure weekly | Metrics and review cadence | `/sales-analytics` |
| 7 | Moving from spreadsheets to a CRM without losing leads | Practical migration steps | `/migration` |
| 8 | Agency operations: managing buyers across several developers | Agency workflow | `/agencies` |
| 9 | Buyer consent and data protection in lead registration | DPDP Act basics for sales teams (legal review before publishing) | `/channel-partner-management` |
| 10 | Digital transformation in real estate sales: where to start | Prioritising changes | `/features` |

## External dependencies

- Production domain: canonical URLs, sitemap and Open Graph URLs use `NEXT_PUBLIC_SITE_URL`; until it is set they use
  Vercel's production domain.
- Search Console / Bing Webmaster verification and sitemap submission need the domain owner.
- Legal company details for Privacy Policy and Terms (they stay `noindex` until confirmed).
- Approved package prices before `NEXT_PUBLIC_PRICES_PUBLISHED` is turned on.
- Customer evidence (case studies, testimonials) only with customer permission — none is published.
