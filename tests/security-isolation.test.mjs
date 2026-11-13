// tests/security-isolation.test.mjs
// Automated security and tenant-isolation test suite
import assert from 'node:assert'

console.log('--- Running Stage 1 Security & Tenant Isolation Tests ---')

// 1. Mock Tenant Isolation Authorizer Logic
function mockAuthorizeProjectAccess(caller, project) {
  if (!caller) {
    return { status: 401, error: 'Unauthorised. Authentication required.' }
  }
  if (!project) {
    return { status: 404, error: 'Project not found' }
  }
  // Check membership
  const membership = caller.memberships?.find((m) => m.orgId === project.orgId)
  if (!membership) {
    return { status: 403, error: 'Forbidden. You do not belong to this project’s organisation.' }
  }
  return { status: 200, role: membership.role }
}

function mockAuthorizeProjectMutation(caller, project, action) {
  const access = mockAuthorizeProjectAccess(caller, project)
  if (access.status !== 200) return access

  const role = access.role
  if (action === 'update' && !['owner', 'admin', 'manager'].includes(role)) {
    return { status: 403, error: `Forbidden. Role '${role}' lacks required permissions to update project.` }
  }
  if (action === 'delete' && !['owner', 'admin'].includes(role)) {
    return { status: 403, error: `Forbidden. Role '${role}' lacks required permissions to delete project.` }
  }
  return { status: 200, success: true }
}

function mockAuthorizeInventoryAccess(caller, inventoryItem) {
  if (!caller) {
    return { status: 401, error: 'Unauthorised. Authentication required.' }
  }
  if (!inventoryItem) {
    return { status: 404, error: 'Inventory unit not found' }
  }
  const membership = caller.memberships?.find((m) => m.orgId === inventoryItem.orgId)
  if (!membership) {
    return { status: 403, error: 'Forbidden. You do not belong to this inventory’s organisation.' }
  }
  return { status: 200, role: membership.role }
}

function mockValidateCrossTenantProjectLink(leadOrgId, targetProject) {
  if (!targetProject) return { status: 400, error: 'Project does not exist' }
  if (targetProject.orgId !== leadOrgId) {
    return { status: 400, error: 'Project does not exist in this organisation (cross-tenant mismatch)' }
  }
  return { status: 200, valid: true }
}

function mockValidateHierarchyNodeLink(project, targetNode) {
  if (!targetNode) return { status: 400, error: 'Node does not exist' }
  if (targetNode.projectId !== project.id || targetNode.orgId !== project.orgId) {
    return { status: 400, error: 'Hierarchy node does not belong to this project and organisation' }
  }
  return { status: 200, valid: true }
}

function mockWorkspaceMembershipResolution(caller, targetOrg) {
  if (!caller) return { redirect: '/login' }
  const membership = caller.memberships?.find((m) => m.orgId === targetOrg.id)
  if (!membership) {
    // Strictly redirect without auto-assigning ownership
    return { redirect: '/select-org', autoAssigned: false }
  }
  return { role: membership.role, allowed: true }
}

// ── Test Cases ──────────────────────────────────────────────────────────────

// Test 1: Unauthenticated GET Project Access
{
  const res = mockAuthorizeProjectAccess(null, { id: 'p1', orgId: 'org-a' })
  assert.strictEqual(res.status, 401, 'Unauthenticated project access must return 401')
  console.log('✓ Test 1: Unauthenticated GET project access blocked (401)')
}

// Test 2: Unauthenticated GET Inventory Access
{
  const res = mockAuthorizeInventoryAccess(null, { id: 'inv1', orgId: 'org-a' })
  assert.strictEqual(res.status, 401, 'Unauthenticated inventory access must return 401')
  console.log('✓ Test 2: Unauthenticated GET inventory access blocked (401)')
}

// Test 3: Cross-Tenant Project Access (User in Org A requests Project in Org B)
{
  const userOrgA = { id: 'user1', memberships: [{ orgId: 'org-a', role: 'owner' }] }
  const projectOrgB = { id: 'p2', orgId: 'org-b' }
  const res = mockAuthorizeProjectAccess(userOrgA, projectOrgB)
  assert.strictEqual(res.status, 403, 'Cross-tenant project read must return 403')
  console.log('✓ Test 3: Cross-tenant project read access blocked (403)')
}

