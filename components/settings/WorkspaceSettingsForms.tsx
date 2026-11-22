'use client'
// components/settings/WorkspaceSettingsForms.tsx — Settings → Leads (reasons for Lost and Junk) and Settings →
// Inventory (hold time). Owners and admins; the server validates and authorises (app/api/settings/workspace).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { LIMITS, describeHold, normaliseSection, type InventorySettings, type LeadSettings, type SettingsSection } from '@/lib/settings/workspace'

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
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(value, 'Saved. Units put on hold from now on use this hold time; existing holds keep theirs.') }}>
      <Field label="Release units on hold after" hint="A unit on hold goes back to Available on its own when the time runs out, so a forgotten hold never blocks a sale. The unit’s history records it.">
        <Select value={value.holdHours} onChange={(e) => setValue({ holdHours: Number(e.target.value) })} className="max-w-xs">
          {choices.map((h) => <option key={h} value={h}>{h === 0 ? 'Never — release by hand' : describeHold(h)}</option>)}
        </Select>
      </Field>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="submit" loading={busy}>Save inventory settings</Button>
    </form>
  )
}
