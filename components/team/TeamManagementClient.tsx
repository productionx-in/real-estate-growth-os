'use client'
// components/team/TeamManagementClient.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Mail,
  Phone,
  UserPlus,
  Clock,
  Trash2,
  MoreVertical,
  UserX,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react'
import { formatDate } from '@/lib/utils/format'
import { SubscriptionSeatMeter } from './SubscriptionSeatMeter'
import { InviteMemberModal } from './InviteMemberModal'
import { DeactivateMemberModal } from './DeactivateMemberModal'
import type { SeatUsage } from '@/lib/dal/subscriptions'
import type { MemberRole } from '@/types/database'

export interface TeamMemberItem {
  id: string
  profileId: string
  role: MemberRole
  joined_at: string
  name: string
  email: string
  phone: string | null
  avatar_url: string | null
  status: 'active' | 'deactivated'
}

export interface PendingInvitationItem {
  id: string
  email: string
  role: MemberRole
  created_at: string
  expires_at: string
  status: 'pending'
}

interface TeamManagementClientProps {
  orgSlug: string
  orgName: string
  isAdmin: boolean
  isManager: boolean
  seatUsage: SeatUsage
  teamMembers: TeamMemberItem[]
  pendingInvitations: PendingInvitationItem[]
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

export function TeamManagementClient({
  orgSlug,
  orgName,
  isAdmin,
  seatUsage,
  teamMembers,
  pendingInvitations,
}: TeamManagementClientProps) {
  const router = useRouter()
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<TeamMemberItem | null>(null)
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  const activeMembersList = teamMembers
    .filter((m) => m.status === 'active')
    .map((m) => ({ profileId: m.profileId, name: m.name, role: ROLE_LABELS[m.role] }))

  async function handleRevokeInvite(invitationId: string) {
    if (!confirm('Are you sure you want to revoke this invitation and release the reserved seat?')) return
    setRevokingId(invitationId)
    try {
      const res = await fetch('/api/team/invitations/revoke', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgSlug, invitationId }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        alert('Failed to revoke invitation.')
      }
    } catch {
      alert('Network error.')
    } finally {
      setRevokingId(null)
    }
  }

