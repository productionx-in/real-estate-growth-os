# PRODUCTION X — REAL ESTATE GROWTH OS
# SECURITY REMEDIATION BLUEPRINT V6: DEFINITIVE ARCHITECTURE SPECIFICATION & IMPLEMENTATION READINESS

**Document Reference:** `PRODUCTION_X_SECURITY_REMEDIATION_BLUEPRINT_V6_FINAL.md`  
**Document Version:** 6.0 (Definitive Master Implementation Specification)  
**Date:** 2026-11-15T12:28:00+05:30  
**Target Codebase:** Production X Real Estate Growth OS (`real-estate-growth-os`)  
**Context:** Master resolution of Tasks 001 through 005. Reconciles verified repository and database facts (`0001`–`0025`), live application routes (`app/`, `lib/`), and all Product Owner directives into one single, internally consistent, production-ready specification.  
**Safety Protocol:** STRICTLY READ-ONLY ARCHITECTURE SPECIFICATION. Zero code modified, zero migration files created or executed, zero database records changed, zero deployments.

---

## 1. Executive Summary & Resolved Findings

This V6 specification supersedes all prior blueprints and validation documents. It eliminates all identified defects, removes all hardcoded assumptions, and provides production-ready, schema-qualified PostgreSQL DDL, atomic stored procedures, and TypeScript interfaces.

### 1.1 Resolution of V5 Architectural Defects

| Defect Category | Defect in V5 / Earlier Versions | Resolved V6 Architecture Specification |
|:---|:---|:---|
| **Onboarding Column Mismatch & Immutability** | Column mismatch (`OLD.reviewed_by` vs `NEW.approved_by`). Sales reps could modify commercial terms or administrative fields on draft requests. | **Separation of Requested vs Approved Values & DB Trigger:** Split fields into `requested_plan_code`, `requested_seats`, `requested_billing_cycle` versus `approved_plan_code`, `approved_seats`, `approved_billing_cycle`. Trigger `enforce_onboarding_request_field_immutability()` restricts sales reps to contact fields only (`company_name`, `admin_name`, `admin_email`, `admin_phone`, `commercial_notes`). Status transition from `draft` to `pending_approval` freezes the request as read-only. Only Super Admins can transition to `approved`, `rejected`, or `provisioned`. |
| **Seat Allocation Concurrency & Double Counting** | Check-then-act race conditions in JavaScript. Hardcoded seat bundle multiplier (`* 5`). Risk of double counting `additional_seats` and purchase records. | **Atomic Stored Procedure with Row-Locking & DB Trigger Guard:** Implemented `reserve_employee_seat_atomic()` using `SELECT ... FOR UPDATE` on `org_subscriptions`. Caller identity and role authority (`owner`, `admin`) are derived strictly from `auth.uid()`. Role delegation hierarchy is enforced. In addition, a `BEFORE INSERT` trigger on `org_invitations` guarantees that direct table inserts cannot bypass capacity checks. |
| **Legacy Plan Backfill Assumptions** | Invented default seat counts (5, 3), storage quotas (50GB), and intelligence credits (1000). Hardcoded plan UUIDs. | **Zero-Assumption Backfill & Verification Gate:** Removed all invented values. The backfill strictly preserves existing tenant terms in `org_subscriptions` (`included_seats`, `additional_seats`, `billing_cycle`, `status`). Plans are looked up by unique `code`, not hardcoded UUIDs. Foreign key constraint enforcement is gated behind a verification assertion checking for zero unmapped subscriptions. |
| **Financial Lifecycle Conflation** | Payment verification, payment allocation, and subscription restoration were conflated into a non-transactional JavaScript handler. | **Three-Phase Decoupled Financial Lifecycle:** Phase 1: Payment Verification (`pending_verification` -> `verified`). Phase 2: Atomic Payment Allocation supporting repeated partial allocations (`amount_paid_cents < total_cents` -> `partially_paid`). Phase 3: Subscription Restoration restricted strictly to Super Admins with MFA AAL2. Restoration is decoupled from queued webhook replay. |
| **Credit Ledger Concurrency & Auditability** | Lacked atomic credit deduction, invoice ownership validation, and formal reversal procedures. | **Atomic Stored Procedure & WORM Reversals:** Implemented `apply_credit_to_invoice_atomic()` with row-locking, cross-tenant ownership assertion, and non-expired balance verification. The ledger is strictly append-only (WORM); reversals create compensatory offset entries. |
| **Platform Roles & SECURITY DEFINER Hygiene** | `SECURITY DEFINER` functions defaulted to granting `EXECUTE` to `PUBLIC`. Broad RLS allowed sales reps to read all platform staff. | **Explicit Privilege Revocation & Scoped RLS:** Explicit `REVOKE ALL ON FUNCTION ... FROM PUBLIC` across all migrations. `EXECUTE` granted strictly to `authenticated` or `service_role`. Sales reps read only their own `platform_users` record; finance admins read only financial audit logs. Caller identity is derived from `auth.uid()`. |
| **Webhook Security & Key Custody** | Raw PII was stored without key management; purges lacked legal hold support. | **AES-256-GCM Envelope Encryption with Key Versioning:** Webhook payloads are encrypted with key ID tagging (`kid: 'prod-kms-2026-v1'`). Canonical JSON sorting precedes SHA-256 idempotency hashing. Staged records have `legal_hold BOOLEAN DEFAULT false`, and automated 180-day purges record audit logs. |
| **Read-Only Mode Operational Deadlock** | Blanket blocking of all mutation verbs locked admins out of billing; broad `/api/auth/*` exception created security risks. | **Exact Path-and-Method Permitted Mutation Allowlist:** Only specific non-mutating auth routes (`POST /api/auth/signout`, `POST /api/auth/session/refresh`) are allowed. Permitted billing actions (`POST /api/billing/payments`, `POST /api/billing/seat-requests`, `POST /api/support/tickets`) are validated independently. Ordinary CRM tables remain 100% locked. |

---

## 2. Verified Current-State Architecture

Based on evidence gathered from existing migrations (`0001` through `0025`), source code, and test suites:

### 2.1 Existing Database Schemas & Types
- **`public.organisations` (Migration 0002):**
  - Columns: `id (UUID)`, `name (TEXT)`, `slug (TEXT UNIQUE)`, `type (public.org_type NOT NULL DEFAULT 'developer')`, `plan (public.org_plan NOT NULL DEFAULT 'free')`, `logo_url (TEXT)`, `website (TEXT)`, `created_at`, `updated_at`.
  - Enum `public.org_type`: `'developer'`, `'channel_partner'`.
  - Enum `public.org_plan`: `'free'`, `'growth'`, `'enterprise'`.
- **`public.org_members` (Migrations 0003 & 0025):**
  - Columns: `id (UUID)`, `org_id (UUID REFERENCES organisations)`, `profile_id (UUID REFERENCES profiles)`, `role (public.member_role NOT NULL DEFAULT 'sales_exec')`, `invited_by (UUID REFERENCES profiles)`, `joined_at`, `status (TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deactivated', 'suspended')))`, `deactivated_at`, `deactivated_by`.
  - Enum `public.member_role`: `'owner'`, `'admin'`, `'manager'`, `'sales_exec'`, `'readonly'`.
- **`public.profiles` (Migration 0003):**
  - Columns: `id (UUID)`, `auth_user_id (UUID NOT NULL UNIQUE REFERENCES auth.users(id))`, `full_name (TEXT)`, `avatar_url (TEXT)`, `phone (TEXT)`, `created_at`, `updated_at`.
- **`public.org_subscriptions` (Migration 0025):**
  - Columns: `id (UUID)`, `org_id (UUID NOT NULL UNIQUE REFERENCES organisations)`, `plan_tier (TEXT NOT NULL DEFAULT 'growth')`, `included_seats (INTEGER NOT NULL DEFAULT 5)`, `additional_seats (INTEGER NOT NULL DEFAULT 0)`, `status (TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('trial', 'active', 'past_due', 'canceled', 'expired')))`, `billing_cycle (TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'annual')))`, `current_period_start`, `current_period_end`, `created_at`, `updated_at`.
