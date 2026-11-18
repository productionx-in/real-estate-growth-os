# PRODUCTION X — REAL ESTATE GROWTH OS
## ARCHITECTURAL & BUSINESS DECISIONS LOG

**Document Purpose:** Permanent chronological record of approved business decisions, architecture choices, scope boundaries, and deferred items.  
**Last Updated:** 2026-11-14T20:38:00+05:30

---

## Decision Index

| ID | Date | Area | Decision Summary | Status |
| :--- | :--- | :--- | :--- | :--- |
| **DEC-001** | 2026-11-09 | Product Scope | Commercial sales only; commercial leasing and rentals strictly out of scope | **Approved / Active** |
| **DEC-002** | 2026-11-10 | Inventory Model | Strict separation between grouping hierarchy nodes and saleable inventory units | **Approved / Active** |
| **DEC-003** | 2026-11-12 | Integrations | Central Production X Meta Developer App pattern (multi-tenant single-app OAuth) | **Approved / Active** |
| **DEC-004** | 2026-11-13 | Integrations | Central Meta Developer App creation intentionally deferred until platform completion | **Approved / Active** |
| **DEC-005** | 2026-11-13 | Security | AES-256-GCM token encryption formatted as `vault://aes256gcm:...` (zero plaintext secrets) | **Approved / Active** |
| **DEC-006** | 2026-11-13 | CRM Ingestion | 3-Case Deduplication Engine (Case A: Event replay, Case B: Flagged duplicate, Case C: Separate enquiry) | **Approved / Active** |
| **DEC-007** | 2026-11-14 | Integrations | Disconnect preserves all historical leads and attribution non-destructively | **Approved / Active** |
| **DEC-008** | 2026-11-14 | Database | Production database remediation staged into Migrations 0016, 0017, and 0018 with fail-closed recursion | **Approved / Staged** |
| **DEC-009** | 2026-11-14 | Testing | Strict separation between in-memory unit tests and real PostgreSQL / provider staging tests | **Approved / Active** |
| **DEC-010** | 2026-11-14 | Build / Infra | Webpack bundling mode retained for Next.js build due to Turbopack PostCSS child-process restrictions on Windows | **Approved / Active** |

---

## Detailed Decision Records

### DEC-001: Commercial Sales Only (Leasing Excluded)
- **Context:** Real estate developers build and sell commercial office complexes, retail spaces, and mixed-use blocks.
- **Decision:** The platform supports commercial property sales (outright purchase of offices/shops). Commercial lease management, tenant billing, and rent collection are excluded from current and near-term roadmaps.

### DEC-002: Separation of Inventory Units from Hierarchy Nodes
- **Context:** Early designs risked creating duplicate hierarchy nodes for individual units.
- **Decision:** Hierarchy nodes (`project_hierarchy_nodes`) represent physical or logical groupings (Towers, Blocks, Floors, Clusters). Actual saleable assets (`inventory_items`) live in their own table and reference a parent node. Inventory summaries aggregate descendant units without double counting.

### DEC-003 & DEC-004: Central Meta Developer App & Deferred Setup
- **Context:** Meta Lead Ads requires an approved Meta Developer App with App Review for permissions (`leads_retrieval`, `pages_manage_ads`).
- **Decision:** Production X operates a single, centralized Meta app. Customers connect by logging into Facebook and authorizing their business Pages. To avoid premature app review submissions and dependency on live developer accounts during initial development, the full OAuth architecture, state validation, and webhooks were implemented and verified in-memory first; real Meta app registration is deferred until platform completion.

### DEC-005: Cryptographic Vault URI Protocol for Credential Storage
- **Context:** PostgreSQL database tables and RLS views must never expose plaintext OAuth tokens or secrets.
- **Decision:** All credentials are encrypted using AES-256-GCM. Storage format is strictly `vault://aes256gcm:<iv>:<tag>:<ciphertext>`. All DAL and API views sanitize `credential_ref` to `null` before sending responses to the client.

