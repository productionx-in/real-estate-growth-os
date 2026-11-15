# UX CURRENT STATE AUDIT
## PRODUCTION X — REAL ESTATE GROWTH OS

**Document ID:** `UX-AUDIT-001`  
**Phase:** Phase 1: Complete Application Audit (Investigation & Architecture Only)  
**Date:** 2026-11-15  
**Auditor:** Antigravity Agent  
**Scope:** Application-wide architecture, routing, navigation, roles, dashboards, workflows, CRM, inventory, and usability inspection.

---

## 1. Executive Architecture Overview

Real Estate Growth OS is built on Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, and Supabase PostgreSQL 17.11 with Row Level Security (RLS). The application operates a multi-tenant workspace architecture where data is grouped by organisation (`organisations`) and accessed via URL slug prefixes (`/[orgSlug]/...`).

### 1.1 Application Routes & Hierarchy

The application consists of three primary routing tiers:

```
app/
├── (auth)/                                     # Public Authentication Shell
│   ├── login/page.tsx                          # Email & Password sign-in
│   └── register/page.tsx                       # 2-step account & workspace registration
├── (dashboard)/                                # Protected Application Shell
│   ├── create-org/page.tsx                     # Workspace creation fallback
│   ├── select-org/page.tsx                     # Multi-workspace selector
│   ├── my/dashboard/page.tsx                   # Individual salesperson dashboard
│   └── [orgSlug]/                              # Org-Scoped Workspace Shell
│       ├── page.tsx                            # Workspace Overview Dashboard
│       ├── leads/                              # Central CRM Lead Management
│       │   ├── page.tsx                        # Leads table & faceted filters
│       │   ├── new/page.tsx                    # Manual lead capture form
│       │   ├── import/page.tsx                 # Bulk CSV lead importer
│       │   └── [leadId]/                       # Lead 360 & Activity View
│       │       ├── page.tsx                    # Detail & activity log
│       │       └── edit/page.tsx               # Edit lead form
│       ├── sales/page.tsx                      # Sales operations & deals pipeline
│       ├── projects/                           # Real Estate Project Catalog
│       │   ├── page.tsx                        # Project directory
│       │   ├── new/page.tsx                    # Project creation wizard
│       │   └── [projectId]/                    # Project details & hierarchy
│       │       ├── page.tsx                    # Specifications & inventory summary
│       │       └── edit/page.tsx               # Edit project details
│       ├── inventory/page.tsx                  # Global Inventory Explorer (Grid & Visual)
│       ├── integrations/page.tsx               # Marketing & Ingestion Integration Centre
│       ├── analytics/page.tsx                  # Executive BI & Funnel Analytics
│       ├── team/page.tsx                       # Workspace team member list
│       └── settings/page.tsx                   # Workspace organisation settings
├── forms/                                      # Public Ingestion Embeds
│   ├── embed.js/route.ts                       # Dynamic client JavaScript embed snippet
│   └── view/page.tsx                           # Hosted standalone enquiry form iframe
├── p/[projectSlug]/page.tsx                    # Public Digital Showroom / Project Microsite
└── api/                                        # REST & Webhook Handlers
    ├── auth/callback/route.ts                  # Supabase OAuth/magiclink handler
    ├── orgs/route.ts                           # Organisation CRUD
    ├── projects/                               # Project & hierarchy endpoints
    ├── inventory/                              # Inventory status machine & bulk import
    ├── leads/                                  # Lead CRUD, status, notes, assignment, export
    ├── sales/                                  # Site visits, holds, bookings, CPs, deals
    ├── analytics/bi/route.ts                   # Executive BI metrics aggregation
    ├── forms/submit/route.ts                   # Public website enquiry ingestion
    ├── integrations/                           # Connections & project mappings
    ├── webhooks/                               # Inbound signed webhooks (Meta, Google, Portals, WA)
    └── v1/                                     # Developer Programmatic REST API
```

---

## 2. Layouts, Navigation & Shared Components

### 2.1 Workspace Layout (`app/(dashboard)/[orgSlug]/layout.tsx`)
- **Structure:** Two-column split layout with fixed left sidebar (`Sidebar.tsx`, 240px width) and top header (`Header.tsx`, 56px height) wrapping the scrollable main content.
- **Context Loss:** `OrgLayout` executes `getVerifiedWorkspace(orgSlug)` which retrieves `{ user, profile, org, role, isManager, isAdmin }`, but **only passes `orgName` and `orgSlug`** to `Sidebar`.
- **Impact:** Neither `Sidebar` nor `Header` knows the active user's identity or role.

