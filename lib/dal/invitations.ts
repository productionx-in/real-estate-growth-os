// lib/dal/invitations.ts
// Production X: Employee Invitation & Lifecycle Management Engine
import crypto from 'node:crypto'
import { createServiceClient } from '@/lib/supabase/server'
import { getSubscriptionAndSeatUsage } from './subscriptions'
import type { MemberRole } from '@/types/database'

export interface EmployeeInvitation {
  id: string
  org_id: string
  email: string
  role: MemberRole
  invited_by: string
  token_hash: string
  status: 'pending' | 'accepted' | 'expired' | 'revoked'
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  created_at: string
}

export interface ValidatedInvitation {
  invitationId: string
  orgId: string
  orgName: string
  orgSlug: string
  orgType: 'developer' | 'channel_partner'
  email: string
  role: MemberRole
  inviterName: string
  expiresAt: string
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex')
}

export async function createEmployeeInvitation(
  orgId: string,
  inviterProfileId: string,
  email: string,
  role: MemberRole,
  expiresInDays: number = 7
): Promise<{ success: boolean; invitation?: EmployeeInvitation; plaintextToken?: string; error?: string }> {
  const service = createServiceClient()
  const normalizedEmail = email.trim().toLowerCase()

  // 1. Verify seat availability
  const seatUsage = await getSubscriptionAndSeatUsage(orgId)
  if (seatUsage.availableSeats <= 0) {
    return {
      success: false,
      error: `Seat limit reached (${seatUsage.totalSeats} seats total). Your organisation has occupied ${seatUsage.occupiedSeats} seats and reserved ${seatUsage.reservedSeats} seats. Please upgrade plan or purchase additional seats.`,
    }
  }

  // 2. Check if user is already an active member in this organisation
  const { data: existingProfile } = await service
    .from('profiles')
    .select('id, auth_user_id')
    .eq('id', inviterProfileId)
    .single()

  // Find if profile with that email exists
  const { data: authUsers } = await service.auth.admin.listUsers({ perPage: 1000 })
  const targetAuthUser = authUsers?.users?.find((u) => u.email?.toLowerCase() === normalizedEmail)

  if (targetAuthUser) {
    const { data: targetProfile } = await service
      .from('profiles')
      .select('id')
      .eq('auth_user_id', targetAuthUser.id)
      .maybeSingle()

    if (targetProfile) {
      const { data: activeMembership } = await service
        .from('org_members')
        .select('id, status')
        .eq('org_id', orgId)
        .eq('profile_id', targetProfile.id)
        .maybeSingle()

      if (activeMembership && activeMembership.status === 'active') {
        return { success: false, error: 'User is already an active member of this organisation.' }
      }
    }
  }

  // 3. Check for existing active pending invitation for this email in this org
  const { data: existingInvite } = await service
    .from('org_invitations')
    .select('id')
    .eq('org_id', orgId)
    .eq('email', normalizedEmail)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existingInvite) {
    return { success: false, error: 'An active pending invitation has already been sent to this email.' }
  }

  // 4. Generate cryptographically secure token
  const plaintextToken = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashInvitationToken(plaintextToken)
  const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString()

  // 5. Insert invitation record
  const { data: invitation, error: insertError } = await service
    .from('org_invitations')
    .insert({
      org_id: orgId,
      email: normalizedEmail,
      role,
      invited_by: existingProfile?.id || inviterProfileId,
      token_hash: tokenHash,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select()
    .single()

  if (insertError || !invitation) {
    console.error('Failed to create invitation record:', insertError)
    return { success: false, error: insertError?.message || 'Failed to create invitation record' }
  }

  return {
    success: true,
    invitation: invitation as EmployeeInvitation,
    plaintextToken,
  }
}

export async function validateInvitationToken(token: string): Promise<ValidatedInvitation | null> {
  const service = createServiceClient()
  const tokenHash = hashInvitationToken(token)

  const { data: invite, error } = await service
    .from('org_invitations')
    .select(`
      id, org_id, email, role, expires_at, status,
      organisation:organisations(id, name, slug, type),
      inviter:profiles!org_invitations_invited_by_fkey(full_name)
    `)
    .eq('token_hash', tokenHash)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (error || !invite || !invite.organisation) {
    return null
  }

  const org = Array.isArray(invite.organisation) ? invite.organisation[0] : invite.organisation
  const inviter = Array.isArray(invite.inviter) ? invite.inviter[0] : invite.inviter

  return {
    invitationId: invite.id,
    orgId: org.id,
    orgName: org.name,
    orgSlug: org.slug,
    orgType: org.type,
    email: invite.email,
    role: invite.role as MemberRole,
    inviterName: inviter?.full_name || 'An Organisation Administrator',
    expiresAt: invite.expires_at,
  }
}

export async function acceptEmployeeInvitation(
  token: string,
  userProfileId: string
): Promise<{ success: boolean; orgSlug?: string; error?: string }> {
  const service = createServiceClient()
  const tokenHash = hashInvitationToken(token)

  // 1. Verify invitation is valid, pending, and not expired
  const { data: invite, error: fetchError } = await service
    .from('org_invitations')
    .select('id, org_id, role, status, expires_at, organisation:organisations(slug)')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  if (fetchError || !invite) {
    return { success: false, error: 'Invalid or non-existent invitation token.' }
  }

  if (invite.status !== 'pending') {
    return { success: false, error: `This invitation has already been ${invite.status}.` }
  }

  if (new Date(invite.expires_at) < new Date()) {
    await service.from('org_invitations').update({ status: 'expired' }).eq('id', invite.id)
    return { success: false, error: 'This invitation link has expired. Please ask your administrator to send a new invitation.' }
  }

  const org = Array.isArray(invite.organisation) ? invite.organisation[0] : invite.organisation

  // 2. Link member to existing organisation (or reactivate if previously deactivated)
  const { data: existingMembership } = await service
    .from('org_members')
    .select('id, status')
    .eq('org_id', invite.org_id)
    .eq('profile_id', userProfileId)
    .maybeSingle()

  if (existingMembership) {
    // Reactivate and update role
    await service
      .from('org_members')
      .update({
        role: invite.role,
        status: 'active',
        deactivated_at: null,
        deactivated_by: null,
      })
      .eq('id', existingMembership.id)
  } else {
    // Insert new membership
    const { error: insertMemberErr } = await service.from('org_members').insert({
      org_id: invite.org_id,
      profile_id: userProfileId,
      role: invite.role,
      status: 'active',
    })

    if (insertMemberErr) {
      console.error('Error inserting org_members on invite acceptance:', insertMemberErr)
      return { success: false, error: 'Failed to join organisation.' }
    }
  }

  // 3. Mark invitation as accepted (converts reserved seat to occupied seat)
  await service
    .from('org_invitations')
    .update({
      status: 'accepted',
      accepted_at: new Date().toISOString(),
      accepted_by: userProfileId,
    })
    .eq('id', invite.id)

  return { success: true, orgSlug: org?.slug }
}

export async function revokeEmployeeInvitation(
  orgId: string,
  invitationId: string,
  actorProfileId: string
): Promise<{ success: boolean; error?: string }> {
  const service = createServiceClient()

  // Verify actor has permission in org
  const { data: actorMembership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('profile_id', actorProfileId)
    .maybeSingle()

  if (!actorMembership || !['owner', 'admin'].includes(actorMembership.role)) {
    return { success: false, error: 'Insufficient permissions. Only owners and administrators can revoke invitations.' }
  }

  const { error } = await service
    .from('org_invitations')
    .update({ status: 'revoked', updated_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('org_id', orgId)
    .eq('status', 'pending')

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export interface DeactivationOptions {
  orgId: string
  memberId: string
  actorProfileId: string
  reassignmentMode: 'reassign_to_member' | 'unassigned'
  targetProfileId?: string
}

export async function deactivateMember(options: DeactivationOptions): Promise<{ success: boolean; error?: string; reassignedCount?: number }> {
  const { orgId, memberId, actorProfileId, reassignmentMode, targetProfileId } = options
  const service = createServiceClient()

  // 1. Verify actor is owner or admin
  const { data: actorMembership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('profile_id', actorProfileId)
    .maybeSingle()

  if (!actorMembership || !['owner', 'admin'].includes(actorMembership.role)) {
    return { success: false, error: 'Only owners and administrators can deactivate members.' }
  }

  // 2. Fetch target member
  const { data: targetMember } = await service
    .from('org_members')
    .select('id, profile_id, role, status')
    .eq('id', memberId)
    .eq('org_id', orgId)
    .single()

  if (!targetMember) {
    return { success: false, error: 'Member not found in this organisation.' }
  }

  // Prevent self-deactivation or deactivation of sole owner
  if (targetMember.profile_id === actorProfileId) {
    return { success: false, error: 'You cannot deactivate your own account.' }
  }

  if (targetMember.role === 'owner') {
    const { count: ownerCount } = await service
      .from('org_members')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('role', 'owner')
      .eq('status', 'active')

    if ((ownerCount ?? 0) <= 1) {
      return { success: false, error: 'Cannot deactivate the sole owner of the organisation. Please transfer ownership first.' }
    }
  }

  // 3. Reassign active leads if any
  let reassignedCount = 0
  const { data: activeLeads } = await service
    .from('leads')
    .select('id')
    .eq('org_id', orgId)
    .eq('assigned_to', targetMember.profile_id)
    .not('status', 'in', '("booked","lost","junk")')

  if (activeLeads && activeLeads.length > 0) {
    const leadIds = activeLeads.map((l) => l.id)
    const newAssignee = reassignmentMode === 'reassign_to_member' ? targetProfileId || null : null

    // Update leads
    await service
      .from('leads')
      .update({ assigned_to: newAssignee, updated_at: new Date().toISOString() })
      .in('id', leadIds)

    // Log reassignment activity for each lead
    const activityEntries = leadIds.map((leadId) => ({
      lead_id: leadId,
      actor_id: actorProfileId,
      type: 'assigned' as const,
      note: newAssignee
        ? `Lead reassigned due to team member deactivation.`
        : `Lead moved to unassigned queue due to team member deactivation.`,
    }))

    await service.from('lead_activities').insert(activityEntries)
    reassignedCount = leadIds.length
  }

  // 4. Update member record to deactivated
  const { error: deactivateErr } = await service
    .from('org_members')
    .update({
      status: 'deactivated',
      deactivated_at: new Date().toISOString(),
      deactivated_by: actorProfileId,
    })
    .eq('id', memberId)

  if (deactivateErr) {
    return { success: false, error: deactivateErr.message }
  }

  return { success: true, reassignedCount }
}

export async function changeMemberRole(
  orgId: string,
  memberId: string,
  newRole: MemberRole,
  actorProfileId: string
): Promise<{ success: boolean; error?: string }> {
  const service = createServiceClient()

  // Verify actor is owner or admin
  const { data: actorMembership } = await service
    .from('org_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('profile_id', actorProfileId)
    .maybeSingle()

  if (!actorMembership || !['owner', 'admin'].includes(actorMembership.role)) {
    return { success: false, error: 'Only owners and administrators can change member roles.' }
  }

  const { error } = await service
    .from('org_members')
    .update({ role: newRole })
    .eq('id', memberId)
    .eq('org_id', orgId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
