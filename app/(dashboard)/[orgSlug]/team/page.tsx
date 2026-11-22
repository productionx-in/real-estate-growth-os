// app/(dashboard)/[orgSlug]/team/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { AlertCircle } from 'lucide-react'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getSubscriptionAndSeatUsage } from '@/lib/dal/subscriptions'
import {
  TeamManagementClient,
  type TeamMemberItem,
  type PendingInvitationItem,
} from '@/components/team/TeamManagementClient'
import type { MemberRole } from '@/types/database'
import { authDetails, listTargets, monthProgress } from '@/lib/dal/team'
import { monthKey } from '@/lib/team/targets'
import { TeamTargets } from '@/components/team/TeamTargets'

export const metadata: Metadata = { title: 'Team & Access Management' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function TeamPage({ params }: PageProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)

  // Server-authoritative check: Only managers and admins can view team management
  if (!workspace.isManager && !workspace.isAdmin) {
    redirect(`/${orgSlug}`)
  }
  const service = createServiceClient()

  // 1. Fetch subscription seat metrics
  const seatUsage = await getSubscriptionAndSeatUsage(workspace.org.id)

  // 2. Fetch organisation members
  const { data: memberRows, error: membersError } = await service
    .from('org_members')
    .select('id, org_id, profile_id, role, status, joined_at')
    .eq('org_id', workspace.org.id)
    .order('joined_at', { ascending: true })

  if (membersError) {
    return (
      <PageShell title="Team" description="Manage workspace members and sales executive roles">
        <div className="p-4 rounded-xl bg-danger-bg border border-danger/30 text-danger text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Failed to load organisation team members: {membersError.message}</span>
        </div>
      </PageShell>
    )
  }

  const members = memberRows ?? []
  const profileIds = members.map((m) => m.profile_id).filter(Boolean)

  // 3. Fetch associated user profiles
  let profileMap = new Map<string, { id: string; auth_user_id: string; full_name: string; avatar_url: string | null; phone: string | null }>()

  if (profileIds.length > 0) {
    const { data: profiles, error: profilesError } = await service
      .from('profiles')
      .select('id, auth_user_id, full_name, avatar_url, phone')
      .in('id', profileIds)

    if (profilesError) {
      console.error('Error fetching member profiles:', profilesError)
    } else if (profiles) {
      profileMap = new Map(profiles.map((p) => [p.id, p]))
    }
  }

  // 4. E-mail and last sign-in for each member, looked up per member (never listing every account on the platform).
  const userDetails = await authDetails([...profileMap.values()].map((p) => p.auth_user_id).filter(Boolean))

  // 5. Merge active and deactivated member records
  const teamMembers: TeamMemberItem[] = members.map((m) => {
    const profile = profileMap.get(m.profile_id)
    const details = profile?.auth_user_id ? userDetails.get(profile.auth_user_id) : undefined
    const email = details?.email ?? null
    const role = (m.role ?? 'readonly') as MemberRole
    const status = (m.status === 'deactivated' ? 'deactivated' : 'active') as 'active' | 'deactivated'

    return {
      id: m.id,
      profileId: m.profile_id,
      role,
      joined_at: m.joined_at,
      name: profile?.full_name ?? 'Team Member',
      email: email || '—',
      phone: profile?.phone ?? null,
      avatar_url: profile?.avatar_url ?? null,
      status,
      lastSignInAt: details?.lastSignInAt ?? null,
    }
  })

  // 6. Fetch pending invitations for this organization
  const { data: invitationRows } = await service
    .from('org_invitations')
    .select('id, email, role, created_at, expires_at, status')
    .eq('org_id', workspace.org.id)
    .eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  const pendingInvitations: PendingInvitationItem[] = (invitationRows ?? []).map((inv) => ({
    id: inv.id,
    email: inv.email,
    role: inv.role as MemberRole,
    created_at: inv.created_at,
    expires_at: inv.expires_at,
    status: 'pending',
  }))

  // 7. This month's targets and progress (owners, admins and managers set them).
  const month = monthKey()
  const [targets, progress] = await Promise.all([listTargets(workspace.org.id, month), monthProgress(workspace.org.id, month)])
  const sellers = teamMembers.filter((m) => m.status === 'active' && ['manager', 'team_lead', 'sales_exec'].includes(m.role))

  return (
    <PageShell
      title="Team & Access Management"
      description={`Manage authorized users, invitations, and subscription seats for ${workspace.org.name}`}
    >
      <TeamManagementClient
        orgSlug={orgSlug}
        orgName={workspace.org.name}
        isAdmin={workspace.isAdmin}
        isManager={workspace.isManager}
        currentProfileId={workspace.profile.id}
        viewerRole={workspace.role as MemberRole}
        seatUsage={seatUsage}
        teamMembers={teamMembers}
        pendingInvitations={pendingInvitations}
        orgId={workspace.org.id}
      />
      <div className="mt-6">
        <TeamTargets
          orgId={workspace.org.id}
          month={month}
          people={sellers.map((m) => ({
            profileId: m.profileId, name: m.name,
            targets: targets.get(m.profileId) ?? { siteVisits: null, bookings: null, bookingValue: null },
            progress: progress.get(m.profileId) ?? { siteVisits: 0, bookings: 0, bookingValue: 0 },
          }))}
        />
      </div>
    </PageShell>
  )
}
