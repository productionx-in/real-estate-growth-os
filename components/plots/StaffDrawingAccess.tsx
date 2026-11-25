'use client'
// components/plots/StaffDrawingAccess.tsx — an owner or admin lets REGrow draw this project's plot boundaries for a
// limited time (POST/DELETE /api/plot-maps/staff-access), or withdraws it. REGrow sees the layout page and outlines
// only; your team still links each plot to its unit, and approves and publishes the map.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@/components/ui'

const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export function StaffDrawingAccess({ orgId, projectId, access }: { orgId: string; projectId: string; access: { expiresAt: string; grantedBy: string | null } | null }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function send(method: 'POST' | 'DELETE') {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/plot-maps/staff-access', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, projectId }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return }
      router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }
  return (
    <section aria-labelledby="staff-drawing" className="surface-raised space-y-2 rounded-2xl border border-default bg-surface p-5">
      <h2 id="staff-drawing" className="text-[15px] font-semibold text-foreground">Let REGrow draw the plot boundaries</h2>
      <p className="text-[13px] text-muted">
        The REGrow team can trace each plot’s outline and number on your uploaded layout. They see the layout page and the
        outlines only — not your inventory, prices or buyers — and cannot link plots to units. Your team links every plot,
        then approves and publishes the map.
      </p>
      {access ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface-muted p-3">
          <p className="text-[13px] text-foreground">Allowed until <span className="font-medium">{day(access.expiresAt)}</span>{access.grantedBy ? ` · by ${access.grantedBy}` : ''}</p>
          <Button size="sm" variant="secondary" loading={busy} onClick={() => send('DELETE')}>Withdraw</Button>
        </div>
      ) : (
        <Button size="sm" loading={busy} onClick={() => send('POST')}>Allow for 14 days</Button>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </section>
  )
}
