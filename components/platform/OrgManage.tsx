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

type Preview = { data: Record<string, number>; locked: Record<string, number>; dataText: string; lockedText: string }

export function DeleteOrg({ orgId, name }: { orgId: string; name: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [purge, setPurge] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const url = `/api/admin/organisations/${orgId}/delete`
  const done = () => { setOpen(false); router.push('/platform/organisations'); router.refresh() }
  const hasData = Boolean(preview && Object.keys(preview.data).length)
  const locked = Boolean(preview && Object.keys(preview.locked).length)

  const loadPreview = async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 404) return done()
      const json = await res.json().catch(() => ({}))
      if (res.ok) setPreview(json); else setError(json.error ?? 'Could not check what this workspace holds.')
    } catch { setError('Could not check what this workspace holds. Check your connection and try again.') }
  }

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmName: confirm, reason, purgeData: purge }) })
      const json = await res.json().catch(() => ({}))
      if (res.ok || res.status === 404) return done()
      setError(json.error ?? 'Something went wrong.')
    } catch {
      // The reply was lost (network, timeout). The delete may still have happened: ask again before saying it failed.
      try { if ((await fetch(url, { cache: 'no-store' })).status === 404) return done() } catch { /* fall through */ }
      setError('We couldn’t confirm the delete. Check your connection, then refresh this page to see whether the workspace is still there.')
    }
    setBusy(false)
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        Permanently removes this workspace, its members’ access to it, settings and invitations. A workspace with leads, projects or inventory can be
        removed together with that data — use this only for test or duplicate workspaces. Workspaces with invoices or payments can’t be deleted.
        People’s REGrow accounts are kept. To stop a real customer, use <strong className="text-foreground">Deactivated</strong> under Workspace state: the data is kept.
      </p>
      <Dialog open={open} onOpenChange={(o) => {
        setOpen(o)
        if (o) void loadPreview()
        else { setConfirm(''); setReason(''); setPurge(false); setPreview(null); setError(null) }
      }}>
        <DialogTrigger asChild>
          <Button variant="danger"><Trash2 className="size-4" aria-hidden="true" />Delete workspace…</Button>
        </DialogTrigger>
        <DialogContent title={`Delete ${name}?`} description="This can’t be undone. It is recorded in the platform audit log.">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
            {!preview && !error && <p className="text-[13px] text-muted" role="status">Checking what this workspace holds…</p>}
            {preview && !hasData && !locked && <p className="text-[13px] text-muted">This workspace holds no leads, projects or other data.</p>}
            {locked && (
              <Alert tone="danger">This workspace has {preview!.lockedText}, which must be kept, so it can’t be deleted. Deactivate it instead.</Alert>
            )}
            {hasData && !locked && (
              <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-danger/40 bg-danger/5 p-3 text-[13px]">
                <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-current text-danger" />
                <span>
                  <strong className="font-semibold">Also delete its data:</strong> {preview!.dataText}.
                  <span className="block text-muted">Only for a test or duplicate workspace. Everything is removed for good.</span>
                </span>
              </label>
            )}
            <Field label={`Type ${name} to confirm`} required><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" disabled={locked} /></Field>
            <Field label="Reason" required><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="e.g. Test workspace" maxLength={500} disabled={locked} /></Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="danger"
                disabled={busy || !preview || locked || (hasData && !purge) || confirm.trim() !== name.trim() || reason.trim().length < 3}>
                {busy ? 'Deleting…' : hasData ? 'Delete workspace and data' : 'Delete permanently'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
