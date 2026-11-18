'use client'
// components/partners/PartnerNetworkView.tsx — the Partner network page for both sides.
// Developer: send a request with an agency's partner code, share projects (and choose how much inventory the
// agency sees), pause/end, and review buyer registrations. Agency: hand out its partner code, accept or
// decline requests, see shared projects and their inventory, and follow its registrations.
// Every button calls an API that authorises on the server; this component only hides what the role cannot do.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check, Copy, Handshake, X } from 'lucide-react'
import { Alert, Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Field, Input, Select } from '@/components/ui'
import {
  allowedActions, DEFAULT_VISIBILITY, REGISTRATION_LABEL, STATUS_LABEL, VISIBILITY_LABEL,
  type InventoryVisibility, type PartnerAction, type PartnershipStatus, type RegistrationStatus,
} from '@/lib/partners/rules'
import { formatCurrency, formatDate } from '@/lib/utils/format'
import type { AgencyRegistrationView, DeveloperRegistrationView, PartnershipView, PartnerUnit } from '@/lib/dal/partners'

const ACTION_LABEL: Record<PartnerAction, string> = { accept: 'Accept', reject: 'Decline', cancel: 'Withdraw request', pause: 'Pause', resume: 'Resume', end: 'End partnership' }
const ACTION_CONFIRM: Partial<Record<PartnerAction, string>> = {
  end: 'End this partnership? Pending registrations are withdrawn and shared projects stop being visible. Accepted buyers stay protected until their dates. A new request is needed to partner again.',
  pause: 'Pause this partnership? No new registrations can be made until the side that paused resumes it. Pending registrations can still be reviewed.',
  reject: 'Decline this partnership request?',
}
const STATUS_TONE: Record<PartnershipStatus, 'success' | 'warning' | 'neutral' | 'info'> = {
  invited: 'info', active: 'success', paused: 'warning', rejected: 'neutral', cancelled: 'neutral', ended: 'neutral',
}
const REG_TONE: Record<RegistrationStatus, 'success' | 'warning' | 'neutral' | 'info' | 'danger'> = {
  submitted: 'info', accepted: 'success', rejected: 'danger', conflicted: 'warning', withdrawn: 'neutral', expired: 'neutral',
}

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; error?: string; data?: unknown }> {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  return res.ok ? { ok: true, data: json.data } : { ok: false, error: json.error || 'Something went wrong. Please try again.' }
}

export function PartnerNetworkView(props: {
  orgId: string
  side: 'developer' | 'agency'
  canManage: boolean
  partnerships: PartnershipView[]
  partnerCode?: string | null
  projects?: { id: string; name: string }[]
  developerRegistrations?: DeveloperRegistrationView[]
  agencyRegistrations?: AgencyRegistrationView[]
  orgSlug: string
}) {
  const { side, partnerships } = props
  const live = partnerships.filter((p) => ['invited', 'active', 'paused'].includes(p.status))
  const past = partnerships.filter((p) => !['invited', 'active', 'paused'].includes(p.status))
  return (
    <div className="space-y-6">
      {side === 'agency' ? <PartnerCodeCard {...props} /> : props.canManage && <RequestCard orgId={props.orgId} />}

      <section aria-labelledby="partners-h" className="space-y-3">
        <h2 id="partners-h" className="text-[14px] font-semibold text-foreground">{side === 'developer' ? 'Partner agencies' : 'Developers you work with'}</h2>
        {live.length === 0 ? (
          <EmptyState icon={Handshake} title="No partnerships yet"
            description={side === 'developer'
              ? 'Ask an agency for its partner code and send a request. They accept it from their own workspace.'
              : 'Give your partner code to a developer. Their request appears here for you to accept.'} />
        ) : live.map((p) => <PartnershipCard key={p.id} p={p} {...props} />)}
        {past.length > 0 && (
          <details className="rounded-lg border border-default bg-surface p-3 text-[13px]">
            <summary className="cursor-pointer text-muted">Earlier partnerships ({past.length})</summary>
            <ul className="mt-2 space-y-1">
              {past.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.partnerName}</span>
                  <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  <span className="text-subtle">since {formatDate(p.createdAt)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {side === 'developer'
        ? <DeveloperQueue orgId={props.orgId} rows={props.developerRegistrations ?? []} orgSlug={props.orgSlug} />
        : <AgencyRegistrations rows={props.agencyRegistrations ?? []} orgSlug={props.orgSlug} />}
    </div>
  )
}

function PartnerCodeCard({ orgId, canManage, partnerCode }: { orgId: string; canManage: boolean; partnerCode?: string | null }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your partner code</CardTitle>
        <CardDescription>Developers enter this code to send your agency a partnership request. It identifies your agency only; it gives no access.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        {partnerCode ? (
          <>
            <code className="rounded-md border border-default bg-surface-hover px-3 py-2 font-mono text-[15px] tracking-wider">{partnerCode}</code>
            <Button variant="secondary" size="sm" onClick={() => { navigator.clipboard?.writeText(partnerCode); setCopied(true) }}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
            </Button>
          </>
        ) : canManage ? (
          <Button disabled={busy} onClick={async () => {
            setBusy(true); setError(null)
            const r = await send('/api/partners/code', 'POST', { orgId })
            setBusy(false)
            if (!r.ok) setError(r.error!); else router.refresh()
          }}>{busy ? 'Creating…' : 'Create partner code'}</Button>
        ) : (
          <p className="text-[13px] text-muted">An owner or admin can create your agency’s partner code.</p>
        )}
        {error && <Alert tone="danger" className="w-full">{error}</Alert>}
      </CardContent>
    </Card>
  )
}

function RequestCard({ orgId }: { orgId: string }) {
  const router = useRouter()
  const [code, setCode] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [msg, setMsg] = React.useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle>Add a partner agency</CardTitle>
        <CardDescription>Enter the partner code the agency gave you. They see your request in their workspace and decide whether to accept.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true); setMsg(null)
          const r = await send('/api/partners', 'POST', { orgId, code })
          setBusy(false)
          if (!r.ok) { setMsg({ tone: 'danger', text: r.error! }); return }
          setCode(''); setMsg({ tone: 'success', text: 'Request sent. The agency will see it in their workspace.' }); router.refresh()
        }}>
          <div className="sm:w-72">
            <Field label="Partner code">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="RGP-XXXXXXXXXX" autoComplete="off" spellCheck={false} />
            </Field>
          </div>
          <Button type="submit" disabled={busy || code.trim().length < 4}>{busy ? 'Sending…' : 'Send request'}</Button>
        </form>
        {msg && <Alert tone={msg.tone} className="mt-3">{msg.text}</Alert>}
      </CardContent>
    </Card>
  )
}

