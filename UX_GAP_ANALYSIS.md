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

### GAP-01: Ghost Lead Exposure and Detail 404 Disconnect [RESOLVED IN PHASE 2]
- **Problem:** Sales Executives previously saw leads belonging to other sales representatives in the general Leads Table, but received an immediate `404 Not Found` when clicking on them.
- **Resolution:** Resolved in Phase 2. Query filtered by `assigned_to = profile.id` for `sales_exec` on server; lead detail view enforces matching tenant and assignment checks.

---

### GAP-02: Crashed Multi-Org Personal Dashboard (`/my/dashboard`) [RESOLVED IN PHASE 2]
- **Problem:** When an employee belonged to more than one developer organization, loading `/my/dashboard` crashed due to `.single()`.
- **Resolution:** Resolved in Phase 2. Safe multi-org resolution handles 0, 1, and multiple memberships without crashing, redirecting to `/select-org` when no explicit slug is provided.

---

### GAP-03: Public Self-Service Registration vs Organisation-Controlled SaaS Provisioning
- **Problem:** Arbitrary public self-registration allows uncontrolled creation of organizations and users. Employees hired by an existing developer or brokerage cannot simply accept an invitation into their employer's workspace; instead, public registration forces the creation of an isolated, orphan organization.
- **Evidence:**
  - `components/auth/RegisterForm.tsx` (Lines 31-100): Forces user through Step 1 (Account credentials) directly into Step 2 (Organisation Details: Org Name, Org Type), creating a new organization via `POST /api/orgs`.
  - `app/api/orgs/route.ts` (Lines 105-117): Allows any authenticated user to create an organization and become `owner`.
- **Affected Roles:** Newly hired Sales Executives, Sales Managers, and Team Members.
- **Approved Product Direction:**
  1. Production X operates as an organization-controlled subscription SaaS.
  2. Public self-service employee registration is prohibited. The login shell will provide Email, Password, Sign in, and Forgot password, with clear messaging that access is provisioned by an organization administrator.
  3. Customer organizations are provisioned through an authorized Production X onboarding process by Platform Administrators.
  4. Internal staff are invited by authorized organization administrators (`org_invitations`). Accepting an invitation links the user to the existing organization and **never** creates a new organization.
- **Status:** Architecture approved; implementation scheduled for Onboarding & Access Management phase.

---

### GAP-04: Lack of In-App Workspace Switcher [RESOLVED IN PHASE 2]
- **Problem:** Once inside a workspace (`/[orgSlug]`), a user with multiple memberships had no user interface element to switch between organizations.
- **Resolution:** Resolved in Phase 2. Built interactive Workspace Switcher dropdown in Sidebar and Header listing all verified memberships with active state indicators.

---

### GAP-05: Non-Role-Adaptive Static Navigation [RESOLVED IN PHASE 2]
- **Problem:** Navigation sidebar showed identical tabs to all user roles regardless of permissions.
- **Resolution:** Resolved in Phase 2. Role-adaptive navigation groups sections by role (`sales_exec`, `manager`, `admin`, `channel_partner`) and enforces server-authoritative route guards.
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

---

### GAP-10: Missing Subscription Seat Accounting & Limit Enforcement
- **Problem:** The application has no mechanism to track subscription seat allowances, count occupied vs reserved seats, or block unauthorized employee over-allocation.
- **Evidence:**
  - `organisations` table contains only a static `plan` enum (`free`, `growth`, `enterprise`) with zero seat allowance metadata.
  - `app/(dashboard)/[orgSlug]/team/page.tsx` renders a read-only table without a seat usage indicator.
  - There is no API barrier preventing unlimited additions to `org_members`.
- **Approved Product Direction:**
  1. Subscriptions define included seats and additional purchased seats per plan tier (flexible; not hardcoded).
  2. Active members (`org_members`) consume seats; pending invitations (`org_invitations`) reserve seats.
  3. When `Available Seats <= 0`, invitation APIs strictly reject requests with HTTP 403 / 409 and clear guidance to purchase additional seats or upgrade plan.
- **Status:** Architecture approved; schema and enforcement planned.

---

### GAP-11: Missing Employee Deactivation & Safe Lead Reassignment Workflow
- **Problem:** When an employee departs an organization, administrators have no mechanism to deactivate their access without either deleting records (which risks cascading data deletion or orphan foreign keys) or relying on manual SQL.
- **Evidence:**
  - `org_members` has no `status` column (`active` vs `deactivated`).
  - No lead reassignment flow exists upon offboarding; active leads risk being silently orphaned or auto-assigned without management oversight.
- **Approved Product Direction:**
  1. Add `status` (`'active' | 'deactivated'`) and `deactivated_at` to `org_members`.
  2. Deactivation immediately cuts off access to that workspace.
  3. Deactivation interface presents a mandatory lead reassignment dialog (reassign to specific rep or move to unassigned pool).
  4. Historical lead activities, notes, and booking records permanently retain the departed employee's name for auditing.
- **Status:** Architecture approved; implementation planned.