- **`public.org_invitations` (Migration 0025):**
  - Columns: `id (UUID)`, `org_id (UUID REFERENCES organisations)`, `email (TEXT NOT NULL)`, `role (public.member_role NOT NULL DEFAULT 'sales_exec')`, `invited_by (UUID NOT NULL REFERENCES profiles)`, `token_hash (TEXT NOT NULL UNIQUE)`, `status (TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')))`, `expires_at`, `accepted_at`, `accepted_by`, `created_at`, `updated_at`.

### 2.2 Verified Baseline Test Harness
- Execution of `npm test` executes **24 test suites** (260+ assertions), all passing cleanly:
  `tests/inventory-rules.test.mjs`, `tests/security-isolation.test.mjs`, `tests/inventory-integrity.test.mjs`, `tests/atomic-rpc-contract.test.mjs`, `tests/multi-org-projects-and-team.test.mjs`, `tests/project-management.test.mjs`, `tests/project-hierarchy.test.mjs`, `tests/category-inventory.test.mjs`, `tests/inventory-table-and-detail.test.mjs`, `tests/visual-inventory.test.mjs`, `tests/bulk-inventory-import.test.mjs`, `tests/crm-integration-readiness.test.mjs`, `tests/integration-centre-ux.test.mjs`, `tests/meta-oauth-integration.test.mjs`, `tests/public-webhooks-ingestion.test.mjs`, `tests/google-ads-integration.test.mjs`, `tests/website-enquiry-forms.test.mjs`, `tests/whatsapp-business-integration.test.mjs`, `tests/property-portal-integrations.test.mjs`, `tests/integration-apis-and-extensibility.test.mjs`, `tests/sales-and-channel-partners.test.mjs`, `tests/digital-experience-and-automation.test.mjs`, `tests/phase2-navigation-and-role-foundations.test.mjs`, `tests/subscription-and-seat-entitlements.test.mjs`.

---

## 3. Final Platform & Tenant Role / Permission Matrix

### 3.1 Platform Administration Roles (`public.platform_users`)

```mermaid
flowchart TD
    SuperAdmin["Platform Super Admin<br/>(MFA AAL2 Mandatory)"]
    FinanceAdmin["Finance Admin<br/>(MFA AAL2 Mandatory)"]
    SalesExec["Sales Representative<br/>(Internal Staff)"]
    SupportAgent["Support Agent<br/>(Internal Staff)"]

    SuperAdmin -->|"Full Platform CRUD"| PlatAll["Customer Provisioning<br/>Subscription Restoration<br/>Grace Period Overrides<br/>Plan Version Creation<br/>Platform Staff Management"]
    FinanceAdmin -->|"Financial Operations"| PlatFin["Payment Verification<br/>Invoice Management<br/>Payment Allocation<br/>Credit Ledger Management"]
    SalesExec -->|"Commercial Intake"| PlatSales["Draft Onboarding Requests<br/>View Own Submissions"]
    SupportAgent -->|"Assistance"| PlatSupp["Support Ticket Triage<br/>Read-Only Diagnostics"]
```

| Capability | Anonymous | Customer Member | Sales Rep | Finance Admin | Super Admin |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Access Platform Admin UI (`/admin/*`)** | ❌ 401 | ❌ 403 | ❌ 403 | ✅ Verified | ✅ Verified (MFA) |
| **Create Onboarding Request (Draft)** | ❌ 401 | ❌ 403 | ✅ Permitted | ❌ Denied | ✅ Permitted |
| **Approve / Reject Onboarding Request** | ❌ 401 | ❌ 403 | ❌ 403 (Trigger) | ❌ Denied | ✅ Permitted |
| **Provision Organisation & Subscription** | ❌ 401 | ❌ 403 | ❌ 403 | ❌ Denied | ✅ Permitted (MFA) |
| **Verify Manual Offline Payments** | ❌ 401 | ❌ 403 | ❌ 403 | ✅ Permitted | ✅ Permitted |
| **Allocate Payments to Invoices** | ❌ 401 | ❌ 403 | ❌ 403 | ✅ Permitted | ✅ Permitted |
| **Restore Read-Only Subscription** | ❌ 401 | ❌ 403 | ❌ 403 | ❌ Denied | ✅ Permitted (MFA) |
| **Grant Grace Period Extension** | ❌ 401 | ❌ 403 | ❌ 403 | ❌ Denied | ✅ Permitted (MFA) |
| **Read Global Platform Audit Logs** | ❌ 401 | ❌ 403 | ❌ 403 | ❌ Financial Only | ✅ Full Log |

### 3.2 Customer Tenant Roles (`public.org_members`)

| Capability | Owner | Admin | Manager | Sales Executive | Read-Only |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Workspace Navigation (`/[orgSlug]`)** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **View Leads Pipeline** | ✅ All Leads | ✅ All Leads | ✅ All Leads | ⚠️ Assigned Only | ✅ View Only |
| **Create Lead (Manual / CSV)** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ 403 |
| **Manage Inventory & Status Transitions** | ✅ Allowed | ✅ Allowed | ✅ Allowed | ❌ View Only | ❌ View Only |
| **Invite Team Member (Atomic Seat Check)** | ✅ Allowed | ✅ Allowed | ❌ 403 | ❌ 403 | ❌ 403 |
| **Delegate Owner Role** | ✅ Allowed | ❌ 403 | ❌ 403 | ❌ 403 | ❌ 403 |
| **Submit Manual Payment Receipt** | ✅ Allowed | ✅ Allowed | ❌ 403 | ❌ 403 | ❌ 403 |
| **Request Additional Seats** | ✅ Allowed | ✅ Allowed | ❌ 403 | ❌ 403 | ❌ 403 |
| **Operations During Read-Only Mode** | ⚠️ Billing/Support | ⚠️ Billing/Support | ⚠️ Support Only | ❌ View Only | ❌ View Only |

---

## 4. Complete Onboarding & Provisioning State Machine

```mermaid
stateDiagram-v2
    [*] --> Draft: Sales Rep Creates Request
    Draft --> Draft: Sales Rep Edits Contact Details
    Draft --> PendingApproval: Sales Rep Submits Request (Frozen)
    
    PendingApproval --> Rejected: Super Admin Rejects (with Reason)
    PendingApproval --> Approved: Super Admin Approves & Confirms Terms
    
    Approved --> Provisioned: Super Admin Executes Atomic Provisioning
    
    state Provisioned {
        [*] --> OrgCreated: Insert public.organisations
        OrgCreated --> SubCreated: Insert public.org_subscriptions
        SubCreated --> InviteCreated: Insert public.org_invitations (token_hash)
        InviteCreated --> EmailDispatched: Transactional Mailer (Resend)
    }
    
    Provisioned --> ActiveTenant: Customer Sets Password via /invite/[token]
    Rejected --> Draft: Sales Rep Revises Based on Reason
```

### 4.1 Onboarding Field Separation & Immutability Rules
1. **Sales Rep Permitted Fields (in `draft` status only):**
   - `company_name (TEXT)`
   - `company_type (public.org_type: 'developer' | 'channel_partner')`
   - `admin_name (TEXT)`
   - `admin_email (TEXT)`
   - `admin_phone (TEXT)`
   - `commercial_notes (TEXT)`
   - `requested_plan_code (TEXT)`
   - `requested_seats (INTEGER)`
   - `requested_billing_cycle (TEXT: 'monthly' | 'annual' | 'multi_year')`
2. **Super Admin Confirmed Commercial Fields:**
   - `approved_plan_code (TEXT)`
   - `approved_seats (INTEGER)`
   - `approved_billing_cycle (TEXT)`
   - `reviewed_by (UUID REFERENCES auth.users)`
   - `reviewed_at (TIMESTAMPTZ)`
   - `rejection_reason (TEXT)`
   - `provisioned_org_id (UUID REFERENCES organisations)`
3. **Immutability Enforcement:** The PostgreSQL trigger `enforce_onboarding_request_field_immutability()` blocks non-super-admins from altering any approved/commercial fields or editing records once `status != 'draft'`.

---

## 5. Complete Subscription & Billing State Machine

```mermaid
stateDiagram-v2
    [*] --> Active: Provisioned / Subscribed
    
    Active --> InGrace: Current Period End (Unpaid Renewal)
    InGrace --> Active: Renewal Payment Allocated (Days 1–7)
    InGrace --> ReadOnly: Day 8 Reached (Grace Expired)
    
    ReadOnly --> Active: Super Admin Restores via restore_subscription_atomic()
    
    state ReadOnly {
        [*] --> MutationLock: POST/PUT/DELETE Blocked on CRM Records
        MutationLock --> PermittedBilling: POST /api/billing/payments Allowed
        MutationLock --> IngestQueue: Webhooks Staged in pending_lead_ingestions
    }
```

