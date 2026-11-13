'use client'
// components/inventory/InventoryVisualView.tsx
import { useState, useMemo } from 'react'
import {
  Building2,
  Grid,
  Layers,
  MapPin,
  Compass,
  ArrowUpRight,
} from 'lucide-react'
import {
  INVENTORY_STATUS_LABELS,
  INVENTORY_STATUS_COLORS,
  type InventoryItemWithRelations,
  type InventoryStatus,
  type ProjectCategory,
} from '@/types/inventory'
import { InventoryDetailDrawer } from './InventoryDetailDrawer'
import { formatCurrency } from '@/lib/utils/format'

interface InventoryVisualViewProps {
  items: InventoryItemWithRelations[]
  category: ProjectCategory
  onItemUpdated?: () => void
}

export function InventoryVisualView({
  items,
  category,
  onItemUpdated,
}: InventoryVisualViewProps) {
  const [selectedItem, setSelectedItem] = useState<InventoryItemWithRelations | null>(null)

  // 1. Determine grouping: Tower/Building for apartments/commercial/mixed-use; Block/Sector for plots/villas
  const towersOrBlocks = useMemo(() => {
    const set = new Set<string>()
    items.forEach((item) => {
      const name = item.tower_name || item.hierarchy_node?.name || 'General'
      set.add(name)
    })
    return Array.from(set).sort()
  }, [items])

  const [activeGroup, setActiveGroup] = useState<string>(
    towersOrBlocks[0] || 'General'
  )

  // Filter items in active group
  const groupItems = useMemo(() => {
    return items.filter((item) => {
      const name = item.tower_name || item.hierarchy_node?.name || 'General'
      return name === activeGroup
    })
  }, [items, activeGroup])

  // Is this a vertical tower/floor structure?
  const isVertical = ['apartments', 'commercial_sale', 'mixed_use'].includes(category)

  // For vertical projects: group units by floor in descending order
  const floorMap = useMemo(() => {
    if (!isVertical) return null
    const map = new Map<number, InventoryItemWithRelations[]>()
    groupItems.forEach((item) => {
      const fl = item.floor_number ?? 0
      const list = map.get(fl) || []
      list.push(item)
      map.set(fl, list)
    })

    // Sort floors descending (top floor to ground)
    return Array.from(map.entries()).sort((a, b) => b[0] - a[0])
  }, [groupItems, isVertical])

  return (
    <>
      <div className="space-y-5">
        {/* Status Legend */}
        <div className="flex flex-wrap items-center gap-3 bg-[var(--surface)] border border-[var(--border)] p-3.5 rounded-xl text-xs">
          <span className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px] mr-1">
            Status Legend:
          </span>
          {(['available', 'on_hold', 'booked', 'sold', 'blocked'] as InventoryStatus[]).map((st) => {
            const style = INVENTORY_STATUS_COLORS[st]
            const count = items.filter((i) => i.status === st).length
            return (
              <div key={st} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-xs ${style.dot}`} />
                <span className="text-[var(--foreground)] font-medium">
                  {INVENTORY_STATUS_LABELS[st]}
                </span>
                <span className="text-[10px] text-[var(--foreground-muted)] px-1.5 py-0.2 rounded-full bg-gray-100">
                  {count}
                </span>
              </div>
            )
          })}
        </div>

        {/* Tower / Block Switcher Tabs */}
        {towersOrBlocks.length > 1 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-[var(--border)]">
            {towersOrBlocks.map((name) => {
              const count = items.filter(
                (i) => (i.tower_name || i.hierarchy_node?.name || 'General') === name
              ).length
              const isActive = activeGroup === name

              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setActiveGroup(name)}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[var(--brand)] text-white shadow-xs'
                      : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--surface-hover)]'
                  }`}
                >
                  {isVertical ? <Building2 className="w-3.5 h-3.5" /> : <Layers className="w-3.5 h-3.5" />}
                  <span>{name}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-[var(--foreground-muted)]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {/* Visual Render: Tower/Floor Matrix or Plotted Layout Grid */}
        {isVertical && floorMap ? (
          /* Tower & Floor Matrix */
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-[var(--brand)]" />
                  {activeGroup} Floor Matrix
                </h3>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Click any unit to review dimensions, pricing, and availability
                </p>
              </div>
              <span className="text-xs text-[var(--foreground-muted)]">
                {groupItems.length} units in {activeGroup}
              </span>
            </div>

            <div className="space-y-3">
              {floorMap.map(([floor, units]) => (
                <div key={floor} className="flex items-stretch gap-3">
                  {/* Floor Level Label */}
                  <div className="w-20 flex-shrink-0 flex items-center justify-center rounded-lg bg-[var(--surface-hover)] border border-[var(--border)] text-xs font-semibold text-[var(--foreground-muted)]">
                    {floor === 0 ? 'GND' : `FL ${floor}`}
                  </div>

                  {/* Floor Units Grid */}
                  <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                    {units.map((unit) => {
                      const style = INVENTORY_STATUS_COLORS[unit.status]
                      return (
                        <button
                          key={unit.id}
                          type="button"
                          onClick={() => setSelectedItem(unit)}
                          className={`p-2.5 rounded-lg border text-left transition-all hover:scale-[1.02] hover:shadow-sm focus:ring-2 focus:ring-blue-500/20 ${style.bg} ${style.border}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-[var(--foreground)] truncate">
                              {unit.unit_number}
                            </span>
                            <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                          </div>
                          <div className="mt-1 flex items-center justify-between text-[10px] text-[var(--foreground-muted)]">
                            <span>{unit.bhk_config || `${unit.area_value} ${unit.area_unit}`}</span>
                            {unit.facing && <span>{unit.facing}</span>}
                          </div>
                          {unit.total_price && (
                            <div className="text-[10px] font-semibold text-[var(--foreground)] mt-0.5">
                              {formatCurrency(Number(unit.total_price))}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Plotted Developments / Villas Grid Layout */
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[var(--border)]">
              <div>
                <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                  <Grid className="w-4 h-4 text-[var(--brand)]" />
                  {activeGroup} Plotted Layout
                </h3>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Real-time interactive plot availability for {activeGroup}
                </p>
              </div>
              <span className="text-xs text-[var(--foreground-muted)]">
                {groupItems.length} plots/villas
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {groupItems.map((plot) => {
                const style = INVENTORY_STATUS_COLORS[plot.status]
                return (
                  <button
                    key={plot.id}
                    type="button"
                    onClick={() => setSelectedItem(plot)}
                    className={`p-3 rounded-xl border text-left transition-all hover:scale-[1.02] hover:shadow-md relative ${style.bg} ${style.border}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-bold text-xs text-[var(--foreground)] block">
                          {plot.unit_number}
                        </span>
                        <span className="text-[10px] text-[var(--foreground-muted)]">
                          {plot.area_value} {plot.area_unit}
                        </span>
                      </div>
                      <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                    </div>

                    <div className="mt-2 pt-2 border-t border-black/5 flex items-center justify-between text-[10px]">
                      <span className="text-[var(--foreground-muted)] flex items-center gap-0.5">
                        <Compass className="w-2.5 h-2.5" />
                        {plot.facing || 'East'}
                      </span>
                      {plot.is_corner_plot && (
                        <span className="font-semibold text-amber-800 bg-amber-200/50 px-1 rounded">
                          Corner
                        </span>
                      )}
                    </div>

                    {plot.total_price && (
                      <div className="text-[11px] font-bold text-[var(--foreground)] mt-1">
                        {formatCurrency(Number(plot.total_price))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {/* Detail Drawer */}
      {selectedItem && (
        <InventoryDetailDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdateSuccess={onItemUpdated}
        />
      )}
    </>
  )
}