### 2.2 Navigation Menu (`components/layout/Sidebar.tsx`)
The navigation items are completely static across all user roles:
1. **Overview** (`/[orgSlug]`)
2. **Leads** (`/[orgSlug]/leads`)
3. **Sales & CPs** (`/[orgSlug]/sales`)
4. **Projects** (`/[orgSlug]/projects`)
5. **Inventory** (`/[orgSlug]/inventory`)
6. **Integrations** (`/[orgSlug]/integrations`)
7. **Analytics & BI** (`/[orgSlug]/analytics`)
8. **Team** (`/[orgSlug]/team`)
9. **Settings** (`/[orgSlug]/settings`)

#### Identified Navigation Defects:
- **No Role Adaptation:** A junior `sales_exec` sees technical administrative tabs ("Integrations", "Team", "Settings", "Analytics & BI") identical to an enterprise `owner`.
- **No Channel Partner Adaptation:** A broker organization logged into their workspace sees developer-centric configuration rather than CP-specific tools (referrals, payouts, brochures).
- **Missing Workspace Switcher:** The sidebar brand header displays `Growth OS` and the current workspace name as plain static text. Users with multiple organisation memberships have **no dropdown or UI control** to switch workspaces without manually altering the browser URL to `/select-org`.
- **No Quick Actions:** No global "+ New Lead" or "+ New Site Visit" button in sidebar or header.

### 2.3 Application Header (`components/layout/Header.tsx`)
- **Left Region:** Blank `<div />` where breadcrumbs were planned.
- **Right Region:** 
  - **Bell Icon:** Completely non-functional. Contains no click event, no badge, no dropdown popover, and no notification backend service.
  - **LogOut Icon:** Calls `supabase.auth.signOut()` and redirects to `/login`.
- **Missing Elements:** No user avatar, no user name, no active role badge, no global search bar.

---

## 3. User Roles & RBAC System Audit

The application enforces permissions across three distinct layers:
1. **Database Enums (`supabase/migrations/20260001_enums.sql`):**
   - `org_type`: `'developer'`, `'channel_partner'`
   - `member_role`: `'owner'`, `'admin'`, `'manager'`, `'sales_exec'`, `'readonly'`
2. **Database RLS Policies (`supabase/migrations/20260011_tenant_isolation_rls.sql`):**
   - Implements SQL helper functions `auth_is_member_of_org(check_org_id)` and `auth_has_role_in_org(check_org_id, allowed_roles)`.
3. **Application Server Auth Helpers (`lib/auth/tenant.ts`):**
   - `authenticateCaller()`, `authorizeOrgAccess()`, `authorizeProjectAccess()`, `authorizeInventoryAccess()`, `authorizeLeadAccess()`.

### 3.1 Role Breakdown Table

| Role Identifier | Actual Roles Supported | Creation Method | Access Grantor | Target Dashboard | Permitted Actions | Prohibited Actions |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Platform Administrator** | *Not Implemented in App* | Supabase dashboard service role | Supabase Cloud | None (No platform admin portal) | Direct DB access via service key | No app UI exists |
| **Developer Owner / Admin** | `owner`, `admin` | Organization registration at `/register` | System (on org creation) or Admin | `/[orgSlug]` (Overview) | Full CRUD on Projects, Inventory, Leads, Integrations, Sales, Team | Cannot be deleted if sole owner |
| **Developer Sales Manager** | `manager` | Manual DB insert to `org_members` | Admin / Owner | `/[orgSlug]` (Overview) | Project create/update, inventory transition, lead reassign, site visit scheduling | Delete project, delete inventory, manage integrations |
| **Developer Sales Executive** | `sales_exec` | Manual DB insert to `org_members` | Admin / Manager | `/[orgSlug]` (Overview) or `/my/dashboard` | View assigned leads, update status, add notes, log calls | Create project, reassign leads, connect integrations, manage team |
| **Channel Partner Admin** | `owner`, `admin` (where `org.type = 'channel_partner'`) | `/register` choosing "Channel Partner" | System | `/[orgSlug]` (Overview) | View own org leads | Cannot view developer inventory unless syndicated |
| **Read Only Member** | `readonly` | Manual DB insert to `org_members` | Admin | `/[orgSlug]` (Overview) | Read projects, read inventory, read leads | All state transitions, creation, editing, exporting |

