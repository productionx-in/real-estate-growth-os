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
│ Platform Administrator        │ Customer org provisioning,    │ No platform admin portal;     │
│ (Production X Operator)       │ subscription & seat management│ direct DB updates currently.  │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Developer Owner / Director    │ Business ROI, cashflow, deals │ Previously forced public      │
│                               │ and inventory absorption.     │ signup; now org-provisioned.  │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Sales Manager / Team Lead     │ Pipeline tracking, team       │ Cannot invite team or enforce │
│                               │ velocity, lead distribution.  │ subscription seat boundaries. │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Sales Executive / Closing Rep │ Rapid buyer follow-ups, calls,│ Needs simple invite acceptance│
│                               │ site visits, unit blocking.   │ without creating dummy orgs.  │
├───────────────────────────────┼───────────────────────────────┼───────────────────────────────┤
│ Channel Partner (Broker)      │ Project collateral, inventory │ No broker portal; isolated    │
│                               │ availability, commission payouts. in empty parallel workspace.│
└───────────────────────────────┴───────────────────────────────┴───────────────────────────────┘
```

---

## 2. Detailed Role-Based Journeys

### 2.1 Role 1: Developer Owner / Administrator

#### Phase A: Organisation Provisioning & Activation
1. **Commercial Onboarding:** Organization and initial subscription are provisioned by Production X Platform Administration (not via public self-service signup).
2. **Account Activation:** The designated Developer Administrator receives an activation email with a secure, time-limited token.
3. **Password Setup & First Login:** The administrator accesses the activation link, sets a strong password, and activates their profile.
4. **Outcome:** Auth user linked to the pre-provisioned organization as `owner` or `admin` with its configured seat allowance.
5. **Initial State:** Starter configuration and workspace initialized safely with zero orphan accounts.

#### Phase B: Project Setup & Team Onboarding
1. **Adding Projects:** Navigates to `/[orgSlug]/projects/new`. Selects category (Apartments, Plotted, Villas, Commercial, Mixed-Use). Fills in RERA number, launch date, amenities, and specifications.
2. **Adding Hierarchy & Inventory:** Opens project, navigates to Hierarchy tab, adds Towers and Floors. Uses "Bulk Import" (`/[orgSlug]/inventory`) to upload inventory CSV.
3. **Inviting Team Members (Subscription Controlled):**
   - Navigates to `/[orgSlug]/team`.
   - Views subscription seat meter (`Active Members + Pending Invites <= Total Seats`).
   - Clicks "+ Invite Team Member", enters employee email and assigns role (`sales_exec`, `manager`, `readonly`).
   - If seats available: generates invitation token, reserves seat, and sends invitation email.
   - If seat limit reached: displays explanatory banner with upgrade / purchase option.

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

### 2.5 Role 5: Invited Employee Onboarding (Sales Manager, Executive, Admin)

#### Phase A: Invitation & Account Creation
1. **Trigger:** Organization administrator sends invitation from `/[orgSlug]/team` specifying email, role, and expiration.
2. **Notification:** Employee receives an invitation email containing a secure token link (`/invite?token=...`).
3. **Invitation Acceptance:**
   - Case A (New User): Lands on acceptance screen. Sets full name and password. Account is activated and linked to the existing organisation with the assigned role. **Zero new organisations are created.**
   - Case B (Existing User): Signs in with existing credentials. Organization membership is added to their profile. User can immediately switch between organisations via the Workspace Switcher.
4. **Seat Reservation:** The invitation occupies 1 reserved seat until accepted (which converts to an active seat) or revoked/expired (which releases the seat).

---

### 2.6 Role 6: Employee Departure & Account Offboarding

#### Enterprise Managed Lifecycle:
1. **Action Initiation:** Organization Administrator navigates to `/[orgSlug]/team` and selects "Deactivate Member" from the actions menu.
2. **Safety Verification & Reassignment Modal:**
   - The system checks if the employee has active assigned leads (`status NOT IN ('booked', 'lost', 'junk')`), pending site visits, or active deals.
   - Administrator is presented with explicit options:
     - Option A: Reassign all active leads to a specific active sales representative.
     - Option B: Move leads to the workspace's Unassigned Queue for subsequent triage.
3. **Execution & Historical Preservation:**
   - Member status set to `deactivated` in `org_members`.
   - Access to the workspace is revoked immediately on the server.
   - Historical audit logs, call notes, completed site visits, and booking attributions created by the departed employee remain permanently preserved.
   - The deactivated seat is released, incrementing `Available Seats` by 1.

---

## 3. Journey Friction Points & Improvement Opportunities

```
┌─────────────────────────────────┬────────────────────────────────────────────────────────┐
│ Current Point of Failure        │ UX & Workflow Solution                                 │
├─────────────────────────────────┼────────────────────────────────────────────────────────┤
│ 1. Public Self-Service Signup   │ Shift to Subscription-based Platform Onboarding & Invites│
│ 2. Invisible Workspace Switcher │ Add workspace dropdown in Topbar / Sidebar (Phase 2 Done)│
│ 3. Static Sidebar Navigation    │ Filter sidebar items based on `role` and `org.type`    │
│ 4. Universal Overview Dashboard │ Route `sales_exec` to focused Personal Pipeline view   │
│ 5. Read-Only Team & Sales Views │ Add "+ Invite Member", "+ Schedule Visit" modals       │
│ 6. Inactive Bell Icon           │ Build in-app Activity / Notification dropdown          │
│ 7. Lead Detail 404 Disconnect   │ Align leads table query with RLS role constraints     │
│ 8. Unchecked Seat Capacity      │ Enforce plan seat limits at API layer with upgrade CTA │
│ 9. Unsafe Employee Departure    │ Deactivation modal with atomic lead reassignment       │
└─────────────────────────────────┴────────────────────────────────────────────────────────┘
```
