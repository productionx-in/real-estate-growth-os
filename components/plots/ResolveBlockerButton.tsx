'use client'
// components/plots/ResolveBlockerButton.tsx — the workspace tells REGrow it has done what a set-up blocker asked for
// (POST /api/plot-maps/setup/blockers/[id]). The service clock restarts from the moment it is marked done.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@/components/ui'

export function ResolveBlockerButton({ orgId, blockerId }: { orgId: string; blockerId: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function done() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/plot-maps/setup/blockers/${blockerId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not update.'); return }
      router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }
  return (
    <div className="space-y-1.5">
      <Button size="sm" variant="secondary" onClick={done} loading={busy}>Mark as done</Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}
