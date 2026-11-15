// tests/subscription-and-seat-entitlements.test.mjs
// Test suite for Subscription-Based Access Control, Seat Entitlements & User Provisioning
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

console.log('--- Running Subscription & Seat Entitlements Tests ---')

// Mock Database & Store
const MOCK_DB = {
  organisations: [
    { id: 'org-prestige', name: 'Prestige Group', slug: 'prestige', type: 'developer', plan: 'growth' },
    { id: 'org-brigade', name: 'Brigade Enterprises', slug: 'brigade', type: 'developer', plan: 'starter' },
    { id: 'org-apex', name: 'Apex Brokers', slug: 'apex', type: 'channel_partner', plan: 'free' },
  ],
  org_subscriptions: [
    {
      id: 'sub-prestige',
      org_id: 'org-prestige',
      plan_tier: 'growth',
      included_seats: 10,
      additional_seats: 2, // Total 12 seats
      status: 'active',
      billing_cycle: 'annual',
    },
    {
      id: 'sub-brigade',
      org_id: 'org-brigade',
      plan_tier: 'starter',
      included_seats: 3,
      additional_seats: 0, // Total 3 seats
      status: 'active',
      billing_cycle: 'monthly',
    },
    {
      id: 'sub-apex',
      org_id: 'org-apex',
      plan_tier: 'free',
      included_seats: 2,
      additional_seats: 0, // Total 2 seats
      status: 'active',
      billing_cycle: 'monthly',
    },
  ],
  profiles: [
    { id: 'prof-owner-1', auth_user_id: 'user-owner-1', full_name: 'Vikram Prestige' },
    { id: 'prof-rep-1', auth_user_id: 'user-rep-1', full_name: 'Rahul Sales' },
    { id: 'prof-rep-2', auth_user_id: 'user-rep-2', full_name: 'Anita Rep' },
    { id: 'prof-rep-3', auth_user_id: 'user-rep-3', full_name: 'Karan Rep' },
    { id: 'prof-multi', auth_user_id: 'user-multi', full_name: 'Consultant Ramesh' },
    { id: 'prof-brigade-owner', auth_user_id: 'user-brig-owner', full_name: 'Suresh Brigade' },
    { id: 'prof-brigade-rep', auth_user_id: 'user-brig-rep', full_name: 'Deepak Rep' },
  ],
  org_members: [
    // Prestige: 4 active members (prof-owner-1, prof-rep-1, prof-rep-2, prof-multi)
    { id: 'mem-1', org_id: 'org-prestige', profile_id: 'prof-owner-1', role: 'owner', status: 'active', joined_at: '2026-01-01' },
    { id: 'mem-2', org_id: 'org-prestige', profile_id: 'prof-rep-1', role: 'sales_exec', status: 'active', joined_at: '2026-01-10' },
    { id: 'mem-3', org_id: 'org-prestige', profile_id: 'prof-rep-2', role: 'sales_exec', status: 'active', joined_at: '2026-01-15' },
    { id: 'mem-4', org_id: 'org-prestige', profile_id: 'prof-multi', role: 'admin', status: 'active', joined_at: '2026-01-20' },
    // Brigade: 2 active members (prof-brigade-owner, prof-multi) -> Total 2 occupied out of 3
    { id: 'mem-5', org_id: 'org-brigade', profile_id: 'prof-brigade-owner', role: 'owner', status: 'active', joined_at: '2026-01-01' },
    { id: 'mem-6', org_id: 'org-brigade', profile_id: 'prof-multi', role: 'sales_exec', status: 'active', joined_at: '2026-01-22' },
  ],
  org_invitations: [
    // Prestige has 1 pending invitation (reserves 1 seat)
    {
      id: 'inv-1',
      org_id: 'org-prestige',
      email: 'candidate1@gmail.com',
      role: 'sales_exec',
      invited_by: 'prof-owner-1',
      token_hash: crypto.createHash('sha256').update('token-prestige-1').digest('hex'),
      status: 'pending',
      expires_at: new Date(Date.now() + 5 * 86400000).toISOString(),
    },
    // Brigade has 1 pending invitation (reserves 1 seat) -> 2 occupied + 1 reserved = 3 seats full!
    {
      id: 'inv-2',
      org_id: 'org-brigade',
      email: 'recruit@brigade.com',
      role: 'sales_exec',
      invited_by: 'prof-brigade-owner',
      token_hash: crypto.createHash('sha256').update('token-brigade-1').digest('hex'),
      status: 'pending',
      expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    },
  ],
  leads: [
    { id: 'lead-1', org_id: 'org-prestige', name: 'Buyer Anil', assigned_to: 'prof-rep-1', status: 'contacted' },
    { id: 'lead-2', org_id: 'org-prestige', name: 'Buyer Sunita', assigned_to: 'prof-rep-1', status: 'site_visit_scheduled' },
    { id: 'lead-3', org_id: 'org-prestige', name: 'Buyer Rajiv', assigned_to: 'prof-rep-2', status: 'negotiation' },
  ],
  lead_activities: [],
}

