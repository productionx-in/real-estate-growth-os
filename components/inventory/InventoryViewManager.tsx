'use client'
// components/inventory/InventoryViewManager.tsx
import { useState, useMemo, useEffect, useCallback } from 'react'
import {
  LayoutGrid,
  List,
  Search,
  Plus,
  Filter,
  RotateCcw,
  SlidersHorizontal,
  ChevronDown,
  Building,
  X,
  FileSpreadsheet,
} from 'lucide-react'
import {
  PROJECT_CATEGORY_LABELS,
  type InventoryItemWithRelations,
  type InventoryStatus,
  type ProjectCategory,
} from '@/types/inventory'
import { InventoryTable } from './InventoryTable'
import { InventoryVisualView } from './InventoryVisualView'
import { InventoryForm } from './InventoryForm'
import { BulkImportModal } from './BulkImportModal'
import { EmptyState } from '@/components/shared/EmptyState'

interface InventoryViewManagerProps {
  projectId: string
  projectCategory: ProjectCategory
  initialItems: (InventoryItemWithRelations & { hierarchy_path?: string })[]
  isManager: boolean
}

type ViewMode = 'visual' | 'table'

interface HierarchyOption {
  id: string
  name: string
  node_type: string
}

interface HierarchyTreeNode {
  id: string
  name: string
  node_type: string
  children?: HierarchyTreeNode[]
}

