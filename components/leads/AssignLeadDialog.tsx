'use client'
// components/leads/AssignLeadDialog.tsx
// Modal dialog for a manager to assign a lead to a sales exec.
// Fetches org members client-side. Calls /api/leads/assign.
import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, UserCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface TeamMember {
  profileId: string
  fullName: string
  role: string
}

interface AssignLeadDialogProps {
  leadId: string
  leadName: string
  currentAssigneeId: string | null
  orgId: string
  onClose: () => void
}

export function AssignLeadDialog({
  leadId,
  leadName,
  currentAssigneeId,
  orgId,
  onClose,
}: AssignLeadDialogProps) {
  const router = useRouter()
  const [members, setMembers] = useState<TeamMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(currentAssigneeId)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Load org members (sales exec and manager eligible)
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('org_members')
      .select('profile_id, role, profile:profiles(id, full_name)')
      .eq('org_id', orgId)
      .in('role', ['owner', 'admin', 'manager', 'sales_exec'])
      .order('role')
      .then(({ data }) => {
        setMembers(
          (data ?? []).map((m) => {
            const p = m.profile as { id: string; full_name: string } | null
            return {
              profileId: m.profile_id,
              fullName: p?.full_name ?? 'Unknown',
              role: m.role,
            }
          })
        )
        setLoadingMembers(false)
      })
  }, [orgId])

  async function handleAssign() {
    setError(null)
    startTransition(async () => {
      try {
        const response = await fetch('/api/leads/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId, assignToProfileId: selectedId }),
        })

        if (!response.ok) {
          const data = await response.json()
          setError(data.error ?? 'Assignment failed')
          return
        }

        router.refresh()
        onClose()
      } catch {
        setError('Network error. Please try again.')
      }
    })
  }

  const ROLE_LABEL: Record<string, string> = {
    owner: 'Owner',
    admin: 'Admin',
    manager: 'Manager',
    sales_exec: 'Sales Exec',
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-dialog-title"
      >
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-sm">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
            <div>
              <h2 id="assign-dialog-title" className="text-[14px] font-semibold text-[var(--foreground)]">
                Assign Lead
              </h2>
              <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5 truncate max-w-[220px]">
                {leadName}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-[var(--danger-bg)] text-[13px] text-[var(--danger)] border border-red-100">
                {error}
              </div>
            )}

            {loadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[var(--foreground-muted)]" />
              </div>
            ) : (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {/* Unassign option */}
                <label
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                    selectedId === null
                      ? 'border-[var(--brand)] bg-[var(--brand-light)]'
                      : 'border-transparent hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  <input
                    type="radio"
                    name="assignee"
                    checked={selectedId === null}
                    onChange={() => setSelectedId(null)}
                    className="accent-[var(--brand)]"
                  />
                  <div className="w-7 h-7 rounded-full bg-[var(--surface-hover)] flex items-center justify-center">
                    <UserCircle className="w-4 h-4 text-[var(--foreground-subtle)]" />
                  </div>
                  <span className="text-[13px] text-[var(--foreground-muted)] italic">
                    Unassigned
                  </span>
                </label>

                {/* Team members */}
                {members.map((member) => (
                  <label
                    key={member.profileId}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer border transition-colors ${
                      selectedId === member.profileId
                        ? 'border-[var(--brand)] bg-[var(--brand-light)]'
                        : 'border-transparent hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <input
                      type="radio"
                      name="assignee"
                      checked={selectedId === member.profileId}
                      onChange={() => setSelectedId(member.profileId)}
                      className="accent-[var(--brand)]"
                    />
                    <div className="w-7 h-7 rounded-full bg-[var(--brand-light)] flex items-center justify-center flex-shrink-0">
                      <span className="text-[11px] font-semibold text-[var(--brand)]">
                        {member.fullName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-[var(--foreground)] truncate">
                        {member.fullName}
                      </div>
                      <div className="text-[11px] text-[var(--foreground-muted)]">
                        {ROLE_LABEL[member.role] ?? member.role}
                      </div>
                    </div>
                    {currentAssigneeId === member.profileId && (
                      <span className="text-[11px] text-[var(--foreground-subtle)] italic flex-shrink-0">
                        Current
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 pb-5">
            <button
              onClick={onClose}
              className="flex-1 py-2 px-4 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={isPending || loadingMembers}
              className="flex-1 py-2 px-4 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isPending ? 'Assigning…' : 'Assign'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
