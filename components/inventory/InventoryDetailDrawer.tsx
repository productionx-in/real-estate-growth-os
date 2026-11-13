'use client'
// components/inventory/InventoryDetailDrawer.tsx
import { useState, useEffect } from 'react'
import {
  X,
  Maximize2,
  Compass,
  History,
  Tag,
  ArrowRight,
  Edit3,
  Pencil,
} from 'lucide-react'
import { formatCurrency, formatRelative } from '@/lib/utils/format'
import {
  PROJECT_CATEGORY_LABELS,
  type InventoryItemWithRelations,
} from '@/types/inventory'
import { InventoryStatusBadge } from './InventoryStatusBadge'
import { InventoryStatusDialog } from './InventoryStatusDialog'
import { InventoryForm } from './InventoryForm'

interface InventoryHistoryRecord {
  id: string
  previous_status: string | null
  new_status: string
  reason?: string | null
  created_at: string
  changer?: { full_name: string } | null
  actor?: { full_name: string } | null
}

interface InventoryDetailDrawerProps {
  item: InventoryItemWithRelations
  onClose: () => void
  onUpdateSuccess?: () => void
}

export function InventoryDetailDrawer({
  item,
  onClose,
  onUpdateSuccess,
}: InventoryDetailDrawerProps) {
  const [history, setHistory] = useState<InventoryHistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    fetch(`/api/inventory/${item.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.history) setHistory(data.history)
        setLoadingHistory(false)
      })
      .catch(() => setLoadingHistory(false))
  }, [item.id])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[1px] z-40"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-5 border-b border-[var(--border)] flex items-start justify-between bg-[var(--surface-hover)]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase px-2 py-0.5 rounded bg-gray-200 text-gray-700">
                {PROJECT_CATEGORY_LABELS[item.category] || item.category}
              </span>
              {item.is_corner_plot && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                  Corner Plot
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-[var(--foreground)] mt-1.5 flex items-center gap-2">
              {item.unit_number}
            </h2>
            <p className="text-xs text-[var(--foreground-muted)]">
              {item.project?.name} {item.project?.code ? `(${item.project.code})` : ''}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Status & Action Card */}
          <div className="flex items-center justify-between p-4 rounded-xl border border-[var(--border)] bg-gray-50/50">
            <div>
              <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider block mb-1">
                Current Availability
              </span>
              <InventoryStatusBadge status={item.status} className="text-sm px-3 py-1" />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-muted)] transition-colors"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                Edit Details
              </button>

              <button
                type="button"
                onClick={() => setShowStatusModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--brand)] bg-[var(--brand-light)] border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                Change Status
              </button>
            </div>
          </div>

          {/* Pricing Section (Modular) */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> Pricing Details
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-xs text-[var(--foreground-muted)] block">Total Price</span>
                <span className="text-lg font-bold text-[var(--foreground)] mt-0.5 block">
                  {item.total_price ? formatCurrency(Number(item.total_price)) : 'Price on Request'}
                </span>
              </div>
              <div className="p-3.5 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-xs text-[var(--foreground-muted)] block">Base Rate</span>
                <span className="text-lg font-semibold text-[var(--foreground)] mt-0.5 block">
                  {item.base_rate
                    ? `${formatCurrency(Number(item.base_rate))} / ${item.area_unit}`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {/* Specifications & Area Grid */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5" /> Area & Dimensions
            </h3>
            <div className="grid grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-lg border border-[var(--border)]">
                <span className="text-[var(--foreground-muted)] block">Primary Area</span>
                <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                  {item.area_value} {item.area_unit}
                </span>
              </div>
              {item.carpet_area && (
                <div className="p-3 rounded-lg border border-[var(--border)]">
                  <span className="text-[var(--foreground-muted)] block">Carpet Area</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                    {item.carpet_area} sqft
                  </span>
                </div>
              )}
              {item.super_built_up_area && (
                <div className="p-3 rounded-lg border border-[var(--border)]">
                  <span className="text-[var(--foreground-muted)] block">Super Built-up</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                    {item.super_built_up_area} sqft
                  </span>
                </div>
              )}
              {item.plot_area && (
                <div className="p-3 rounded-lg border border-[var(--border)]">
                  <span className="text-[var(--foreground-muted)] block">Plot Area</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                    {item.plot_area} sqyd
                  </span>
                </div>
              )}
              {item.plot_dimensions && (
                <div className="p-3 rounded-lg border border-[var(--border)]">
                  <span className="text-[var(--foreground-muted)] block">Dimensions</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                    {item.plot_dimensions}
                  </span>
                </div>
              )}
              {item.road_width_ft && (
                <div className="p-3 rounded-lg border border-[var(--border)]">
                  <span className="text-[var(--foreground-muted)] block">Road Width</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                    {item.road_width_ft} ft
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Configuration & Orientation */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" /> Unit Configuration
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              {item.bhk_config && (
                <div className="p-2.5 rounded-lg bg-[var(--surface-hover)]">
                  <span className="text-[var(--foreground-muted)] block">Config</span>
                  <span className="font-medium text-[var(--foreground)] mt-0.5 block">
                    {item.bhk_config}
                  </span>
                </div>
              )}
              {item.facing && (
                <div className="p-2.5 rounded-lg bg-[var(--surface-hover)]">
                  <span className="text-[var(--foreground-muted)] block">Facing</span>
                  <span className="font-medium text-[var(--foreground)] mt-0.5 block">
                    {item.facing}
                  </span>
                </div>
              )}
              {item.tower_name && (
                <div className="p-2.5 rounded-lg bg-[var(--surface-hover)]">
                  <span className="text-[var(--foreground-muted)] block">Tower/Block</span>
                  <span className="font-medium text-[var(--foreground)] mt-0.5 block">
                    {item.tower_name}
                  </span>
                </div>
              )}
              {item.floor_number !== null && item.floor_number !== undefined && (
                <div className="p-2.5 rounded-lg bg-[var(--surface-hover)]">
                  <span className="text-[var(--foreground-muted)] block">Floor</span>
                  <span className="font-medium text-[var(--foreground)] mt-0.5 block">
                    {item.floor_number === 0 ? 'Ground' : `Floor ${item.floor_number}`}
                  </span>
                </div>
              )}
              {item.parking_spaces ? (
                <div className="p-2.5 rounded-lg bg-[var(--surface-hover)]">
                  <span className="text-[var(--foreground-muted)] block">Parking</span>
                  <span className="font-medium text-[var(--foreground)] mt-0.5 block">
                    {item.parking_spaces} slot(s)
                  </span>
                </div>
              ) : null}
              {item.furnishing_status && (
                <div className="p-2.5 rounded-lg bg-[var(--surface-hover)]">
                  <span className="text-[var(--foreground-muted)] block">Furnishing</span>
                  <span className="font-medium text-[var(--foreground)] mt-0.5 block capitalize">
                    {item.furnishing_status}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Internal Notes */}
          {item.internal_notes && (
            <div className="p-4 rounded-lg border border-[var(--border)] bg-[var(--surface-hover)]">
              <span className="text-xs font-semibold text-[var(--foreground-muted)] uppercase tracking-wider block mb-1">
                Internal Remarks
              </span>
              <p className="text-xs text-[var(--foreground)] leading-relaxed whitespace-pre-wrap">
                {item.internal_notes}
              </p>
            </div>
          )}

          {/* Audit Status History Timeline */}
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" /> Status Change Audit History
            </h3>

            {loadingHistory ? (
              <div className="py-6 text-center text-xs text-[var(--foreground-muted)]">
                Loading history...
              </div>
            ) : history.length > 0 ? (
              <div className="border border-[var(--border)] rounded-lg divide-y divide-[var(--border)] text-xs">
                {history.map((h) => (
                  <div key={h.id} className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {h.previous_status ? (
                          <span className="text-[var(--foreground-muted)] font-medium capitalize">
                            {h.previous_status.replace('_', ' ')}
                          </span>
                        ) : (
                          <span className="text-[var(--foreground-subtle)] italic">Created</span>
                        )}
                        <ArrowRight className="w-3 h-3 text-[var(--foreground-subtle)]" />
                        <span className="font-semibold text-[var(--foreground)] capitalize">
                          {h.new_status.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-[11px] text-[var(--foreground-subtle)]">
                        {formatRelative(h.created_at)}
                      </span>
                    </div>

                    <div className="text-[11px] text-[var(--foreground-muted)] flex items-center justify-between pt-0.5">
                      <span className="italic">{h.reason || 'Status updated'}</span>
                      <span className="font-medium text-[var(--foreground)]">
                        by {h.actor?.full_name || 'System'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--foreground-subtle)] italic">
                No previous status changes recorded.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Status Modal Trigger */}
      {showStatusModal && (
        <InventoryStatusDialog
          item={item}
          onClose={() => setShowStatusModal(false)}
          onSuccess={() => {
            if (onUpdateSuccess) onUpdateSuccess()
            onClose()
          }}
        />
      )}

      {/* Edit Details Modal */}
      {showEditModal && (
        <InventoryForm
          projectId={item.project_id}
          defaultCategory={item.category}
          initialItem={item}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            if (onUpdateSuccess) onUpdateSuccess()
            onClose()
          }}
        />
      )}
    </>
  )
}
