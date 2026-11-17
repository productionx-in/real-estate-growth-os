'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Select, Textarea } from '@/components/ui'

const DURATIONS = [[15, '15 minutes'], [30, '30 minutes'], [60, '1 hour'], [120, '2 hours'], [240, '4 hours'], [480, '8 hours'], [1440, '24 hours']] as const

export function SupportRequestForm({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [minutes, setMinutes] = useState(60)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/admin/support-grants', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, reason, minutes }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(body.error ?? 'Could not send the request.')
    setReason('')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Why do you need access?" required hint="The customer’s owners and admins see this when they decide.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000}
          placeholder="Ticket #1234: Meta leads stopped arriving on 14 Nov — need to check the connection and recent lead counts." />
      </Field>
      <Field label="For how long, once approved">
        <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
          {DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Button type="submit" loading={busy} disabled={reason.trim().length < 10}>Ask the customer for access</Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  )
}
