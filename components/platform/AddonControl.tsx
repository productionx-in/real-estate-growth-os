'use client'
// components/platform/AddonControl.tsx — switch a paid add-on on or off for a workspace and record the agreed fees
// (app/api/admin/organisations/[orgId]/addons). Platform Owner only; audited. Fees are REGrow's commercial terms.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Badge, Button, Field, Input } from '@/components/ui'

export interface AddonState { enabled: boolean; setupFeePaise: number; monthlyFeePaise: number; includedLayouts: number; notes: string | null; enabledAt: string | null }

export function AddonControl({ orgId, addon, name, state, canEdit, suggested }: {
  orgId: string; addon: 'plot_maps'; name: string; state: AddonState; canEdit: boolean
  /** The list price, pre-filled for a workspace that has never had the add-on. */
  suggested: { setupRupees: number; monthlyRupees: number; includedLayouts: number }
}) {
  const router = useRouter()
  const fresh = !state.enabled && state.setupFeePaise === 0 && state.monthlyFeePaise === 0
  const [setup, setSetup] = useState(String(fresh ? suggested.setupRupees : state.setupFeePaise / 100))
  const [monthly, setMonthly] = useState(String(fresh ? suggested.monthlyRupees : state.monthlyFeePaise / 100))
  const [layouts, setLayouts] = useState(String(fresh ? suggested.includedLayouts : state.includedLayouts))
  const [notes, setNotes] = useState(state.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(enabled: boolean) {
    const n = (v: string) => Math.round(Number(v))
    if ([setup, monthly, layouts].some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) { setError('Enter amounts as whole rupees.'); return }
    if (!window.confirm(enabled ? `Switch on ${name} for this workspace at ₹${n(setup)} setup + ₹${n(monthly)}/month?` : `Switch off ${name}? The workspace keeps its layouts but can’t open them until it is switched on again.`)) return
    setBusy(true); setError(null)
    const res = await fetch(`/api/admin/organisations/${orgId}/addons`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addon, enabled, setupFeeRupees: n(setup), monthlyFeeRupees: n(monthly), includedLayouts: n(layouts), notes: notes || undefined }),
    })
    const out = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) setError(out.error ?? 'Could not save.'); else router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-medium text-foreground">{name}</span>
        {state.enabled ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}
        {state.enabledAt && <span className="text-[12px] text-muted">since {new Date(state.enabledAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Setup fee (₹, one-time)"><Input inputMode="numeric" value={setup} disabled={!canEdit} onChange={(e) => setSetup(e.target.value)} /></Field>
        <Field label="Monthly fee (₹)"><Input inputMode="numeric" value={monthly} disabled={!canEdit} onChange={(e) => setMonthly(e.target.value)} /></Field>
        <Field label="Layouts included"><Input inputMode="numeric" value={layouts} disabled={!canEdit} onChange={(e) => setLayouts(e.target.value)} /></Field>
      </div>
      <Field label="Notes (deal terms, PO number)"><Input value={notes} maxLength={500} disabled={!canEdit} onChange={(e) => setNotes(e.target.value)} /></Field>
      {error && <Alert tone="danger">{error}</Alert>}
      {canEdit ? (
        <div className="flex flex-wrap gap-2">
          {state.enabled
            ? <><Button onClick={() => save(true)} loading={busy}>Save terms</Button><Button variant="secondary" onClick={() => save(false)} disabled={busy}>Switch off</Button></>
            : <Button onClick={() => save(true)} loading={busy}>Switch on</Button>}
        </div>
      ) : <p className="text-[12px] text-muted">Only a Platform Owner can change add-ons.</p>}
      <p className="text-[12px] text-muted">Fees are recorded here for invoicing; the customer is billed separately. Switching on or off is recorded in the audit log.</p>
    </div>
  )
}
