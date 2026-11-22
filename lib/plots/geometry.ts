// lib/plots/geometry.ts — plot boundaries in NORMALISED page coordinates: every point is [x, y] with 0 ≤ x, y ≤ 1
// relative to the version's rendered page image (so a boundary stays correct whatever size the map is shown at).
// Pure: used by the editor in the browser and re-run by the server before anything is saved.

export type Pt = [number, number]
export interface ShapeInput { id?: string; label: string; kind: 'polygon' | 'rect'; points: Pt[]; unitId: string | null }

export const SHAPE_LIMITS = { minPoints: 3, maxPoints: 200, maxShapes: 2000, labelMax: 40, minArea: 1e-7 } as const
const EPS = 1e-9

export const round6 = (n: number) => Math.round(n * 1e6) / 1e6
export const normaliseLabel = (s: string) => s.trim().replace(/\s+/g, ' ')
export const labelKey = (s: string) => normaliseLabel(s).toLowerCase()

/** Signed area (shoelace); positive = counter-clockwise in y-down screen space is negative — callers use the absolute value. */
export function signedArea(p: Pt[]): number {
  let a = 0
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1 }
  return a / 2
}
export const area = (p: Pt[]) => Math.abs(signedArea(p))

export function centroid(p: Pt[]): Pt {
  const a = signedArea(p)
  if (Math.abs(a) < EPS) return [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]
  let cx = 0, cy = 0
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length], f = x1 * y2 - x2 * y1
    cx += (x1 + x2) * f; cy += (y1 + y2) * f
  }
  return [cx / (6 * a), cy / (6 * a)]
}

export function bbox(p: Pt[]) {
  let minX = 1, minY = 1, maxX = 0, maxY = 0
  for (const [x, y] of p) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
  return { minX, minY, maxX, maxY }
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])

/** True only when the segments cross at a single interior point (touching, sharing an end or overlapping collinearly is not crossing). */
export function properlyIntersect(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  return ((d1 > EPS && d2 < -EPS) || (d1 < -EPS && d2 > EPS)) && ((d3 > EPS && d4 < -EPS) || (d3 < -EPS && d4 > EPS))
}

function onSegment(p: Pt, a: Pt, b: Pt): boolean {
  if (Math.abs(cross(a, b, p)) > 1e-12) return false
  return p[0] >= Math.min(a[0], b[0]) - EPS && p[0] <= Math.max(a[0], b[0]) + EPS && p[1] >= Math.min(a[1], b[1]) - EPS && p[1] <= Math.max(a[1], b[1]) + EPS
}

