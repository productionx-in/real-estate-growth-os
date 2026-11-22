// lib/plots/setup.ts — Interactive Plot Map setup progress and estimate (pure; docs/product/PLOT_MAP_ADDON.md §6).
// Every stage is completed by a recorded operation (activation, upload, a render that passed its checks, a review
// step) — never by hand. Progress = completed stages ÷ 8. Estimates are configurable service levels in business hours
// (Mon–Sat, 10:00–19:00 India time), scaled by the work actually there (pages, plots, outline complexity, links left);
// the clock pauses only while an open blocker waits on the customer, and that pause is shown. Customer stages carry
// a stated assumption (one business day each), never a countdown.

export const STAGES = [
  { key: 'activated', label: 'Add-on activated', owner: 'regrow' },
  { key: 'uploaded', label: 'Layout uploaded', owner: 'customer' },
  { key: 'processed', label: 'File checked and processed', owner: 'system' },
  { key: 'mapped', label: 'Plot boundaries mapped', owner: 'regrow' },
  { key: 'linked', label: 'Inventory linked', owner: 'customer' },
  { key: 'qa', label: 'Quality check done', owner: 'regrow' },
  { key: 'approved', label: 'Developer approval', owner: 'customer' },
  { key: 'published', label: 'Map published', owner: 'customer' },
] as const
export type StageKey = (typeof STAGES)[number]['key']
export type Owner = 'regrow' | 'customer' | 'system'

/** Service levels in business hours. Customer stages have none: they are assumed, and say so. */
export const SLA = {
  processedHours: 1,
  mappedBaseHours: 6,
  mappedPerPlotHours: 0.04,
  mappedPerExtraPageHours: 1,
  rasterFactor: 1.3,
  complexVertexThreshold: 8,
  complexFactor: 1.25,
  qaBaseHours: 3,
  qaPerPlotHours: 0.01,
  customerAssumedHours: 9, // one business day
} as const

export const BUSINESS = { startHour: 10, endHour: 19, workdays: [1, 2, 3, 4, 5, 6] as number[], tzOffsetMin: 330 }

export interface SetupFacts {
  activatedAt: string | null
  firstUploadAt: string | null
  firstRenderedAt: string | null
  /** First submission of a version (mapping done enough to review). */
  firstSubmittedAt: string | null
  /** First submission of a version whose plots were all linked when it went to review. */
  linkedAt: string | null
  qaPassedAt: string | null
  approvedAt: string | null
  publishedAt: string | null
  /** For the estimate: what is actually there. */
  kind: 'pdf' | 'png' | 'jpeg' | null
  pages: number
  plots: number
  /** Project units (when nothing is drawn yet, the plots expected). */
  units: number
  avgVertices: number
  unlinked: number
  blockers: { id?: string; stage: string; waitingOn: 'customer' | 'regrow'; raisedAt: string; resolvedAt: string | null; reason: string }[]
}

export interface StageView {
  key: StageKey; label: string; owner: Owner
  state: 'done' | 'current' | 'pending'
  startedAt: string | null
  completedAt: string | null
  /** Business hours this stage is planned to take (REGrow and system stages), or the stated customer assumption. */
  plannedHours: number
  assumed: boolean
}

export interface SetupView {
  stages: StageView[]
  completed: number
  progress: number
  current: StageView | null
  /** Expected completion of the whole setup (null when done). */
  estimate: string | null
  /** Expected completion of the current stage, if it has a service level. */
  currentDue: string | null
  overdue: boolean
  /** The open blocker waiting on the customer, if any (the clock is paused while it is open). */
  waitingOnCustomer: SetupFacts['blockers'][number] | null
  openBlockers: SetupFacts['blockers']
  lastUpdated: string | null
}

// ── business time (India Standard Time, no daylight saving) ───────────────────────────────────────────────────
const toIst = (d: Date) => new Date(d.getTime() + BUSINESS.tzOffsetMin * 60_000)
const fromIst = (d: Date) => new Date(d.getTime() - BUSINESS.tzOffsetMin * 60_000)
const isWorkday = (ist: Date) => BUSINESS.workdays.includes(ist.getUTCDay())

const nextDayStart = (t: Date) => new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, BUSINESS.startHour))

/** The instant `hours` business hours after `from` (work resumes at the next opening when `from` is outside hours). */
export function addBusinessHours(from: Date, hours: number): Date {
  let t = toIst(from)
  let left = Math.max(0, hours) * 60 // minutes
  for (let guard = 0; guard < 3660; guard++) {
    if (!isWorkday(t)) { t = nextDayStart(t); continue }
    const dayStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), BUSINESS.startHour))
    const dayEnd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), BUSINESS.endHour))
    if (t < dayStart) t = dayStart
    if (t >= dayEnd) { t = nextDayStart(t); continue }
    const avail = (dayEnd.getTime() - t.getTime()) / 60_000
    if (left <= avail) return fromIst(new Date(t.getTime() + left * 60_000))
    left -= avail
    t = nextDayStart(t)
  }
  return fromIst(t)
}

