'use client'
// components/platform/PaymentsConsole.tsx — the payments screen in Platform Admin. Every button calls
// /api/admin/payments, which checks the staff role and MFA again; the database checks the role a third time and
// refuses self-approval of refunds. No secret is ever shown here.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, AlertTriangle, CheckCircle2, RefreshCw, ShieldCheck } from 'lucide-react'
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, Select, Textarea } from '@/components/ui'
import type { PaymentsOverview } from '@/lib/payments/admin'

const rupees = (paise: number | string | null) => (paise == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise) / 100))
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '—')
const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral' | 'info'> = {
  enabled: 'success', sandbox_validated: 'info', draining: 'warning', suspended: 'danger', disabled: 'neutral',
  requested: 'warning', approved: 'info', submitted: 'info', processed: 'success', failed: 'danger', rejected: 'neutral',
}

export function PaymentsConsole({ overview, role, userId }: { overview: PaymentsOverview; role: string; userId: string }) {
  const router = useRouter()
  const owner = role === 'super_admin'
  const operator = owner || role === 'finance_admin'
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)

  async function act(key: string, body: Record<string, unknown>, done = 'Done.') {
    setBusy(key); setMsg(null)
    const res = await fetch('/api/admin/payments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) { setMsg({ tone: 'danger', text: json.error ?? 'The action failed.' }); return false }
    setMsg({ tone: json.warning ? 'danger' : 'success', text: json.warning ?? done })
    router.refresh()
    return true
  }
  const ask = (q: string) => (window.prompt(q) ?? '').trim()

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Payments</h1>
          <p className="text-[13px] text-muted">Environment: <strong>{overview.environment}</strong>. Gateway credentials are set in the server environment, never here. There is no automatic failover.</p>
        </div>
        {operator && <Button variant="secondary" size="sm" disabled={!!busy} onClick={() => act('health', { action: 'health_check' }, 'Health checked.')}><RefreshCw className="w-4 h-4" aria-hidden="true" /> Check gateways now</Button>}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4" aria-hidden="true" /> Open alerts</CardTitle>
          <CardDescription>Checked every 5 minutes. The Platform Owner and finance staff are e-mailed when an alert opens and daily while it stays open; it closes by itself once fixed.</CardDescription>
        </CardHeader>
        <CardContent>
          {overview.alerts.length === 0 ? <p className="text-[13px] text-muted">No open alerts.</p> : (
            <ul className="space-y-2 text-[13px]">
              {overview.alerts.map((a) => (
                <li key={a.id} className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger-bg)] px-3 py-2">
                  <strong className="capitalize">{a.kind.replace(/_/g, ' ')}</strong>{a.scope ? ` (${a.scope})` : ''} — {a.detail}
                  <span className="block text-subtle">Open since {when(a.opened_at)} · last seen {when(a.last_seen_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <section aria-labelledby="gw" className="grid gap-4 md:grid-cols-2">
        <h2 id="gw" className="sr-only">Gateways</h2>
        {overview.gateways.map((g) => (
          <Card key={`${g.provider}-${g.environment}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 capitalize">
                {g.provider} <span className="text-[12px] font-normal text-muted">({g.environment})</span>
                {g.is_primary && <Badge tone="brand">Primary</Badge>}
                <Badge tone={STATUS_TONE[g.status] ?? 'neutral'}>{g.status.replace('_', ' ')}</Badge>
              </CardTitle>
              <CardDescription>{g.notes}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-[13px]">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                <dt className="text-muted">API health</dt>
                <dd className="flex items-center gap-1">{g.last_health_ok == null ? '—' : g.last_health_ok ? <><CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" /> OK</> : <><AlertTriangle className="w-4 h-4 text-danger" aria-hidden="true" /> {g.last_health_error ?? 'Failing'}</>} <span className="text-subtle">{when(g.last_health_at)}</span></dd>
                <dt className="text-muted">Last webhook</dt><dd>{when(g.last_webhook_at)}</dd>
                <dt className="text-muted">Webhook failures (24 h)</dt><dd>{g.webhookFailures24h}</dd>
                <dt className="text-muted">Invalid signatures (24 h)</dt><dd className={g.invalidSignatures24h ? 'text-danger font-semibold' : ''}>{g.invalidSignatures24h}</dd>
                <dt className="text-muted">Checkouts waiting &gt; 30 min</dt><dd>{g.stuckAttempts}</dd>
                <dt className="text-muted">Success rate (7 days)</dt><dd>{g.successRate7d == null ? '—' : `${g.successRate7d}%`}</dd>
              </dl>
              {owner && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {!g.is_primary && g.status === 'enabled' && (
                    <Button size="sm" disabled={!!busy} onClick={() => { const note = ask(`Make ${g.provider} the primary gateway for ${g.environment}? New checkouts will use it; existing payments are unaffected. Reason:`); if (note) act(`p-${g.provider}`, { action: 'set_primary', provider: g.provider, environment: g.environment, note }, 'Primary gateway switched.') }}>Make primary</Button>
                  )}
                  <Select aria-label={`Change ${g.provider} ${g.environment} status`} className="h-9 w-auto text-[13px]" value="" disabled={!!busy}
                    onChange={(e) => { const status = e.target.value; const note = ask(`Change ${g.provider} (${g.environment}) to ${status}? Reason:`); if (note) act(`s-${g.provider}`, { action: 'gateway_status', provider: g.provider, environment: g.environment, status, note }, 'Status changed.') }}>
                    <option value="" disabled>Change status…</option>
                    {['sandbox_validated', 'enabled', 'draining', 'suspended', 'disabled'].filter((s) => s !== g.status).map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
                  </Select>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Refunds</CardTitle>
          <CardDescription>Every refund needs approval by someone other than the requester; above {rupees(overview.settings?.refund_second_approval_above_cents ?? 0)}, two independent approvers. Refunds always go through the provider that took the payment.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {overview.refunds.length === 0 ? <p className="text-[13px] text-muted">No refunds yet.</p> : (
            <table className="w-full min-w-[720px] text-[13px]">
              <thead><tr className="text-left text-muted border-b border-default"><th className="py-2 font-medium">Requested</th><th className="font-medium">Amount</th><th className="font-medium">Reason</th><th className="font-medium">Approvals</th><th className="font-medium">Status</th><th /></tr></thead>
              <tbody>
                {overview.refunds.map((r) => {
                  const approved = r.approvals.filter((x) => x.decision === 'approved').length
                  const decided = r.approvals.some((x) => x.approver === userId)
                  return (
                    <tr key={r.id} className="border-b border-default align-top">
                      <td className="py-2">{when(r.requested_at)}<div className="text-subtle capitalize">{r.provider}</div></td>
                      <td>{rupees(r.amount_cents)}</td>
                      <td className="max-w-[260px]">{r.reason}{r.failure_reason && <div className="text-danger">{r.failure_reason}</div>}</td>
                      <td>{approved} / {r.approvals_required}</td>
                      <td><Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge></td>
                      <td className="text-right space-x-2 whitespace-nowrap">
                        {operator && r.status === 'requested' && r.requested_by !== userId && !decided && <>
                          <Button size="sm" disabled={!!busy} onClick={() => act(`a-${r.id}`, { action: 'refund_decide', refundId: r.id, decision: 'approved' }, 'Approved.')}>Approve</Button>
                          <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { const note = ask('Reason for rejecting:'); if (note) act(`r-${r.id}`, { action: 'refund_decide', refundId: r.id, decision: 'rejected', note }, 'Rejected.') }}>Reject</Button>
                        </>}
                        {operator && r.status === 'approved' && <Button size="sm" disabled={!!busy} onClick={() => act(`e-${r.id}`, { action: 'refund_execute', refundId: r.id }, 'Sent to the provider.')}>Send to provider</Button>}
                        {r.status === 'requested' && r.requested_by === userId && <span className="text-subtle">Awaiting another approver</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Unapplied money</CardTitle><CardDescription>Received but not applied (invoice already paid, amount differs…). Refund it or resolve it.</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-[13px]">
            {overview.unapplied.length === 0 ? <p className="text-muted">Nothing to resolve.</p> : overview.unapplied.map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 border-b border-default pb-2">
                <div><strong>{rupees(u.amount_cents)}</strong> <span className="capitalize">{u.provider}</span> · {u.reason.replace(/_/g, ' ')}<div className="text-subtle">{when(u.created_at)} · {u.status.replace('_', ' ')}</div></div>
                {operator && u.status === 'open' && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { const reason = ask('Reason for the refund:'); if (reason) act(`u-${u.id}`, { action: 'refund_request', unappliedId: u.id, amountPaise: Number(u.amount_cents), reason }, 'Refund requested; it needs approval.') }}>Request refund</Button>}
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Disputes</CardTitle><CardDescription>Open chargebacks, soonest response deadline first. Respond in the provider dashboard with the invoice and usage history.</CardDescription></CardHeader>
          <CardContent className="space-y-2 text-[13px]">
            {overview.disputes.length === 0 ? <p className="text-muted">No open disputes.</p> : overview.disputes.map((d) => (
              <div key={d.id} className="border-b border-default pb-2"><strong>{rupees(d.amount_cents)}</strong> <span className="capitalize">{d.provider}</span> · {d.status.replace('_', ' ')}<div className="text-subtle">Respond by {when(d.respond_by)}</div></div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reconciliation exceptions</CardTitle>
          <CardDescription>Provider settlements are matched to recorded payments every night. Anything that does not match is listed here until resolved.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-[13px]">
          {operator && <div className="flex gap-2">{overview.gateways.filter((g) => g.status !== 'disabled').map((g) => (
            <Button key={g.provider + g.environment} size="sm" variant="secondary" disabled={!!busy} onClick={() => act(`rc-${g.provider}`, { action: 'reconcile', provider: g.provider, days: 7 }, 'Reconciliation finished.')}><Activity className="w-4 h-4" aria-hidden="true" /> Reconcile {g.provider} (7 days)</Button>
          ))}</div>}
          {overview.reconciliation.length === 0 ? <p className="text-muted">No open exceptions.</p> : overview.reconciliation.map((i) => (
            <div key={i.id} className="flex items-center justify-between gap-2 border-b border-default pb-2">
              <div>{i.kind.replace(/_/g, ' ')} · {i.provider_payment_id ?? '—'}<div className="text-subtle">Expected {rupees(i.expected_cents)} · settled {rupees(i.actual_cents)} · {when(i.created_at)}</div></div>
              {operator && <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => { const note = ask('How was this resolved?'); if (note) act(`ri-${i.id}`, { action: 'resolve_item', itemId: i.id, note }, 'Resolved.') }}>Resolve</Button>}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-5 h-5" aria-hidden="true" /> Verified provider outages</CardTitle>
          <CardDescription>Recording a verified outage gives customers whose payment was due during it {overview.settings?.outage_grace_days ?? 3} extra days to pay. Platform Owner only.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-[13px]">
          {overview.outages.map((o) => <div key={o.id} className="border-b border-default pb-2 capitalize">{o.provider} ({o.environment}) · {when(o.started_at)} – {when(o.ended_at)} · {o.affected} customers given {o.grace_days} days<div className="normal-case text-subtle">{o.evidence}</div></div>)}
          {owner && <OutageForm busy={!!busy} onSubmit={(b) => act('outage', { action: 'outage_record', ...b }, 'Outage recorded and extra days granted.')} />}
        </CardContent>
      </Card>

      <GstSettings settings={overview.settings} owner={owner} busy={!!busy} onSave={(v) => act('gst', { action: 'update_gst', ...v }, 'GST particulars saved. They apply to invoices issued from now on.')} />

      <p className="text-[12px] text-subtle">Recurring payments: {overview.settings?.recurring_payments_enabled ? 'enabled' : 'disabled until merchant approval and testing are complete'}. Mandates: {overview.mandates.length ? overview.mandates.map(([s, n]) => `${s} ${n}`).join(', ') : 'none'}.</p>
    </div>
  )
}

function OutageForm({ busy, onSubmit }: { busy: boolean; onSubmit: (b: Record<string, string>) => Promise<boolean> }) {
  const [f, setF] = useState({ provider: 'razorpay', environment: 'live', startedAt: '', endedAt: '', evidence: '' })
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => { e.preventDefault(); if (await onSubmit({ ...f, startedAt: new Date(f.startedAt).toISOString(), endedAt: new Date(f.endedAt).toISOString() })) setF({ ...f, evidence: '' }) }}>
      <Field label="Provider"><Select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}><option value="razorpay">Razorpay</option><option value="cashfree">Cashfree</option></Select></Field>
      <Field label="Environment"><Select value={f.environment} onChange={(e) => setF({ ...f, environment: e.target.value })}><option value="live">Live</option><option value="test">Test</option></Select></Field>
      <Field label="Started"><Input type="datetime-local" required value={f.startedAt} onChange={(e) => setF({ ...f, startedAt: e.target.value })} /></Field>
      <Field label="Ended"><Input type="datetime-local" required value={f.endedAt} onChange={(e) => setF({ ...f, endedAt: e.target.value })} /></Field>
      <Field label="Evidence (status page or incident reference)" className="sm:col-span-2"><Textarea required minLength={10} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} /></Field>
      <div className="sm:col-span-2"><Button type="submit" disabled={busy}>Record verified outage</Button></div>
    </form>
  )
}

type GstValues = { legalName: string; gstin: string; stateCode: string; sacCode: string }
/** Supplier GST particulars printed on invoices. Values come from the accountant; nothing is pre-filled or assumed. */
function GstSettings({ settings, owner, busy, onSave }: { settings: PaymentsOverview['settings']; owner: boolean; busy: boolean; onSave: (v: GstValues) => Promise<boolean> }) {
  const [v, setV] = useState<GstValues>({
    legalName: settings?.supplier_legal_name ?? '', gstin: settings?.supplier_gstin ?? '',
    stateCode: settings?.supplier_state_code ?? '', sacCode: settings?.sac_code ?? '',
  })
  const missing = [!settings?.supplier_legal_name && 'legal name', !settings?.supplier_gstin && 'GSTIN', !settings?.supplier_state_code && 'state code', !settings?.sac_code && 'SAC code'].filter(Boolean)
  const set = (k: keyof GstValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="w-4 h-4" aria-hidden="true" /> GST on invoices</CardTitle>
        <CardDescription>
          GST rate {settings?.gst_rate_bps != null ? `${settings.gst_rate_bps / 100}%` : 'not set'}. These particulars are copied onto each invoice when it is issued, so a change never alters an issued invoice.
          {missing.length > 0 && <> Missing: <strong>{missing.join(', ')}</strong> — until filled, invoices show no GSTIN and no CGST/SGST/IGST split.</>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => { e.preventDefault(); onSave(v) }}>
          <Field label="Supplier legal name"><Input value={v.legalName} onChange={set('legalName')} disabled={!owner || busy} maxLength={200} /></Field>
          <Field label="Supplier GSTIN" hint="15 characters, e.g. 27ABCDE1234F1Z5"><Input value={v.gstin} onChange={set('gstin')} disabled={!owner || busy} maxLength={15} className="uppercase" /></Field>
          <Field label="Supplier state code" hint="2 digits; must match the GSTIN's first two"><Input value={v.stateCode} onChange={set('stateCode')} disabled={!owner || busy} inputMode="numeric" maxLength={2} /></Field>
          <Field label="SAC code" hint="6 digits starting with 99, from your accountant"><Input value={v.sacCode} onChange={set('sacCode')} disabled={!owner || busy} inputMode="numeric" maxLength={6} /></Field>
          {owner ? <div className="md:col-span-2"><Button type="submit" size="sm" disabled={busy}>Save GST particulars</Button></div>
            : <p className="text-[12px] text-muted md:col-span-2">Only the Platform Owner can change these.</p>}
        </form>
      </CardContent>
    </Card>
  )
}
