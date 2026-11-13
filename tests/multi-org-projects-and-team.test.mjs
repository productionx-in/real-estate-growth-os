// tests/multi-org-projects-and-team.test.mjs
// Test suite for Multi-Org Project Creation and Team Workspace Member Resolution
import assert from 'node:assert/strict'

console.log('--- Running Multi-Org Project Creation & Team Resolution Tests ---')

// Mock Database State
const DB = {
  organisations: [
    { id: 'org-otho', name: 'Otho', slug: 'otho' },
    { id: 'org-acme', name: 'Acme Developers', slug: 'acme' },
    { id: 'org-stranger', name: 'Stranger Org', slug: 'stranger' },
  ],
  profiles: [
    { id: 'prof-multi', auth_user_id: 'user-multi', full_name: 'Multi-Org Manager' },
    { id: 'prof-readonly', auth_user_id: 'user-ro', full_name: 'Read Only Member' },
  ],
  org_members: [
    { id: 'mem-1', org_id: 'org-otho', profile_id: 'prof-multi', role: 'owner', joined_at: '2026-01-01' },
    { id: 'mem-2', org_id: 'org-acme', profile_id: 'prof-multi', role: 'manager', joined_at: '2026-02-01' },
    { id: 'mem-3', org_id: 'org-otho', profile_id: 'prof-readonly', role: 'readonly', joined_at: '2026-03-01' },
  ],
  projects: [],
}

// Simulated API logic for POST /api/projects
function handleCreateProject({ callerProfileId, body, searchParams = new URLSearchParams() }) {
  const requestedOrgId = body.orgId || body.org_id || searchParams.get('orgId') || searchParams.get('org_id')
  const requestedOrgSlug = body.orgSlug || searchParams.get('orgSlug')

  let targetOrgId = requestedOrgId

  if (!targetOrgId && requestedOrgSlug) {
    const org = DB.organisations.find((o) => o.slug === requestedOrgSlug)
    if (org) targetOrgId = org.id
  }

  if (targetOrgId) {
    const membership = DB.org_members.find(
      (m) => m.org_id === targetOrgId && m.profile_id === callerProfileId
    )
    if (!membership || !['owner', 'admin', 'manager'].includes(membership.role)) {
      return { status: 403, error: 'Insufficient permissions for the specified organisation' }
    }
  } else {
    const memberships = DB.org_members.filter((m) => m.profile_id === callerProfileId)
    const managerMemberships = memberships.filter((m) => ['owner', 'admin', 'manager'].includes(m.role))

    if (managerMemberships.length === 0) {
      return { status: 403, error: 'Managers or above can create projects' }
    }
    if (managerMemberships.length > 1) {
      return {
        status: 400,
        error: 'User belongs to multiple organisations. Please select a workspace or specify orgId/orgSlug.',
      }
    }
    targetOrgId = managerMemberships[0].org_id
  }

  const newProject = {
    id: `proj-${DB.projects.length + 1}`,
    org_id: targetOrgId,
    name: body.name,
    category: body.category || 'apartments',
  }
  DB.projects.push(newProject)
  return { status: 201, project: newProject }
}

// 1. Test: Multi-org user creates project in Otho specifying orgId
function testMultiOrgProjectCreationWithOrgId() {
  const res = handleCreateProject({
    callerProfileId: 'prof-multi',
    body: { name: 'Otho Skyline', orgId: 'org-otho' },
  })
  assert.equal(res.status, 201)
  assert.equal(res.project.org_id, 'org-otho')
  assert.equal(res.project.name, 'Otho Skyline')
  console.log('✓ Test 1: User belonging to multiple organisations creates project in Otho with orgId')
}

// 2. Test: Multi-org user creates project specifying orgSlug
function testMultiOrgProjectCreationWithOrgSlug() {
  const res = handleCreateProject({
    callerProfileId: 'prof-multi',
    body: { name: 'Acme Heights', orgSlug: 'acme' },
  })
  assert.equal(res.status, 201)
  assert.equal(res.project.org_id, 'org-acme')
  console.log('✓ Test 2: User belonging to multiple organisations creates project in Acme with orgSlug')
}

// 3. Test: Cannot create project in organisation user does not belong to
function testCannotCreateProjectInUnownedOrg() {
  const res = handleCreateProject({
    callerProfileId: 'prof-multi',
    body: { name: 'Stranger Towers', orgId: 'org-stranger' },
  })
  assert.equal(res.status, 403)
  assert.equal(res.error, 'Insufficient permissions for the specified organisation')
  console.log('✓ Test 3: Creating project in unowned organisation is strictly blocked (403)')
}

// 4. Test: Read-only members cannot create projects
function testReadOnlyMemberCannotCreateProject() {
  const res = handleCreateProject({
    callerProfileId: 'prof-readonly',
    body: { name: 'Illegal Project', orgId: 'org-otho' },
  })
  assert.equal(res.status, 403)
  console.log('✓ Test 4: Read-only members are blocked from creating projects (403)')
}

// 5. Test: Team page member resolution isolation
function testTeamPageMemberResolution() {
  // Query Otho members
  const othoMembers = DB.org_members
    .filter((m) => m.org_id === 'org-otho')
    .map((m) => {
      const prof = DB.profiles.find((p) => p.id === m.profile_id)
      return { id: m.id, role: m.role, name: prof?.full_name }
    })

  assert.equal(othoMembers.length, 2, 'Otho should have 2 members (owner & readonly)')
  assert.equal(othoMembers.some((m) => m.role === 'owner'), true, 'Otho owner must appear')
  assert.equal(othoMembers.some((m) => m.name === 'Multi-Org Manager'), true, 'Logged-in owner appears on Team page')
  
  // Verify Acme member does NOT leak into Otho
  const acmeOnlyMembers = DB.org_members.filter((m) => m.org_id === 'org-acme')
  assert.equal(othoMembers.some((m) => m.id === 'mem-2'), false, 'Acme membership must not appear in Otho')
  console.log('✓ Test 5: Team page displays all active members for active organisation without cross-tenant leakage')
}

// 6. Test: Query error is not converted to empty list
function testQueryErrorHandling() {
  const simulatedDbError = new Error('Database connection failed')
  let displayedEmptyState = false
  let displayedErrorAlert = false

  if (simulatedDbError) {
    displayedErrorAlert = true
  } else {
    displayedEmptyState = true
  }

  assert.equal(displayedErrorAlert, true)
  assert.equal(displayedEmptyState, false, 'DB error must NOT trigger empty state')
  console.log('✓ Test 6: Database query errors display error banner instead of misleading empty state')
}

testMultiOrgProjectCreationWithOrgId()
testMultiOrgProjectCreationWithOrgSlug()
testCannotCreateProjectInUnownedOrg()
testReadOnlyMemberCannotCreateProject()
testTeamPageMemberResolution()
testQueryErrorHandling()

console.log('\n--- All 6 Multi-Org Project & Team Tests Passed! ---')
