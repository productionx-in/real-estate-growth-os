// tests/phase2-navigation-and-role-foundations.test.mjs
// Test suite for Phase 2: Navigation Shell, Workspace Switching, and Role Foundations
import assert from 'node:assert/strict'

console.log('--- Running Phase 2: Navigation Shell & Role Foundations Tests ---')

// Mock Database & State Store
const MOCK_DB = {
  organisations: [
    { id: 'org-prestige', name: 'Prestige Group', slug: 'prestige', type: 'developer', plan: 'enterprise' },
    { id: 'org-brigade', name: 'Brigade Enterprises', slug: 'brigade', type: 'developer', plan: 'growth' },
    { id: 'org-squarefeet', name: 'SquareFeet Realty', slug: 'squarefeet', type: 'channel_partner', plan: 'growth' },
    { id: 'org-stranger', name: 'Stranger Developers', slug: 'stranger', type: 'developer', plan: 'free' },
  ],
  profiles: [
    { id: 'prof-single', auth_user_id: 'user-single', full_name: 'Single Org Rep' },
    { id: 'prof-multi', auth_user_id: 'user-multi', full_name: 'Multi Org Consultant' },
    { id: 'prof-admin', auth_user_id: 'user-admin', full_name: 'Prestige Admin' },
    { id: 'prof-manager', auth_user_id: 'user-manager', full_name: 'Prestige Sales Manager' },
    { id: 'prof-rep-1', auth_user_id: 'user-rep-1', full_name: 'Rahul Varma' },
    { id: 'prof-rep-2', auth_user_id: 'user-rep-2', full_name: 'Priya Sharma' },
    { id: 'prof-no-org', auth_user_id: 'user-no-org', full_name: 'New Registered User' },
    { id: 'prof-cp-broker', auth_user_id: 'user-cp-broker', full_name: 'Agency Broker' },
  ],
  org_members: [
    { id: 'mem-1', org_id: 'org-prestige', profile_id: 'prof-admin', role: 'owner', joined_at: '2026-01-01' },
    { id: 'mem-2', org_id: 'org-prestige', profile_id: 'prof-manager', role: 'manager', joined_at: '2026-01-05' },
    { id: 'mem-3', org_id: 'org-prestige', profile_id: 'prof-rep-1', role: 'sales_exec', joined_at: '2026-01-10' },
    { id: 'mem-4', org_id: 'org-prestige', profile_id: 'prof-rep-2', role: 'sales_exec', joined_at: '2026-01-12' },
    { id: 'mem-5', org_id: 'org-prestige', profile_id: 'prof-single', role: 'sales_exec', joined_at: '2026-02-01' },
    { id: 'mem-6', org_id: 'org-prestige', profile_id: 'prof-multi', role: 'manager', joined_at: '2026-02-05' },
    { id: 'mem-7', org_id: 'org-brigade', profile_id: 'prof-multi', role: 'sales_exec', joined_at: '2026-02-10' },
    { id: 'mem-8', org_id: 'org-squarefeet', profile_id: 'prof-cp-broker', role: 'owner', joined_at: '2026-02-15' },
  ],
  leads: [
    { id: 'lead-1', org_id: 'org-prestige', name: 'Amit Kumar', assigned_to: 'prof-rep-1', status: 'contacted' },
    { id: 'lead-2', org_id: 'org-prestige', name: 'Sunita Rao', assigned_to: 'prof-rep-2', status: 'new' },
    { id: 'lead-3', org_id: 'org-prestige', name: 'Vikram Reddy', assigned_to: null, status: 'new' },
    { id: 'lead-4', org_id: 'org-brigade', name: 'Kiran Patel', assigned_to: 'prof-multi', status: 'site_visit_scheduled' },
  ],
}

// 1. Simulation of getVerifiedWorkspace with Available Orgs & Switcher Enumeration
function simulateGetVerifiedWorkspace(callerProfileId, requestedOrgSlug) {
  const org = MOCK_DB.organisations.find((o) => o.slug === requestedOrgSlug)
  if (!org) return { action: 'redirect', target: '/select-org' }

  const allMemberships = MOCK_DB.org_members.filter((m) => m.profile_id === callerProfileId)
  const currentMembership = allMemberships.find((m) => m.org_id === org.id)

  if (!currentMembership) {
    return { action: 'redirect', target: '/select-org' }
  }

  const availableOrgs = allMemberships.map((m) => {
    const o = MOCK_DB.organisations.find((orgItem) => orgItem.id === m.org_id)
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      type: o.type,
      role: m.role,
    }
  })

  return {
    action: 'success',
    workspace: {
      org,
      role: currentMembership.role,
      isManager: ['owner', 'admin', 'manager'].includes(currentMembership.role),
      isAdmin: ['owner', 'admin'].includes(currentMembership.role),
      availableOrgs,
    },
  }
}

