'use client'
// What a salesperson does with a visit on the day: check in (with location), finish with an outcome,
// mark a no-show, move it, or cancel it. The server applies the rules; this only offers the valid next steps.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarClock, Check, LogIn, MoreHorizontal, UserX, X } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

const OUTCOMES = [
  ['interested', 'Interested'], ['follow_up_needed', 'Needs a follow-up'], ['negotiation', 'Negotiating'],
  ['booked', 'Booked'], ['uninterested', 'Not interested'],
] as const

export function VisitActions({ visitId, status }: { visitId: string; status: string }) {
  const router = useRouter()
  const [dialog, setDialog] = useState<null | 'complete' | 'reschedule' | 'cancel'>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string>('interested')
  const [rating, setRating] = useState('')
  const [notes, setNotes] = useState('')
  const [when, setWhen] = useState('')
  const [reason, setReason] = useState('')

  async function send(body: object) {
    setBusy(true)
    setError(null)
    const res = await fetch(`/api/site-visits/${visitId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setError(json.error ?? 'Something went wrong.'); return false }
    setDialog(null)
    router.refresh()
    return true
  }

  function checkIn() {
    if (!navigator.geolocation) return void send({ action: 'check_in', lat: null, lng: null })
    setBusy(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => void send({ action: 'check_in', lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => void send({ action: 'check_in', lat: null, lng: null }), // location refused: check in without it
      { enableHighAccuracy: true, timeout: 8000 }
    )
  }

  const upcoming = status === 'scheduled' || status === 'rescheduled'
  const here = status === 'checked_in'
  const closed = status === 'no_show' || status === 'cancelled'

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {upcoming && <Button size="sm" variant="secondary" loading={busy} onClick={checkIn}><LogIn aria-hidden />Check in</Button>}
      {(upcoming || here) && <Button size="sm" onClick={() => setDialog('complete')}><Check aria-hidden />Done</Button>}
      {closed && <Button size="sm" variant="secondary" onClick={() => setDialog('reschedule')}><CalendarClock aria-hidden />Rebook</Button>}
      {(upcoming || here) && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="More actions"><MoreHorizontal aria-hidden /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {upcoming && <DropdownMenuItem onSelect={() => setDialog('reschedule')}><CalendarClock aria-hidden />Move to another time</DropdownMenuItem>}
            {upcoming && <DropdownMenuItem onSelect={() => void send({ action: 'no_show' })}><UserX aria-hidden />Didn’t come</DropdownMenuItem>}
            <DropdownMenuItem destructive onSelect={() => setDialog('cancel')}><X aria-hidden />Cancel visit</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {error && !dialog && <Alert tone="danger" className="w-full">{error}</Alert>}

      <Dialog open={dialog === 'complete'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="How did the visit go?" description="The lead moves to Visited. If they need a follow-up, schedule it from the lead.">
          <div className="space-y-3">
            <Field label="Outcome" required>
              <Select value={outcome} onChange={(e) => setOutcome(e.target.value)}>{OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
            </Field>
            <Field label="Interest (1–5, optional)">
              <Select value={rating} onChange={(e) => setRating(e.target.value)}>
                <option value="">Not rated</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
            <Field label="Notes (optional)"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
            {error && <Alert tone="danger">{error}</Alert>}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
            <Button loading={busy} onClick={() => void send({ action: 'complete', outcome, rating: rating ? Number(rating) : null, notes: notes || null })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'reschedule'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title={closed ? 'Rebook the visit' : 'Move the visit'} description="The buyer gets the new time and fresh reminders.">
          <Field label="New date and time" required><Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></Field>
          {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
            <Button loading={busy} disabled={!when} onClick={() => void send({ action: 'reschedule', scheduledAt: new Date(when).toISOString() })}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'cancel'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Cancel this visit?" description="Reminders stop. You can rebook it later.">
          <Field label="Reason (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></Field>
          {error && <Alert tone="danger" className="mt-3">{error}</Alert>}
          <DialogFooter>
            <DialogClose asChild><Button variant="secondary">Keep it</Button></DialogClose>
            <Button variant="danger" loading={busy} onClick={() => void send({ action: 'cancel', reason: reason || null })}>Cancel visit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
