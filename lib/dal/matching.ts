// lib/dal/matching.ts
// Property matching, both ways: available units for a lead, and buyers for a unit. Callers authorise first;
// every query is scoped by organisation, and a sales executive only ever gets their own leads back.
import { createServiceClient } from '@/lib/supabase/server'
import { CLOSED_STATUSES } from '@/lib/leads/view-filters'
import {
  OVER_BUDGET_TOLERANCE, hasRequirements, rank, scoreUnit,
  type Match, type Requirements, type UnitForMatch,
} from '@/lib/matching/score'
import type { DalResult } from '@/lib/dal/routing'
import type { MemberRole, ProjectCategory } from '@/types/database'

const REQ_COLUMNS = 'budget_min, budget_max, project_id, req_configurations, req_categories, req_locations, req_facing, req_min_area, req_max_area'
const UNIT_COLUMNS = 'id, project_id, unit_number, tower_name, floor_number, status, category, bhk_config, facing, total_price, carpet_area, super_built_up_area, area_value, project:projects(name, city, location)'

type UnitRow = UnitForMatch & { unit_number: string; tower_name: string | null; floor_number: number | null }

export interface UnitMatch {
  unitId: string
  label: string
  projectName: string
  price: number | null
  match: Match
}

function unitLabel(u: UnitRow): string {
  return [u.tower_name, u.unit_number, u.floor_number != null ? `floor ${u.floor_number}` : null].filter(Boolean).join(' · ')
}

/** The best available units for a lead (empty if the buyer has told us nothing to match on). */
export async function matchUnitsForLead(orgId: string, leadId: string, limit = 8): Promise<{ requirements: Requirements | null; matches: UnitMatch[] }> {
  const db = createServiceClient()
  const { data: lead } = await db.from('leads').select(REQ_COLUMNS).eq('org_id', orgId).eq('id', leadId).maybeSingle()
  if (!lead) return { requirements: null, matches: [] }
  const req = lead as unknown as Requirements
  if (!hasRequirements(req)) return { requirements: req, matches: [] }

  // Narrow in the database (available, this organisation, not far over budget); score the rest here.
  let q = db.from('inventory_items').select(UNIT_COLUMNS).eq('org_id', orgId).eq('status', 'available')
  if (req.budget_max) q = q.or(`total_price.is.null,total_price.lte.${Math.ceil(req.budget_max * (1 + OVER_BUDGET_TOLERANCE))}`)
  if (req.req_categories.length) q = q.in('category', req.req_categories as ProjectCategory[])
  const { data } = await q.limit(1000)
  const scored = ((data ?? []) as unknown as UnitRow[]).flatMap((u) => {
    const match = scoreUnit(req, u)
    return match ? [{ unitId: u.id, label: unitLabel(u), projectName: u.project?.name ?? '', price: u.total_price, match }] : []
  })
  return { requirements: req, matches: rank(scored, limit) }
}

export interface BuyerMatch {
  leadId: string
  name: string
  status: string
  assigneeName: string | null
  match: Match
}

/** Open leads this unit suits. A sales executive sees only leads assigned to them. */
export async function matchLeadsForUnit(
  orgId: string, unitId: string, viewer: { role: MemberRole; profileId: string }, limit = 10
): Promise<BuyerMatch[] | null> {
  const db = createServiceClient()
  const { data: unitData } = await db.from('inventory_items').select(UNIT_COLUMNS).eq('org_id', orgId).eq('id', unitId).maybeSingle()
  if (!unitData) return null
  const unit = unitData as unknown as UnitRow
  if (unit.status !== 'available') return []

  let q = db.from('leads')
    .select(`id, name, status, ${REQ_COLUMNS}, assignee:profiles!leads_assigned_to_fkey(full_name)`)
    .eq('org_id', orgId)
    .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`)
  if (viewer.role === 'sales_exec') q = q.eq('assigned_to', viewer.profileId)
  if (unit.total_price != null) {
    // A buyer whose budget is more than 10% below the price is not a match.
    q = q.or(`budget_max.is.null,budget_max.gte.${Math.floor(unit.total_price / (1 + OVER_BUDGET_TOLERANCE))}`)
  }
  const { data } = await q.order('created_at', { ascending: false }).limit(2000)
  const scored = ((data ?? []) as unknown as (Requirements & { id: string; name: string; status: string; assignee: { full_name: string } | null })[])
    .filter((l) => hasRequirements(l))
    .flatMap((l) => {
      const match = scoreUnit(l, unit)
      return match ? [{ leadId: l.id, name: l.name, status: l.status, assigneeName: l.assignee?.full_name ?? null, match, price: null }] : []
    })
  return rank(scored, limit).map((b) => ({ leadId: b.leadId, name: b.name, status: b.status, assigneeName: b.assigneeName, match: b.match }))
}

export interface RequirementsInput {
  budget_min: number | null
  budget_max: number | null
  req_configurations: string[]
  req_categories: string[]
  req_locations: string[]
  req_facing: string[]
  req_min_area: number | null
  req_max_area: number | null
}

export async function saveRequirements(orgId: string, leadId: string, input: RequirementsInput): Promise<DalResult<null>> {
  if (input.budget_min != null && input.budget_max != null && input.budget_min > input.budget_max) {
    return { success: false, error: 'The lowest budget is higher than the highest.', status: 400 }
  }
  if (input.req_min_area != null && input.req_max_area != null && input.req_min_area > input.req_max_area) {
    return { success: false, error: 'The smallest area is larger than the largest.', status: 400 }
  }
  const { data, error } = await createServiceClient().from('leads')
    .update({ ...input, requirements_updated_at: new Date().toISOString() })
    .eq('org_id', orgId).eq('id', leadId).select('id').maybeSingle()
  if (error) return { success: false, error: 'Could not save the requirements.', status: 500 }
  if (!data) return { success: false, error: 'Lead not found.', status: 404 }
  return { success: true, data: null }
}
