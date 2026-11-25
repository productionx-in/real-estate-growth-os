// lib/performance/rules.ts — sales performance and achievements: the workspace's settings (org_settings.gamification,
// 20260094), levels, metrics and the built-in achievements. Pure, so the settings form, the pages, the API and the tests
// share one definition. The database reads the same keys (gam_xp, perf_rewards): a missing value means the default.
//
// Points come only from real CRM events, recorded once each by the database (public.performance_events):
//   an assignment (0 points — an assignment is not a sale), a lead's first contact by a person, a follow-up done,
//   a site visit completed, a deal closed (un-booking reverses it), and the rewards below.

export const METRICS = {
  assigned: { label: 'Leads assigned', short: 'Assigned', unit: 'leads' },
  contacted: { label: 'Leads contacted', short: 'Contacted', unit: 'leads' },
  follow_ups: { label: 'Follow-ups completed', short: 'Follow-ups', unit: 'follow-ups' },
  meetings: { label: 'Site visits completed', short: 'Site visits', unit: 'visits' },
  closed: { label: 'Deals closed', short: 'Closed', unit: 'deals' },
  revenue: { label: 'Revenue booked', short: 'Revenue', unit: '₹' },
} as const
export type Metric = keyof typeof METRICS
export const TARGET_METRICS = Object.keys(METRICS) as Metric[]
/** What achievements and missions can count, beyond the target metrics. */
export const ACHIEVEMENT_METRICS = [...TARGET_METRICS, 'missions', 'targets', 'xp'] as const
export type AchievementMetric = (typeof ACHIEVEMENT_METRICS)[number]

export const PERIODS = { day: 'Daily', week: 'Weekly', month: 'Monthly', custom: 'Custom dates' } as const
export type Period = keyof typeof PERIODS

/** Points per event, as the database defaults them. */
export const XP_EVENTS = {
  first_contact: { label: 'First contact with a lead', default: 10 },
  follow_up_done: { label: 'Follow-up completed', default: 5 },
  visit_done: { label: 'Site visit completed', default: 25 },
  deal_closed: { label: 'Deal closed', default: 100 },
  target_hit: { label: 'Target reached', default: 50 },
} as const
export type XpEvent = keyof typeof XP_EVENTS

export interface Level { name: string; xp: number }
export interface Mission { key: string; title: string; metric: Metric; count: number; xp: number }
export type Visibility = 'everyone' | 'managers'

export interface GamificationSettings {
  enabled: boolean
  xp: Record<XpEvent, number>
  /** Follow-ups that earn points per person per day (more still count, without points). */
  followUpDailyCap: number
  levels: Level[]
  missions: Mission[]
  leaderboard: {
    /** Who sees the team leaderboard: everyone, or owners, admins and managers only (people always see their own). */
    visibleTo: Visibility
    show: { xp: boolean; contacted: boolean; closed: boolean; revenue: boolean; target: boolean }
  }
}

export const DEFAULT_LEVELS: Level[] = [
  { name: 'Beginner', xp: 0 }, { name: 'Rising Star', xp: 200 }, { name: 'Performer', xp: 600 },
  { name: 'Sales Expert', xp: 1500 }, { name: 'Elite Closer', xp: 3500 }, { name: 'Sales Champion', xp: 7000 },
]
export const DEFAULT_MISSIONS: Mission[] = [
  { key: 'contact5', title: 'Contact 5 leads', metric: 'contacted', count: 5, xp: 20 },
  { key: 'followups3', title: 'Complete 3 follow-ups', metric: 'follow_ups', count: 3, xp: 15 },
  { key: 'visit1', title: 'Complete a site visit', metric: 'meetings', count: 1, xp: 25 },
]
export const DEFAULT_GAMIFICATION: GamificationSettings = {
  enabled: true,
  xp: Object.fromEntries(Object.entries(XP_EVENTS).map(([k, v]) => [k, v.default])) as Record<XpEvent, number>,
  followUpDailyCap: 20,
  levels: DEFAULT_LEVELS,
  missions: DEFAULT_MISSIONS,
  // Friendly by default: everyone sees points, contacts, deals and target progress; money only for managers.
  leaderboard: { visibleTo: 'everyone', show: { xp: true, contacted: true, closed: true, revenue: false, target: true } },
}

type Errors = Record<string, string>
const int = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null)