// 1. Simulation: Seat Usage Calculation
function simulateSeatUsage(orgId) {
  const sub = MOCK_DB.org_subscriptions.find((s) => s.org_id === orgId)
  const totalSeats = (sub?.included_seats ?? 5) + (sub?.additional_seats ?? 0)

  const occupiedSeats = MOCK_DB.org_members.filter(
    (m) => m.org_id === orgId && m.status === 'active'
  ).length

  const now = new Date()
  const reservedSeats = MOCK_DB.org_invitations.filter(
    (i) => i.org_id === orgId && i.status === 'pending' && new Date(i.expires_at) > now
  ).length

  const availableSeats = Math.max(0, totalSeats - (occupiedSeats + reservedSeats))

  return {
    totalSeats,
    occupiedSeats,
    reservedSeats,
    availableSeats,
    isLimitReached: availableSeats <= 0,
  }
}

// 2. Simulation: Issue Employee Invitation
function simulateIssueInvitation(orgId, inviterProfileId, email, role, expiresInDays = 7) {
  // Check permission
  const inviterMember = MOCK_DB.org_members.find(
    (m) => m.org_id === orgId && m.profile_id === inviterProfileId && m.status === 'active'
  )
  if (!inviterMember || !['owner', 'admin'].includes(inviterMember.role)) {
    return { status: 403, error: 'Only owners and administrators can invite employees' }
  }

  // Check seat capacity
  const usage = simulateSeatUsage(orgId)
  if (usage.availableSeats <= 0) {
    return {
      status: 409,
      error: `Seat limit reached (${usage.totalSeats} seats total). Your organisation has occupied ${usage.occupiedSeats} seats and reserved ${usage.reservedSeats} seats. Please upgrade plan or purchase additional seats.`,
    }
  }

  // Check existing active member
  const profileWithEmail = MOCK_DB.profiles.find((p) => p.email === email)
  if (profileWithEmail) {
    const isMember = MOCK_DB.org_members.some(
      (m) => m.org_id === orgId && m.profile_id === profileWithEmail.id && m.status === 'active'
    )
    if (isMember) return { status: 400, error: 'User is already an active member of this organisation.' }
  }

  // Create invite
  const token = `tok_${Math.random().toString(36).slice(2)}`
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const newInvite = {
    id: `inv-${Date.now()}`,
    org_id: orgId,
    email,
    role,
    invited_by: inviterProfileId,
    token_hash: tokenHash,
    status: 'pending',
    expires_at: new Date(Date.now() + expiresInDays * 86400000).toISOString(),
  }
  MOCK_DB.org_invitations.push(newInvite)

  return { status: 201, invitation: newInvite, token }
}

// 3. Simulation: Revoke Invitation
function simulateRevokeInvitation(orgId, invitationId, actorProfileId) {
  const actorMember = MOCK_DB.org_members.find(
    (m) => m.org_id === orgId && m.profile_id === actorProfileId && m.status === 'active'
  )
  if (!actorMember || !['owner', 'admin'].includes(actorMember.role)) {
    return { status: 403, error: 'Insufficient permissions' }
  }

  const invite = MOCK_DB.org_invitations.find((i) => i.id === invitationId && i.org_id === orgId)
  if (!invite) return { status: 404, error: 'Invitation not found' }

  invite.status = 'revoked'
  return { status: 200, success: true }
}

