'use client'
// components/platform/PeopleActions.tsx — console controls for the people who use customer workspaces: suspend or
// restore access to a workspace, block / unblock / delete a sign-in account. Each opens a dialog that asks for a
// reason; the server checks the role again and audits it (lib/platform/people.ts).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Input, Textarea } from '@/components/ui'
import { Dialog, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'

interface ActionProps {
  label: string; title: string; description: string; confirm: string
  url: string; action: string; danger?: boolean; after?: string
}

export function PersonAction({ label, title, description, confirm, url, action, danger, after }: ActionProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, reason }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Something went wrong.'); setBusy(false); return }
      setOpen(false); setBusy(false)
      if (after) router.push(after)
      router.refresh()
    } catch {
      setError('We couldn’t reach RE. Refresh the page to see whether the change went through.'); setBusy(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setReason(''); setError(null) } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant={danger ? 'danger' : 'secondary'}>{label}</Button>
      </DialogTrigger>
      <DialogContent title={title} description={description}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <Field label="Reason" required hint="Recorded in the audit log.">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Left the company" />
          </Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={busy || reason.trim().length < 3}>{busy ? 'Saving…' : confirm}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

type Choice = 'deactivate' | 'delete'

/** Facebook-style "Deactivate or delete" for one person's RE sign-in account (Platform Owner only). */
export function AccountChoice({ userId, name, email, blocked, workspaces }: { userId: string; name: string; email: string; blocked: boolean; workspaces: string[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<Choice>('deactivate')
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reset = () => { setChoice('deactivate'); setReason(''); setTyped(''); setUnderstood(false); setError(null) }
  const ready = reason.trim().length >= 3 && (choice === 'deactivate' || (understood && typed.trim().toLowerCase() === email.toLowerCase()))
  const submit = async () => {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/accounts/${userId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: choice === 'delete' ? 'delete' : 'block', reason }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setError(json.error ?? 'Something went wrong.'); setBusy(false); return }
      setOpen(false); setBusy(false); reset(); router.refresh()
    } catch { setError('We couldn’t reach RE. Refresh the page to see whether the change went through.'); setBusy(false) }
  }
  if (blocked) {
    return <PersonAction label="Reactivate account" title={`Reactivate ${name}’s account?`} confirm="Reactivate" action="unblock" url={`/api/admin/accounts/${userId}`}
      description="They can sign in to RE again and open the workspaces they still belong to." />
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset() }}>
      <DialogTrigger asChild><Button size="sm" variant="secondary">Deactivate or delete…</Button></DialogTrigger>
      <DialogContent title={`Deactivate or delete ${name}’s account`} description={email}>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit() }}>
          <fieldset className="space-y-2">
            <legend className="sr-only">What do you want to do?</legend>
            <ChoiceCard name="acct-choice" value="deactivate" checked={choice === 'deactivate'} onSelect={() => setChoice('deactivate')}
              title="Deactivate account" tag="Temporary"
              body="They are signed out and can’t sign in to RE until you reactivate them. Nothing is deleted: their access, history and settings come back exactly as they were." />
            <ChoiceCard name="acct-choice" value="delete" checked={choice === 'delete'} onSelect={() => setChoice('delete')} danger
              title="Permanently delete account" tag="Can’t be undone"
              body="They are removed from every workspace and their sign-in, name and contact details are erased for good." />
          </fieldset>
          {choice === 'delete' && (
            <div className="space-y-3 rounded-lg border border-danger/40 bg-danger-bg p-3 text-[13px]">
              <p className="font-semibold text-danger">This will be permanently lost</p>
              <ul className="list-disc space-y-1 pl-5">
                <li>Their RE sign-in, name, phone and e-mail address</li>
                <li>Their access to {workspaces.length ? workspaces.join(', ') : 'any workspace'}</li>
              </ul>
              <p className="text-muted">Leads, notes and bookings they worked on stay with each customer’s workspace, shown as “Deleted user”. To come back they would need a new invitation.</p>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-current text-danger" />
                <span>I understand this account will be permanently deleted and can’t be recovered.</span>
              </label>
              <Field label={`Type ${email} to confirm`} required><Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></Field>
            </div>
          )}
          <Field label="Reason" required hint="Recorded in the audit log."><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} maxLength={300} placeholder="e.g. Left the company" /></Field>
          {error && <Alert tone="danger">{error}</Alert>}
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant={choice === 'delete' ? 'danger' : 'primary'} disabled={busy || !ready}>
              {busy ? 'Saving…' : choice === 'delete' ? 'Permanently delete' : 'Deactivate account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** One option in a "Deactivate or delete" choice: a large, labelled radio card. */
export function ChoiceCard({ name, value, checked, onSelect, title, tag, body, danger, disabled, note }: {
  name: string; value: string; checked: boolean; onSelect: () => void; title: string; tag: string; body: string; danger?: boolean; disabled?: boolean; note?: string
}) {
  return (
    <label className={`flex gap-3 rounded-lg border p-3 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'} ${checked ? (danger ? 'border-danger bg-danger-bg' : 'border-brand bg-brand-light') : 'border-default hover:bg-surface-hover'}`}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onSelect} disabled={disabled} className="mt-1 size-4 shrink-0 accent-current text-brand" />
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className={`text-[14px] font-semibold ${danger ? 'text-danger' : ''}`}>{title}</span>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${danger ? 'bg-danger text-danger-foreground' : 'bg-surface-hover text-muted'}`}>{tag}</span>
        </span>
        <span className="mt-1 block text-[13px] text-muted">{body}</span>
        {note && <span className="mt-1 block text-[12px] font-medium text-danger">{note}</span>}
      </span>
    </label>
  )
}

/** The controls for one person: workspace access (when shown inside a workspace) and the sign-in account. */
export function PersonControls(p: {
  name: string; email: string; userId: string | null; staff: boolean; blocked: boolean; isSelf: boolean
  canAccount: boolean; canMember: boolean; orgId?: string; memberId?: string; memberStatus?: string; workspaces?: string[]
}) {
  if (p.isSelf) return <span className="text-[12px] text-muted">You</span>
  if (p.staff) return <span className="text-[12px] text-muted">RE staff — manage on the Staff page</span>
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {p.canMember && p.orgId && p.memberId && (p.memberStatus === 'active' ? (
        <PersonAction label="Remove from workspace" title={`Remove ${p.name}’s access to this workspace?`} confirm="Remove access" action="suspend"
          url={`/api/admin/organisations/${p.orgId}/members/${p.memberId}`}
          description="They can no longer open this workspace; their account and other workspaces are not affected. Their open leads move to the unassigned queue and their history is kept. You can restore access later." />
      ) : (
        <PersonAction label="Restore access" title={`Restore ${p.name}’s access?`} confirm="Restore access" action="restore"
          url={`/api/admin/organisations/${p.orgId}/members/${p.memberId}`}
          description="They can open this workspace again with their previous role. Needs a free seat." />
      ))}
      {p.canAccount && p.userId && <AccountChoice userId={p.userId} name={p.name} email={p.email} blocked={p.blocked} workspaces={p.workspaces ?? []} />}
    </div>
  )
}