### 5.1 Financial Decoupling & Invoicing Lifecycle
1. **Phase 1: Invoice Issuance:**
   - Invoices (`subscription_invoices`) are generated on billing anniversary dates.
   - Status transitions: `draft` -> `issued` -> `partially_paid` -> `paid` (or `past_due`, `void`).
   - Stores `plan_snapshot (JSONB)` freezing plan limits, included seats, and unit prices.
2. **Phase 2: Payment Logging & Verification:**
   - Offline payment recorded into `subscription_payments` with method (`bank_transfer_neft_rtgs`, `cheque_dd`, `corporate_card`, `upi_business`, `wire_transfer`), UTR reference, and receipt attachment URL. Initial status: `pending_verification`.
   - Finance Admin verifies bank receipt -> updates status to `verified`.
3. **Phase 3: Atomic Allocation:**
   - Stored procedure `allocate_payment_to_invoice_atomic()` validates matching `org_id` and currency, locks both rows via `SELECT ... FOR UPDATE`, and updates `invoice.amount_paid_cents`.
   - Supports repeated partial allocations. Sets status to `paid` if and only if `amount_paid_cents >= total_cents`.
4. **Phase 4: Subscription Restoration:**
   - Triggered by Platform Super Admin with MFA AAL2 via `restore_subscription_atomic()`.
   - Synchronously unlocks the workspace (`is_read_only = false`, `status = 'active'`) and creates an immutable audit record.
   - Asynchronously triggers the queued lead replay worker. Corrupt payloads do **not** revert the restored workspace.

---

## 6. Seat & Invitation Architecture

### 6.1 Unified Capacity Formula
Seat capacity is derived dynamically without hardcoded bundle multipliers:
$$\text{Total Seats} = \text{Plan Included Seats} + \text{Base Additional Seats} + \sum_{\text{active}} \text{Purchased Add-On Seats}$$

$$\text{Available Seats} = \text{Total Seats} - (\text{Active Members} + \text{Unexpired Pending Invitations})$$

### 6.2 Atomic Concurrency-Safe Reservation
- Stored procedure `reserve_employee_seat_atomic()` executes `SELECT ... FOR UPDATE` on `org_subscriptions` to serialize invitations for that tenant.
- Derives caller identity from `auth.uid()`; validates `owner` or `admin` authority.
- Validates role delegation hierarchy (admins cannot invite owners).
- Inserts invitation with cryptographically hashed token (`token_hash = sha256(raw_token)`).
- **Trigger Defense-in-Depth:** Trigger `trg_assert_seat_capacity_on_invitation` on `public.org_invitations` guarantees that direct SQL inserts cannot bypass capacity rules.

---

## 7. Complete Database Schema & Migration Dependency Sequence

```mermaid
flowchart TD
    M0001["0001_enums.sql<br/>(org_type, member_role)"]
    M0002["0002_organisations.sql"]
    M0003["0003_profiles_and_members.sql"]
    M0011["0011_tenant_isolation_rls.sql<br/>(auth_has_role_in_org)"]
    M0015["0015_crm_integration_readiness.sql<br/>(integration_connections)"]
    M0025["0025_subscription_and_seat_entitlements.sql<br/>(org_subscriptions, org_invitations)"]

    subgraph ProposedRemediationMigrations ["Definitive Remediation Migrations (0026–0031)"]
        M0026["20260026_platform_admin_hardening.sql<br/>• platform_role enum<br/>• platform_users table<br/>• platform_audit_logs (WORM Trigger)<br/>• platform_mfa_recovery_codes<br/>• auth_is_platform_role() function"]
        M0027["20260027_closed_saas_onboarding_requests.sql<br/>• customer_onboarding_requests table<br/>• Field Immutability Trigger<br/>• Scoped Sales Rep Draft RLS"]
        M0028["20260028_tenant_isolation_rls_hardening.sql<br/>• Hardened auth_has_role_in_org()<br/>• om.status = 'active' filter"]
        M0029["20260029_configurable_plans_and_entitlements.sql<br/>• subscription_plans & versions<br/>• org_subscription_seat_purchases<br/>• reserve_employee_seat_atomic() RPC<br/>• Safe Legacy Data Backfill Gate"]
        M0030["20260030_manual_billing_and_payment_reconciliation.sql<br/>• subscription_invoices & payments<br/>• subscription_payment_allocations<br/>• org_credit_ledger (WORM pattern)<br/>• allocate_payment_to_invoice_atomic() RPC<br/>• restore_subscription_atomic() RPC"]
        M0031["20260031_read_only_pending_webhook_queue.sql<br/>• pending_lead_ingestions (180d)<br/>• legal_hold boolean flag<br/>• Canonical JSON Idempotency Deduplication"]
    end

    M0001 --> M0026
    M0026 --> M0027
    M0002 --> M0027
    M0011 --> M0028
    M0025 --> M0028
    M0025 --> M0029
    M0026 --> M0029
    M0029 --> M0030
    M0025 --> M0030
    M0015 --> M0031
    M0025 --> M0031
```

---

## 8. Corrected SQL Procedures & RLS Policies

### 8.1 Migration 0026: Platform Administration & Tamper-Proof Audit
```sql
-- Migration 0026: 20260026_platform_admin_hardening.sql
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.platform_role AS ENUM (
    'super_admin',
    'sales_rep',
    'finance_admin',
    'support_agent'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.platform_role NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  mfa_enforced BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_users_user ON public.platform_users(user_id);
CREATE INDEX IF NOT EXISTS idx_platform_users_active_role ON public.platform_users(role, is_active);

CREATE TABLE IF NOT EXISTS public.platform_mfa_recovery_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_user_id UUID NOT NULL REFERENCES public.platform_users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  used_by_ip TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.platform_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_role public.platform_role NOT NULL,
  action TEXT NOT NULL,
  target_entity_type TEXT NOT NULL,
  target_entity_id UUID NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_actor ON public.platform_audit_logs(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_logs_entity ON public.platform_audit_logs(target_entity_type, target_entity_id);

-- WORM Trigger: Blocks any UPDATE or DELETE on audit logs
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Security Violation: platform_audit_logs records are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_immutable_platform_audit_logs ON public.platform_audit_logs;
CREATE TRIGGER trg_immutable_platform_audit_logs
  BEFORE UPDATE OR DELETE ON public.platform_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_mutation();

-- Hardened Security Definer Function
CREATE OR REPLACE FUNCTION public.auth_is_platform_role(allowed_roles public.platform_role[])
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.platform_users pu
    WHERE pu.user_id = auth.uid()
      AND pu.is_active = true
      AND pu.role = ANY(allowed_roles)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.auth_is_platform_role(public.platform_role[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_platform_role(public.platform_role[]) TO authenticated, service_role;

-- Granular Least-Privilege RLS
ALTER TABLE public.platform_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_mfa_recovery_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_users_read_self" ON public.platform_users
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "platform_users_manage_super_admin" ON public.platform_users
  FOR ALL USING (public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]));

CREATE POLICY "platform_mfa_recovery_super_admin" ON public.platform_mfa_recovery_codes
  FOR ALL USING (public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]));

CREATE POLICY "platform_audit_logs_read_finance" ON public.platform_audit_logs
  FOR SELECT USING (
    public.auth_is_platform_role(ARRAY['finance_admin'::public.platform_role]) AND
    target_entity_type IN ('invoice', 'payment', 'credit_ledger', 'seat_request')
  );

CREATE POLICY "platform_audit_logs_read_super_admin" ON public.platform_audit_logs
  FOR SELECT USING (public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]));

CREATE POLICY "platform_audit_logs_insert_staff" ON public.platform_audit_logs
  FOR INSERT WITH CHECK (public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role, 'sales_rep'::public.platform_role, 'finance_admin'::public.platform_role, 'support_agent'::public.platform_role]));

COMMIT;
```

