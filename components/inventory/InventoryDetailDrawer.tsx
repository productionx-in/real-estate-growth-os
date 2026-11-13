'use client'
// components/inventory/InventoryDetailDrawer.tsx
import { useState, useEffect, useCallback } from 'react'
import {
  X,
  Maximize2,
  History,
  ArrowRight,
  Edit3,
  Pencil,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  Layers,
  Building2,
  DollarSign,
} from 'lucide-react'
import { formatCurrency, formatRelative, formatDate } from '@/lib/utils/format'
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
  item: InventoryItemWithRelations & { hierarchy_path?: string }
  onClose: () => void
  onUpdateSuccess?: () => void
  onNavigate?: (direction: 'prev' | 'next') => void
  hasPrev?: boolean
  hasNext?: boolean
}

export function InventoryDetailDrawer({
  item: initialItem,
  onClose,
  onUpdateSuccess,
  onNavigate,
  hasPrev = false,
  hasNext = false,
}: InventoryDetailDrawerProps) {
  const [detailsOverride, setDetailsOverride] = useState<(Partial<InventoryItemWithRelations> & { hierarchy_path?: string }) | null>(null)
  const [history, setHistory] = useState<InventoryHistoryRecord[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [showStatusModal, setShowStatusModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  const item = detailsOverride && detailsOverride.id === initialItem.id ? { ...initialItem, ...detailsOverride } : initialItem

  const refetch = useCallback(() => {
    fetch(`/api/inventory/${initialItem.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.item) setDetailsOverride(data.item)
        if (data.history) setHistory(data.history)
        setLoadingHistory(false)
      })
      .catch(() => setLoadingHistory(false))
  }, [initialItem.id])

  useEffect(() => {
    let ignore = false
    fetch(`/api/inventory/${initialItem.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          if (data.item) setDetailsOverride(data.item)
          if (data.history) setHistory(data.history)
          setLoadingHistory(false)
        }
      })
      .catch(() => {
        if (!ignore) setLoadingHistory(false)
      })

    return () => {
      ignore = true
    }
  }, [initialItem.id])

  // Keyboard navigation support: Left Arrow for Prev, Right Arrow for Next, Esc for Close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if an input or textarea is active
      const target = e.target as HTMLElement
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return

      if (e.key === 'ArrowLeft' && hasPrev && onNavigate) {
        onNavigate('prev')
      } else if (e.key === 'ArrowRight' && hasNext && onNavigate) {
        onNavigate('next')
      } else if (e.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasPrev, hasNext, onNavigate, onClose])

  const category = item.category
  const isMixedUse = item.project?.category === 'mixed_use'

  // Pricing breakup records (if object)
  const pricingBreakup =
    item.pricing_breakup && typeof item.pricing_breakup === 'object'
      ? (item.pricing_breakup as Record<string, unknown>)
      : null

  // Custom attributes (if object)
  const customAttrs =
    item.custom_attributes && typeof item.custom_attributes === 'object'
      ? (item.custom_attributes as Record<string, unknown>)
      : null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-40 transition-opacity"
        onClick={onClose}
      />

      {/* Drawer panel */}
      <aside aria-label="Inventory Unit Details" className="fixed inset-y-0 right-0 z-40 w-full max-w-xl bg-[var(--surface)] border-l border-[var(--border)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Navigation & Header Toolbar */}
        <div className="p-4 border-b border-[var(--border)] flex items-center justify-between bg-[var(--surface-hover)]">
          <div className="flex items-center gap-1.5">
            {onNavigate && (
              <div className="flex items-center gap-1 mr-2 border-r border-[var(--border)] pr-2">
                <button
                  type="button"
                  onClick={() => onNavigate('prev')}
                  disabled={!hasPrev}
                  className="p-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Previous record (Left Arrow)"
                  aria-label="Previous inventory unit"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('next')}
                  disabled={!hasNext}
                  className="p-1.5 rounded-md text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                  title="Next record (Right Arrow)"
                  aria-label="Next inventory unit"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
              {PROJECT_CATEGORY_LABELS[category] || category}
            </span>
            {isMixedUse && (
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-purple-100 text-purple-800">
                Mixed-Use Component
              </span>
            )}
            {item.is_corner_plot && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                Corner Plot
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--surface)] transition-colors"
              title="Close (Esc)"
              aria-label="Close inventory unit details"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* SECTION A: Basic Information & Status Banner */}
          <div className="space-y-4">
            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="text-2xl font-bold text-[var(--foreground)] tracking-tight">
                  {item.unit_number}
                </h2>
                <InventoryStatusBadge status={item.status} className="text-xs px-3 py-1 font-semibold" />
              </div>

              {/* Project & Hierarchy Breadcrumb */}
              <div className="mt-2 space-y-1">
                <p className="text-xs text-[var(--foreground-muted)] flex items-center gap-1.5 font-medium">
                  <Building2 className="w-3.5 h-3.5 text-[var(--foreground-subtle)]" />
                  <span>{item.project?.name}</span>
                  {item.project?.code && (
                    <span className="text-[11px] text-[var(--foreground-subtle)]">
                      ({item.project.code})
                    </span>
                  )}
                </p>

                {item.hierarchy_path ? (
                  <p className="text-xs text-blue-700 bg-blue-50/70 border border-blue-100 rounded-md px-2.5 py-1 flex items-center gap-1.5 font-medium">
                    <Layers className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <span>{item.hierarchy_path}</span>
                  </p>
                ) : item.tower_name || item.floor_number !== null ? (
                  <p className="text-xs text-[var(--foreground-subtle)] flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>
                      {item.tower_name ? `Tower ${item.tower_name}` : ''}
                      {item.tower_name && item.floor_number !== null ? ' • ' : ''}
                      {item.floor_number !== null && item.floor_number !== undefined
                        ? item.floor_number === 0
                          ? 'Ground Floor'
                          : `Floor ${item.floor_number}`
                        : ''}
                    </span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* Actions Bar */}
            <div className="flex items-center gap-2 pt-1 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={() => setShowEditModal(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors shadow-2xs"
              >
                <Pencil className="w-3.5 h-3.5 text-[var(--foreground-muted)]" />
                <span>Edit Details</span>
              </button>

              <button
                type="button"
                onClick={() => setShowStatusModal(true)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-[var(--brand)] rounded-lg hover:bg-[var(--brand-hover)] transition-colors shadow-2xs"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Change Status</span>
              </button>
            </div>
          </div>

          {/* SECTION B: Property Specifications (Category-Aware) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5">
              <Maximize2 className="w-3.5 h-3.5 text-[var(--brand)]" /> Property Specifications
            </h3>

            {/* Category 1: Apartments */}
            {category === 'apartments' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {item.bhk_config && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Configuration</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.bhk_config}
                    </span>
                  </div>
                )}
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <span className="text-[var(--foreground-muted)] block text-[11px]">Primary Area</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                    {item.area_value} {item.area_unit}
                  </span>
                </div>
                {item.carpet_area && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Carpet Area</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.carpet_area} sqft
                    </span>
                  </div>
                )}
                {item.super_built_up_area && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Super Built-up</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.super_built_up_area} sqft
                    </span>
                  </div>
                )}
                {item.facing && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Facing</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                      {item.facing}
                    </span>
                  </div>
                )}
                {item.balconies !== null && item.balconies !== undefined && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Balconies</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                      {item.balconies}
                    </span>
                  </div>
                )}
                {item.parking_spaces !== undefined && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Parking</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                      {item.parking_spaces} slot(s)
                    </span>
                  </div>
                )}
                {item.furnishing_status && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Furnishing</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block capitalize">
                      {item.furnishing_status}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Category 2: Plotted Developments */}
            {category === 'plotted_developments' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <span className="text-[var(--foreground-muted)] block text-[11px]">Plot Area</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                    {item.plot_area || item.area_value} {item.area_unit}
                  </span>
                </div>
                {item.plot_dimensions && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Dimensions</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.plot_dimensions}
                    </span>
                  </div>
                )}
                {item.road_width_ft && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Road Width</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.road_width_ft} ft
                    </span>
                  </div>
                )}
                {item.facing && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Facing</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                      {item.facing}
                    </span>
                  </div>
                )}
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <span className="text-[var(--foreground-muted)] block text-[11px]">Corner Plot</span>
                  <span className={`font-semibold mt-0.5 block ${item.is_corner_plot ? 'text-amber-700' : 'text-[var(--foreground)]'}`}>
                    {item.is_corner_plot ? 'Yes (Corner)' : 'Regular Plot'}
                  </span>
                </div>
              </div>
            )}

            {/* Category 3: Commercial Sale Properties */}
            {category === 'commercial_sale' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {item.commercial_asset_type && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Asset Type</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.commercial_asset_type}
                    </span>
                  </div>
                )}
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <span className="text-[var(--foreground-muted)] block text-[11px]">Primary Area</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                    {item.area_value} {item.area_unit}
                  </span>
                </div>
                {item.carpet_area && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Carpet Area</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.carpet_area} sqft
                    </span>
                  </div>
                )}
                {item.super_built_up_area && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Super Built-up</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.super_built_up_area} sqft
                    </span>
                  </div>
                )}
                {item.floor_number !== null && item.floor_number !== undefined && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Floor</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                      {item.floor_number === 0 ? 'Ground' : `Floor ${item.floor_number}`}
                    </span>
                  </div>
                )}
                {item.parking_spaces !== undefined && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Parking</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                      {item.parking_spaces} slots
                    </span>
                  </div>
                )}
                {item.furnishing_status && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Furnishing</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block capitalize">
                      {item.furnishing_status}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Category 4: Villas & Gated Communities */}
            {category === 'villas_gated_communities' && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                {item.bhk_config && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Typology</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.bhk_config} Villa
                    </span>
                  </div>
                )}
                <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                  <span className="text-[var(--foreground-muted)] block text-[11px]">Built-up Area</span>
                  <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                    {item.area_value} {item.area_unit}
                  </span>
                </div>
                {item.plot_area && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Plot Area</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block text-sm">
                      {item.plot_area} sqyd
                    </span>
                  </div>
                )}
                {item.facing && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Facing</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                      {item.facing}
                    </span>
                  </div>
                )}
                {item.parking_spaces !== undefined && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Private Parking</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block">
                      {item.parking_spaces} slot(s)
                    </span>
                  </div>
                )}
                {item.furnishing_status && (
                  <div className="p-3 rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                    <span className="text-[var(--foreground-muted)] block text-[11px]">Handover Status</span>
                    <span className="font-semibold text-[var(--foreground)] mt-0.5 block capitalize">
                      {item.furnishing_status}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SECTION C: Pricing Details */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Pricing & Commercials
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-[var(--border)] bg-emerald-50/30">
                <span className="text-xs text-[var(--foreground-muted)] font-medium block">
                  Total Price
                </span>
                <span className="text-xl font-bold text-emerald-700 mt-1 block">
                  {item.total_price ? formatCurrency(Number(item.total_price)) : 'Price on Request'}
                </span>
              </div>
              <div className="p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)]">
                <span className="text-xs text-[var(--foreground-muted)] font-medium block">
                  Base Rate
                </span>
                <span className="text-xl font-semibold text-[var(--foreground)] mt-1 block">
                  {item.base_rate
                    ? `${formatCurrency(Number(item.base_rate))} / ${item.area_unit}`
                    : '—'}
                </span>
              </div>
            </div>

            {/* Modular Pricing Breakup if present */}
            {pricingBreakup && Object.keys(pricingBreakup).length > 0 && (
              <div className="border border-[var(--border)] rounded-xl p-3.5 bg-[var(--surface-hover)] space-y-2">
                <span className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider block">
                  Price Breakdown
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(pricingBreakup).map(([k, v]) => (
                    <div key={k} className="flex justify-between py-1 border-b border-[var(--border)]/60">
                      <span className="text-[var(--foreground-muted)] capitalize">{k.replace(/_/g, ' ')}</span>
                      <span className="font-medium text-[var(--foreground)]">
                        {typeof v === 'number' ? formatCurrency(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* SECTION D: Internal Information (Restricted) */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600" /> Internal Information
            </h3>

            {item.internal_notes ? (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-200/80 text-amber-900">
                    Restricted • Team Only
                  </span>
                </div>
                <p className="text-xs text-amber-950 leading-relaxed whitespace-pre-wrap pt-1 font-mono">
                  {item.internal_notes}
                </p>
              </div>
            ) : (
              <p className="text-xs text-[var(--foreground-subtle)] italic bg-[var(--surface-hover)] p-3 rounded-lg border border-[var(--border)]">
                No internal notes recorded for this unit.
              </p>
            )}

            {/* Custom Attributes / Key-Value metadata */}
            {customAttrs && Object.keys(customAttrs).length > 0 && (
              <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface)] space-y-2">
                <span className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider block">
                  Custom Attributes
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(customAttrs).map(([k, v]) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-md bg-[var(--surface-hover)] border border-[var(--border)] text-[var(--foreground)]"
                    >
                      <span className="text-[var(--foreground-muted)] capitalize">{k.replace(/_/g, ' ')}:</span>
                      <span className="font-semibold">{String(v)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex items-center justify-between text-[11px] text-[var(--foreground-subtle)] px-1">
            <span>Created {formatDate(item.created_at)}</span>
            <span>Updated {formatRelative(item.updated_at)}</span>
          </div>

          {/* SECTION E: Status Change Audit History */}
          <div className="space-y-3 pt-2 border-t border-[var(--border)]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5">
              <History className="w-3.5 h-3.5 text-[var(--foreground-muted)]" /> Status Change Audit History
            </h3>

            {loadingHistory ? (
              <div className="py-6 text-center text-xs text-[var(--foreground-muted)]">
                Loading history...
              </div>
            ) : history.length > 0 ? (
              <div className="border border-[var(--border)] rounded-xl divide-y divide-[var(--border)] text-xs bg-[var(--surface)] overflow-hidden shadow-2xs">
                {history.map((h) => (
                  <div key={h.id} className="p-3.5 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {h.previous_status ? (
                          <span className="text-[var(--foreground-muted)] font-medium capitalize text-[11px]">
                            {h.previous_status.replace('_', ' ')}
                          </span>
                        ) : (
                          <span className="text-[var(--foreground-subtle)] italic text-[11px]">
                            Initial Record
                          </span>
                        )}
                        <ArrowRight className="w-3 h-3 text-[var(--foreground-subtle)]" />
                        <span className="font-semibold text-[var(--foreground)] capitalize text-xs">
                          {h.new_status.replace('_', ' ')}
                        </span>
                      </div>
                      <span className="text-[11px] text-[var(--foreground-subtle)] font-medium">
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
      </aside>

      {/* Status Modal Trigger */}
      {showStatusModal && (
        <InventoryStatusDialog
          item={item}
          onClose={() => setShowStatusModal(false)}
          onSuccess={() => {
            if (onUpdateSuccess) onUpdateSuccess()
            refetch()
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
            refetch()
          }}
        />
      )}
    </>
  )
}
