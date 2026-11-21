// lib/plots/match.ts — which shape in a layout is which unit. A shape's plot name and a unit's number match when
// they are the same after normalising ("N-46", "n 46", "N46_1_" → "N46"). Pure; used by the upload preview and tests.
import { normaliseKey } from '@/lib/plots/svg'

export interface UnitRef { id: string; unit_number: string }
export interface MatchReport {
  links: { shapeKey: string; unitId: string; unitNumber: string }[]
  /** Plot names in the drawing with no unit of that number in the project. */
  unmatchedShapes: string[]
  /** Units in the project with no shape in the drawing. */
  unitsWithoutShape: string[]
  /** Unit numbers that normalise to the same key (e.g. "N-46" and "N46"): ambiguous, not linked. */
  ambiguous: string[]
}

export function matchShapes(keys: string[], units: UnitRef[]): MatchReport {
  const byKey = new Map<string, UnitRef[]>()
  for (const u of units) {
    const k = normaliseKey(u.unit_number)
    byKey.set(k, [...(byKey.get(k) ?? []), u])
  }
  const links: MatchReport['links'] = []
  const unmatchedShapes: string[] = []
  const ambiguous = new Set<string>()
  const used = new Set<string>()
  for (const key of keys) {
    const found = byKey.get(normaliseKey(key)) ?? []
    if (found.length === 1) { links.push({ shapeKey: key, unitId: found[0].id, unitNumber: found[0].unit_number }); used.add(found[0].id) }
    else if (found.length > 1) found.forEach((u) => ambiguous.add(u.unit_number))
    else unmatchedShapes.push(key)
  }
  const unitsWithoutShape = units.filter((u) => !used.has(u.id) && !ambiguous.has(u.unit_number)).map((u) => u.unit_number)
  return { links, unmatchedShapes, unitsWithoutShape, ambiguous: [...ambiguous] }
}