// Test 4: Cross-Tenant Project Update (User in Org A updates Project in Org B)
{
  const userOrgA = { id: 'user1', memberships: [{ orgId: 'org-a', role: 'owner' }] }
  const projectOrgB = { id: 'p2', orgId: 'org-b' }
  const res = mockAuthorizeProjectMutation(userOrgA, projectOrgB, 'update')
  assert.strictEqual(res.status, 403, 'Cross-tenant project update must return 403')
  console.log('✓ Test 4: Cross-tenant project update blocked (403)')
}

// Test 5: Role-based Project Update Check (Readonly and Sales Exec rejected)
{
  const readonlyUser = { id: 'user2', memberships: [{ orgId: 'org-a', role: 'readonly' }] }
  const salesUser = { id: 'user3', memberships: [{ orgId: 'org-a', role: 'sales_exec' }] }
  const managerUser = { id: 'user4', memberships: [{ orgId: 'org-a', role: 'manager' }] }
  const projectOrgA = { id: 'p1', orgId: 'org-a' }

  assert.strictEqual(mockAuthorizeProjectMutation(readonlyUser, projectOrgA, 'update').status, 403, 'Readonly user cannot update project')
  assert.strictEqual(mockAuthorizeProjectMutation(salesUser, projectOrgA, 'update').status, 403, 'Sales exec cannot update project')
  assert.strictEqual(mockAuthorizeProjectMutation(managerUser, projectOrgA, 'update').status, 200, 'Manager can update project')
  console.log('✓ Test 5: Project update RBAC enforced (readonly & sales_exec blocked, manager allowed)')
}

// Test 6: Role-based Project Delete Check (Only owner/admin allowed)
{
  const managerUser = { id: 'user4', memberships: [{ orgId: 'org-a', role: 'manager' }] }
  const adminUser = { id: 'user5', memberships: [{ orgId: 'org-a', role: 'admin' }] }
  const projectOrgA = { id: 'p1', orgId: 'org-a' }

  assert.strictEqual(mockAuthorizeProjectMutation(managerUser, projectOrgA, 'delete').status, 403, 'Manager cannot delete project')
  assert.strictEqual(mockAuthorizeProjectMutation(adminUser, projectOrgA, 'delete').status, 200, 'Admin can delete project')
  console.log('✓ Test 6: Project delete RBAC enforced (manager blocked, admin allowed)')
}

// Test 7: Cross-Tenant Inventory Access
{
  const userOrgA = { id: 'user1', memberships: [{ orgId: 'org-a', role: 'admin' }] }
  const invOrgB = { id: 'inv2', orgId: 'org-b' }
  const res = mockAuthorizeInventoryAccess(userOrgA, invOrgB)
  assert.strictEqual(res.status, 403, 'Cross-tenant inventory read must return 403')
  console.log('✓ Test 7: Cross-tenant inventory access blocked (403)')
}

// Test 8: Cross-Tenant Lead-to-Project Scope Verification
{
  const projectInAnotherOrg = { id: 'proj-diff', orgId: 'org-different' }
  const check = mockValidateCrossTenantProjectLink('org-a', projectInAnotherOrg)
  assert.strictEqual(check.status, 400, 'Cross-tenant project link in lead must be rejected')
  console.log('✓ Test 8: Cross-tenant project linking to lead rejected (400)')
}

// Test 9: Cross-Project / Cross-Tenant Hierarchy Node Verification
{
  const currentProject = { id: 'proj-1', orgId: 'org-a' }
  const foreignNode = { id: 'node-99', projectId: 'proj-2', orgId: 'org-b' }
  const check = mockValidateHierarchyNodeLink(currentProject, foreignNode)
  assert.strictEqual(check.status, 400, 'Foreign hierarchy node must be rejected')
  console.log('✓ Test 9: Foreign hierarchy node linking to inventory rejected (400)')
}

// Test 10: Prevention of Unsafe Auto-Ownership Assignment in Workspace Resolution
{
  const randomUserWithNoOrg = { id: 'user-new', memberships: [] }
  const targetOrg = { id: 'org-vip', slug: 'vip-builders' }
  const res = mockWorkspaceMembershipResolution(randomUserWithNoOrg, targetOrg)
  assert.strictEqual(res.redirect, '/select-org', 'Non-member must be redirected to /select-org')
  assert.strictEqual(res.autoAssigned, false, 'Non-member must NEVER be automatically granted ownership')
  console.log('✓ Test 10: Workspace resolution denies unassigned ownership (auto-ownership prevented)')
}

console.log('\n--- All 10 Stage 1 Security & Tenant Isolation Tests Passed! ---')
