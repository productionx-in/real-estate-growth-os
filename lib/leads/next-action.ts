// lib/leads/next-action.ts — the one thing to do next on a lead (pure). Derived only from what is recorded: the stage,
// whether anyone has acted yet and the response deadline, open follow-ups, matching units and shared documents.
// Shown on the lead page; never changes anything by itself.
import type { LeadStatus } from '@/types/database'
import { STATUS_LABELS } from '@/lib/leads/transitions'

export interface NextActionInput {
  status: LeadStatus
  merged: boolean
  firstActionAt: string | null
  slaDueAt: string | null
  /** Open follow-ups (calls, meetings…). */
  openTasks: { due_at: string; kind: string }[]
  /** Available units that fit the buyer's requirements. */
  matches: number
  /** Documents shared with the buyer (quotes, cost sheets…). */
  documentsShared: number
  lastActivityAt: string | null
}

export type ActionTarget = 'work' | 'visit' | 'matches' | 'documents' | 'stage' | null
export interface NextAction { title: string; detail: string; tone: 'danger' | 'warning' | 'brand'; target: ActionTarget; secondary: string | null }

const HOUR = 3_600_000
const when = (iso: string, now: Date) => {
  const h = Math.round((new Date(iso).getTime() - now.getTime()) / HOUR)
  if (Math.abs(h) < 1) return 'now'
  if (h < 0) return Math.abs(h) < 48 ? `${Math.abs(h)} h ago` : `${Math.round(-h / 24)} days ago`
  return h < 48 ? `in ${h} h` : `in ${Math.round(h / 24)} days`
}

export function nextAction(l: NextActionInput, now: Date = new Date()): NextAction | null {
  if (l.merged || ['booked', 'lost', 'junk'].includes(l.status)) return null
  const open = [...l.openTasks].sort((a, b) => a.due_at.localeCompare(b.due_at))
  const overdue = open.find((t) => new Date(t.due_at) < now)
  const quietDays = l.lastActivityAt ? Math.floor((now.getTime() - new Date(l.lastActivityAt).getTime()) / (24 * HOUR)) : null
  const secondary = !open.length ? 'No follow-up is scheduled — set one so this lead is not forgotten.'
    : quietDays !== null && quietDays >= 7 ? `Nothing recorded for ${quietDays} days.` : null

  if (!l.firstActionAt) {
    const late = l.slaDueAt && new Date(l.slaDueAt) < now
    return { title: 'Call now', detail: l.slaDueAt ? `First response ${late ? 'was due' : 'is due'} ${when(l.slaDueAt, now)}. Log the outcome after the call.` : 'Nobody has contacted this buyer yet. Log the outcome after the call.',
      tone: late ? 'danger' : 'warning', target: 'work', secondary: null }
  }
  if (overdue) {
    return { title: `${overdue.kind === 'call' ? 'Call back' : 'Follow up'} — overdue`, detail: `This follow-up was due ${when(overdue.due_at, now)}.`, tone: 'danger', target: 'work', secondary: null }
  }
  switch (l.status) {
    case 'new':
    case 'contacted':
      return { title: 'Qualify the buyer', detail: 'Confirm budget, preferred configuration, location and timeline, then move the lead to Qualified.', tone: 'brand', target: 'stage', secondary }
    case 'qualified':
      return l.matches > 0
        ? { title: `Share ${l.matches} matching unit${l.matches === 1 ? '' : 's'}`, detail: 'Send the options that fit, then invite the buyer for a site visit.', tone: 'brand', target: 'matches', secondary }
        : { title: 'Schedule a site visit', detail: 'Buyers who visit are far more likely to book. Offer two time slots.', tone: 'brand', target: 'visit', secondary }
    case 'site_visit_scheduled':
      return { title: 'Confirm the site visit', detail: 'Remind the buyer the day before and share the location. After the visit, mark it Visited.', tone: 'brand', target: 'work', secondary }
    case 'site_visited':
      return l.documentsShared === 0
        ? { title: 'Send a cost sheet', detail: 'Share the price breakdown for the unit the buyer liked while the visit is fresh.', tone: 'brand', target: 'documents', secondary }
        : { title: 'Follow up on the offer', detail: 'Ask what is holding them back; move to Negotiating once terms are being discussed.', tone: 'brand', target: 'stage', secondary }
    case 'negotiation':
      return { title: 'Close the booking', detail: 'Agree the final terms and booking amount, then mark the lead Booked.', tone: 'brand', target: 'stage', secondary }
    default:
      return { title: `Move the lead on from ${STATUS_LABELS[l.status] ?? l.status}`, detail: '', tone: 'brand', target: 'stage', secondary }
  }
}

/** The main pipeline, in order, for the stage stepper (Lost and Junk are shown as a closed state, not a step). */
export const PIPELINE: LeadStatus[] = ['new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visited', 'negotiation', 'booked']
