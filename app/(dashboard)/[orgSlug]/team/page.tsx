// app/(dashboard)/[orgSlug]/team/page.tsx
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { EmptyState } from '@/components/shared/EmptyState'
import { UserCircle } from 'lucide-react'
import { formatDate } from '@/lib/utils/format'
import type { MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'Team' }

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
  owner: 'bg-purple-50 text-purple-700',
  admin: 'bg-blue-50 text-blue-700',
  manager: 'bg-indigo-50 text-indigo-700',
  sales_exec: 'bg-green-50 text-green-700',
  readonly: 'bg-gray-100 text-gray-600',
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
  const supabase = await createClient()

  const { data: org } = await supabase
    .from('organisations')
    .select('id')
    .eq('slug', orgSlug)
    .single()

  if (!org) return null

  const { data: members } = await supabase
    .from('org_members')
    .select('id, role, joined_at, profile:profiles(id, full_name, avatar_url, phone)')
    .eq('org_id', org.id)
    .order('joined_at', { ascending: true })

  const typedMembers = (members ?? []) as unknown as MemberRow[]

  return (
    <PageShell title="Team" description="Manage workspace members and roles">
      {typedMembers.length > 0 ? (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">Member</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">Role</th>
                <th className="text-left px-4 py-2.5 font-medium text-[var(--foreground-muted)]">Joined</th>
              </tr>
            </thead>
            <tbody>
              {typedMembers.map((member) => (
                <tr key={member.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[var(--brand-light)] flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-semibold text-[var(--brand)]">
                          {member.profile?.full_name?.charAt(0)?.toUpperCase() ?? '?'}
                        </span>
                      </div>
                      <div>
                        <div className="font-medium text-[var(--foreground)]">
                          {member.profile?.full_name ?? 'Unknown'}
                        </div>
                        {member.profile?.phone && (
                          <div className="text-[11px] text-[var(--foreground-subtle)]">
                            {member.profile.phone}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        ROLE_COLORS[member.role] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {ROLE_LABELS[member.role] ?? member.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[var(--foreground-muted)]">
                    {formatDate(member.joined_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          icon={UserCircle}
          title="No team members"
          description="Invite your team members to collaborate."
        />
      )}
    </PageShell>
  )
}
