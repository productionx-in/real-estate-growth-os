'use client'
// components/calendar/CalendarBoard.tsx — the interactive sales calendar (app/(dashboard)/[orgSlug]/calendar).
// Day / week / month / agenda; follow-ups colour-coded by kind; overdue ones collected at the top; complete, reschedule,
// open the lead or reassign it from any item; drag an open follow-up to another day (desktop) to move it.
// Changes go through the existing follow-up and assignment APIs, which check permissions on the server.
// Site visits are moved and completed on the visit itself (Site visits page), so the visit and its follow-up never drift.
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, ExternalLink, MapPin, UserRoundCog, Users } from 'lucide-react'
import { Alert, Button, EmptyState, Input, Select } from '@/components/ui'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { AssignLeadDialog } from '@/components/leads/AssignLeadDialog'
import { KINDS, KIND_CLASS, VIEWS, byDay, isOverdue, localDay, step, type CalendarItem, type CalendarView, type workload } from '@/lib/calendar/rules'
import { cn } from '@/lib/utils/cn'

interface Props {
  orgId: string; orgSlug: string; tz: string; view: CalendarView; anchor: string; today: string; days: string[]
  items: CalendarItem[]; overdue: CalendarItem[]; people: { id: string; name: string }[]; person: string; me: string
  canPickPeople: boolean; canAssign: boolean; assignOnly: string[] | null; load: ReturnType<typeof workload> | null
  /** The server's clock when the page was built: overdue flags and the "already passed" check use it (the API checks again). */
  nowMs: number
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function CalendarBoard(p: Props) {
  const router = useRouter()
  const [open, setOpen] = useState<CalendarItem | null>(null)
  const [assigning, setAssigning] = useState<CalendarItem | null>(null)
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const team = p.person === 'team'
  const grouped = useMemo(() => byDay(p.items, p.tz), [p.items, p.tz])
  const time = (iso: string) => new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: p.tz }).format(new Date(iso))
  const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { ...opts, timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`))
  const href = (q: Partial<{ view: CalendarView; date: string; person: string }>) => {
    const s = new URLSearchParams({ view: q.view ?? p.view, date: q.date ?? p.anchor, ...(q.person ?? p.person) !== p.me ? { person: q.person ?? p.person } : {} })
    return `/${p.orgSlug}/calendar?${s.toString()}`
  }
  const title = p.view === 'month' ? dayLabel(p.anchor, { month: 'long', year: 'numeric' })
    : p.view === 'day' ? dayLabel(p.anchor, { weekday: 'long', day: 'numeric', month: 'long' })
    : `${dayLabel(p.days[0], { day: 'numeric', month: 'short' })} – ${dayLabel(p.days[p.days.length - 1], { day: 'numeric', month: 'short', year: 'numeric' })}`

  async function patch(item: CalendarItem, body: { status?: 'done'; dueAt?: string }, ok: string) {
    setMsg(null)
    try {
      const res = await fetch(`/api/leads/${item.leadId}/tasks/${item.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg({ tone: 'danger', text: out.error ?? 'Could not update the follow-up.' }); return false }
      setMsg({ tone: 'success', text: ok }); setOpen(null); router.refresh(); return true
    } catch { setMsg({ tone: 'danger', text: 'Network error. Please try again.' }); return false }
  }

  /** Dropped on another day: same time of day, new date (in the workspace's time zone). */
  async function moveTo(item: CalendarItem, day: string) {
    if (localDay(new Date(item.dueAt), p.tz) === day) return
    const [h, m] = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: p.tz }).format(new Date(item.dueAt)).split(':').map(Number)
    const target = zoned(day, h, m, p.tz)
    if (target.getTime() <= p.nowMs) { setMsg({ tone: 'danger', text: 'That time has already passed. Pick a later day.' }); return }
    await patch(item, { dueAt: target.toISOString() }, `Moved ${item.leadName} to ${dayLabel(day, { weekday: 'short', day: 'numeric', month: 'short' })}.`)
  }

  const chip = (it: CalendarItem, compact = false) => {
    const late = isOverdue(it, new Date(p.nowMs))
    const movable = it.status === 'open' && !it.siteVisitId
    return (
      <button key={it.id} type="button" onClick={() => setOpen(it)}
        draggable={movable} onDragStart={(e) => { e.dataTransfer.setData('text/plain', it.id); e.dataTransfer.effectAllowed = 'move' }}
        className={cn('lift group block w-full rounded-md border-l-[3px] px-2 py-1 text-left text-[12px] leading-tight', KIND_CLASS[it.kind],
          late && 'ring-1 ring-danger', it.status === 'done' && 'opacity-60', movable && 'cursor-grab active:cursor-grabbing')}
        title={`${KINDS[it.kind].label} · ${it.leadName}${team && it.assigneeName ? ` · ${it.assigneeName}` : ''}`}>
        <span className="flex min-w-0 items-center gap-1 font-medium tabular-nums text-muted">
          {it.status === 'done' && <Check className="size-3 shrink-0 text-success" aria-label="Done" />}
          {late && <AlertTriangle className="size-3 shrink-0 text-danger" aria-label="Overdue" />}
          <span className="shrink-0 whitespace-nowrap">{time(it.dueAt)}</span>
          {!compact && <span className="min-w-0 truncate font-normal">· {KINDS[it.kind].label}</span>}
        </span>
        <span className={cn('block truncate font-semibold', it.status === 'done' && 'line-through')}>{it.leadName}</span>
        {team && it.assigneeName && !compact && <span className="block truncate text-[11px] text-muted">{it.assigneeName}</span>}
      </button>
    )
  }

  const dropZone = (day: string) => ({
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(day) },
    onDragLeave: () => setDragOver((d) => (d === day ? null : d)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault(); setDragOver(null)
      const it = p.items.find((x) => x.id === e.dataTransfer.getData('text/plain')) ?? p.overdue.find((x) => x.id === e.dataTransfer.getData('text/plain'))
      if (it) moveTo(it, day)
    },
  })

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="secondary" size="icon" aria-label="Previous"><Link href={href({ date: step(p.view, p.anchor, -1) })}><ChevronLeft aria-hidden /></Link></Button>
          <Button asChild variant="secondary" size="sm"><Link href={href({ date: p.today })}>Today</Link></Button>
          <Button asChild variant="secondary" size="icon" aria-label="Next"><Link href={href({ date: step(p.view, p.anchor, 1) })}><ChevronRight aria-hidden /></Link></Button>
        </div>
        <h2 className="min-w-[10rem] flex-1 text-[16px] font-semibold text-foreground">{title}</h2>
        {p.canPickPeople && (
          <Select aria-label="Whose calendar" className="h-9 w-auto max-w-[220px]" value={p.person} onChange={(e) => router.push(href({ person: e.target.value }))}>
            <option value={p.me}>My calendar</option>
            <option value="team">Team calendar</option>
            {p.people.filter((x) => x.id !== p.me).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </Select>
        )}
        <nav aria-label="View" className="inline-flex rounded-lg border border-default bg-background p-0.5 text-[13px]">
          {(Object.keys(VIEWS) as CalendarView[]).map((v) => (
            <Link key={v} href={href({ view: v })} aria-current={v === p.view ? 'true' : undefined}
              className={cn('rounded-md px-3 py-1.5', v === p.view ? 'bg-surface font-semibold shadow-sm' : 'text-muted hover:text-foreground')}>{VIEWS[v]}</Link>
          ))}
        </nav>
      </div>
      <ul className="flex flex-wrap gap-3 text-[12px] text-muted" aria-label="Colours">
        {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k) => <li key={k} className="flex items-center gap-1.5"><span className={cn('size-3 rounded-sm border-l-[3px]', KIND_CLASS[k])} aria-hidden />{KINDS[k].label}</li>)}
        <li className="flex items-center gap-1.5"><AlertTriangle className="size-3 text-danger" aria-hidden /> Overdue</li>
      </ul>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      {/* Overdue, from before the days shown */}
      {p.overdue.length > 0 && (
        <details open className="rounded-xl border border-danger/40 bg-danger-bg/40 p-3">
          <summary className="cursor-pointer text-[13px] font-semibold text-danger">{p.overdue.length} overdue follow-up{p.overdue.length === 1 ? '' : 's'} — do these first</summary>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{p.overdue.slice(0, 24).map((it) => chip(it))}</div>
        </details>
      )}

      {/* Team workload */}
      {p.load && p.load.length > 0 && (
        <section aria-label="Workload" className="surface-raised rounded-xl border border-default bg-surface p-4">
          <h3 className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-foreground"><Users className="size-4 text-muted" aria-hidden /> Workload for these days</h3>
          <ul className="space-y-2.5">
            {p.load.map((w) => {
              const max = Math.max(...p.load!.map((x) => x.open), 1)
              return (
                <li key={w.assigneeId ?? 'none'} className="grid grid-cols-[minmax(0,140px)_1fr_auto] items-center gap-3 text-[13px]">
                  {w.assigneeId ? <Link href={href({ person: w.assigneeId })} className="truncate font-medium text-foreground hover:underline">{w.name}</Link> : <span className="truncate text-muted">{w.name}</span>}
                  <div className="h-2.5 overflow-hidden rounded-full bg-surface-hover"><div className="h-full origin-left rounded-full bg-brand" style={{ transform: `scaleX(${w.open / max})`, transition: 'transform 700ms var(--ease-out)' }} /></div>
                  <span className="whitespace-nowrap text-[12px] text-muted tabular-nums">{w.open} open{w.overdue ? <span className="text-danger"> · {w.overdue} overdue</span> : ''} · {w.done} done</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Views */}
      {p.view === 'month' && (
        <div className="surface-raised overflow-hidden rounded-xl border border-default bg-surface">
          <div className="grid grid-cols-7 border-b border-default text-center text-[11px] font-semibold uppercase tracking-wide text-muted">{WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}</div>
          <div className="grid grid-cols-7">
            {p.days.map((d) => {
              const list = grouped.get(d) ?? []
              const other = d.slice(0, 7) !== p.anchor.slice(0, 7)
              return (
                <div key={d} {...dropZone(d)} className={cn('min-h-[96px] border-b border-r border-default p-1.5 sm:min-h-[116px]', other && 'bg-surface-muted/50', dragOver === d && 'bg-brand-light')}>
                  <Link href={href({ view: 'day', date: d })} className={cn('mb-1 inline-flex size-6 items-center justify-center rounded-full text-[12px] font-medium', d === p.today ? 'bg-brand text-brand-foreground' : other ? 'text-subtle' : 'text-foreground hover:bg-surface-hover')}>{Number(d.slice(8))}</Link>
                  <div className="space-y-1">
                    {list.slice(0, 3).map((it) => <div key={it.id} className="hidden sm:block">{chip(it, true)}</div>)}
                    {list.length > 0 && <Link href={href({ view: 'day', date: d })} className={cn('block text-[11px] font-medium text-brand hover:underline', list.length <= 3 && 'sm:hidden')}>{list.length > 3 ? `+${list.length - 3} more` : `${list.length} item${list.length === 1 ? '' : 's'}`}</Link>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {p.view === 'week' && (
        <div className="grid gap-3 md:grid-cols-7">
          {p.days.map((d, i) => {
            const list = grouped.get(d) ?? []
            return (
              <section key={d} aria-label={dayLabel(d, { weekday: 'long', day: 'numeric', month: 'short' })} {...dropZone(d)}
                className={cn('surface-raised min-h-[120px] rounded-xl border bg-surface p-2', d === p.today ? 'border-brand/60' : 'border-default', dragOver === d && 'bg-brand-light')}>
                <Link href={href({ view: 'day', date: d })} className="mb-2 flex items-baseline justify-between px-1 hover:underline">
                  <span className="text-[12px] font-semibold uppercase tracking-wide text-muted">{WEEKDAYS[i]}</span>
                  <span className={cn('text-[15px] font-bold', d === p.today ? 'text-brand' : 'text-foreground')}>{Number(d.slice(8))}</span>
                </Link>
                <div className="stagger space-y-1.5">{list.length ? list.map((it) => chip(it)) : <p className="px-1 text-[12px] text-subtle">Free</p>}</div>
              </section>
            )
          })}
        </div>
      )}

      {p.view === 'day' && (() => {
        const list = grouped.get(p.anchor) ?? []
        const hourOf = (it: CalendarItem) => Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: p.tz }).format(new Date(it.dueAt)))
        const hours = Array.from({ length: 15 }, (_, i) => i + 8) // 8 am – 10 pm
        const early = list.filter((it) => hourOf(it) < 8), late = list.filter((it) => hourOf(it) > 22)
        return (
          <div className="surface-raised overflow-hidden rounded-xl border border-default bg-surface" {...dropZone(p.anchor)}>
            {early.length > 0 && <div className="flex gap-3 border-b border-default p-2"><span className="w-14 shrink-0 text-right text-[11px] text-muted">Earlier</span><div className="grid flex-1 gap-1.5 sm:grid-cols-2">{early.map((it) => chip(it))}</div></div>}
            {hours.map((h) => {
              const at = list.filter((it) => hourOf(it) === h)
              const label = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, h)))
              return (
                <div key={h} className="flex min-h-[48px] gap-3 border-b border-default p-2 last:border-b-0">
                  <span className="w-14 shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted">{label}</span>
                  <div className="grid flex-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{at.map((it) => chip(it))}</div>
                </div>
              )
            })}
            {late.length > 0 && <div className="flex gap-3 p-2"><span className="w-14 shrink-0 text-right text-[11px] text-muted">Later</span><div className="grid flex-1 gap-1.5 sm:grid-cols-2">{late.map((it) => chip(it))}</div></div>}
            {list.length === 0 && <div className="border-t border-default"><EmptyState icon={CalendarClock} title="Nothing scheduled" description="Follow-ups and site visits you schedule on leads appear here." /></div>}
          </div>
        )
      })()}

      {p.view === 'agenda' && (
        p.items.length === 0 ? (
          <div className="surface-raised rounded-xl border border-default bg-surface"><EmptyState icon={CalendarClock} title="Nothing in the next two weeks" description="Schedule a follow-up from any lead and it shows up here." /></div>
        ) : (
          <div className="space-y-4">
            {p.days.filter((d) => grouped.has(d)).map((d) => (
              <section key={d} aria-label={dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}>
                <h3 className={cn('mb-2 text-[13px] font-semibold', d === p.today ? 'text-brand' : 'text-foreground')}>{d === p.today ? 'Today · ' : ''}{dayLabel(d, { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                <div className="stagger grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{grouped.get(d)!.map((it) => chip(it))}</div>
              </section>
            ))}
          </div>
        )
      )}

      {/* An item's details and actions */}
      {open && (
        <Dialog open onOpenChange={(o) => { if (!o) setOpen(null) }}>
          <ItemSheet item={open} nowMs={p.nowMs} tz={p.tz} orgSlug={p.orgSlug} canAssign={p.canAssign}
            onDone={() => patch(open, { status: 'done' }, `Marked done: ${open.leadName}.`)}
            onMove={(iso) => patch(open, { dueAt: iso }, `Rescheduled ${open.leadName}.`)}
            onReassign={() => { setAssigning(open); setOpen(null) }} />
        </Dialog>
      )}
      {assigning && (
        <AssignLeadDialog leadId={assigning.leadId} leadName={assigning.leadName} currentAssigneeId={assigning.assigneeId} orgId={p.orgId}
          onlyProfileIds={p.assignOnly} onClose={() => { setAssigning(null); router.refresh() }} />
      )}
    </div>
  )
}

function ItemSheet({ item, nowMs, tz, orgSlug, canAssign, onDone, onMove, onReassign }: {
  item: CalendarItem; nowMs: number; tz: string; orgSlug: string; canAssign: boolean; onDone: () => void; onMove: (iso: string) => void; onReassign: () => void
}) {
  const local = new Intl.DateTimeFormat('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz }).format(new Date(item.dueAt)).replace(' ', 'T')
  const [when, setWhen] = useState(local)
  const [busy, setBusy] = useState(false)
  const late = isOverdue(item, new Date(nowMs))
  const at = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(item.dueAt))
  const run = async (f: () => unknown) => { setBusy(true); await f(); setBusy(false) }
  const [d, t] = when.split('T')
  return (
    <DialogContent title={`${KINDS[item.kind].label} · ${item.leadName}`} description={`${at}${item.assigneeName ? ` · ${item.assigneeName}` : ''}${late ? ' · overdue' : ''}${item.status === 'done' ? ' · done' : ''}`}>
      <div className="space-y-4">
        {item.note && <p className="rounded-lg bg-surface-hover px-3 py-2 text-[13px] text-foreground">{item.note}</p>}
        {item.status === 'open' && !item.siteVisitId && (
          <div className="space-y-3">
            <Button className="w-full" onClick={() => run(onDone)} loading={busy}><Check aria-hidden /> Mark as done</Button>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-0 flex-1 space-y-1 text-[12px] font-medium text-muted">Reschedule to
                <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
              </label>
              <Button variant="secondary" disabled={busy || when === local} onClick={() => run(() => onMove(zoned(d, Number(t.slice(0, 2)), Number(t.slice(3, 5)), tz).toISOString()))}>Reschedule</Button>
            </div>
          </div>
        )}
        {item.siteVisitId && item.status === 'open' && (
          <Alert tone="info">This is a site visit. Move, check in or complete it on the visit itself so the buyer’s confirmation stays right.</Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary"><Link href={`/${orgSlug}/leads/${item.leadId}`}><ExternalLink aria-hidden /> Open lead</Link></Button>
          {item.siteVisitId && <Button asChild variant="secondary"><Link href={`/${orgSlug}/visits`}><MapPin aria-hidden /> Site visits</Link></Button>}
          {canAssign && item.status === 'open' && <Button variant="ghost" onClick={onReassign}><UserRoundCog aria-hidden /> Reassign lead</Button>}
        </div>
        {canAssign && <p className="text-[12px] text-muted">Reassigning the lead moves its open follow-ups to the new owner’s calendar.</p>}
      </div>
    </DialogContent>
  )
}

/** A local date and time in a time zone → the instant. */
function zoned(day: string, h: number, m: number, tz: string): Date {
  const guess = new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`)
  const local = new Date(guess.toLocaleString('en-US', { timeZone: tz }))
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(guess.getTime() - (local.getTime() - utc.getTime()))
}
