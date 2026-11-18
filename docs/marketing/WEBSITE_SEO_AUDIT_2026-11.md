# REGrow public website — research and audit (SEO, AEO, AIO/GEO, CRO)

Date: 18 Nov 2026 · Scope: research only — no website content, code or production changed.
Evidence labels used throughout: **[Verified-code]** read in the repository · **[Verified-local]** measured on a local
production build · **[Verified-prod]** read-only query of the production database · **[External]** third-party web
sources (mostly vendor-written; treated as claims) · **[Estimate]** · **[Recommendation]**.

**Data limits, stated up front.** No keyword-volume or difficulty tool was reachable from this session (the Ahrefs /
Similarweb connectors failed to connect), and no Search Console or analytics data exists in the repository. So this
report contains **no search-volume, difficulty, ranking or traffic numbers** — keyword work below is qualitative
(intent, SERP composition, competitor coverage). The production Vercel project was not visible to this account, so
domain and environment settings could not be read; URL findings come from code.

---

## Summary — the ten things that matter most

1. **Search engines can barely see the site.** There is no `robots.txt`, no sitemap, no canonical tags, no Open
   Graph/Twitter tags and no structured data on any page; every unknown URL (including `/robots.txt` and
   `/sitemap.xml`) redirects to `/login`. Only five public pages exist. [Verified-local]
2. **The site positions REGrow as "lead routing", not as a Real Estate Sales Operating System.** The homepage H1 is
   "Every lead called in minutes, not hours." Nothing on the site mentions the channel partner network, inventory,
   site visits, bookings, documents or analytics — the things that differentiate REGrow from a generic CRM. [Verified-code]
3. **Several claims are wrong in both directions.** Follow-up reminders, 5-minute escalation and the speed-to-lead
   dashboard are labelled "COMING SOON" but are built; meanwhile Meta, Google, 99acres, MagicBricks, Housing.com and
   WhatsApp are presented as working sources, but **no lead has ever arrived through any integration in production**
   (0 of 26 leads have a capture timestamp; the only connections are two Meta rows, disabled / not connected). [Verified-code, Verified-prod]
4. **Pricing copy contradicts the decided commercial rules.** "Is there a free trial?" → "30-day paid pilot"; agencies
   "can start on a free workspace" (contradicts "every organisation has its own subscription", DEC-022); a ₹25,000 setup
   fee exists only on the website, not in the billing catalogue. Plan prices themselves match production exactly. [Verified-code, Verified-prod]
5. **There are no Privacy Policy or Terms pages**, while the demo form and leakage audit collect personal data. This is a
   trust, ads-policy and DPDP Act exposure, and a prerequisite for SEO credibility. [Verified-code]
6. **Customer-copied embed / webhook code hard-codes domains** (`app.productionx.com`, `api.productionx.in`) that may not
   be the live domain. If wrong, customers' website forms and WhatsApp webhooks would post to the wrong host. [Verified-code — needs confirmation of the real domain]
7. **Buyer-facing project microsites (`/p/<project>`) are blocked by the sign-in redirect** — the "Digital Showroom"
   feature cannot be seen by buyers or crawlers. (Product bug, outside SEO, but it blocks a public channel.) [Verified-local]
8. **The SERP is crowded with vendor-written "best real-estate CRM in India" lists, most written by Sell.Do**, which also
   owns comparison pages against LeadSquared, Zoho and Salesforce. REGrow's credible angle is not "best CRM" but the
   connected developer–agency network with independent tenants, which no listed competitor describes that way. [External]
