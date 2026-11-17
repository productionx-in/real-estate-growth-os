'use client'
// components/team/DeactivateMemberModal.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, UserX, AlertTriangle, Loader2 } from 'lucide-react'

interface ActiveMemberOption {
  profileId: string
  name: string
  role: string
}

interface DeactivateMemberModalProps {
  isOpen: boolean
  onClose: () => void
  orgSlug: string
  memberId: string
  memberName: string
  memberRole: string
  activeMembers: ActiveMemberOption[]
}

export function DeactivateMemberModal({
  isOpen,
  onClose,
  orgSlug,
  memberId,
  memberName,
  memberRole,
  activeMembers,
}: DeactivateMemberModalProps) {
  const router = useRouter()
  const [reassignmentMode, setReassignmentMode] = useState<'reassign_to_member' | 'unassigned'>('unassigned')
  const [targetProfileId, setTargetProfileId] = useState(activeMembers[0]?.profileId || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  async function handleDeactivate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/team/members/deactivate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgSlug,
          memberId,
          reassignmentMode,
          targetProfileId: reassignmentMode === 'reassign_to_member' ? targetProfileId : undefined,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to deactivate member')
        setLoading(false)
        return
      }

      onClose()
      router.refresh()
    } catch {
      setError('Network error. Failed to complete deactivation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xs">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5">
          <div className="w-10 h-10 rounded-xl bg-danger-bg border border-danger/30 flex items-center justify-center text-[var(--danger)] mb-3">
            <UserX className="w-5 h-5" />
          </div>
          <h2 className="text-[16px] font-bold text-[var(--foreground)]">Deactivate Team Member</h2>
          <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
            Revoke workspace access for <strong>{memberName}</strong> ({memberRole}).
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--danger-bg)] border border-danger/30 text-[12px] text-[var(--danger)]">
            {error}
          </div>
        )}

        <div className="mb-5 p-3.5 rounded-xl bg-warning-bg border border-warning/30 text-warning text-[12px] flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold">Historical Activity Preservation</p>
            <p className="text-[11px] text-warning leading-relaxed">
              Deactivation immediately terminates login access to this workspace and releases 1 subscription seat. All historical lead call logs, notes, past site visits, and booking attributions will remain permanently intact.
            </p>
          </div>
        </div>

        <form onSubmit={handleDeactivate} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[var(--foreground)] mb-2">
              Active Lead Reassignment
            </label>
            <div className="space-y-2">
              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                <input
                  type="radio"
                  name="reassignmentMode"
                  value="unassigned"
                  checked={reassignmentMode === 'unassigned'}
                  onChange={() => setReassignmentMode('unassigned')}
                  className="mt-0.5 text-[var(--brand)]"
                />
                <div>
                  <p className="text-[12px] font-medium text-[var(--foreground)]">Move to Unassigned Queue</p>
                  <p className="text-[11px] text-[var(--foreground-muted)]">Active leads will be available for manager triage</p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 p-3 rounded-lg border border-[var(--border)] cursor-pointer hover:bg-[var(--surface-hover)] transition-colors">
                <input
                  type="radio"
                  name="reassignmentMode"
                  value="reassign_to_member"
                  checked={reassignmentMode === 'reassign_to_member'}
                  onChange={() => setReassignmentMode('reassign_to_member')}
                  className="mt-0.5 text-[var(--brand)]"
                />
                <div className="w-full">
                  <p className="text-[12px] font-medium text-[var(--foreground)]">Reassign to Active Team Member</p>
                  <p className="text-[11px] text-[var(--foreground-muted)] mb-2">Transfer all open leads immediately to another representative</p>

                  {reassignmentMode === 'reassign_to_member' && (
                    <select
                      value={targetProfileId}
                      onChange={(e) => setTargetProfileId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[12px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none"
                    >
                      {activeMembers.map((m) => (
                        <option key={m.profileId} value={m.profileId}>
                          {m.name} ({m.role})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-[13px] font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-[var(--danger)] text-white text-[13px] font-medium rounded-md hover:bg-danger transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>{loading ? 'Deactivating…' : 'Confirm Deactivation'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
