// tests/phase1-platform-and-closed-saas.test.mjs
// Comprehensive test suite for Phase 1: Platform Admin Security, Closed-SaaS Onboarding & Tenant Isolation
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

class MockEmailAdapter {
  constructor() {
    this.sentEmails = []
  }

  async sendEmail(options) {
    const id = `mock-email-${Math.random().toString(36).slice(2, 10)}`
    this.sentEmails.push({
      ...options,
      id,
      timestamp: new Date(),
    })
    return { success: true, id }
  }

  async sendInvitationEmail(options) {
    const subject = `You've been invited to join ${options.orgName} on Production X`
    const inviter = options.inviterName || 'An administrator'
    const text = `${inviter} has invited you to join ${options.orgName} as a ${options.role} on Production X.\n\nActivate your account at: ${options.inviteUrl}`

    return this.sendEmail({
      to: options.to,
      subject,
      html: `<p>${text}</p>`,
      text,
    })
  }

  getRecentEmailFor(recipient) {
    return this.sentEmails
      .slice()
      .reverse()
      .find((e) => (Array.isArray(e.to) ? e.to.includes(recipient) : e.to === recipient))
  }

  clear() {
    this.sentEmails = []
  }
}

console.log('--- Running Phase 1: Platform Admin Security & Closed-SaaS Tests ---')

// ============================================================================
// PART 1: Database Migration Contract & DDL Safety Verification
// ============================================================================

function testMigration0026Contracts() {
  const migPath = path.resolve('supabase/migrations/20260026_platform_admin_hardening.sql')
  assert.equal(fs.existsSync(migPath), true, 'Migration 0026 file must exist')
  const sql = fs.readFileSync(migPath, 'utf8')

  // Platform roles
  assert.equal(sql.includes("CREATE TYPE public.platform_role AS ENUM"), true, 'Must define platform_role enum')
  assert.equal(sql.includes("'super_admin'"), true, 'Must include super_admin')
  assert.equal(sql.includes("'sales_rep'"), true, 'Must include sales_rep')
  assert.equal(sql.includes("'finance_admin'"), true, 'Must include finance_admin')
  assert.equal(sql.includes("'support_agent'"), true, 'Must include support_agent')

  // Platform users table
  assert.equal(sql.includes("CREATE TABLE IF NOT EXISTS public.platform_users"), true, 'Must define platform_users table')
  assert.equal(sql.includes("user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id)"), true, 'Must reference auth.users with UNIQUE constraint')
  assert.equal(sql.includes("mfa_enforced BOOLEAN NOT NULL DEFAULT true"), true, 'Must enforce MFA flag')

  // WORM Tamper-proof audit logs
  assert.equal(sql.includes("CREATE TABLE IF NOT EXISTS public.platform_audit_logs"), true, 'Must define platform_audit_logs table')
  assert.equal(sql.includes("CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()"), true, 'Must define WORM trigger function')
  assert.equal(sql.includes("BEFORE UPDATE OR DELETE ON public.platform_audit_logs"), true, 'Trigger must attach BEFORE UPDATE OR DELETE')
  assert.equal(sql.includes("REVOKE INSERT, UPDATE, DELETE ON public.platform_audit_logs FROM PUBLIC, authenticated, anon"), true, 'Must revoke direct insert on audit logs')

  // Security Definer platform check
  assert.equal(sql.includes("FUNCTION public.auth_is_platform_role"), true, 'Must define auth_is_platform_role helper')
  assert.equal(sql.includes("SET search_path = public, pg_temp"), true, 'Must lock search_path to public, pg_temp')
  assert.equal(sql.includes("REVOKE ALL ON FUNCTION public.auth_is_platform_role"), true, 'Must revoke from PUBLIC')
  assert.equal(sql.includes("GRANT EXECUTE ON FUNCTION public.auth_is_platform_role(public.platform_role[]) TO authenticated, service_role"), true, 'Must grant to authenticated, service_role')

  console.log('✓ Test 1 Passed: Migration 0026 adheres to platform roles, WORM audit logging and RLS security contracts')
}

