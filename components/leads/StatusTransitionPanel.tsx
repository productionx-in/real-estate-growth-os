'use client'
// components/leads/StatusTransitionPanel.tsx
// Shows allowed next statuses and lets user transition with an optional note.
import { useState, useTransition } from 'react'
import { Textarea } from '@/components/ui'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2 } from 'lucide-react'
import { LeadStatusBadge } from './LeadStatusBadge'
import type { LeadStatus } from '@/types/database'
import { cn } from '@/lib/utils/cn'
import { nextStatuses as allowedNext } from '@/lib/leads/transitions'
import { CloseReasonDialog, type CloseReasons } from './CloseReasonDialog'


interface StatusTransitionPanelProps {
  leadId: string
  leadName: string
  currentStatus: LeadStatus
  /** The workspace's reasons for closing a lead (Settings → Lead settings). */
  reasons: CloseReasons
  /** Why the lead was closed, when it is Lost or Junk. */
  closedReason?: string | null
}

export function StatusTransitionPanel({ leadId, leadName, currentStatus, reasons, closedReason }: StatusTransitionPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState<LeadStatus | null>(null)
  const [closing, setClosing] = useState<'lost' | 'junk' | null>(null)

  const nextStatuses = allowedNext(currentStatus)
  const isTerminal = ['booked', 'lost', 'junk'].includes(currentStatus)

  async function handleTransition(to: LeadStatus, reason?: string, closeNote?: string) {
    // Lost and Junk ask why first.
    if ((to === 'lost' || to === 'junk') && closing !== to) { setError(null); setClosing(to); return }
    setError(null)
    setTransitioning(to)

    startTransition(async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: to, note: closeNote ?? (note.trim() || undefined), reason }),
        })

        if (!response.ok) {
          const data = await response.json()
          setError(data.error ?? 'Status update failed')
          setTransitioning(null)
          return
        }

        setNote('')
        setTransitioning(null)
        setClosing(null)
        router.refresh()
      } catch {
        setError('Network error. Please try again.')
        setTransitioning(null)
      }
    })
  }

  if (isTerminal) {
    return (
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
        <h3 className="text-[13px] font-semibold text-[var(--foreground)] mb-2">Status</h3>
        <LeadStatusBadge status={currentStatus} />
        {closedReason && <p className="mt-2 text-[13px] text-foreground">Reason: {closedReason}</p>}
        <p className="mt-2 text-[12px] text-[var(--foreground-muted)]">
          This lead has reached a final state.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
      <div>
        <h3 className="text-[13px] font-semibold text-[var(--foreground)] mb-2">Move to next stage</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <LeadStatusBadge status={currentStatus} />
        </div>
      </div>

      {error && (
        <p className="text-[12px] text-[var(--danger)]">{error}</p>
      )}

      {/* Optional note */}
      <div>
        <label htmlFor="statusNote" className="block text-[12px] font-medium text-[var(--foreground-muted)] mb-1">
          Add a note (optional)
        </label>
        <Textarea
          id="statusNote"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="focus:ring-brand-light resize-none"
          placeholder="Spoke to client, interested in 2BHK…"
        />
      </div>

      {/* Transition buttons */}
      <div className="space-y-2">
        {nextStatuses.map((to) => {
          const isLoading = isPending && transitioning === to
          return (
            <button
              key={to}
              onClick={() => handleTransition(to)}
              disabled={isPending}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-[13px] font-medium transition-colors disabled:opacity-60',
                to === 'lost' || to === 'junk'
                  ? 'border-danger/30 bg-danger-bg text-danger hover:bg-danger-bg'
                  : 'border-[var(--border)] bg-[var(--surface-hover)] text-[var(--foreground)] hover:border-[var(--brand)] hover:bg-[var(--brand-light)] hover:text-[var(--brand)]'
              )}
            >
              <div className="flex items-center gap-2">
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5" />
                )}
                <LeadStatusBadge status={to} />
              </div>
            </button>
          )
        })}
      </div>
      {closing && (
        <CloseReasonDialog open leadName={leadName} status={closing} reasons={reasons} busy={isPending} error={error}
          onCancel={() => { setClosing(null); setError(null) }}
          onConfirm={(reason, closeNote) => handleTransition(closing, reason, closeNote)} />
      )}
    </div>
  )
}