function PartnershipCard({ p, orgId, canManage, projects }: { p: PartnershipView; orgId: string; canManage: boolean; projects?: { id: string; name: string }[] }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const actions = canManage ? allowedActions(p.status, p.side, p.pausedByMe) : []

  async function act(action: PartnerAction) {
    if (ACTION_CONFIRM[action] && !window.confirm(ACTION_CONFIRM[action])) return
    setBusy(action); setError(null)
    const r = await send(`/api/partners/${p.id}/status`, 'POST', { orgId, action })
    setBusy(null)
    if (!r.ok) setError(r.error!); else router.refresh()
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2">
            <Building2 aria-hidden className="size-4 text-subtle" /> {p.partnerName}
            <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
          </CardTitle>
          <CardDescription>
            {p.status === 'invited'
              ? (p.side === 'agency' ? 'Wants to work with your agency.' : 'Waiting for the agency to accept.')
              : `Buyers are protected for ${p.protectionDays} days from acceptance.`}
            {p.status === 'paused' && (p.pausedByMe ? ' You paused this partnership.' : ' Paused by the partner.')}
          </CardDescription>
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button key={a} size="sm" variant={a === 'accept' || a === 'resume' ? 'primary' : a === 'end' || a === 'reject' ? 'danger' : 'secondary'}
                disabled={!!busy} onClick={() => act(a)}>{busy === a ? '…' : ACTION_LABEL[a]}</Button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        {p.side === 'developer'
          ? (['active', 'paused'].includes(p.status) && <SharedProjectsEditor p={p} orgId={orgId} canManage={canManage} projects={projects ?? []} />)
          : (p.status === 'active' && <SharedProjectsList p={p} orgId={orgId} />)}
      </CardContent>
    </Card>
  )
}