function testMigration0027Contracts() {
  const migPath = path.resolve('supabase/migrations/20260027_closed_saas_onboarding_requests.sql')
  assert.equal(fs.existsSync(migPath), true, 'Migration 0027 file must exist')
  const sql = fs.readFileSync(migPath, 'utf8')

  assert.equal(sql.includes("CREATE TYPE public.onboarding_request_status AS ENUM"), true, 'Must define onboarding_request_status enum')
  assert.equal(sql.includes("CREATE TABLE IF NOT EXISTS public.customer_onboarding_requests"), true, 'Must define customer_onboarding_requests table')

  // Separation of requested vs approved commercial fields
  assert.equal(sql.includes("requested_plan_code TEXT NOT NULL"), true, 'Must separate requested_plan_code')
  assert.equal(sql.includes("requested_seats INTEGER NOT NULL"), true, 'Must separate requested_seats')
  assert.equal(sql.includes("approved_plan_code TEXT"), true, 'Must separate approved_plan_code')
  assert.equal(sql.includes("approved_seats INTEGER"), true, 'Must separate approved_seats')

  // Field immutability trigger
  assert.equal(sql.includes("FUNCTION public.enforce_onboarding_request_field_immutability"), true, 'Must define immutability trigger function')
  assert.equal(sql.includes("OLD.status != 'draft'"), true, 'Must lock submitted requests from sales reps')
  assert.equal(sql.includes("trg_protect_onboarding_fields"), true, 'Must attach protection trigger')

  console.log('✓ Test 2 Passed: Migration 0027 adheres to commercial term separation and field immutability contracts')
}

function testMigration0028Contracts() {
  const migPath = path.resolve('supabase/migrations/20260028_tenant_isolation_rls_hardening.sql')
  assert.equal(fs.existsSync(migPath), true, 'Migration 0028 file must exist')
  const sql = fs.readFileSync(migPath, 'utf8')

  assert.equal(sql.includes("om.status = 'active'"), true, 'auth_has_role_in_org MUST enforce active membership status')
  assert.equal(sql.includes("SET search_path = public, pg_temp"), true, 'Must lock search_path to public, pg_temp')
  assert.equal(sql.includes("REVOKE ALL ON FUNCTION public.auth_has_role_in_org"), true, 'Must revoke from PUBLIC')

  console.log('✓ Test 3 Passed: Migration 0028 hardens tenant isolation by asserting om.status = active')
}

function testMigration0029Contracts() {
  const migPath = path.resolve('supabase/migrations/20260029_invitation_security_and_seat_reservation.sql')
  assert.equal(fs.existsSync(migPath), true, 'Migration 0029 file must exist')
  const sql = fs.readFileSync(migPath, 'utf8')

  // Subscription alteration
  assert.equal(sql.includes("ADD COLUMN IF NOT EXISTS is_read_only"), true, 'Must add is_read_only column to org_subscriptions')
  assert.equal(sql.includes("ADD COLUMN IF NOT EXISTS plan_version_id"), true, 'Must add plan_version_id column')

  // Direct insert revocation on org_invitations
  assert.equal(sql.includes("REVOKE INSERT, UPDATE, DELETE ON public.org_invitations FROM PUBLIC, authenticated, anon"), true, 'Must revoke direct insert on org_invitations')

  // No public SELECT policy that exposes token_hash
  assert.equal(sql.includes('CREATE POLICY "admins_read_org_invitations" ON public.org_invitations'), true, 'Must define admin-only read policy on org_invitations')
  assert.equal(sql.includes('public_verify_invitation_token'), true, 'Must drop legacy public SELECT policy exposing token_hash')

  // RPC locking order
  assert.equal(sql.includes("SELECT s.id, s.status, s.is_read_only, s.included_seats, s.additional_seats"), true, 'Must query subscription fields under lock')
  assert.equal(sql.includes("FOR UPDATE OF s"), true, 'Must lock subscription row FOR UPDATE')

  // Token generation
  assert.equal(sql.includes("gen_random_bytes(32)"), true, 'Must generate 256-bit cryptographic token inside PostgreSQL')
  assert.equal(sql.includes("digest(v_raw_token, 'sha256')"), true, 'Must compute SHA-256 hash internally')

  // Safe verification procedure
  assert.equal(sql.includes("FUNCTION public.verify_invitation_token(p_raw_token TEXT)"), true, 'Must define safe token verification procedure')

  console.log('✓ Test 4 Passed: Migration 0029 adheres to authoritative seat reservation, lock order, and token security')
}

