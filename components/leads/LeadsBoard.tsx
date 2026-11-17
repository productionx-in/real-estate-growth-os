'use client'
// components/leads/LeadsBoard.tsx
// Leads as a board, one column per stage. Drag a card to the next stage, or use its "Move to" menu (works
// with a keyboard and on touch screens). Only moves the pipeline allows are offered; the status API
// checks them again and the card goes back if it refuses.
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, MoreHorizontal } from 'lucide-react'
import { Alert, Button } from '@/components/ui'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils/cn'
import { STATUS_LABELS, canTransition, nextStatuses } from '@/lib/leads/transitions'
import type { LeadStatus } from '@/types/database'

export interface BoardLead {
  id: string
  name: string
  phone: string
  status: LeadStatus
  priority: string
  next_follow_up_at: string | null
  project: { name: string } | null
  assignee: { full_name: string } | null
}

const PAGE = 30

function followUp(at: string | null, now: number): { text: string; overdue: boolean } | null {
  if (!at) return null
  const t = new Date(at).getTime()
  const date = new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return t < now ? { text: `Overdue · ${date}`, overdue: true } : { text: `Next · ${date}`, overdue: false }
}

export function LeadsBoard({ leads: initial, columns, orgSlug, canMove, truncated }: {
  leads: BoardLead[]
  columns: LeadStatus[]
  orgSlug: string
  canMove: boolean
  /** More leads match than the board loaded. */
  truncated: boolean
}) {
  const router = useRouter()
  // Moves not yet confirmed by the server, shown straight away; a refused move is simply dropped.
  const [pending, setPending] = useState<Record<string, LeadStatus>>({})
  const [, startTransition] = useTransition()
  const forget = (id: string) => setPending((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== id)))
  const leads = useMemo(
    () => initial.map((l) => (pending[l.id] ? { ...l, status: pending[l.id] } : l)),
    [initial, pending]
  )
  const [dragging, setDragging] = useState<BoardLead | null>(null)
  const [over, setOver] = useState<LeadStatus | null>(null)
  const [shown, setShown] = useState<Partial<Record<LeadStatus, number>>>({})
  const [error, setError] = useState<string | null>(null)
  const [moving, setMoving] = useState<string | null>(null)
  const [now] = useState(() => Date.now())

  const byStatus = useMemo(() => {
    const m = new Map<LeadStatus, BoardLead[]>(columns.map((c) => [c, []]))
    for (const l of leads) m.get(l.status)?.push(l)
    return m
  }, [leads, columns])

  async function move(lead: BoardLead, to: LeadStatus) {
    if (!canTransition(lead.status, to)) return
    setError(null)
    setMoving(lead.id)
    setPending((p) => ({ ...p, [lead.id]: to }))
    try {
      const res = await fetch(`/api/leads/${lead.id}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: to }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'The move was not saved.')
      }
      // Swap the optimistic card for the server's data in one step, once the refresh has arrived.
      startTransition(() => { router.refresh(); forget(lead.id) })
    } catch (e) {
      forget(lead.id)
      setError(`${lead.name}: ${e instanceof Error ? e.message : 'The move was not saved.'}`)
    } finally {
      setMoving(null)
    }
  }

  return (
    <div>
      {error && <Alert tone="danger" className="mb-3">{error}</Alert>}
      {truncated && (
        <p className="mb-3 text-[12px] text-muted">Showing the 500 most recent matching leads. Narrow the filters to see the rest.</p>
      )}
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3" aria-label="Leads by stage">
        {columns.map((status) => {
          const items = byStatus.get(status) ?? []
          const limit = shown[status] ?? PAGE
          const droppable = dragging !== null && canTransition(dragging.status, status)
          return (
            <section
              key={status}
              aria-label={`${STATUS_LABELS[status]}: ${items.length}`}
              onDragOver={(e) => { if (droppable) { e.preventDefault(); setOver(status) } }}
              onDragLeave={() => setOver((o) => (o === status ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (dragging && droppable) move(dragging, status) }}
              className={cn(
                'flex w-64 shrink-0 flex-col rounded-lg border bg-surface-muted transition-colors',
                droppable ? 'border-brand' : 'border-default',
                over === status && droppable && 'bg-brand-light',
                dragging && !droppable && dragging.status !== status && 'opacity-60'
              )}
            >
              <header className="flex items-center justify-between px-3 py-2">
                <h2 className="text-[12px] font-semibold text-foreground">{STATUS_LABELS[status]}</h2>
                <span className="rounded-full bg-surface px-1.5 text-[11px] font-medium text-muted">{items.length}</span>
              </header>
              <ol className="flex min-h-16 flex-col gap-2 px-2 pb-2">
                {items.slice(0, limit).map((lead) => {
                  const fu = followUp(lead.next_follow_up_at, now)
                  const options = canMove ? nextStatuses(lead.status) : []
                  return (
                    <li
                      key={lead.id}
                      draggable={options.length > 0}
                      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', lead.id); setDragging(lead) }}
                      onDragEnd={() => { setDragging(null); setOver(null) }}
                      aria-busy={moving === lead.id || undefined}
                      className={cn(
                        'group rounded-md border border-default bg-surface p-2.5 shadow-xs',
                        options.length > 0 && 'cursor-grab active:cursor-grabbing',
                        moving === lead.id && 'opacity-60'
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/${orgSlug}/leads/${lead.id}`} className="min-w-0 text-[13px] font-medium text-foreground hover:text-brand">
                          <span className="block truncate">{lead.name}</span>
                        </Link>
                        {options.length > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button size="icon" variant="ghost" className="-mr-1 -mt-1 h-6 w-6" aria-label={`Move ${lead.name}`}>
                                <MoreHorizontal aria-hidden />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Move to</DropdownMenuLabel>
                              {options.map((to) => (
                                <DropdownMenuItem key={to} onSelect={() => move(lead, to)} destructive={to === 'lost' || to === 'junk'}>
                                  <ArrowRight aria-hidden /> {STATUS_LABELS[to]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">{lead.phone}</p>
                      {lead.project && <p className="truncate text-[12px] text-muted">{lead.project.name}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                        {lead.priority === 'high' && <span className="font-medium text-danger">High priority</span>}
                        {fu && <span className={fu.overdue ? 'font-medium text-danger' : 'text-muted'}>{fu.text}</span>}
                        <span className="ml-auto truncate text-subtle">{lead.assignee?.full_name ?? 'Unassigned'}</span>
                      </div>
                    </li>
                  )
                })}
                {items.length === 0 && <li className="px-1 py-3 text-center text-[12px] text-subtle">No leads</li>}
              </ol>
              {items.length > limit && (
                <Button size="sm" variant="ghost" className="mx-2 mb-2" onClick={() => setShown((s) => ({ ...s, [status]: limit + PAGE }))}>
                  Show {Math.min(PAGE, items.length - limit)} more
                </Button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
