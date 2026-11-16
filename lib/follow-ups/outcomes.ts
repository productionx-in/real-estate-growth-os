// lib/follow-ups/outcomes.ts
// Call outcomes ("dispositions") a salesperson logs in two taps, and what each one does to the lead.
// Pure data + functions: shared by the API (enforcement) and the UI (buttons, defaults).
import type { LeadStatus } from '@/types/database'

export const OUTCOMES = [
  'interested', 'call_back', 'no_answer', 'busy', 'site_visit_booked', 'not_interested', 'wrong_number', 'booked',
] as const
export type Outcome = (typeof OUTCOMES)[number]

export interface OutcomeRule {
  label: string
  /** Lead status after this outcome; null keeps the current status. */
  status: LeadStatus | null
  /** Non-terminal outcomes must schedule the next follow-up — nothing is left without a next step. */
  requiresFollowUp: boolean
  /** Suggested delay for the next follow-up, in minutes. */
  defaultFollowUpMinutes: number | null
  followUpKind: 'call' | 'site_visit' | 'meeting' | 'whatsapp'
  tone: 'positive' | 'neutral' | 'negative'
}

export const OUTCOME_RULES: Record<Outcome, OutcomeRule> = {
  interested:        { label: 'Interested',          status: 'qualified',            requiresFollowUp: true,  defaultFollowUpMinutes: 24 * 60, followUpKind: 'call',       tone: 'positive' },
  site_visit_booked: { label: 'Site visit booked',   status: 'site_visit_scheduled', requiresFollowUp: true,  defaultFollowUpMinutes: 48 * 60, followUpKind: 'site_visit', tone: 'positive' },
  call_back:         { label: 'Asked to call back',  status: 'contacted',            requiresFollowUp: true,  defaultFollowUpMinutes: 4 * 60,  followUpKind: 'call',       tone: 'neutral' },
  no_answer:         { label: 'No answer',           status: null,                   requiresFollowUp: true,  defaultFollowUpMinutes: 2 * 60,  followUpKind: 'call',       tone: 'neutral' },
  busy:              { label: 'Busy / disconnected', status: null,                   requiresFollowUp: true,  defaultFollowUpMinutes: 60,      followUpKind: 'call',       tone: 'neutral' },
  not_interested:    { label: 'Not interested',      status: 'lost',                 requiresFollowUp: false, defaultFollowUpMinutes: null,    followUpKind: 'call',       tone: 'negative' },
  wrong_number:      { label: 'Wrong number / junk', status: 'junk',                 requiresFollowUp: false, defaultFollowUpMinutes: null,    followUpKind: 'call',       tone: 'negative' },
  booked:            { label: 'Booked',              status: 'booked',               requiresFollowUp: false, defaultFollowUpMinutes: null,    followUpKind: 'call',       tone: 'positive' },
}

const TERMINAL: LeadStatus[] = ['booked', 'lost', 'junk']

/**
 * Status after an outcome. Never moves a lead backwards in the funnel by accident: a "call back" on a lead that
 * already had a site visit keeps it at site_visited; only explicit terminal outcomes override.
 */
export function nextStatus(current: LeadStatus, outcome: Outcome): LeadStatus {
  const target = OUTCOME_RULES[outcome].status
  if (!target) return current === 'new' ? 'contacted' : current
  if (TERMINAL.includes(target)) return target
  const order: LeadStatus[] = ['new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visited', 'negotiation']
  const ci = order.indexOf(current)
  const ti = order.indexOf(target)
  if (ci === -1) return target // re-opening a lost/junk lead via a positive call
  return ti > ci ? target : current
}
