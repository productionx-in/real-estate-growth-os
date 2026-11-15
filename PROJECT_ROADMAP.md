# PRODUCTION X — REAL ESTATE GROWTH OS
## MASTER PROJECT ROADMAP, EXECUTION CHARTER & SOURCE OF TRUTH

**Company:** Production X  
**Product:** Real Estate Growth OS  
**Initial Market:** Hyderabad, India  
**Primary Customers:** Real estate developers and property businesses  
**Project Status:** Active Development  
**Document Purpose:** Permanent project direction, phase tracking, and execution control.

---

# 1. The Overall Vision

Production X is building a comprehensive Real Estate Growth OS for property developers.

It manages the complete developer business journey:
1. Project creation and management.
2. Inventory management.
3. CRM and lead acquisition.
4. Marketing integrations.
5. Sales and booking operations.
6. Channel partner management.
7. Project microsites and digital experiences.
8. Marketing automation.
9. Business reporting and analytics.

**Core Vision:** One connected platform where property developers manage projects, inventory, marketing enquiries, sales teams, channel partners, and business performance. This is not a simple CRM or inventory tracking spreadsheet.

---

# 2. Product Scope and Business Rules

## 2.1 Supported Property Categories
- **Apartments**: High-rise and mid-rise residential towers (Project → Phase → Tower → Floor → Units).
- **Plotted Developments**: Residential and commercial layouts/plots (Project → Phase → Block → Plots).
- **Commercial Sale Properties**: Office spaces, retail shops, and commercial suites for sale (Project → Building → Floor → Commercial Units). *Note: Commercial leasing and rental property management are strictly outside current scope.*
- **Villas and Gated Communities**: Row houses, independent villas, and cluster developments (Project → Phase → Cluster/Street → Villas).
- **Mixed-Use Developments**: Integrated developments combining residential, retail, and commercial sale components within one project. Must support multiple inventory types.

## 2.2 Organisation & Multi-Tenant Architecture
- Structure: **Organisation → Optional Branches → Teams → Projects → Inventory**.
- **Commercial SaaS Model:** Organisation-controlled, subscription-based access. Public self-service employee registration is prohibited.
- **Customer Provisioning:** Developer and Channel Partner organisations are provisioned through an authorised Production X onboarding process by Platform Administrators. Initial org admins receive activation invitations.
- **Invite-Only Employee Onboarding:** Organisation administrators invite staff via email. Accepting an invite links the user to the existing workspace and never creates a new organisation.
- **Subscription Seat Entitlements:** Total seats = included (plan-configurable) + additional purchased. Active members consume seats; pending invites reserve seats. Seat limits are enforced at the API layer.
- **User Lifecycle & Deactivation:** Role editing and member deactivations are supported. Deactivated employees immediately lose workspace access, but their historical lead assignments, activity logs, notes, and audit records remain intact. Lead reassignment follows an explicit workflow.
- **Multi-Tenant Memberships:** Users can belong to multiple organisations simultaneously. Each organisation independently accounts for seats against its own subscription pool.
- Workspace context must be explicit, verified, and tenant-isolated.
- Never assume the first membership is the active organisation.
- All roles and permissions are verified server-side; Row Level Security (RLS) is enforced at the database level.
- Zero cross-organisation data exposure.

## 2.3 Inventory Architecture
- Inventory records are distinct entities (`inventory_items`) that reference grouping nodes (`project_hierarchy_nodes`).
- Hierarchy levels are optional and configurable per project.
- Formal Inventory Statuses:
  1. `available`
  2. `on_hold`
  3. `booked`
  4. `sold`
  5. `blocked`
- Dual representation: Visual floor-plate / layout view and comprehensive Table / List view.
- Hierarchy summaries aggregate descendant inventory without double counting.

## 2.4 Pricing Model
Extensible architecture supporting:
- Fixed pricing.
- Base price plus additional charges (floor rise, corner PLC, car parking, amenities).
- Multiple price lists.
- Category-specific pricing structures.

## 2.5 Website Model
Standalone SaaS platform:
- Operates independently of developer websites.
- Integrates with existing developer websites via APIs / enquiry forms.
- Optional project microsites provided by Production X (customers are never forced to purchase a website).

---

# 3. Master Development Roadmap

