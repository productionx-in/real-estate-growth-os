// lib/matching/score.ts
// How well an available unit fits what a buyer wants — one definition, used for "Matching units" on a lead
// and "Interested buyers" on a unit. A score out of 100 plus plain reasons ("Within budget", "3BHK",
// "Whitefield") and gaps ("₹8 L over budget"). Units that clearly don't fit are not suggested at all:
// wrong configuration or property type, over budget by more than the workspace allows (10% unless changed in
// Settings → Matching rules), or not available.

export const CONFIGURATIONS = ['1RK', '1BHK', '2BHK', '2.5BHK', '3BHK', '3.5BHK', '4BHK', '5BHK+'] as const
export const FACINGS = ['East', 'West', 'North', 'South', 'North-East', 'North-West', 'South-East', 'South-West'] as const
export const CATEGORIES = {
  apartments: 'Apartments', plotted_developments: 'Plots', commercial_sale: 'Commercial',
  villas_gated_communities: 'Villas', mixed_use: 'Mixed use',
} as const
export const OVER_BUDGET_TOLERANCE = 0.1

export interface Requirements {
  budget_min: number | null
  budget_max: number | null
  project_id: string | null
  req_configurations: string[]
  req_categories: string[]
  req_locations: string[]
  req_facing: string[]
  req_min_area: number | null
  req_max_area: number | null
  /** Agencies only (resale and rental listings, 20260079). */
  req_purpose?: 'buy' | 'rent' | null
  req_rent_max?: number | null
  req_property_types?: string[]
  /** Commercial needs (20260095). */
  req_fit_out?: string[]
  req_min_seats?: number | null
}

export interface UnitForMatch {
  id: string
  project_id: string
  status: string
  category: string
  bhk_config: string | null
  facing: string | null
  total_price: number | null
  carpet_area: number | null
  super_built_up_area: number | null
  area_value: number | null
  project: { name: string; city: string | null; location: string | null } | null
}

export interface Match {
  score: number
  reasons: string[]
  gaps: string[]
}

/** "3 bhk", "3BHK " and "3 BHK" are the same configuration; 5 BHK and above is "5BHK+". */
export function normConfig(v: string | null | undefined): string | null {
  if (!v) return null
  const s = v.toUpperCase().replace(/\s+/g, '')
  const m = s.match(/^(\d+(?:\.5)?)BHK\+?$/)
  if (m) return Number(m[1]) >= 5 ? '5BHK+' : `${m[1]}BHK`
  return s === '1RK' ? '1RK' : s
}

/** "₹8.4 L", "₹1.2 Cr" — how Indian buyers and salespeople talk about prices. */
export function shortInr(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e7) return `₹${+(a / 1e7).toFixed(2)} Cr`
  if (a >= 1e5) return `₹${+(a / 1e5).toFixed(1)} L`
  return `₹${Math.round(a).toLocaleString('en-IN')}`
}

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()

/**
 * Has the buyer said anything to match on? Without it, suggestions would only be guesses. The project they
 * enquired about is not enough on its own (it says nothing about which unit fits); it adds a bonus once
 * there is something else to go on.
 */
export function hasRequirements(r: Requirements): boolean {
  return !!(r.budget_max || r.budget_min || r.req_configurations.length || r.req_categories.length || r.req_locations.length)
}

/** The match, or null when the unit should not be suggested. */
export function scoreUnit(r: Requirements, u: UnitForMatch, overBudget = OVER_BUDGET_TOLERANCE): Match | null {
  if (u.status !== 'available') return null
  const reasons: string[] = []
  const gaps: string[] = []
  let score = 0

  // Property type (hard): a buyer looking for plots is not offered flats.
  if (r.req_categories.length && !r.req_categories.includes(u.category)) return null

  // Configuration (hard when given): 25
  const wanted = r.req_configurations.map(normConfig).filter(Boolean) as string[]
  const config = normConfig(u.bhk_config)
  if (wanted.length) {
    if (!config || !wanted.includes(config)) return null
    score += 25
    reasons.push(config)
  } else {
    score += 10
  }

  // Budget: 35 (more than the allowed margin over is not suggested)
  const price = u.total_price
  const lo = r.budget_min && r.budget_min > 0 ? r.budget_min : null
  const hi = r.budget_max && r.budget_max > 0 ? r.budget_max : null
  if (price == null || !Number.isFinite(price)) {
    gaps.push('No price yet')
  } else if (hi != null && price > hi) {
    if (price > hi * (1 + overBudget)) return null
    score += 20
    gaps.push(`${shortInr(price - hi)} over budget`)
  } else if (lo != null && price < lo) {
    score += 25
    reasons.push('Below budget')
  } else if (hi != null || lo != null) {
    score += 35
    reasons.push('Within budget')
  } else {
    score += 15
  }

  // Location: 20
  const places = r.req_locations.map(norm).filter(Boolean)
  if (places.length) {
    const where = norm([u.project?.location, u.project?.city, u.project?.name].filter(Boolean).join(' '))
    const hit = places.find((p) => where.includes(p))
    if (hit) {
      score += 20
      reasons.push(r.req_locations[places.indexOf(hit)].trim())
    } else {
      gaps.push('Different area')
    }
  } else {
    score += 8
  }

  // Area: 10
  const area = u.carpet_area ?? u.super_built_up_area ?? u.area_value
  const minA = r.req_min_area && r.req_min_area > 0 ? r.req_min_area : null
  const maxA = r.req_max_area && r.req_max_area > 0 ? r.req_max_area : null
  if (area != null && (minA != null || maxA != null)) {
    const inRange = (minA == null || area >= minA) && (maxA == null || area <= maxA)
    const near = (minA == null || area >= minA * 0.9) && (maxA == null || area <= maxA * 1.1)
    if (inRange) { score += 10; reasons.push(`${Math.round(area).toLocaleString('en-IN')} sq ft`) }
    else if (near) { score += 5; gaps.push(minA != null && area < minA ? 'A little smaller' : 'A little larger') }
    else gaps.push(minA != null && area < minA ? 'Smaller than wanted' : 'Larger than wanted')
  } else {
    score += 4
  }

  // Facing: 5
  if (r.req_facing.length) {
    if (u.facing && r.req_facing.some((f) => f.toLowerCase() === u.facing!.toLowerCase())) { score += 5; reasons.push(`${u.facing} facing`) }
  } else {
    score += 2
  }

  // The project they asked about: 5
  if (r.project_id && r.project_id === u.project_id) {
    score += 5
    reasons.push('Project they asked about')
  }

  return { score: Math.min(100, score), reasons, gaps }
}

/** Best matches first; ties go to the cheaper unit (better for the buyer). */
export function rank<T extends { match: Match; price: number | null }>(items: T[], limit: number): T[] {
  return items
    .sort((a, b) => b.match.score - a.match.score || (a.price ?? Infinity) - (b.price ?? Infinity))
    .slice(0, limit)
}
