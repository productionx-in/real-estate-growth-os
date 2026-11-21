'use client'
// components/account/DailyReportToggle.tsx — turn the 8 AM daily report e-mail on or off for yourself.
import { useState } from 'react'
import { Alert } from '@/components/ui'

export function DailyReportToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const toggle = async () => {
    const next = !on
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/account/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dailyReport: next }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Could not save your choice.')
      setOn(next); setMsg({ tone: 'success', text: next ? 'Daily report turned on.' : 'Daily report turned off.' })
    } catch (e) { setMsg({ tone: 'danger', text: (e as Error).message }) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-4 rounded-lg border border-default p-3">
        <div>
          <p className="text-[14px] font-medium">Daily report</p>
          <p className="text-[12px] text-muted">Each morning at 8 AM: your new leads, who to call first, follow-ups and site visits. Owners, admins and managers also get the team’s numbers.</p>
        </div>
        <button type="button" role="switch" aria-checked={on} aria-label="Daily report e-mail" onClick={() => void toggle()} disabled={busy}
          className={`relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${on ? 'bg-brand' : 'bg-surface-hover border border-default'}`}>
          <span className={`inline-block size-5 rounded-full bg-surface shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0.5'}`} />
        </button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  )
}