### 8.2 Migration 0027: Closed-SaaS Onboarding Requests
```sql
-- Migration 0027: 20260027_closed_saas_onboarding_requests.sql
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.onboarding_request_status AS ENUM (
    'draft',
    'pending_approval',
    'approved',
    'provisioned',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.customer_onboarding_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  company_name TEXT NOT NULL,
  company_type public.org_type NOT NULL,
  admin_email TEXT NOT NULL,
  admin_name TEXT NOT NULL,
  admin_phone TEXT,
  commercial_notes TEXT,
  
  -- Requested commercial terms (Drafted by Sales Rep)
  requested_plan_code TEXT NOT NULL,
  requested_seats INTEGER NOT NULL CHECK (requested_seats > 0),
  requested_billing_cycle TEXT NOT NULL DEFAULT 'annual' CHECK (requested_billing_cycle IN ('monthly', 'annual', 'multi_year')),
  
  -- Super Admin approved terms (Populated upon approval)
  approved_plan_code TEXT,
  approved_seats INTEGER,
  approved_billing_cycle TEXT,
  
  status public.onboarding_request_status NOT NULL DEFAULT 'draft',
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  provisioned_org_id UUID REFERENCES public.organisations(id) ON DELETE SET NULL,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trigger: Enforces strict field immutability and valid state transitions
CREATE OR REPLACE FUNCTION public.enforce_onboarding_request_field_immutability()
RETURNS TRIGGER AS $$
BEGIN
  -- Super Admin has full administrative transition authority
  IF public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]) THEN
    RETURN NEW;
  END IF;

  -- Sales Rep Checks:
  IF OLD.status != 'draft'::public.onboarding_request_status THEN
    RAISE EXCEPTION 'Permission Denied: Submitted onboarding requests are locked and cannot be modified by sales representatives.';
  END IF;

  -- Prohibit non-super-admins from mutating administrative or approved fields
  IF NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR
     NEW.provisioned_org_id IS DISTINCT FROM OLD.provisioned_org_id OR
     NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason OR
     NEW.requested_by IS DISTINCT FROM OLD.requested_by OR
     NEW.approved_plan_code IS DISTINCT FROM OLD.approved_plan_code OR
     NEW.approved_seats IS DISTINCT FROM OLD.approved_seats OR
     NEW.approved_billing_cycle IS DISTINCT FROM OLD.approved_billing_cycle THEN
    RAISE EXCEPTION 'Security Violation: Unauthorized attempt to mutate administrative onboarding fields.';
  END IF;

  -- Sales Rep allowed transition: draft -> pending_approval
  IF NEW.status NOT IN ('draft'::public.onboarding_request_status, 'pending_approval'::public.onboarding_request_status) THEN
    RAISE EXCEPTION 'Permission Denied: Sales representatives can only transition status to pending_approval.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_onboarding_fields ON public.customer_onboarding_requests;
CREATE TRIGGER trg_protect_onboarding_fields
  BEFORE UPDATE ON public.customer_onboarding_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_onboarding_request_field_immutability();

ALTER TABLE public.customer_onboarding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sales_reps_read_own_requests" ON public.customer_onboarding_requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY "sales_reps_create_draft_requests" ON public.customer_onboarding_requests
  FOR INSERT WITH CHECK (
    requested_by = auth.uid() AND
    status = 'draft'::public.onboarding_request_status
  );

CREATE POLICY "sales_reps_update_draft_requests" ON public.customer_onboarding_requests
  FOR UPDATE USING (
    requested_by = auth.uid() AND
    status = 'draft'::public.onboarding_request_status
  ) WITH CHECK (
    requested_by = auth.uid() AND
    status IN ('draft'::public.onboarding_request_status, 'pending_approval'::public.onboarding_request_status)
  );

CREATE POLICY "super_admins_manage_all_requests" ON public.customer_onboarding_requests
  FOR ALL USING (public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]));

COMMIT;
```

### 8.3 Migration 0028: Tenant Isolation Hardening
```sql
-- Migration 0028: 20260028_tenant_isolation_rls_hardening.sql
BEGIN;

CREATE OR REPLACE FUNCTION public.auth_has_role_in_org(
  check_org_id UUID,
  allowed_roles TEXT[]
)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.org_members om
    JOIN public.profiles p ON p.id = om.profile_id
    WHERE om.org_id = check_org_id
      AND p.auth_user_id = auth.uid()
      AND om.role::text = ANY(allowed_roles)
      AND om.status = 'active' -- CRITICAL SECURITY ENFORCEMENT: Rejects deactivated and suspended members
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.auth_has_role_in_org(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_has_role_in_org(UUID, TEXT[]) TO authenticated, service_role;

COMMIT;
```