// 2. Simulation of MyDashboardPage Multi-Org Resolution
function simulateMyDashboardResolution(callerProfileId, requestedSlug) {
  const memberships = MOCK_DB.org_members.filter((m) => m.profile_id === callerProfileId)

  if (memberships.length === 0) {
    return { action: 'redirect', target: '/create-org' }
  }

  let activeMembership = requestedSlug
    ? memberships.find((m) => {
        const org = MOCK_DB.organisations.find((o) => o.id === m.org_id)
        return org?.slug === requestedSlug
      })
    : null

  if (!activeMembership) {
    if (memberships.length === 1) {
      activeMembership = memberships[0]
      const org = MOCK_DB.organisations.find((o) => o.id === activeMembership.org_id)
      return { action: 'render', activeOrgSlug: org.slug, role: activeMembership.role }
    } else {
      return { action: 'redirect', target: '/select-org?redirectTo=/my/dashboard' }
    }
  }

  const org = MOCK_DB.organisations.find((o) => o.id === activeMembership.org_id)
  return { action: 'render', activeOrgSlug: org.slug, role: activeMembership.role }
}

// 3. Simulation of Leads Page Server-Authoritative Query
function simulateLeadsPageQuery(callerProfileId, orgSlug, { scope } = {}) {
  const res = simulateGetVerifiedWorkspace(callerProfileId, orgSlug)
  if (res.action !== 'success') return res

  const { workspace } = res
  let leads = MOCK_DB.leads.filter((l) => l.org_id === workspace.org.id)

  if (workspace.role === 'sales_exec') {
    // Server-enforced: Sales execs strictly see only assigned leads
    leads = leads.filter((l) => l.assigned_to === callerProfileId)
  } else if (workspace.isManager) {
    if (scope === 'my') {
      leads = leads.filter((l) => l.assigned_to === callerProfileId)
    } else if (scope === 'unassigned') {
      leads = leads.filter((l) => l.assigned_to === null)
    }
  }

  return { action: 'success', leads, role: workspace.role }
}

// 4. Simulation of Lead Detail Access
function simulateLeadDetailAccess(callerProfileId, orgSlug, leadId) {
  const res = simulateGetVerifiedWorkspace(callerProfileId, orgSlug)
  if (res.action !== 'success') return res

  const { workspace } = res
  const lead = MOCK_DB.leads.find((l) => l.id === leadId)
  if (!lead || lead.org_id !== workspace.org.id) return { action: 'notFound' }

  // Enforce server-authoritative role visibility:
  if (workspace.role === 'sales_exec' && lead.assigned_to !== callerProfileId) {
    return { action: 'notFound' }
  }

  return { action: 'success', lead }
}

// 5. Simulation of Server-Authoritative Route Protection
function simulateProtectedRouteAccess(callerProfileId, orgSlug, route) {
  const res = simulateGetVerifiedWorkspace(callerProfileId, orgSlug)
  if (res.action !== 'success') return res

  const { workspace } = res

  if (route === 'integrations') {
    if (!workspace.isManager && !workspace.isAdmin) {
      return { action: 'redirect', target: `/${orgSlug}` }
    }
  } else if (route === 'analytics') {
    if (workspace.role === 'sales_exec') {
      return { action: 'redirect', target: `/${orgSlug}` }
    }
  } else if (route === 'settings') {
    if (!workspace.isAdmin) {
      return { action: 'redirect', target: `/${orgSlug}` }
    }
  } else if (route === 'team') {
    if (!workspace.isManager && !workspace.isAdmin) {
      return { action: 'redirect', target: `/${orgSlug}` }
    }
  }

  return { action: 'allow' }
}

// TEST CASES

// Test 1: Single-organisation user
{
  const res = simulateMyDashboardResolution('prof-single')
  assert.equal(res.action, 'render')
  assert.equal(res.activeOrgSlug, 'prestige')
  console.log('✓ Test 1 Passed: Single-organisation user resolves workspace seamlessly without PGRST116 crash')
}