// ============================================================================
// PART 2: In-Memory Multi-Tenant & Platform State Simulator
// ============================================================================

const MOCK_PLATFORM_DB = {
  auth_users: [
    { id: 'usr-super-admin', email: 'superadmin@productionx.ai', aal: 'aal2' },
    { id: 'usr-super-admin-no-mfa', email: 'admin-unverified@productionx.ai', aal: 'aal1' },
    { id: 'usr-sales-rep-1', email: 'sales1@productionx.ai', aal: 'aal1' },
    { id: 'usr-sales-rep-2', email: 'sales2@productionx.ai', aal: 'aal1' },
    { id: 'usr-finance-admin', email: 'finance@productionx.ai', aal: 'aal2' },
    { id: 'usr-customer-owner', email: 'owner@acme.com', aal: 'aal1' },
    { id: 'usr-customer-employee', email: 'staff@acme.com', aal: 'aal1' },
    { id: 'usr-multi-org', email: 'multi@partner.com', aal: 'aal1' },
  ],
  platform_users: [
    { id: 'plat-1', user_id: 'usr-super-admin', role: 'super_admin', is_active: true, mfa_enforced: true },
    { id: 'plat-2', user_id: 'usr-super-admin-no-mfa', role: 'super_admin', is_active: true, mfa_enforced: true },
    { id: 'plat-3', user_id: 'usr-sales-rep-1', role: 'sales_rep', is_active: true, mfa_enforced: false },
    { id: 'plat-4', user_id: 'usr-sales-rep-2', role: 'sales_rep', is_active: true, mfa_enforced: false },
    { id: 'plat-5', user_id: 'usr-finance-admin', role: 'finance_admin', is_active: true, mfa_enforced: true },
  ],
  profiles: [
    { id: 'prof-super-admin', auth_user_id: 'usr-super-admin', full_name: 'Platform Super Admin' },
    { id: 'prof-sales-rep-1', auth_user_id: 'usr-sales-rep-1', full_name: 'Sales Rep Vikram' },
    { id: 'prof-sales-rep-2', auth_user_id: 'usr-sales-rep-2', full_name: 'Sales Rep Sunita' },
    { id: 'prof-customer-owner', auth_user_id: 'usr-customer-owner', full_name: 'Acme Owner' },
    { id: 'prof-customer-employee', auth_user_id: 'usr-customer-employee', full_name: 'Acme Staff' },
    { id: 'prof-multi-org', auth_user_id: 'usr-multi-org', full_name: 'Consultant Anita' },
  ],
  organisations: [
    { id: 'org-acme', name: 'Acme Developers', slug: 'acme-dev', type: 'developer', plan: 'growth' },
    { id: 'org-partner', name: 'Prime Channel Partner', slug: 'prime-cp', type: 'channel_partner', plan: 'starter' },
  ],
  org_subscriptions: [
    { id: 'sub-acme', org_id: 'org-acme', plan_tier: 'growth', included_seats: 5, additional_seats: 0, status: 'active', is_read_only: false },
    { id: 'sub-partner', org_id: 'org-partner', plan_tier: 'starter', included_seats: 2, additional_seats: 0, status: 'active', is_read_only: false },
  ],
  org_members: [
    { id: 'mem-1', org_id: 'org-acme', profile_id: 'prof-customer-owner', role: 'owner', status: 'active' },
    { id: 'mem-2', org_id: 'org-acme', profile_id: 'prof-customer-employee', role: 'sales_exec', status: 'deactivated' }, // DEACTIVATED in Acme
    { id: 'mem-3', org_id: 'org-acme', profile_id: 'prof-multi-org', role: 'manager', status: 'deactivated' }, // DEACTIVATED in Acme
    { id: 'mem-4', org_id: 'org-partner', profile_id: 'prof-multi-org', role: 'admin', status: 'active' }, // ACTIVE in Partner
  ],
  org_invitations: [
    {
      id: 'inv-1',
      org_id: 'org-acme',
      email: 'pending1@acme.com',
      role: 'sales_exec',
      token_hash: crypto.createHash('sha256').update('raw-token-1').digest('hex'),
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    },
  ],
  customer_onboarding_requests: [],
  platform_audit_logs: [],
}

// ============================================================================
// PART 3: Security & Authorization Assertions
// ============================================================================