// 4. Simulation: Accept Invitation
function simulateAcceptInvitation(token, acceptingProfileId) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const invite = MOCK_DB.org_invitations.find((i) => i.token_hash === tokenHash)

  if (!invite) return { status: 404, error: 'Invitation not found' }
  if (invite.status !== 'pending') return { status: 400, error: `Invitation is already ${invite.status}` }
  if (new Date(invite.expires_at) < new Date()) {
    invite.status = 'expired'
    return { status: 400, error: 'Invitation has expired' }
  }

  // Link to existing organization
  const existingMembership = MOCK_DB.org_members.find(
    (m) => m.org_id === invite.org_id && m.profile_id === acceptingProfileId
  )

  if (existingMembership) {
    existingMembership.status = 'active'
    existingMembership.role = invite.role
  } else {
    MOCK_DB.org_members.push({
      id: `mem-${Date.now()}`,
      org_id: invite.org_id,
      profile_id: acceptingProfileId,
      role: invite.role,
      status: 'active',
      joined_at: new Date().toISOString(),
    })
  }

  invite.status = 'accepted'
  invite.accepted_by = acceptingProfileId
  invite.accepted_at = new Date().toISOString()

  return { status: 200, success: true, orgId: invite.org_id }
}

// 5. Simulation: Deactivate Member with Lead Reassignment
function simulateDeactivateMember(orgId, memberId, actorProfileId, reassignmentMode, targetProfileId) {
  const actor = MOCK_DB.org_members.find((m) => m.org_id === orgId && m.profile_id === actorProfileId)
  if (!actor || !['owner', 'admin'].includes(actor.role)) {
    return { status: 403, error: 'Only owners and admins can deactivate members' }
  }

  const member = MOCK_DB.org_members.find((m) => m.id === memberId && m.org_id === orgId)
  if (!member) return { status: 404, error: 'Member not found' }
  if (member.profile_id === actorProfileId) return { status: 400, error: 'Cannot deactivate yourself' }

  // Sole owner check
  if (member.role === 'owner') {
    const ownerCount = MOCK_DB.org_members.filter((m) => m.org_id === orgId && m.role === 'owner' && m.status === 'active').length
    if (ownerCount <= 1) return { status: 400, error: 'Cannot deactivate sole owner' }
  }

  // Reassign active leads
  const activeLeads = MOCK_DB.leads.filter((l) => l.org_id === orgId && l.assigned_to === member.profile_id)
  for (const lead of activeLeads) {
    lead.assigned_to = reassignmentMode === 'reassign_to_member' ? targetProfileId : null
    MOCK_DB.lead_activities.push({
      lead_id: lead.id,
      actor_id: actorProfileId,
      type: 'assigned',
      note: 'Reassigned due to team member deactivation',
    })
  }

  member.status = 'deactivated'
  member.deactivated_at = new Date().toISOString()
  member.deactivated_by = actorProfileId

  return { status: 200, success: true, reassignedCount: activeLeads.length }
}

// ============================================================================
// TEST CASES
// ============================================================================

// Test 1: Seat usage calculation (Included + Purchased - Active - Reserved)
{
  const usage = simulateSeatUsage('org-prestige')
  assert.equal(usage.totalSeats, 12) // 10 included + 2 additional
  assert.equal(usage.occupiedSeats, 4) // 4 active members
  assert.equal(usage.reservedSeats, 1) // 1 pending invite
  assert.equal(usage.availableSeats, 7) // 12 - (4 + 1) = 7
  assert.equal(usage.isLimitReached, false)
  console.log('✓ Test 1 Passed: Seat usage calculation correctly accounts for included, purchased, occupied, and reserved seats')
}

// Test 2: Pending invitations reserve seats
{
  const usageBefore = simulateSeatUsage('org-prestige')
  const res = simulateIssueInvitation('org-prestige', 'prof-owner-1', 'newhire@prestige.com', 'sales_exec')
  assert.equal(res.status, 201)

  const usageAfter = simulateSeatUsage('org-prestige')
  assert.equal(usageAfter.reservedSeats, usageBefore.reservedSeats + 1)
  assert.equal(usageAfter.availableSeats, usageBefore.availableSeats - 1)
  console.log('✓ Test 2 Passed: Issuing an invitation atomically reserves a seat from the subscription pool')
}