// Test 2: Multi-organisation user without orgSlug redirects to explicit workspace selector
{
  const res = simulateMyDashboardResolution('prof-multi')
  assert.equal(res.action, 'redirect')
  assert.equal(res.target, '/select-org?redirectTo=/my/dashboard')
  console.log('✓ Test 2 Passed: Multi-organisation user without orgSlug safely redirected to workspace selector')
}

// Test 3: Multi-organisation user with explicit orgSlug renders that workspace
{
  const res = simulateMyDashboardResolution('prof-multi', 'brigade')
  assert.equal(res.action, 'render')
  assert.equal(res.activeOrgSlug, 'brigade')
  assert.equal(res.role, 'sales_exec')
  console.log('✓ Test 3 Passed: Multi-organisation user with explicit orgSlug renders requested verified workspace')
}

// Test 4: User with zero organisations handled cleanly
{
  const res = simulateMyDashboardResolution('prof-no-org')
  assert.equal(res.action, 'redirect')
  assert.equal(res.target, '/create-org')
  console.log('✓ Test 4 Passed: Zero-membership user cleanly routed to onboarding creation')
}

// Test 5: Unauthorised workspace access attempt strictly blocked
{
  const res = simulateGetVerifiedWorkspace('prof-single', 'stranger')
  assert.equal(res.action, 'redirect')
  assert.equal(res.target, '/select-org')
  console.log('✓ Test 5 Passed: Access to unassigned workspace strictly denied (zero auto-membership)')
}

// Test 6: Available organisations correctly enumerated for Workspace Switcher
{
  const res = simulateGetVerifiedWorkspace('prof-multi', 'prestige')
  assert.equal(res.action, 'success')
  assert.equal(res.workspace.availableOrgs.length, 2)
  assert.deepEqual(
    res.workspace.availableOrgs.map((o) => o.slug),
    ['prestige', 'brigade']
  )
  console.log('✓ Test 6 Passed: Workspace switcher receives verified list of caller memberships (2 orgs)')
}

// Test 7: Sales executive lead list query enforcement (prevents ghost leads)
{
  const res = simulateLeadsPageQuery('prof-rep-1', 'prestige')
  assert.equal(res.action, 'success')
  assert.equal(res.leads.length, 1)
  assert.equal(res.leads[0].id, 'lead-1')
  console.log('✓ Test 7 Passed: Sales rep lead list strictly restricted to assigned leads (1 lead, 0 ghost leads)')
}

// Test 8: Sales executive attempting to view another salesperson’s lead detail
{
  // Rep 1 attempts to open Rep 2's lead
  const res = simulateLeadDetailAccess('prof-rep-1', 'prestige', 'lead-2')
  assert.equal(res.action, 'notFound')

  // Rep 1 opens their own lead
  const ownRes = simulateLeadDetailAccess('prof-rep-1', 'prestige', 'lead-1')
  assert.equal(ownRes.action, 'success')
  assert.equal(ownRes.lead.id, 'lead-1')
  console.log('✓ Test 8 Passed: Sales rep viewing another rep’s lead blocked via notFound (consistency with list)')
}

// Test 9: Sales manager retains full visibility & scoped filtering
{
  const allRes = simulateLeadsPageQuery('prof-manager', 'prestige')
  assert.equal(allRes.leads.length, 3) // sees lead-1, lead-2, lead-3

  const unassignedRes = simulateLeadsPageQuery('prof-manager', 'prestige', { scope: 'unassigned' })
  assert.equal(unassignedRes.leads.length, 1)
  assert.equal(unassignedRes.leads[0].id, 'lead-3')
  console.log('✓ Test 9 Passed: Sales manager retains full pipeline visibility and unassigned queue filtering')
}