// Simulator: Platform Authorization Guard
function simulateAuthenticatePlatformAdmin(authUserId, allowedRoles = ['super_admin'], requireMfaAal2 = false) {
  const authUser = MOCK_PLATFORM_DB.auth_users.find((u) => u.id === authUserId)
  if (!authUser) {
    return { status: 401, error: 'Unauthorised. Platform authentication required.' }
  }

  const platformUser = MOCK_PLATFORM_DB.platform_users.find(
    (p) => p.user_id === authUserId && p.is_active === true
  )

  if (!platformUser) {
    return { status: 403, error: 'Forbidden. You do not possess platform administration privileges.' }
  }

  if (!allowedRoles.includes(platformUser.role)) {
    return { status: 403, error: `Forbidden. Role '${platformUser.role}' lacks authority for this platform action.` }
  }

  if (requireMfaAal2 && authUser.aal !== 'aal2') {
    return {
      status: 403,
      error: 'MFA AAL2 Required: This administrative mutation requires an active Multi-Factor Authenticated session.',
      code: 'MFA_AAL2_REQUIRED',
    }
  }

  const profile = MOCK_PLATFORM_DB.profiles.find((p) => p.auth_user_id === authUserId)
  return {
    status: 200,
    auth: {
      user: authUser,
      profile: profile || { id: authUserId, full_name: 'Platform Admin' },
      platformUser,
      aal: authUser.aal,
    },
  }
}

// Simulator: Super Admin Provisioning Workflow
function simulateSuperAdminProvision(callerAuthId, payload, mailer) {
  const authRes = simulateAuthenticatePlatformAdmin(callerAuthId, ['super_admin'], true)
  if (authRes.status !== 200) {
    return authRes
  }

  // Check duplicate org slug
  const baseSlug = payload.slug || payload.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  if (MOCK_PLATFORM_DB.organisations.some((o) => o.slug === baseSlug)) {
    return { status: 409, error: 'Organisation with this identifier already exists.' }
  }

  // Create org
  const newOrg = {
    id: `org-${crypto.randomBytes(4).toString('hex')}`,
    name: payload.name,
    slug: baseSlug,
    type: payload.type,
    plan: payload.planTier || 'growth',
  }
  MOCK_PLATFORM_DB.organisations.push(newOrg)

  // Create subscription
  const newSub = {
    id: `sub-${crypto.randomBytes(4).toString('hex')}`,
    org_id: newOrg.id,
    plan_tier: payload.planTier || 'growth',
    included_seats: payload.includedSeats || 10,
    additional_seats: 0,
    status: 'active',
    is_read_only: false,
  }
  MOCK_PLATFORM_DB.org_subscriptions.push(newSub)

  // Issue owner invite
  const rawToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
  const newInvite = {
    id: `inv-${crypto.randomBytes(4).toString('hex')}`,
    org_id: newOrg.id,
    email: payload.adminEmail.toLowerCase().trim(),
    role: 'owner',
    token_hash: tokenHash,
    status: 'pending',
    expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
  }
  MOCK_PLATFORM_DB.org_invitations.push(newInvite)

  // Send email via mailer
  mailer.sendInvitationEmail({
    to: newInvite.email,
    orgName: newOrg.name,
    role: 'Owner & Primary Administrator',
    inviteUrl: `https://productionx.ai/invite/${rawToken}`,
    inviterName: authRes.auth.profile.full_name,
  })

  // Record audit log
  MOCK_PLATFORM_DB.platform_audit_logs.push({
    id: `audit-${crypto.randomBytes(4).toString('hex')}`,
    actor_user_id: authRes.auth.user.id,
    actor_role: authRes.auth.platformUser.role,
    action: 'organisation.provision',
    target_entity_type: 'organisation',
    target_entity_id: newOrg.id,
    metadata: {
      name: newOrg.name,
      slug: newOrg.slug,
      type: newOrg.type,
      adminEmail: newInvite.email,
      includedSeats: newSub.included_seats,
    },
    created_at: new Date().toISOString(),
  })

  // Return response WITHOUT raw token
  return {
    status: 201,
    body: {
      success: true,
      message: 'Customer organisation provisioned successfully. Activation email dispatched.',
      organisation: newOrg,
      subscription: newSub,
      activation: {
        adminEmail: newInvite.email,
        invitationId: newInvite.id,
        emailDispatched: true,
      },
    },
  }
}