### DEC-006: Deterministic Idempotency & 3-Case Deduplication
- **Context:** Inbound webhooks frequently replay events due to network retries, and buyers submit multiple enquiries across different projects.
- **Decision:**
  - *Case A (Idempotent Replay):* Same external event ID or token returns existing lead without duplication.
  - *Case B (Flagged Duplicate):* Same customer enquiring for the same project flags `is_duplicate = true` and links `duplicate_of_id`.
  - *Case C (Separate Enquiry):* Same customer enquiring for a *different* project creates a separate, non-duplicate lead associated with that specific project.

### DEC-007: Non-Destructive Disconnect Lifecycle
- **Context:** When a customer disconnects a marketing channel, historical leads must not be orphaned or deleted.
- **Decision:** Disconnecting sets `status = 'disabled'` and removes active decryption keys, but strictly retains all historical leads, project associations, and attribution logs.

### DEC-011: Central Google Ads OAuth & Lead Form Webhook Architecture
- **Context:** Google Ads Lead Form extensions deliver real-time leads via webhook with `google_key` verification, and Google Ads API accesses customer accounts and lead form assets via OAuth (`https://www.googleapis.com/auth/adwords`).
- **Decision:** Reuses the multi-tenant central app architecture established in DEC-003 and DEC-004. Actual Google Cloud project OAuth credentials and Developer Token registration are deferred until platform completion. Tokens are encrypted using AES-256-GCM vault storage (`vault://aes256gcm:...`). Real-time leads are received via both connection-specific (`/api/webhooks/google/[connectionId]`) and central (`/api/webhooks/google`) endpoints, verified using timing-safe comparison on `google_key`, and ingested through `processInboundLead`. No live connections or tokens are simulated.

### DEC-012: Website Enquiry Forms, Anti-Spam & CRM Ingestion Architecture
- **Context:** Developers require embeddable enquiry widgets and custom REST API integration for official developer websites, project microsites, and landing pages, while preventing bot scraping, spam submissions, and cross-tenant tampering without imposing human CAPTCHA friction.
- **Decision:**
  - *Public REST Submission Endpoint (`/api/forms/submit`):* Accepts JSON enquiries with CORS support (`OPTIONS` preflight and origin verification).
  - *Multi-Layer Anti-Spam Defense:* Employs invisible honeypot field traps (`hpConfirm`, `website_url_hp`, `_hp_field`), submission speed thresholds (flagging automated bots filling forms in <1200ms), and regex patterns for script/link injection without friction for human home buyers. Detected bot submissions are silently sunk (HTTP 200 returned) to prevent bots from testing or adapting.
  - *Distributed Rate Limiting:* Enforces dual-layer atomic distributed rate limiting (15 submissions / 5 min per client IP; 120 submissions / 1 min per connection).
  - *Origin Domain Whitelisting:* Connections optionally configure `allowedDomains` to restrict form submissions strictly to authorized customer web domains.
  - *Unified CRM Ingestion:* Integrates directly into `processInboundLead`, ensuring deterministic SHA-256 idempotency (`uq_leads_org_idempotency_key`), project mapping resolution via connection mappings (`form_id` and `account_default`), and 3-case non-destructive deduplication.
  - *Privacy Guarantee:* Public responses never leak internal lead IDs, organization IDs, or infrastructure details. Restricted caller-injected keys (`org_id`, `role`, `user_id`) are stripped before normalization.

