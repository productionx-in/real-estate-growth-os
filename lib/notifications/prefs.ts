// lib/notifications/prefs.ts — which alerts reach someone's phone or desktop (web push), and when. Pure, so the
// settings screens, the APIs, the dispatcher (lib/jobs/handlers.ts) and the tests share one definition.
//   * Every alert always lands in the in-app inbox; these choices only decide the push alert.
//   * The workspace sets team defaults (Settings → Notification defaults, owners and admins).
//   * Each person can override any of them, and set quiet hours (India time) when no push alerts are sent.
// Stored: org_settings.notifications (team) and profiles.notification_prefs (person), 20260076.

export const ALERTS = {
  lead_assigned: { label: 'A lead is assigned to me', hint: 'Including leads moved to you by a manager or a rule.', urgent: true },
  lead_new: { label: 'A new lead arrives (owners, admins and managers)', hint: 'Every new lead, with who it went to.', urgent: true },
  lead_uncontacted: { label: 'A lead of mine is still not contacted', hint: 'Repeats until someone calls or messages the lead.', urgent: false },
  lead_unassigned: { label: 'A lead is taken off me', hint: 'Reassigned to someone else.', urgent: false },
  sla_nudge: { label: 'A new lead is waiting for my first call', hint: 'Shortly before the response target runs out.', urgent: true },
  sla_breach: { label: 'A lead missed its response target', hint: 'Sent to managers and the lead’s owner.', urgent: true },
  follow_up_due: { label: 'A follow-up is due', hint: 'At the time you set.', urgent: false },
  follow_up_overdue: { label: 'A follow-up is overdue', hint: 'Once, when it slips past due.', urgent: false },
  achievement: { label: 'I unlock an achievement, finish a mission or reach a target', hint: 'Including level ups.', urgent: false },
  plot_map: { label: 'Plot map setup news', hint: 'When your plot map needs something or is ready to review.', urgent: false },
  document_viewed: { label: 'A buyer opened a document I shared', hint: 'The first time they open it.', urgent: false },
} as const
export type AlertType = keyof typeof ALERTS

export const ALERT_TYPES = Object.keys(ALERTS) as AlertType[]

/** Team defaults: everything on, as before these settings existed. */
export interface TeamDefaults { push: Record<AlertType, boolean> }
export const DEFAULT_TEAM: TeamDefaults = { push: Object.fromEntries(ALERT_TYPES.map((t) => [t, true])) as Record<AlertType, boolean> }

export interface QuietHours {
  enabled: boolean
  /** "HH:MM", India time. A window may cross midnight (21:00 → 08:00). */
  start: string
  end: string
  /** Still send urgent alerts (new lead assigned, response target) during quiet hours. */
  allowUrgent: boolean
}

export interface PersonPrefs {
  /** Only the types this person changed; the rest follow the team default. */
  push: Partial<Record<AlertType, boolean>>
  quiet: QuietHours
}
export const DEFAULT_PERSON: PersonPrefs = { push: {}, quiet: { enabled: false, start: '21:00', end: '08:00', allowUrgent: true } }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
type Errors = Record<string, string>

function bools(input: unknown, partial: boolean): { value: Partial<Record<AlertType, boolean>>; errors: Errors } {
  const o = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const value: Partial<Record<AlertType, boolean>> = {}
  const errors: Errors = {}
  for (const t of ALERT_TYPES) {
    if (typeof o[t] === 'boolean') value[t] = o[t] as boolean
    else if (o[t] !== undefined && o[t] !== null) errors[t] = 'On or off.'
    else if (!partial) value[t] = true
  }
  return { value, errors }
}

export function normaliseTeam(input: unknown): { value: TeamDefaults; errors: Errors } {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const r = bools(o.push, false)
  return { value: { push: r.value as Record<AlertType, boolean> }, errors: r.errors }
}

export function normalisePerson(input: unknown): { value: PersonPrefs; errors: Errors } {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>
  const r = bools(o.push, true)
  const q = (o.quiet && typeof o.quiet === 'object' ? o.quiet : {}) as Record<string, unknown>
  const errors = { ...r.errors }
  const start = typeof q.start === 'string' && HHMM.test(q.start) ? q.start : DEFAULT_PERSON.quiet.start
  const end = typeof q.end === 'string' && HHMM.test(q.end) ? q.end : DEFAULT_PERSON.quiet.end
  if (q.start !== undefined && start !== q.start) errors.start = 'Pick a start time.'
  if (q.end !== undefined && end !== q.end) errors.end = 'Pick an end time.'
  if (q.enabled === true && start === end) errors.end = 'Quiet hours must start and end at different times.'
  return { value: { push: r.value, quiet: { enabled: q.enabled === true, start, end, allowUrgent: q.allowUrgent !== false } }, errors }
}

/** Stored values (any shape) back into the types, defaults filled in; never throws. */
export function teamFromStored(v: unknown): TeamDefaults {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>
  const push = { ...DEFAULT_TEAM.push }
  const p = (o.push && typeof o.push === 'object' ? o.push : {}) as Record<string, unknown>
  for (const t of ALERT_TYPES) if (typeof p[t] === 'boolean') push[t] = p[t] as boolean
  return { push }
}
export function personFromStored(v: unknown): PersonPrefs {
  return normalisePerson(v).value
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3))

/** Is this instant inside the quiet window (India time)? */
export function inQuietHours(q: QuietHours, now: Date): boolean {
  if (!q.enabled || q.start === q.end) return false
  const ist = new Date(now.getTime() + 330 * 60_000)
  const m = ist.getUTCHours() * 60 + ist.getUTCMinutes()
  const s = minutes(q.start), e = minutes(q.end)
  return s < e ? m >= s && m < e : m >= s || m < e
}

/** Whether a push alert of this type goes to this person now, and if not, why (recorded on the delivery). */
export function pushDecision(type: string, person: PersonPrefs, team: TeamDefaults, now: Date): { send: true } | { send: false; reason: string } {
  if (!(type in ALERTS)) return { send: true } // types added later default to on
  const t = type as AlertType
  const on = person.push[t] ?? team.push[t]
  if (!on) return { send: false, reason: person.push[t] === false ? 'turned off by recipient' : 'turned off for the team' }
  if (inQuietHours(person.quiet, now) && !(person.quiet.allowUrgent && ALERTS[t].urgent)) return { send: false, reason: 'quiet hours' }
  return { send: true }
}