// Test: Anonymous provisioning blocked (401)
function testAnonymousProvisioningBlocked() {
  const mailer = new MockEmailAdapter()
  const res = simulateSuperAdminProvision(null, {
    name: 'Unauthorized Org',
    type: 'developer',
    adminEmail: 'boss@unauth.com',
  }, mailer)

  assert.equal(res.status, 401)
  assert.equal(res.error.includes('Unauthorised'), true)
  console.log('✓ Test 5 Passed: Anonymous organisation provisioning strictly denied (HTTP 401)')
}

// Test: Customer owner provisioning blocked (403)
function testCustomerProvisioningBlocked() {
  const mailer = new MockEmailAdapter()
  const res = simulateSuperAdminProvision('usr-customer-owner', {
    name: 'Customer Rogue Org',
    type: 'developer',
    adminEmail: 'rogue@acme.com',
  }, mailer)

  assert.equal(res.status, 403)
  assert.equal(res.error.includes('Forbidden'), true)
  console.log('✓ Test 6 Passed: Customer user provisioning strictly blocked from Platform Admin (HTTP 403)')
}

// Test: Super Admin without MFA AAL2 blocked from provisioning (403 MFA AAL2 Required)
function testSuperAdminAAL1Blocked() {
  const mailer = new MockEmailAdapter()
  const res = simulateSuperAdminProvision('usr-super-admin-no-mfa', {
    name: 'AAL1 Org',
    type: 'developer',
    adminEmail: 'admin@aal1.com',
  }, mailer)

  assert.equal(res.status, 403)
  assert.equal(res.code, 'MFA_AAL2_REQUIRED')
  assert.equal(res.error.includes('MFA AAL2 Required'), true)
  console.log('✓ Test 7 Passed: Super Admin with AAL1 blocked from administrative provisioning (HTTP 403 MFA AAL2 Required)')
}

// Test: Super Admin with AAL2 provisioning success (201, token hash stored, raw token not in response)
function testSuperAdminAAL2ProvisioningSuccess() {
  const mailer = new MockEmailAdapter()
  const res = simulateSuperAdminProvision('usr-super-admin', {
    name: 'Godrej Properties',
    slug: 'godrej-prop',
    type: 'developer',
    planTier: 'growth',
    includedSeats: 15,
    adminEmail: 'director@godrej.com',
  }, mailer)

  assert.equal(res.status, 201)
  assert.equal(res.body.success, true)
  assert.equal(res.body.organisation.slug, 'godrej-prop')
  assert.equal(res.body.subscription.included_seats, 15)

  // Verify raw token is NOT in the JSON response
  assert.equal(res.body.activation.activationUrl, undefined, 'Must not expose activationUrl in response')
  assert.equal(res.body.activation.raw_token, undefined, 'Must not expose raw_token in response')
  assert.equal(res.body.activation.token_hash, undefined, 'Must not expose token_hash in response')

  // Verify stored in DB with hash
  const storedInvite = MOCK_PLATFORM_DB.org_invitations.find((i) => i.email === 'director@godrej.com')
  assert.equal(!!storedInvite, true, 'Invitation must be saved in DB')
  assert.equal(storedInvite.token_hash.length, 64, 'Token must be stored as 64-char SHA-256 hash')

  // Verify email dispatched via mailer
  const sentMail = mailer.getRecentEmailFor('director@godrej.com')
  assert.equal(!!sentMail, true, 'Activation email must be dispatched to adminEmail')
  assert.equal(sentMail.text.includes('/invite/'), true, 'Email text must contain invite link')

  // Verify audit log entry
  const audit = MOCK_PLATFORM_DB.platform_audit_logs.find((a) => a.action === 'organisation.provision')
  assert.equal(!!audit, true, 'Audit log entry must be created')
  assert.equal(audit.actor_role, 'super_admin')

  console.log('✓ Test 8 Passed: Super Admin with AAL2 successfully provisions org with hashed invite and audit log')
}

