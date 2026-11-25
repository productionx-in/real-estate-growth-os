'use client'
// components/team/TeamManagementClient.tsx
import Link from 'next/link'
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
  KeyRound,
} from 'lucide-react'
import { formatDate, formatRelative } from '@/lib/utils/format'
import { SubscriptionSeatMeter } from './SubscriptionSeatMeter'
import { InviteMemberModal } from './InviteMemberModal'
import { DeactivateMemberModal } from './DeactivateMemberModal'
import type { SeatUsage } from '@/lib/dal/subscriptions'
import type { MemberRole } from '@/types/database'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/lib/auth/permissions'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

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
  /** Last time this person signed in (any workspace), or null if never. */
  lastSignInAt: string | null
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
  /** The signed-in person: their own row gets no actions (the server refuses them anyway). */
  currentProfileId: string
  viewerRole: MemberRole
  seatUsage: SeatUsage
  teamMembers: TeamMemberItem[]
  pendingInvitations: PendingInvitationItem[]
  orgId: string
}


const ROLE_COLORS: Record<MemberRole, string> = {
  owner: 'bg-accent-bg text-accent border-accent-border',
  admin: 'bg-brand-light text-brand border-brand/30',
  manager: 'bg-accent-bg text-accent border-accent-border',
  team_lead: 'bg-brand-light text-brand border-brand/30',
  sales_exec: 'bg-success-bg text-success border-success/30',
  post_sales: 'bg-warning-bg text-warning border-warning/30',
  readonly: 'bg-surface-hover text-muted border-default',
}

/** Roles an admin can switch a member to from this menu (owner and admin are handled elsewhere). */
const CHANGEABLE_ROLES: MemberRole[] = ['manager', 'team_lead', 'sales_exec', 'post_sales', 'readonly']

