// lib/leads/view-filters.ts
// Lead list and board filters: read from the URL or a saved view, written back to the URL, and applied to
// a leads query. Safe to import from client components (no server dependencies).
//
// Visibility is never a filter: applyLeadFilters always applies the viewer's lead scope (own, team,
// booked or all), whatever a URL or a shared view asks for.
import { leadScopeOf, type LeadViewer } from '@/lib/auth/permissions'
import { normalizeTag } from './tags'
import type { LeadPriority, LeadSource, LeadStatus, MemberRole } from '@/types/database'
import { STATUS_ORDER } from './transitions'

// ── Dashboard "focus" lists (also used by the home page) ────────────────────────────────────────────
//   waiting      — open leads nobody has called or messaged yet
//   unassigned   — open leads nobody owns
//   overdue      — open leads whose next follow-up time has passed
//   no_next_step — leads past "new" with nothing scheduled
//   visited      — visited the site, not booked yet
export const CLOSED_STATUSES: LeadStatus[] = ['booked', 'lost', 'junk']
export const IN_PROGRESS: LeadStatus[] = ['contacted', 'qualified', 'site_visit_scheduled', 'site_visited', 'negotiation']

export const FOCI = {
  waiting: 'Waiting for a first call',
  unassigned: 'Nobody assigned',
  overdue: 'Follow-up overdue',
  no_next_step: 'No next step',
  visited: 'Visited, not booked',
} as const
export type Focus = keyof typeof FOCI
export const isFocus = (v: unknown): v is Focus => typeof v === 'string' && Object.prototype.hasOwnProperty.call(FOCI, v)

/** Narrows a leads query to one focus. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase builder generics differ per select()
export function applyFocus<Q extends { is: any; not: any; lt: any; lte: any; in: any; eq: any }>(
  q: Q, focus: Focus, now: Date
): Q {
  const open = `(${CLOSED_STATUSES.join(',')})`
  switch (focus) {
    case 'waiting':
      return q.is('first_action_at', null).not('status', 'in', open)
    case 'unassigned':
      return q.is('assigned_to', null).not('status', 'in', open)
    case 'overdue':
      return q.lt('next_follow_up_at', now.toISOString()).not('status', 'in', open)
    case 'no_next_step':
      return q.in('status', IN_PROGRESS).is('next_follow_up_at', null)
    case 'visited':
      return q.eq('status', 'site_visited')
  }
}

// ── Filters ──────────────────────────────────────────────────────────────────────────────────────────
export const SOURCE_LABELS: Record<LeadSource, string> = {
  website: 'Website',
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  '99acres': '99acres',
  housing: 'Housing.com',
  magicbricks: 'Magicbricks',
  whatsapp: 'WhatsApp',
  referral: 'Referral',
  walk_in: 'Walk-in',
  csv_import: 'CSV import',
  other: 'Other',
}
export const SOURCES = Object.keys(SOURCE_LABELS) as LeadSource[]
export const PRIORITIES: LeadPriority[] = ['high', 'medium', 'low']
export const CREATED = { '7d': 'Last 7 days', '30d': 'Last 30 days', '90d': 'Last 90 days' } as const
export type Created = keyof typeof CREATED
export type Layout = 'list' | 'board'

export interface LeadFilters {
  status?: LeadStatus[]
  source?: LeadSource[]
  priority?: LeadPriority[]
  project?: string
  /** 'me', 'none' (unassigned) or a member's profile id. Ignored for sales executives. */
  assignee?: string
  focus?: Focus
  created?: Created
  /** One tag (lib/leads/tags.ts). */
  tag?: string
  q?: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function pickList<T extends string>(raw: unknown, allowed: readonly T[]): T[] | undefined {
  const items = Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(',') : []
  const keep = allowed.filter((a) => items.some((i) => typeof i === 'string' && i.trim() === a))
  return keep.length ? keep : undefined
}

/** Search text: letters (with their accents and vowel signs), digits, spaces and the characters found in phone numbers and emails only. */
export function cleanSearch(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const q = raw.replace(/[^\p{L}\p{M}\p{N}\s@.+_-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80)
  return q.length >= 2 ? q : undefined
}

/**
 * Accepts anything (URL values, a stored JSON object) and keeps only valid filters, in a canonical order.
 * Unknown keys and bad values are dropped rather than rejected, so an old link or view still opens.
 */
export function normalizeFilters(raw: unknown): LeadFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const f: LeadFilters = {}
  const status = pickList(r.status, STATUS_ORDER)
  if (status) f.status = status
  const source = pickList(r.source, SOURCES)
  if (source) f.source = source
  const priority = pickList(r.priority, PRIORITIES)
  if (priority) f.priority = priority
  if (typeof r.project === 'string' && UUID.test(r.project)) f.project = r.project.toLowerCase()
  if (typeof r.assignee === 'string' && (r.assignee === 'me' || r.assignee === 'none' || UUID.test(r.assignee))) {
    f.assignee = r.assignee.toLowerCase()
  }
  if (isFocus(r.focus)) f.focus = r.focus
  if (typeof r.created === 'string' && r.created in CREATED) f.created = r.created as Created
  const tag = normalizeTag(r.tag)
  if (tag) f.tag = tag
  const q = cleanSearch(r.q)
  if (q) f.q = q
  return f
}

export function isEmpty(f: LeadFilters): boolean {
  return Object.keys(f).length === 0
}