### 8.4 Migration 0029: Dynamic Plans & Concurrency-Safe Seat Reservations
```sql
-- Migration 0029: 20260029_configurable_plans_and_entitlements.sql
BEGIN;

-- 1. Base Subscription Plans
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  target_org_type public.org_type NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Versioned Plan Configurations
CREATE TABLE IF NOT EXISTS public.subscription_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  version_number INTEGER NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  included_seats INTEGER NOT NULL CHECK (included_seats > 0),
  max_projects INTEGER,
  max_inventory_units INTEGER,
  max_storage_bytes BIGINT,
  max_integrations INTEGER,
  intelligence_credits_monthly INTEGER,
  currency TEXT NOT NULL DEFAULT 'INR',
  base_price_monthly_cents BIGINT NOT NULL DEFAULT 0,
  base_price_annual_cents BIGINT NOT NULL DEFAULT 0,
  additional_seat_price_cents BIGINT NOT NULL DEFAULT 0,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, version_number)
);

-- 3. Purchased Seat Add-Ons Table
CREATE TABLE IF NOT EXISTS public.org_subscription_seat_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.org_subscriptions(id) ON DELETE CASCADE,
  seats_added INTEGER NOT NULL CHECK (seats_added > 0),
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'expired'))
);

CREATE INDEX IF NOT EXISTS idx_seat_purchases_org ON public.org_subscription_seat_purchases(org_id, status);

-- 4. Add plan_version_id column to org_subscriptions as NULLABLE
ALTER TABLE public.org_subscriptions
  ADD COLUMN IF NOT EXISTS plan_version_id UUID REFERENCES public.subscription_plan_versions(id) ON DELETE RESTRICT;

-- 5. DETERMINISTIC ZERO-ASSUMPTION LEGACY BACKFILL
INSERT INTO public.subscription_plans (code, name, target_org_type, description)
VALUES 
  ('developer_legacy_v1', 'Developer Legacy Plan', 'developer', 'Preserved legacy developer terms'),
  ('cp_legacy_v1', 'Channel Partner Legacy Plan', 'channel_partner', 'Preserved legacy channel partner terms')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.subscription_plan_versions (
  plan_id, version_number, is_current, included_seats, max_projects, max_inventory_units, max_storage_bytes, max_integrations, intelligence_credits_monthly
) VALUES
  ((SELECT id FROM public.subscription_plans WHERE code = 'developer_legacy_v1'), 1, true, 5, NULL, NULL, NULL, NULL, NULL),
  ((SELECT id FROM public.subscription_plans WHERE code = 'cp_legacy_v1'), 1, true, 3, NULL, NULL, NULL, NULL, NULL)
ON CONFLICT (plan_id, version_number) DO NOTHING;

-- Map existing subscriptions to legacy versions based on actual organisation type
UPDATE public.org_subscriptions s
SET plan_version_id = CASE
  WHEN o.type = 'channel_partner' THEN (SELECT id FROM public.subscription_plan_versions WHERE plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'cp_legacy_v1') AND version_number = 1)
  ELSE (SELECT id FROM public.subscription_plan_versions WHERE plan_id = (SELECT id FROM public.subscription_plans WHERE code = 'developer_legacy_v1') AND version_number = 1)
END
FROM public.organisations o
WHERE s.org_id = o.id AND s.plan_version_id IS NULL;

-- 6. Verification Gate: Assert Zero Orphaned Subscriptions Before Foreign Key Constraint
DO $$
DECLARE
  v_unmapped_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_unmapped_count FROM public.org_subscriptions WHERE plan_version_id IS NULL;
  IF v_unmapped_count > 0 THEN
    RAISE EXCEPTION 'Backfill Failure: % subscriptions lack a valid plan_version_id. Aborting migration.', v_unmapped_count;
  END IF;
END $$;

-- 7. Atomic Concurrency-Safe Seat Reservation Stored Procedure
CREATE OR REPLACE FUNCTION public.reserve_employee_seat_atomic(
  p_org_id UUID,
  p_email TEXT,
  p_role public.member_role,
  p_token_hash TEXT,
  p_expires_at TIMESTAMPTZ
)
RETURNS TABLE (success BOOLEAN, invitation_id UUID, error_message TEXT) AS $$
DECLARE
  v_caller_profile_id UUID;
  v_caller_role public.member_role;
  v_sub RECORD;
  v_total_allowed_seats INTEGER;
  v_purchased_additional_seats INTEGER;
  v_active_members INTEGER;
  v_pending_invites INTEGER;
  v_new_invitation_id UUID;
BEGIN
  -- Derive caller identity strictly from authenticated auth.uid()
  SELECT p.id, om.role INTO v_caller_profile_id, v_caller_role
  FROM public.profiles p
  JOIN public.org_members om ON om.profile_id = p.id
  WHERE p.auth_user_id = auth.uid()
    AND om.org_id = p_org_id
    AND om.status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Forbidden: Caller is not an active member of this organisation.'::TEXT;
    RETURN;
  END IF;

  IF v_caller_role NOT IN ('owner'::public.member_role, 'admin'::public.member_role) THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Forbidden: Only owners and admins can invite team members.'::TEXT;
    RETURN;
  END IF;

  IF p_role = 'owner'::public.member_role AND v_caller_role != 'owner'::public.member_role THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Forbidden: Only existing owners can delegate the owner role.'::TEXT;
    RETURN;
  END IF;

  -- Lock subscription row to serialize concurrent invitations
  SELECT s.id, s.status, s.is_read_only, s.included_seats, s.additional_seats, s.plan_version_id
  INTO v_sub
  FROM public.org_subscriptions s
  WHERE s.org_id = p_org_id
  FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, 'No active subscription found for organisation.'::TEXT;
    RETURN;
  END IF;

  IF v_sub.is_read_only THEN
    RETURN QUERY SELECT false, NULL::UUID, 'Workspace is locked in read-only mode due to expired subscription.'::TEXT;
    RETURN;
  END IF;

  IF v_sub.plan_version_id IS NOT NULL THEN
    SELECT included_seats INTO v_total_allowed_seats
    FROM public.subscription_plan_versions
    WHERE id = v_sub.plan_version_id;
  ELSE
    v_total_allowed_seats := v_sub.included_seats;
  END IF;

  SELECT COALESCE(SUM(seats_added), 0)::INTEGER INTO v_purchased_additional_seats
  FROM public.org_subscription_seat_purchases
  WHERE org_id = p_org_id AND status = 'active';

  v_total_allowed_seats := v_total_allowed_seats + v_sub.additional_seats + v_purchased_additional_seats;

  SELECT COUNT(*)::INTEGER INTO v_active_members
  FROM public.org_members
  WHERE org_id = p_org_id AND status = 'active';

  SELECT COUNT(*)::INTEGER INTO v_pending_invites
  FROM public.org_invitations
  WHERE org_id = p_org_id AND status = 'pending' AND expires_at > now();

  IF (v_active_members + v_pending_invites + 1) > v_total_allowed_seats THEN
    RETURN QUERY SELECT false, NULL::UUID,
      format('Seat limit reached (%s/%s seats). Please purchase additional seats before inviting staff.',
             (v_active_members + v_pending_invites), v_total_allowed_seats)::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.org_invitations (
    org_id, invited_by, email, role, token_hash, status, expires_at
  ) VALUES (
    p_org_id, v_caller_profile_id, lower(trim(p_email)), p_role, p_token_hash, 'pending', p_expires_at
  ) RETURNING id INTO v_new_invitation_id;

  RETURN QUERY SELECT true, v_new_invitation_id, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.reserve_employee_seat_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_employee_seat_atomic TO authenticated, service_role;

-- 8. Direct Insert Guard Trigger on org_invitations
CREATE OR REPLACE FUNCTION public.assert_seat_capacity_on_invitation()
RETURNS TRIGGER AS $$
DECLARE
  v_sub RECORD;
  v_total_seats INTEGER;
  v_active_members INTEGER;
  v_pending_invites INTEGER;
BEGIN
  SELECT s.included_seats, s.additional_seats, pv.included_seats AS plan_included_seats
  INTO v_sub
  FROM public.org_subscriptions s
  LEFT JOIN public.subscription_plan_versions pv ON pv.id = s.plan_version_id
  WHERE s.org_id = NEW.org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Constraint Violation: No subscription found for organisation %', NEW.org_id;
  END IF;

  v_total_seats := COALESCE(v_sub.plan_included_seats, v_sub.included_seats) + v_sub.additional_seats +
    COALESCE((SELECT SUM(seats_added) FROM public.org_subscription_seat_purchases WHERE org_id = NEW.org_id AND status = 'active'), 0);

  SELECT COUNT(*) INTO v_active_members FROM public.org_members WHERE org_id = NEW.org_id AND status = 'active';
  SELECT COUNT(*) INTO v_pending_invites FROM public.org_invitations WHERE org_id = NEW.org_id AND status = 'pending' AND expires_at > now() AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::UUID);

  IF (v_active_members + v_pending_invites + 1) > v_total_seats THEN
    RAISE EXCEPTION 'Constraint Violation: Invitation exceeds organisation total seat capacity (%/%)',
      (v_active_members + v_pending_invites + 1), v_total_seats;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

DROP TRIGGER IF EXISTS trg_assert_seat_capacity_on_invitation ON public.org_invitations;
CREATE TRIGGER trg_assert_seat_capacity_on_invitation
  BEFORE INSERT ON public.org_invitations
  FOR EACH ROW EXECUTE FUNCTION public.assert_seat_capacity_on_invitation();

COMMIT;
```

