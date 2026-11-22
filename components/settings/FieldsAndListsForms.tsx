'use client'
// components/settings/FieldsAndListsForms.tsx — Settings → Fields on leads (the workspace's own fields) and
// Settings → Locations. Owners and admins; the server validates and authorises (app/api/settings/workspace).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Alert, Badge, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { FIELD_LIMITS, FIELD_TYPES, SUGGESTED_FIELDS, type FieldDef, type FieldType } from '@/lib/settings/fields'
import { LIMITS } from '@/lib/settings/workspace'

async function post(orgId: string, section: 'fields' | 'lists', value: unknown): Promise<{ ok: boolean; error?: string; value?: unknown }> {
  try {
    const res = await fetch('/api/settings/workspace', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, section, value }) })
    const out = await res.json().catch(() => ({}))
    return res.ok ? { ok: true, value: out.value } : { ok: false, error: out.error ?? 'Could not save.' }
  } catch { return { ok: false, error: 'Network error. Please try again.' } }
}

type Draft = FieldDef & { isNew?: boolean; optionsText: string }
const toDraft = (f: FieldDef): Draft => ({ ...f, optionsText: f.options.join('\n') })

export function FieldsSettingsForm({ orgId, initial }: { orgId: string; initial: FieldDef[] }) {
  const router = useRouter()
  const [fields, setFields] = useState<Draft[]>(() => initial.map(toDraft))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const active = fields.filter((f) => !f.archived)
  const removed = fields.filter((f) => f.archived)
  const set = (key: string, patch: Partial<Draft>) => setFields((all) => all.map((f) => (f.key === key ? { ...f, ...patch } : f)))
  const move = (key: string, d: -1 | 1) => setFields((all) => {
    const order = all.filter((f) => !f.archived)
    const i = order.findIndex((f) => f.key === key)
    if (i < 0 || !order[i + d]) return all
    ;[order[i], order[i + d]] = [order[i + d], order[i]]
    return [...order, ...all.filter((f) => f.archived)]
  })
  let seq = 0
  const add = (base: Partial<Draft>) => setFields((all) => [...all.filter((f) => !f.archived), {
    key: `new-${Date.now()}-${seq++}`, label: '', type: 'text' as FieldType, options: [], archived: false, isNew: true, optionsText: '', ...base,
  }, ...all.filter((f) => f.archived)])
  const taken = new Set(fields.map((f) => f.label.toLowerCase()))

  async function save() {
    setBusy(true); setMessage(null)
    const lead = fields.map((f) => ({
      key: f.isNew ? undefined : f.key, label: f.label, type: f.type, archived: f.archived,
      options: f.type === 'choice' ? f.optionsText.split('\n').map((x) => x.trim()).filter(Boolean) : [],
    }))
    const r = await post(orgId, 'fields', { lead })
    setBusy(false)
    if (!r.ok) { setMessage({ tone: 'danger', text: r.error! }); return }
    const saved = (r.value as { lead: FieldDef[] }).lead
    setFields(saved.map(toDraft))
    setMessage({ tone: 'success', text: 'Saved. The fields now show on every lead under “More details” and in lead exports.' })
    router.refresh()
  }

  return (
    <div className="space-y-5">
      {active.length === 0 && <p className="rounded-lg border border-dashed border-default p-4 text-[13px] text-muted">No fields yet. Start from a suggestion below or add your own.</p>}
      <ol className="space-y-3">
        {active.map((f, i) => (
          <li key={f.key} className="rounded-lg border border-default p-3">
            <div className="grid gap-3 sm:grid-cols-[1fr_11rem_auto] sm:items-end">
              <Field label="Field name"><Input value={f.label} maxLength={FIELD_LIMITS.labelLength} onChange={(e) => set(f.key, { label: e.target.value })} placeholder="e.g. Purpose of purchase" /></Field>
              <Field label="Type" hint={f.isNew ? undefined : 'Fixed once saved'}>
                <Select value={f.type} disabled={!f.isNew} onChange={(e) => set(f.key, { type: e.target.value as FieldType })}>
                  {Object.entries(FIELD_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
              <div className="flex gap-1">
                <Button type="button" size="sm" variant="ghost" aria-label={`Move ${f.label || 'field'} up`} disabled={i === 0} onClick={() => move(f.key, -1)}><ArrowUp aria-hidden /></Button>
                <Button type="button" size="sm" variant="ghost" aria-label={`Move ${f.label || 'field'} down`} disabled={i === active.length - 1} onClick={() => move(f.key, 1)}><ArrowDown aria-hidden /></Button>
                <Button type="button" size="sm" variant="ghost" aria-label={`Remove ${f.label || 'field'}`}
                  onClick={() => (f.isNew ? setFields((all) => all.filter((x) => x.key !== f.key)) : set(f.key, { archived: true }))}><Trash2 aria-hidden /></Button>
              </div>
            </div>
            {f.type === 'choice' && (
              <Field label="Choices" hint="One per line, in the order they should appear." className="mt-3">
                <Textarea rows={Math.min(8, Math.max(3, f.optionsText.split('\n').length + 1))} value={f.optionsText} onChange={(e) => set(f.key, { optionsText: e.target.value })} />
              </Field>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => add({})} disabled={active.length >= FIELD_LIMITS.fields}><Plus aria-hidden /> Add a field</Button>
        {SUGGESTED_FIELDS.filter((s) => !taken.has(s.label.toLowerCase())).map((s) => (
          <button key={s.label} type="button" onClick={() => add({ label: s.label, type: s.type, optionsText: s.options.join('\n') })}
            className="min-h-8 rounded-full border border-dashed border-strong px-3 text-[12px] text-foreground hover:bg-surface-hover">
            + {s.label}
          </button>
        ))}
      </div>
      {removed.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-subtle">Removed fields</p>
          <p className="text-[12px] text-muted">Hidden from forms. Values already recorded stay on each lead and in exports.</p>
          <ul className="flex flex-wrap gap-2">
            {removed.map((f) => (
              <li key={f.key} className="flex items-center gap-1 rounded-full border border-default py-0.5 pl-3 pr-1 text-[12px] text-muted">
                {f.label} <Badge>{FIELD_TYPES[f.type]}</Badge>
                <Button type="button" size="sm" variant="ghost" aria-label={`Restore ${f.label}`} onClick={() => set(f.key, { archived: false })}><RotateCcw aria-hidden /></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="button" onClick={save} loading={busy}>Save fields</Button>
    </div>
  )
}

export function LocationsForm({ orgId, initial, suggestions }: { orgId: string; initial: string[]; suggestions: string[] }) {
  const router = useRouter()
  const [text, setText] = useState(initial.join('\n'))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const list = text.split('\n').map((x) => x.trim()).filter(Boolean)
  const missing = suggestions.filter((s) => !list.some((l) => l.toLowerCase() === s.toLowerCase()))

  async function save() {
    setBusy(true); setMessage(null)
    const r = await post(orgId, 'lists', { locations: list })
    setBusy(false)
    if (!r.ok) { setMessage({ tone: 'danger', text: r.error! }); return }
    const saved = (r.value as { locations: string[] }).locations
    setText(saved.join('\n'))
    setMessage({ tone: 'success', text: `Saved ${saved.length} location${saved.length === 1 ? '' : 's'}. They are offered when recording what a buyer wants.` })
    router.refresh()
  }

  return (
    <div className="space-y-4">
      <Field label="Locations" hint={`One per line — a locality, area or city, e.g. “Whitefield” or “Gachibowli, Hyderabad”. Up to ${LIMITS.locations}.`}>
        <Textarea rows={10} value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      {missing.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[12px] text-muted">From your projects:</p>
          <div className="flex flex-wrap gap-1.5">
            {missing.slice(0, 30).map((s) => (
              <button key={s} type="button" onClick={() => setText((t) => [t.trim(), s].filter(Boolean).join('\n'))}
                className="min-h-8 rounded-full border border-dashed border-strong px-3 text-[12px] text-foreground hover:bg-surface-hover">+ {s}</button>
            ))}
          </div>
        </div>
      )}
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      <Button type="button" onClick={save} loading={busy}>Save locations</Button>
    </div>
  )
}