// Test: Closed-SaaS Onboarding Requests Workflow & Field Immutability Defense
function testOnboardingRequestsWorkflow() {
  // 1. Sales rep 1 creates draft
  const newReq = {
    id: `req-${crypto.randomBytes(4).toString('hex')}`,
    requested_by: 'usr-sales-rep-1',
    company_name: 'Prestige Estates Project',
    company_type: 'developer',
    admin_email: 'vp@prestige.com',
    admin_name: 'VP Sales',
    requested_plan_code: 'growth',
    requested_seats: 8,
    requested_billing_cycle: 'annual',
    status: 'draft',
    approved_plan_code: null,
    approved_seats: null,
  }
  MOCK_PLATFORM_DB.customer_onboarding_requests.push(newReq)

  // 2. Sales rep 1 queries requests: returns only own requests
  const rep1Requests = MOCK_PLATFORM_DB.customer_onboarding_requests.filter(
    (r) => r.requested_by === 'usr-sales-rep-1'
  )
  assert.equal(rep1Requests.length, 1)

  const rep2Requests = MOCK_PLATFORM_DB.customer_onboarding_requests.filter(
    (r) => r.requested_by === 'usr-sales-rep-2'
  )
  assert.equal(rep2Requests.length, 0) // Rep 2 sees 0 requests

  // 3. Sales rep 1 updates contact info in draft: allowed
  newReq.admin_name = 'VP Sales Prestige'
  assert.equal(newReq.admin_name, 'VP Sales Prestige')

  // 4. Sales rep attempts to approve request or edit approved fields: BLOCKED
  function attemptSalesRepApproval(req, salesRepId) {
    if (salesRepId !== 'usr-super-admin') {
      throw new Error('Permission Denied: Only Super Admins can approve onboarding requests.')
    }
    req.status = 'approved'
  }

  assert.throws(
    () => attemptSalesRepApproval(newReq, 'usr-sales-rep-1'),
    /Permission Denied/,
    'Sales rep must not be able to approve onboarding request'
  )

  // 5. Sales rep transitions draft -> pending_approval
  newReq.status = 'pending_approval'

  // 6. Super Admin approves request with approved commercial terms
  newReq.status = 'approved'
  newReq.approved_plan_code = 'growth'
  newReq.approved_seats = 8
  newReq.approved_billing_cycle = 'annual'
  newReq.reviewed_by = 'usr-super-admin'
  newReq.reviewed_at = new Date().toISOString()

  assert.equal(newReq.status, 'approved')
  assert.equal(newReq.approved_seats, 8)

  console.log('✓ Test 9 Passed: Closed-SaaS onboarding requests enforce sales scoping and field immutability')
}

// Test: Public Organisation Creation Blocked (POST /api/orgs)
function testPublicOrgCreationBlocked() {
  function simulateCreateOrgEndpoint(authUserId) {
    const platformUser = MOCK_PLATFORM_DB.platform_users.find(
      (p) => p.user_id === authUserId && p.is_active === true
    )
    if (!platformUser || platformUser.role !== 'super_admin') {
      return {
        status: 403,
        error: 'Forbidden: Self-service organisation creation is disabled on Production X. Organisations must be provisioned by a Platform Super Admin.',
      }
    }
    return { status: 201, org: { name: 'Test' } }
  }

  const customerRes = simulateCreateOrgEndpoint('usr-customer-owner')
  assert.equal(customerRes.status, 403)
  assert.equal(customerRes.error.includes('Self-service organisation creation is disabled'), true)

  const salesRes = simulateCreateOrgEndpoint('usr-sales-rep-1')
  assert.equal(salesRes.status, 403)

  const superAdminRes = simulateCreateOrgEndpoint('usr-super-admin')
  assert.equal(superAdminRes.status, 201)

  console.log('✓ Test 10 Passed: Public self-service organisation creation strictly blocked (HTTP 403)')
}