/** Business hours between two instants (0 if b ≤ a). */
export function businessHoursBetween(a: Date, b: Date): number {
  if (b <= a) return 0
  let t = toIst(a)
  const end = toIst(b)
  let mins = 0
  for (let guard = 0; guard < 3660 && t < end; guard++) {
    const dayStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), BUSINESS.startHour))
    const dayEnd = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), BUSINESS.endHour))
    if (isWorkday(t)) {
      const s = t > dayStart ? t : dayStart
      const e = end < dayEnd ? end : dayEnd
      if (e > s) mins += (e.getTime() - s.getTime()) / 60_000
    }
    t = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() + 1, 0))
  }
  return mins / 60
}

/** Planned business hours for each stage from the work that is actually there. */
export function plannedHours(f: Pick<SetupFacts, 'kind' | 'pages' | 'plots' | 'units' | 'avgVertices' | 'unlinked'>): Record<StageKey, { hours: number; assumed: boolean }> {
  const plots = Math.max(f.plots, f.units, 1)
  let mapped = SLA.mappedBaseHours + plots * SLA.mappedPerPlotHours + Math.max(0, f.pages - 1) * SLA.mappedPerExtraPageHours
  if (f.kind === 'png' || f.kind === 'jpeg') mapped *= SLA.rasterFactor
  if (f.avgVertices > SLA.complexVertexThreshold) mapped *= SLA.complexFactor
  const customer = { hours: SLA.customerAssumedHours, assumed: true }
  return {
    activated: { hours: 0, assumed: false },
    uploaded: customer,
    processed: { hours: SLA.processedHours, assumed: false },
    mapped: { hours: Math.round(mapped * 10) / 10, assumed: false },
    linked: customer,
    qa: { hours: Math.round((SLA.qaBaseHours + plots * SLA.qaPerPlotHours) * 10) / 10, assumed: false },
    approved: customer,
    published: { hours: 1, assumed: true },
  }
}

const max = (...xs: (string | null)[]) => xs.filter(Boolean).sort().at(-1) ?? null

export function setupView(f: SetupFacts, now: Date = new Date()): SetupView {
  const doneAt: Record<StageKey, string | null> = {
    activated: f.activatedAt, uploaded: f.firstUploadAt, processed: f.firstRenderedAt, mapped: f.firstSubmittedAt,
    linked: f.linkedAt, qa: f.qaPassedAt, approved: f.approvedAt, published: f.publishedAt,
  }
  // Stages are sequential: a later recorded step means every earlier one is done (at the latest by then).
  const keys = STAGES.map((s) => s.key)
  for (let i = keys.length - 2; i >= 0; i--) {
    const later = doneAt[keys[i + 1]]
    if (later && !doneAt[keys[i]]) doneAt[keys[i]] = later
  }
  const plan = plannedHours(f)
  const stages: StageView[] = []
  let prevDone: string | null = null
  let currentSeen = false
  for (const s of STAGES) {
    const completedAt = doneAt[s.key]
    const state: StageView['state'] = completedAt ? 'done' : currentSeen ? 'pending' : 'current'
    if (state === 'current') currentSeen = true
    stages.push({ key: s.key, label: s.label, owner: s.owner, state, startedAt: state === 'pending' ? null : prevDone, completedAt, plannedHours: plan[s.key].hours, assumed: plan[s.key].assumed })
    if (completedAt) prevDone = completedAt
  }
  const completed = stages.filter((s) => s.state === 'done').length
  const current = stages.find((s) => s.state === 'current') ?? null
  const openBlockers = f.blockers.filter((b) => !b.resolvedAt)
  const waitingOnCustomer = openBlockers.find((b) => b.waitingOn === 'customer') ?? null

  let currentDue: string | null = null
  let overdue = false
  let estimate: string | null = null
  if (current) {
    // Time spent on the current stage, minus time it waited on the customer.
    const started = current.startedAt ? new Date(current.startedAt) : now
    let spent = businessHoursBetween(started, now)
    for (const b of f.blockers) {
      if (b.waitingOn !== 'customer') continue
      const from = new Date(Math.max(new Date(b.raisedAt).getTime(), started.getTime()))
      const to = b.resolvedAt ? new Date(b.resolvedAt) : now
      spent -= businessHoursBetween(from, to)
    }
    spent = Math.max(0, spent)
    const left = Math.max(0, current.plannedHours - spent)
    if (current.owner !== 'customer' && !waitingOnCustomer) {
      currentDue = addBusinessHours(now, left).toISOString()
      overdue = spent > current.plannedHours && current.plannedHours > 0
    }
    const rest = stages.filter((s) => s.state === 'pending').reduce((n, s) => n + s.plannedHours, 0)
    estimate = addBusinessHours(now, (waitingOnCustomer ? SLA.customerAssumedHours : 0) + left + rest).toISOString()
  }
  return {
    stages, completed, progress: completed / STAGES.length, current, estimate, currentDue, overdue, waitingOnCustomer, openBlockers,
    lastUpdated: max(...Object.values(doneAt), ...f.blockers.map((b) => b.resolvedAt ?? b.raisedAt)),
  }
}
