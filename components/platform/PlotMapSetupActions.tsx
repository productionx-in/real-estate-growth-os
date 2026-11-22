'use client'
// components/platform/PlotMapSetupActions.tsx — REGrow staff actions on one project's map set-up (POST
// /api/admin/plot-map-setup): assign a team member, raise a blocker (waiting on the customer pauses the clock and
// tells them; waiting on REGrow does not), and resolve one. Set-up metadata only.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@/components/ui'

const STAGES = [
  ['uploaded', 'Layout upload'], ['processed', 'File processing'], ['mapped', 'Boundary mapping'], ['linked', 'Inventory links'],
  ['qa', 'Quality check'], ['approved', 'Developer approval'], ['published', 'Publishing'],
] as const

const fieldCls = 'h-9 rounded-md border border-default bg-surface px-2 text-[13px] text-foreground pointer-coarse:h-11'

export function PlotMapSetupActions({ orgId, projectId, assigneeUserId, staff, blockers }: {
  orgId: string; projectId: string; assigneeUserId: string | null
  staff: { userId: string; name: string }[]
  blockers: { id: string; stage: string; waitingOn: string; reason: string }[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [raising, setRaising] = useState(false)
  const [stage, setStage] = useState<string>('mapped')
  const [waitingOn, setWaitingOn] = useState<'customer' | 'regrow'>('customer')
  const [reason, setReason] = useState('')

  async function send(key: string, body: Record<string, unknown>) {
    setBusy(key); setError(null)
    try {
      const res = await fetch('/api/admin/plot-map-setup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, ...body }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return false }
      router.refresh(); return true
    } catch { setError('Network error. Please try again.'); return false } finally { setBusy(null) }
  }

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-[12px] text-muted">
        <span>Assigned</span>
        <select className={fieldCls} value={assigneeUserId ?? ''} disabled={busy === 'assign'}
          onChange={(e) => send('assign', { action: 'assign', projectId, assigneeUserId: e.target.value || null })}>
          <option value="">Nobody</option>
          {staff.map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
        </select>
      </label>
      {blockers.map((b) => (
        <div key={b.id} className="flex items-start justify-between gap-2 rounded-md border border-default p-2 text-[12px]">
          <span className="min-w-0 text-foreground"><span className="font-medium">{b.waitingOn === 'customer' ? 'Waiting on customer' : 'Waiting on REGrow'}:</span> {b.reason}</span>
          <Button size="sm" variant="ghost" loading={busy === b.id} onClick={() => send(b.id, { action: 'resolve', blockerId: b.id })}>Resolve</Button>
        </div>
      ))}
      {raising ? (
        <form className="space-y-2 rounded-md border border-default p-2" onSubmit={async (e) => {
          e.preventDefault()
          if (await send('raise', { action: 'raise', projectId, stage, waitingOn, reason })) { setRaising(false); setReason('') }
        }}>
          <div className="flex flex-wrap gap-2">
            <label className="text-[12px] text-muted">Stage <select className={fieldCls} value={stage} onChange={(e) => setStage(e.target.value)}>
              {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <label className="text-[12px] text-muted">Waiting on <select className={fieldCls} value={waitingOn} onChange={(e) => setWaitingOn(e.target.value as 'customer' | 'regrow')}>
              <option value="customer">Customer (pauses the clock)</option><option value="regrow">REGrow</option></select></label>
          </div>
          <label className="block text-[12px] text-muted">What is needed (the customer sees this when it waits on them)
            <textarea required minLength={5} maxLength={500} rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              className="mt-1 w-full rounded-md border border-default bg-surface p-2 text-[13px] text-foreground" />
          </label>
          <div className="flex gap-2">
            <Button size="sm" type="submit" loading={busy === 'raise'}>Raise blocker</Button>
            <Button size="sm" variant="ghost" type="button" onClick={() => setRaising(false)}>Cancel</Button>
          </div>
        </form>
      ) : <Button size="sm" variant="secondary" onClick={() => setRaising(true)}>Raise a blocker</Button>}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}