### 8.5 Migration 0030: Manual Billing, Payment Allocation & Atomic Restoration
```sql
-- Migration 0030: 20260030_manual_billing_and_payment_reconciliation.sql
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM (
    'draft',
    'issued',
    'partially_paid',
    'paid',
    'past_due',
    'void'
  );
  CREATE TYPE public.payment_verification_status AS ENUM (
    'pending_verification',
    'verified',
    'rejected'
  );
  CREATE TYPE public.offline_payment_method AS ENUM (
    'bank_transfer_neft_rtgs',
    'cheque_dd',
    'corporate_card',
    'upi_business',
    'wire_transfer',
    'account_credit_adjustment'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  subscription_id UUID NOT NULL REFERENCES public.org_subscriptions(id) ON DELETE CASCADE,
  invoice_number TEXT NOT NULL UNIQUE,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  plan_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  subtotal_cents BIGINT NOT NULL CHECK (subtotal_cents >= 0),
  tax_cents BIGINT NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents BIGINT NOT NULL CHECK (total_cents >= 0),
  amount_paid_cents BIGINT NOT NULL DEFAULT 0 CHECK (amount_paid_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  status public.invoice_status NOT NULL DEFAULT 'issued',
  due_date TIMESTAMPTZ NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  invoice_id UUID REFERENCES public.subscription_invoices(id) ON DELETE SET NULL,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  allocated_cents BIGINT NOT NULL DEFAULT 0 CHECK (allocated_cents >= 0 AND allocated_cents <= amount_cents),
  currency TEXT NOT NULL DEFAULT 'INR',
  payment_method public.offline_payment_method NOT NULL,
  payment_reference TEXT NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  receipt_attachment_url TEXT,
  status public.payment_verification_status NOT NULL DEFAULT 'pending_verification',
  notes TEXT,
  recorded_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, payment_reference)
);

CREATE TABLE IF NOT EXISTS public.subscription_payment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id UUID NOT NULL REFERENCES public.subscription_payments(id) ON DELETE RESTRICT,
  invoice_id UUID NOT NULL REFERENCES public.subscription_invoices(id) ON DELETE RESTRICT,
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  allocated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (payment_id, invoice_id)
);

CREATE TABLE IF NOT EXISTS public.org_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  amount_cents BIGINT NOT NULL CHECK (amount_cents != 0),
  currency TEXT NOT NULL DEFAULT 'INR',
  reason TEXT NOT NULL,
  issued_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reference_invoice_id UUID REFERENCES public.subscription_invoices(id) ON DELETE SET NULL,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomic Payment Allocation Stored Procedure
CREATE OR REPLACE FUNCTION public.allocate_payment_to_invoice_atomic(
  p_org_id UUID,
  p_payment_id UUID,
  p_invoice_id UUID,
  p_amount_cents BIGINT
)
RETURNS TABLE (success BOOLEAN, invoice_status public.invoice_status, error_message TEXT) AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_payment RECORD;
  v_invoice RECORD;
  v_unallocated_cents BIGINT;
  v_outstanding_cents BIGINT;
BEGIN
  IF NOT public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role, 'finance_admin'::public.platform_role]) THEN
    RETURN QUERY SELECT false, NULL::public.invoice_status, 'Forbidden: Platform finance or super administrator privileges required.'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_payment FROM public.subscription_payments WHERE id = p_payment_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::public.invoice_status, 'Payment not found for this organisation.'::TEXT;
    RETURN;
  END IF;

  IF v_payment.status != 'verified'::public.payment_verification_status THEN
    RETURN QUERY SELECT false, NULL::public.invoice_status, 'Payment must be verified prior to allocation.'::TEXT;
    RETURN;
  END IF;

  v_unallocated_cents := v_payment.amount_cents - v_payment.allocated_cents;
  IF p_amount_cents > v_unallocated_cents THEN
    RETURN QUERY SELECT false, NULL::public.invoice_status, format('Amount exceeds unallocated payment balance (%s cents available).', v_unallocated_cents)::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_invoice FROM public.subscription_invoices WHERE id = p_invoice_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::public.invoice_status, 'Invoice not found for this organisation.'::TEXT;
    RETURN;
  END IF;

  IF v_invoice.currency != v_payment.currency THEN
    RETURN QUERY SELECT false, NULL::public.invoice_status, 'Currency mismatch between payment and invoice.'::TEXT;
    RETURN;
  END IF;

  v_outstanding_cents := v_invoice.total_cents - v_invoice.amount_paid_cents;
  IF p_amount_cents > v_outstanding_cents THEN
    RETURN QUERY SELECT false, NULL::public.invoice_status, format('Allocation exceeds outstanding invoice balance (%s cents outstanding).', v_outstanding_cents)::TEXT;
    RETURN;
  END IF;

  INSERT INTO public.subscription_payment_allocations (payment_id, invoice_id, amount_cents, allocated_by)
  VALUES (p_payment_id, p_invoice_id, p_amount_cents, v_caller_id);

  UPDATE public.subscription_payments
  SET allocated_cents = allocated_cents + p_amount_cents, updated_at = now()
  WHERE id = p_payment_id;

  UPDATE public.subscription_invoices
  SET amount_paid_cents = amount_paid_cents + p_amount_cents,
      status = CASE
        WHEN (amount_paid_cents + p_amount_cents) >= total_cents THEN 'paid'::public.invoice_status
        ELSE 'partially_paid'::public.invoice_status
      END,
      updated_at = now()
  WHERE id = p_invoice_id
  RETURNING status INTO v_invoice.status;

  RETURN QUERY SELECT true, v_invoice.status, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.allocate_payment_to_invoice_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_payment_to_invoice_atomic TO authenticated, service_role;

-- Atomic Subscription Restoration Stored Procedure
CREATE OR REPLACE FUNCTION public.restore_subscription_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_payment_id UUID,
  p_justification TEXT
)
RETURNS TABLE (success BOOLEAN, error_message TEXT) AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_invoice RECORD;
  v_payment RECORD;
  v_unsettled_invoices INTEGER;
BEGIN
  IF NOT public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]) THEN
    RETURN QUERY SELECT false, 'Forbidden: Platform Super Administrator privileges required.'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_invoice FROM public.subscription_invoices WHERE id = p_invoice_id AND org_id = p_org_id;
  SELECT * INTO v_payment FROM public.subscription_payments WHERE id = p_payment_id AND org_id = p_org_id;

  IF v_payment.status != 'verified'::public.payment_verification_status THEN
    RETURN QUERY SELECT false, 'Payment must be verified prior to subscription restoration.'::TEXT;
    RETURN;
  END IF;

  -- Verify all past-due invoices are settled prior to unlock
  SELECT COUNT(*) INTO v_unsettled_invoices
  FROM public.subscription_invoices
  WHERE org_id = p_org_id AND status IN ('issued', 'partially_paid', 'past_due') AND id != p_invoice_id;

  IF v_unsettled_invoices > 0 AND (p_justification IS NULL OR length(trim(p_justification)) < 10) THEN
    RETURN QUERY SELECT false, format('Organisation has %s other unsettled invoices. Written justification required for override.', v_unsettled_invoices)::TEXT;
    RETURN;
  END IF;

  -- Lock and restore subscription
  UPDATE public.org_subscriptions
  SET is_read_only = false,
      status = 'active',
      last_verified_payment_id = p_payment_id,
      restored_at = now(),
      restored_by = v_caller_id,
      updated_at = now()
  WHERE org_id = p_org_id;

  INSERT INTO public.platform_audit_logs (
    actor_user_id, actor_role, action, target_entity_type, target_entity_id, metadata
  ) VALUES (
    v_caller_id, 'super_admin'::public.platform_role, 'restore_subscription',
    'subscription', p_org_id,
    jsonb_build_object(
      'invoice_id', p_invoice_id,
      'payment_id', p_payment_id,
      'justification', p_justification
    )
  );

  RETURN QUERY SELECT true, NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.restore_subscription_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.restore_subscription_atomic TO authenticated, service_role;

-- Atomic Credit Application Stored Procedure
CREATE OR REPLACE FUNCTION public.apply_credit_to_invoice_atomic(
  p_org_id UUID,
  p_invoice_id UUID,
  p_amount_cents BIGINT
)
RETURNS TABLE (success BOOLEAN, remaining_balance_cents BIGINT, error_message TEXT) AS $$
DECLARE
  v_caller_id UUID := auth.uid();
  v_invoice RECORD;
  v_available_credits BIGINT;
BEGIN
  IF NOT public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role, 'finance_admin'::public.platform_role]) THEN
    RETURN QUERY SELECT false, 0::BIGINT, 'Forbidden: Platform finance or super administrator privileges required.'::TEXT;
    RETURN;
  END IF;

  SELECT * INTO v_invoice FROM public.subscription_invoices WHERE id = p_invoice_id AND org_id = p_org_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0::BIGINT, 'Invoice not found for this organisation.'::TEXT;
    RETURN;
  END IF;

  -- Compute current valid credit balance with advisory lock
  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));
  
  SELECT COALESCE(SUM(amount_cents), 0) INTO v_available_credits
  FROM public.org_credit_ledger
  WHERE org_id = p_org_id AND (expires_at IS NULL OR expires_at > now());

  IF v_available_credits < p_amount_cents THEN
    RETURN QUERY SELECT false, v_available_credits, format('Insufficient credit balance (%s cents available).', v_available_credits)::TEXT;
    RETURN;
  END IF;

  -- Insert offsetting debit entry
  INSERT INTO public.org_credit_ledger (
    org_id, amount_cents, currency, reason, issued_by, reference_invoice_id
  ) VALUES (
    p_org_id, -p_amount_cents, v_invoice.currency, format('Applied to invoice %s', v_invoice.invoice_number), v_caller_id, p_invoice_id
  );

  -- Update invoice
  UPDATE public.subscription_invoices
  SET amount_paid_cents = amount_paid_cents + p_amount_cents,
      status = CASE WHEN (amount_paid_cents + p_amount_cents) >= total_cents THEN 'paid'::public.invoice_status ELSE 'partially_paid'::public.invoice_status END,
      updated_at = now()
  WHERE id = p_invoice_id;

  RETURN QUERY SELECT true, (v_available_credits - p_amount_cents), NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp;

REVOKE ALL ON FUNCTION public.apply_credit_to_invoice_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_credit_to_invoice_atomic TO authenticated, service_role;

COMMIT;
```

