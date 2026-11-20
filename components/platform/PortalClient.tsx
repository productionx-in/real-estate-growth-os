'use client'
// components/platform/PortalClient.tsx — the interactive parts of the internal portal (sales, support, staff).
// Every action calls a /api/platform route that checks the staff role and MFA again on the server.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'

async function send(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong.')
  return json
}

function useAction() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  async function run(fn: () => Promise<unknown>, ok: string) {
    setBusy(true); setMsg(null)
    try { await fn(); setMsg({ tone: 'success', text: ok }); router.refresh(); return true } catch (e) { setMsg({ tone: 'danger', text: (e as Error).message }); return false } finally { setBusy(false) }
  }
  return { busy, msg, run, router }
}

const STAGE_LABEL: Record<string, string> = {
  new: 'New', contacted: 'Contacted', interested: 'Interested', qualified: 'Qualified', demo_scheduled: 'Demo scheduled', demo_done: 'Demo done',
  trial_started: 'Trial started', negotiation: 'Negotiation', won: 'Won', lost: 'Lost',
}
export { STAGE_LABEL }

export function NewProspectForm() {
  const { busy, msg, run, router } = useAction()
  const [f, setF] = useState({ companyName: '', orgType: 'developer', city: '', source: 'outbound', contactName: '', contactEmail: '', contactPhone: '', notes: '' })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })
  return (
    <form className="grid gap-3 sm:grid-cols-2" onSubmit={async (e) => {
      e.preventDefault()
      await run(async () => { const r = await send('/api/platform/sales', 'POST', { action: 'create', ...f }); router.push(`/platform/sales/${r.id}`) }, 'Prospect added.')
    }}>
      <Field label="Company" required><Input required minLength={2} value={f.companyName} onChange={set('companyName')} /></Field>
      <Field label="Type"><Select value={f.orgType} onChange={set('orgType')}><option value="developer">Developer / builder</option><option value="channel_partner">Channel partner agency</option></Select></Field>
      <Field label="City"><Input value={f.city} onChange={set('city')} /></Field>
      <Field label="Source"><Select value={f.source} onChange={set('source')}>{['website', 'referral', 'event', 'outbound', 'partner', 'other'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
      <Field label="Contact name"><Input value={f.contactName} onChange={set('contactName')} /></Field>
      <Field label="Contact email"><Input type="email" value={f.contactEmail} onChange={set('contactEmail')} /></Field>
      <Field label="Contact phone"><Input type="tel" value={f.contactPhone} onChange={set('contactPhone')} /></Field>
      <Field label="Notes" className="sm:col-span-2"><Textarea value={f.notes} onChange={set('notes')} /></Field>
      <div className="sm:col-span-2 flex items-center gap-3"><Button type="submit" disabled={busy}>Add prospect</Button>{msg && <Alert tone={msg.tone}>{msg.text}</Alert>}</div>
    </form>
  )
}

export function ImportWebsiteButton() {
  const { busy, msg, run } = useAction()
  const [n, setN] = useState<number | null>(null)
  return (
    <div className="flex items-center gap-3">
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(async () => { const r = await send('/api/platform/sales', 'POST', { action: 'import_website' }); setN(r.imported) }, 'Imported.')}>Import website requests</Button>
      {n !== null && <span className="text-[13px] text-muted">{n} new</span>}
      {msg?.tone === 'danger' && <span className="text-[13px] text-danger">{msg.text}</span>}
    </div>
  )
}