export function TeamManagementClient({
  orgSlug,
  isAdmin,
  currentProfileId,
  viewerRole,
  seatUsage,
  teamMembers,
  pendingInvitations,
  orgId,
}: TeamManagementClientProps) {
  const router = useRouter()
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [deactivateTarget, setDeactivateTarget] = useState<TeamMemberItem | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)
  const [tab, setTab] = useState<'active' | 'deactivated'>('active')
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [now] = useState(() => Date.now())
  const shown = teamMembers.filter((m) => m.status === tab)
  const deactivatedCount = teamMembers.filter((m) => m.status === 'deactivated').length

  async function handleSendReset(m: TeamMemberItem) {
    if (!confirm(`Send ${m.name} an e-mail with a link to set a new password? Their current password keeps working until they change it.`)) return
    setNotice(null)
    try {
      const res = await fetch('/api/team/members/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, memberId: m.id }) })
      const out = await res.json().catch(() => ({}))
      setNotice(res.ok ? { tone: 'success', text: `Reset e-mail sent to ${m.email}.` } : { tone: 'danger', text: out.error ?? 'Could not send the e-mail.' })
    } catch { setNotice({ tone: 'danger', text: 'Network error.' }) }
  }

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
      {isAdmin && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-semibold text-brand-foreground bg-[var(--brand)] hover:bg-[var(--brand-hover)] rounded-md transition-colors shadow-2xs"
          >
            <UserPlus className="w-4 h-4" />
            <span>Invite Team Member</span>
          </button>
        </div>
      )}

      {/* Subscription Seat Meter */}
      <SubscriptionSeatMeter seatUsage={seatUsage} orgSlug={orgSlug} isAdmin={isAdmin} />

      {/* Pending Invitations Section */}
      {pendingInvitations.length > 0 && (
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-2xs">
          <div className="px-5 py-3.5 border-b border-[var(--border)] bg-warning-bg/50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-warning" />
              <h3 className="text-[13px] font-bold text-[var(--foreground)]">Pending Invitations</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-warning-bg text-warning">
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
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-warning bg-warning-bg px-2 py-0.5 rounded-full border border-warning/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse" />
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
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-danger hover:text-danger transition-colors disabled:opacity-50"
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
            <h3 className="text-[13px] font-bold text-[var(--foreground)]">Team Members</h3>
          </div>
          <div role="tablist" aria-label="Members" className="inline-flex rounded-lg border border-default bg-surface p-0.5 text-[12px]">
            {(['active', 'deactivated'] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
                className={`min-h-8 rounded-md px-3 font-medium ${tab === t ? 'bg-brand-light text-brand' : 'text-muted hover:text-foreground'}`}>
                {t === 'active' ? 'Active' : 'Deactivated'} ({t === 'active' ? teamMembers.length - deactivatedCount : deactivatedCount})
              </button>
            ))}
          </div>
        </div>
        {notice && <div className={`border-b border-default px-5 py-2.5 text-[12px] ${notice.tone === 'success' ? 'text-success' : 'text-danger'}`} role="status">{notice.text}</div>}

        {shown.length > 0 ? (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-[11px] uppercase tracking-wide text-[var(--foreground-muted)]">
                <th className="text-left font-medium px-5 py-3">Member</th>
                <th className="text-left font-medium px-5 py-3">Role</th>
                <th className="text-left font-medium px-5 py-3">Status</th>
                <th className="text-left font-medium px-5 py-3">Contact</th>
                <th className="text-left font-medium px-5 py-3">Joined</th>
                <th className="text-left font-medium px-5 py-3">Last signed in</th>
                {isAdmin && <th className="text-right font-medium px-5 py-3">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {shown.map((m) => {
                const isDeactivated = m.status === 'deactivated'
                const isSelf = m.profileId === currentProfileId
                // Same rules as the server (lib/dal/invitations.ts): never your own row; owners only by an owner.
                const canManage = !isDeactivated && !isSelf && (m.role !== 'owner' || viewerRole === 'owner')

                return (
                  <tr key={m.id} className={`transition-colors ${isDeactivated ? 'opacity-60 bg-surface-muted/50' : 'hover:bg-[var(--surface-hover)]'}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-brand-foreground text-[11px] font-bold ${isDeactivated ? 'bg-strong' : 'bg-[var(--brand)]'}`}>
                          {m.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-[var(--foreground)] leading-tight">
                            {m.name}
                            {isSelf && <span className="ml-1.5 rounded px-1.5 py-0.5 text-[11px] font-semibold bg-surface-hover text-muted align-middle">You</span>}
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
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted bg-surface-hover px-2 py-0.5 rounded-full border border-default">
                          Deactivated
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success-bg px-2 py-0.5 rounded-full border border-success/30">
                          <CheckCircle2 className="w-3 h-3 text-success" />
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
                    <td className="px-5 py-3.5 text-[12px]">
                      {m.lastSignInAt ? (
                        <span className={now - new Date(m.lastSignInAt).getTime() > 14 * 86_400_000 ? 'text-warning' : 'text-[var(--foreground-muted)]'} title={new Date(m.lastSignInAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}>
                          {formatRelative(m.lastSignInAt)}
                        </span>
                      ) : <span className="text-subtle">Never</span>}
                    </td>
                    {isAdmin && (
                      <td className="px-5 py-3.5 text-right">
                        {isSelf && (
                          <Link href={`/${orgSlug}/settings/profile`} className="text-[12px] font-medium text-[var(--brand)] hover:underline">Your account</Link>
                        )}
                        {canManage && (
                          <DropdownMenu>
                            <DropdownMenuTrigger aria-label={`Actions for ${m.name}`}
                              className="inline-grid size-9 place-items-center rounded-md text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]">
                              <MoreVertical className="w-4 h-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" collisionPadding={12} className="w-52">
                              <DropdownMenuLabel>Change role</DropdownMenuLabel>
                              <DropdownMenuRadioGroup value={m.role} onValueChange={(r) => { if (r !== m.role) handleChangeRole(m.id, r as MemberRole) }}>
                                {CHANGEABLE_ROLES.map((r) => (
                                  <DropdownMenuRadioItem key={r} value={r} title={ROLE_DESCRIPTIONS[r]}>{ROLE_LABELS[r]}</DropdownMenuRadioItem>
                                ))}
                              </DropdownMenuRadioGroup>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onSelect={() => handleSendReset(m)}>
                                <KeyRound aria-hidden /> Send password reset e-mail
                              </DropdownMenuItem>
                              <DropdownMenuItem destructive onSelect={() => setDeactivateTarget(m)}>
                                <UserX aria-hidden /> Deactivate member
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
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
            {tab === 'active' ? 'No team members registered yet.' : 'Nobody has been deactivated.'}
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
