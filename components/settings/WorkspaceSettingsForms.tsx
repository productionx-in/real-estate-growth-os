'use client'
// components/settings/WorkspaceSettingsForms.tsx — Settings → Lead settings (reasons for Lost and Junk), Inventory
// settings (hold time, area units) and Report settings (financial year, week start). Owners and admins; the server validates and authorises (app/api/settings/workspace).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { AREA_UNITS, DEFAULT_STATUS_LABELS, LIMITS, STATUS_MEANING, UNIT_STATUSES, describeHold, normaliseSection, type AreaUnit, type InventorySettings, type LeadSettings, type ReportSettings, type SettingsSection } from '@/lib/settings/workspace'

function useSave(orgId: string, section: SettingsSection) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  async function save(value: unknown, done: string) {
    const check = normaliseSection(section, value)
    const first = Object.values(check.errors)[0]
    if (first) { setMessage({ tone: 'danger', text: first }); return }
    setBusy(true); setMessage(null)
    try {
      const res = await fetch('/api/settings/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, section, value: check.value }) })
      const out = await res.json().catch(() => ({}))
      setMessage(res.ok ? { tone: 'success', text: done } : { tone: 'danger', text: out.error ?? 'Could not save.' })
      if (res.ok) router.refresh()
    } catch { setMessage({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }
  return { busy, message, save }
}

function ReasonList({ id, label, hint, items, onChange }: { id: string; label: string; hint: string; items: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const move = (i: number, d: -1 | 1) => { const n = [...items]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n) }
  function add() {
    const v = draft.replace(/\s+/g, ' ').trim()
    if (!v || items.some((x) => x.toLowerCase() === v.toLowerCase())) { setDraft(''); return }
    onChange([...items, v]); setDraft('')
  }
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-semibold text-foreground">{label}</legend>
      <p className="text-[12px] text-muted">{hint}</p>
      <ol className="divide-y divide-[var(--border)] rounded-lg border border-default">
        {items.map((r, i) => (
          <li key={r} className="flex items-center gap-1 px-3 py-1.5">
            <span className="flex-1 text-[13px] text-foreground">{r}</span>
            <Button type="button" size="sm" variant="ghost" aria-label={`Move “${r}” up`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp aria-hidden /></Button>
            <Button type="button" size="sm" variant="ghost" aria-label={`Move “${r}” down`} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown aria-hidden /></Button>
            <Button type="button" size="sm" variant="ghost" aria-label={`Remove “${r}”`} onClick={() => onChange(items.filter((x) => x !== r))}><X aria-hidden /></Button>
          </li>
        ))}
        {!items.length && <li className="px-3 py-3 text-[12px] text-muted">No reasons yet.</li>}
      </ol>
      {items.length < LIMITS.reasons && (
        <div className="flex gap-2">
          <Input id={`${id}-new`} aria-label={`New ${label.toLowerCase()}`} value={draft} maxLength={LIMITS.reasonLength} placeholder="Add a reason"
            onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} />
          <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}><Plus aria-hidden /> Add</Button>
        </div>
      )}
    </fieldset>
  )
}

export function LeadSettingsForm({ orgId, initial }: { orgId: string; initial: LeadSettings }) {
  const [value, setValue] = useState(initial)
  const { busy, message, save } = useSave(orgId, 'leads')
  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); save(value, 'Saved. The new reasons are offered the next time someone closes a lead.') }}>
      <label className="flex items-start gap-2 text-[13px] text-foreground">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--brand)]" checked={value.requireReason}
          onChange={(e) => setValue({ ...value, requireReason: e.target.checked })} />
        <span>Ask for a reason when a lead is marked Lost or Junk<span className="block text-[12px] text-muted">So your reports can show why deals are lost. “Other” is always available with a note.</span></span>
      </label>
      <div className="grid gap-6 md:grid-cols-2">
        <ReasonList id="lost" label="Lost reasons" hint="A real buyer who decided not to go ahead." items={value.lostReasons} onChange={(lostReasons) => setValue({ ...value, lostReasons })} />
        <ReasonList id="junk" label="Junk reasons" hint="Not a real buyer enquiry." items={value.junkReasons} onChange={(junkReasons) => setValue({ ...value, junkReasons })} />
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>Save lead settings</Button>
    </form>
  )
}

const HOLD_CHOICES = [0, 2, 4, 12, 24, 48, 72, 168]

export function InventorySettingsForm({ orgId, initial }: { orgId: string; initial: InventorySettings }) {
  const [value, setValue] = useState(initial)
  const { busy, message, save } = useSave(orgId, 'inventory')
  const choices = HOLD_CHOICES.includes(value.holdHours) ? HOLD_CHOICES : [...HOLD_CHOICES, value.holdHours].sort((a, b) => a - b)
  const units = Object.entries(AREA_UNITS) as [AreaUnit, string][]
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(value, 'Saved. New holds and new units use these settings; status names change everywhere at once.') }}>
      <Field label="Release units on hold after" hint="A unit on hold goes back to Available on its own when the time runs out, so a forgotten hold never blocks a sale. The unit’s history records it.">
        <Select value={value.holdHours} onChange={(e) => setValue({ ...value, holdHours: Number(e.target.value) })} className="max-w-xs">
          {choices.map((h) => <option key={h} value={h}>{h === 0 ? 'Never — release by hand' : describeHold(h)}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Area unit for flats, villas and offices" hint="Pre-filled when someone adds a unit; they can still change it.">
          <Select value={value.areaUnitBuilt} onChange={(e) => setValue({ ...value, areaUnitBuilt: e.target.value as AreaUnit })}>
            {units.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Area unit for plots and land" hint="Square yards in much of South India; guntas, cents or acres for larger land.">
          <Select value={value.areaUnitLand} onChange={(e) => setValue({ ...value, areaUnitLand: e.target.value as AreaUnit })}>
            {units.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <fieldset className="space-y-3">
        <legend className="text-[13px] font-semibold text-foreground">Status names</legend>
        <p className="text-[12px] text-muted">Call each status what your team calls it, for example “Landowner share” instead of “Blocked”. Only the name changes: what each status does, and which changes are allowed between them, stay the same. Leave a box empty to use the standard name.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {UNIT_STATUSES.map((k) => (
            <Field key={k} label={DEFAULT_STATUS_LABELS[k]} hint={STATUS_MEANING[k]}>
              <Input value={value.statusLabels[k]} maxLength={LIMITS.statusLabel} placeholder={DEFAULT_STATUS_LABELS[k]}
                onChange={(e) => setValue({ ...value, statusLabels: { ...value.statusLabels, [k]: e.target.value } })} />
            </Field>
          ))}
        </div>
      </fieldset>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>Save inventory settings</Button>
    </form>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function ReportSettingsForm({ orgId, initial }: { orgId: string; initial: ReportSettings }) {
  const [value, setValue] = useState(initial)
  const { busy, message, save } = useSave(orgId, 'reports')
  return (
    <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); save(value, 'Saved. Reports use the new periods straight away.') }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Financial year starts in" hint="Sets “This quarter” and “This financial year” in reports. April for most Indian companies.">
          <Select value={value.fyStartMonth} onChange={(e) => setValue({ ...value, fyStartMonth: Number(e.target.value) })}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </Field>
        <Field label="Week starts on" hint="Sets “This week” in reports.">
          <Select value={value.weekStartsOn} onChange={(e) => setValue({ ...value, weekStartsOn: Number(e.target.value) === 0 ? 0 : 1 })}>
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
          </Select>
        </Field>
      </div>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>Save report settings</Button>
    </form>
  )
}
