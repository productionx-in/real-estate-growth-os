// app/(dashboard)/[orgSlug]/team/page.tsx
import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { UserCircle } from 'lucide-react'
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

type MemberRow = {
  id: string
  role: MemberRole
  joined_at: string
  profile: {
    id: string
    full_name: string
    avatar_url: string | null
    phone: string | null
  } | null
}

export default async function TeamPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org } = await getVerifiedWorkspace(orgSlug)
  const service = createServiceClient()

  const { data: members } = await service
    .from('org_members')
    .select('id, role, joined_at, profile:profiles(id, full_name, avatar_url, phone)')
    .eq('org_id', org.id)
    .order('joined_at', { ascending: true })

  const typedMembers = (members ?? []) as unknown as MemberRow[]

  return (
    <PageShell title="Team" description="Manage workspace members and sales executive roles">
      {typedMembers.length > 0 ? (
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
                  Contact
                </th>
                <th className="text-left font-medium text-[var(--foreground-muted)] px-5 py-3 text-[11px] uppercase tracking-wide">
                  Joined
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {typedMembers.map((m) => (
                <tr key={m.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[var(--brand)] flex items-center justify-center text-white text-[11px] font-bold">
                        {m.profile?.full_name?.slice(0, 2).toUpperCase() ?? 'U'}
                      </div>
                      <span className="font-semibold text-[var(--foreground)]">
                        {m.profile?.full_name ?? 'Invited user'}
                      </span>
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
                  <td className="px-5 py-3.5 text-[var(--foreground-muted)]">
                    {m.profile?.phone ?? '—'}
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