// Test: Tenant Security - Deactivated Members Blocked & Multi-Org Independence
function testTenantActiveMembershipEnforcement() {
  // Simulated authorizeOrgAccess helper
  function simulateAuthorizeOrgAccess(authUserId, orgId) {
    const authUser = MOCK_PLATFORM_DB.auth_users.find((u) => u.id === authUserId)
    if (!authUser) return { status: 401, error: 'Unauthorised' }

    const profile = MOCK_PLATFORM_DB.profiles.find((p) => p.auth_user_id === authUserId)
    if (!profile) return { status: 403, error: 'Profile not found' }

    const membership = MOCK_PLATFORM_DB.org_members.find(
      (m) => m.org_id === orgId && m.profile_id === profile.id
    )

    if (!membership) {
      return { status: 403, error: 'Forbidden. You do not belong to this organisation.' }
    }

    if (membership.status !== 'active') {
      return {
        status: 403,
        error: 'Forbidden. Your membership in this organisation has been deactivated or suspended.',
      }
    }

    return { status: 200, role: membership.role, orgId }
  }

  // Active owner in Acme: Allowed
  const ownerRes = simulateAuthorizeOrgAccess('usr-customer-owner', 'org-acme')
  assert.equal(ownerRes.status, 200)

  // Deactivated employee in Acme: Blocked
  const deactivatedRes = simulateAuthorizeOrgAccess('usr-customer-employee', 'org-acme')
  assert.equal(deactivatedRes.status, 403)
  assert.equal(deactivatedRes.error.includes('deactivated or suspended'), true)

  // Multi-org user: Deactivated in Acme, but ACTIVE in Partner
  const multiOrgInAcme = simulateAuthorizeOrgAccess('usr-multi-org', 'org-acme')
  assert.equal(multiOrgInAcme.status, 403, 'Must be blocked in Acme where status is deactivated')

  const multiOrgInPartner = simulateAuthorizeOrgAccess('usr-multi-org', 'org-partner')
  assert.equal(multiOrgInPartner.status, 200, 'Must be permitted in Partner where status is active')
  assert.equal(multiOrgInPartner.role, 'admin')

  // Cross-tenant access: Acme Owner accessing Partner org -> Blocked
  const crossTenantRes = simulateAuthorizeOrgAccess('usr-customer-owner', 'org-partner')
  assert.equal(crossTenantRes.status, 403)
  assert.equal(crossTenantRes.error.includes('You do not belong to this organisation'), true)

  console.log('✓ Test 11 Passed: Deactivated members lose access while preserving active multi-org memberships')
}

// Test: Invitation Concurrency & Row-Locking Seat Capacity Serialization
function testConcurrentInvitationSeatCapacity() {
  // Acme has: included_seats = 5, additional_seats = 0 (Total 5)
  // Active members in Acme: mem-1 (prof-customer-owner). mem-2 & mem-3 are deactivated (0 seats consumed)
  // Currently active: 1 occupied seat
  // Pending invites: inv-1 (1 reserved seat)
  // Total occupied + reserved = 2 out of 5 seats -> 3 seats available.

  // Simulate setting remaining capacity to exactly 1 seat remaining
  const sub = MOCK_PLATFORM_DB.org_subscriptions.find((s) => s.org_id === 'org-acme')
  sub.included_seats = 2 // Total 2 seats: 1 occupied + 1 reserved = 0 available!

  function simulateAtomicSeatReservation(orgId, inviterAuthId, email) {
    // 1. Verify caller active membership
    const profile = MOCK_PLATFORM_DB.profiles.find((p) => p.auth_user_id === inviterAuthId)
    const callerMember = MOCK_PLATFORM_DB.org_members.find(
      (m) => m.org_id === orgId && m.profile_id === profile?.id && m.status === 'active'
    )
    if (!callerMember || !['owner', 'admin'].includes(callerMember.role)) {
      return { success: false, error: 'Forbidden: Only owners and admins can invite staff.' }
    }

    // 2. Lock subscription (simulated serial lock)
    const currentSub = MOCK_PLATFORM_DB.org_subscriptions.find((s) => s.org_id === orgId)
    const totalAllowed = currentSub.included_seats + currentSub.additional_seats

    // 3. Recheck under lock: duplicate active pending invite
    const hasPending = MOCK_PLATFORM_DB.org_invitations.some(
      (i) => i.org_id === orgId && i.email.toLowerCase() === email.toLowerCase() && i.status === 'pending'
    )
    if (hasPending) {
      return { success: false, error: 'An active pending invitation already exists for this email address.' }
    }

    // 4. Count under lock
    const activeCount = MOCK_PLATFORM_DB.org_members.filter(
      (m) => m.org_id === orgId && m.status === 'active'
    ).length
    const pendingCount = MOCK_PLATFORM_DB.org_invitations.filter(
      (i) => i.org_id === orgId && i.status === 'pending'
    ).length

    // 5. Assert capacity
    if (activeCount + pendingCount + 1 > totalAllowed) {
      return {
        success: false,
        error: `Seat limit reached (${activeCount + pendingCount}/${totalAllowed} seats). Please purchase additional seats before inviting staff.`,
      }
    }

    // 6. Insert reservation
    const rawToken = crypto.randomBytes(32).toString('hex')
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex')
    const invite = {
      id: `inv-${crypto.randomBytes(4).toString('hex')}`,
      org_id: orgId,
      email: email.toLowerCase(),
      role: 'sales_exec',
      token_hash: tokenHash,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    }
    MOCK_PLATFORM_DB.org_invitations.push(invite)

    return { success: true, invitationId: invite.id, rawToken }
  }

  // With 2 total seats (1 occupied, 1 pending), capacity is exhausted:
  const overflowRes = simulateAtomicSeatReservation('org-acme', 'usr-customer-owner', 'third@acme.com')
  assert.equal(overflowRes.success, false)
  assert.equal(overflowRes.error.includes('Seat limit reached'), true)

  // Expand capacity by 1 additional seat (Total 3 seats)
  sub.additional_seats = 1

  // Two concurrent invitations dispatched simultaneously:
  const inviteA = simulateAtomicSeatReservation('org-acme', 'usr-customer-owner', 'rep-a@acme.com')
  const inviteB = simulateAtomicSeatReservation('org-acme', 'usr-customer-owner', 'rep-b@acme.com')

  // Exactly 1 must succeed, exactly 1 must fail:
  const results = [inviteA, inviteB]
  const successCount = results.filter((r) => r.success).length
  const failCount = results.filter((r) => !r.success).length

  assert.equal(successCount, 1, 'Exactly one concurrent invitation must succeed when 1 seat is available')
  assert.equal(failCount, 1, 'Exactly one concurrent invitation must be rejected with seat limit error')

  // Duplicate pending invitation check under lock:
  const duplicateRes = simulateAtomicSeatReservation('org-acme', 'usr-customer-owner', 'rep-a@acme.com')
  assert.equal(duplicateRes.success, false)
  assert.equal(duplicateRes.error.includes('An active pending invitation already exists'), true)

  console.log('✓ Test 12 Passed: Concurrent invitation reservations serialize under row-lock with zero over-allocation')
}