function SharedProjectsEditor({ p, orgId, canManage, projects }: { p: PartnershipView; orgId: string; canManage: boolean; projects: { id: string; name: string }[] }) {
  const router = useRouter()
  const [error, setError] = React.useState<string | null>(null)
  const [adding, setAdding] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const unshared = projects.filter((x) => !p.projects.some((s) => s.projectId === x.id))

  async function share(projectId: string, visibility: InventoryVisibility | null) {
    if (visibility === null && !window.confirm('Stop sharing this project? The agency can no longer see it or register buyers for it.')) return
    setBusy(true); setError(null)
    const r = await send(`/api/partners/${p.id}/projects`, 'PUT', { orgId, projectId, visibility })
    setBusy(false)
    if (!r.ok) setError(r.error!); else { setAdding(''); router.refresh() }
  }

  return (
    <div className="space-y-2">
      <h3 className="text-[12px] font-semibold uppercase tracking-wide text-subtle">Shared projects</h3>
      {p.projects.length === 0 && <p className="text-[13px] text-muted">No projects shared yet. The agency can only register buyers for projects you share.</p>}
      <ul className="divide-y divide-default rounded-lg border border-default">
        {p.projects.map((s) => (
          <li key={s.projectId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-[13px] font-medium">{s.name}{s.city ? <span className="text-muted"> · {s.city}</span> : null}</span>
            {canManage ? (
              <span className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor={`vis-${p.id}-${s.projectId}`}>What the agency sees of {s.name}</label>
                <Select id={`vis-${p.id}-${s.projectId}`} className="h-9 w-auto" value={s.visibility} disabled={busy}
                  onChange={(e) => share(s.projectId, e.target.value as InventoryVisibility)}>
                  {(Object.keys(VISIBILITY_LABEL) as InventoryVisibility[]).map((v) => <option key={v} value={v}>{VISIBILITY_LABEL[v]}</option>)}
                </Select>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => share(s.projectId, null)}><X aria-hidden /> Stop sharing</Button>
              </span>
            ) : <Badge>{VISIBILITY_LABEL[s.visibility]}</Badge>}
          </li>
        ))}
      </ul>
      {canManage && unshared.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="sm:w-72">
            <Field label="Share another project" hint={`Starts as “${VISIBILITY_LABEL[DEFAULT_VISIBILITY]}”. You can change it.`}>
              <Select value={adding} onChange={(e) => setAdding(e.target.value)}>
                <option value="">Choose a project…</option>
                {unshared.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </Select>
            </Field>
          </div>
          <Button variant="secondary" disabled={!adding || busy} onClick={() => share(adding, DEFAULT_VISIBILITY)}>Share</Button>
        </div>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </div>
  )
}

function SharedProjectsList({ p, orgId }: { p: PartnershipView; orgId: string }) {
  const [openId, setOpenId] = React.useState<string | null>(null)
  const [units, setUnits] = React.useState<PartnerUnit[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  async function toggle(projectId: string) {
    if (openId === projectId) { setOpenId(null); return }
    setOpenId(projectId); setUnits(null); setError(null)
    const res = await fetch(`/api/partners/${p.id}/projects/${projectId}/inventory?orgId=${orgId}`)
    const json = await res.json().catch(() => ({}))
    if (!res.ok) setError(json.error || 'Could not load the inventory.'); else setUnits(json.data)
  }

  if (p.projects.length === 0) return <p className="text-[13px] text-muted">The developer has not shared any projects yet.</p>
  return (
    <ul className="divide-y divide-default rounded-lg border border-default">
      {p.projects.map((s) => (
        <li key={s.projectId} className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium">{s.name}{s.city ? <span className="text-muted"> · {s.city}</span> : null}</span>
            {s.visibility === 'none'
              ? <Badge>{VISIBILITY_LABEL.none}</Badge>
              : <Button size="sm" variant="secondary" aria-expanded={openId === s.projectId} onClick={() => toggle(s.projectId)}>
                  {openId === s.projectId ? 'Hide inventory' : 'View inventory'}
                </Button>}
          </div>
          {openId === s.projectId && (
            <div className="mt-3">
              {error ? <Alert tone="danger">{error}</Alert> : !units ? <p className="text-[13px] text-muted">Loading…</p> : units.length === 0 ? (
                <p className="text-[13px] text-muted">No units listed.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-[13px]">
                    <thead className="text-[12px] text-subtle">
                      <tr><th className="py-1 pr-3 font-medium">Unit</th><th className="py-1 pr-3 font-medium">Configuration</th><th className="py-1 pr-3 font-medium">Status</th>{s.visibility === 'availability_and_price' && <th className="py-1 font-medium">Price</th>}</tr>
                    </thead>
                    <tbody>
                      {units.map((u) => (
                        <tr key={u.unitId} className="border-t border-default">
                          <td className="py-1.5 pr-3">{[u.tower, u.unitNumber].filter(Boolean).join(' · ')}</td>
                          <td className="py-1.5 pr-3">{u.configuration ?? '—'}</td>
                          <td className="py-1.5 pr-3"><Badge tone={u.available ? 'success' : 'neutral'}>{u.available ? 'Available' : 'Not available'}</Badge></td>
                          {'price' in u && <td className="py-1.5 tabular-nums">{u.price != null ? formatCurrency(u.price) : '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}

function DeveloperQueue({ orgId, rows, orgSlug }: { orgId: string; rows: DeveloperRegistrationView[]; orgSlug: string }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [error, setError] = React.useState<{ id: string; text: string } | null>(null)
  const [rejecting, setRejecting] = React.useState<string | null>(null)
  const [reason, setReason] = React.useState('')

  async function review(id: string, accept: boolean) {
    setBusy(id); setError(null)
    const r = await send(`/api/partners/registrations/${id}/review`, 'POST', { orgId, accept, reason: accept ? null : reason.trim() })
    setBusy(null)
    if (!r.ok) { setError({ id, text: r.error! }); return }
    setRejecting(null); setReason(''); router.refresh()
  }

  const pending = rows.filter((r) => r.status === 'submitted')
  const rest = rows.filter((r) => r.status !== 'submitted')
  return (
    <section aria-labelledby="reg-h" className="space-y-3">
      <h2 id="reg-h" className="text-[14px] font-semibold text-foreground">Buyer registrations</h2>
      {rows.length === 0 && <EmptyState title="No registrations yet" description="When a partner agency registers a buyer for a shared project, it appears here for review." />}
      {pending.map((r) => (
        <Card key={r.id}>
          <CardContent className="space-y-2 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="font-semibold">{r.buyerName}</span><span className="tabular-nums text-muted">{r.buyerPhone}</span>
              <Badge tone="info">{REGISTRATION_LABEL.submitted}</Badge>
            </div>
            <p className="text-[12px] text-muted">From {r.agencyName}{r.projectName ? ` for ${r.projectName}` : ''} · {formatDate(r.submittedAt)}</p>
            {r.note && <p className="rounded-md bg-surface-hover p-2 text-[13px]">{r.note}</p>}
            {rejecting === r.id ? (
              <div className="space-y-2">
                <Field label="Reason (the agency sees this)" required>
                  <Input value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} />
                </Field>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" disabled={!reason.trim() || busy === r.id} onClick={() => review(r.id, false)}>Reject registration</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={busy === r.id} onClick={() => review(r.id, true)}><Check aria-hidden /> Accept and create lead</Button>
                <Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => { setRejecting(r.id); setReason('') }}>Reject</Button>
              </div>
            )}
            {error?.id === r.id && <Alert tone="danger">{error.text}</Alert>}
          </CardContent>
        </Card>
      ))}
      {rest.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-default bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-subtle"><tr>
              <th className="px-3 py-2 font-medium">Buyer</th><th className="px-3 py-2 font-medium">Agency</th><th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Protected until</th>
            </tr></thead>
            <tbody>
              {rest.map((r) => (
                <tr key={r.id} className="border-t border-default">
                  <td className="px-3 py-2">{r.developerLeadId ? <a className="underline" href={`/${orgSlug}/leads/${r.developerLeadId}`}>{r.buyerName}</a> : r.buyerName}</td>
                  <td className="px-3 py-2">{r.agencyName}</td>
                  <td className="px-3 py-2">{r.projectName ?? '—'}</td>
                  <td className="px-3 py-2"><Badge tone={REG_TONE[r.status]}>{REGISTRATION_LABEL[r.status]}</Badge></td>
                  <td className="px-3 py-2 tabular-nums">{r.status === 'accepted' && r.protectedUntil ? formatDate(r.protectedUntil) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function AgencyRegistrations({ rows, orgSlug }: { rows: AgencyRegistrationView[]; orgSlug: string }) {
  return (
    <section aria-labelledby="reg-h" className="space-y-3">
      <h2 id="reg-h" className="text-[14px] font-semibold text-foreground">Your registrations</h2>
      {rows.length === 0 ? (
        <EmptyState title="No registrations yet" description="Open one of your leads and choose “Register with developer” to register the buyer for a shared project." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-default bg-surface">
          <table className="w-full text-left text-[13px]">
            <thead className="text-[12px] text-subtle"><tr>
              <th className="px-3 py-2 font-medium">Buyer</th><th className="px-3 py-2 font-medium">Developer</th><th className="px-3 py-2 font-medium">Project</th>
              <th className="px-3 py-2 font-medium">Status</th><th className="px-3 py-2 font-medium">Protected until</th>
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-default align-top">
                  <td className="px-3 py-2">{r.agencyLeadId ? <a className="underline" href={`/${orgSlug}/leads/${r.agencyLeadId}`}>{r.buyerName}</a> : r.buyerName}</td>
                  <td className="px-3 py-2">{r.developerName}</td>
                  <td className="px-3 py-2">{r.projectName ?? '—'}</td>
                  <td className="px-3 py-2">
                    <Badge tone={REG_TONE[r.status]}>{REGISTRATION_LABEL[r.status]}</Badge>
                    {r.status === 'rejected' && r.rejectionReason && <p className="mt-1 text-[12px] text-muted">{r.rejectionReason}</p>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">{r.protectedUntil ? formatDate(r.protectedUntil) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
