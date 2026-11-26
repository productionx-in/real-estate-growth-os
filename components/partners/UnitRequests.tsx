'use client'
// components/partners/UnitRequests.tsx — booking requests between a partner agency and a developer (20260086).
// Agency: ask the developer to hold an available, shared unit for a buyer whose registration is accepted and still
// protected; withdraw while it waits. Developer: approve (holds the unit for its own lead for the requested time) or
// decline with a reason the agency sees. Every rule is enforced again by the database.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Clock, X } from 'lucide-react'
import { Alert, Badge, Button, Card, CardContent, EmptyState, Field, Input, Select } from '@/components/ui'
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils/format'
import type { AgencyRegistrationView, PartnerUnit, UnitRequestStatus, UnitRequestView } from '@/lib/dal/partners'

const TONE: Record<UnitRequestStatus, 'info' | 'success' | 'danger' | 'neutral'> = { submitted: 'info', approved: 'success', declined: 'danger', withdrawn: 'neutral' }
const LABEL: Record<UnitRequestStatus, string> = { submitted: 'Waiting for developer', approved: 'Unit held', declined: 'Declined', withdrawn: 'Withdrawn' }

async function send(url: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const out = await res.json().catch(() => ({}))
    return res.ok ? { ok: true } : { ok: false, error: out.error ?? 'Something went wrong. Please try again.' }
  } catch { return { ok: false, error: 'Network error. Please try again.' } }
}

