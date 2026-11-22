'use client'
// components/platform/ProjectAddonControl.tsx — Interactive Plot Map for one project: activate (with end date and
// fees), suspend (with a reason the customer sees), resume, save terms, or decline a pending request
// (POST /api/admin/project-addons). Platform Owner only; every change is audited.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Badge, Button, Field, Input } from '@/components/ui'
import { STATE_INFO, type ProjectAddon } from '@/lib/plots/addon-states'

export function ProjectAddonControl({ orgId, projectId, projectName, addon, canEdit, suggested, usage }: {
  orgId: string; projectId: string; projectName: string; addon: ProjectAddon; canEdit: boolean
  suggested: { setupRupees: number; monthlyRupees: number }
  usage: { layouts: number; published: number; shared: number; mappedPlots: number }
}) {
  const router = useRouter()
  const fresh = addon.setupFeePaise === 0 && addon.monthlyFeePaise === 0 && (addon.state === 'not_purchased' || addon.state === 'pending')
  const [open, setOpen] = useState(false)
  const [setup, setSetup] = useState(String(fresh ? suggested.setupRupees : addon.setupFeePaise / 100))
  const [monthly, setMonthly] = useState(String(fresh ? suggested.monthlyRupees : addon.monthlyFeePaise / 100))
  const [until, setUntil] = useState(addon.validUntil ? new Date(addon.validUntil).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '')
  const [notes, setNotes] = useState(addon.notes ?? '')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const info = STATE_INFO[addon.state]

  async function act(action: 'activate' | 'suspend' | 'resume' | 'save_terms' | 'decline_request') {
    const n = (v: string) => Math.round(Number(v))
    if ([setup, monthly].some((v) => !Number.isFinite(Number(v)) || Number(v) < 0)) { setError('Enter amounts as whole rupees.'); return }
    const confirmText: Record<typeof action, string> = {
      activate: `Activate Interactive Plot Map for “${projectName}”${until ? ` until ${until}` : ' with no end date'}?`,
      resume: `Resume Interactive Plot Map for “${projectName}”?`,
      suspend: `Suspend Interactive Plot Map for “${projectName}”? Its map goes offline at once (layouts are kept).`,
      save_terms: 'Save these terms?',
      decline_request: `Decline the activation request for “${projectName}”?`,
    }
    if (!window.confirm(confirmText[action])) return
    setBusy(true); setError(null)
    try {
      const res = await fetch('/api/admin/project-addons', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId, projectId, addon: 'plot_maps', action,
          ...(action !== 'suspend' && action !== 'decline_request' && { validUntil: until || null, setupFeeRupees: n(setup), monthlyFeeRupees: n(monthly), notes }),
          ...(reason && { reason }),
        }),
      })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not save.'); return }
      setOpen(false); setReason(''); router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
  return (
    <div className="space-y-2 py-3">
      <div className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className="font-medium text-foreground">{projectName}</span>
        <Badge tone={info.tone}>{info.label}</Badge>
        {addon.validUntil && <span className="text-[12px] text-muted">{addon.state === 'expired' ? 'ended' : 'until'} {day(addon.validUntil)}</span>}
        {addon.state === 'pending' && addon.requestedAt && <span className="text-[12px] text-muted">requested {day(addon.requestedAt)}</span>}
        <span className="text-[12px] text-muted">· {usage.layouts} layout(s), {usage.published} published, {usage.shared} shared, {usage.mappedPlots} plots mapped</span>
        {canEdit && <Button size="sm" variant="ghost" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close' : 'Manage'}</Button>}
      </div>
      {addon.statusReason && addon.state !== 'active' && <p className="text-[12px] text-muted">Reason: {addon.statusReason}</p>}
      {open && canEdit && (
        <div className="space-y-3 rounded-lg border border-default p-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Setup fee (₹, one-time)"><Input inputMode="numeric" value={setup} onChange={(e) => setSetup(e.target.value)} /></Field>
            <Field label="Monthly fee (₹)"><Input inputMode="numeric" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
            <Field label="Paid until (last day)" hint="Empty = no end date"><Input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></Field>
          </div>
          <Field label="Notes (deal terms, PO number)"><Input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} /></Field>
          <Field label="Reason (shown to the customer when suspending)"><Input value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-wrap gap-2">
            {(addon.state === 'not_purchased' || addon.state === 'pending' || addon.state === 'expired') && <Button size="sm" onClick={() => act('activate')} loading={busy}>{addon.state === 'expired' ? 'Renew' : 'Activate'}</Button>}
            {addon.state === 'pending' && <Button size="sm" variant="secondary" onClick={() => act('decline_request')} disabled={busy}>Decline request</Button>}
            {addon.state === 'suspended' && <Button size="sm" onClick={() => act('resume')} loading={busy}>Resume</Button>}
            {(addon.state === 'active' || addon.state === 'suspended') && <Button size="sm" variant="secondary" onClick={() => act('save_terms')} disabled={busy}>Save terms</Button>}
            {(addon.state === 'active' || addon.state === 'expired') && <Button size="sm" variant="danger" onClick={() => act('suspend')} disabled={busy}>Suspend</Button>}
          </div>
        </div>
      )}
    </div>
  )
}
