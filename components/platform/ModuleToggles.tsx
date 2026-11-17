'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Badge, Button, Field, Input } from '@/components/ui'

export function ModuleToggles({ orgId, modules, labels, canEdit }: {
  orgId: string; modules: Record<string, boolean>; labels: Record<string, string>; canEdit: boolean
}) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggle(module: string, enabled: boolean) {
    setBusy(module)
    setError(null)
    const res = await fetch(`/api/admin/organisations/${orgId}/modules`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ module, enabled, reason }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) return setError(body.error ?? 'Could not change the module.')
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-[var(--border)] rounded-lg border border-default">
        {Object.entries(labels).map(([key, label]) => (
          <li key={key} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
            <span>{label}</span>
            <span className="flex items-center gap-2">
              <Badge tone={modules[key] ? 'success' : 'neutral'}>{modules[key] ? 'On' : 'Off'}</Badge>
              {canEdit && (
                <Button size="sm" variant={modules[key] ? 'secondary' : 'primary'} loading={busy === key}
                  disabled={!!busy || reason.trim().length < 3} onClick={() => toggle(key, !modules[key])}>
                  {modules[key] ? 'Switch off' : 'Switch on'}
                </Button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {canEdit ? (
        <Field label="Reason" required hint="Recorded in the customer’s audit log. Data is kept when a module is off, and lead capture never stops.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Plan changed to Starter on 17 Nov" />
        </Field>
      ) : <p className="text-[12px] text-muted">Only super admins and platform admins can change modules.</p>}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}
