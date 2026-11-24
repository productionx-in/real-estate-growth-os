// lib/segments/segments.ts
// Lead segments (20260087): starter templates, who may manage them, and the rules for names and filters.
// Plain values only, safe to import from both server and client files.
//
// A dynamic segment is a set of lead filters (lib/leads/view-filters.ts) evaluated when it is opened. A fixed list is
// a hand-picked set of leads. Either way the reader's lead scope always applies (applyLeadFilters), so a shared
// segment never shows a sales executive anyone else's leads.
import { CREATED, FOCI, MANAGER_ROLES, SOURCE_LABELS, isEmpty, normalizeFilters, type LeadFilters } from '@/lib/leads/view-filters'
import { STATUS_LABELS } from '@/lib/leads/transitions'
import type { MemberRole } from '@/types/database'

export type SegmentKind = 'dynamic' | 'fixed'

export const MAX_SEGMENTS_PER_ORG = 100
export const MAX_LIST_SIZE = 5000
export const MAX_ADD_AT_ONCE = 500

export interface SegmentTemplate {
  key: string
  name: string
  description: string
  filters: LeadFilters
}

/**
 * Starter segments. Each uses only filters the leads page already understands, so opening one shows exactly the
 * leads the filters describe — nothing is estimated.
 */
export const SEGMENT_TEMPLATES: SegmentTemplate[] = [
  { key: 'visited_not_booked', name: 'Visited, not booked', description: 'Saw the site but have not booked yet. Worth a personal follow-up or an offer.', filters: { focus: 'visited' } },
  { key: 'hot_open', name: 'Hot and open', description: 'High-priority leads still in the pipeline.', filters: { priority: ['high'], status: ['new', 'contacted', 'qualified', 'site_visit_scheduled', 'site_visited', 'negotiation'] } },
  { key: 'overdue_follow_up', name: 'Follow-up overdue', description: 'Open leads whose next follow-up time has passed.', filters: { focus: 'overdue' } },
  { key: 'never_contacted', name: 'Never contacted', description: 'Open leads nobody has called or messaged yet.', filters: { focus: 'waiting' } },
  { key: 'new_this_week', name: 'New this week', description: 'Every lead that arrived in the last 7 days.', filters: { created: '7d' } },
  { key: 'lost_reengage', name: 'Lost — re-engage', description: 'Leads marked lost. Useful for a new launch or a price change.', filters: { status: ['lost'] } },
  { key: 'portal_leads', name: 'Property portal leads', description: 'Leads from 99acres, Housing.com and Magicbricks.', filters: { source: ['99acres', 'housing', 'magicbricks'] } },
  { key: 'booked_customers', name: 'Booked customers', description: 'Customers who booked. For referrals, updates and handover news.', filters: { status: ['booked'] } },
]

export const templateByKey = (key: unknown): SegmentTemplate | undefined =>
  typeof key === 'string' ? SEGMENT_TEMPLATES.find((t) => t.key === key) : undefined

/** Owners, admins and managers create, change and delete segments; everyone else can open them. */
export function canManageSegments(role: MemberRole | null | undefined): boolean {
  return !!role && MANAGER_ROLES.includes(role)
}

export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.replace(/\s+/g, ' ').trim()
  return name.length >= 1 && name.length <= 60 ? name : null
}

export function cleanDescription(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const d = raw.replace(/\s+/g, ' ').trim()
  return d ? d.slice(0, 200) : null
}

/**
 * The filters a dynamic segment stores. The person filter ("me", "unassigned", one person) is dropped: a segment is
 * for the whole team and "me" would mean something different to each reader. Null when nothing is left — a dynamic
 * segment needs at least one filter (otherwise it is just "all leads").
 */
export function segmentFilters(raw: unknown): LeadFilters | null {
  const f = normalizeFilters(raw)
  delete f.assignee
  return isEmpty(f) ? null : f
}

/** Plain-language criteria for a dynamic segment, e.g. ["Stage: New or Contacted", "Source: Website"]. */
export function describeFilters(raw: unknown, projectNames: Record<string, string> = {}): string[] {
  const f = normalizeFilters(raw)
  const or = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}` : xs[0])
  const out: string[] = []
  if (f.focus) out.push(FOCI[f.focus])
  if (f.status) out.push(`Stage: ${or(f.status.map((s) => STATUS_LABELS[s]))}`)
  if (f.source) out.push(`Source: ${or(f.source.map((s) => SOURCE_LABELS[s]))}`)
  if (f.priority) out.push(`Priority: ${or(f.priority.map((p) => p[0].toUpperCase() + p.slice(1)))}`)
  if (f.project) out.push(`Project: ${projectNames[f.project] ?? 'a project that no longer exists'}`)
  if (f.created) out.push(`Created: ${CREATED[f.created].toLowerCase()}`)
  if (f.tag) out.push(`Tag: ${f.tag}`)
  if (f.q) out.push(`Name, phone or e-mail contains “${f.q}”`)
  return out
}
