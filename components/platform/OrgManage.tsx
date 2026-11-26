'use client'
// components/platform/OrgManage.tsx — manage a customer workspace from the console: rename, extend a trial, and
// permanently delete one that holds no business data. Every action is checked again on the server and audited.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Alert, Button, Field, Input, Textarea } from '@/components/ui'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { ChoiceCard } from '@/components/platform/PeopleActions'

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

/** Facebook-style "Deactivate or delete" for a whole customer workspace (Platform Owner only). */
export function DeleteOrg({ orgId, name, state }: { orgId: string; name: string; state: string }) {
  const router = useRouter()
  const deactivated = state === 'deactivated'
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<'deactivate' | 'delete'>(deactivated ? 'delete' : 'deactivate')
  const [confirm, setConfirm] = useState('')
  const [reason, setReason] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const url = `/api/admin/organisations/${orgId}/delete`
  const gone = () => { setOpen(false); router.push('/platform/organisations'); router.refresh() }
  const locked = Boolean(preview && Object.keys(preview.locked).length)
  const reset = () => { setChoice(deactivated ? 'delete' : 'deactivate'); setConfirm(''); setReason(''); setUnderstood(false); setPreview(null); setError(null) }

  const loadPreview = async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.status === 404) return gone()
      const json = await res.json().catch(() => ({}))
      if (res.ok) setPreview(json); else setError(json.error ?? 'Could not check what this workspace holds.')
    } catch { setError('Could not check what this workspace holds. Check your connection and try again.') }
  }

  const submit = async () => {
    setBusy(true); setError(null)
    try {
      if (choice === 'deactivate') {
        const res = await fetch(`/api/admin/organisations/${orgId}/lifecycle`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'deactivated', reason }) })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) { setError(json.error ?? 'Could not deactivate the workspace.'); setBusy(false); return }
        setOpen(false); setBusy(false); reset(); setDone(`${name} is deactivated. Its data is kept; reactivate it any time under Workspace state.`); router.refresh()
        return
      }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmName: confirm, reason, purgeData: true }) })
      const json = await res.json().catch(() => ({}))
      if (res.ok || res.status === 404) return gone()
      setError(json.error ?? 'Something went wrong.')
    } catch {
      // The reply was lost (network, timeout). The delete may still have happened: ask again before saying it failed.
      if (choice === 'delete') { try { if ((await fetch(url, { cache: 'no-store' })).status === 404) return gone() } catch { /* fall through */ } }
      setError('We couldn’t confirm the change. Check your connection, then refresh this page to see the workspace’s state.')
    }
    setBusy(false)
  }

  const deleteReady = !locked && understood && confirm.trim() === name.trim()
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-muted">
        <strong className="text-foreground">Deactivate</strong> to stop everyone using this workspace while keeping all its data — you can bring it back
        any time. <strong className="text-foreground">Permanently delete</strong> to remove the workspace and everything in it for good.
      </p>
      {done && <Alert tone="success">{done}</Alert>}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setDone(null); void loadPreview() } else reset() }}>
        <DialogTrigger asChild>
          <Button variant="danger"><Trash2 className="size-4" aria-hidden="true" />Deactivate or delete…</Button>
        </DialogTrigger>
        <DialogContent title={`Deactivate or delete ${name}`} description="Choose what should happen to this workspace.">
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
            <fieldset className="space-y-2">
              <legend className="sr-only">What do you want to do?</legend>
              <ChoiceCard name="org-choice" value="deactivate" checked={choice === 'deactivate'} onSelect={() => setChoice('deactivate')} disabled={deactivated}
                title="Deactivate workspace" tag="Temporary"
                body="Nobody can open it and members are signed out. All leads, projects, inventory and settings are kept, and you can reactivate it any time."
                note={deactivated ? 'Already deactivated.' : undefined} />
              <ChoiceCard name="org-choice" value="delete" checked={choice === 'delete'} onSelect={() => setChoice('delete')} danger disabled={locked}
                title="Permanently delete workspace" tag="Can’t be undone"
                body="The workspace and everything in it are deleted for good. Members’ RE accounts are kept."
                note={locked ? `Not possible: it has ${preview!.lockedText}, which must be kept for tax and payment records. Deactivate it instead.` : undefined} />
            </fieldset>

            {choice === 'delete' && !locked && (
              <div className="space-y-3 rounded-lg border border-danger/40 bg-danger-bg p-3 text-[13px]">
                <p className="font-semibold text-danger">All of this will be permanently lost</p>
                {!preview ? <p className="text-muted" role="status">Checking what this workspace holds…</p> : (
                  <ul className="list-disc space-y-1 pl-5">
                    {preview.dataText && <li>{preview.dataText}</li>}
                    <li>Every note, follow-up, activity and assignment on those records</li>
                    <li>Team, routing rules, integrations, invitations and settings</li>
                    <li>Members’ access to this workspace</li>
                  </ul>
                )}
                {preview?.data.unpaid_invoices ? (
                  <p className="text-muted">Unpaid invoices are deleted too. If any of them was filed in your GST returns, cancel it with a credit note instead and deactivate the workspace.</p>
                ) : null}
                <p className="text-muted">There is no backup to restore from. If you might need any of this later, deactivate instead.</p>
                <label className="flex cursor-pointer items-start gap-2">
                  <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-current text-danger" />
                  <span>I understand that {name} and all its data will be permanently deleted and can’t be recovered.</span>
                </label>
                <Field label={`Type ${name} to confirm`} required><Input value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
              </div>
            )}

            <Field label="Reason" required hint="Recorded in the audit log.">
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder={choice === 'delete' ? 'e.g. Test workspace' : 'e.g. Contract ended'} maxLength={500} />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant={choice === 'delete' ? 'danger' : 'primary'}
                disabled={busy || reason.trim().length < 3 || (choice === 'delete' ? !deleteReady : deactivated)}>
                {busy ? 'Saving…' : choice === 'delete' ? 'Permanently delete' : 'Deactivate workspace'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** A fresh one-time invitation link for a pending invitation, to copy or send on WhatsApp (Platform Owner only). */
export function InviteLinkButton({ orgId, invitationId, email, orgName }: { orgId: string; invitationId: string; email: string; orgName: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<{ url: string; emailed: boolean; emailError: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const get = async () => {
    if (res && !window.confirm('Make a new link? The previous one will stop working.')) return
    setBusy(true); setError(null); setCopied(false)
    try { const r = await call(`/api/admin/organisations/${orgId}/invite-link`, 'POST', { invitationId }); setRes(r); router.refresh() }
    catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="space-y-2">
      <Button size="sm" variant={res ? 'secondary' : 'primary'} onClick={() => void get()} disabled={busy}>{busy ? 'Making link…' : res ? 'Make a new link' : 'Get invitation link'}</Button>
      {error && <Alert tone="danger">{error}</Alert>}
      {res && (
        <div className="space-y-2 rounded-lg border border-default p-3">
          <p className="text-[12px] text-muted">
            {res.emailed ? `Also e-mailed to ${email}. ` : `Not e-mailed${res.emailError ? ` (${res.emailError})` : ''} — send it yourself. `}
            Works once, only for {email}, for 14 days. The previous link no longer works.
          </p>
          <p className="break-all rounded-md bg-surface-hover p-2 font-mono text-[11px]">{res.url}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(res.url); setCopied(true) } catch { setCopied(false) } }}>{copied ? 'Copied' : 'Copy link'}</Button>
            <Button size="sm" asChild>
              <a target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${encodeURIComponent(`Your RE workspace "${orgName}" is ready. Set up your account here: ${res.url}`)}`}>Share on WhatsApp</a>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
