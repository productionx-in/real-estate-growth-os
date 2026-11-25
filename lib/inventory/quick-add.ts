// lib/inventory/quick-add.ts — "Add many units": numbers and rows for a batch of units with the same details.
// The rows go through the same checks as a spreadsheet import (lib/import/validator.ts) and the same server route,
// so a generated unit is held to exactly the rules of an imported one. Plain rules; safe in the browser.
import type { ProjectCategory } from '@/types/database'

export const MAX_QUICK_ADD = 1000

export type NumberingSpec =
  | { mode: 'range'; prefix: string; start: number; end: number; pad: boolean }
  /** Apartments and offices: one tower, floors from…to, units per floor → "A-101", "A-102" … "A-1204". */
  | { mode: 'floors'; tower: string; floorFrom: number; floorTo: number; perFloor: number; separator: string }

export interface GeneratedUnit { unit_number: string; tower_name?: string; floor_number?: number }

const int = (n: unknown) => (typeof n === 'number' && Number.isInteger(n) ? n : NaN)

/** The units a spec describes, or a plain reason it cannot be used. */
export function generateUnits(spec: NumberingSpec): { units: GeneratedUnit[]; error: string | null } {
  if (spec.mode === 'range') {
    const start = int(spec.start), end = int(spec.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) return { units: [], error: 'Enter a “from” number and a “to” number that is the same or larger.' }
    const count = end - start + 1
    if (count > MAX_QUICK_ADD) return { units: [], error: `Up to ${MAX_QUICK_ADD} units at a time.` }
    const prefix = spec.prefix.replace(/\s+/g, ' ').trimStart()
    const width = spec.pad ? String(end).length : 0
    const units = Array.from({ length: count }, (_, i) => ({ unit_number: `${prefix}${String(start + i).padStart(width, '0')}`.trim() }))
    return { units, error: null }
  }
  const from = int(spec.floorFrom), to = int(spec.floorTo), per = int(spec.perFloor)
  const tower = spec.tower.trim()
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to < from || to > 200) return { units: [], error: 'Floors: from 0 (ground) up to 200, “to” the same or higher.' }
  if (!Number.isFinite(per) || per < 1 || per > 99) return { units: [], error: 'Units per floor: 1 to 99.' }
  const count = (to - from + 1) * per
  if (count > MAX_QUICK_ADD) return { units: [], error: `That is ${count} units; up to ${MAX_QUICK_ADD} at a time. Add one tower or fewer floors at once.` }
  const sep = tower ? spec.separator : ''
  const units: GeneratedUnit[] = []
  for (let f = from; f <= to; f++) {
    for (let u = 1; u <= per; u++) {
      units.push({ unit_number: `${tower}${sep}${f === 0 ? 'G' : f}${String(u).padStart(2, '0')}`, ...(tower ? { tower_name: tower } : {}), floor_number: f })
    }
  }
  return { units, error: null }
}

/** Shared details, keyed by the import columns (lib/import/templates.ts). Empty values are left out. */
export type SharedDetails = Partial<Record<'area_value' | 'area_unit' | 'facing' | 'bhk_config' | 'plot_dimensions' | 'phase' | 'base_rate' | 'total_price' | 'commercial_asset_type' | 'category' | 'road_width_ft', string>>

/** Rows in the import format: the generated numbers with the shared details on each. */
export function buildRows(units: GeneratedUnit[], shared: SharedDetails): Record<string, unknown>[] {
  const common = Object.fromEntries(Object.entries(shared).filter(([, v]) => typeof v === 'string' && v.trim() !== '').map(([k, v]) => [k, (v as string).trim()]))
  return units.map((u) => ({ ...common, ...u }))
}

/** How the numbering usually works for each kind of project (the form starts here). */
export function defaultSpec(category: ProjectCategory): NumberingSpec {
  switch (category) {
    case 'apartments': return { mode: 'floors', tower: 'A', floorFrom: 1, floorTo: 10, perFloor: 4, separator: '-' }
    case 'plotted_developments': return { mode: 'range', prefix: 'Plot ', start: 1, end: 50, pad: false }
    case 'villas_gated_communities': return { mode: 'range', prefix: 'Villa ', start: 1, end: 20, pad: false }
    case 'commercial_sale': return { mode: 'range', prefix: 'Shop ', start: 1, end: 20, pad: false }
    default: return { mode: 'range', prefix: 'Unit ', start: 1, end: 20, pad: false }
  }
}

/** "Plot 1, Plot 2, Plot 3 … Plot 50" — a short preview of what will be created. */
export function previewNumbers(units: GeneratedUnit[], head = 3): string {
  if (units.length <= head + 1) return units.map((u) => u.unit_number).join(', ')
  return `${units.slice(0, head).map((u) => u.unit_number).join(', ')} … ${units[units.length - 1].unit_number}`
}
