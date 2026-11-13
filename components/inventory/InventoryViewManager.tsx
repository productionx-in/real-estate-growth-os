'use client'
// components/inventory/InventoryViewManager.tsx
import { useState, useMemo } from 'react'
import {
  LayoutGrid,
  List,
  Search,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  CheckCheck,
  Ban,
  Building,
} from 'lucide-react'
import {
  INVENTORY_STATUS_LABELS,
  type InventoryItemWithRelations,
  type InventoryStatus,
  type ProjectCategory,
} from '@/types/inventory'
import { InventoryTable } from './InventoryTable'
import { InventoryVisualView } from './InventoryVisualView'
import { InventoryForm } from './InventoryForm'
import { EmptyState } from '@/components/shared/EmptyState'

interface InventoryViewManagerProps {
  projectId: string
  projectCategory: ProjectCategory
  initialItems: InventoryItemWithRelations[]
  isManager: boolean
}

type ViewMode = 'visual' | 'table'

export function InventoryViewManager({
  projectId,
  projectCategory,
  initialItems,
  isManager,
}: InventoryViewManagerProps) {
  const [items, setItems] = useState<InventoryItemWithRelations[]>(initialItems)
  const [viewMode, setViewMode] = useState<ViewMode>('visual')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedBhk, setSelectedBhk] = useState<string>('all')
  const [selectedFacing, setSelectedFacing] = useState<string>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  // Status Metrics
  const metrics = useMemo(() => {
    const counts: Record<InventoryStatus, number> = {
      available: 0,
      on_hold: 0,
      booked: 0,
      sold: 0,
      blocked: 0,
    }
    items.forEach((item) => {
      if (counts[item.status] !== undefined) {
        counts[item.status]++
      }
    })
    return {
      total: items.length,
      ...counts,
    }
  }, [items])

  // Filtered items
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (selectedStatus !== 'all' && item.status !== selectedStatus) {
        return false
      }
      if (selectedBhk !== 'all' && item.bhk_config !== selectedBhk) {
        return false
      }
      if (selectedFacing !== 'all' && item.facing !== selectedFacing) {
        return false
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase()
        const unitMatch = item.unit_number.toLowerCase().includes(q)
        const towerMatch = (item.tower_name || '').toLowerCase().includes(q)
        if (!unitMatch && !towerMatch) return false
      }
      return true
    })
  }, [items, selectedStatus, selectedBhk, selectedFacing, searchQuery])

  // Refresh items from API after mutation
  async function refreshItems() {
    try {
      const res = await fetch(`/api/inventory?projectId=${projectId}`)
      const data = await res.json()
      if (data.items) {
        setItems(data.items)
      }
    } catch (e) {
      console.error(e)
    }
  }

  // Unique BHK & facing options present in current dataset
  const bhkOptions = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => {
      if (i.bhk_config) set.add(i.bhk_config)
    })
    return Array.from(set).sort()
  }, [items])

  const facingOptions = useMemo(() => {
    const set = new Set<string>()
    items.forEach((i) => {
      if (i.facing) set.add(i.facing)
    })
    return Array.from(set).sort()
  }, [items])

  return (
    <div className="space-y-5">
      {/* 1. Status KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        {[
          {
            label: 'Total Units',
            value: metrics.total,
            statusKey: 'all',
            color: 'border-[var(--border)] bg-[var(--surface)]',
            text: 'text-[var(--foreground)]',
          },
          {
            label: 'Available',
            value: metrics.available,
            statusKey: 'available',
            color: 'border-emerald-200 bg-emerald-50/50',
            text: 'text-emerald-700',
          },
          {
            label: 'On Hold',
            value: metrics.on_hold,
            statusKey: 'on_hold',
            color: 'border-amber-200 bg-amber-50/50',
            text: 'text-amber-700',
          },
          {
            label: 'Booked',
            value: metrics.booked,
            statusKey: 'booked',
            color: 'border-blue-200 bg-blue-50/50',
            text: 'text-blue-700',
          },
          {
            label: 'Sold',
            value: metrics.sold,
            statusKey: 'sold',
            color: 'border-purple-200 bg-purple-50/50',
            text: 'text-purple-700',
          },
          {
            label: 'Blocked',
            value: metrics.blocked,
            statusKey: 'blocked',
            color: 'border-gray-200 bg-gray-50',
            text: 'text-gray-700',
          },
        ].map((card) => {
          const isSelected = selectedStatus === card.statusKey
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => setSelectedStatus(card.statusKey)}
              className={`p-3 rounded-xl border text-left transition-all ${card.color} ${
                isSelected ? 'ring-2 ring-blue-500 shadow-xs' : 'hover:opacity-90'
              }`}
            >
              <span className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider block">
                {card.label}
              </span>
              <span className={`text-xl font-bold mt-1 block ${card.text}`}>
                {card.value}
              </span>
            </button>
          )
        })}
      </div>

      {/* 2. Controls Toolbar: Search, Filters, View Mode Toggle, Add Unit */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl">
        {/* Left: Search input */}
        <div className="relative flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search unit, plot, tower..."
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
          />
        </div>

        {/* Middle: Dropdown filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {bhkOptions.length > 0 && (
            <select
              value={selectedBhk}
              onChange={(e) => setSelectedBhk(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none"
            >
              <option value="all">All BHKs</option>
              {bhkOptions.map((bhk) => (
                <option key={bhk} value={bhk}>
                  {bhk}
                </option>
              ))}
            </select>
          )}

          {facingOptions.length > 0 && (
            <select
              value={selectedFacing}
              onChange={(e) => setSelectedFacing(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none"
            >
              <option value="all">All Facings</option>
              {facingOptions.map((facing) => (
                <option key={facing} value={facing}>
                  {facing}
                </option>
              ))}
            </select>
          )}

          {/* View Mode Toggle: Visual vs Table */}
          <div className="inline-flex items-center rounded-lg border border-[var(--border)] p-0.5 bg-[var(--surface-hover)]">
            <button
              type="button"
              onClick={() => setViewMode('visual')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'visual'
                  ? 'bg-[var(--surface)] text-[var(--foreground)] shadow-2xs'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Visual</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('table')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === 'table'
                  ? 'bg-[var(--surface)] text-[var(--foreground)] shadow-2xs'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Table</span>
            </button>
          </div>
        </div>

        {/* Right: Add unit action */}
        {isManager && (
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[var(--brand)] rounded-lg hover:bg-[var(--brand-hover)] transition-colors shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Unit</span>
          </button>
        )}
      </div>

      {/* 3. Main Inventory View: Visual vs Table or Empty State */}
      {filteredItems.length > 0 ? (
        viewMode === 'visual' ? (
          <InventoryVisualView
            items={filteredItems}
            category={projectCategory}
            onItemUpdated={refreshItems}
          />
        ) : (
          <InventoryTable
            items={filteredItems}
            onItemUpdated={refreshItems}
          />
        )
      ) : items.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No inventory records yet"
          description="Add your first unit, plot, or commercial space to configure project availability."
          action={
            isManager ? (
              <button
                type="button"
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand)] rounded-lg hover:bg-[var(--brand-hover)]"
              >
                <Plus className="w-3.5 h-3.5" />
                Add First Unit
              </button>
            ) : undefined
          }
        />
      ) : (
        <EmptyState
          icon={Filter}
          title="No matching inventory"
          description="No units match the current filter and search criteria. Try resetting filters."
          action={
            <button
              type="button"
              onClick={() => {
                setSelectedStatus('all')
                setSelectedBhk('all')
                setSelectedFacing('all')
                setSearchQuery('')
              }}
              className="px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)]"
            >
              Reset Filters
            </button>
          }
        />
      )}

      {/* 4. Add Unit Form Modal */}
      {showAddModal && (
        <InventoryForm
          projectId={projectId}
          defaultCategory={projectCategory}
          onClose={() => setShowAddModal(false)}
          onSuccess={refreshItems}
        />
      )}
    </div>
  )
}
