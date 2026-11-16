'use client'
// components/routing/ResponseSettingsCard.tsx
// Response rules: how fast a new lead must be contacted, when to nudge, working hours, and whether a missed
// lead moves to the next team member. Saved through PUT /api/routing/response-settings (manager+ only).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Timer } from 'lucide-react'

export interface ResponseSettings {
  first_response_minutes: number
  nudge_minutes: number
  reassign_on_breach: boolean
  workday_start: string
  workday_end: string
}

const input = 'w-full px-2.5 py-1.5 text-[12px] rounded-lg border border-[var(--border)] bg-[var(--surface)] focus:outline-none focus:ring-2 focus:ring-blue-200'

export function ResponseSettingsCard({ orgId, initial }: { orgId: string; initial: ResponseSettings }) {
  const router = useRouter()
  const [v, setV] = useState({
    first: initial.first_response_minutes,
    nudge: initial.nudge_minutes,
    reassign: initial.reassign_on_breach,
    start: initial.workday_start.slice(0, 5),
    end: initial.workday_end.slice(0, 5),
  })
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setState('saving'); setError(null)
    const res = await fetch('/api/routing/response-settings', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, firstResponseMinutes: v.first, nudgeMinutes: v.nudge, reassignOnBreach: v.reassign, workdayStart: v.start, workdayEnd: v.end }),
    }).catch(() => null)
    if (res?.ok) { setState('saved'); router.refresh(); return }
    const j = await res?.json().catch(() => ({}))
    const field = j?.details?.fieldErrors ? Object.values(j.details.fieldErrors as Record<string, string[]>).flat()[0] : null
    setError(field || j?.error || 'Could not save')
    setState('idle')
  }

  return (
    <section aria-labelledby="response-heading" className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs">
      <h2 id="response-heading" className="text-[13px] font-semibold flex items-center gap-2"><Timer className="w-4 h-4" /> Response rules</h2>
      <p className="text-[12px] text-[var(--foreground-muted)] mt-1 mb-4">
        Every new lead starts a clock when it is assigned. The salesperson is nudged before it runs out; if nobody calls in time, managers are alerted.
        The clock only counts working hours — a lead at 11 PM is due shortly after the day starts.
      </p>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-end">
        <label className="text-[12px] font-medium flex flex-col gap-1">First call within (minutes)
          <input type="number" min={1} max={240} className={input} value={v.first} onChange={(e) => { setV({ ...v, first: Number(e.target.value) }); setState('idle') }} />
        </label>
        <label className="text-[12px] font-medium flex flex-col gap-1">Nudge after (minutes)
          <input type="number" min={1} max={239} className={input} value={v.nudge} onChange={(e) => { setV({ ...v, nudge: Number(e.target.value) }); setState('idle') }} />
        </label>
        <label className="text-[12px] font-medium flex flex-col gap-1">Working day starts
          <input type="time" className={input} value={v.start} onChange={(e) => { setV({ ...v, start: e.target.value }); setState('idle') }} />
        </label>
        <label className="text-[12px] font-medium flex flex-col gap-1">Working day ends
          <input type="time" className={input} value={v.end} onChange={(e) => { setV({ ...v, end: e.target.value }); setState('idle') }} />
        </label>
        <label className="sm:col-span-2 lg:col-span-3 text-[12px] flex items-start gap-2">
          <input type="checkbox" className="mt-0.5" checked={v.reassign} onChange={(e) => { setV({ ...v, reassign: e.target.checked }); setState('idle') }} />
          <span><span className="font-medium">Move missed leads to the next person in the team.</span>{' '}
            <span className="text-[var(--foreground-muted)]">Applies to leads routed by a rule; the next available, on-duty member gets it and a fresh clock starts.</span></span>
        </label>
        <div className="flex items-center gap-3 lg:justify-end">
          {state === 'saved' && <span className="text-[12px] text-emerald-700">Saved</span>}
          <button type="submit" disabled={state === 'saving'} className="px-4 py-1.5 text-[12px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">Save rules</button>
        </div>
      </form>
      {error && <p role="alert" className="mt-3 text-[12px] text-red-700">{error}</p>}
    </section>
  )
}
