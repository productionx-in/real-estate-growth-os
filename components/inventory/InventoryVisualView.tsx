'use client'
// components/inventory/InventoryVisualView.tsx
import { useState, useMemo } from 'react'
import {
  Building2,
  Grid,
  Layers,
  Compass,
  Home,
  Store,
  Map as MapIcon,
  Info,
} from 'lucide-react'
import {
  INVENTORY_STATUS_LABELS,
  INVENTORY_STATUS_COLORS,
  PROJECT_CATEGORY_LABELS,
  type InventoryItemWithRelations,
  type InventoryStatus,
  type ProjectCategory,
} from '@/types/inventory'
import { InventoryDetailDrawer } from './InventoryDetailDrawer'
import { formatCurrency } from '@/lib/utils/format'

interface InventoryVisualViewProps {
  items: (InventoryItemWithRelations & { hierarchy_path?: string })[]
  category: ProjectCategory
  onItemUpdated?: () => void
}

const STATUS_KEYS: InventoryStatus[] = ['available', 'on_hold', 'booked', 'sold', 'blocked']

export function InventoryVisualView({
  items,
  category: projectCategory,
  onItemUpdated,
}: InventoryVisualViewProps) {
  // Mixed-use sub-category selection
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('all')

  // Selected item index for sequential drawer navigation
  const [selectedUnitIndex, setSelectedUnitIndex] = useState<number | null>(null)

  // 1. In mixed-use projects, determine available sub-categories
  const availableSubCategories = useMemo(() => {
    if (projectCategory !== 'mixed_use') return []
    const set = new Set<ProjectCategory>()
    items.forEach((item) => {
      if (item.category) set.add(item.category)
    })
    return Array.from(set)
  }, [items, projectCategory])

  // Filter items by sub-category in mixed-use if not 'all'
  const categoryFilteredItems = useMemo(() => {
    if (projectCategory !== 'mixed_use' || selectedSubCategory === 'all') {
      return items
    }
    return items.filter((i) => i.category === selectedSubCategory)
  }, [items, projectCategory, selectedSubCategory])

  // Active view layout mode derived from projectCategory or selectedSubCategory
  const activeLayoutCategory: ProjectCategory = useMemo(() => {
    if (projectCategory === 'mixed_use') {
      if (selectedSubCategory !== 'all') {
        return selectedSubCategory as ProjectCategory
      }
      // If 'all' in mixed use, determine majority or default to apartments
      const firstCat = items[0]?.category
      return firstCat || 'apartments'
    }
    return projectCategory
  }, [projectCategory, selectedSubCategory, items])

  // 2. Grouping: Towers for Apartments, Blocks/Sectors for Plots, Buildings for Commercial, Clusters for Villas
  const groupKeyLabel = useMemo(() => {
    switch (activeLayoutCategory) {
      case 'apartments':
        return 'Tower'
      case 'plotted_developments':
        return 'Block / Sector'
      case 'commercial_sale':
        return 'Building'
      case 'villas_gated_communities':
        return 'Cluster / Street'
      default:
        return 'Wing'
    }
  }, [activeLayoutCategory])

  // Extract distinct grouping entities from current items
  const groups = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string
        total: number
        available: number
        booked: number
        sold: number
        on_hold: number
        blocked: number
      }
    >()

    categoryFilteredItems.forEach((item) => {
      const name = item.tower_name || item.hierarchy_node?.name || 'General'
      const existing = map.get(name) || {
        name,
        total: 0,
        available: 0,
        booked: 0,
        sold: 0,
        on_hold: 0,
        blocked: 0,
      }
      existing.total++
      if (item.status === 'available') existing.available++
      else if (item.status === 'booked') existing.booked++
      else if (item.status === 'sold') existing.sold++
      else if (item.status === 'on_hold') existing.on_hold++
      else if (item.status === 'blocked') existing.blocked++

      map.set(name, existing)
    })

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  }, [categoryFilteredItems])

  // Active group selection
  const [selectedGroupName, setSelectedGroupName] = useState<string>('')

  // Sync active group when groups change
  const activeGroup = useMemo(() => {
    if (groups.length === 0) return 'General'
    if (selectedGroupName && groups.some((g) => g.name === selectedGroupName)) {
      return selectedGroupName
    }
    return groups[0].name
  }, [groups, selectedGroupName])

  // Filter items in active group
  const activeGroupItems = useMemo(() => {
    return categoryFilteredItems.filter((item) => {
      const name = item.tower_name || item.hierarchy_node?.name || 'General'
      return name === activeGroup
    })
  }, [categoryFilteredItems, activeGroup])

  // For vertical projects (Apartments and Commercial): group by floor in descending order
  const floorMap = useMemo(() => {
    const isVertical = ['apartments', 'commercial_sale'].includes(activeLayoutCategory)
    if (!isVertical) return null

    const map = new Map<number, InventoryItemWithRelations[]>()
    activeGroupItems.forEach((item) => {
      const fl = item.floor_number ?? 0
      const list = map.get(fl) || []
      list.push(item)
      map.set(fl, list)
    })

    // Sort floors descending (top floor down to ground floor)
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0])
  }, [activeGroupItems, activeLayoutCategory])

  // Units list for current view (for drawer sequential navigation)
  const currentDisplayUnits = useMemo(() => {
    if (floorMap) {
      // Flatten floors top to bottom, units left to right
      const list: (InventoryItemWithRelations & { hierarchy_path?: string })[] = []
      for (const [, units] of floorMap) {
        list.push(...units)
      }
      return list
    }
    return activeGroupItems
  }, [floorMap, activeGroupItems])

  const selectedItem =
    selectedUnitIndex !== null && currentDisplayUnits[selectedUnitIndex]
      ? currentDisplayUnits[selectedUnitIndex]
      : null

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (selectedUnitIndex === null) return
    if (direction === 'prev' && selectedUnitIndex > 0) {
      setSelectedUnitIndex(selectedUnitIndex - 1)
    } else if (direction === 'next' && selectedUnitIndex < currentDisplayUnits.length - 1) {
      setSelectedUnitIndex(selectedUnitIndex + 1)
    }
  }

  return (
    <>
      <div className="space-y-5">
        {/* 1. Status Legend & Summary Counter */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--border)] p-3.5 rounded-xl text-xs shadow-2xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px] mr-1">
              Status Legend:
            </span>
            {STATUS_KEYS.map((st) => {
              const style = INVENTORY_STATUS_COLORS[st]
              const count = items.filter((i) => i.status === st).length
              return (
                <div key={st} className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                  <span className="text-[var(--foreground)] font-medium">
                    {INVENTORY_STATUS_LABELS[st]}
                  </span>
                  <span className="text-[10px] text-[var(--foreground-muted)] px-1.5 py-0.5 rounded-full bg-gray-100 font-semibold">
                    {count}
                  </span>
                </div>
              )
            })}
          </div>

          <div className="text-[11px] text-[var(--foreground-subtle)] font-medium">
            Showing <strong>{activeGroupItems.length}</strong> in {activeGroup} (of {items.length} total)
          </div>
        </div>

        {/* 2. Mixed-Use Category Switcher (if mixed-use project) */}
        {projectCategory === 'mixed_use' && availableSubCategories.length > 0 && (
          <div className="p-2.5 bg-purple-50/70 border border-purple-200 rounded-xl space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-purple-900 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-purple-700" /> Mixed-Use Component Category
              </span>
              <span className="text-[11px] text-purple-700">
                Switch visual layout mode per inventory type
              </span>
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
              <button
                type="button"
                onClick={() => setSelectedSubCategory('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  selectedSubCategory === 'all'
                    ? 'bg-purple-700 text-white shadow-2xs'
                    : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-100/50'
                }`}
              >
                All Components ({items.length})
              </button>
              {availableSubCategories.map((cat) => {
                const count = items.filter((i) => i.category === cat).length
                const isActive = selectedSubCategory === cat
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedSubCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                      isActive
                        ? 'bg-purple-700 text-white shadow-2xs'
                        : 'bg-white text-purple-800 border border-purple-200 hover:bg-purple-100/50'
                    }`}
                  >
                    <span>{PROJECT_CATEGORY_LABELS[cat] || cat}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isActive ? 'bg-purple-900/40 text-white' : 'bg-purple-100 text-purple-800'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 3. Group Selector Tabs (Towers / Blocks / Buildings / Clusters) */}
        {groups.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-[var(--foreground-muted)]">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Select {groupKeyLabel} ({groups.length} available)
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {groups.map((g) => {
                const isSelected = activeGroup === g.name
                return (
                  <button
                    key={g.name}
                    type="button"
                    onClick={() => setSelectedGroupName(g.name)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                        : 'bg-[var(--surface)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {activeLayoutCategory === 'apartments' && <Building2 className="w-4 h-4 text-[var(--brand)]" />}
                        {activeLayoutCategory === 'plotted_developments' && <Grid className="w-4 h-4 text-emerald-600" />}
                        {activeLayoutCategory === 'commercial_sale' && <Store className="w-4 h-4 text-amber-600" />}
                        {activeLayoutCategory === 'villas_gated_communities' && <Home className="w-4 h-4 text-indigo-600" />}
                        {activeLayoutCategory === 'mixed_use' && <Layers className="w-4 h-4 text-purple-600" />}
                        <span className="font-bold text-xs text-[var(--foreground)] truncate">
                          {g.name}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-[var(--foreground)]">
                        {g.total} units
                      </span>
                    </div>

                    {/* Status 5-count bar: All 5 statuses explicitly shown */}
                    <div className="mt-2.5 pt-2 border-t border-[var(--border)] grid grid-cols-5 gap-1 text-[10px] text-center">
                      <div className="flex flex-col">
                        <span className="text-emerald-700 font-bold">{g.available}</span>
                        <span className="text-[9px] text-[var(--foreground-muted)]">Avail</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-amber-700 font-bold">{g.on_hold}</span>
                        <span className="text-[9px] text-[var(--foreground-muted)]">Hold</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-blue-700 font-bold">{g.booked}</span>
                        <span className="text-[9px] text-[var(--foreground-muted)]">Bkd</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-purple-700 font-bold">{g.sold}</span>
                        <span className="text-[9px] text-[var(--foreground-muted)]">Sold</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-gray-600 font-bold">{g.blocked}</span>
                        <span className="text-[9px] text-[var(--foreground-muted)]">Blkd</span>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* 4. Category-Specific Visual Renderers */}

        {/* 4A. APARTMENTS / COMMERCIAL VERTICAL FLOOR MATRIX */}
        {(activeLayoutCategory === 'apartments' || activeLayoutCategory === 'commercial_sale') && floorMap && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[var(--brand)]" />
                  <span>
                    {activeGroup} • {activeLayoutCategory === 'commercial_sale' ? 'Commercial Floor Matrix' : 'Floor Matrix'}
                  </span>
                </h3>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Vertical architectural layout stacked top floor to ground floor. Click any unit to view details.
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--foreground-muted)] px-2.5 py-1 bg-gray-100 rounded-lg">
                {activeGroupItems.length} units total
              </span>
            </div>

            {floorMap.length > 0 ? (
              <div className="space-y-2.5">
                {floorMap.map(([floor, units]) => {
                  const floorAvail = units.filter((u) => u.status === 'available').length
                  return (
                    <div key={floor} className="flex flex-col sm:flex-row items-stretch gap-2.5">
                      {/* Floor Level Header Pill */}
                      <div className="w-full sm:w-28 flex-shrink-0 flex sm:flex-col items-center justify-between sm:justify-center p-2 rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs">
                        <span className="font-bold text-[var(--foreground)]">
                          {floor === 0 ? 'Ground Floor' : `Floor ${floor}`}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-medium">
                          {floorAvail} of {units.length} avail
                        </span>
                      </div>

                      {/* Floor Units Grid */}
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                        {units.map((unit) => {
                          const style = INVENTORY_STATUS_COLORS[unit.status]
                          const globalIdx = currentDisplayUnits.findIndex((u) => u.id === unit.id)

                          return (
                            <button
                              key={unit.id}
                              type="button"
                              onClick={() => setSelectedUnitIndex(globalIdx !== -1 ? globalIdx : null)}
                              className={`p-2.5 rounded-lg border text-left transition-all hover:scale-[1.02] hover:shadow-xs focus:ring-2 focus:ring-blue-500/20 ${style.bg} ${style.border}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-xs text-[var(--foreground)] truncate">
                                  {unit.unit_number}
                                </span>
                                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                              </div>

                              <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--foreground-muted)]">
                                <span className="truncate font-medium">
                                  {unit.bhk_config || unit.commercial_asset_type || `${unit.area_value} ${unit.area_unit}`}
                                </span>
                                {unit.facing && <span className="text-[9px] shrink-0">{unit.facing}</span>}
                              </div>

                              {unit.total_price && (
                                <div className="text-[10px] font-bold text-[var(--foreground)] mt-0.5 truncate">
                                  {formatCurrency(Number(unit.total_price))}
                                </div>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--foreground-muted)]">
                No units match the current filters in {activeGroup}.
              </div>
            )}
          </div>
        )}

        {/* 4B. PLOTTED DEVELOPMENTS GRID */}
        {activeLayoutCategory === 'plotted_developments' && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Grid className="w-4 h-4 text-emerald-600" />
                  <span>{activeGroup} • Plotted Layout Grid</span>
                </h3>
                <p className="text-xs text-[var(--foreground-muted)] flex items-center gap-1.5 mt-0.5">
                  <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>Structured plot layout view. Grouped by block / sector. Click any plot for specifications.</span>
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--foreground-muted)] px-2.5 py-1 bg-gray-100 rounded-lg shrink-0">
                {activeGroupItems.length} plots in {activeGroup}
              </span>
            </div>

            {activeGroupItems.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {activeGroupItems.map((plot) => {
                  const style = INVENTORY_STATUS_COLORS[plot.status]
                  const globalIdx = currentDisplayUnits.findIndex((u) => u.id === plot.id)

                  return (
                    <button
                      key={plot.id}
                      type="button"
                      onClick={() => setSelectedUnitIndex(globalIdx !== -1 ? globalIdx : null)}
                      className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] hover:shadow-xs relative ${style.bg} ${style.border}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-bold text-xs text-[var(--foreground)] block">
                            {plot.unit_number}
                          </span>
                          <span className="text-[10px] text-[var(--foreground-muted)] font-medium">
                            {plot.plot_area || plot.area_value} {plot.area_unit}
                          </span>
                        </div>
                        <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                      </div>

                      {/* Dimensions & Road Width */}
                      <div className="mt-1.5 text-[10px] text-[var(--foreground-muted)] space-y-0.5">
                        {plot.plot_dimensions && (
                          <div className="font-mono text-[9px]">Dim: {plot.plot_dimensions}</div>
                        )}
                        {plot.road_width_ft && (
                          <div>Road: {plot.road_width_ft} ft</div>
                        )}
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-black/5 flex items-center justify-between text-[10px]">
                        <span className="text-[var(--foreground-muted)] flex items-center gap-0.5">
                          <Compass className="w-2.5 h-2.5" />
                          {plot.facing || 'East'}
                        </span>
                        {plot.is_corner_plot && (
                          <span className="text-[9px] font-bold text-amber-900 bg-amber-200/80 px-1 py-0.2 rounded">
                            Corner
                          </span>
                        )}
                      </div>

                      {plot.total_price && (
                        <div className="text-[11px] font-bold text-[var(--foreground)] mt-1.5 truncate">
                          {formatCurrency(Number(plot.total_price))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--foreground-muted)]">
                No plots match the current filters in {activeGroup}.
              </div>
            )}
          </div>
        )}

        {/* 4C. VILLAS AND GATED COMMUNITIES GRID */}
        {activeLayoutCategory === 'villas_gated_communities' && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Home className="w-4 h-4 text-indigo-600" />
                  <span>{activeGroup} • Villa Cluster View</span>
                </h3>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Cluster & street arrangement with villa typologies, extents, and availability
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--foreground-muted)] px-2.5 py-1 bg-gray-100 rounded-lg">
                {activeGroupItems.length} villas in {activeGroup}
              </span>
            </div>

            {activeGroupItems.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                {activeGroupItems.map((villa) => {
                  const style = INVENTORY_STATUS_COLORS[villa.status]
                  const globalIdx = currentDisplayUnits.findIndex((u) => u.id === villa.id)

                  return (
                    <button
                      key={villa.id}
                      type="button"
                      onClick={() => setSelectedUnitIndex(globalIdx !== -1 ? globalIdx : null)}
                      className={`p-3.5 rounded-xl border text-left transition-all hover:scale-[1.02] hover:shadow-xs relative ${style.bg} ${style.border}`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="font-bold text-sm text-[var(--foreground)] block">
                            Villa {villa.unit_number}
                          </span>
                          <span className="text-[11px] text-[var(--foreground-muted)] font-semibold">
                            {villa.bhk_config || 'Villa'}
                          </span>
                        </div>
                        <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] text-[var(--foreground-muted)]">
                        <div>
                          <span className="block text-[9px] uppercase tracking-wider text-[var(--foreground-subtle)]">Built-up</span>
                          <span className="font-semibold text-[var(--foreground)]">{villa.area_value} {villa.area_unit}</span>
                        </div>
                        {villa.plot_area && (
                          <div>
                            <span className="block text-[9px] uppercase tracking-wider text-[var(--foreground-subtle)]">Plot Extent</span>
                            <span className="font-semibold text-[var(--foreground)]">{villa.plot_area} sqyd</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-2 pt-1.5 border-t border-black/5 flex items-center justify-between text-[10px]">
                        <span className="text-[var(--foreground-muted)] flex items-center gap-1">
                          <Compass className="w-3 h-3" />
                          <span>{villa.facing || 'East'} Facing</span>
                        </span>
                        {villa.parking_spaces !== undefined && (
                          <span className="text-[var(--foreground-subtle)]">
                            {villa.parking_spaces} Parking
                          </span>
                        )}
                      </div>

                      {villa.total_price && (
                        <div className="text-xs font-bold text-[var(--foreground)] mt-2 pt-1.5 border-t border-black/5">
                          {formatCurrency(Number(villa.total_price))}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-[var(--foreground-muted)]">
                No villas match the current filters in {activeGroup}.
              </div>
            )}
          </div>
        )}

        {/* 4D. GENERAL / FLAT INVENTORY FALLBACK (If project has no towers/floors) */}
        {!floorMap && activeLayoutCategory !== 'plotted_developments' && activeLayoutCategory !== 'villas_gated_communities' && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-bold text-[var(--foreground)] flex items-center gap-2">
                  <Grid className="w-4 h-4 text-[var(--brand)]" />
                  <span>{activeGroup} • Inventory Grid</span>
                </h3>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Click any inventory unit to inspect specifications and availability
                </p>
              </div>
              <span className="text-xs font-semibold text-[var(--foreground-muted)] px-2.5 py-1 bg-gray-100 rounded-lg">
                {activeGroupItems.length} units
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {activeGroupItems.map((unit) => {
                const style = INVENTORY_STATUS_COLORS[unit.status]
                const globalIdx = currentDisplayUnits.findIndex((u) => u.id === unit.id)

                return (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => setSelectedUnitIndex(globalIdx !== -1 ? globalIdx : null)}
                    className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] hover:shadow-xs relative ${style.bg} ${style.border}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-bold text-xs text-[var(--foreground)] block">
                        {unit.unit_number}
                      </span>
                      <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                    </div>

                    <div className="mt-1 text-[10px] text-[var(--foreground-muted)]">
                      {unit.bhk_config || unit.commercial_asset_type || `${unit.area_value} ${unit.area_unit}`}
                    </div>

                    {unit.total_price && (
                      <div className="text-[11px] font-bold text-[var(--foreground)] mt-2">
                        {formatCurrency(Number(unit.total_price))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Site Plan / Floor Plan Future Upload Notice */}
        <div className="p-3.5 bg-gray-50 border border-[var(--border)] rounded-xl flex items-center justify-between text-xs text-[var(--foreground-muted)]">
          <div className="flex items-center gap-2">
            <MapIcon className="w-4 h-4 text-[var(--foreground-subtle)]" />
            <span>
              Structured layout mode active. Interactive CAD/SVG site plans & floor plan hot-spots can be linked to this hierarchy in future releases.
            </span>
          </div>
        </div>
      </div>

      {/* Detail Drawer with Sequential Navigation */}
      {selectedItem && (
        <InventoryDetailDrawer
          item={selectedItem}
          onClose={() => setSelectedUnitIndex(null)}
          onUpdateSuccess={onItemUpdated}
          onNavigate={handleNavigate}
          hasPrev={selectedUnitIndex !== null && selectedUnitIndex > 0}
          hasNext={selectedUnitIndex !== null && selectedUnitIndex < currentDisplayUnits.length - 1}
        />
      )}
    </>
  )
}