### DEC-013: WhatsApp Business Cloud API Architecture, Consent Compliance & Attribution
- **Context:** Real estate developers in Hyderabad and India rely heavily on WhatsApp as a primary buyer acquisition and engagement channel through Click-to-WhatsApp Meta Ads, digital brochures, and site-visit confirmations. Compliance with Meta Messaging Policy, TRAI DND rules, and multi-tenant isolation is mandatory.
- **Decision:**
  - *Cloud API Connection Architecture:* Supports WhatsApp Business Cloud API connections (`whatsapp_cloud`) with Phone Number ID, WABA ID, and webhook subscription tokens. Real Meta WABA developer credentials and phone number verification remain deferred per policy; zero live connections are simulated.
  - *Cryptographic Webhook Verification:* Enforces timing-safe comparison on GET challenge parameters and validates POST HMAC-SHA256 signatures (`x-hub-signature-256`) against unparsed raw body bytes.
  - *Click-to-WhatsApp Attribution:* Automatically extracts Meta `referral` objects (`source_id`, `headline`, `body`, `source_url`) from initial inbound messages, mapping them directly to CRM campaign and ad attribution fields.
  - *24-Hour Customer Care Window & Outbound Guard:* Enforces Meta's 24-hour customer service window for session messages. Outside the window, only pre-approved WhatsApp templates (`status: 'APPROVED'`) with variable interpolation are permitted.
  - *Customer Opt-In & Opt-Out Gating:* Evaluates inbound keywords (`STOP`, `UNSUBSCRIBE`, `CANCEL`, `QUIT`, `OPT OUT`, `REVOKE`). Matching messages immediately set `is_opted_out = true` and unconditionally block all outbound communications.
  - *Unified Lead Ingestion & Conversation Association:* Ingests leads through central `processInboundLead` using `phone_number_id` (Priority 3.5), `campaign_id` (Priority 2), or `account_default` (Priority 4), while tracking message and conversation history in staged multi-tenant tables (`whatsapp_conversations`, `whatsapp_messages`).
  - *Tenant Isolation & Audit Security:* Strips injected tenant keys (`org_id`, `role`, `user_id`) and guarantees zero credential or token leakage in `integration_event_logs`.

### DEC-014: Indian Property Portals (99acres, Magicbricks, Housing.com) Integration Architecture
- **Context:** Indian property developers generate significant buyer volume from 99acres (Info Edge), Magicbricks (Times Internet), and Housing.com (Elara / REA Group). Developers require real-time push ingestion into the central CRM with project routing and multi-tenant security without duplicate lead creation.
- **Decision:**
  - *Provider Architecture:* Dedicated providers `property_portal_99acres`, `property_portal_magicbricks`, and `property_portal_housing` registered under central integration architecture. Commercial developer agreements remain deferred; zero mock connections are simulated as active.
  - *Timing-Safe Token Authentication:* Webhook push endpoints verify partner API keys / Bearer tokens using `crypto.timingSafeEqual` against secrets encrypted in AES-256-GCM vault storage (`vault://aes256gcm:...`).
  - *Payload Normalization & E.164 Formatting:* Portal-specific normalizers transform diverse XML/JSON payloads into canonical `InboundLeadPayload`, cleaning phone numbers to Indian E.164 (`+91...`), formatting composite requirement/budget notes, and capturing portal metadata.
  - *Portal Project & Listing Routing:* Added `portal_project_id` and `portal_listing_id` mapping identifier types (Priority 3.6 in `processInboundLead`), falling back to `account_default` (Priority 4).
  - *Deterministic Idempotency & 3-Case Deduplication:* Uses portal external lead IDs as idempotency anchors, routing through central CRM 3-case deduplication (Case A Replay, Case B Same Project, Case C New Project).
  - *Tenant Isolation & Privacy Guarantee:* Connection resolved strictly via internal database records. Restricted external keys (`org_id`, `role`, `user_id`) are stripped, and credentials are never exposed in responses or `integration_event_logs`.

