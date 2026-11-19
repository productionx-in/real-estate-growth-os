'use client'
// components/billing/BillingProfileForm.tsx — the business details printed on this organisation's invoices.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Textarea } from '@/components/ui'

export interface BillingProfileValues { legalName: string; gstin: string; stateCode: string; billingAddress: string }

export function BillingProfileForm({ orgId, initial }: { orgId: string; initial: BillingProfileValues }) {
  const router = useRouter()
  const [v, setV] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const set = (k: keyof BillingProfileValues) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV({ ...v, [k]: e.target.value })

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    const res = await fetch('/api/billing/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, ...v }) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setMsg({ tone: 'danger', text: json.error ?? 'Could not save.' }); return }
    if (json.stateCode && !v.stateCode) setV((x) => ({ ...x, stateCode: json.stateCode }))
    setMsg({ tone: 'success', text: 'Saved. Invoices issued from now on will show these details.' })
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Business details for invoices</CardTitle>
        <CardDescription>Your registered name and GSTIN appear on invoices issued after you save them, so you can claim input tax credit. Invoices already issued are not changed.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
          <Field label="Registered business name" required><Input value={v.legalName} onChange={set('legalName')} required minLength={2} maxLength={200} autoComplete="organization" /></Field>
          <Field label="GSTIN" hint="Optional. 15 characters, e.g. 27ABCDE1234F1Z5"><Input value={v.gstin} onChange={set('gstin')} maxLength={15} className="uppercase" /></Field>
          <Field label="State code" hint="2 digits; filled from the GSTIN if left empty"><Input value={v.stateCode} onChange={set('stateCode')} inputMode="numeric" maxLength={2} /></Field>
          <Field label="Billing address" className="md:col-span-2"><Textarea value={v.billingAddress} onChange={set('billingAddress')} maxLength={500} rows={3} autoComplete="street-address" /></Field>
          {msg && <div className="md:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
          <div className="md:col-span-2"><Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save business details'}</Button></div>
        </form>
      </CardContent>
    </Card>
  )
}
