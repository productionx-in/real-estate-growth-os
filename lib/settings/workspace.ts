// lib/settings/workspace.ts — workspace-wide settings (org_settings, 20260074): what each section holds, its defaults
// and the rules a saved value must follow. Pure, so the forms, the API and the tests share one definition.
// Nothing here is a secret; owners and admins change it (the API authorises), everyone in the workspace reads it.
import { DEFAULT_TEAM, normaliseTeam, teamFromStored, type TeamDefaults } from '@/lib/notifications/prefs'
import { fieldsFromStored, normaliseFields, type FieldDef } from '@/lib/settings/fields'
import { DEFAULT_LEAD_ALERTS, leadAlertsFromStored, normaliseLeadAlerts, type LeadAlertSettings } from '@/lib/notifications/lead-alerts'

export interface LeadSettings {
  /** Choices offered when a lead is marked Lost (in this order). */
  lostReasons: string[]
  /** Choices offered when a lead is marked Junk. */
  junkReasons: string[]
  /** Closing a lead as Lost or Junk needs one of the reasons above. */
  requireReason: boolean
}

/** Area units the inventory form accepts (lib/validations/inventory.ts). */
export const AREA_UNITS = { sqft: 'Square feet (sq ft)', sqyd: 'Square yards (sq yd)', acres: 'Acres', guntas: 'Guntas', cents: 'Cents' } as const
export type AreaUnit = keyof typeof AREA_UNITS

export interface InventorySettings {
  /** A unit put on hold goes back to Available after this many hours; 0 = holds never expire. */
  holdHours: number
  /** Area unit pre-filled for new flats, villas and commercial units. */
  areaUnitBuilt: AreaUnit
  /** Area unit pre-filled for new plots. */
  areaUnitLand: AreaUnit
  /**
   * What this workspace calls each unit status (e.g. "Blocked" → "Landowner share"). Only the names change: the five
   * statuses, what they mean for matching, the plot map and bookings, and the allowed changes between them stay fixed.
   */
  statusLabels: Record<UnitStatus, string>
}

export const UNIT_STATUSES = ['available', 'on_hold', 'booked', 'sold', 'blocked'] as const
export type UnitStatus = (typeof UNIT_STATUSES)[number]
export const DEFAULT_STATUS_LABELS: Record<UnitStatus, string> = { available: 'Available', on_hold: 'On hold', booked: 'Booked', sold: 'Sold', blocked: 'Blocked' }
/** What each status means, shown beside the name so a renamed status still says what it does. */
export const STATUS_MEANING: Record<UnitStatus, string> = {
  available: 'Can be offered and matched to buyers.',
  on_hold: 'Reserved for a buyer for a while; released automatically if a hold time is set.',
  booked: 'A booking has been made.',
  sold: 'Sale completed. Final.',
  blocked: 'Not for sale for now (for example, landowner’s share or management quota).',
}

export interface ReportSettings {
  /** Month the financial year starts, 1–12 (April in India). */
  fyStartMonth: number
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
}

export interface VisitSettings {
  /** E-mail the buyer when a visit is booked or moved. */
  buyerConfirmation: boolean
  /** Remind the buyer the day before (24 h) and shortly before (2 h). */
  buyerReminder24h: boolean
  buyerReminder2h: boolean
  /** A check-in further than this from the project is flagged on the calendar. */
  checkinRadiusM: number
  /** Most visits one salesperson can have on one day (India time); 0 = no limit. */
  maxPerPersonPerDay: number
}

export interface MatchingSettings {
  /** How far over a buyer's top budget a unit may be and still be suggested, in %. */
  overBudgetPct: number
  /** Matches scoring below this (out of 100) are not shown. */
  minScore: number
  /** How many matching units a lead shows. */
  maxSuggestions: number
}

export interface ListSettings {
  /** Localities and cities the workspace sells in, offered when recording what a buyer wants. */
  locations: string[]
}

export interface FieldSettings {
  /** The workspace's own fields on leads (lib/settings/fields.ts). */
  lead: FieldDef[]
}

export interface WhatsAppSettings {
  /** Reply once, automatically, the first time a buyer writes to the workspace's WhatsApp number. */
  welcomeEnabled: boolean
  welcomeMessage: string
  /** Outside business hours, tell the buyer when they will hear back (at most once every 12 hours per buyer). */
  awayEnabled: boolean
  awayMessage: string
  /** Business hours, India time: from hoursStart:00 to hoursEnd:00 on workDays (0 = Sunday … 6 = Saturday). */
  hoursStart: number
  hoursEnd: number
  workDays: number[]
}

/** Workspace security (20260106). */
export interface SecuritySettings {
  /** Every member must use two-step verification (an authenticator app code at each sign-in). */
  requireTwoStep: boolean
}

