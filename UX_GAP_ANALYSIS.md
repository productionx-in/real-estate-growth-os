# UX GAP ANALYSIS
## PRODUCTION X — REAL ESTATE GROWTH OS

**Document ID:** `UX-GAP-001`  
**Phase:** Phase 1: Complete Application Audit (Investigation & Architecture Only)  
**Date:** 2026-11-15  
**Auditor:** Antigravity Agent  
**Scope:** Systematic catalog of identified defects, usability obstacles, security discrepancies, and workflow dead-ends across the application.

---

## 1. High-Priority Usability & Architecture Gaps

---

### GAP-01: Ghost Lead Exposure and Detail 404 Disconnect
- **Problem:** Sales Executives can see leads belonging to other sales representatives in the general Leads Table, but receive an immediate `404 Not Found` when clicking on them.
- **Evidence:**
  - `app/(dashboard)/[orgSlug]/leads/page.tsx` (Lines 27-44): Uses `createServiceClient()` to query `.from('leads').select(...).eq('org_id', org.id)` without checking `role` or `assigned_to`.
  - `app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx` (Lines 68-70): Calls `getLeadById(leadId)`.
  - `lib/dal/leads.ts` (Lines 8-22): Uses authenticated `createClient()`. Supabase RLS policy `members_can_read_leads` (`supabase/migrations/20260011_tenant_isolation_rls.sql`, lines 130-138) strictly permits `sales_exec` to SELECT only rows where `assigned_to = auth_profile_id()`. The query returns null and `notFound()` is triggered.
- **Affected Roles:** Sales Executive (`sales_exec`).
- **Business Impact:** High confusion, perceived software bugs, broken user workflow, and potential leakage of prospect contact information before clicking.
- **Recommended Correction:** Align `app/(dashboard)/[orgSlug]/leads/page.tsx` to automatically filter by `assigned_to = auth.profile.id` when `role === 'sales_exec'`, while providing a clear toggle for Managers/Admins to view "My Leads" vs "All Team Leads".
- **Clarification Required:** No. Standard RLS alignment.

---

### GAP-02: Crashed Multi-Org Personal Dashboard (`/my/dashboard`)
- **Problem:** When an employee belongs to more than one developer organization (e.g. contracting across multiple entities), loading `/my/dashboard` results in an unhandled 500 runtime error.
- **Evidence:**
  - `app/(dashboard)/my/dashboard/page.tsx` (Lines 37-41):
    ```typescript
    const { data: membership } = await supabase
      .from('org_members').select('org_id, role, organisations(slug)')
      .eq('profile_id', profile.id).single()
    ```
  - Calling `.single()` on a profile with multiple memberships throws Supabase error `PGRST116: JSON object requested, multiple (or no) rows returned`.
