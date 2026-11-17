'use client'
// Book a site visit: lead, project, salesperson, date and time, optional details. Used on the visits calendar
// (lead picked from a list) and on a lead's page (lead fixed).
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarPlus } from 'lucide-react'
import { Alert, Button, Field, Input, Select, Textarea } from '@/components/ui'
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTrigger } from '@/components/ui/dialog'

export interface Option { id: string; label: string; hint?: string }

function defaultWhen() {
  const d = new Date(Date.now() + 24 * 3600_000)
  d.setHours(11, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ScheduleVisitDialog({ leads, fixedLead, projects, agents, defaultProjectId, defaultAgentId, canPickAgent, trigger }: {
  leads?: Option[]
  fixedLead?: Option
  projects: Option[]
  agents: Option[]
  defaultProjectId?: string | null
  defaultAgentId?: string | null
  canPickAgent: boolean
  trigger?: React.ReactNode
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [leadId, setLeadId] = useState(fixedLead?.id ?? '')
  const [projectId, setProjectId] = useState(defaultProjectId ?? projects[0]?.id ?? '')
  const [agentId, setAgentId] = useState(defaultAgentId ?? agents[0]?.id ?? '')
  const [when, setWhen] = useState(defaultWhen)
  const [visitors, setVisitors] = useState(2)
  const [accompanied, setAccompanied] = useState('')
  const [link, setLink] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (leads ?? []).filter((l) => !q || l.label.toLowerCase().includes(q) || l.hint?.includes(q)).slice(0, 50)
  }, [leads, query])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const res = await fetch('/api/site-visits', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        leadId, projectId, assignedTo: canPickAgent ? agentId || null : null, scheduledAt: new Date(when).toISOString(),
        visitorCount: visitors, accompaniedBy: accompanied || null, meetingLink: link || null, notes: notes || null,
      }),
    })
    const body = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) return setError(body.error ?? 'Could not book the visit.')
    setOpen(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger ?? <Button size="sm"><CalendarPlus aria-hidden />Book a visit</Button>}</DialogTrigger>
      <DialogContent title="Book a site visit" description="The buyer gets a confirmation and reminders the day before and two hours before (by email when the lead has one).">
        {projects.length === 0 ? (
          <Alert tone="warning" title="Add a project first">Visits are booked to a project. Create one under Projects.</Alert>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {fixedLead ? (
              <p className="text-[13px]">Lead: <span className="font-medium">{fixedLead.label}</span></p>
            ) : (
              <div className="space-y-1.5">
                <Field label="Lead" required>
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or phone" />
                </Field>
                <Select aria-label="Choose a lead" size={Math.min(5, Math.max(2, matches.length))} value={leadId} onChange={(e) => setLeadId(e.target.value)} className="h-auto py-1">
                  {matches.map((l) => <option key={l.id} value={l.id}>{l.label}{l.hint ? ` · ${l.hint}` : ''}</option>)}
                </Select>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Project" required>
                <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </Select>
              </Field>
              <Field label="Date and time" required hint="In your device’s time zone.">
                <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </Field>
              {canPickAgent && (
                <Field label="Salesperson">
                  <Select value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                    {agents.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </Select>
                </Field>
              )}
              <Field label="Visitors">
                <Input type="number" min={1} max={50} value={visitors} onChange={(e) => setVisitors(Number(e.target.value) || 1)} />
              </Field>
            </div>
            <Field label="Coming with (optional)" hint="Spouse, parents, a broker…">
              <Input value={accompanied} onChange={(e) => setAccompanied(e.target.value)} maxLength={200} />
            </Field>
            <Field label="Online meeting link (optional)" hint="For a video walkthrough instead of an in-person visit.">
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://meet.google.com/…" />
            </Field>
            <Field label="Notes (optional)">
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} />
            </Field>
            {error && <Alert tone="danger">{error}</Alert>}
            <DialogFooter>
              <DialogClose asChild><Button variant="secondary">Cancel</Button></DialogClose>
              <Button type="submit" loading={busy} disabled={!leadId || !projectId || !when}>Book visit</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
