'use client'
// components/settings/VisitMatchingForms.tsx — Settings → Site visits (buyer messages, check-in distance, daily
// limit) and Settings → Matching rules (budget margin, minimum match, suggestions). Owners and admins; the server
// validates and authorises (app/api/settings/workspace).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Select } from '@/components/ui'
import { normaliseSection, type MatchingSettings, type VisitSettings } from '@/lib/settings/workspace'

function useSave(orgId: string, section: 'visits' | 'matching') {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  async function save(value: unknown, done: string) {
    const first = Object.values(normaliseSection(section, value).errors)[0]
    if (first) { setMessage({ tone: 'danger', text: first }); return }
    setBusy(true); setMessage(null)
    try {
      const res = await fetch('/api/settings/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, section, value }) })
      const out = await res.json().catch(() => ({}))
      setMessage(res.ok ? { tone: 'success', text: done } : { tone: 'danger', text: out.error ?? 'Could not save.' })
      if (res.ok) router.refresh()
    } catch { setMessage({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }
  return { busy, message, save }
}

function Check({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <label className="flex items-start gap-2 text-[13px] text-foreground">
      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}<span className="block text-[12px] text-muted">{hint}</span></span>
    </label>
  )
}

export function VisitSettingsForm({ orgId, initial }: { orgId: string; initial: VisitSettings }) {
  const [v, setV] = useState(initial)
  const { busy, message, save } = useSave(orgId, 'visits')
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(v, 'Saved. Visits booked from now on follow these settings.') }}>
      <fieldset className="space-y-3">
        <legend className="text-[13px] font-semibold text-foreground">Messages to the buyer (e-mail)</legend>
        <Check checked={v.buyerConfirmation} onChange={(x) => setV({ ...v, buyerConfirmation: x })} label="Confirm the visit when it is booked or moved" hint="With the time, the address and who they will meet." />
        <Check checked={v.buyerReminder24h} onChange={(x) => setV({ ...v, buyerReminder24h: x })} label="Remind them the day before" hint="24 hours before the visit." />
        <Check checked={v.buyerReminder2h} onChange={(x) => setV({ ...v, buyerReminder2h: x })} label="Remind them shortly before" hint="2 hours before the visit — fewer no-shows." />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Flag check-ins further than" hint="A salesperson checking in further than this from the project is marked on the calendar.">
          <Select value={v.checkinRadiusM} onChange={(e) => setV({ ...v, checkinRadiusM: Number(e.target.value) })}>
            {[100, 250, 500, 1000, 2000, 5000].map((m) => <option key={m} value={m}>{m >= 1000 ? `${m / 1000} km` : `${m} m`}</option>)}
          </Select>
        </Field>
        <Field label="Visits per salesperson per day" hint="Booking more is refused, so nobody is double-booked across a city.">
          <Select value={v.maxPerPersonPerDay} onChange={(e) => setV({ ...v, maxPerPersonPerDay: Number(e.target.value) })}>
            <option value={0}>No limit</option>
            {[2, 3, 4, 5, 6, 8, 10, 12, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>Save site visit settings</Button>
    </form>
  )
}

export function MatchingSettingsForm({ orgId, initial }: { orgId: string; initial: MatchingSettings }) {
  const [m, setM] = useState(initial)
  const { busy, message, save } = useSave(orgId, 'matching')
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(m, 'Saved. Matching units and interested buyers use these rules straight away.') }}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Suggest units over budget by up to" hint="Buyers often stretch a little for the right home.">
          <Select value={m.overBudgetPct} onChange={(e) => setM({ ...m, overBudgetPct: Number(e.target.value) })}>
            {[0, 5, 10, 15, 20, 25].map((p) => <option key={p} value={p}>{p === 0 ? 'Never over budget' : `${p}%`}</option>)}
          </Select>
        </Field>
        <Field label="Hide weak matches" hint="Matches are scored out of 100 on budget, configuration, location, area and facing.">
          <Select value={m.minScore} onChange={(e) => setM({ ...m, minScore: Number(e.target.value) })}>
            <option value={0}>Show every match</option>
            {[30, 40, 50, 60, 70, 80].map((s) => <option key={s} value={s}>Below {s}</option>)}
          </Select>
        </Field>
        <Field label="Units suggested per lead">
          <Select value={m.maxSuggestions} onChange={(e) => setM({ ...m, maxSuggestions: Number(e.target.value) })}>
            {[3, 5, 8, 10, 15, 20].map((n) => <option key={n} value={n}>{n}</option>)}
          </Select>
        </Field>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>Save matching rules</Button>
    </form>
  )
}