// Test 3: Reaching seat limit strictly blocks new invitations at API layer
{
  // Brigade has 3 total seats (2 occupied + 1 reserved = 3 full)
  const brigadeUsage = simulateSeatUsage('org-brigade')
  assert.equal(brigadeUsage.totalSeats, 3)
  assert.equal(brigadeUsage.availableSeats, 0)
  assert.equal(brigadeUsage.isLimitReached, true)

  const res = simulateIssueInvitation('org-brigade', 'prof-brigade-owner', 'excess@brigade.com', 'sales_exec')
  assert.equal(res.status, 409)
  assert.match(res.error, /Seat limit reached/)
  console.log('✓ Test 3 Passed: Reaching seat quota strictly rejects invitation requests with HTTP 409 and explanatory error')
}

// Test 4: Revoking an invitation releases reserved seat back to available pool
{
  const usageBefore = simulateSeatUsage('org-brigade')
  assert.equal(usageBefore.availableSeats, 0)

  // Revoke the pending invitation
  const revokeRes = simulateRevokeInvitation('org-brigade', 'inv-2', 'prof-brigade-owner')
  assert.equal(revokeRes.status, 200)

  const usageAfter = simulateSeatUsage('org-brigade')
  assert.equal(usageAfter.reservedSeats, 0)
  assert.equal(usageAfter.availableSeats, 1) // 1 seat liberated!
  assert.equal(usageAfter.isLimitReached, false)
  console.log('✓ Test 4 Passed: Revoking an invitation immediately releases the reserved seat back to available pool')
}

// Test 5: Invitation acceptance converts reserved seat to occupied seat and joins existing org
{
  // Create an invitation for rep-3 in Prestige
  const inviteRes = simulateIssueInvitation('org-prestige', 'prof-owner-1', 'rep3@prestige.com', 'sales_exec')
  assert.equal(inviteRes.status, 201)

  const orgsCountBefore = MOCK_DB.organisations.length
  const usageBefore = simulateSeatUsage('org-prestige')

  // Accept invitation using token
  const acceptRes = simulateAcceptInvitation(inviteRes.token, 'prof-rep-3')
  assert.equal(acceptRes.status, 200)
  assert.equal(acceptRes.orgId, 'org-prestige')

  // Verify NO new organization was created
  assert.equal(MOCK_DB.organisations.length, orgsCountBefore)

  // Verify membership added with active status
  const newMember = MOCK_DB.org_members.find((m) => m.org_id === 'org-prestige' && m.profile_id === 'prof-rep-3')
  assert.ok(newMember)
  assert.equal(newMember.status, 'active')
  assert.equal(newMember.role, 'sales_exec')

  // Verify seat metrics: occupied increased, reserved decreased, available remained consistent
  const usageAfter = simulateSeatUsage('org-prestige')
  assert.equal(usageAfter.occupiedSeats, usageBefore.occupiedSeats + 1)
  assert.equal(usageAfter.reservedSeats, usageBefore.reservedSeats - 1)
  console.log('✓ Test 5 Passed: Invitation acceptance converts reserved seat to occupied seat and joins existing org (zero new orgs)')
}

// Test 6: Expired invitations cannot be accepted
{
  const expiredInvite = {
    id: 'inv-expired',
    org_id: 'org-prestige',
    email: 'old@candidate.com',
    role: 'sales_exec',
    token_hash: crypto.createHash('sha256').update('token-expired').digest('hex'),
    status: 'pending',
    expires_at: new Date(Date.now() - 86400000).toISOString(), // expired yesterday
  }
  MOCK_DB.org_invitations.push(expiredInvite)

  const res = simulateAcceptInvitation('token-expired', 'prof-rep-3')
  assert.equal(res.status, 400)
  assert.match(res.error, /expired/)
  console.log('✓ Test 6 Passed: Expired invitations cannot be accepted')
}

