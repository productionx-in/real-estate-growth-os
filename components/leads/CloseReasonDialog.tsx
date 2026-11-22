'use client'
// components/leads/CloseReasonDialog.tsx — asks why a lead is being closed as Lost or Junk, from the workspace's
// list (Settings → Lead settings), with "Other" plus a note. Used by the stage panel and the board; the status API
// checks the reason again.
import { useState } from 'react'
import { Alert, Button, Field, Textarea } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils/cn'

export interface CloseReasons { lost: string[]; junk: string[]; required: boolean }

export function CloseReasonDialog({ open, leadName, status, reasons, busy, error, onCancel, onConfirm }: {
  open: boolean
  leadName: string
  status: 'lost' | 'junk'
  reasons: CloseReasons
  busy: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (reason: string | undefined, note: string | undefined) => void
}) {
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState('')
  const list = [...(status === 'lost' ? reasons.lost : reasons.junk), 'Other']
  const needsNote = reason === 'Other'
  const ready = (reasons.required ? !!reason : true) && (!needsNote || !!note.trim())
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setReason(''); setNote(''); onCancel() } }}>
      <DialogContent title={`Mark “${leadName}” as ${status === 'lost' ? 'Lost' : 'Junk'}`}
        description={status === 'lost' ? 'Why did this buyer not go ahead?' : 'Why is this not a real buyer enquiry?'}>
        <fieldset className="space-y-1.5">
          <legend className="sr-only">Reason</legend>
          {list.map((r) => (
            <label key={r} className={cn('flex min-h-10 cursor-pointer items-center gap-2 rounded-md border px-3 text-[13px] text-foreground',
              reason === r ? 'border-brand bg-brand-light' : 'border-default hover:bg-surface-hover')}>
              <input type="radio" name="close-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="size-4 accent-[var(--brand)]" />
              {r}
            </label>
          ))}
        </fieldset>
        <Field label={needsNote ? 'What happened?' : 'Note (optional)'} required={needsNote}>
          <Textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        <DialogFooter>
          <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
          <Button variant="danger" loading={busy} disabled={!ready} onClick={() => onConfirm(reason || undefined, note.trim() || undefined)}>
            Mark as {status === 'lost' ? 'Lost' : 'Junk'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
