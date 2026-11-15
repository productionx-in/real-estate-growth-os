# UX IMPLEMENTATION ROADMAP
## PRODUCTION X — REAL ESTATE GROWTH OS

**Document ID:** `UX-ROADMAP-001`  
**Phase:** Phase 1: Complete Application Audit (Investigation & Architecture Only)  
**Date:** 2026-11-15  
**Auditor:** Antigravity Agent  
**Scope:** Staged, non-destructive implementation plan for transforming user journeys, navigation, role-based workflows, and team onboarding without modifying existing core logic or breaking completed stages.

---

## 1. Roadmap Architecture & Execution Principles

This transformation roadmap is organized into 4 disciplined, non-destructive phases. Each phase builds on existing code, preserves all Stage 1–6 functionality, adheres strictly to tenant isolation, and avoids premature database modifications.

```
┌────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Complete Application Audit (Investigation & Architecture)    │
│ [STATUS: COMPLETE] - UX Audit, Entity Maps, Journeys & Gaps Catalogued │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ PHASE 2: Navigation Shell, Workspace Switching & Role Foundations      │
│ - Global Workspace Switcher in Header & Sidebar                        │
│ - Dynamic Role-Adaptive Sidebar Navigation                             │
│ - Fix Multi-Org /my/dashboard PGRST116 Bug                             │
│ - Remove internal engineering labels ("Stage 5/6 Active")             │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ PHASE 3: Lead Management & Daily Sales Operations Polish              │
│ - Align Leads Table query with RLS constraints (fix Ghost Lead 404)    │
│ - "My Leads" vs "All Team Leads" quick toggle for Managers             │
│ - One-click Call (`tel:`) and WhatsApp (`wa.me`) action buttons        │
│ - Hydrate Deals Kanban cards with Customer Name & Phone                │
│ - Interactive Modals: "+ Schedule Site Visit", "+ Record Blocking"     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ PHASE 4: Subscription-Based Access, Provisioning & Team Lifecycle      │
│ - Platform Admin Customer Organization & Subscription Provisioning     │
│ - Org Administrator Employee Invitation Flow (with Seat Reservations)  │
│ - Subscription Seat Metering & Limit Enforcement (Included + Add-on)   │
│ - Secure Login Shell (Remove public employee self-service signup)      │
│ - Member Role Management, Deactivation & Safe Lead Reassignment        │
│ - Channel Partner Referral Portal & Project Syndication                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase Breakdown

---

### PHASE 2: Navigation Shell, Workspace Switching & Role Foundations

#### Objective
Transform the static application shell into a role-aware, multi-workspace enterprise SaaS interface.

#### Target Components & Routes:
- `components/layout/Sidebar.tsx`
- `components/layout/Header.tsx`
- `app/(dashboard)/[orgSlug]/layout.tsx`
- `app/(dashboard)/my/dashboard/page.tsx`
- `components/sales/SalesOperationsView.tsx`
- `components/analytics/ExecutiveBiDashboardView.tsx`

#### Deliverables:
1. **OrgLayout Context Propagation:** Pass active `role`, `user`, and `profile` from `getVerifiedWorkspace` to `Sidebar` and `Header`.
2. **Workspace Switcher Dropdown:** Build a polished workspace selector in the top-left sidebar brand section or header, enabling instant switching between organizations the user belongs to.
3. **Role-Adaptive Sidebar:**
   - *Sales Executive:* Overview (Personal Pipeline), My Leads, Site Visits, Inventory Explorer.
   - *Sales Manager:* Overview (Team), All Leads, Sales Deals, Site Visits, Inventory, Projects, Team.
   - *Owner / Admin:* Overview (Executive), Analytics & BI, Sales & CPs, Projects, Inventory, Leads, Integrations, Team, Settings.
4. **Fix `/my/dashboard`:** Replace `.single()` with multi-org safe query and make personal dashboard directly accessible from the executive view.
5. **Clean Production Labels:** Remove internal development badges (`"Stage 5 Active"`, `"Stage 6 Active"`).

#### Database & Security Implications:
- Zero database changes required.
- Zero risk to existing RLS policies.

#### Testing Requirements:
- Multi-org workspace switching test.
- Navigation item visibility test across `owner`, `manager`, `sales_exec`, and `readonly`.

---

### PHASE 3: Lead Management & Daily Sales Operations Polish

#### Objective
Streamline the core daily workflow for sales reps and sales managers, eliminating the 404 disconnect and enabling rapid customer action.

#### Target Components & Routes:
- `app/(dashboard)/[orgSlug]/leads/page.tsx`
- `components/leads/LeadsTable.tsx`
- `components/leads/LeadStatusBadge.tsx`
- `app/(dashboard)/[orgSlug]/leads/[leadId]/page.tsx`
- `components/sales/SalesOperationsView.tsx`
- `components/sales/ScheduleSiteVisitModal.tsx` *(New)*
- `components/sales/RecordBlockingModal.tsx` *(New)*

#### Deliverables:
1. **Fix Ghost Lead Visibility Disconnect:**
   - When caller is `sales_exec`, default the Leads Table query to `.eq('assigned_to', auth.profile.id)` to match Supabase RLS.
   - For managers/owners, provide an instant segmented filter: `[ All Leads | Assigned to Me | Unassigned ]`.
2. **One-Click Communication Triggers:**
   - In Lead Detail and table rows, add direct communication icons:
     - Phone icon: triggers `tel:${phone}`.
     - WhatsApp icon: triggers `https://wa.me/${cleanPhone}` with optional starter message.