| Stage | Name | Core Scope | Status |
| :--- | :--- | :--- | :--- |
| **Stage 1** | Security & Multi-Tenant Foundation | Multi-org membership, workspace context, RLS policies, RBAC | **Code Verified** |
| **Stage 2** | Inventory Data Integrity | Concurrency protection, atomic status transitions, audit logs | **Code Verified** (DB Staging Pending) |
| **Stage 3A** | Project Management | Category-specific projects, amenities, media URLs, editing | **Code Verified** |
| **Stage 3B** | Hierarchy Management | Tree nodes, re-parenting, circular move defense, aggregation | **Code Verified** |
| **Stage 3C** | Category-Aware Inventory | Category-specific specs for all 5 property types | **Code Verified** |
| **Stage 3D** | Inventory Table & Detail | Slide-over detail panel, faceted filters, status badges | **Code Verified** |
| **Stage 3E** | Visual Inventory | Visual grid/block representations, status color codes | **Code Verified** |
| **Stage 3F** | Bulk Inventory Import | CSV/XLSX parser, row validation, duplicate check, preview | **Code Verified** |
| **Stage 3G** | CRM Integration Readiness | Lead attribution schema, org immutability, Vault references | **Code Verified** (Migration 0015 Staged) |
| **Stage 4A** | Integration Centre UX | Connection management, mapping UI, credential redaction | **Approved** (Staging DB Pending) |
| **Stage 4B** | Meta Lead Ads Integration | Central Meta app, OAuth handshake, AES-256-GCM, webhooks | **Code Verified** (App Setup Deferred) |
| **Stage 4C** | Public Webhooks & Lead Ingestion | General webhook endpoints, HMAC verification, replay defense | **Code Verified** |
| **Stage 4D** | Google Ads Lead Integration | Google OAuth, Lead form webhook receiver, attribution | **Code Verified** |
| **Stage 4E** | Website Enquiry Forms | Embeddable forms, lead capture APIs, spam defense | **Code Verified** |
| **Stage 4F** | WhatsApp Business Integration | Cloud API architecture, conversation tracking, templates | **Code Verified** |
| **Stage 4G** | Property Portal Integrations | 99acres, Magicbricks, Housing.com partner ingestion | **Code Verified** |
| **Stage 4H** | Integration APIs & Extensibility | Outbound customer webhooks, public developer API, docs | **Code Verified** |
| **Stage 5** | Sales & Channel Partner Operations | Site visits (5A), Bookings (5B), Channel Partners (5C), Attribution (5D), Pipelines (5E) | **Code Verified** |
| **Stage 6** | Digital Experience & Automation | Microsites (6A), Automated Follow-ups (6B), Attribution (6C), Analytics (6D) | **Code Verified** |

---

# 4. Technology & Infrastructure

- **Framework**: Next.js 16 (App Router), React 19, TypeScript 5.
- **Styling**: Tailwind CSS 4.
- **Database & Auth**: Supabase PostgreSQL 17.11 with Row Level Security (RLS) and Supabase Auth.
- **Encryption**: Node.js AES-256-GCM with PBKDF2/SHA-256 key derivation (`vault://` URI protocol).
- **Deployment**: Vercel.
- **Infrastructure Path**: Free Tier during development; upgrade to Supabase Pro and Vercel Pro before commercial launch.

---

# 5. External Provider Account Setup Policy

- Application architecture is designed and code-verified **before** final external provider account registration.
- **Meta Developer App**: Central app setup is intentionally deferred until platform development is complete.
- **Never represent planned or mock integrations as live.** Live integrations require verified credentials and end-to-end tests.

---

# 6. Permanent Development Rules

1. `PROJECT_ROADMAP.md` is the master source of truth.
2. Inspect existing codebase before modifying or adding features.
3. Do not restart completed stages or re-run successful tests without cause.
4. Enforce tenant isolation, RLS, and RBAC at all times.
5. Never fabricate provider connections or credentials.
6. Keep database migrations and live provider verification separate from application implementation status.
7. Build incrementally; run automated test suites (`npm test`) and typechecks (`npx tsc --noEmit`) after every milestone.
8. Distinguish in-memory unit tests from real PostgreSQL tests.
9. When a blocker occurs, isolate the root cause and continue independent work where safe.
10. The user is the final decision-maker.