export function normaliseGamification(input: unknown): { value: GamificationSettings; errors: Errors } {
  const o = (input && typeof input === 'object' && !Array.isArray(input) ? input : {}) as Record<string, unknown>
  const d = DEFAULT_GAMIFICATION
  const errors: Errors = {}
  const xpIn = (o.xp && typeof o.xp === 'object' ? o.xp : {}) as Record<string, unknown>
  const xp = { ...d.xp }
  for (const k of Object.keys(XP_EVENTS) as XpEvent[]) {
    if (xpIn[k] === undefined) continue
    const v = int(xpIn[k], 0, 1000)
    if (v === null) errors[`xp.${k}`] = 'Points are a whole number from 0 to 1000.'
    else xp[k] = v
  }
  const caps = (o.caps && typeof o.caps === 'object' ? o.caps : {}) as Record<string, unknown>
  const capIn = o.followUpDailyCap ?? caps.follow_up_done
  let followUpDailyCap = d.followUpDailyCap
  if (capIn !== undefined) {
    const v = int(capIn, 0, 500)
    if (v === null) errors.followUpDailyCap = 'A whole number from 0 to 500.'
    else followUpDailyCap = v
  }
  let levels = d.levels
  if (o.levels !== undefined) {
    const raw = Array.isArray(o.levels) ? o.levels : []
    const parsed = raw.map((l) => ({ name: typeof l?.name === 'string' ? l.name.trim().slice(0, 30) : '', xp: int(l?.xp, 0, 10_000_000) }))
    if (parsed.length < 2 || parsed.length > 12 || parsed.some((l) => !l.name || l.xp === null)) errors.levels = 'Between 2 and 12 levels, each with a name and the points it starts at.'
    else {
      const sorted = (parsed as Level[]).slice().sort((a, b) => a.xp - b.xp)
      if (sorted[0].xp !== 0) errors.levels = 'The first level starts at 0 points.'
      else if (new Set(sorted.map((l) => l.xp)).size !== sorted.length) errors.levels = 'Each level needs its own starting points.'
      else levels = sorted
    }
  }
  let missions = d.missions
  if (o.missions !== undefined) {
    const raw = Array.isArray(o.missions) ? o.missions : []
    const parsed: Mission[] = []
    for (const [i, m] of raw.entries()) {
      const title = typeof m?.title === 'string' ? m.title.trim().slice(0, 60) : ''
      const metric = typeof m?.metric === 'string' && m.metric in METRICS && m.metric !== 'revenue' ? (m.metric as Metric) : null
      const count = int(m?.count, 1, 200), points = int(m?.xp, 0, 1000)
      const key = typeof m?.key === 'string' && /^[a-z0-9_]{2,30}$/.test(m.key) ? m.key : `m${i + 1}_${(metric ?? 'x').slice(0, 6)}`
      if (!title || !metric || count === null || points === null) { errors[`missions.${i}`] = 'Each mission needs a title, an activity, a number from 1 to 200 and points from 0 to 1000.'; continue }
      parsed.push({ key, title, metric, count, xp: points })
    }
    if (parsed.length > 6) errors.missions = 'Up to 6 daily missions.'
    else if (!Object.keys(errors).some((k) => k.startsWith('missions'))) missions = parsed
  }
  const lb = (o.leaderboard && typeof o.leaderboard === 'object' ? o.leaderboard : {}) as Record<string, unknown>
  const show = (lb.show && typeof lb.show === 'object' ? lb.show : {}) as Record<string, unknown>
  const leaderboard = {
    visibleTo: (lb.visibleTo === 'managers' ? 'managers' : 'everyone') as Visibility,
    show: Object.fromEntries(Object.entries(d.leaderboard.show).map(([k, v]) => [k, typeof show[k] === 'boolean' ? show[k] : v])) as GamificationSettings['leaderboard']['show'],
  }
  return { value: { enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled, xp, followUpDailyCap, levels, missions, leaderboard }, errors }
}

export function gamificationFromStored(v: unknown): GamificationSettings {
  return normaliseGamification(v).value
}

/** What is stored: the database reads `caps.follow_up_done`. */
export function gamificationToStored(s: GamificationSettings): Record<string, unknown> {
  const { followUpDailyCap, ...rest } = s
  return { ...rest, caps: { follow_up_done: followUpDailyCap } }
}

/** The level a total of points has reached, the next one, and how far along the way there. */
export function levelFor(xp: number, levels: Level[] = DEFAULT_LEVELS): { index: number; level: Level; next: Level | null; progress: number; toNext: number } {
  const sorted = levels.slice().sort((a, b) => a.xp - b.xp)
  let index = 0
  for (let i = 0; i < sorted.length; i++) if (xp >= sorted[i].xp) index = i
  const level = sorted[index], next = sorted[index + 1] ?? null
  const progress = next ? Math.max(0, Math.min(1, (xp - level.xp) / (next.xp - level.xp))) : 1
  return { index, level, next, progress, toNext: next ? Math.max(0, next.xp - xp) : 0 }
}