3. **Hydrate Deals Pipeline Cards:**
   - Update `getDeals(org.id)` to join `leads(name, phone)` and `projects(name)`.
   - Render buyer name, contact, and project badge on each Kanban deal card instead of `Lead ID: 894bf8...`.
4. **Interactive Sales Operations Modals:**
   - Add "+ Schedule Site Visit" modal connecting directly to `POST /api/sales/site-visits`.
   - Add "+ Record Hold / Blocking" modal connecting directly to `POST /api/sales/blockings`.

#### Database & Security Implications:
- Zero database changes required. All underlying tables (`site_visits`, `inventory_blockings`, `deals`) already exist in Migration 0023.

#### Testing Requirements:
- Lead detail access verification for sales reps.
- Site visit scheduling and holding creation end-to-end tests.

---

### PHASE 4: Subscription-Based Access, Provisioning & Team Lifecycle

#### Objective
Implement an organization-controlled, subscription-based SaaS access model with strict seat allowance enforcement, invite-only employee onboarding, safe employee deactivation, and controlled organization provisioning.

#### Target Components & Routes:
- `app/(auth)/login/page.tsx` & `components/auth/LoginForm.tsx`
- `app/(auth)/register/page.tsx` & `components/auth/RegisterForm.tsx` (Transitioned away from public arbitrary signup)
- `app/(dashboard)/[orgSlug]/team/page.tsx`
- `components/team/InviteMemberModal.tsx` *(New)*
- `components/team/SubscriptionSeatMeter.tsx` *(New)*
- `components/team/DeactivateMemberModal.tsx` *(New)*
- `app/api/team/invite/route.ts` *(New)*
- `app/api/team/members/[memberId]/route.ts` *(New)*
- `app/invite/[token]/page.tsx` *(New)*
- `components/sales/ChannelPartnerPortalView.tsx` *(New)*

#### Deliverables:
1. **Public Auth Shell Hardening:**
   - Remove public self-service employee registration.
   - Login page provides Email, Password, Sign In, and Forgot Password.
   - Display clear guidance that access is provisioned by organization administrators.
2. **Platform Administrator Provisioning:**
   - Authorized Production X onboarding process creates customer organization and sets initial subscription tier / seat allowance.
   - Sends initial organization administrator an activation link to claim the workspace.
3. **Employee Invitation & Seat Reservation Engine:**
   - Administrator invites staff (`email`, `role`, `expires_at`).
   - Pending invitations reserve a seat from the subscription pool.
   - Token-based acceptance (`/invite/[token]`) adds employee to the **existing** organization. Never spawns a new organization.
4. **Subscription Seat Accounting & Enforcement:**
   - Dynamic seat formula: `Available Seats = (Included Seats + Purchased Seats) - (Active Members + Pending Invites)`.
   - Enforce seat boundaries at API and UI levels. Block over-allocation and provide upgrade/add-seat pathways.
5. **Employee Lifecycle & Historical Retention:**
   - Role updates and employee deactivation.
   - Deactivation immediately revokes workspace access on server.
   - Mandatory lead reassignment modal (bulk reassign to active rep or unassigned pool).
   - Historical lead activity logs, call notes, and booking records permanently preserved.

#### Database & Security Implications:
- Migration 0025 staged on disk:
  - Table `org_subscriptions` (`org_id`, `plan_id`, `included_seats`, `additional_seats`, `status`, `billing_cycle`, `expires_at`).
  - Table `org_invitations` (`id`, `org_id`, `email`, `role`, `invited_by`, `token_hash`, `status`, `expires_at`).
  - Columns added to `org_members`: `status TEXT NOT NULL DEFAULT 'active'`, `deactivated_at TIMESTAMPTZ`.
  - Row Level Security: Invitations and subscription details accessible only to organization owners and admins.

#### Testing Requirements:
- Seat limit enforcement tests (blocking invitations when limit is reached).
- Invitation lifecycle tests (creation, expiry, cancellation, acceptance, seat reservation and release).
- Deactivation tests (access revocation, historical activity preservation, lead reassignment).
- Multi-organization seat independence tests.

---

## 3. Dependency & Risk Matrix

| Phase | Estimated Complexity | Dependencies | Risk Level | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 2** | Low | None | Low | Modifies only frontend layout, navigation props, and multi-org query safety. Zero schema risk. |
| **Phase 3** | Medium | Phase 2 | Low | Uses existing Stage 5 DAL and API endpoints. Aligns leads table query with existing RLS rules. |
| **Phase 4** | High | Phases 2 & 3 | Medium | Requires new `invitations` migration and email sending integration. Staged as independent milestone. |
