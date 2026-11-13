// app/(dashboard)/[orgSlug]/team/page.tsx
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { UserCircle, AlertCircle, Mail, Phone } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import type { MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'Team' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

const ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  sales_exec: 'Sales Executive',
  readonly: 'Read Only',
}

const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'bg-purple-50 text-purple-700 border-purple-200',
  admin: 'bg-blue-50 text-blue-700 border-blue-200',
  manager: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sales_exec: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  readonly: 'bg-gray-100 text-gray-600 border-gray-200',
}

interface TeamMemberItem {
  id: string
  role: MemberRole
  joined_at: string
  name: string
  email: string
  phone: string | null
  avatar_url: string | null
  status: 'Active'
}

export default async function TeamPage({ params }: PageProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)
  const service = createServiceClient()

  // 1. Fetch organisation members
  const { data: memberRows, error: membersError } = await service
    .from('org_members')
    .select('id, org_id, profile_id, role, joined_at')
    .eq('org_id', workspace.org.id)
    .order('joined_at', { ascending: true })

  // Guard against query errors: never silently show an empty state on error
  if (membersError) {
    return (
      <PageShell title="Team" description="Manage workspace members and sales executive roles">
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Failed to load organisation team members: {membersError.message}</span>
        </div>
      </PageShell>
    )
  }

  const members = memberRows ?? []
  const profileIds = members.map((m) => m.profile_id).filter(Boolean)

  // 2. Fetch associated user profiles
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

  // 3. Resolve user emails via auth admin list
  let userEmailMap = new Map<string, string>()
  try {
    const { data: authData } = await service.auth.admin.listUsers({ perPage: 1000 })
    if (authData?.users) {
      userEmailMap = new Map(authData.users.map((u) => [u.id, u.email ?? '']))
    }
  } catch (err) {
    console.error('Could not list auth users for emails:', err)
  }

  // 4. Merge records
  const teamMembers: TeamMemberItem[] = members.map((m) => {
    const profile = profileMap.get(m.profile_id)
    const email = profile?.auth_user_id ? userEmailMap.get(profile.auth_user_id) : null
    const role = (m.role ?? 'readonly') as MemberRole

    return {
      id: m.id,
      role,
      joined_at: m.joined_at,
      name: profile?.full_name ?? 'Team Member',
      email: email || '—',
      phone: profile?.phone ?? null,
      avatar_url: profile?.avatar_url ?? null,
      status: 'Active',
    }
  })

  return (
    <PageShell
      title="Team"
      description={`${teamMembers.length} active member${teamMembers.length === 1 ? '' : 's'} in ${workspace.org.name}`}
    >
      {teamMembers.length > 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xs">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                <th className="text-left font-medium text-[var(--foreground-muted)] px-5 py-3 text-[11px] uppercase tracking-wide">
                  Member
                </th>
                <th className="text-left font-medium text-[var(--foreground-muted)] px-5 py-3 text-[11px] uppercase tracking-wide">
                  Role
                </th>
                <th className="text-left font-medium text-[var(--foreground-muted)] px-5 py-3 text-[11px] uppercase tracking-wide">
                  Status
                </th>
                <th className="text-left font-medium text-[var(--foreground-muted)] px-5 py-3 text-[11px] uppercase tracking-wide">
                  Contact
                </th>
                <th className="text-left font-medium text-[var(--foreground-muted)] px-5 py-3 text-[11px] uppercase tracking-wide">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {teamMembers.map((m) => (
                <tr key={m.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--brand)] flex items-center justify-center text-white text-[11px] font-bold">
                        {m.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-semibold text-[var(--foreground)] leading-tight">
                          {m.name}
                        </p>
                        <p className="text-[11px] text-[var(--foreground-muted)] flex items-center gap-1 mt-0.5">
                          <Mail className="w-3 h-3 text-[var(--foreground-subtle)]" />
                          {m.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${
                        ROLE_COLORS[m.role] ?? ''
                      }`}
                    >
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {m.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-[var(--foreground-muted)]">
                    {m.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-[var(--foreground-subtle)]" />
                        {m.phone}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-[var(--foreground-muted)] text-[12px]">
                    {formatDate(m.joined_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={UserCircle}
          title="No team members yet"
          description="Invite sales executives and managers to your workspace."
        />
      )}
    </PageShell>
  )
}
