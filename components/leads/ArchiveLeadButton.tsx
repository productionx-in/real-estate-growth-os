'use client'
// components/leads/ArchiveLeadButton.tsx — owners and admins delete a lead: it moves to the Archive for 30 days
// (Settings → Archive), where it can be restored exactly as it was. The server checks the role (app/api/leads/[id]).
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'

export function ArchiveLeadButton({ leadId, leadName, orgSlug }: { leadId: string; leadName: string; orgSlug: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run() {
    setBusy(true); setError(null)
    const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' })
    const out = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(out.error ?? 'Could not delete the lead.'); return }
    router.push(`/${orgSlug}/leads?archived=1`)
    router.refresh()
  }
  return (
    <Dialog>
      <DialogTrigger asChild><Button size="sm" variant="ghost"><Trash2 aria-hidden /> Delete</Button></DialogTrigger>
      <DialogContent title={`Delete “${leadName}”?`} description="The lead moves to the Archive (Settings → Archive) for 30 days, with its calls, notes, follow-ups and documents. You can restore it there exactly as it was. After 30 days it is erased for good.">
        {error && <Alert tone="danger">{error}</Alert>}
        <DialogFooter>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button variant="danger" onClick={run} loading={busy}>Move to Archive</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