9. **Google stopped showing FAQ rich results in 2026** (secondary sources citing Google's documentation notice). FAQ
   content is still worth writing for answer engines, but FAQPage schema should not be sold internally as a ranking tactic. [External — confirm on Google Search Central before relying on it]
10. **Performance is not the problem.** Local lab LCP 84–180 ms, CLS 0–0.016, ~134 KB on the homepage. Fix
    discoverability, positioning and truthfulness first. [Verified-local; field Core Web Vitals unavailable]

---

## A. Public website inventory

Public routes per `proxy.ts`: `/`, `/pricing`, `/demo`, `/leakage-audit`, `/login`, `/auth/*`, `/invite/*`, `/d/<token>`
(shared documents), embed assets (`/capture.js`, `/forms/embed.js`, `/forms/view`). Everything else redirects to
`/login?redirectTo=…` with HTTP 307 — including `/p/<project>`, `/robots.txt`, `/sitemap.xml`, `/llms.txt` and 404s.

| Route | Purpose | Segment | Current search intent served | Primary message | Conversion goal | Main problems | Recommendation |
|---|---|---|---|---|---|---|---|
| `/` | Homepage | Developers mostly; agencies mentioned once | Brand only (no category intent targeted) | "Every lead called in minutes, not hours." Lead capture + routing | Book a demo | Narrow positioning (routing tool); integration claims not proven in production; stale "coming next" items; Sell.Do section is an in-page anchor; no trial/demo-explore paths; no OG/canonical/schema; no images (no product screenshots); H2 in all caps ("ONE INBOX…") | Reposition as Real Estate Sales OS; three CTAs; verified claims only; product screenshots; Organization + SoftwareApplication schema |
| `/pricing` | Plans | Agencies, developers, enterprise | "REGrow pricing" (brand) | "One price for the whole sales team" | Talk to us / Book a demo | Stale COMING SOON labels; "free trial → paid pilot" FAQ; free agency workspace claim; ₹25,000 setup fee not in catalogue; ROI calculator "recovers 6.3× its cost" framing (labelled estimate — acceptable but keep) | Align with DEC-022 (14-day free trial once sign-up ships); remove unsupported offers; add Independent CP only after launch |
| `/demo` | Demo request form | All | "REGrow demo" (brand) | "See every lead reach the right person in seconds" | Demo request | "Online booking is being set up" (unfinished); interest radio says "for Agencies / Leads / Enterprise" (plan names, not needs) | Keep short; add current-CRM options (already partly there); remove the unfinished line; confirmation page with next steps |
| `/leakage-audit` | Free in-browser audit tool | Developers with exports | "lead leakage audit" (low demand, niche) | "How many of your leads are never called back?" | Demo after audit | Good, genuinely useful tool; thin page copy (145 words); no explanation of method | Keep; add method explanation and link from content |
| `/login` | Sign in | Customers | — | "Welcome back" | Sign in | Title "Sign In" (no brand); should be `noindex`; no "Create a free workspace" / "Explore demo" links (planned) | `noindex`; add trial + demo links when sign-up ships |
| `/d/<token>` | Shared documents | Buyers | — | — | — | Must stay `noindex` | Add `noindex` header |
| `/p/<project>` | Project microsite | Buyers | Project-name searches (customers' brand traffic) | — | Enquiry | **Blocked by sign-in redirect** | Product fix; then decide indexing per customer (opt-in) |
| *Missing* | Privacy, Terms, About/Company, Contact, Developers, Agencies, Channel partner network, Features, Switch-from-Sell.Do, Resources | — | — | — | — | Do not exist | See K, L |

Navigation [Verified-code]: How it works (`/#how-it-works`), Features (`/#features`), Switching from Sell.Do (`/#switch`),
Pricing, Sign in, Book a demo. Three of four nav items are anchors on one page, so there is effectively one indexable
commercial page. Footer: same anchors, leakage audit, demo, sign in, © company. No legal links.

Duplicate / cannibalisation: none today (too few pages). Risk once pages are added: homepage vs Developers page both
targeting "real estate CRM for builders" — see the keyword map in C.

---

## B. Homepage — section-by-section audit

| # | Section (current wording, abridged) | Audience | Weakness | Recommendation | Claims to verify |
|---|---|---|---|---|---|
| 1 | Eyebrow "For real-estate developers and channel partners"; H1 "Every lead called in minutes, not hours."; sub: "pulls enquiries from Meta, Google, property portals, your website and WhatsApp…"; CTAs: Book a 20-minute demo / See pricing; chips "₹12,000/month for 10 users · No per-lead charges · Live in a day" | Developers | Benefit is real but narrow; says nothing about agencies, inventory, visits, bookings, partners. "Live in a day" unproven. Primary CTA is demo only | H1 direction to test: "The sales operating system for real estate developers and channel partner agencies." Sub: "Every enquiry, follow-up, site visit and booking — and the developer–agency partnerships behind them — in one place." CTAs: **Start free 14-day trial** (primary, once sign-up is live) · Explore demo · Book a demo | "Live in a day" → remove or "most teams are set up within a week" only if measured |
| 2 | Animated lead timeline (fictional, labelled) | Developers | Good, honest ("Illustration. Names are fictional.") | Keep; add a real product screenshot strip below | — |
| 3 | "ONE INBOX FOR EVERY PLACE BUYERS ENQUIRE" + 9 source chips | Developers | Implies all sources work today; none proven in production; portals need partner access | Split into "Connect" (website forms, CSV import, walk-ins, webhooks/API — built and self-serve) and "Available with setup" (Meta, Google, WhatsApp — need your account connected) and drop portal names until partner access exists | Meta/Google/WhatsApp/99acres/MagicBricks/Housing.com |
| 4 | Problem: "You pay for every lead. Too many are never called back in time." + 3 cards | Developers | Strong, specific. Keep | Keep; add one card for agencies ("Your buyers are registered with three developers and you can't prove who brought them") | — |
| 5 | How it works: Capture → Route → Alert → Follow up ("Follow-up reminders and 5-minute escalation are coming next") | All | Stale: follow-ups and escalation are built | Extend to the full journey: Capture → Assign → Follow up → Site visit → Booking; separate strip for "Work with partners" | Verify each step in staging before publishing |
| 6 | Features: routing rules, rotation, returning buyers, explanations, developers & CPs, data isolation | Managers | Routing-heavy; missing inventory, visits, documents, analytics, partner network, roles | Group by product family: Leads & follow-up · Projects & inventory · Site visits & bookings · Channel partner network · Reports · Security | Partner network: live only after #35 deploy (now deployed) and first real use |
| 7 | Switching: "On Sell.Do, LeadSquared or spreadsheets today?" — 30-day paid pilot, CSV import, side by side, before/after | Switchers | Good intent; buried as an anchor; "paid pilot" conflicts with free trial | Move to `/switch-from-selldo` (see J); on the homepage keep a short "Switching is low-risk" band linking there | CSV import from Sell.Do/LeadSquared exports: built (`lib/import/crm-mapping.ts`) — verify with a real export |
| 8 | Pricing teaser: REGrow Leads ₹12,000/10 users | Developers | Omits agencies | Show both plans + "14-day free trial" | Matches catalogue ✓ |
| 9 | FAQ (5 Qs) | All | Good start; answers mostly accurate; "managers are notified straight away" — verify | Expand on dedicated pages; keep 5–6 on home | Unassigned-lead manager notification |

---

## C. Keyword research and search-intent clusters (qualitative)

No measured volumes or difficulty (see data limits). Observations are from SERP composition on 18 Nov 2026. [External]

| Cluster | Example queries | Intent | Who ranks today | Gap / opportunity | Map to REGrow page |
|---|---|---|---|---|---|
| Real estate CRM (head) | real estate CRM software India; best real estate CRM India | Commercial investigation | Vendor listicles (Sell.Do's own "top CRM" posts), directories (Capterra, Techjockey), blogspot/SEO farms | Very competitive, vendor-dominated; REGrow cannot win "best" honestly yet | Homepage (brand + category), not a listicle |
| Developer / builder | builder CRM software; real estate software for developers; real estate inventory management software | Commercial | Sell.Do, builder-ERP vendors, listicles | Inventory + sales + partner network in one product is a real angle | `/developers` |
| Channel partner (developer side) | channel partner management software real estate; developer channel partner portal | Commercial | Sell.Do CP module, PropertyPistol Radiate (broker network), Zoho implementers | Competitors frame it as a portal the developer owns; REGrow's agency-owns-its-buyers, independent-tenant model is distinct | `/channel-partner-network` |
| Agency / broker / CP | real estate broker CRM India; real estate agency CRM; property consultant CRM | Commercial | Sell.Do blogs, BrokerSaathi, HamaraCRM, LeadSquared | Agencies working with *several* developers from one workspace is under-served | `/agencies` (+ `/independent-cp` after launch) |
| Sales operations | real estate lead distribution; site visit management; follow-up management; booking management | Commercial + informational | Mixed: vendor feature pages and blogs | Long-tail feature pages + guides | Feature sections on `/developers`; guides |
| Competitor / switching | Sell.Do alternatives; switching from Sell.Do; real estate CRM comparison | Commercial investigation (high intent, low volume [Estimate]) | Capterra/G2 alternatives pages, Sell.Do's own comparison pages, prospeo listicle | One honest switching page beats thin comparison pages | `/switch-from-selldo` |
| Questions | what is real estate CRM; what is channel partner management; developer CRM vs agency CRM | Informational | Vendor blogs | Clear definitions + REGrow's model | `/resources/...` |

**Keyword-to-page map (prevents cannibalisation):** home → "real estate sales operating system / real estate CRM
(brand)"; `/developers` → builder CRM, developer sales & inventory; `/agencies` → agency/broker CRM; `/channel-partner-network`
→ channel partner management; `/switch-from-selldo` → Sell.Do alternatives/switching; `/pricing` → pricing intent;
guides → question intent only. One primary intent per URL.

Next step to make this quantitative: connect Google Search Console (after robots/sitemap) and one keyword tool;
re-rank the clusters with measured data before writing long-form content.

---

## D. Competitor research [External — mostly vendor claims]

| Competitor | Positioning (as presented) | Notes for REGrow |
|---|---|---|
| Sell.Do | "Real estate CRM", builder/developer focus, CP module (registration, inventory access, commission payouts), launch management; heavy content programme incl. its own "best CRM" lists and vs-pages (LeadSquared, Zoho, Salesforce) | Dominates content SERPs; third-party listing notes dated UX and slow customisation (one source). Don't fight on "best"; compete on the connected network model, clarity and price transparency |
| LeadSquared | Horizontal sales CRM with real-estate vertical pages; sales pricing on request (reseller quote ~₹2,500/user/month, 20-user minimum — reseller, not official) | REGrow's published prices are a trust advantage |
| Zoho CRM (+ implementers) | Configurable horizontal CRM; partners sell real-estate setups | Generic; REGrow is real-estate-native |
| PropertyPistol Radiate | Developer access to a large verified broker network | Network-as-a-service, not a CRM; different model |
| Makanify, DaeBuild, HamaraCRM, BrokerSaathi, Groweon, PropFlo | Smaller India real-estate CRMs; several target brokers/CPs | Crowded long tail; differentiation must be specific |

**Where REGrow can honestly stand apart** (each backed by code): independent tenants for developers *and* agencies with
explicit buyer registration and 60-day protection (PR #35, live as of today); published INR pricing with included users;
database-level tenant isolation; transparent routing ("which rule fired and why"). Avoid "#1", "best", market-share
claims (Sell.Do's own "30% market share" claim appears in sponsored press — REGrow should not answer with counter-claims).

---

## E. SEO gap analysis (prioritised)

1. **Crawl foundations missing** — robots.txt, sitemap, canonical, `metadataBase`, OG/Twitter, 404 status (currently 307→login). *Impact:* nothing else matters until crawlers can see and index the right pages. *Measure:* indexed pages in Search Console.
2. **One commercial page** — no pages exist for developers, agencies, channel partner network, switching. *Impact:* no landing page can match commercial intent.
3. **Positioning mismatch** — routing-tool message vs Sales OS brief.
4. **No product imagery** — zero `<img>` on public pages (only CSS illustration). Screenshots build trust and image search presence.
5. **No legal/company pages** — trust and E-E-A-T signals (who runs this, privacy, terms, contact, INFYN Group ownership).
6. **Title tags** — homepage title is a claim ("Every real-estate lead called in minutes"); category words ("real estate CRM", "sales") missing.

## F. AEO opportunities

Write direct, sourced answers (40–60-word definition first, then detail and a comparison table) for:
what is real estate CRM; developer CRM vs agency CRM; what is channel partner management in real estate; how buyer
registration and protection work between developers and agencies; how lead distribution/rotation works; how to measure
speed to lead (REGrow has the leakage audit and timing report — real data to explain). Each answer lives on the page
whose intent it serves; no standalone FAQ farm. FAQPage schema: optional, not a ranking lever (see summary point 9).

## G. AIO / GEO recommendations

- **One consistent entity statement** used on home, About, schema and `llms.txt`: "REGrow is a real estate sales operating
  system for developers and channel partner agencies in India, by INFYN Group Private Limited. It manages enquiries,
  follow-ups, site visits, inventory and bookings, and connects developers with partner agencies through explicit buyer
  registration." (Only verified capabilities; update as features ship.)
- **Structured data:** `Organization` (INFYN Group as parent/publisher, REGrow as brand), `SoftwareApplication` (category
  BusinessApplication, offers with INR prices from `lib/marketing/pricing.ts`, operatingSystem Web), `BreadcrumbList` on
  sub-pages, `Article` only on real editorial content. Generate from the same config as the page copy so they never disagree.
- **AI crawler policy:** allow search and AI crawlers on marketing pages; disallow `/api`, app routes, `/invite`, `/d/`,
  `/platform`, `/admin`, `/dev`. Decide explicitly whether to allow training crawlers (e.g. GPTBot) vs search-only bots — a business choice.
- **`llms.txt`:** optional, low cost, no guaranteed effect; publish a short factual summary and links to key pages.
- **Never expose** app routes, customer microsites without consent, internal docs or `DEC-xxx` labels.

## H. Technical SEO audit [Verified-local unless noted]

| Check | Status | Fix |
|---|---|---|
| robots.txt | Missing (307 → /login) | `app/robots.ts` + allow in proxy |
| XML sitemap | Missing | `app/sitemap.ts` from a central route list |
| 404 handling | Unknown paths 307 → /login | Return 404 for unknown public paths; keep redirect only for app routes |
| Canonical / metadataBase | None | `metadataBase` from central site URL; `alternates.canonical` per page |
| OG / Twitter | None; no OG image | Default + per-page OG; generated OG image |
| Structured data | None | See G |
| `lang` | `en` ✓ | Consider `en-IN` |
| Login/app indexing | `/login` indexable | `noindex` on auth/app/document routes |
| Performance | LCP 84–180 ms, CLS ≤ 0.016, ~134 KB home (lab) | Keep; re-measure with field data after launch |
| Images/alt | No images | Add optimised screenshots with descriptive alt |
| Headings | One H1 per page ✓; an all-caps H2 | Sentence case |
| Internal links | Anchors only; leakage audit linked from footer | Real pages + contextual links |
| Mobile | Previously checked for app; marketing not re-measured today | Include in Phase 1 browser checks |
| Accessibility | Skip link present ✓ | Keep in Phase 1 checks |

## I. Product claim verification

| Capability | Status | Evidence |
|---|---|---|
| Lead management, assignment rules, rotation, returning buyer, explanations | Implemented in code (production use limited: 26 leads) | code + prod |
| Follow-up reminders, 5-minute escalation, speed-to-lead report | **Implemented** (website wrongly says "coming soon") | migrations 20260041, 20260057 |
| Website forms / embed / webhooks / customer API | Implemented; customer setup required; **0 captured leads in prod**; embed code hard-codes a domain | code + prod |
| Meta Lead Ads | Implemented; **external app setup required**; prod: 2 connections disabled/not connected | code + prod |
| Google Ads lead forms | Implemented; external setup required; not used in prod | code + prod |
| WhatsApp Business | Implemented; Meta WABA setup required; 0 messages in prod | code + prod |
| 99acres / MagicBricks / Housing.com | Adapters implemented; **partner/API access not in place** | code; docs |
| Site visits | Implemented; 0 in prod | code + prod |
| Inventory | Implemented; 98 units in prod | code + prod |
| Bookings | Implemented; 0 in prod | code + prod |
| Channel partner network (partnerships, sharing, registration, protection) | **Deployed to production today** (#35); not yet used | prod migration 20260058 |
| Commissions for agencies | Planned (CPN PR 2) | — |
| Analytics / reports | Implemented | code |
| Free trial / self-service sign-up | Trial rules in PR #36 (not merged); sign-up not built | — |
| Explore demo | Not built | — |
| SSO, custom roles | Not available ("coming soon" on Enterprise) | — |
| Prices (₹4,999/5/₹600; ₹12,000/10/₹900; annual 10×) | **Match production catalogue** | prod |
| ₹25,000 setup fee | Website only — not in billing | code |

Rule for all copy: "available" = implemented and usable by a customer without REGrow engineering; anything needing the
customer's or a partner's account says "connect your … account"; anything unbuilt is not mentioned.

## J. Sell.Do switching page

**Recommend: yes, one page — `/switch-from-selldo`.** Competitor-intent searches are high-intent [Estimate]; a single
honest page is legitimate. Do **not** create thin pages for every competitor; at most one general
`/switch-crm` page later if data shows LeadSquared/Zoho demand.

Content: headline direction "Looking beyond Sell.Do for your real estate sales operations?"; what REGrow does (verified
list); developer and agency workflows; the partner network; **migration = CSV import of your export + guided mapping**
(built; say "we help you map your export", not "automatic migration"); running side by side; what REGrow does not do yet
(commission payouts, SSO); evaluation checklist; CTA: trial + "talk to us about your export". No claims about Sell.Do's
product beyond publicly verifiable facts; a clear "not affiliated" line; no logos. Keep the brand independent — the
homepage mentions switching only as a short band.

Demo form: current options already include Sell.Do, LeadSquared, TeleCRM, Another CRM, Spreadsheets/WhatsApp, Nothing yet.
Add Zoho CRM and Salesforce; keep the field optional-but-shown; nothing longer.

## K. Customer-segment landing pages

| Page | Primary intent | Core content | CTA | Status |
|---|---|---|---|---|
| `/developers` | builder/developer CRM | enquiry→booking, projects & inventory, sales team routing, partner network, reports | Trial / demo | Phase 2 |
| `/agencies` | agency/broker CRM | own buyers, team, several developers from one workspace, registrations & protection | Trial | Phase 2 |
| `/channel-partner-network` | CP management | how partnerships, sharing, registration, protection work; data ownership | Demo | Phase 2 |
| `/enterprise` | enterprise | multiple projects/cities, roles, isolation, audit, provisioning | Contact sales | Phase 2 |
| `/independent-cp` | individual consultant CRM | — | Trial | **Only after the plan launches** |
| `/switch-from-selldo` | switching | see J | Trial / demo | Phase 2 |

## L. Content and editorial strategy

Prioritise 6–8 original resources over volume, each using REGrow's real data model or tools:
1. What is a real estate sales operating system (vs a CRM) — definition page. 2. Developer CRM vs agency CRM — comparison
table. 3. How buyer registration and protection work between developers and channel partners. 4. Speed to lead in real
estate: how to measure it (uses the leakage audit). 5. Lead distribution rules for real-estate sales teams. 6. Moving
from a spreadsheet or another CRM: what to export and how to map it. 7. Site-visit follow-up playbook. 8. Inventory
visibility for channel partners: what to share and what not.
Each: audience, one primary question, sources cited, an original example, internal links to the matching segment page,
one CTA. No bulk AI-written posts.

## M. Conversion optimisation

- CTA hierarchy: Start free trial (primary, once sign-up ships) · Explore demo (secondary, once built) · Book a demo
  (tertiary). Until sign-up ships, keep Book a demo primary — do not show buttons for things that don't exist.
- Trust: real product screenshots, security/isolation explained, published prices, company identity (INFYN Group),
  legal pages. **No fabricated logos, testimonials or counts.**
- Demo form: keep length; remove "Online booking is being set up"; add a confirmation page with "what happens next" and
  the leakage audit link.
- Mobile: re-check all marketing pages in Phase 1.

## N. URL and metadata architecture

Findings [Verified-code]: `NEXT_PUBLIC_APP_URL` is used for push links, Meta/Google OAuth; `lib/integrations/forms/generator.ts`
falls back to `https://app.productionx.com`; `app/forms/embed.js/route.ts` and `WhatsAppWizardModal.tsx` hard-code
`app.productionx.com`; `DeveloperApiDocsModal.tsx` hard-codes `api.productionx.in`. No `metadataBase`.

Recommendation: one module `lib/site/urls.ts` exposing `siteUrl()` (marketing, from `NEXT_PUBLIC_SITE_URL`) and
`appUrl()` (from `NEXT_PUBLIC_APP_URL`, falling back to the request origin, never to a literal domain), used by
metadata, sitemap, robots, schema, emails, embed snippets, webhooks and API docs; a unit test that fails on any literal
production domain in `app/`, `components/`, `lib/`. **Confirm the intended production domain(s) before Phase 1.**

## O. Analytics and measurement plan

Privacy-conscious, first-party events (no third-party ad pixels without consent): `page_view` (with landing page and
referrer class: organic / direct / referral / AI assistant where identifiable), `cta_click` (which CTA, which page),
`demo_requested`, `trial_started`, `trial_activated` (e.g. first lead + first teammate within 7 days), `qualified`
(sales-marked), `subscription_paid`, attributed to the first landing page and source. Plus Google Search Console and Bing
Webmaster Tools. KPIs: indexed pages, impressions/clicks for mapped queries, landing-page → CTA rate, demo→trial→paid.

## P. Implementation roadmap (each a separate PR, after approval)

| Phase | Scope | Depends on |
|---|---|---|
| 0 (fixes, small) | Correct false/stale claims (coming soon, integrations wording, pricing FAQ, setup fee, unfinished booking line); add Privacy + Terms (text needs your/legal approval); fix `/p/` microsite access (product) | Your approval of legal text |
| 1 Foundation | robots, sitemap, 404s, canonical/metadataBase, OG, central URL config, `noindex` on app routes, Organization + SoftwareApplication schema, homepage repositioning, CTA hierarchy | Domain confirmation |
| 2 Commercial pages | `/developers`, `/agencies`, `/channel-partner-network`, `/enterprise`, `/switch-from-selldo`, About/Company, Contact | Phase 1; screenshots |
| 3 AEO/AIO/GEO | Answer sections, entity copy, `llms.txt`, AI crawler policy, breadcrumbs | Phase 2 |
| 4 Authority | 6–8 resources, internal linking, Search Console monitoring, experiments | Search Console data |

Self-service sign-up and Explore demo (product PRs C and D) unlock the trial/demo CTAs; the website should switch its
primary CTA only when those ship.

## Q. Risks, dependencies and assumptions

- Keyword priorities are qualitative until measured data is connected.
- Integration claims depend on external setup (Meta app review, Google project, WABA, portal partnerships) — website
  must follow, not lead, these.
- Production domain is unknown to this session — needed for canonical/sitemap and the embed-code fix.
- FAQ rich-result change comes from secondary sources — confirm on Google Search Central.
- Legal pages need business/legal review; I can draft, not approve.
- Competitor information is largely vendor-written; no claims about competitors should be published without a citable source.

## Sources (external research, 18 Nov 2026)

- [Sell.Do — top CRM software for real estate developers in India](https://www.sell.do/blog/top-crm-software-for-real-estate-developers-in-india)
- [Sell.Do — best builder CRM software](https://www.sell.do/blog/best-builder-crm-software-for-developers-and-contractors)
- [Sell.Do vs LeadSquared vs Zoho (Sell.Do blog)](https://www.sell.do/blog/sell-do-vs-leadsquared-vs-zoho-real-estate-crm-india-2026)
- [Sell.Do vs LeadSquared](https://www.sell.do/compare/sell-do-vs-leadsquared) · [Sell.Do vs Zoho](https://www.sell.do/compare/sell-do-vs-zoho)
- [Sell.Do — real estate CRM pricing India 2026](https://www.sell.do/blog/real-estate-crm-pricing-india-2026)
- [Business Standard (sponsored) — Sell.Do market-share claim](https://business-standard.com/content/specials/sell-do-india-s-no-1-real-estate-crm-achieves-30-market-share-with-game-changing-features-124120300751_1.html)
- [Capterra India — Sell.Do alternatives](https://www.capterra.in/alternatives/151826/sell-do) · [Capterra — Sell.Do reviews](https://www.capterra.in/reviews/151826/sell-do)
- [Prospeo — Sell.Do alternatives](https://prospeo.io/s/selldo-alternatives)
- [ProptechBuzz — top 10 real estate CRM in India](https://www.proptechbuzz.com/blog/top-10-real-estate-crm-software-in-india)
- [Techjockey — 21 best real estate CRM for developers](https://www.techjockey.com/blog/?p=12252)
- [Codingclave — best real estate CRM India 2026](https://codingclave.com/blog/best-real-estate-crm-india-2026) · [lead management software India 2026](https://codingclave.com/guides/real-estate-lead-management-software-india-2026)
- [PropertyPistol Radiate](https://propertypistol.com/radiate)
- [Aurum PropTech — what is a channel partner management platform](https://aurumproptech.in/pulse/faqs/what-is-a-channel-partner-management-platform)
- [HamaraCRM](https://hamaracrm.com/real-estate-crm/) · [BrokerSaathi](https://brokersaathi.com/crm) · [iTechGuides — Makanify](https://www.itechguides.com/products/makanify/)
- [LeadSquared real estate CRM](https://www.leadsquared.com/real-estate-crm) · [LeadSquared reseller pricing](https://itforsme.in/pricing/leadsquared-india)
- [Search Engine Journal via Pulse — Google drops FAQ rich results](https://www.pulse.bot/digital-marketing/news/google-drops-faq-rich-results-from-search-via-sejournal-mattgsouthern-8ec06e76-ea96-4d44-8ee9-9f6dd36d28cd/) · [PPC Land](https://ppc.land/google-kills-faq-rich-results-what-seos-saw-coming-since-2019/)
