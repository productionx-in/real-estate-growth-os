'use client'
// components/leads/ActivityLog.tsx
// Displays the immutable activity history for a lead.
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MessageSquare, Loader2, ArrowRight, User, Plus } from 'lucide-react'
import { formatRelative } from '@/lib/utils/format'
import type { ActivityType } from '@/types/database'

type Activity = {
  id: string
  type: ActivityType
  note: string | null
  metadata: Record<string, unknown>
  created_at: string
  actor: { id: string; full_name: string } | null
}

interface ActivityLogProps {
  leadId: string
  activities: Activity[]
}

const ACTIVITY_ICONS: Partial<Record<ActivityType, React.ReactNode>> = {
  created: <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center"><Plus className="w-3 h-3 text-blue-600" /></div>,
  note_added: <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center"><MessageSquare className="w-3 h-3 text-gray-600" /></div>,
  status_changed: <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center"><ArrowRight className="w-3 h-3 text-indigo-600" /></div>,
  assigned: <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center"><User className="w-3 h-3 text-green-600" /></div>,
}

function ActivityItem({ activity }: { activity: Activity }) {
  const icon = ACTIVITY_ICONS[activity.type] ?? (
    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
      <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
    </div>
  )

  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0 pb-4 border-b border-[var(--border)] last:border-0 last:pb-0">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[13px] font-medium text-[var(--foreground)]">
            {activity.actor?.full_name ?? 'System'}
          </span>
          <span className="text-[11px] text-[var(--foreground-subtle)] flex-shrink-0">
            {formatRelative(activity.created_at)}
          </span>
        </div>
        <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
          {activity.note ?? activityDescription(activity)}
        </p>
      </div>
    </div>
  )
}

function activityDescription(activity: Activity): string {
  const meta = activity.metadata
  switch (activity.type) {
    case 'status_changed':
      return `Status changed from ${meta.from ?? '?'} → ${meta.to ?? '?'}`
    case 'assigned':
      return meta.new_assignee ? 'Lead assigned to team member' : 'Lead unassigned'
    case 'created':
      return `Lead created via ${meta.source ?? 'unknown'}`
    default:
      return activity.type.replace('_', ' ')
  }
}

export function ActivityLog({ leadId, activities: initialActivities }: ActivityLogProps) {
  const router = useRouter()
  const [note, setNote] = useState('')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  async function handleAddNote(e: React.FormEvent) {
    e.preventDefault()
    if (!note.trim()) return
    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch(`/api/leads/${leadId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ note: note.trim() }),
        })

        if (!response.ok) {
          const data = await response.json()
          setError(data.error ?? 'Failed to add note')
          return
        }

        setNote('')
        router.refresh()
      } catch {
        setError('Network error')
      }
    })
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
      <h3 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">Activity</h3>

      {/* Add note */}
      <form onSubmit={handleAddNote} className="mb-5">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors resize-none placeholder:text-[var(--foreground-subtle)]"
          placeholder="Add a note about this lead…"
        />
        {error && <p className="mt-1 text-[12px] text-[var(--danger)]">{error}</p>}
        <div className="flex justify-end mt-2">
          <button
            type="submit"
            disabled={isPending || !note.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isPending && <Loader2 className="w-3 h-3 animate-spin" />}
            {isPending ? 'Adding…' : 'Add note'}
          </button>
        </div>
      </form>

      {/* Timeline */}
      {initialActivities.length > 0 ? (
        <div className="space-y-3">
          {initialActivities.map((a) => (
            <ActivityItem key={a.id} activity={a as Activity} />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-[var(--foreground-subtle)] text-center py-6">
          No activity yet
        </p>
      )}
    </div>
  )
}