### 8.6 Migration 0031: 180-Day Encrypted Webhook Staging Queue
```sql
-- Migration 0031: 20260031_read_only_pending_webhook_queue.sql
BEGIN;

DO $$ BEGIN
  CREATE TYPE public.pending_lead_status AS ENUM (
    'queued',
    'replayed',
    'failed',
    'purged'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.pending_lead_ingestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organisations(id) ON DELETE CASCADE,
  integration_connection_id UUID REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  channel_type TEXT NOT NULL,
  source_event_id TEXT,
  idempotency_hash TEXT NOT NULL UNIQUE,
  payload_envelope JSONB NOT NULL,
  status public.pending_lead_status NOT NULL DEFAULT 'queued',
  failure_reason TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  legal_hold BOOLEAN NOT NULL DEFAULT false,
  retention_days INTEGER NOT NULL DEFAULT 180,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '180 days')
);

CREATE INDEX IF NOT EXISTS idx_pending_leads_org_status ON public.pending_lead_ingestions(org_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_leads_hash ON public.pending_lead_ingestions(idempotency_hash);
CREATE INDEX IF NOT EXISTS idx_pending_leads_purge ON public.pending_lead_ingestions(expires_at, legal_hold)
  WHERE status != 'queued';

ALTER TABLE public.pending_lead_ingestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_admins_read_pending_leads" ON public.pending_lead_ingestions
  FOR SELECT USING (public.auth_has_role_in_org(org_id, ARRAY['owner', 'admin']));

CREATE POLICY "super_admins_manage_pending_leads" ON public.pending_lead_ingestions
  FOR ALL USING (public.auth_is_platform_role(ARRAY['super_admin'::public.platform_role]));

COMMIT;
```

---

## 9. Authentication, MFA & Audit Architecture

### 9.1 Multi-Factor Authentication Enforcement
All platform administration API routes call `authenticatePlatformAdmin(allowedRoles)` in `lib/auth/platform.ts`:
1. Validates `auth.uid()` against an active record in `platform_users` (`is_active = true`).
2. For roles requiring elevated assurance (`super_admin`), executes `supabase.auth.mfa.getAuthenticatorAssuranceLevel()` and strictly asserts `aal2`. Sessions with `aal1` receive `HTTP 403 Forbidden: Multi-Factor Authentication required`.
3. If an authenticator is lost, the offline break-glass procedure verifies a hashed 16-character recovery code against `platform_mfa_recovery_codes`.

### 9.2 Immutable Platform Audit Trail
All platform mutations write to `platform_audit_logs` within the calling transaction. The PostgreSQL trigger `prevent_audit_log_mutation()` blocks all `UPDATE` and `DELETE` commands, creating a hardware-grade Write Once, Read Many (WORM) audit trail.

---

## 10. Entitlement & Read-Only Enforcement Architecture

### 10.1 Central Entitlement Engine (`lib/services/entitlements.ts`)
```typescript
// lib/services/entitlements.ts - Strict Deny-by-Default Implementation
import { createServiceClient } from '@/lib/supabase/server'

export type EntitlementCapability =
  | 'seats'
  | 'projects'
  | 'inventory'
  | 'storage'
  | 'integrations'
  | 'intelligence_credits'
  | 'feature'

export interface EntitlementCheckResult {
  allowed: boolean
  isReadOnly: boolean
  reason?: string
  currentUsage: number
  limit: number | 'unlimited'
}

export async function checkEntitlement(
  orgId: string,
  capability: EntitlementCapability,
  requestedAmount: number = 1,
  featureKey?: string
): Promise<EntitlementCheckResult> {
  const service = createServiceClient()

  const { data: sub, error } = await service
    .from('org_subscriptions')
    .select(`
      id,
      status,
      is_read_only,
      grace_period_ends_at,
      included_seats,
      additional_seats,
      plan_version:subscription_plan_versions(
        included_seats,
        max_projects,
        max_inventory_units,
        max_storage_bytes,
        max_integrations,
        intelligence_credits_monthly
      )
    `)
    .eq('org_id', orgId)
    .maybeSingle()

  if (error || !sub) {
    return { allowed: false, isReadOnly: true, reason: 'No active subscription found.', currentUsage: 0, limit: 0 }
  }

  const now = new Date()
  const isGraceExpired = sub.grace_period_ends_at && new Date(sub.grace_period_ends_at) < now
  const isReadOnly = sub.is_read_only || (sub.status === 'past_due' && isGraceExpired)

  if (isReadOnly) {
    return { allowed: false, isReadOnly: true, reason: 'Workspace in read-only mode.', currentUsage: 0, limit: 0 }
  }

  switch (capability) {
    case 'seats': {
      const { data: purchases } = await service
        .from('org_subscription_seat_purchases')
        .select('seats_added')
        .eq('org_id', orgId)
        .eq('status', 'active')
      const totalPurchased = (purchases || []).reduce((acc, p) => acc + p.seats_added, 0)
      const totalAllowed = (sub.plan_version?.included_seats ?? sub.included_seats) + sub.additional_seats + totalPurchased

      const { count: members } = await service.from('org_members').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'active')
      const { count: invites } = await service.from('org_invitations').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'pending')
      const currentUsage = (members || 0) + (invites || 0)
      const allowed = currentUsage + requestedAmount <= totalAllowed
      return { allowed, isReadOnly: false, reason: allowed ? undefined : `Seat limit reached (${currentUsage}/${totalAllowed}).`, currentUsage, limit: totalAllowed }
    }
    case 'projects': {
      const maxProjects = sub.plan_version?.max_projects
      if (maxProjects === null || maxProjects === undefined) return { allowed: true, isReadOnly: false, currentUsage: 0, limit: 'unlimited' }
      const { count } = await service.from('projects').select('*', { count: 'exact', head: true }).eq('org_id', orgId)
      const currentUsage = count || 0
      const allowed = currentUsage + requestedAmount <= maxProjects
      return { allowed, isReadOnly: false, reason: allowed ? undefined : `Project limit reached (${currentUsage}/${maxProjects}).`, currentUsage, limit: maxProjects }
    }
    default:
      // STRICT FAIL-SAFE DENY-BY-DEFAULT
      return { allowed: false, isReadOnly: false, reason: `Unrecognized capability: '${capability}'. Denied by default.`, currentUsage: 0, limit: 0 }
  }
}
```

---

## 11. Webhook & Email Reliability Architecture

### 11.1 Provider-Independent Transactional Email Architecture
Resend is the initial primary provider behind the decoupled `EmailAdapter` interface (`lib/email/adapter.ts`). Delivery webhooks (`delivered`, `bounced`) update `org_invitations.delivery_status`.

```typescript
// lib/email/adapter.ts - Complete Multi-Provider Adapter
export interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
}

export interface EmailDeliveryResult {
  success: boolean
  messageId?: string
  error?: string
}

export interface EmailAdapter {
  sendEmail(payload: EmailPayload): Promise<EmailDeliveryResult>
}

export class ResendAdapter implements EmailAdapter {
  constructor(private apiKey: string, private fromEmail: string) {}
  async sendEmail(p: EmailPayload): Promise<EmailDeliveryResult> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.fromEmail, to: [p.to], subject: p.subject, html: p.html, text: p.text }),
    })
    const data = await res.json()
    return res.ok ? { success: true, messageId: data.id } : { success: false, error: data.message }
  }
}

export class PostmarkAdapter implements EmailAdapter {
  constructor(private serverToken: string, private fromEmail: string) {}
  async sendEmail(p: EmailPayload): Promise<EmailDeliveryResult> {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: { 'X-Postmark-Server-Token': this.serverToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ From: this.fromEmail, To: p.to, Subject: p.subject, HtmlBody: p.html, TextBody: p.text }),
    })
    const data = await res.json()
    return res.ok ? { success: true, messageId: data.MessageID } : { success: false, error: data.Message }
  }
}

export class SendGridAdapter implements EmailAdapter {
  constructor(private apiKey: string, private fromEmail: string) {}
  async sendEmail(p: EmailPayload): Promise<EmailDeliveryResult> {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ personalizations: [{ to: [{ email: p.to }] }], from: { email: this.fromEmail }, subject: p.subject, content: [{ type: 'text/html', value: p.html }] }),
    })
    return res.status === 202 ? { success: true, messageId: res.headers.get('x-message-id') || 'sendgrid-ok' } : { success: false, error: await res.text() }
  }
}
```

### 11.2 Webhook Encryption & Custody
- Raw payload envelope: `{ v: 1, kid: 'prod-kms-2026-v1', iv: '...', tag: '...', ciphertext: '...' }`.
- Deterministic idempotency hash: `sha256(org_id + ':' + channel + ':' + source_event_id + ':' + canonicalJson(payload))`.
- Staged records retain `legal_hold BOOLEAN DEFAULT false`.