function History({ rows, side }: { rows: UnitRequestView[]; side: 'developer' | 'agency' }) {
  if (!rows.length) return null
  return (
    <div className="overflow-x-auto rounded-lg border border-default bg-surface">
      <table className="data-table w-full min-w-[620px] text-left text-[13px]">
        <thead><tr className="border-b border-default text-[12px] text-muted"><th className="px-3 py-2 font-medium">Buyer</th><th className="px-3 py-2 font-medium">{side === 'developer' ? 'Agency' : 'Developer'}</th><th className="px-3 py-2 font-medium">Unit</th><th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Held until / reason</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-default last:border-0">
              <td className="px-3 py-2">{r.buyerName}</td><td className="px-3 py-2">{r.partnerName}</td>
              <td className="px-3 py-2">{r.unitNumber}{r.projectName ? <span className="text-muted"> · {r.projectName}</span> : null}</td>
              <td className="px-3 py-2"><Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge></td>
              <td className="px-3 py-2 text-muted">{r.status === 'approved' && r.heldUntil ? formatDateTime(r.heldUntil) : r.declineReason ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function DeveloperUnitRequests({ orgId, orgSlug, rows }: { orgId: string; orgSlug: string; rows: UnitRequestView[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<{ id: string; text: string } | null>(null)
  const [declining, setDeclining] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')
  const pending = rows.filter((r) => r.status === 'submitted')
  async function review(id: string, approve: boolean) {
    setBusy(id); setError(null)
    const r = await send(`/api/partners/unit-requests/${id}/review`, { orgId, approve, ...(approve ? {} : { reason: reason.trim() }) })
    setBusy(null)
    if (!r.ok) { setError({ id, text: r.error! }); return }
    setDeclining(null); setReason(''); router.refresh()
  }
  return (
    <section aria-labelledby="ureq-h" className="space-y-3">
      <h2 id="ureq-h" className="text-[14px] font-semibold text-foreground">Booking requests {pending.length > 0 && <Badge tone="info" className="ml-1">{pending.length} waiting</Badge>}</h2>
      {rows.length === 0 && <EmptyState icon={Clock} title="No booking requests yet" description="When a partner agency asks you to hold a unit for a buyer you accepted, it appears here." />}
      {pending.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-2 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold">Unit {r.unitNumber}</span>{r.projectName && <span className="text-muted">{r.projectName}</span>}
              <Badge tone="info">Hold for {r.holdHours} h</Badge>
            </div>
            <p className="text-[12px] text-muted">For {r.buyerName} · from {r.partnerName} · {formatDate(r.submittedAt)}
              {r.developerLeadId && <> · <a className="font-medium text-brand hover:underline" href={`/${orgSlug}/leads/${r.developerLeadId}`}>Open the lead</a></>}</p>
            {r.note && <p className="rounded-md bg-surface-hover p-2 text-[13px]">{r.note}</p>}
            {declining === r.id ? (
              <div className="space-y-2">
                <Field label="Reason (the agency sees this)" required><Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></Field>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" disabled={!reason.trim() || busy === r.id} onClick={() => review(r.id, false)}>Decline request</Button>
                  <Button size="sm" variant="ghost" onClick={() => setDeclining(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => review(r.id, true)}><Check aria-hidden /> Approve and hold for {r.holdHours} h</Button>
                <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => { setDeclining(r.id); setReason('') }}><X aria-hidden /> Decline</Button>
              </div>
            )}
            {error?.id === r.id && <Alert tone="danger">{error.text}</Alert>}
          </CardContent>
        </Card>
      ))}
      <History rows={rows.filter((r) => r.status !== 'submitted')} side="developer" />
    </section>
  )
}

function RequestUnitForm({ orgId, registration, onDone }: { orgId: string; registration: AgencyRegistrationView; onDone: () => void }) {
  const [units, setUnits] = React.useState<PartnerUnit[] | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [unitId, setUnitId] = React.useState('')
  const [hours, setHours] = React.useState('48')
  const [note, setNote] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  React.useEffect(() => {
    let live = true
    fetch(`/api/partners/unit-requests?orgId=${orgId}&registrationId=${registration.id}`, { cache: 'no-store' })
      .then(async (r) => { const out = await r.json().catch(() => ({})); if (!live) return; if (r.ok) setUnits(out.units ?? []); else setLoadError(out.error ?? 'Could not load units.') })
      .catch(() => live && setLoadError('Network error. Please try again.'))
    return () => { live = false }
  }, [orgId, registration.id])
  if (loadError) return <Alert tone="warning">{loadError}</Alert>
  if (!units) return <p className="text-[13px] text-muted">Loading available units…</p>
  if (!units.length) return <p className="text-[13px] text-muted">No available units in {registration.projectName ?? 'this project'} right now.</p>
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setError(null)
      const r = await send('/api/partners/unit-requests', { orgId, registrationId: registration.id, inventoryId: unitId, holdHours: Number(hours), ...(note.trim() ? { note: note.trim() } : {}) })
      setBusy(false)
      if (!r.ok) { setError(r.error!); return }
      onDone()
    }}>
      <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
        <Field label="Unit" required>
          <Select value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
            <option value="">Choose an available unit</option>
            {units.map((u) => <option key={u.unitId} value={u.unitId}>{[u.unitNumber, u.tower, u.configuration, u.price != null ? formatCurrency(u.price) : null].filter(Boolean).join(' · ')}</option>)}
          </Select>
        </Field>
        <Field label="Hold for">
          <Select value={hours} onChange={(e) => setHours(e.target.value)}>
            {[24, 48, 72, 168].map((h) => <option key={h} value={h}>{h === 168 ? '7 days' : `${h} hours`}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Note for the developer (optional)"><Input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="e.g. token cheque ready on Friday" /></Field>
      <Button size="sm" type="submit" disabled={!unitId || busy}>{busy ? 'Sending…' : 'Send booking request'}</Button>
      {error && <Alert tone="danger">{error}</Alert>}
    </form>
  )
}

export function AgencyUnitRequests({ orgId, rows, registrations }: { orgId: string; rows: UnitRequestView[]; registrations: AgencyRegistrationView[] }) {
  const router = useRouter()
  const [open, setOpen] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const waiting = new Set(rows.filter((r) => r.status === 'submitted').map((r) => r.registrationId))
  const eligible = registrations.filter((r) => r.status === 'accepted' && r.protectedUntil && new Date(r.protectedUntil) > new Date() && !waiting.has(r.id))
  return (
    <section aria-labelledby="ureq-h" className="space-y-3">
      <h2 id="ureq-h" className="text-[14px] font-semibold text-foreground">Booking requests</h2>
      <p className="text-[13px] text-muted">Ask the developer to hold a unit for a buyer they accepted. They approve or decline; an approved hold lasts the time you asked for.</p>
      {eligible.length === 0 && rows.length === 0 && <EmptyState icon={Clock} title="Nothing to request yet" description="Once a developer accepts one of your buyer registrations, you can ask them to hold a unit here." />}
      {eligible.map((reg) => (
        <Card key={reg.id}>
          <CardContent className="space-y-2 pt-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
              <span><span className="font-semibold">{reg.buyerName}</span> <span className="text-muted">· {reg.developerName}{reg.projectName ? ` · ${reg.projectName}` : ''} · protected until {formatDate(reg.protectedUntil!)}</span></span>
              {open !== reg.id && <Button size="sm" variant="secondary" onClick={() => setOpen(reg.id)}>Request a unit</Button>}
            </div>
            {open === reg.id && <RequestUnitForm orgId={orgId} registration={reg} onDone={() => { setOpen(null); router.refresh() }} />}
          </CardContent>
        </Card>
      ))}
      {rows.filter((r) => r.status === 'submitted').map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default bg-surface p-3 text-[13px]">
          <span><span className="font-semibold">{r.buyerName}</span> <span className="text-muted">· unit {r.unitNumber} · {r.partnerName} · hold {r.holdHours} h</span> <Badge tone="info" className="ml-1">{LABEL.submitted}</Badge></span>
          <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={async () => {
            setBusy(r.id); setError(null)
            const out = await send(`/api/partners/unit-requests/${r.id}/withdraw`, { orgId })
            setBusy(null)
            if (!out.ok) setError(out.error!); else router.refresh()
          }}>Withdraw</Button>
        </div>
      ))}
      {error && <Alert tone="danger">{error}</Alert>}
      <History rows={rows.filter((r) => r.status !== 'submitted')} side="agency" />
    </section>
  )
}
