'use client'
// components/plots/RequestActivationButton.tsx — a workspace owner/admin asks RE by PX to activate (or renew) the
// Interactive Plot Map for one project (POST /api/plot-maps/activation-request). Activation itself is RE by PX's.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@/components/ui'

export function RequestActivationButton({ orgId, projectId, renewal = false }: { orgId: string; projectId: string; renewal?: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function request() {
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/plot-maps/activation-request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ orgId, projectId }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not send the request.'); return }
      router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  return (
    <div className="space-y-2">
      <Button onClick={request} loading={busy}>{renewal ? 'Request renewal' : 'Request activation for this project'}</Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}