export function ProspectControls({ id, stage, ownerUserId, followUp, salesStaff, canAssignAnyone, me }: {
  id: string; stage: string; ownerUserId: string | null; followUp: string | null; salesStaff: { id: string; label: string }[]; canAssignAnyone: boolean; me: string
}) {
  const { busy, msg, run } = useAction()
  const [s, setS] = useState(stage)
  const [lost, setLost] = useState('')
  const [owner, setOwner] = useState(ownerUserId ?? '')
  const [fu, setFu] = useState(followUp ? followUp.slice(0, 16) : '')
  return (
    <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => {
      e.preventDefault()
      run(() => send(`/api/platform/sales/${id}`, 'PATCH', {
        stage: s, lostReason: s === 'lost' ? lost : undefined, ownerUserId: owner === (ownerUserId ?? '') ? undefined : owner || null,
        nextFollowUpAt: fu ? new Date(fu).toISOString() : null,
      }), 'Saved.')
    }}>
      <Field label="Stage"><Select value={s} onChange={(e) => setS(e.target.value)}>{Object.entries(STAGE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Field label="Owner">
        <Select value={owner} onChange={(e) => setOwner(e.target.value)} disabled={!canAssignAnyone && !!ownerUserId}>
          <option value="">Unassigned</option>
          {(canAssignAnyone ? salesStaff : salesStaff.filter((x) => x.id === me)).map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
        </Select>
      </Field>
      <Field label="Next follow-up"><Input type="datetime-local" value={fu} onChange={(e) => setFu(e.target.value)} /></Field>
      {s === 'lost' && <Field label="Why was it lost?" className="sm:col-span-3"><Input required value={lost} onChange={(e) => setLost(e.target.value)} /></Field>}
      <div className="sm:col-span-3 flex items-center gap-3"><Button type="submit" size="sm" disabled={busy}>Save</Button>{msg && <span className={msg.tone === 'danger' ? 'text-[13px] text-danger' : 'text-[13px] text-success'}>{msg.text}</span>}</div>
    </form>
  )
}

export function ActivityForm({ id }: { id: string }) {
  const { busy, msg, run } = useAction()
  const [kind, setKind] = useState('call')
  const [body, setBody] = useState('')
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => send(`/api/platform/sales/${id}`, 'POST', { kind, body }), 'Logged.')) setBody('') }}>
      <div className="flex gap-2">
        <Select aria-label="Activity type" className="w-36" value={kind} onChange={(e) => setKind(e.target.value)}>{['call', 'email', 'meeting', 'note'].map((k) => <option key={k} value={k}>{k}</option>)}</Select>
        <Input aria-label="What happened" required value={body} onChange={(e) => setBody(e.target.value)} placeholder="What happened, and what is next" />
        <Button type="submit" size="sm" disabled={busy}>Log</Button>
      </div>
      {msg?.tone === 'danger' && <p className="text-[13px] text-danger">{msg.text}</p>}
    </form>
  )
}

export function CaseControls({ id, status, priority, assignee, supportStaff }: { id: string; status: string; priority: string; assignee: string | null; supportStaff: { id: string; label: string }[] }) {
  const { busy, msg, run } = useAction()
  const [f, setF] = useState({ status, priority, assignee: assignee ?? '' })
  return (
    <form className="grid gap-3 sm:grid-cols-4 items-end" onSubmit={(e) => { e.preventDefault(); run(() => send(`/api/platform/support/${id}`, 'PATCH', { status: f.status, priority: f.priority, assigneeUserId: f.assignee || null }), 'Saved.') }}>
      <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{['open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</Select></Field>
      <Field label="Priority"><Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>{['low', 'normal', 'high', 'urgent'].map((s) => <option key={s} value={s}>{s}</option>)}</Select></Field>
      <Field label="Assignee"><Select value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })}><option value="">Unassigned</option>{supportStaff.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select></Field>
      <div className="flex items-center gap-2"><Button type="submit" size="sm" disabled={busy}>Save</Button>{msg && <span className={msg.tone === 'danger' ? 'text-[13px] text-danger' : 'text-[13px] text-success'}>{msg.text}</span>}</div>
    </form>
  )
}

