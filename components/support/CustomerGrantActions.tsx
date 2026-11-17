'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button } from '@/components/ui'

export function CustomerGrantActions({ grantId, status }: { grantId: string; status: 'pending' | 'live' }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function call(kind: 'approve' | 'deny' | 'revoke') {
    setBusy(kind)
    setError(null)
    const res = await fetch(kind === 'revoke' ? `/api/support-grants/${grantId}/revoke` : `/api/support-grants/${grantId}/decision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: kind === 'revoke' ? '{}' : JSON.stringify({ approve: kind === 'approve' }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return setError(body.error ?? 'Something went wrong.')
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status === 'pending' ? (
        <>
          <Button size="sm" loading={busy === 'approve'} disabled={!!busy} onClick={() => call('approve')}>Approve</Button>
          <Button size="sm" variant="secondary" loading={busy === 'deny'} disabled={!!busy} onClick={() => call('deny')}>Deny</Button>
        </>
      ) : (
        <Button size="sm" variant="danger" loading={busy === 'revoke'} onClick={() => call('revoke')}>End access now</Button>
      )}
      {error && <Alert tone="danger" className="w-full">{error}</Alert>}
    </div>
  )
}
