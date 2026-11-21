'use client'
// components/platform/RetryEmailsButton.tsx — requeue every held and failed application e-mail.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui'

export function RetryEmailsButton() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <div className="flex items-center gap-2">
      {msg && <span className="text-[12px] text-muted" role="status">{msg}</span>}
      <Button size="sm" variant="secondary" disabled={busy} onClick={async () => {
        setBusy(true); setMsg(null)
        const res = await fetch('/api/platform/email/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ includeFailed: true }) })
        const json = await res.json().catch(() => ({}))
        setMsg(res.ok ? `${json.requeued ?? 0} queued again` : json.error ?? 'Could not retry.')
        setBusy(false); router.refresh()
      }}>{busy ? 'Retrying…' : 'Retry all'}</Button>
    </div>
  )
}