export function CaseReplyForm({ id }: { id: string }) {
  const { busy, msg, run } = useAction()
  const [body, setBody] = useState('')
  const [internal, setInternal] = useState(false)
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); if (await run(() => send(`/api/platform/support/${id}`, 'POST', { body, internal }), internal ? 'Note added.' : 'Reply sent.')) setBody('') }}>
      <Textarea aria-label="Reply" required rows={4} value={body} onChange={(e) => setBody(e.target.value)} placeholder={internal ? 'Internal note — the customer never sees this' : 'Reply to the customer'} />
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Internal note</label>
        <Button type="submit" size="sm" disabled={busy}>{internal ? 'Add note' : 'Send reply'}</Button>
        {msg?.tone === 'danger' && <span className="text-[13px] text-danger">{msg.text}</span>}
      </div>
    </form>
  )
}

const ROLE_OPTIONS = [['super_admin', 'Platform Owner'], ['platform_admin', 'Platform admin'], ['finance_admin', 'Finance'], ['sales_manager', 'Sales manager'], ['sales_rep', 'Sales executive'], ['support_agent', 'Support'], ['auditor', 'Auditor (read-only)']]

export function AddStaffForm() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('sales_rep')
  const [link, setLink] = useState<{ email: string; url: string } | null>(null)
  const [copied, setCopied] = useState(false)
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true); setMsg(null); setLink(null); setCopied(false)
    try {
      const r = await send('/api/platform/staff', 'POST', { email, role }) as { setupLink?: string | null; reissued?: boolean }
      if (r.setupLink) setLink({ email, url: r.setupLink })
      setMsg({ tone: 'success', text: r.reissued ? 'They had not signed in yet, so here is a fresh setup link.' : r.setupLink ? 'Added. Send them the setup link below.' : 'Added. They sign in with their existing password, then set up an authenticator app.' })
      setEmail(''); router.refresh()
    } catch (err) { setMsg({ tone: 'danger', text: (err as Error).message }) } finally { setBusy(false) }
  }
  async function copy() {
    if (!link) return
    try { await navigator.clipboard.writeText(link.url); setCopied(true) } catch { setCopied(false) }
  }
  return (
    <form className="grid gap-3 sm:grid-cols-[1fr_200px_auto] items-end" onSubmit={submit}>
      <Field label="Work email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Role"><Select value={role} onChange={(e) => setRole(e.target.value)}>{ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></Field>
      <Button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add staff member'}</Button>
      {msg && <div className="sm:col-span-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {link && (
        <div className="sm:col-span-3 grid gap-2 rounded-lg border border-border bg-surface-hover p-3">
          <p className="text-[13px] text-foreground">One-time setup link for <strong>{link.email}</strong>. Send it to them privately (not in a group chat). It works once and expires soon; if it does, add them again to get a new one.</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly aria-label="Setup link" value={link.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-[12px]" />
            <Button type="button" variant="secondary" onClick={copy}>{copied ? 'Copied' : 'Copy link'}</Button>
          </div>
          <p className="text-[12px] text-muted">They open it, choose a password, then scan a QR code with an authenticator app. After that they sign in at /login?for=staff.</p>
        </div>
      )}
    </form>
  )
}

export function StaffControls({ id, role, active, self }: { id: string; role: string; active: boolean; self: boolean }) {
  const { busy, msg, run } = useAction()
  if (self) return <span className="text-[12px] text-subtle">You</span>
  return (
    <div className="flex items-center gap-2">
      <Select aria-label="Role" className="h-9 w-44 text-[13px]" value={role} disabled={busy} onChange={(e) => run(() => send(`/api/platform/staff/${id}`, 'PATCH', { role: e.target.value }), 'Role changed.')}>
        {ROLE_OPTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </Select>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => send(`/api/platform/staff/${id}`, 'PATCH', { active: !active }), active ? 'Deactivated.' : 'Reactivated.')}>{active ? 'Deactivate' : 'Reactivate'}</Button>
      {msg?.tone === 'danger' && <span className="text-[12px] text-danger">{msg.text}</span>}
    </div>
  )
}