export interface WorkspaceSettings { security: SecuritySettings; leads: LeadSettings; inventory: InventorySettings; reports: ReportSettings; lists: ListSettings; fields: FieldSettings; notifications: TeamDefaults; visits: VisitSettings; matching: MatchingSettings; whatsapp: WhatsAppSettings; alerts: LeadAlertSettings }
export type SettingsSection = keyof WorkspaceSettings

// The reasons Indian sales teams record most often; a workspace edits, reorders or replaces them.
export const DEFAULT_SETTINGS: WorkspaceSettings = {
  security: { requireTwoStep: false },
  leads: {
    lostReasons: ['Budget does not match', 'Location does not suit', 'Bought elsewhere', 'Plan postponed', 'Home loan not approved', 'Stopped responding', 'Chose a ready-to-move home'],
    junkReasons: ['Wrong or invalid number', 'Duplicate enquiry', 'Not looking to buy', 'Broker or agent', 'Spam or test'],
    requireReason: true,
  },
  inventory: { holdHours: 0, areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd', statusLabels: DEFAULT_STATUS_LABELS },
  reports: { fyStartMonth: 4, weekStartsOn: 1 },
  lists: { locations: [] },
  fields: { lead: [] },
  notifications: DEFAULT_TEAM,
  visits: { buyerConfirmation: true, buyerReminder24h: true, buyerReminder2h: true, checkinRadiusM: 500, maxPerPersonPerDay: 0 },
  // Off until a workspace writes its own words: nothing is ever sent to buyers on RE’s say-so.
  whatsapp: {
    welcomeEnabled: false,
    welcomeMessage: 'Hi {{first_name}}, thank you for contacting us! One of our property advisors will reply shortly.',
    awayEnabled: false,
    awayMessage: 'Hi {{first_name}}, thanks for your message. Our team is available Monday to Saturday, 10 am to 7 pm, and will reply as soon as we are back.',
    hoursStart: 10, hoursEnd: 19, workDays: [1, 2, 3, 4, 5, 6],
  },
  matching: { overBudgetPct: 10, minScore: 0, maxSuggestions: 8 },
  // Lead alerts are on until a workspace turns them off (lib/notifications/lead-alerts.ts).
  alerts: DEFAULT_LEAD_ALERTS,
}

export const LIMITS = { reasons: 20, reasonLength: 80, holdHours: 720, locations: 200, locationLength: 60, statusLabel: 24 } as const

type Errors = Record<string, string>

function reasons(input: unknown, label: string, errors: Errors, key: string): string[] {
  if (!Array.isArray(input)) { errors[key] = `${label}: a list is expected.`; return [] }
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    const r = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
    if (!r) continue
    if (r.length > LIMITS.reasonLength) { errors[key] = `${label}: keep each reason under ${LIMITS.reasonLength} characters.`; continue }
    if (seen.has(r.toLowerCase())) continue
    seen.add(r.toLowerCase()); out.push(r)
  }
  if (out.length > LIMITS.reasons) errors[key] = `${label}: at most ${LIMITS.reasons} reasons.`
  return out.slice(0, LIMITS.reasons)
}

/**
 * Checks and tidies one section before it is saved. Unknown keys are dropped. `current` is what is saved now: field
 * definitions keep their keys and types, and removed fields are archived rather than lost.
 */