export function InventoryViewManager({
  projectId,
  projectCategory,
  initialItems,
  isManager,
}: InventoryViewManagerProps) {
  const [items, setItems] = useState<(InventoryItemWithRelations & { hierarchy_path?: string })[]>(initialItems)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)

  // Filters State
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStatus, setSelectedStatus] = useState<string>('all')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [selectedBhk, setSelectedBhk] = useState<string>('all')
  const [selectedFacing, setSelectedFacing] = useState<string>('all')
  const [selectedHierarchyNode, setSelectedHierarchyNode] = useState<string>('all')
  const [minPrice, setMinPrice] = useState<string>('')
  const [maxPrice, setMaxPrice] = useState<string>('')
  const [minArea, setMinArea] = useState<string>('')
  const [maxArea, setMaxArea] = useState<string>('')

  // Sorting state
  const [sortBy, setSortBy] = useState<string>('unit_number')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  // Pagination state
  const [page, setPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(25)

  // Hierarchy nodes for dropdown
  const [hierarchyNodes, setHierarchyNodes] = useState<HierarchyOption[]>([])

  useEffect(() => {
    fetch(`/api/projects/${projectId}/hierarchy`)
      .then((res) => res.json())
      .then((data) => {
        if (data.nodes && Array.isArray(data.nodes)) {
          const flatList: HierarchyOption[] = []
          const traverse = (nodeList: HierarchyTreeNode[]) => {
            for (const n of nodeList) {
              flatList.push({ id: n.id, name: n.name, node_type: n.node_type })
              if (n.children && n.children.length > 0) {
                traverse(n.children)
              }
            }
          }
          traverse(data.nodes as HierarchyTreeNode[])
          setHierarchyNodes(flatList)
        }
      })
      .catch(() => {})
  }, [projectId])

  // Refresh items from API after mutation
  const refreshItems = useCallback(async () => {
    try {
      const res = await fetch(`/api/inventory?projectId=${projectId}`)
      const data = await res.json()
      if (data.items) {
        setItems(data.items)
      }
    } catch (e) {
      console.error(e)
    }
  }, [projectId])

  // Count active filters (excluding default 'all' or empty)
  const activeFiltersCount = useMemo(() => {
    let count = 0
    if (searchQuery.trim()) count++
    if (selectedStatus !== 'all') count++
    if (selectedCategory !== 'all') count++
    if (selectedBhk !== 'all') count++
    if (selectedFacing !== 'all') count++
    if (selectedHierarchyNode !== 'all') count++
    if (minPrice) count++
    if (maxPrice) count++
    if (minArea) count++
    if (maxArea) count++
    return count
  }, [
    searchQuery,
    selectedStatus,
    selectedCategory,
    selectedBhk,
    selectedFacing,
    selectedHierarchyNode,
    minPrice,
    maxPrice,
    minArea,
    maxArea,
  ])

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('')
    setSelectedStatus('all')
    setSelectedCategory('all')
    setSelectedBhk('all')
    setSelectedFacing('all')
    setSelectedHierarchyNode('all')
    setMinPrice('')
    setMaxPrice('')
    setMinArea('')
    setMaxArea('')
    setPage(1)
  }

  // Filter change handlers that automatically reset pagination to page 1
  const handleSearchChange = (val: string) => {
    setSearchQuery(val)
    setPage(1)
  }
  const handleCategoryChange = (val: string) => {
    setSelectedCategory(val)
    setPage(1)
  }
  const handleBhkChange = (val: string) => {
    setSelectedBhk(val)
    setPage(1)
  }
  const handleStatusChange = (val: string) => {
    setSelectedStatus(val)
    setPage(1)
  }
  const handleHierarchyChange = (val: string) => {
    setSelectedHierarchyNode(val)
    setPage(1)
  }
  const handleFacingChange = (val: string) => {
    setSelectedFacing(val)
    setPage(1)
  }
  const handleMinPriceChange = (val: string) => {
    setMinPrice(val)
    setPage(1)
  }
  const handleMaxPriceChange = (val: string) => {
    setMaxPrice(val)
    setPage(1)
  }
  const handleMinAreaChange = (val: string) => {
    setMinArea(val)
    setPage(1)
  }
  const handleMaxAreaChange = (val: string) => {
    setMaxArea(val)
    setPage(1)
  }

  // Handle column header sort
  const handleSortChange = (field: string) => {
    setPage(1)
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
  }

  // Status Metrics (calculated from items)
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

  // Unique options derived from current dataset
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

  const categoryOptions = useMemo(() => {
    const set = new Set<ProjectCategory>()
    items.forEach((i) => {
      if (i.category) set.add(i.category)
    })
    return Array.from(set)
  }, [items])

  // Filter items based on active criteria
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // Status
      if (selectedStatus !== 'all' && item.status !== selectedStatus) {
        return false
      }
      // Category
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false
      }
      // BHK
      if (selectedBhk !== 'all' && item.bhk_config !== selectedBhk) {
        return false
      }
      // Facing
      if (selectedFacing !== 'all' && item.facing !== selectedFacing) {
        return false
      }
      // Hierarchy Node
      if (selectedHierarchyNode !== 'all' && item.hierarchy_node_id !== selectedHierarchyNode) {
        return false
      }
      // Min Price
      if (minPrice && (item.total_price === null || Number(item.total_price) < Number(minPrice))) {
        return false
      }
      // Max Price
      if (maxPrice && (item.total_price === null || Number(item.total_price) > Number(maxPrice))) {
        return false
      }
      // Min Area
      if (minArea && item.area_value < Number(minArea)) {
        return false
      }
      // Max Area
      if (maxArea && item.area_value > Number(maxArea)) {
        return false
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        const unitMatch = item.unit_number.toLowerCase().includes(q)
        const towerMatch = (item.tower_name || '').toLowerCase().includes(q)
        const pathMatch = (item.hierarchy_path || '').toLowerCase().includes(q)
        if (!unitMatch && !towerMatch && !pathMatch) return false
      }
      return true
    })
  }, [
    items,
    selectedStatus,
    selectedCategory,
    selectedBhk,
    selectedFacing,
    selectedHierarchyNode,
    minPrice,
    maxPrice,
    minArea,
    maxArea,
    searchQuery,
  ])

  // Sort filtered items
  const sortedItems = useMemo(() => {
    const cloned = [...filteredItems]
    cloned.sort((a, b) => {
      let comparison = 0
      switch (sortBy) {
        case 'unit_number':
          comparison = a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true })
          break
        case 'total_price':
          comparison = (Number(a.total_price) || 0) - (Number(b.total_price) || 0)
          break
        case 'area_value':
          comparison = a.area_value - b.area_value
          break
        case 'status':
          comparison = a.status.localeCompare(b.status)
          break
        case 'updated_at':
          comparison = new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
          break
        default:
          comparison = 0
      }
      return sortOrder === 'desc' ? -comparison : comparison
    })
    return cloned
  }, [filteredItems, sortBy, sortOrder])

  return (
    <div className="space-y-5">
      {/* 1. Status KPI Summary Cards (Interactive Status Filters) */}
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
              onClick={() => handleStatusChange(card.statusKey)}
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

      {/* 2. Controls Toolbar: Search, Primary Filters, Advanced Filter Toggle, View Mode, Add Unit */}
      <div className="bg-[var(--surface)] border border-[var(--border)] p-3 rounded-xl space-y-3 shadow-2xs">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Left: Search input */}
          <div className="relative flex-1 max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by unit #, tower, block, or floor..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)] text-[var(--foreground)]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--foreground-subtle)] hover:text-[var(--foreground)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Center-Right: Core filters & Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Filter (Especially vital for Mixed-Use) */}
            {(projectCategory === 'mixed_use' || categoryOptions.length > 1) && (
              <select
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-[var(--foreground)]"
                aria-label="Filter by Category"
              >
                <option value="all">All Categories</option>
                {categoryOptions.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat in PROJECT_CATEGORY_LABELS ? PROJECT_CATEGORY_LABELS[cat] : cat}
                  </option>
                ))}
              </select>
            )}

            {/* BHK Filter (Conditional: shown for apartments, villas, or mixed-use with BHKs) */}
            {projectCategory !== 'plotted_developments' && bhkOptions.length > 0 && (
              <select
                value={selectedBhk}
                onChange={(e) => handleBhkChange(e.target.value)}
                className="px-2.5 py-1.5 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-[var(--foreground)]"
                aria-label="Filter by BHK"
              >
                <option value="all">All BHKs</option>
                {bhkOptions.map((bhk) => (
                  <option key={bhk} value={bhk}>
                    {bhk}
                  </option>
                ))}
              </select>
            )}

            {/* Toggle Advanced Filters Button */}
            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                showAdvancedFilters || activeFiltersCount > 0
                  ? 'bg-blue-50 border-blue-200 text-blue-700'
                  : 'bg-[var(--surface)] border-[var(--border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] flex items-center justify-center font-bold">
                  {activeFiltersCount}
                </span>
              )}
              <ChevronDown
                className={`w-3 h-3 transition-transform ${showAdvancedFilters ? 'rotate-180' : ''}`}
              />
            </button>

            {/* Reset Filters Button if any active */}
            {activeFiltersCount > 0 && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-[var(--foreground-muted)] hover:text-red-600 transition-colors"
                title="Reset all filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            )}

            {/* View Mode Toggle: Visual vs Table */}
            <div className="inline-flex items-center rounded-lg border border-[var(--border)] p-0.5 bg-[var(--surface-hover)]">
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
            </div>

            {/* Right: Actions for managers */}
            {isManager && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors shadow-2xs"
                  title="Bulk import inventory using CSV or Excel"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                  <span>Import</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[var(--brand)] rounded-lg hover:bg-[var(--brand-hover)] transition-colors shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Unit</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 3. Advanced Filters Drawer Row (Expandable) */}
        {showAdvancedFilters && (
          <div className="pt-3 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs animate-in slide-in-from-top-2 duration-150">
            {/* Hierarchy Node / Tower Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1">
                Hierarchy / Tower
              </label>
              <select
                value={selectedHierarchyNode}
                onChange={(e) => handleHierarchyChange(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-xs text-[var(--foreground)]"
              >
                <option value="all">All Locations / Towers</option>
                {hierarchyNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name} ({n.node_type})
                  </option>
                ))}
              </select>
            </div>

            {/* Facing Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1">
                Facing / Orientation
              </label>
              <select
                value={selectedFacing}
                onChange={(e) => handleFacingChange(e.target.value)}
                className="w-full px-2.5 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-xs text-[var(--foreground)]"
              >
                <option value="all">All Facings</option>
                {facingOptions.map((facing) => (
                  <option key={facing} value={facing}>
                    {facing}
                  </option>
                ))}
              </select>
            </div>

            {/* Price Range Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1">
                Price Range (₹)
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="Min"
                  value={minPrice}
                  onChange={(e) => handleMinPriceChange(e.target.value)}
                  className="w-1/2 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-xs text-[var(--foreground)]"
                />
                <span className="text-[var(--foreground-subtle)]">-</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={maxPrice}
                  onChange={(e) => handleMaxPriceChange(e.target.value)}
                  className="w-1/2 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-xs text-[var(--foreground)]"
                />
              </div>
            </div>

            {/* Area Range Filter */}
            <div>
              <label className="block text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider mb-1">
                Area Range
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  placeholder="Min Area"
                  value={minArea}
                  onChange={(e) => handleMinAreaChange(e.target.value)}
                  className="w-1/2 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-xs text-[var(--foreground)]"
                />
                <span className="text-[var(--foreground-subtle)]">-</span>
                <input
                  type="number"
                  placeholder="Max Area"
                  value={maxArea}
                  onChange={(e) => handleMaxAreaChange(e.target.value)}
                  className="w-1/2 px-2 py-1.5 bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none text-xs text-[var(--foreground)]"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Main Inventory View: Visual vs Table or Empty State */}
      {sortedItems.length > 0 ? (
        viewMode === 'visual' ? (
          <InventoryVisualView
            items={sortedItems}
            category={projectCategory}
            onItemUpdated={refreshItems}
          />
        ) : (
          <InventoryTable
            items={sortedItems}
            onItemUpdated={refreshItems}
            sortBy={sortBy}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            page={page}
            pageSize={pageSize}
            totalItems={sortedItems.length}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
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
              onClick={handleResetFilters}
              className="px-3.5 py-1.5 text-xs font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)]"
            >
              Reset Filters
            </button>
          }
        />
      )}

      {/* 5. Add Unit Form Modal */}
      {showAddModal && (
        <InventoryForm
          projectId={projectId}
          defaultCategory={projectCategory}
          onClose={() => setShowAddModal(false)}
          onSuccess={refreshItems}
        />
      )}

      {/* 6. Bulk Import Modal (CSV & Excel) */}
      {showImportModal && (
        <BulkImportModal
          projectId={projectId}
          projectCategory={projectCategory}
          onClose={() => setShowImportModal(false)}
          onSuccess={refreshItems}
        />
      )}
    </div>
  )
}
