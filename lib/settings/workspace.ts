// lib/settings/workspace.ts — workspace-wide settings (org_settings, 20260074): what each section holds, its defaults
// and the rules a saved value must follow. Pure, so the forms, the API and the tests share one definition.
// Nothing here is a secret; owners and admins change it (the API authorises), everyone in the workspace reads it.

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
}

export interface ReportSettings {
  /** Month the financial year starts, 1–12 (April in India). */
  fyStartMonth: number
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn: 0 | 1
}

export interface WorkspaceSettings { leads: LeadSettings; inventory: InventorySettings; reports: ReportSettings }
export type SettingsSection = keyof WorkspaceSettings

// The reasons Indian sales teams record most often; a workspace edits, reorders or replaces them.
export const DEFAULT_SETTINGS: WorkspaceSettings = {
  leads: {
    lostReasons: ['Budget does not match', 'Location does not suit', 'Bought elsewhere', 'Plan postponed', 'Home loan not approved', 'Stopped responding', 'Chose a ready-to-move home'],
    junkReasons: ['Wrong or invalid number', 'Duplicate enquiry', 'Not looking to buy', 'Broker or agent', 'Spam or test'],
    requireReason: true,
  },
  inventory: { holdHours: 0, areaUnitBuilt: 'sqft', areaUnitLand: 'sqyd' },
  reports: { fyStartMonth: 4, weekStartsOn: 1 },
}

export const LIMITS = { reasons: 20, reasonLength: 80, holdHours: 720 } as const

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

/** Checks and tidies one section before it is saved. Unknown keys are dropped. */
export function normaliseSection<S extends SettingsSection>(section: S, input: unknown): { value: WorkspaceSettings[S]; errors: Errors } {
  const errors: Errors = {}
  const o = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
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
  }
  if (!(Number.isInteger(hours) && hours >= 0 && hours <= LIMITS.holdHours)) errors.holdHours = `Hold time is a whole number of hours from 0 to ${LIMITS.holdHours} (30 days).`
  return { value: value as WorkspaceSettings[S], errors }
}

/** A stored row (possibly partial or from an older version) merged over the defaults; never throws. */
export function settingsFromRow(row: { leads?: unknown; inventory?: unknown; reports?: unknown } | null | undefined): WorkspaceSettings {
  const merge = <S extends SettingsSection>(s: S, stored: unknown): WorkspaceSettings[S] => {
    if (!stored || typeof stored !== 'object' || Array.isArray(stored) || !Object.keys(stored).length) return DEFAULT_SETTINGS[s]
    const { value } = normaliseSection(s, { ...DEFAULT_SETTINGS[s], ...(stored as object) })
    return value
  }
  return { leads: merge('leads', row?.leads), inventory: merge('inventory', row?.inventory), reports: merge('reports', row?.reports) }
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