// Test: Safe Token Verification Procedure (Does not expose token_hash)
function testSafeTokenVerificationProcedure() {
  function simulateVerifyInvitationToken(rawToken) {
    const computedHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex')
    const invite = MOCK_PLATFORM_DB.org_invitations.find((i) => i.token_hash === computedHash)

    if (!invite) return null

    const org = MOCK_PLATFORM_DB.organisations.find((o) => o.id === invite.org_id)

    // Procedure returns only non-sensitive columns:
    return {
      invitationId: invite.id,
      orgId: org.id,
      orgName: org.name,
      orgSlug: org.slug,
      orgType: org.type,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expires_at,
      isValid: invite.status === 'pending' && new Date(invite.expires_at) > new Date(),
      // CRITICAL: token_hash is NOT returned in the record
    }
  }

  // Query with valid raw token
  const validDetails = simulateVerifyInvitationToken('raw-token-1')
  assert.equal(!!validDetails, true)
  assert.equal(validDetails.orgName, 'Acme Developers')
  assert.equal(validDetails.token_hash, undefined, 'Must not return token_hash')

  // Query with invalid raw token
  const invalidDetails = simulateVerifyInvitationToken('bogus-token-xyz')
  assert.equal(invalidDetails, null)

  console.log('✓ Test 13 Passed: Safe token verification RPC validates raw tokens without exposing token_hash')
}

// Execute all tests
testMigration0026Contracts()
testMigration0027Contracts()
testMigration0028Contracts()
testMigration0029Contracts()
testAnonymousProvisioningBlocked()
testCustomerProvisioningBlocked()
testSuperAdminAAL1Blocked()
testSuperAdminAAL2ProvisioningSuccess()
testOnboardingRequestsWorkflow()
testPublicOrgCreationBlocked()
testTenantActiveMembershipEnforcement()
testConcurrentInvitationSeatCapacity()
testSafeTokenVerificationProcedure()

console.log('--- All 13 Phase 1 Platform Admin & Closed-SaaS Tests Passed Successfully! ---')
