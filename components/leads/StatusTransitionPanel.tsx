'use client'
// components/leads/StatusTransitionPanel.tsx
// Shows allowed next statuses and lets user transition with an optional note.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronRight, Loader2 } from 'lucide-react'
import { LeadStatusBadge } from './LeadStatusBadge'
import type { LeadStatus } from '@/types/database'
import { cn } from '@/lib/utils/cn'

// Allowed transitions from each status
const TRANSITIONS: Partial<Record<LeadStatus, LeadStatus[]>> = {
  new: ['contacted', 'junk'],
  contacted: ['qualified', 'junk'],
  qualified: ['site_visit_scheduled', 'lost'],
  site_visit_scheduled: ['site_visited', 'lost'],
  site_visited: ['negotiation', 'lost'],
  negotiation: ['booked', 'lost'],
}

interface StatusTransitionPanelProps {
  leadId: string
  currentStatus: LeadStatus
}

export function StatusTransitionPanel({ leadId, currentStatus }: StatusTransitionPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [transitioning, setTransitioning] = useState<LeadStatus | null>(null)

  const nextStatuses = TRANSITIONS[currentStatus] ?? []
  const isTerminal = ['booked', 'lost', 'junk'].includes(currentStatus)

  async function handleTransition(to: LeadStatus) {
    setError(null)
    setTransitioning(to)

    startTransition(async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}/status`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: to, note: note.trim() || undefined }),
        })

        if (!response.ok) {
          const data = await response.json()
          setError(data.error ?? 'Status update failed')
          setTransitioning(null)
          return
        }

        setNote('')
        setTransitioning(null)
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
        <textarea
          id="statusNote"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors resize-none placeholder:text-[var(--foreground-subtle)]"
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
                  ? 'border-red-100 bg-red-50 text-red-700 hover:bg-red-100'
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
    </div>
  )
}
