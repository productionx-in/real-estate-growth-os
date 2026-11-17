'use client'
// Super admins change a workspace's state. A reason is required and recorded in both audit logs.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Select, Textarea } from '@/components/ui'

const STATES = [
  ['active', 'Active — normal use'],
  ['grace', 'Grace — works, shows a renewal warning'],
  ['suspended', 'Suspended — read-only for everyone'],
  ['deactivated', 'Deactivated — nobody can use it'],
] as const

export function LifecycleControl({ orgId, current }: { orgId: string; current: string }) {
  const router = useRouter()
  const [state, setState] = useState(current === 'pending_setup' ? 'active' : current)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const res = await fetch(`/api/admin/organisations/${orgId}/lifecycle`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state, reason }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setMsg({ tone: 'danger', text: body.error ?? 'Could not change the state.' })
    setMsg({ tone: 'success', text: body.unchanged ? 'Already in that state.' : `Changed to ${body.to}. ${body.members_changed} memberships updated.` })
    setReason('')
    router.refresh()
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="New state">
        <Select value={state} onChange={(e) => setState(e.target.value)}>
          {STATES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </Select>
      </Field>
      <Field label="Reason" required hint="Shown to the customer in their audit log.">
        <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </Field>
      <Button type="submit" variant={state === 'suspended' || state === 'deactivated' ? 'danger' : 'primary'}
        loading={busy} disabled={reason.trim().length < 3 || state === current}>
        Apply
      </Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  )
}