// Test 10: Server-authoritative route protection across roles
{
  // Sales rep blocked from integrations, analytics, settings, team
  assert.equal(simulateProtectedRouteAccess('prof-rep-1', 'prestige', 'integrations').action, 'redirect')
  assert.equal(simulateProtectedRouteAccess('prof-rep-1', 'prestige', 'analytics').action, 'redirect')
  assert.equal(simulateProtectedRouteAccess('prof-rep-1', 'prestige', 'settings').action, 'redirect')
  assert.equal(simulateProtectedRouteAccess('prof-rep-1', 'prestige', 'team').action, 'redirect')

  // Sales manager allowed on team and analytics, but blocked from settings and integrations
  assert.equal(simulateProtectedRouteAccess('prof-manager', 'prestige', 'team').action, 'allow')
  assert.equal(simulateProtectedRouteAccess('prof-manager', 'prestige', 'analytics').action, 'allow')
  assert.equal(simulateProtectedRouteAccess('prof-manager', 'prestige', 'settings').action, 'redirect')

  // Admin allowed on all
  assert.equal(simulateProtectedRouteAccess('prof-admin', 'prestige', 'integrations').action, 'allow')
  assert.equal(simulateProtectedRouteAccess('prof-admin', 'prestige', 'analytics').action, 'allow')
  assert.equal(simulateProtectedRouteAccess('prof-admin', 'prestige', 'settings').action, 'allow')
  assert.equal(simulateProtectedRouteAccess('prof-admin', 'prestige', 'team').action, 'allow')
  console.log('✓ Test 10 Passed: Server-authoritative route access enforced across admin, manager, and sales rep')
}

// Simulation of POST /api/leads organisation resolution
function simulateLeadCreationOrgResolution(callerProfileId, payload, searchParams = {}, referer = null) {
  let requestedOrgId = payload.orgId || payload.org_id || searchParams.orgId || searchParams.org_id
  const requestedOrgSlug = payload.orgSlug || payload.org_slug || searchParams.orgSlug || searchParams.org_slug

  if (!requestedOrgId && requestedOrgSlug) {
    const org = MOCK_DB.organisations.find((o) => o.slug === requestedOrgSlug)
    if (org) requestedOrgId = org.id
  }

  if (!requestedOrgId && referer) {
    const match = referer.match(/^\/([^/]+)\/leads/)
    if (match && match[1] && match[1] !== 'leads' && match[1] !== 'api') {
      const org = MOCK_DB.organisations.find((o) => o.slug === match[1])
      if (org) requestedOrgId = org.id
    }
  }

  if (requestedOrgId) {
    const membership = MOCK_DB.org_members.find(
      (m) => m.org_id === requestedOrgId && m.profile_id === callerProfileId
    )
    if (!membership || membership.role === 'readonly') {
      return { status: 403, error: 'Insufficient permissions' }
    }
    return { status: 201, targetOrgId: requestedOrgId }
  }

  const callerMemberships = MOCK_DB.org_members.filter((m) => m.profile_id === callerProfileId)
  if (callerMemberships.length > 1) {
    return { status: 400, error: 'User belongs to multiple organisations. Please specify orgId in the request.' }
  }

  return { status: 201, targetOrgId: callerMemberships[0]?.org_id }
}

// Test 11: Multi-org user creating lead resolves workspace cleanly via orgSlug, orgId, or URL params
{
  // User with multiple orgs (Prestige & Brigade):
  // A. With orgSlug in body or query param
  const res1 = simulateLeadCreationOrgResolution('prof-multi', { name: 'Test Lead' }, { orgSlug: 'brigade' })
  assert.equal(res1.status, 201)
  assert.equal(res1.targetOrgId, 'org-brigade')

  // B. With orgId in body
  const res2 = simulateLeadCreationOrgResolution('prof-multi', { name: 'Test Lead', orgId: 'org-prestige' })
  assert.equal(res2.status, 201)
  assert.equal(res2.targetOrgId, 'org-prestige')

  // C. From referer header when navigating /[orgSlug]/leads/new
  const res3 = simulateLeadCreationOrgResolution('prof-multi', { name: 'Test Lead' }, {}, '/brigade/leads/new')
  assert.equal(res3.status, 201)
  assert.equal(res3.targetOrgId, 'org-brigade')

  // D. Without any workspace hint, returns the informative 400
  const res4 = simulateLeadCreationOrgResolution('prof-multi', { name: 'Test Lead' }, {}, null)
  assert.equal(res4.status, 400)
  assert.match(res4.error, /User belongs to multiple organisations/)
  console.log('✓ Test 11 Passed: Multi-org lead creation reliably resolves target workspace via orgSlug, orgId, and referer')
}

// Test 12: Cross-tenant lead creation privilege escalation prevented
{
  // User attempts to create lead in an organization they do not belong to
  const deniedRes = simulateLeadCreationOrgResolution('prof-rep-1', { name: 'Sneaky Lead' }, { orgSlug: 'brigade' })
  assert.equal(deniedRes.status, 403)
  console.log('✓ Test 12 Passed: Lead creation in unauthorized tenant strictly blocked (403)')
}

console.log('--- All 12 Phase 2 Navigation Shell & Role Foundations Tests Passed Successfully! ---')