### DEC-015: Developer REST APIs, Outbound Webhook Subscriptions & HMAC Signing Architecture
- **Context:** Enterprise property developers and technology partners require programmatic access to read projects and inventory, push custom leads, and subscribe to real-time CRM lifecycle events (e.g. `lead.created`, `lead.updated`, `site_visit.scheduled`, `inventory.status_changed`).
- **Decision:**
  - *Developer API Key Model:* API keys generated with prefix `px_live_<random_bytes>`. Plaintext keys are shown exactly once to the developer upon creation. Only SHA-256 key hashes and `key_prefix` are stored in `developer_api_keys`. Authenticating requests hashes incoming keys and verifies against active, non-expired database records.
  - *Programmatic REST Endpoints (`/api/v1/*`):*
    - `GET /api/v1/projects`: Scoped strictly to authenticated developer organisation with category and status filters.
    - `GET /api/v1/inventory`: Scoped strictly to authenticated developer organisation with project, category, and status filters.
    - `POST /api/v1/leads`: Ingests leads through central CRM pipeline with duplicate protection, project mapping, and automatic outbound webhook dispatch.
    - `GET /api/v1/leads`: Scoped query of CRM leads with project and status filters.
  - *Outbound Webhook Subscriptions & HMAC-SHA256 Signing:* Event subscriptions stored in `webhook_subscriptions` with event wildcard matching (`*` or specific event types). Payloads signed using HMAC-SHA256 over `${timestamp}.${raw_payload}` delivered in `x-px-signature-256` and `x-px-timestamp` with 300-second replay window tolerance.
  - *Delivery Logging & Fault Tolerance:* Dispatches events asynchronously with configurable timeouts (default 5000ms). Delivery results logged to `webhook_delivery_logs` with HTTP status and retry counts, guaranteeing non-blocking operation for core CRM workflows.

### DEC-016: Sales Operations, Inventory Blockings, Bookings & Channel Partner Architecture
- **Context:** Developers require structured site-visit scheduling, temporary unit holds (blockings) with automated expiry to prevent inventory locking, formal sales booking agreements with payment schedules, and channel partner (broker) RERA verification and commission disbursement management.
- **Decision:**
  - *Site Visit Management (`site_visits`):* Tracks scheduling, executive assignments, visitor counts, VIP cab arrangements, check-in status, ratings, and outcomes (`interested`, `negotiation`, `booked`, `follow_up_needed`).
  - *Atomic Inventory Blockings (`inventory_blockings`):* Enables temporary holds (default 48h) on `available` inventory units, transitioning unit status to `blocked`. Expired blockings are auto-released, restoring units to `available`. Double-blocking or blocking non-available units is strictly rejected.
  - *Sales Booking Execution (`bookings`):* Converts active blockings or books directly from inventory. Assigns unique deterministic booking numbers (`BK-YYYYMMDD-XXXX`), transitions inventory status atomically to `booked`, and records base price, additional PLC/parking charges, total sale value, and payment plan milestones. Double-booking is strictly prevented.
  - *Channel Partner (CP) Operations (`channel_partners`):* Tracks broker firm details, RERA registration numbers, PAN/GST credentials, and tiering (`silver`, `gold`, `platinum`).
  - *Commission Engine (`channel_partner_commissions`):* Supports percentage-based, fixed per sqft, and lump sum commission models. Automatically calculates 5% TDS deduction and structures milestone-based payouts (e.g. 50% on booking advance, 50% on agreement signing).
  - *Sales Pipeline Kanban (`deals`):* Complete lifecycle progression from `enquiry` through `site_visit_scheduled`, `negotiation`, `unit_blocked`, to `booked` / `won` with probability scoring.