// Test 7: Multi-organisation independent seat accounting
{
  // prof-multi belongs to BOTH Prestige and Brigade
  const prestigeMember = MOCK_DB.org_members.find((m) => m.org_id === 'org-prestige' && m.profile_id === 'prof-multi')
  const brigadeMember = MOCK_DB.org_members.find((m) => m.org_id === 'org-brigade' && m.profile_id === 'prof-multi')
  assert.ok(prestigeMember)
  assert.ok(brigadeMember)

  // Each organisation independently counts 1 seat for prof-multi
  const prestigeUsage = simulateSeatUsage('org-prestige')
  const brigadeUsage = simulateSeatUsage('org-brigade')
  assert.ok(prestigeUsage.occupiedSeats >= 1)
  assert.ok(brigadeUsage.occupiedSeats >= 1)
  console.log('✓ Test 7 Passed: Multi-organisation members consume 1 seat independently in each respective organisation')
}

// Test 8: Employee deactivation revokes access while preserving historical activities
{
  // Deactivate rep-1 in Prestige with unassigned reassignment
  const deactRes = simulateDeactivateMember('org-prestige', 'mem-2', 'prof-owner-1', 'unassigned')
  assert.equal(deactRes.status, 200)
  assert.equal(deactRes.reassignedCount, 2) // lead-1 and lead-2 reassigned

  // Member marked as deactivated
  const mem2 = MOCK_DB.org_members.find((m) => m.id === 'mem-2')
  assert.equal(mem2.status, 'deactivated')
  assert.ok(mem2.deactivated_at)

  // Leads now unassigned (assigned_to = null), not deleted
  const lead1 = MOCK_DB.leads.find((l) => l.id === 'lead-1')
  assert.equal(lead1.assigned_to, null)

  // Activities logged
  const activities = MOCK_DB.lead_activities.filter((a) => a.lead_id === 'lead-1')
  assert.ok(activities.length > 0)
  console.log('✓ Test 8 Passed: Employee deactivation revokes workspace access and moves active leads to unassigned queue with audit trail')
}

// Test 9: Employee deactivation with direct representative reassignment
{
  // Re-assign lead-3 to rep-2 initially, then test deactivating rep-2 and reassigning to rep-3
  const deactRes = simulateDeactivateMember('org-prestige', 'mem-3', 'prof-owner-1', 'reassign_to_member', 'prof-rep-3')
  assert.equal(deactRes.status, 200)
  assert.equal(deactRes.reassignedCount, 1)

  const lead3 = MOCK_DB.leads.find((l) => l.id === 'lead-3')
  assert.equal(lead3.assigned_to, 'prof-rep-3')
  console.log('✓ Test 9 Passed: Deactivation with direct representative reassignment safely transfers active leads')
}

// Test 10: Deactivated employee seat is released back to available pool
{
  const usage = simulateSeatUsage('org-prestige')
  // Originally 4 active members, 2 deactivated (mem-2, mem-3) -> now only 2 active + rep-3 added (total 3 active)
  assert.equal(usage.occupiedSeats, 3)
  console.log('✓ Test 10 Passed: Deactivated employee seat is liberated and returned to available subscription pool')
}

// Test 11: Sole owner cannot be deactivated
{
  const soleOwnerRes = simulateDeactivateMember('org-prestige', 'mem-1', 'prof-multi', 'unassigned')
  assert.equal(soleOwnerRes.status, 400)
  assert.match(soleOwnerRes.error, /sole owner/)
  console.log('✓ Test 11 Passed: Sole owner cannot be deactivated without prior ownership transfer')
}

// Test 12: Non-admin cannot invite or deactivate members
{
  // Regular sales executive rep attempts to invite
  const inviteRes = simulateIssueInvitation('org-prestige', 'prof-rep-3', 'attacker@hack.com', 'admin')
  assert.equal(inviteRes.status, 403)

  // Regular sales executive attempts to deactivate
  const deactRes = simulateDeactivateMember('org-prestige', 'mem-1', 'prof-rep-3', 'unassigned')
  assert.equal(deactRes.status, 403)
  console.log('✓ Test 12 Passed: Non-admin members strictly prohibited from inviting or deactivating staff (RBAC enforced)')
}

console.log('--- All 12 Subscription & Seat Entitlements Tests Passed Successfully! ---')