/** Strictly inside (points on the boundary are not inside). */
export function strictlyInside(pt: Pt, poly: Pt[]): boolean {
  for (let i = 0; i < poly.length; i++) if (onSegment(pt, poly[i], poly[(i + 1) % poly.length])) return false
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

export function selfIntersects(p: Pt[]): boolean {
  const n = p.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue // neighbouring edges share a vertex
      if (properlyIntersect(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true
    }
  }
  return false
}

/** Two plots overlap when their edges cross, or one has a point strictly inside the other (sharing a boundary is fine). */
export function overlaps(a: Pt[], b: Pt[]): boolean {
  const A = bbox(a), B = bbox(b)
  if (A.maxX <= B.minX + EPS || B.maxX <= A.minX + EPS || A.maxY <= B.minY + EPS || B.maxY <= A.minY + EPS) return false
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
    if (properlyIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true
  }
  if (a.some((p) => strictlyInside(p, b)) || b.some((p) => strictlyInside(p, a))) return true
  // Identical or nested shapes whose vertices all lie on the other's boundary: compare centroids.
  return strictlyInside(centroid(a), b) && strictlyInside(centroid(b), a)
}

/** A problem with one shape, or null. Points must already be normalised. */
export function shapeProblem(s: ShapeInput): string | null {
  const label = normaliseLabel(s.label)
  if (!label) return 'Every plot needs a number.'
  if (label.length > SHAPE_LIMITS.labelMax) return `Plot number “${label.slice(0, 12)}…” is too long.`
  if (!Array.isArray(s.points) || s.points.length < SHAPE_LIMITS.minPoints) return `Plot ${label} needs at least 3 corners.`
  if (s.points.length > SHAPE_LIMITS.maxPoints) return `Plot ${label} has more than ${SHAPE_LIMITS.maxPoints} corners.`
  for (const p of s.points) {
    if (!Array.isArray(p) || p.length !== 2 || !p.every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return `Plot ${label} has a corner outside the page.`
  }
  if (s.kind === 'rect' && s.points.length !== 4) return `Plot ${label} is marked as a rectangle but does not have 4 corners.`
  if (selfIntersects(s.points)) return `Plot ${label}’s outline crosses itself.`
  if (area(s.points) < SHAPE_LIMITS.minArea) return `Plot ${label} is too small (or its corners are on one line).`
  return null
}

export interface Validation {
  /** Blocking: the draft cannot be submitted (and shape errors cannot be saved). */
  errors: string[]
  /** Pairs of plot numbers whose boundaries overlap (blocking for review, saved as a draft). */
  overlaps: [string, string][]
  duplicateLabels: string[]
  duplicateUnits: string[]
  /** Plots drawn but not linked to a unit. */
  unlinked: string[]
  /** Units of the project with no plot on this version. */
  unmappedUnits: string[]
}

export function validateShapes(shapes: ShapeInput[], units: { id: string; unit_number: string }[]): Validation {
  const errors: string[] = []
  for (const s of shapes) { const e = shapeProblem(s); if (e) errors.push(e) }
  if (shapes.length > SHAPE_LIMITS.maxShapes) errors.push(`A map can have at most ${SHAPE_LIMITS.maxShapes} plots.`)
  const seen = new Map<string, number>()
  for (const s of shapes) seen.set(labelKey(s.label), (seen.get(labelKey(s.label)) ?? 0) + 1)
  const duplicateLabels = [...seen].filter(([k, n]) => k && n > 1).map(([k]) => shapes.find((s) => labelKey(s.label) === k)!.label.trim())
  const unitCount = new Map<string, number>()
  for (const s of shapes) if (s.unitId) unitCount.set(s.unitId, (unitCount.get(s.unitId) ?? 0) + 1)
  const unitNo = new Map(units.map((u) => [u.id, u.unit_number]))
  const duplicateUnits = [...unitCount].filter(([, n]) => n > 1).map(([id]) => unitNo.get(id) ?? id)
  const unknownUnits = shapes.filter((s) => s.unitId && !unitNo.has(s.unitId)).map((s) => normaliseLabel(s.label))
  if (unknownUnits.length) errors.push(`Plots ${unknownUnits.slice(0, 5).join(', ')} are linked to a unit that is not in this project.`)
  const ov: [string, string][] = []
  const valid = shapes.filter((s) => !shapeProblem(s))
  for (let i = 0; i < valid.length && ov.length < 200; i++) for (let j = i + 1; j < valid.length; j++) {
    if (overlaps(valid[i].points, valid[j].points)) ov.push([normaliseLabel(valid[i].label), normaliseLabel(valid[j].label)])
  }
  const linked = new Set(shapes.map((s) => s.unitId).filter(Boolean))
  return {
    errors, overlaps: ov, duplicateLabels, duplicateUnits,
    unlinked: shapes.filter((s) => !s.unitId).map((s) => normaliseLabel(s.label)),
    unmappedUnits: units.filter((u) => !linked.has(u.id)).map((u) => u.unit_number),
  }
}

/** Ready to submit for review: nothing blocking (unlinked plots and unmapped units are warnings). */
export const isSubmittable = (v: Validation) => !v.errors.length && !v.overlaps.length && !v.duplicateLabels.length && !v.duplicateUnits.length

/** Shapes as stored: points rounded to 6 decimals, labels tidied. */
export const cleanShape = (s: ShapeInput): ShapeInput => ({
  ...s, label: normaliseLabel(s.label), points: s.points.map(([x, y]) => [round6(x), round6(y)] as Pt),
})
