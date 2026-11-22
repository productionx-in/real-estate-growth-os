'use client'
// components/projects/DeleteProjectDialog.tsx — owners and admins delete a project. The name must be typed to
// confirm. The server refuses while the project has bookings, deals, site visits, partner arrangements or units on
// hold / booked / sold, and explains why (app/api/projects/[projectId], lib/dal/deletion.ts).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Alert, Button, Field, Input } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'

export function DeleteProjectDialog({ projectId, projectName, orgSlug, trigger }: { projectId: string; projectName: string; orgSlug: string; trigger?: React.ReactNode }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const matches = typed.trim() === projectName.trim()

  async function run() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmName: typed }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setError(out.error ?? 'Could not delete the project.'); return }
      setOpen(false)
      router.push(`/${orgSlug}/projects`)
      router.refresh()
    } catch { setError('Network error. Please try again.') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setTyped(''); setError(null) } }}>
      <DialogTrigger asChild>
        {trigger ?? <Button size="sm" variant="ghost"><Trash2 aria-hidden /> Delete project</Button>}
      </DialogTrigger>
      <DialogContent title={`Delete “${projectName}”?`}
        description="This removes the project with its towers, units, plot maps and import history. Leads that asked about it are kept (they just lose the project). This can’t be undone.">
        <p className="text-[13px] text-muted">A project with bookings, deals, site visits or sold units can’t be deleted — mark it Completed instead to keep its history.</p>
        <Field label={`Type ${projectName} to confirm`}>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <DialogFooter>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button variant="danger" onClick={run} loading={busy} disabled={!matches}>Delete project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
