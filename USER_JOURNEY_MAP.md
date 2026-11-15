# USER JOURNEY MAP
## PRODUCTION X — REAL ESTATE GROWTH OS

**Document ID:** `UX-JOURNEY-001`  
**Phase:** Phase 1: Complete Application Audit (Investigation & Architecture Only)  
**Date:** 2026-11-15  
**Auditor:** Antigravity Agent  
**Scope:** End-to-end lifecycle journeys for every supported user role, tracing current realities, dead ends, and required experience enhancements.

---

## 1. Journey Matrix by Role

```
┌───────────────────────────────┬───────────────────────────────┬───────────────────────────────┐
│ Role                          │ Primary Daily Objective       │ Key Current Friction Point    │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Developer Owner / Director    │ Business ROI, cashflow, deals │ No executive summary; BI page │
│                               │ and inventory absorption.     │ labeled "Stage 6 Active".     │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Sales Manager / Team Lead     │ Pipeline tracking, team       │ Cannot invite team; cannot    │
│                               │ velocity, lead distribution.  │ view rep workload in one view.│
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Sales Executive / Closing Rep │ Rapid buyer follow-ups, calls,│ Forced to see org overview;   │
│                               │ site visits, unit blocking.   │ lead detail 404s on unassigned│
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Channel Partner (Broker)      │ Project collateral, inventory │ No broker portal; isolated    │
│                               │ availability, commission payouts. in empty parallel workspace.│
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

---

## 2. Detailed Role-Based Journeys

### 2.1 Role 1: Developer Owner / Administrator

#### Phase A: Onboarding & Workspace Registration
1. **Entry Point:** Lands on `/register`.
2. **Step 1 (Account):** Enters Full Name, Email, Password (min 8 chars).
3. **Step 2 (Organisation):** Enters Organization Name (e.g. "Prestige Group"), selects "Property Developer / Builder".
4. **Outcome:** Auth user created, Profile created, Organization created, and user inserted into `org_members` with `role = 'owner'`.
5. **Initial State:** Starter demo data seeded automatically (`lib/demo/seed.ts`), so the workspace opens with sample projects and leads.

#### Phase B: Project Setup & Team Onboarding
1. **Adding Projects:** Navigates to `/[orgSlug]/projects/new`. Selects category (Apartments, Plotted, Villas, Commercial, Mixed-Use). Fills in RERA number, launch date, amenities, and specifications.
2. **Adding Hierarchy & Inventory:** Opens project, navigates to Hierarchy tab, adds Towers and Floors. Uses "Bulk Import" (`/[orgSlug]/inventory`) to upload inventory CSV.
3. **Inviting Team Members (CRITICAL BOTTLENECK):** Navigates to `/[orgSlug]/team`. Expects an "Invite Member" button. Finds only a static table. Must ask technical database administrators to run raw SQL inserts into `org_members` to onboard sales staff.

#### Phase C: Executive Management & BI
1. **Daily Overview:** Logs into `/[orgSlug]`. Views high-level counts: Active Projects, Total Inventory Units, Total Leads, Confirmed Bookings.
2. **Performance Review:** Clicks `Analytics & BI` (`/[orgSlug]/analytics`). Reviews inventory value, absorption percentage, sales velocity in days, and funnel conversion rates.
3. **Friction:** Cannot filter analytics by date range (e.g. "This Month", "Last Quarter").

---

### 2.2 Role 2: Sales Manager / Team Lead

#### Phase A: Onboarding
1. **Arrival:** Currently cannot be invited via email link. Must either register a dummy company at `/register` and have an admin reassign their `org_members` record, or be created directly in PostgreSQL.
2. **First Login:** Enters credentials at `/login`. Redirected to `/select-org` (or directly into `/[orgSlug]`).

#### Phase B: Daily Sales Operations & Pipeline Control
1. **Morning Inspection:** Opens `/[orgSlug]/sales`.
   - Checks **Deals Pipeline** Kanban (`stage = 'enquiry'`, `'site_visit_scheduled'`, `'negotiation'`, `'booked'`).
   - *Friction:* Deal cards show raw UUID snippets (`Lead ID: 894bf8...`) instead of customer name and phone number.
2. **Reviewing Unassigned Leads:** Opens `/[orgSlug]/leads`. Filters by `Status = New`.
   - Opens an unassigned lead.
   - Clicks "Assign Lead" button. Modal opens (`AssignLeadDialog.tsx`).
   - Selects a sales executive from dropdown and saves.
   - Backend logs assignment in `lead_activities` and updates `leads.assigned_to`.
3. **Monitoring Site Visits:**
   - Clicks `Site Visits` tab under `/[orgSlug]/sales`.
   - Views scheduled visits, visitor counts, and cab requirements.
   - *Friction:* View is read-only. Manager cannot reschedule or reassign visits from this tab.

---

### 2.3 Role 3: Sales Executive / Closing Representative

#### Phase A: Onboarding
- Account manually provisioned. Role set to `sales_exec` in `org_members`.

#### Phase B: Daily Calling & Follow-Up Workflow
1. **Morning Login:** Logs in at `/login`.
2. **Landing Screen:** The system routes them to `/[orgSlug]` (Workspace Overview).
   - *Friction:* The rep sees total corporate inventory value and company-wide lead counts. They have to know to navigate to `/my/dashboard` (which is not linked in the sidebar) or `/[orgSlug]/leads`.
3. **Finding Assigned Leads:**
   - Navigates to `/[orgSlug]/leads`.
   - *Friction:* The table displays all leads in the company. The rep must visually scan for their name in the "Assignee" column because there is no quick "My Leads" preset filter.
4. **Contacting Prospective Buyer:**
   - Clicks on an assigned lead.
   - If the lead is assigned to them, the detail page opens (`/[orgSlug]/leads/[leadId]`).
   - *Severe Error:* If the rep clicks on any lead not assigned to them, the system throws a **404 Not Found** because RLS blocks `getLeadById()`.
5. **Updating Status & Logging Activity:**
   - In Lead Detail, rep changes status from `new` to `contacted` using `StatusTransitionPanel`.
   - Enters notes in the activity log.
   - *Friction:* No one-click "Call" or "WhatsApp" launcher with auto-templated messages.

---

### 2.4 Role 4: Channel Partner (Broker / External Agency)

#### Phase A: Current Experience (Broken Workflow)
1. **Registration:** Broker registers at `/register`, selecting "Channel Partner".
2. **Workspace Landing:** Drops into an empty isolated workspace `/[brokerSlug]`.
3. **Dead End:** Broker sees 0 projects and 0 inventory units. There is no search bar or marketplace to discover developer projects in Hyderabad. The broker cannot share project brochures with clients.

#### Phase B: Intended Enterprise Experience
1. **Developer Registration:** Developer adds broker to `channel_partners` directory with RERA number and tier.
2. **Access Invitation:** Developer generates a secure partner invitation link.
3. **Partner Portal:** Broker logs in, views authorized developer projects, checks live unit availability (Available / Booked / Hold), downloads branded digital brochures, and registers prospective buyer referrals directly into the developer's CRM with automatic source attribution.

---

### 2.5 Role 5: Employee Departure & Account Offboarding

#### Current Implementation Reality:
- **No UI Exists:** Neither `/[orgSlug]/team` nor `/[orgSlug]/settings` provides a "Deactivate Member" or "Remove Member" button.
- **Database Behavior:**
  - `org_members` table has `ON DELETE RESTRICT` on `organisations(id)` and `profiles(id)`.
  - `leads` table has `assigned_to REFERENCES profiles(id) ON DELETE SET NULL`.
- **Departure Risks:**
  1. If an administrator deletes a member profile in PostgreSQL, any active leads assigned to that person have `assigned_to` set to `NULL`.
  2. If the auto-assign trigger fires, those unassigned leads are distributed to whoever has the fewest open leads, without human manager review.
  3. The departed employee's Supabase auth session remains active unless revoked in the Supabase Cloud dashboard.

---

## 3. Journey Friction Points & Improvement Opportunities

```
┌─────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Current Point of Failure        │ UX & Workflow Solution                                 │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. Mandatory Org Creation       │ Split `/register` into "Create Org" vs "Join via Code" │
│ 2. Invisible Workspace Switcher │ Add workspace dropdown in Topbar / Sidebar             │
│ 3. Static Sidebar Navigation    │ Filter sidebar items based on `role` and `org.type`    │
│ 4. Universal Overview Dashboard │ Route `sales_exec` to focused Personal Pipeline view   │
│ 5. Read-Only Team & Sales Views │ Add "+ Invite Member", "+ Schedule Visit" modals       │
│ 6. Inactive Bell Icon           │ Build in-app Activity / Notification dropdown          │
│ 7. Lead Detail 404 Disconnect   │ Align leads table query with RLS role constraints     │
└─────────────────────────────────┴────────────────────────────────────────────────────────┘
```