- **Affected Roles:** All multi-org users accessing their personal dashboard.
- **Business Impact:** Complete page crash for multi-org users.
- **Recommended Correction:** Replace `.single()` with multi-org aware query or scope the personal dashboard to the currently active workspace (`/[orgSlug]/my-dashboard`).
- **Clarification Required:** Yes (Business Decision #2): Should personal dashboards be org-scoped (`/[orgSlug]/my-dashboard`) or global cross-org (`/my/dashboard`)?

---

### GAP-03: Mandatory Organization Creation on User Registration
- **Problem:** Every user who creates an account is forced to create a new organization, making it impossible for hired sales managers or sales executives to register and join an existing developer workspace.
- **Evidence:**
  - `components/auth/RegisterForm.tsx` (Lines 31-100): Forces user through Step 1 (Account credentials) directly into Step 2 (Organisation Details: Org Name, Org Type). Submitting executes `POST /api/orgs`, assigning the user as `owner` of a new organization.
  - `app/api/orgs/route.ts` (Lines 105-117): Is the only route in the application that writes to `org_members`.
- **Affected Roles:** Newly hired Sales Executives, Sales Managers, and Team Members.
- **Business Impact:** Results in hundreds of empty orphan organisations created by employees who just wanted to log into their employer's workspace.
- **Recommended Correction:** Split `/register` into:
  1. "Create a New Workspace" (for Developer Owners).
  2. "Join an Existing Workspace" (via invitation link or workspace code).
- **Clarification Required:** No. Essential SaaS onboarding pattern.

---

### GAP-04: Lack of In-App Workspace Switcher
- **Problem:** Once inside a workspace (`/[orgSlug]`), a user with multiple memberships has no user interface element to switch between organizations.
- **Evidence:**
  - `components/layout/Sidebar.tsx` (Lines 101-119): Displays `Growth OS` and the organization name as non-clickable plain text.
  - `components/layout/Header.tsx` (Lines 1-43): Contains only a non-functional Bell and a Sign Out button.
  - The only workspace selector exists at `/select-org`, which is only reachable via redirect if an invalid slug is entered or after fresh login.
- **Affected Roles:** Developer Owners, External Consultants, Multi-Project Sales Directors.
- **Business Impact:** Severe friction; users must manually edit URL paths in browser address bar.
- **Recommended Correction:** Add a workspace switcher dropdown to the Sidebar brand section or Header, listing all organizations the user belongs to with an option to "+ Create or Join Workspace".
- **Clarification Required:** No. Standard enterprise UX requirement.

---

### GAP-05: Non-Role-Adaptive Static Navigation
- **Problem:** The navigation sidebar shows identical tabs to all user roles regardless of permissions or business relevance.
- **Evidence:**
  - `components/layout/Sidebar.tsx` (Lines 26-75): Hardcodes 9 navigation items for all users.
  - Sales Executives see "Integrations", "Analytics & BI", "Team", and "Settings".
  - Read-Only users see full operational menus.
- **Affected Roles:** Sales Executives, Read-Only Auditors, Channel Partners.
- **Business Impact:** Cluttered interface, cognitive overload, and navigation dead-ends.
- **Recommended Correction:** Pass the user's verified `role` from `OrgLayout` to `Sidebar` and dynamically render role-specific navigation subsets:
  - *Sales Executive:* My Dashboard, Leads, Site Visits, Inventory.
  - *Sales Manager:* Overview, Leads, Sales & Pipeline, Site Visits, Inventory, Projects, Team Performance.
  - *Admin/Owner:* Full executive suite (Overview, Analytics & BI, Sales & CPs, Projects, Inventory, Leads, Integrations, Team, Settings).
- **Clarification Required:** No. Core role-based UX best practice.

---

### GAP-06: Read-Only Team Directory (Missing Invitations & Role Controls)
- **Problem:** The Team management screen displays a member list, but provides no capability to invite, add, edit, or remove members.
- **Evidence:**
  - `app/(dashboard)/[orgSlug]/team/page.tsx` (Lines 117-205): Only renders an HTML table.
  - Empty state promises: *"Invite sales executives and managers to your workspace"*, but there is no button, modal, or backend invitation API in the codebase.
- **Affected Roles:** Workspace Owners, Administrators, Sales Managers.
- **Business Impact:** Platform adoption blocked; developers cannot invite their sales teams without technical intervention.
- **Recommended Correction:** Implement an "Invite Member" modal that collects email, full name, and role, sending an email invitation via Supabase Auth Admin API (`inviteUserByEmail`), and an action menu to change roles or deactivate members.
- **Clarification Required:** No.

---

### GAP-07: Inert Sales Operations & Deals Pipeline UX
- **Problem:** The Sales & Channel Partner Operations page (`/[orgSlug]/sales`) contains tabs that are read-only and display technical UUIDs.
- **Evidence:**
  - `components/sales/SalesOperationsView.tsx`:
    - Line 41: Displays internal engineering label `"Stage 5 Active"`.
    - Line 107: Deals cards display raw truncated IDs: `Lead ID: 894bf8...` instead of lead name, contact phone, or project title.
    - Lines 120-228: All tabs (Visits, Bookings, Partners) lack creation modals.
- **Affected Roles:** Sales Managers, Closing Agents.
- **Business Impact:** Sales reps cannot log site visits, holds, or bookings directly from the sales hub.
- **Recommended Correction:** Remove engineering milestone badges, populate Deals cards with hydrated lead details, and add interactive creation dialogs ("+ Schedule Site Visit", "+ Record Hold", "+ Onboard Channel Partner").
- **Clarification Required:** No.

---

### GAP-08: Disconnected Channel Partner Ecosystem
- **Problem:** Channel Partner organizations registered under `organisations.type = 'channel_partner'` have no data relationship with developer workspaces.
- **Evidence:**
  - `supabase/migrations/20260023_sales_and_channel_partners.sql`: `channel_partners` is a flat directory table inside the developer's organization.
  - A broker creating a CP account has no access to developer projects, inventory availability, or commission tracking.
- **Affected Roles:** Channel Partners, Brokerages.
- **Business Impact:** Channel partners cannot use the platform collaboratively with developers.
- **Recommended Correction:** Build a syndication/partnership protocol linking developer projects to registered CP accounts.
- **Clarification Required:** Yes (Business Decision #1): How should the relationship between Developer organizations and Channel Partner organizations be structured?

---

### GAP-09: Unfunctional Header Notification Bell
- **Problem:** The Bell icon in the top header is static and non-interactive.
- **Evidence:**
  - `components/layout/Header.tsx` (Lines 27-32): Renders `<button><Bell className="w-4 h-4" /></button>` with no `onClick`, no badge counter, and no notification drawer.
- **Affected Roles:** All users.
- **Business Impact:** Users do not receive timely alerts when leads are assigned, site visits are scheduled, or unit holds are about to expire.
- **Recommended Correction:** Wire an in-app notification center that surfaces real-time alerts for lead assignments, upcoming visits, and holding expiries.
- **Clarification Required:** No.