export function normaliseSection<S extends SettingsSection>(section: S, input: unknown, current?: WorkspaceSettings): { value: WorkspaceSettings[S]; errors: Errors } {
  const errors: Errors = {}
  const o = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  if (section === 'security') {
    return { value: { requireTwoStep: o.requireTwoStep === true } as WorkspaceSettings[S], errors }
  }
  if (section === 'alerts') {
    const r = normaliseLeadAlerts(o)
    return { value: r.value as WorkspaceSettings[S], errors: r.errors }
  }
  if (section === 'notifications') {
    const r = normaliseTeam(o)
    return { value: r.value as WorkspaceSettings[S], errors: r.errors }
  }
  if (section === 'fields') {
    const r = normaliseFields(o.lead, current?.fields.lead ?? [])
    return { value: { lead: r.value } as WorkspaceSettings[S], errors: r.errors }
  }
  if (section === 'lists') {
    const seen = new Set<string>()
    const locations: string[] = []
    for (const raw of Array.isArray(o.locations) ? o.locations : []) {
      const v = typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : ''
      if (v.length < 2 || seen.has(v.toLowerCase())) continue
      if (v.length > LIMITS.locationLength) { errors.locations = `Keep each location under ${LIMITS.locationLength} characters.`; continue }
      seen.add(v.toLowerCase()); locations.push(v)
    }
    if (locations.length > LIMITS.locations) errors.locations = `At most ${LIMITS.locations} locations.`
    return { value: { locations: locations.slice(0, LIMITS.locations) } as WorkspaceSettings[S], errors }
  }
  if (section === 'visits' || section === 'matching') {
    const int = (key: string, min: number, max: number, fallback: number, message: string) => {
      const v = typeof o[key] === 'number' ? (o[key] as number) : NaN
      if (Number.isInteger(v) && v >= min && v <= max) return v
      errors[key] = message
      return fallback
    }
    if (section === 'visits') {
      const value: VisitSettings = {
        buyerConfirmation: o.buyerConfirmation !== false,
        buyerReminder24h: o.buyerReminder24h !== false,
        buyerReminder2h: o.buyerReminder2h !== false,
        checkinRadiusM: int('checkinRadiusM', 100, 5000, 500, 'Check-in distance: 100 to 5,000 metres.'),
        maxPerPersonPerDay: int('maxPerPersonPerDay', 0, 20, 0, 'Visits per person per day: 0 (no limit) to 20.'),
      }
      return { value: value as WorkspaceSettings[S], errors }
    }
    const value: MatchingSettings = {
      overBudgetPct: int('overBudgetPct', 0, 25, 10, 'Over budget: 0 to 25%.'),
      minScore: int('minScore', 0, 80, 0, 'Minimum match: 0 to 80.'),
      maxSuggestions: int('maxSuggestions', 3, 20, 8, 'Suggestions: 3 to 20.'),
    }
    return { value: value as WorkspaceSettings[S], errors }
  }
  if (section === 'whatsapp') {
    const text = (key: string, label: string, enabled: boolean, fallback: string) => {
      const v = typeof o[key] === 'string' ? (o[key] as string).replace(/\r\n/g, '\n').trim() : ''
      if (v.length > 1000) errors[key] = `${label}: keep it under 1,000 characters.`
      else if (enabled && !v) errors[key] = `${label}: write the message, or turn it off.`
      const bad = [...v.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].map((m) => m[1]).filter((x) => x.toLowerCase() !== 'first_name')
      if (bad.length) errors[key] = `${label}: only {{first_name}} can be filled in; remove {{${bad[0]}}}.`
      return v.slice(0, 1000) || fallback
    }
    const hour = (key: string, fallback: number) => {
      const v = o[key]
      if (typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 24) return v
      errors[key] = 'Pick an hour.'
      return fallback
    }
    const welcomeEnabled = o.welcomeEnabled === true, awayEnabled = o.awayEnabled === true
    const days = [...new Set((Array.isArray(o.workDays) ? o.workDays : []).filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6))].sort()
    const value: WhatsAppSettings = {
      welcomeEnabled,
      welcomeMessage: text('welcomeMessage', 'Welcome message', welcomeEnabled, DEFAULT_SETTINGS.whatsapp.welcomeMessage),
      awayEnabled,
      awayMessage: text('awayMessage', 'Away message', awayEnabled, DEFAULT_SETTINGS.whatsapp.awayMessage),
      hoursStart: hour('hoursStart', 10),
      hoursEnd: hour('hoursEnd', 19),
      workDays: days,
    }
    if (value.hoursEnd <= value.hoursStart) errors.hoursEnd = 'Business hours must end after they start.'
    if (awayEnabled && !days.length) errors.workDays = 'Pick at least one working day.'
    return { value: value as WorkspaceSettings[S], errors }
  }
  if (section === 'leads') {
    const value: LeadSettings = {
      lostReasons: reasons(o.lostReasons, 'Lost reasons', errors, 'lostReasons'),
      junkReasons: reasons(o.junkReasons, 'Junk reasons', errors, 'junkReasons'),
      requireReason: o.requireReason !== false,
    }
    if (value.requireReason && (!value.lostReasons.length || !value.junkReasons.length)) {
      errors.requireReason = 'Add at least one reason to each list, or stop asking for a reason.'
    }
    return { value: value as WorkspaceSettings[S], errors }
  }
  if (section === 'reports') {
    const m = Number(o.fyStartMonth)
    const value: ReportSettings = {
      fyStartMonth: Number.isInteger(m) && m >= 1 && m <= 12 ? m : 4,
      weekStartsOn: o.weekStartsOn === 0 ? 0 : 1,
    }
    if (!(Number.isInteger(m) && m >= 1 && m <= 12)) errors.fyStartMonth = 'Pick the month your financial year starts.'
    if (o.weekStartsOn !== 0 && o.weekStartsOn !== 1) errors.weekStartsOn = 'The week starts on Sunday or Monday.'
    return { value: value as WorkspaceSettings[S], errors }
  }
  // Only real numbers (a form sends them as numbers): Number(null) or Number('') would silently become 0.
  const hours = typeof o.holdHours === 'number' ? o.holdHours : typeof o.holdHours === 'string' && /^\d+$/.test(o.holdHours) ? Number(o.holdHours) : NaN
  const unit = (v: unknown, fallback: AreaUnit, key: string): AreaUnit => {
    if (typeof v === 'string' && v in AREA_UNITS) return v as AreaUnit
    errors[key] = 'Pick an area unit from the list.'
    return fallback
  }
  const value: InventorySettings = {
    holdHours: Number.isInteger(hours) && hours >= 0 && hours <= LIMITS.holdHours ? hours : 0,
    areaUnitBuilt: unit(o.areaUnitBuilt, 'sqft', 'areaUnitBuilt'),
    areaUnitLand: unit(o.areaUnitLand, 'sqyd', 'areaUnitLand'),
    statusLabels: statusLabelsFrom(o.statusLabels, errors),
  }
  if (!(Number.isInteger(hours) && hours >= 0 && hours <= LIMITS.holdHours)) errors.holdHours = `Hold time is a whole number of hours from 0 to ${LIMITS.holdHours} (30 days).`
  return { value: value as WorkspaceSettings[S], errors }
}