### 3.2 Subscription-Based Access & Provisioning Architecture Audit

In accordance with the approved commercial and security model:
- **Commercial SaaS Model:** Production X is a subscription-based, organization-controlled platform for property developers and channel partner brokerages.
- **Prohibition of Self-Service Employee Signup:** Arbitrary public signup is strictly disallowed. Employees cannot create independent accounts or spawn uncontrolled organizations.
- **Authorized Provisioning:**
  - Customer organizations are provisioned by Production X Platform Administrators alongside their subscription tier and user seat entitlements.
  - Organization administrators receive an activation link to claim the primary account.
  - Internal staff (sales managers, sales executives, admins) are invited strictly by authorized organization administrators.
- **Seat Allowance & Accounting:**
  - Subscriptions specify included and purchased seats.
  - Active members consume seats; pending invitations reserve seats.
  - Seat limits are enforced at the API and UI layers, blocking over-allocation and routing administrators to seat expansion.
- **Lifecycle & Historical Retention:**
  - Deactivation immediately terminates workspace access while strictly preserving historical lead assignments, activity logs, notes, and audit records.
  - Reassignment of departures follows an explicit, managed workflow.

---

## 4. Dashboards Audit

### 4.1 Global Workspace Overview (`components/dashboard/WorkspaceOverview.tsx`)
- **Rendered At:** `/[orgSlug]`
- **Viewer Audience:** Rendered universally for all roles (`owner`, `admin`, `manager`, `sales_exec`, `readonly`).
- **Data Displayed:**
  - Active Projects count (linked to `/[orgSlug]/projects`)
  - Total Inventory Units count (linked to `/[orgSlug]/inventory`)
  - Total Leads count (linked to `/[orgSlug]/leads`)
  - Confirmed Bookings count (linked to `/[orgSlug]/leads?status=booked`)
- **Usability Gaps:**
  - Executive-level summary is useless for a `sales_exec` who needs to know: *Who do I call today? Which site visits are scheduled this morning? Which leads have overdue follow-ups?*
  - Uses `createServiceClient()` to aggregate totals across the entire organisation, exposing high-level company sales metrics to junior staff and read-only auditors.
  - Zero actionable queues or workflow links.

### 4.2 Individual Salesperson Dashboard (`app/(dashboard)/my/dashboard/page.tsx`)
- **Rendered At:** `/my/dashboard`
- **Intended Audience:** Individual Sales Executives (`sales_exec`).
- **Data Displayed:**
  - KPI Cards: Active Leads, Updated Today, Site Visits, In Negotiation
  - Lead Queue: Table of up to 50 active leads assigned to the user (`assigned_to = profile.id`) ordered by priority and update timestamp.
- **Usability Gaps:**
  - **Severe Multi-Org Bug:** Line 38 executes `.from('org_members').select(...).eq('profile_id', profile.id).single()`. If the user belongs to more than 1 organisation, `.single()` throws a runtime database exception (`PGRST116: JSON object requested, multiple rows returned`), completely crashing the page!
  - **Hidden / Disconnected:** `/my/dashboard` is **not linked in the Sidebar navigation**. Unless a user manually types `/my/dashboard` into their browser address bar, they will never discover it.

### 4.3 Executive BI Dashboard (`components/analytics/ExecutiveBiDashboardView.tsx`)
- **Rendered At:** `/[orgSlug]/analytics`
- **Data Displayed:** Total Inventory Value (₹ Cr), Absorption Rate (%), Sales Velocity (Days), Total Enquiries, Sales Conversion Funnel, Channel Sourcing breakdown.
- **Usability Gaps:**
  - Displays internal engineering label: `"Stage 6 Active"`.
  - Accessible to all roles including `sales_exec` and `readonly`.
  - Lacks date range picker (data aggregates all time).

---

## 5. Screen-by-Screen UX & Workflow Inspection

### 5.1 CRM Leads List (`/[orgSlug]/leads`)
- **Security & UX Disconnect:** `app/(dashboard)/[orgSlug]/leads/page.tsx` uses `createServiceClient()` and queries `.from('leads').select(...).eq('org_id', org.id)`. It loads all leads across the entire company regardless of user role.
- **The "Ghost Lead" Defect:** A `sales_exec` sees leads assigned to other sales reps in the list. However, when clicking on a lead to view details (`/[orgSlug]/leads/[leadId]`), the detail page uses `getLeadById()` which uses `createClient()`. Supabase RLS blocks the query, resulting in an immediate **404 Not Found error**.
- **Export Inconsistency:** The "Export CSV" button appears for all non-readonly users. When an executive clicks it, `/api/leads/export` restricts the export to only their assigned leads, contrasting with the table which displays all leads.

