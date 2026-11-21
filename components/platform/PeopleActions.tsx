'use client'
// components/platform/PeopleActions.tsx — console controls for the people who use customer workspaces: suspend or
// restore access to a workspace, block / unblock / delete a sign-in account. Each opens a dialog that asks for a
// reason; the server checks the role again and audits it (lib/platform/people.ts).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Alert, Button, Field, Textarea } from '@/components/ui'
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
      setError('We couldn’t reach REGrow. Refresh the page to see whether the change went through.'); setBusy(false)
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

/** The controls for one person: workspace access (when shown inside a workspace) and the sign-in account. */
export function PersonControls(p: {
  name: string; userId: string | null; staff: boolean; blocked: boolean; isSelf: boolean
  canAccount: boolean; canMember: boolean; orgId?: string; memberId?: string; memberStatus?: string; workspaceCount?: number
}) {
  if (p.isSelf) return <span className="text-[12px] text-muted">You</span>
  if (p.staff) return <span className="text-[12px] text-muted">REGrow staff — manage on the Staff page</span>
  const acct = p.userId ? `/api/admin/accounts/${p.userId}` : null
  return (
    <div className="flex flex-wrap justify-end gap-2">
      {p.canMember && p.orgId && p.memberId && (p.memberStatus === 'active' ? (
        <PersonAction label="Suspend access" title={`Suspend ${p.name}’s access?`} confirm="Suspend access" action="suspend"
          url={`/api/admin/organisations/${p.orgId}/members/${p.memberId}`}
          description="They can no longer open this workspace. Their open leads move to the unassigned queue; their history is kept. If this was their only workspace, they are signed out." />
      ) : (
        <PersonAction label="Restore access" title={`Restore ${p.name}’s access?`} confirm="Restore access" action="restore"
          url={`/api/admin/organisations/${p.orgId}/members/${p.memberId}`}
          description="They can open this workspace again with their previous role. Needs a free seat." />
      ))}
      {p.canAccount && acct && (p.blocked ? (
        <PersonAction label="Unblock sign-in" title={`Unblock ${p.name}?`} confirm="Unblock" action="unblock" url={acct}
          description="They can sign in to REGrow again and open the workspaces they still belong to." />
      ) : (
        <PersonAction label="Block sign-in" title={`Block ${p.name} from signing in?`} confirm="Block sign-in" action="block" url={acct} danger
          description="They are signed out everywhere and can’t sign in to REGrow at all — in every workspace — until unblocked. Nothing is deleted." />
      ))}
      {p.canAccount && acct && p.workspaceCount === 0 && (
        <PersonAction label="Delete account" title={`Delete ${p.name}’s sign-in account?`} confirm="Delete account" action="delete" url={acct} danger after="/platform/people"
          description="Permanently removes their REGrow sign-in. This can’t be undone; they would need a new invitation to come back." />
      )}
    </div>
  )
}
