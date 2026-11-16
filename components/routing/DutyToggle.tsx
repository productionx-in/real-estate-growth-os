'use client'
// components/routing/DutyToggle.tsx
// Header switch that lets a salesperson take themselves off (or back on) lead routing — e.g. on a site visit.
// Only shown to members of at least one active routing team. The server only ever changes the caller's own rows.
import { useCallback, useEffect, useState } from 'react'

export function DutyToggle({ orgId }: { orgId: string }) {
  const [onDuty, setOnDuty] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/routing/duty?orgId=${encodeURIComponent(orgId)}`, { cache: 'no-store' })
      if (!res.ok) return
      const json = await res.json()
      setOnDuty(json.data.onDuty)
    } catch {
      // keep hidden on network failure
    }
  }, [orgId])

  useEffect(() => {
    const t = setTimeout(load, 0)
    return () => clearTimeout(t)
  }, [load])

  if (onDuty === null) return null

  async function toggle() {
    const next = !onDuty
    setBusy(true)
    try {
      const res = await fetch('/api/routing/duty', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, isOnDuty: next }),
      })
      if (res.ok) setOnDuty(next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={onDuty}
      onClick={toggle}
      disabled={busy}
      title={onDuty ? 'You are receiving new leads. Click to pause.' : 'You are not receiving new leads. Click to resume.'}
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-colors disabled:opacity-60 ${
        onDuty ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${onDuty ? 'bg-emerald-500' : 'bg-gray-400'}`} aria-hidden="true" />
      {onDuty ? 'On duty' : 'Off duty'}
    </button>
  )
}
