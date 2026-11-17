'use client'
// Platform-side actions on one grant: withdraw/end (requester or super admin), emergency approval (super admin).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Select, Textarea } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'

export function GrantActions({ grantId, status, canEnd, canEmergency }: { grantId: string; status: string; canEnd: boolean; canEmergency: boolean }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [minutes, setMinutes] = useState(30)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function call(path: string, body?: object) {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/admin/support-grants/${grantId}/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(json.error ?? 'Action failed.')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canEnd && (
        <Button size="sm" variant="secondary" loading={busy} onClick={() => call('cancel')}>
          {status === 'pending' ? 'Withdraw request' : 'End access now'}
        </Button>
      )}
      {canEmergency && status === 'pending' && (
        <Dialog>
          <DialogTrigger asChild><Button size="sm" variant="danger">Emergency access</Button></DialogTrigger>
          <DialogContent title="Grant emergency access?"
            description="Access starts now without the customer’s approval. They will see it, with your reason, in their audit log and can revoke it at any time.">
            <div className="space-y-3">
              <Field label="Emergency reason" required hint="At least 20 characters.">
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
              </Field>
              <Field label="Duration">
                <Select value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
                  <option value={15}>15 minutes</option><option value={30}>30 minutes</option><option value={60}>60 minutes (maximum)</option>
                </Select>
              </Field>
            </div>
            <DialogFooter>
              <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
              <Button variant="danger" loading={busy} disabled={reason.trim().length < 20} onClick={() => call('emergency', { reason, minutes })}>
                Grant emergency access
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {error && <Alert tone="danger" className="w-full">{error}</Alert>}
    </div>
  )
}
