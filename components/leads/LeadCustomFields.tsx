'use client'
// components/leads/LeadCustomFields.tsx — the workspace's own fields on a lead (Settings → Fields on leads): shown
// to everyone who can see the lead, edited by whoever may work it. The server checks every value (app/api/leads/
// [leadId]/fields).
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Alert, Button, Field, Input, Select } from '@/components/ui'
import { displayValue, type FieldDef, type FieldValues } from '@/lib/settings/fields'

export function LeadCustomFields({ leadId, defs, values, canEdit, settingsHref }: {
  leadId: string
  defs: FieldDef[]
  values: FieldValues
  canEdit: boolean
  /** Where owners and admins add fields; null for everyone else. */
  settingsHref: string | null
}) {
  const router = useRouter()
  const active = defs.filter((f) => !f.archived)
  // Values of removed fields stay visible (read-only), so nothing recorded disappears.
  const archivedWithValue = defs.filter((f) => f.archived && displayValue(f, values[f.key]))
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Record<string, string | boolean | null>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!active.length && !archivedWithValue.length) {
    return settingsHref ? (
      <section className="rounded-lg border border-dashed border-default p-4 text-[12px] text-muted">
        Track what matters to your business on every lead — purpose of purchase, home loan, possession timeline…{' '}
        <Link href={settingsHref} className="font-medium text-brand underline">Add fields</Link>
      </section>
    ) : null
  }

  function start() {
    setDraft(Object.fromEntries(active.map((f) => {
      const v = values[f.key]
      return [f.key, f.type === 'yesno' ? (typeof v === 'boolean' ? v : null) : v === undefined || v === null ? '' : String(v)]
    })))
    setError(null); setEditing(true)
  }

  async function save() {
    setBusy(true); setError(null)
    const body: Record<string, string | number | boolean | null> = {}
    for (const f of active) {
      const v = draft[f.key]
      body[f.key] = v === '' || v === undefined ? null : f.type === 'number' && typeof v === 'string' ? Number(v) : v
    }
    try {
      const res = await fetch(`/api/leads/${leadId}/fields`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ values: body }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return }
      setEditing(false); router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  return (
    <section aria-labelledby="lead-details-title" className="rounded-lg border border-default bg-surface p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="lead-details-title" className="text-[13px] font-semibold text-foreground">More details</h3>
        {canEdit && !editing && active.length > 0 && <Button size="sm" variant="ghost" onClick={start}><Pencil aria-hidden /> Edit</Button>}
      </div>
      {!editing ? (
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-3 gap-y-2 text-[13px]">
          {[...active, ...archivedWithValue].map((f) => (
            <div key={f.key} className="contents">
              <dt className="text-muted">{f.label}{f.archived && <span className="text-subtle"> (removed)</span>}</dt>
              <dd className="text-foreground">{displayValue(f, values[f.key]) || <span className="text-subtle">—</span>}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save() }}>
          {active.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === 'choice' ? (
                <Select value={String(draft[f.key] ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}>
                  <option value="">—</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </Select>
              ) : f.type === 'yesno' ? (
                <Select value={draft[f.key] === true ? 'yes' : draft[f.key] === false ? 'no' : ''}
                  onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value === '' ? null : e.target.value === 'yes' })}>
                  <option value="">—</option><option value="yes">Yes</option><option value="no">No</option>
                </Select>
              ) : (
                <Input type={f.type === 'date' ? 'date' : 'text'} inputMode={f.type === 'number' ? 'decimal' : undefined} maxLength={200}
                  value={String(draft[f.key] ?? '')} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} />
              )}
            </Field>
          ))}
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={busy}>Save</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(false)} disabled={busy}>Cancel</Button>
          </div>
        </form>
      )}
    </section>
  )
}