export function sameFilters(a: LeadFilters, b: LeadFilters): boolean {
  return JSON.stringify(normalizeFilters(a)) === JSON.stringify(normalizeFilters(b))
}

type SearchParams = Record<string, string | string[] | undefined>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** Reads the leads page URL. Old links (?scope=my, ?scope=unassigned) keep working. */
export function parseLeadSearch(sp: SearchParams): { filters: LeadFilters; layout: Layout; viewId: string | null } {
  const raw: Record<string, unknown> = {}
  for (const key of ['status', 'source', 'priority', 'project', 'assignee', 'focus', 'created', 'tag', 'q']) {
    const v = first(sp[key])
    if (v !== undefined) raw[key] = v
  }
  const scope = first(sp.scope)
  if (!raw.assignee && scope === 'my') raw.assignee = 'me'
  if (!raw.assignee && scope === 'unassigned') raw.assignee = 'none'
  const view = first(sp.view)
  return {
    filters: normalizeFilters(raw),
    layout: first(sp.layout) === 'board' ? 'board' : 'list',
    viewId: view && UUID.test(view) ? view.toLowerCase() : null,
  }
}

/** The query string for a set of filters (canonical, so equal filters give equal URLs). */
export function toLeadSearch(filters: LeadFilters, opts: { layout?: Layout; viewId?: string | null } = {}): string {
  const f = normalizeFilters(filters)
  const p = new URLSearchParams()
  if (opts.viewId) p.set('view', opts.viewId)
  if (opts.layout === 'board') p.set('layout', 'board')
  for (const [k, v] of Object.entries(f)) p.set(k, Array.isArray(v) ? v.join(',') : String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Who is looking (see LeadViewer in lib/auth/permissions.ts). A team lead's teammates come from resolveLeadViewer. */
export type Viewer = LeadViewer

const CREATED_DAYS: Record<Created, number> = { '7d': 7, '30d': 30, '90d': 90 }

/**
 * Applies filters to a leads query that is already scoped to one organisation.
 * Visibility comes first and cannot be widened by a filter (lib/auth/permissions.ts leadScopeOf):
 * a sales executive sees only their own leads, a team lead their team's, post-sales booked customers.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase builder generics differ per select()
export function applyLeadFilters<Q extends { is: any; not: any; lt: any; lte: any; gte: any; in: any; eq: any; or: any; contains: any }>(
  q: Q, filters: LeadFilters, viewer: Viewer, now: Date
): Q {
  const f = normalizeFilters(filters)
  const scope = leadScopeOf(viewer.role)
  if (scope === 'own') {
    q = q.eq('assigned_to', viewer.profileId)
  } else if (scope === 'team') {
    const team = [...new Set([viewer.profileId, ...(viewer.teamProfileIds ?? [])])]
    // Within the team, the assignee filter can narrow to one person; anything outside the team is ignored.
    const one = f.assignee === 'me' ? viewer.profileId : f.assignee && team.includes(f.assignee) ? f.assignee : null
    q = one ? q.eq('assigned_to', one) : q.in('assigned_to', team)
  } else if (scope === 'booked') {
    q = q.eq('status', 'booked')
    if (f.assignee === 'me') q = q.eq('assigned_to', viewer.profileId)
    else if (f.assignee === 'none') q = q.is('assigned_to', null)
    else if (f.assignee) q = q.eq('assigned_to', f.assignee)
  } else if (f.assignee === 'me') {
    q = q.eq('assigned_to', viewer.profileId)
  } else if (f.assignee === 'none') {
    q = q.is('assigned_to', null)
  } else if (f.assignee) {
    q = q.eq('assigned_to', f.assignee)
  }
  if (f.status) q = q.in('status', f.status)
  if (f.source) q = q.in('source', f.source)
  if (f.priority) q = q.in('priority', f.priority)
  if (f.project) q = q.eq('project_id', f.project)
  if (f.created) q = q.gte('created_at', new Date(now.getTime() - CREATED_DAYS[f.created] * 86_400_000).toISOString())
  if (f.focus) q = applyFocus(q, f.focus, now)
  if (f.tag) q = q.contains('tags', [f.tag])
  if (f.q) {
    // cleanSearch removed every character PostgREST treats as syntax (commas, brackets, quotes, backslash,
    // *, %), so the quoted value cannot break out of the filter.
    const like = `"%${f.q}%"`
    q = q.or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`)
  }
  return q
}

// ── Saved views: who may change what ───────────────────────────────────────────────────────────────
export const MANAGER_ROLES: MemberRole[] = ['owner', 'admin', 'manager']
export const MAX_VIEWS_PER_PERSON = 30

export interface ViewRef {
  owner_id: string
  shared: boolean
}

/** Can this member see the view at all? (Same rule as the database policy.) */
export function canSeeView(view: ViewRef, viewer: Viewer): boolean {
  return view.owner_id === viewer.profileId || view.shared
}

/**
 * Can this member rename, re-filter, share/unshare or delete the view?
 * Your own view: yes (sharing still needs a manager). A shared view of someone else: managers only.
 */
export function canEditView(view: ViewRef, viewer: Viewer): boolean {
  if (view.owner_id === viewer.profileId) return true
  return view.shared && MANAGER_ROLES.includes(viewer.role)
}

export function canShareViews(role: MemberRole): boolean {
  return MANAGER_ROLES.includes(role)
}