### DEC-017: Digital Experience Showrooms, Drip Automations & Multi-Touch Attribution Architecture
- **Context:** Real estate buyers take 14 to 45 days across multiple digital and offline touchpoints before booking. Developers require interactive public project microsites (digital showrooms), automated follow-up drip workflows across WhatsApp and email, and accurate multi-touch attribution to evaluate marketing ROI.
- **Decision:**
  - *Public Digital Showrooms (`project_microsites`, `/p/[projectSlug]`):* Standalone, fast, responsive public project presentations featuring 3D virtual tour embeds, master layout plans, curated amenities, RERA disclosures, and direct CRM VIP site-visit enquiry capture.
  - *Event-Driven Workflow Automation (`automation_workflows`, `automation_executions`):* Evaluates triggers (`lead_created`, `site_visit_scheduled`, `unit_blocked`, `booking_confirmed`) against filter conditions and executes ordered actions (`send_whatsapp_template`, `send_email`, `create_task`, `delay_hours`), logging step-by-step audit records with failure isolation.
  - *Multi-Touch Attribution Engine (`lead_touchpoints`):* Registers every buyer touchpoint (`meta_ads`, `google_ads`, `website_form`, `99acres`, `magicbricks`, `housing`, `whatsapp`, `channel_partner`). Computes revenue attribution across 5 standard models: First Touch (100%), Last Touch (100%), Linear (equal split), Position-Based / U-Shaped (40% first, 20% middle, 40% last), and Time Decay (exponential half-life).
  - *Developer Executive BI Dashboard (`/analytics`):* Aggregates real-time conversion funnels (Leads → Visits → Holds → Bookings), sales velocity (mean days to booking), channel sourcing ROI, and inventory absorption percentages.

### DEC-018: Explicit Multi-Organization Workspace Resolution in Lead Capture
- **Context:** When users hold memberships in multiple developer organisations (e.g. `Otho` and `Acme`), submitting new leads at `/[orgSlug]/leads/new` previously yielded a 400 Bad Request error ("User belongs to multiple organisations. Please specify orgId in the request") because `LeadForm.tsx` failed to include `orgId` in the JSON POST payload, and the `/api/leads` route only checked the direct body payload without URL slug fallback.
- **Decision:**
  - `LeadForm.tsx` now passes `{ ...form, orgId, orgSlug }` directly in the submission payload.
  - The backend route handler `/api/leads` and `/api/leads/import` implement a 4-tier tenant context resolution hierarchy:
    1. Direct `body.orgId` or `query.orgId`.
    2. Direct `body.orgSlug` or `query.orgSlug` matched against user's active memberships.
    3. `Referer` URL header inspection matching `/[orgSlug]/...` path patterns against user's active memberships.
    4. Single active membership fallback (if user belongs to only 1 organization).
  - This eliminates user friction for multi-tenant users while rigorously verifying that the user has valid, active membership in the resolved organization before allowing any lead write.

### DEC-019: UX Transformation Phase 2 — Navigation Shell, Workspace Switcher & Role Foundations
- **Context:** Following the comprehensive Phase 1 UX and architecture audit, users required a friction-free navigation shell supporting multi-organisation workspaces, clear visual workspace context, role-tailored dashboards and navigation, and rigorous server-side route guards.
- **Decision:**
  - *Approved Decision 1 (Channel Partner Architecture):* Retain developer-managed channel partner referral model (Option A). Preserve `channel_partner` organisation type and schema without cross-tenant syndication in this phase.
  - *Approved Decision 2 (Sales Executive Dashboard):* Implemented workspace-scoped dashboard for sales executives (`role === 'sales_exec'`), surfacing personal assigned leads, actioned today metrics, scheduled visits, deals in negotiation, and a dedicated Priority Calling Queue table with one-click status transitions. Managers and admins retain executive pipeline overview.
  - *Approved Decision 3 (Project Visibility):* Organisation-wide project visibility retained for all authorised members; lead ownership and project access remain distinct permissions.
  - *Multi-Organisation Interactive Switcher:* Enhanced `getVerifiedWorkspace` in `lib/dal/workspace.ts` to query all memberships for the authenticated profile and return `availableOrgs`. Built interactive dropdown in `Sidebar.tsx` and `Header.tsx` displaying organisation name, organisation type, user role, active status checkmark, and quick links to `/select-org` and `/create-org`.
  - *Server-Authoritative Route Protection:* Enforced server-side checks in page components:
    - `/analytics`: Blocked for `sales_exec` (redirects to `/${orgSlug}`).
    - `/integrations`: Blocked for non-managers and non-admins (redirects to `/${orgSlug}`).
    - `/settings`: Blocked for non-admins (redirects to `/${orgSlug}`).
    - `/team`: Blocked for non-managers and non-admins (redirects to `/${orgSlug}`).
  - *Elimination of Ghost Leads:* Aligned lead list queries with Supabase RLS (`assigned_to = profile.id` for sales reps) and guarded lead detail view (`lead.assigned_to !== profile.id` yields `notFound()`), ensuring sales reps never see 404s for leads in their list.
  - *Deals Kanban Card Hydration:* Joined `lead(id, name, phone)` and `project(id, name)` in `getDeals()` to display customer names, phone numbers, and project badges on Kanban cards instead of raw IDs.

