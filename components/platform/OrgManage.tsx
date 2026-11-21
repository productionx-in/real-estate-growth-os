'use client'
// components/platform/OrgManage.tsx — manage a customer workspace from the console: rename, extend a trial, and
// permanently delete one that holds no business data. Every action is checked again on the server and audited.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Alert, Button, Field, Input, Textarea } from '@/components/ui'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong.')
  return json
}
type Msg = { tone: 'success' | 'danger'; text: string } | null

export function RenameOrg({ orgId, name }: { orgId: string; name: string }) {
  const router = useRouter()
  const [value, setValue] = useState(name)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null)
      try { await call(`/api/admin/organisations/${orgId}/details`, 'PATCH', { name: value }); setMsg({ tone: 'success', text: 'Name saved.' }); router.refresh() }
      catch (err) { setMsg({ tone: 'danger', text: (err as Error).message }) } finally { setBusy(false) }
    }}>
      <Field label="Workspace name" hint="The web address stays the same, so members' links keep working.">
        <Input value={value} onChange={(e) => setValue(e.target.value)} maxLength={120} required />
      </Field>
      <Button type="submit" disabled={busy || value.trim() === name || value.trim().length < 2}>{busy ? 'Saving…' : 'Save name'}</Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  )
}

export function ExtendTrial({ orgId, endsAt }: { orgId: string; endsAt: string | null }) {
  const router = useRouter()
  const [days, setDays] = useState(14)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)
  const fmt = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso))
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setMsg(null)
      try { const r = await call(`/api/admin/organisations/${orgId}/trial`, 'POST', { days, reason }); setMsg({ tone: 'success', text: `Trial now ends ${fmt(r.trialEndsAt)}.` }); setReason(''); router.refresh() }
      catch (err) { setMsg({ tone: 'danger', text: (err as Error).message }) } finally { setBusy(false) }
    }}>
      <p className="text-[13px] text-muted">Trial ends {endsAt ? <strong className="text-foreground">{fmt(endsAt)}</strong> : 'without a date'}.</p>
      <div role="group" aria-label="Extend by" className="flex flex-wrap gap-2">
        {[7, 14, 30].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} aria-pressed={days === d}
            className={`min-h-9 rounded-full border px-3.5 text-[13px] font-medium ${days === d ? 'border-transparent bg-foreground text-background' : 'border-default text-muted hover:text-foreground'}`}>
            +{d} days
          </button>
        ))}
      </div>
      <Field label="Reason" required><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Waiting for Meta approval" maxLength={300} /></Field>
      <Button type="submit" disabled={busy || reason.trim().length < 3}>{busy ? 'Extending…' : `Extend trial by ${days} days`}</Button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </form>
  )
}

export function DeleteOrg({ orgId, name }: { orgId: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        Permanently removes this workspace, its members’ access to it, settings and invitations. Only possible while it holds no business data
        (leads, projects, inventory, bookings, invoices or payments). People’s REGrow accounts are kept. To stop a customer who has data, use
        <strong className="text-foreground"> Deactivated</strong> under Workspace state: the data is kept.
      </p>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setConfirm(''); setReason(''); setError(null) } }}>
        <DialogTrigger asChild>
          <Button variant="danger"><Trash2 className="size-4" aria-hidden="true" />Delete workspace…</Button>
        </DialogTrigger>
        <DialogContent title={`Delete ${name}?`} description="This can’t be undone. It is recorded in the platform audit log.">
          <form className="space-y-3" onSubmit={async (e) => {
            e.preventDefault(); setBusy(true); setError(null)
            try { await call(`/api/admin/organisations/${orgId}/delete`, 'POST', { confirmName: confirm, reason }); router.push('/platform/organisations'); router.refresh() }
            catch (err) { setError((err as Error).message); setBusy(false) }
          }}>
            <Field label={`Type ${name} to confirm`} required><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
            <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Duplicate created by mistake" maxLength={500} /></Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="danger" disabled={busy || confirm.trim() !== name.trim() || reason.trim().length < 3}>{busy ? 'Deleting…' : 'Delete permanently'}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