### 5.2 CRM Lead Detail 360 (`/[orgSlug]/leads/[leadId]`)
- **Tabs / Sections:** Contact Information, Budget, Status Transition Panel, Assignment Dialog, Activity Log.
- **Usability Gaps:**
  - No direct "Call" or "WhatsApp" action buttons that trigger `tel:` or `https://wa.me/` protocols with pre-filled templates.
  - No direct "Schedule Site Visit" button inside the lead view (even though `site_visits` table exists).
  - Activity log only records system events; adding a manual note requires submitting via a minimal note input box that does not distinguish call logs from meeting summaries.

### 5.3 Projects & Hierarchy (`/[orgSlug]/projects/[projectId]`)
- **Tabs:** Overview, Hierarchy Manager, Inventory Table, Visual Floor Layout.
- **Strengths:** Excellent hierarchy node tree with circular parent defense and category-aware unit forms.
- **Gaps:** Hierarchy manager operates in a separate tab from inventory, requiring sales reps to jump between screens to understand where units physically reside.

### 5.4 Inventory Explorer (`/[orgSlug]/inventory`)
- **Tabs:** List / Table View and Visual Layout Grid.
- **Strengths:** Fast multi-project filtering, unit category badge display, atomic status transition modal.
- **Gaps:** No quick action to create a lead directly from an available inventory unit or initiate a temporary blocking.

### 5.5 Sales Operations View (`/[orgSlug]/sales`)
- **Tabs:** Sales Deals Pipeline (Kanban), Site Visits, Bookings & Holds, Channel Partners.
- **Usability Gaps:**
  - Displays development milestone badge `"Stage 5 Active"`.
  - In the Deals Kanban, cards display raw truncated IDs: `Lead ID: 894bf8...` instead of lead name, phone, or project title.
  - All four tabs are completely **read-only**. There is no "+ Schedule Site Visit", "+ Record Hold", "+ Confirm Booking", or "+ Onboard Channel Partner" modal.

### 5.6 Team Directory & Seat Management (`/[orgSlug]/team`)
- **Display:** Table listing member names, roles, contact info, and join date.
- **Usability & Architecture Gaps:**
  - Completely **read-only** with no interactive management controls.
  - **No Subscription Seat Meter:** Does not show total seats, active members, pending invitations, or remaining capacity.
  - **No Invitation Workflow:** Lacks an "Invite Team Member" action modal (email, role selection, seat verification, expiration).
  - **No Member Lifecycle Controls:** Administrators cannot change a member's role or deactivate an employee.
  - **No Safe Offboarding / Lead Reassignment:** Deactivating an employee has no structured workflow to reassign their active leads or audit historical activity.
  - Empty state promises: *"Invite sales executives and managers to your workspace"*, but provides zero functionality to do so.

### 5.7 Workspace Settings (`/[orgSlug]/settings`)
- **Display:** Static key-value list of Org Name, Type, Slug, and Plan.
- **Usability Gaps:** No input fields, no logo uploader, no domain settings, no notification settings, no billing/plan upgrade controls.

---

## 6. Summary of Critical UX & Workflow Bottlenecks

1. **Uncontrolled Registration vs Subscription SaaS:** Public `/register` allows anyone to spin up an organization, while invited employees cannot simply accept an invitation into an existing developer workspace.
2. **Missing Invitation & Seat Management:** Organizations have no UI to invite staff, track pending invitations, or enforce subscription seat limits.
3. **Missing Offboarding & Lead Reassignment:** No mechanism exists to deactivate departures safely while retaining historical logs and reallocating active leads.
4. **Missing Workspace Switcher:** Multi-org users cannot switch workspaces without modifying URL parameters (Resolved in Phase 2).
5. **Static Role Navigation:** Sales Executives and Read-Only users are presented with full administrative navigation (Resolved in Phase 2).
6. **Lead Visibility Contradiction:** Execs see all leads in list view, but encounter 404 errors when attempting to open details (Resolved in Phase 2).
7. **Inert Sales Operations:** Sales and Channel Partner tabs are view-only with missing creation modals.
8. **Inert Communication Tools:** Header notification bell is non-functional; lead detail view lacks single-click phone/WhatsApp launchers.
