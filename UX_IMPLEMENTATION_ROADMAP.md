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
│ PHASE 4: Team Onboarding, Invitations & Channel Partner Portal         │
│ - Workspace Invitation Flow (Invite via email & accept invitation)    │
│ - Split `/register` into "Create Workspace" vs "Join Workspace"        │
│ - Team Member Role Management & Deactivation UI                        │
│ - Channel Partner Project Collateral & Referral Submission Portal      │
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

### PHASE 4: Team Onboarding, Invitations & Channel Partner Portal

#### Objective
Enable self-service developer team onboarding and structured broker collaboration.

#### Target Components & Routes:
- `app/(auth)/register/page.tsx`
- `components/auth/RegisterForm.tsx`
- `app/(dashboard)/[orgSlug]/team/page.tsx`
- `components/team/InviteMemberModal.tsx` *(New)*
- `app/api/team/invite/route.ts` *(New)*
- `app/invite/[token]/page.tsx` *(New)*
- `components/sales/ChannelPartnerPortalView.tsx` *(New)*

#### Deliverables:
1. **Onboarding Split:**
   - Update `/register` to offer: "Register Developer Organization" vs "Join Workspace via Invite".
2. **Team Member Invitation Engine:**
   - Implement `InviteMemberModal` in `/[orgSlug]/team`.
   - Admin enters Email, Name, and selects Role (`manager`, `sales_exec`, `readonly`).
   - System sends Supabase invite email or generates a secure acceptance link.
3. **Team Management Actions:**
   - Add action dropdown per member row: Change Role, Reassign Leads, Deactivate Access.
4. **Channel Partner Collaboration Experience:**
   - Enable brokers to view authorized developer projects, live inventory availability, and submit referrals with automatic broker attribution.

#### Database & Security Implications:
- Add an `invitations` table (`id`, `org_id`, `email`, `role`, `invited_by`, `token`, `expires_at`, `status`) via a clean new migration.
- Strict RLS on invitations: only org admins can read/write.

#### Testing Requirements:
- Invitation lifecycle tests (generation, expiration, acceptance, role assignment).
- Channel partner referral submission and attribution isolation tests.

---

## 3. Dependency & Risk Matrix

| Phase | Estimated Complexity | Dependencies | Risk Level | Mitigation Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **Phase 2** | Low | None | Low | Modifies only frontend layout, navigation props, and multi-org query safety. Zero schema risk. |
| **Phase 3** | Medium | Phase 2 | Low | Uses existing Stage 5 DAL and API endpoints. Aligns leads table query with existing RLS rules. |
| **Phase 4** | High | Phases 2 & 3 | Medium | Requires new `invitations` migration and email sending integration. Staged as independent milestone. |
