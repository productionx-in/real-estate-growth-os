// lib/leads/transitions.ts
// The lead pipeline: which stage a lead may move to next. One definition, used by the status API (which
// enforces it), the stage panel on a lead's page and the board (which only offer what the API accepts).
import type { LeadStatus } from '@/types/database'

export const STATUS_ORDER: LeadStatus[] = [
  'new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visited', 'negotiation', 'booked', 'lost', 'junk',
]

export const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  qualified: 'Qualified',
  site_visit_scheduled: 'Visit scheduled',
  site_visited: 'Visited',
  negotiation: 'Negotiating',
  booked: 'Booked',
  lost: 'Lost',
  junk: 'Junk',
}

export const ALLOWED_TRANSITIONS: Partial<Record<LeadStatus, LeadStatus[]>> = {
  new: ['contacted', 'junk'],
  contacted: ['qualified', 'junk'],
  qualified: ['site_visit_scheduled', 'lost'],
  site_visit_scheduled: ['site_visited', 'lost'],
  site_visited: ['negotiation', 'lost'],
  negotiation: ['booked', 'lost'],
}

export function nextStatuses(from: LeadStatus): LeadStatus[] {
  return ALLOWED_TRANSITIONS[from] ?? []
}

export function canTransition(from: LeadStatus, to: LeadStatus): boolean {
  return nextStatuses(from).includes(to)
}