/** Mirrors public.builtin_achievements() (20260094; weekly challenges and more monthly achievements in 20260099). */
export const BUILTIN_ACHIEVEMENTS = [
  { key: 'first_contact', title: 'First contact', description: 'Called or messaged your first lead.', metric: 'contacted', threshold: 1, window: 'all', xp: 10, icon: 'phone' },
  { key: 'contacts_10', title: '10 leads contacted', description: 'Reached ten different leads.', metric: 'contacted', threshold: 10, window: 'all', xp: 30, icon: 'phone' },
  { key: 'contacts_100', title: 'Century of calls', description: 'Reached a hundred different leads.', metric: 'contacted', threshold: 100, window: 'all', xp: 150, icon: 'phone' },
  { key: 'first_visit', title: 'First site visit', description: 'Completed your first site visit.', metric: 'meetings', threshold: 1, window: 'all', xp: 20, icon: 'map' },
  { key: 'visits_10', title: 'Showroom regular', description: 'Completed ten site visits.', metric: 'meetings', threshold: 10, window: 'all', xp: 80, icon: 'map' },
  { key: 'first_close', title: 'First booking', description: 'Closed your first deal.', metric: 'closed', threshold: 1, window: 'all', xp: 75, icon: 'trophy' },
  { key: 'closes_10', title: '10 bookings', description: 'Closed ten deals.', metric: 'closed', threshold: 10, window: 'all', xp: 300, icon: 'trophy' },
  { key: 'follow_up_master', title: 'Follow-up master', description: 'Completed fifty follow-ups.', metric: 'follow_ups', threshold: 50, window: 'all', xp: 100, icon: 'calendar' },
  { key: 'consistency', title: 'Consistency champion', description: 'Completed fifteen daily missions.', metric: 'missions', threshold: 15, window: 'all', xp: 150, icon: 'flame' },
  { key: 'target_hit', title: 'Target achieved', description: 'Reached one of your targets.', metric: 'targets', threshold: 1, window: 'all', xp: 50, icon: 'target' },
  { key: 'targets_10', title: 'Target machine', description: 'Reached ten targets.', metric: 'targets', threshold: 10, window: 'all', xp: 250, icon: 'target' },
  { key: 'month_closer', title: 'Closer of the month', description: 'Closed three deals in one month.', metric: 'closed', threshold: 3, window: 'month', xp: 120, icon: 'crown' },
  { key: 'revenue_1cr', title: 'Crore club', description: 'Closed bookings worth ₹1 crore or more.', metric: 'revenue', threshold: 10_000_000, window: 'all', xp: 500, icon: 'gem' },
  { key: 'week_contacts_25', title: 'Weekly challenge: 25 conversations', description: 'Contacted 25 leads in one week.', metric: 'contacted', threshold: 25, window: 'week', xp: 40, icon: 'phone' },
  { key: 'week_visits_3', title: 'Weekly challenge: 3 site visits', description: 'Completed three site visits in one week.', metric: 'meetings', threshold: 3, window: 'week', xp: 50, icon: 'map' },
  { key: 'week_close', title: 'Weekly challenge: a booking', description: 'Closed a deal in one week.', metric: 'closed', threshold: 1, window: 'week', xp: 60, icon: 'rocket' },
  { key: 'week_missions_5', title: 'Weekly challenge: 5 missions', description: 'Completed five daily missions in one week.', metric: 'missions', threshold: 5, window: 'week', xp: 40, icon: 'flame' },
  { key: 'month_contacts_100', title: 'Hundred in a month', description: 'Contacted a hundred leads in one month.', metric: 'contacted', threshold: 100, window: 'month', xp: 100, icon: 'star' },
  { key: 'month_targets_3', title: 'Target hat-trick', description: 'Reached three targets in one month.', metric: 'targets', threshold: 3, window: 'month', xp: 120, icon: 'target' },
] as const

export const BADGE_ICONS = ['trophy', 'phone', 'map', 'calendar', 'flame', 'target', 'crown', 'gem', 'star', 'rocket'] as const

/** A period's window in the workspace's time zone, as [from, to) instants, plus its label. */
export function periodWindow(period: Exclude<Period, 'custom'>, now: Date, tz = 'Asia/Kolkata'): { from: Date; to: Date } {
  const local = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const offset = now.getTime() - local.getTime()
  const start = new Date(local.getFullYear(), local.getMonth(), local.getDate())
  if (period === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
  if (period === 'month') start.setDate(1)
  const end = new Date(start)
  if (period === 'day') end.setDate(end.getDate() + 1)
  else if (period === 'week') end.setDate(end.getDate() + 7)
  else end.setMonth(end.getMonth() + 1)
  return { from: new Date(start.getTime() + offset), to: new Date(end.getTime() + offset) }
}

export function canManagePerformance(role: string | null | undefined): boolean {
  return role === 'owner' || role === 'admin'
}
