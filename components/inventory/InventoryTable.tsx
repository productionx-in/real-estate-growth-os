'use client'
// components/inventory/InventoryTable.tsx
import { useState, useMemo } from 'react'
import {
  formatCurrency,
  formatRelative,
} from '@/lib/utils/format'
import {
  PROJECT_CATEGORY_LABELS,
  type InventoryItemWithRelations,
} from '@/types/inventory'
import { InventoryStatusBadge } from './InventoryStatusBadge'
import { InventoryStatusDialog } from './InventoryStatusDialog'
import { InventoryDetailDrawer } from './InventoryDetailDrawer'
import { InventoryForm } from './InventoryForm'
import {
  Edit3,
  Eye,
  Pencil,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Layers,
} from 'lucide-react'

export interface InventoryTableProps {
  items: (InventoryItemWithRelations & { hierarchy_path?: string })[]
  onItemUpdated?: () => void
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  onSortChange?: (field: string) => void
  // Optional pagination props
  page?: number
  pageSize?: number
  totalItems?: number
  onPageChange?: (newPage: number) => void
  onPageSizeChange?: (newSize: number) => void
}

export function InventoryTable({
  items,
  onItemUpdated,
  sortBy: externalSortBy,
  sortOrder: externalSortOrder,
  onSortChange,
  page: externalPage,
  pageSize: externalPageSize,
  totalItems: externalTotal,
  onPageChange,
  onPageSizeChange,
}: InventoryTableProps) {
  // Local state for detail drawer and modals
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const [statusItem, setStatusItem] = useState<InventoryItemWithRelations | null>(null)
  const [editItem, setEditItem] = useState<InventoryItemWithRelations | null>(null)

  // Internal client-side sorting fallback if not driven by parent
  const [internalSortBy, setInternalSortBy] = useState<string>('unit_number')
  const [internalSortOrder, setInternalSortOrder] = useState<'asc' | 'desc'>('asc')

  const sortBy = externalSortBy !== undefined ? externalSortBy : internalSortBy
  const sortOrder = externalSortOrder !== undefined ? externalSortOrder : internalSortOrder

  // Internal client-side pagination fallback if not driven by parent
  const [internalPage, setInternalPage] = useState<number>(1)
  const [internalPageSize, setInternalPageSize] = useState<number>(25)

  const isControlledPagination = externalPage !== undefined && onPageChange !== undefined
  const currentPage = isControlledPagination ? externalPage : internalPage
  const currentPageSize = isControlledPagination ? (externalPageSize || 25) : internalPageSize

  const handleSort = (field: string) => {
    if (onSortChange) {
      onSortChange(field)
    } else {
      if (internalSortBy === field) {
        setInternalSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))
      } else {
        setInternalSortBy(field)
        setInternalSortOrder('asc')
      }
    }
  }

  // Sort items client-side if not controlled
  const sortedItems = useMemo(() => {
    if (onSortChange) return items

    const cloned = [...items]
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
  }, [items, sortBy, sortOrder, onSortChange])

  // Pagination calculation
  const totalCount = isControlledPagination ? (externalTotal ?? items.length) : sortedItems.length
  const totalPages = Math.max(1, Math.ceil(totalCount / currentPageSize))

  const paginatedItems = useMemo(() => {
    if (isControlledPagination) return sortedItems
    const from = (currentPage - 1) * currentPageSize
    return sortedItems.slice(from, from + currentPageSize)
  }, [sortedItems, currentPage, currentPageSize, isControlledPagination])

  const selectedItem =
    selectedIndex !== null && paginatedItems[selectedIndex]
      ? paginatedItems[selectedIndex]
      : null

  const handleNavigate = (direction: 'prev' | 'next') => {
    if (selectedIndex === null) return
    if (direction === 'prev' && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1)
    } else if (direction === 'next' && selectedIndex < paginatedItems.length - 1) {
      setSelectedIndex(selectedIndex + 1)
    }
  }

  const handlePageChange = (newPage: number) => {
    const valid = Math.max(1, Math.min(newPage, totalPages))
    if (isControlledPagination) {
      onPageChange(valid)
    } else {
      setInternalPage(valid)
    }
  }

  const handlePageSizeChange = (newSize: number) => {
    if (onPageSizeChange) {
      onPageSizeChange(newSize)
    } else {
      setInternalPageSize(newSize)
      setInternalPage(1)
    }
  }

  const renderSortHeader = (label: string, field: string, align: 'left' | 'right' = 'left') => {
    const isActive = sortBy === field
    return (
      <th
        scope="col"
        className={`px-4 py-3 cursor-pointer select-none hover:bg-[var(--surface-muted)] transition-colors ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
        onClick={() => handleSort(field)}
      >
        <div
          className={`inline-flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wider ${
            isActive ? 'text-[var(--brand)]' : 'text-[var(--foreground-muted)]'
          }`}
        >
          <span>{label}</span>
          {isActive ? (
            sortOrder === 'asc' ? (
              <ArrowUp className="w-3.5 h-3.5 text-[var(--brand)]" />
            ) : (
              <ArrowDown className="w-3.5 h-3.5 text-[var(--brand)]" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-[var(--foreground-subtle)] opacity-50" />
          )}
        </div>
      </th>
    )
  }

  return (
    <>
      <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                {renderSortHeader('Unit / Plot #', 'unit_number')}
                <th scope="col" className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]">
                  Hierarchy / Location
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]">
                  Category
                </th>
                <th scope="col" className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]">
                  Config / Typology
                </th>
                {renderSortHeader('Area', 'area_value')}
                {renderSortHeader('Total Price', 'total_price')}
                {renderSortHeader('Status', 'status')}
                {renderSortHeader('Updated', 'updated_at')}
                <th scope="col" className="px-4 py-3 text-right font-semibold text-[11px] uppercase tracking-wider text-[var(--foreground-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {paginatedItems.map((item, idx) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedIndex(idx)}
                  className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer group"
                >
                  {/* Unit number */}
                  <td className="px-4 py-3 font-semibold text-[var(--foreground)]">
                    <div className="flex items-center gap-1.5">
                      <span>{item.unit_number}</span>
                      {item.is_corner_plot && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-medium">
                          Corner
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Hierarchy Breadcrumb / Location */}
                  <td className="px-4 py-3 text-[var(--foreground-muted)] max-w-xs">
                    {item.hierarchy_path ? (
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50/60 px-2 py-0.5 rounded">
                        <Layers className="w-3 h-3 text-blue-500 shrink-0" />
                        <span className="truncate">{item.hierarchy_path}</span>
                      </span>
                    ) : item.tower_name || item.floor_number !== null ? (
                      <div className="text-xs">
                        <span>{item.tower_name ? `Tower ${item.tower_name}` : '—'}</span>
                        {item.floor_number !== null && item.floor_number !== undefined && (
                          <span className="text-[11px] text-[var(--foreground-subtle)] block">
                            Floor {item.floor_number}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[var(--foreground-subtle)]">—</span>
                    )}
                  </td>

                  {/* Category */}
                  <td className="px-4 py-3">
                    <span className="inline-block text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                      {PROJECT_CATEGORY_LABELS[item.category] || item.category}
                    </span>
                  </td>

                  {/* Config */}
                  <td className="px-4 py-3 text-[var(--foreground)] font-medium">
                    {item.bhk_config || item.commercial_asset_type || (item.plot_dimensions ? `Plot ${item.plot_dimensions}` : '—')}
                  </td>

                  {/* Area */}
                  <td className="px-4 py-3 text-[var(--foreground-muted)] whitespace-nowrap">
                    <span className="font-semibold text-[var(--foreground)]">
                      {item.area_value}
                    </span>{' '}
                    {item.area_unit}
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 font-semibold text-[var(--foreground)] whitespace-nowrap">
                    {item.total_price
                      ? formatCurrency(Number(item.total_price))
                      : '—'}
                  </td>

                  {/* Status Badge */}
                  <td className="px-4 py-3">
                    <InventoryStatusBadge status={item.status} />
                  </td>

                  {/* Updated at */}
                  <td className="px-4 py-3 text-[var(--foreground-subtle)] text-[11px] whitespace-nowrap">
                    {formatRelative(item.updated_at)}
                  </td>

                  {/* Action buttons */}
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        className="p-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-gray-100 transition-colors"
                        title="View unit details"
                        aria-label="View unit details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditItem(item)}
                        className="p-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-gray-100 transition-colors"
                        title="Edit unit details"
                        aria-label="Edit unit details"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusItem(item)}
                        className="p-1.5 rounded-md text-[var(--brand)] hover:bg-blue-50 transition-colors"
                        title="Change status"
                        aria-label="Change status"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-3.5 border-t border-[var(--border)] bg-[var(--surface-hover)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-[var(--foreground-muted)]">
            <span>
              Showing{' '}
              <strong className="text-[var(--foreground)]">
                {totalCount === 0 ? 0 : (currentPage - 1) * currentPageSize + 1}
              </strong>{' '}
              to{' '}
              <strong className="text-[var(--foreground)]">
                {Math.min(currentPage * currentPageSize, totalCount)}
              </strong>{' '}
              of <strong className="text-[var(--foreground)]">{totalCount}</strong> units
            </span>

            <span className="text-[var(--border)]">|</span>

            <div className="flex items-center gap-1.5">
              <span>Rows per page:</span>
              <select
                value={currentPageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="bg-[var(--surface)] border border-[var(--border)] rounded px-1.5 py-0.5 text-xs text-[var(--foreground)] outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-muted)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>

            <span className="px-2 text-xs text-[var(--foreground-muted)]">
              Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
            </span>

            <button
              type="button"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-muted)] disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {selectedItem && (
        <InventoryDetailDrawer
          item={selectedItem}
          onClose={() => setSelectedIndex(null)}
          onUpdateSuccess={onItemUpdated}
          onNavigate={handleNavigate}
          hasPrev={selectedIndex !== null && selectedIndex > 0}
          hasNext={selectedIndex !== null && selectedIndex < paginatedItems.length - 1}
        />
      )}

      {/* Status Transition Dialog */}
      {statusItem && (
        <InventoryStatusDialog
          item={statusItem}
          onClose={() => setStatusItem(null)}
          onSuccess={onItemUpdated}
        />
      )}

      {/* Edit Form Modal */}
      {editItem && (
        <InventoryForm
          projectId={editItem.project_id}
          defaultCategory={editItem.category}
          initialItem={editItem}
          onClose={() => setEditItem(null)}
          onSuccess={onItemUpdated}
        />
      )}
    </>
  )
}