  async function handleChangeRole(memberId: string, newRole: MemberRole) {
    setActiveMenuId(null)
    try {
      const res = await fetch('/api/team/members/role', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgSlug, memberId, role: newRole }),
      })
      if (res.ok) {
        router.refresh()
      } else {
        alert('Failed to update role.')
      }
    } catch {
      alert('Network error.')
    }
  }

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--foreground)] tracking-tight">
            Team &amp; Access Management
          </h2>
          <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
            Manage authorized staff, sales executive assignments, and subscription seat entitlements for {orgName}.
          </p>
        </div>

        {isAdmin && (
          <button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-md transition-colors shadow-2xs self-start sm:self-auto"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Team Member</span>
          </button>
        )}
      </div>

      {/* Subscription Seat Meter */}
      <SubscriptionSeatMeter seatUsage={seatUsage} orgSlug={orgSlug} isAdmin={isAdmin} />

      {/* Pending Invitations Section */}
      {pendingInvitations.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xs">
          <div className="px-5 py-3.5 border-b border-[var(--border)] bg-amber-50/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-600" />
              <h3 className="text-[13px] font-bold text-[var(--foreground)]">Pending Invitations</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                {pendingInvitations.length} Reserved Seat{pendingInvitations.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-[11px] text-[var(--foreground-muted)]">
              Seats are reserved until invitation acceptance or revocation
            </p>
          </div>

          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-[11px] uppercase tracking-wide text-[var(--foreground-muted)]">
                <th className="text-left font-medium px-5 py-2.5">Invited Email</th>
                <th className="text-left font-medium px-5 py-2.5">Assigned Role</th>
                <th className="text-left font-medium px-5 py-2.5">Status</th>
                <th className="text-left font-medium px-5 py-2.5">Expires</th>
                {isAdmin && <th className="text-right font-medium px-5 py-2.5">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {pendingInvitations.map((inv) => (
                <tr key={inv.id} className="hover:bg-[var(--surface-hover)] transition-colors">
                  <td className="px-5 py-3 font-medium text-[var(--foreground)] flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                    <span>{inv.email}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${ROLE_COLORS[inv.role] ?? ''}`}>
                      {ROLE_LABELS[inv.role] ?? inv.role}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                      Pending Acceptance
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-[var(--foreground-muted)]">
                    {formatDate(inv.expires_at)}
                  </td>
                  {isAdmin && (
                    <td className="px-5 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => handleRevokeInvite(inv.id)}
                        disabled={revokingId === inv.id}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 hover:text-red-800 transition-colors disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>{revokingId === inv.id ? 'Revoking…' : 'Revoke'}</span>
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Active Team Members Table */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 border-b border-[var(--border)] bg-[var(--surface-hover)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--brand)]" />
            <h3 className="text-[13px] font-bold text-[var(--foreground)]">Active Team Members</h3>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[var(--brand)] border border-blue-200">
              {teamMembers.filter((m) => m.status === 'active').length} Active
            </span>
          </div>
        </div>

        {teamMembers.length > 0 ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-[11px] uppercase tracking-wide text-[var(--foreground-muted)]">
                <th className="text-left font-medium px-5 py-3">Member</th>
                <th className="text-left font-medium px-5 py-3">Role</th>
                <th className="text-left font-medium px-5 py-3">Status</th>
                <th className="text-left font-medium px-5 py-3">Contact</th>
                <th className="text-left font-medium px-5 py-3">Joined</th>
                {isAdmin && <th className="text-right font-medium px-5 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {teamMembers.map((m) => {
                const isDeactivated = m.status === 'deactivated'
                const isMenuOpen = activeMenuId === m.id

                return (
                  <tr key={m.id} className={`transition-colors ${isDeactivated ? 'opacity-60 bg-gray-50/50' : 'hover:bg-[var(--surface-hover)]'}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold ${isDeactivated ? 'bg-gray-400' : 'bg-[var(--brand)]'}`}>
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
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${ROLE_COLORS[m.role] ?? ''}`}>
                        {ROLE_LABELS[m.role] ?? m.role}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      {isDeactivated ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                          Deactivated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                          Active
                        </span>
                      )}
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
                    {isAdmin && (
                      <td className="px-5 py-3.5 text-right relative">
                        {!isDeactivated && (
                          <div className="inline-block text-left">
                            <button
                              type="button"
                              onClick={() => setActiveMenuId(isMenuOpen ? null : m.id)}
                              className="p-1 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface-hover)]"
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                              <div className="absolute right-5 mt-1 w-44 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg z-20 py-1 text-left text-[12px]">
                                <div className="px-3 py-1 text-[10px] uppercase font-bold text-[var(--foreground-subtle)]">
                                  Change Role
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleChangeRole(m.id, 'sales_exec')}
                                  className="w-full px-3 py-1.5 hover:bg-[var(--surface-hover)] text-left"
                                >
                                  Sales Executive
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleChangeRole(m.id, 'manager')}
                                  className="w-full px-3 py-1.5 hover:bg-[var(--surface-hover)] text-left"
                                >
                                  Sales Manager
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleChangeRole(m.id, 'readonly')}
                                  className="w-full px-3 py-1.5 hover:bg-[var(--surface-hover)] text-left"
                                >
                                  Read Only
                                </button>
                                <div className="my-1 border-t border-[var(--border)]" />
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActiveMenuId(null)
                                    setDeactivateTarget(m)
                                  }}
                                  className="w-full px-3 py-1.5 text-red-600 hover:bg-red-50 text-left flex items-center gap-1.5"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  <span>Deactivate Member</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center text-[var(--foreground-muted)] text-[13px]">
            No team members registered yet.
          </div>
        )}
      </div>

      {/* Connected Modals */}
      <InviteMemberModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        orgSlug={orgSlug}
        seatUsage={seatUsage}
      />

      {deactivateTarget && (
        <DeactivateMemberModal
          isOpen={true}
          onClose={() => setDeactivateTarget(null)}
          orgSlug={orgSlug}
          memberId={deactivateTarget.id}
          memberName={deactivateTarget.name}
          memberRole={ROLE_LABELS[deactivateTarget.role] ?? deactivateTarget.role}
          activeMembers={activeMembersList.filter((m) => m.profileId !== deactivateTarget.profileId)}
        />
      )}
    </div>
  )
}
