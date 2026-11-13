'use client'
// components/inventory/InventoryTable.tsx
import { useState } from 'react'
import {
  formatCurrency,
  formatDate,
} from '@/lib/utils/format'
import {
  PROJECT_CATEGORY_LABELS,
  type InventoryItemWithRelations,
  type InventoryStatus,
} from '@/types/inventory'
import { InventoryStatusBadge } from './InventoryStatusBadge'
import { InventoryStatusDialog } from './InventoryStatusDialog'
import { InventoryDetailDrawer } from './InventoryDetailDrawer'
import { Edit3, Eye, MoreHorizontal } from 'lucide-react'

interface InventoryTableProps {
  items: InventoryItemWithRelations[]
  onItemUpdated?: () => void
}

export function InventoryTable({ items, onItemUpdated }: InventoryTableProps) {
  const [selectedItem, setSelectedItem] = useState<InventoryItemWithRelations | null>(null)
  const [statusItem, setStatusItem] = useState<InventoryItemWithRelations | null>(null)

  return (
    <>
      <div className="border border-[var(--border)] rounded-xl overflow-hidden bg-[var(--surface)] shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                <th className="px-4 py-3">Unit / Plot #</th>
                <th className="px-4 py-3">Tower / Block</th>
                <th className="px-4 py-3">Config</th>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Facing</th>
                <th className="px-4 py-3">Total Price</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {items.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="hover:bg-[var(--surface-hover)] transition-colors cursor-pointer group"
                >
                  {/* Unit number */}
                  <td className="px-4 py-3 font-semibold text-[var(--foreground)]">
                    <div className="flex items-center gap-1.5">
                      <span>{item.unit_number}</span>
                      {item.is_corner_plot && (
                        <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-normal">
                          Corner
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Tower / Floor */}
                  <td className="px-4 py-3 text-[var(--foreground-muted)]">
                    {item.tower_name || '—'}
                    {item.floor_number !== null && item.floor_number !== undefined && (
                      <span className="text-[11px] text-[var(--foreground-subtle)] block">
                        Floor {item.floor_number}
                      </span>
                    )}
                  </td>

                  {/* Config */}
                  <td className="px-4 py-3 text-[var(--foreground)]">
                    {item.bhk_config || item.commercial_asset_type || '—'}
                  </td>

                  {/* Area */}
                  <td className="px-4 py-3 text-[var(--foreground-muted)]">
                    <span className="font-medium text-[var(--foreground)]">
                      {item.area_value}
                    </span>{' '}
                    {item.area_unit}
                  </td>

                  {/* Facing */}
                  <td className="px-4 py-3 text-[var(--foreground-muted)]">
                    {item.facing || '—'}
                  </td>

                  {/* Price */}
                  <td className="px-4 py-3 font-semibold text-[var(--foreground)]">
                    {item.total_price
                      ? formatCurrency(Number(item.total_price))
                      : '—'}
                  </td>

                  {/* Status Badge */}
                  <td className="px-4 py-3">
                    <InventoryStatusBadge status={item.status} />
                  </td>

                  {/* Action buttons */}
                  <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedItem(item)}
                        className="p-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-gray-100 transition-colors"
                        title="View details"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setStatusItem(item)}
                        className="p-1.5 rounded-md text-[var(--brand)] hover:bg-blue-50 transition-colors"
                        title="Change status"
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
      </div>

      {/* Detail Drawer */}
      {selectedItem && (
        <InventoryDetailDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onUpdateSuccess={onItemUpdated}
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
    </>
  )
}