/** Status names: each 1–24 characters after trimming, no two the same (ignoring case); blanks fall back to the default. */
function statusLabelsFrom(v: unknown, errors: Record<string, string>): Record<UnitStatus, string> {
  const given = v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const out = { ...DEFAULT_STATUS_LABELS }
  for (const k of UNIT_STATUSES) {
    const raw = typeof given[k] === 'string' ? (given[k] as string).replace(/\s+/g, ' ').trim() : ''
    if (!raw) continue
    if (raw.length > LIMITS.statusLabel) { errors[`statusLabels.${k}`] = `Keep status names to ${LIMITS.statusLabel} characters.`; continue }
    out[k] = raw
  }
  const seen = new Map<string, UnitStatus>()
  for (const k of UNIT_STATUSES) {
    const key = out[k].toLowerCase()
    if (seen.has(key)) { errors[`statusLabels.${k}`] = `“${out[k]}” is already the name of another status.`; out[k] = DEFAULT_STATUS_LABELS[k] }
    else seen.set(key, k)
  }
  return out
}

/** A stored row (possibly partial or from an older version) merged over the defaults; never throws. */
export function settingsFromRow(row: { security?: unknown; leads?: unknown; inventory?: unknown; reports?: unknown; lists?: unknown; fields?: unknown; notifications?: unknown; visits?: unknown; matching?: unknown; whatsapp?: unknown; alerts?: unknown } | null | undefined): WorkspaceSettings {
  const merge = <S extends SettingsSection>(s: S, stored: unknown): WorkspaceSettings[S] => {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) || !Object.keys(stored).length) return DEFAULT_SETTINGS[s]
    const { value } = normaliseSection(s, { ...DEFAULT_SETTINGS[s], ...(stored as object) })
    return value
  }
  const stored = (row?.fields && typeof row.fields === 'object' ? row.fields : {}) as { lead?: unknown }
  return {
    security: merge('security', row?.security),
    leads: merge('leads', row?.leads), inventory: merge('inventory', row?.inventory), reports: merge('reports', row?.reports),
    lists: merge('lists', row?.lists),
    // Field definitions are read as stored (they were checked when saved); malformed entries are dropped.
    fields: { lead: fieldsFromStored(stored.lead) },
    notifications: teamFromStored(row?.notifications),
    visits: merge('visits', row?.visits), matching: merge('matching', row?.matching),
    whatsapp: merge('whatsapp', row?.whatsapp),
    alerts: leadAlertsFromStored(row?.alerts),
  }
}

/** The reason a person picked when closing a lead, checked against the workspace's list. "Other" needs a note. */
export function checkCloseReason(settings: LeadSettings, status: 'lost' | 'junk', reason: string | undefined, note: string | undefined):
  { ok: true; reason: string | null } | { ok: false; error: string } {
  const list = status === 'lost' ? settings.lostReasons : settings.junkReasons
  const r = reason?.trim()
  if (!r) return settings.requireReason ? { ok: false, error: `Choose why this lead is ${status === 'lost' ? 'lost' : 'junk'}.` } : { ok: true, reason: null }
  if (r === 'Other') return note?.trim() ? { ok: true, reason: 'Other' } : { ok: false, error: 'Add a note saying what the other reason is.' }
  const match = list.find((x) => x.toLowerCase() === r.toLowerCase())
  return match ? { ok: true, reason: match } : { ok: false, error: 'That reason is not in your workspace’s list. Refresh the page and pick again.' }
}

/** "2 days" / "36 hours" for the hold-time setting and the inventory screens. */
export function describeHold(hours: number): string {
  if (!hours) return 'Holds stay until someone releases them'
  if (hours % 24 === 0) return `${hours / 24} day${hours === 24 ? '' : 's'}`
  return `${hours} hour${hours === 1 ? '' : 's'}`
}