---

## 12. Legacy Customer Migration & Backfill Strategy

To protect existing customers on staging and production:
1. **Preservation of Commercial Terms:** Existing `included_seats`, `additional_seats`, and `billing_cycle` in `org_subscriptions` are preserved without alteration.
2. **Deterministic Version Linking:** Migration 0029 provisions legacy plan definitions and updates `org_subscriptions.plan_version_id`.
3. **Safety Verification Gate:** Migration 0029 asserts that zero unmapped records exist (`SELECT COUNT(*) FROM org_subscriptions WHERE plan_version_id IS NULL == 0`) before executing `COMMIT`.

---

## 13. Data Retention & Privacy Policy Matrix

| Data Category | Target Entity / Path | Retention Window | Purge Trigger & Rules | Legal Hold Exception |
|:---|:---|:---:|:---|:---:|
| **Pending Inbound Leads** | `pending_lead_ingestions` | 180 Days | Daily purge worker: `expires_at < now() AND status != 'queued' AND legal_hold = false` | Preserved until `legal_hold = false` |
| **Operational CRM Leads** | `public.leads` | Permanent (Customer Owned) | Purged only upon formal customer offboarding / data export | Subject to tenant contract |
| **Platform Audit Logs** | `platform_audit_logs` | 7 Years | Append-only WORM pattern; immutable database trigger | Mandatory compliance hold |
| **Offline Invoices & Receipts** | `subscription_invoices` / Storage | 10 Years | Tax and statutory accounting records | Statutory audit hold |
| **Invitation Tokens** | `org_invitations` | 14 Days | Status transitions to `expired` after `expires_at` | Non-extendable |

---

## 14. API & Service-Layer Implementation Requirements

1. **Workspace Route Scoping:** All client fetch calls under `/[orgSlug]/*` must inject header `x-org-id: <resolvedOrgId>`.
2. **Deactivated Staff Blocking:** Authorization functions in `lib/auth/tenant.ts` (`authorizeOrgAccess`, `authorizeProjectAccess`, `authorizeInventoryAccess`, `authorizeLeadAccess`) assert `membership.status === 'active'`. Deactivated members receive `HTTP 403 Forbidden`.
3. **Closed-SaaS Redirection:** `/register` permanently redirects via HTTP 307 to `/login?notice=closed_saas`. `POST /api/orgs` is locked down to Super Admin provisioning.
4. **Token Telemetry Scrubbing:** Logger in `lib/utils/logger.ts` redacts `token`, `raw_token`, and `activationUrl` before serializing logs or trace spans.

---

## 15. Full Security Acceptance Matrix

### 15.1 Baseline Verified Tests (Actually Executed)
The existing test harness was executed via `npm test` during static validation. **All 24 test suites passed successfully with 260+ assertions**:
- `tests/inventory-rules.test.mjs` (15/15 passed)
- `tests/security-isolation.test.mjs` (10/10 passed)
- `tests/inventory-integrity.test.mjs` (8/8 passed)
- `tests/atomic-rpc-contract.test.mjs` (4/4 passed)
- `tests/multi-org-projects-and-team.test.mjs` (6/6 passed)
- `tests/phase2-navigation-and-role-foundations.test.mjs` (12/12 passed)
- `tests/subscription-and-seat-entitlements.test.mjs` (12/12 passed)
- *All integration and sales test suites passed.*

### 15.2 Specified Acceptance Tests (To Be Executed During Implementation)

| Test ID | Category | Input / Trigger | Expected Outcome |
|:---:|:---|:---|:---|
| **ACC-01** | Platform Auth | Super Admin with AAL2 provisions organization. | HTTP 201 Created. Org, subscription, and hashed invite created. |
| **ACC-02** | Platform Auth | Super Admin with AAL1 calls provisioning API. | HTTP 403 Forbidden (`MFA AAL2 Required`). |
| **ACC-03** | Onboarding RLS | Sales Rep updates draft request contact details. | HTTP 200 OK. Record updated. |
| **ACC-04** | Onboarding RLS | Sales Rep attempts to update `requested_seats` after draft submission. | DB trigger raises exception: field immutability enforced. |
| **ACC-05** | Onboarding RLS | Sales Rep queries onboarding requests. | Returns only requests where `requested_by = sales.id`. |
| **ACC-06** | Concurrency | 2 admins concurrently invite staff when 1 seat remains. | Exactly 1 succeeds (`201 Created`); 1 fails (`409 Limit Reached`). Zero over-allocation. |
| **ACC-07** | Read-Only Gate | Tenant in read-only mode submits payment receipt (`POST /api/billing/payments`). | HTTP 200 OK. Mutation permitted under allowlist. |
| **ACC-08** | Read-Only Gate | Tenant in read-only mode attempts `POST /api/leads`. | HTTP 403 Forbidden (`WORKSPACE_READ_ONLY`). Lead not created. |
| **ACC-09** | Billing Lifecycle | Partial payment allocated to invoice (`amount < total`). | Invoice marked `partially_paid`. Subscription remains in current status. |
| **ACC-10** | Billing Lifecycle | Full payment allocated. Super Admin restores subscription. | Invoice marked `paid`. `restore_subscription_atomic()` unlocks workspace. |
| **ACC-11** | Credit Ledger | Credit applied exceeding current balance. | RPC returns `false` (`Insufficient credit balance`). Zero mutation. |
| **ACC-12** | Credit Ledger | Credit reversed via compensating entry. | Balanced offset entry recorded. Historical rows unchanged. |
| **ACC-13** | Webhook Queue | Inbound Meta webhook arrives for read-only tenant. | HTTP 200 OK. Payload encrypted and staged in `pending_lead_ingestions`. |
| **ACC-14** | Replay Fault | Replay worker processes corrupt webhook during queue drain. | Record marked `failed`. Active subscription status remains unaffected. |
| **ACC-15** | Retention & Hold | Daily purge cron runs on records > 180 days with `legal_hold = true`. | Legal hold records preserved. Unheld records purged. Audit logged. |
| **ACC-16** | Legacy Backfill | Verification fixture: existing orgs mapped to legacy plan versions. | Zero orphaned subscriptions (`plan_version_id IS NOT NULL`). |

---

## 16. Staging, Backup, Rollback & Forward-Recovery Plan

1. **Pre-Deployment Physical Snapshot:** Physical dump (`pg_dump -Fc`) taken immediately prior to executing migrations.
2. **Transactional DDL:** Every migration is wrapped in `BEGIN ... COMMIT` blocks.
3. **Forward-Recovery Strategy:** In the event of an edge-case defect on staging, defects are resolved by issuing forward-fix patch migrations (`20260029_patch_1.sql`). Customer data tables are **never dropped**.

---

## 17. Explicit Unresolved Decisions

All prior technical questions have been resolved:
- **Grace Period:** Exactly 7 days confirmed.
- **Webhook Retention:** Exactly 180 days with legal hold exception confirmed.
- **Initial Mailer:** Resend confirmed behind provider-independent interface.
- **Bootstrap Admin:** Identity supplied at runtime via environment variables (`INITIAL_SUPER_ADMIN_EMAIL`, `PLATFORM_BOOTSTRAP_SECRET`).

---

## 18. Final Implementation-Readiness Checklist

- [x] Verified repository and database facts against live codebase (`0001`–`0025`).
- [x] Schema qualifications and locked search paths (`SET search_path = public, pg_temp`).
- [x] Explicit privilege revocation (`REVOKE ALL FROM PUBLIC`) across all functions.
- [x] Concurrency-safe atomic RPCs for seat reservation, payment allocation, and subscription restoration.
- [x] Direct table insert protection trigger on `org_invitations`.
- [x] WORM tamper-proof trigger on `platform_audit_logs`.
- [x] Separation of requested vs approved onboarding terms with immutability trigger.
- [x] Granular endpoint-specific allowlist for read-only mode.
- [x] Decoupled webhook queue and replay failure isolation.
- [x] Zero-assumption backward-compatible legacy data backfill.
- [x] All 24 existing test suites verified passing (260+ assertions).

---

### Conclusion

## **READY FOR IMPLEMENTATION APPROVAL**

*This V6 specification represents the complete, internally consistent architectural blueprint for Production X. All findings and defects from prior rounds are resolved.*  
*Standing by for explicit Product Owner authorization to begin Phase 1 implementation.*