### DEC-020: Subscription-Based Access Control, Organisation-Provisioned SaaS & Seat Entitlements
- **Context:** To establish enterprise SaaS control, prevent arbitrary public registration of uncontrolled organisations, and strictly govern user access, Production X requires an organisation-controlled, subscription-based model.
- **Decision:**
  - *Prohibition of Self-Service Employee Registration:* Arbitrary public employee signup is strictly disallowed. The public login shell provides Email, Password, Sign in, and Forgot password, with explicit guidance that workspace access is provisioned by an organization administrator.
  - *Authorised Organisation Provisioning:* Customer organisations (Developers and Channel Partners) are provisioned through an authorized Production X onboarding process by Platform Administrators. The initial organization administrator receives an activation token to claim the account.
  - *Employee Invitation & Joining Engine:* Authorized organization administrators invite staff (`org_invitations`). Accepting an invitation links the user to the existing organisation and never spawns a new organization.
  - *Subscription Seat Accounting & Enforcement:*
    - Total Seat Allowance = Included Seats (plan-defined) + Additional Purchased Seats.
    - Active members (`org_members.status = 'active'`) consume seats; pending invitations (`org_invitations.status = 'pending' AND expires_at > now()`) reserve seats.
    - When `Available Seats <= 0`, invitation APIs reject requests with HTTP 403 / 409 and route administrators to plan upgrades or seat expansion.
    - Seat limits are enforced at the API layer and cannot be bypassed via direct calls. Plan seat allowances are flexible and configurable (not hardcoded to 5).
  - *Employee Lifecycle & Historical Preservation:*
    - Role changes and employee deactivations are supported.
    - Deactivation immediately terminates workspace access on the server while preserving historical lead assignments, activity logs, notes, and audit records.
    - Lead reassignment upon departure follows an explicit, managed workflow (reassign to active rep or move to unassigned pool).
  - *Multi-Organisation Membership Independence:* A user may belong to multiple organisations. Each organisation independently accounts for that user's seat against its own subscription quota. Safe switching is enforced server-side.


### DEC-022: Commercial Rules — Trials, Plan Limits, Expiry and Existing Workspaces
- **Context:** The founder delegated the open commercial decisions from the self-serve / monetisation review ("you do the math … keep in product info"). Full rules: `docs/product/COMMERCIAL_RULES.md`.
- **Decision:**
  - Trial: 14 days; 3 users, 100 leads, 2 projects, 50 inventory units; one trial per person per organisation type, for life.
  - Captured enquiries are always saved over the lead limit; manual entry and import stop at it.
  - Pending invitations keep reserving a seat (released on acceptance, revocation or 7-day expiry).
  - Trial end → read-only immediately; paid period end → 7 days overdue with full access, then read-only; paying lifts it; data is never deleted.
  - Existing workspaces without a subscription get a 30-day transition on their type's plan.
  - Verification is per organisation and gates cross-organisation actions only; Independent CP plan ₹1,499 / 1 user, max 2 users (own PR).
  - Website order: Start free trial, Explore demo, Book a demo.
- **Status:** Trials, limits, expiry and transition implemented in migration 20260059 (PR "billing enforcement"); sign-up, demo, verification, website and the Independent CP plan in later PRs. Nothing applied to production until merged with the owner's go-ahead.
