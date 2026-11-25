'use client'
// components/listings/ShareTemplateForm.tsx — the agency's listing share message, with a live preview on a sample
// listing. Owners and admins; the server checks the fields (app/api/listings/share-template).
import { useState } from 'react'
import { Alert, Button, Field, Textarea } from '@/components/ui'
import { DEFAULT_SHARE_TEMPLATE, SHARE_FIELDS, checkTemplate, shareText, type Listing } from '@/lib/listings/listing'

const SAMPLE: Listing = {
  id: 'sample', kind: 'rent', propertyType: 'apartment', title: '3BHK with park view', locality: 'Kondapur', city: 'Hyderabad',
  address: null, bhk: '3BHK', area: 1650, areaUnit: 'sqft', floor: '7', furnishing: 'semi', facing: 'East', price: null,
  monthlyRent: 42000, deposit: 200000, maintenance: 4000, availableFrom: '2026-12-15', description: null, status: 'available',
  assignedTo: null, owner: null, fitOut: null, seats: null, frontageFt: null, parking: null,
}

export function ShareTemplateForm({ orgId, agency, initial }: { orgId: string; agency: string; initial: string }) {
  const [t, setT] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const check = checkTemplate(t)
  async function save() {
    if (check.error) { setMsg({ tone: 'danger', text: check.error }); return }
    setBusy(true); setMsg(null)
    try {
      const res = await fetch('/api/listings/share-template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, template: t }) })
      const out = await res.json().catch(() => ({}))
      setMsg(res.ok ? { tone: 'success', text: 'Saved. Agents’ Share buttons use this message now.' } : { tone: 'danger', text: out.error ?? 'Could not save.' })
    } catch { setMsg({ tone: 'danger', text: 'Network error. Please try again.' }) } finally { setBusy(false) }
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        <Field label="Message" hint={`Fields: ${SHARE_FIELDS.map((f) => `{${f}}`).join(' ')}. *Bold* works in WhatsApp. The owner and the full address are never available here.`}>
          <Textarea rows={10} value={t} onChange={(e) => setT(e.target.value)} className="font-mono text-[12px]" />
        </Field>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex gap-2">
          <Button onClick={save} loading={busy} disabled={!!check.error}>Save message</Button>
          <Button variant="ghost" onClick={() => setT(DEFAULT_SHARE_TEMPLATE)}>Use the default</Button>
        </div>
      </div>
      <section aria-label="Preview" className="rounded-lg border border-default bg-surface-muted p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-subtle">Preview · sample rental</p>
        <pre className="whitespace-pre-wrap font-sans text-[13px] text-foreground">{check.error ? check.error : shareText(t, SAMPLE, { agent: 'Your name', agentPhone: '+91 98xxx xxxxx', agency })}</pre>
      </section>
    </div>
  )
}
