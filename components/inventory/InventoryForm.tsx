'use client'
// components/inventory/InventoryForm.tsx
// Category-Aware Inventory Creation & Editing Modal (Stage 3C)
import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  X,
  Loader2,
  AlertCircle,
  Building2,
  Layers,
  Sparkles,
  Tag,
  CheckCircle2,
  FolderTree,
  MapPin,
} from 'lucide-react'
import {
  PROJECT_CATEGORY_LABELS,
  type ProjectCategory,
  type InventoryItemWithRelations,
} from '@/types/inventory'
import { HierarchyNodeSelector, type FlatHierarchyNode } from './HierarchyNodeSelector'

interface InventoryFormProps {
  projectId: string
  defaultCategory: ProjectCategory
  initialItem?: InventoryItemWithRelations | null
  onClose: () => void
  onSuccess?: () => void
}

const FACING_OPTIONS = [
  'East',
  'West',
  'North',
  'South',
  'North-East',
  'South-East',
  'North-West',
  'South-West',
]

const BHK_OPTIONS = ['1BHK', '2BHK', '2.5BHK', '3BHK', '3.5BHK', '4BHK', '5BHK+']

const COMMERCIAL_ASSET_TYPES = [
  'Office Space',
  'Retail Shop',
  'Showroom',
  'Commercial Suite',
  'Bare Shell',
  'Warehouse / Storage',
]

const FURNISHING_OPTIONS = [
  { value: 'unfurnished', label: 'Unfurnished / Bare Shell' },
  { value: 'semi-furnished', label: 'Semi-Furnished' },
  { value: 'fully-furnished', label: 'Fully Furnished' },
]

const MIXED_USE_ALLOWED_CATEGORIES: { value: ProjectCategory; label: string }[] = [
  { value: 'apartments', label: 'Apartment / Flat' },
  { value: 'commercial_sale', label: 'Commercial Suite / Retail' },
  { value: 'plotted_developments', label: 'Plot / Land' },
  { value: 'villas_gated_communities', label: 'Villa' },
]

export function InventoryForm({
  projectId,
  defaultCategory,
  initialItem,
  onClose,
  onSuccess,
}: InventoryFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [successNotice, setSuccessNotice] = useState<string | null>(null)

  const isEditing = !!initialItem

  // In mixed-use projects, the unit category can be selected independently
  const isMixedUseProject = defaultCategory === 'mixed_use'

  // Active Category for this specific unit
  const [unitCategory, setUnitCategory] = useState<ProjectCategory>(
    initialItem?.category ?? (isMixedUseProject ? 'apartments' : defaultCategory)
  )

  // Hierarchy Node State
  const [hierarchyNodeId, setHierarchyNodeId] = useState<string | null>(
    initialItem?.hierarchy_node_id ?? null
  )

  // Basic Information
  const [unitNumber, setUnitNumber] = useState(initialItem?.unit_number ?? '')
  const [facing, setFacing] = useState(initialItem?.facing ?? 'East')
  const [furnishingStatus, setFurnishingStatus] = useState(
    initialItem?.furnishing_status ?? 'unfurnished'
  )

  // Hierarchy Location Fallback / Text Sync
  const [towerName, setTowerName] = useState(initialItem?.tower_name ?? '')
  const [floorNumber, setFloorNumber] = useState<string>(
    initialItem?.floor_number !== null && initialItem?.floor_number !== undefined
      ? String(initialItem.floor_number)
      : ''
  )

  // Category Specific: Apartments & Villas
  const [bhkConfig, setBhkConfig] = useState(initialItem?.bhk_config ?? '3BHK')
  const [bedrooms, setBedrooms] = useState<string>(
    initialItem?.bedrooms !== null && initialItem?.bedrooms !== undefined
      ? String(initialItem.bedrooms)
      : '3'
  )
  const [bathrooms, setBathrooms] = useState<string>(
    initialItem?.bathrooms !== null && initialItem?.bathrooms !== undefined
      ? String(initialItem.bathrooms)
      : '3'
  )
  const [balconies, setBalconies] = useState<string>(
    initialItem?.balconies !== null && initialItem?.balconies !== undefined
      ? String(initialItem.balconies)
      : '1'
  )
  const [parkingSpaces, setParkingSpaces] = useState<string>(
    initialItem?.parking_spaces !== null && initialItem?.parking_spaces !== undefined
      ? String(initialItem.parking_spaces)
      : '1'
  )

  // Category Specific: Plots
  const [plotDimensions, setPlotDimensions] = useState(initialItem?.plot_dimensions ?? '')
  const [roadWidthFt, setRoadWidthFt] = useState<string>(
    initialItem?.road_width_ft !== null && initialItem?.road_width_ft !== undefined
      ? String(initialItem.road_width_ft)
      : '40'
  )
  const [isCornerPlot, setIsCornerPlot] = useState(initialItem?.is_corner_plot ?? false)

  // Category Specific: Commercial Sale
  const [commercialAssetType, setCommercialAssetType] = useState(
    initialItem?.commercial_asset_type ?? 'Office Space'
  )

  // Area & Measurements
  const [areaValue, setAreaValue] = useState<string>(
    initialItem?.area_value ? String(initialItem.area_value) : ''
  )
  const [areaUnit, setAreaUnit] = useState<string>(
    initialItem?.area_unit ??
      (unitCategory === 'plotted_developments' ? 'sqyd' : 'sqft')
  )
  const [carpetArea, setCarpetArea] = useState<string>(
    initialItem?.carpet_area ? String(initialItem.carpet_area) : ''
  )
  const [superBuiltUpArea, setSuperBuiltUpArea] = useState<string>(
    initialItem?.super_built_up_area ? String(initialItem.super_built_up_area) : ''
  )
  const [plotArea, setPlotArea] = useState<string>(
    initialItem?.plot_area ? String(initialItem.plot_area) : ''
  )

  // Pricing
  const [baseRate, setBaseRate] = useState<string>(
    initialItem?.base_rate ? String(initialItem.base_rate) : ''
  )
  const [totalPrice, setTotalPrice] = useState<string>(
    initialItem?.total_price ? String(initialItem.total_price) : ''
  )
  const [internalNotes, setInternalNotes] = useState(initialItem?.internal_notes ?? '')

  // Custom Attributes (e.g. Frontage for commercial, villa floors count)
  const existingAttrs = (initialItem?.custom_attributes &&
    typeof initialItem.custom_attributes === 'object' &&
    !Array.isArray(initialItem.custom_attributes)
    ? initialItem.custom_attributes
    : {}) as Record<string, unknown>

  const [frontageFt, setFrontageFt] = useState<string>(
    existingAttrs.frontage_ft ? String(existingAttrs.frontage_ft) : ''
  )
  const [villaFloors, setVillaFloors] = useState<string>(
    existingAttrs.villa_floors ? String(existingAttrs.villa_floors) : 'G+1'
  )

  const switchCategory = (newCat: ProjectCategory) => {
    setUnitCategory(newCat)
    if (!initialItem) {
      if (newCat === 'plotted_developments') {
        setAreaUnit('sqyd')
      } else {
        setAreaUnit('sqft')
      }
    }
  }

  // Handle Hierarchy Node Selection
  const handleHierarchyChange = (nodeId: string | null, node: FlatHierarchyNode | null) => {
    setHierarchyNodeId(nodeId)
    if (node) {
      const type = node.node_type.toLowerCase()
      if (type === 'tower' || type === 'building' || type === 'block') {
        setTowerName(node.name)
      } else if (type === 'floor') {
        // Try extracting numbers from "Floor 4" or "4th Floor"
        const num = node.name.match(/\d+/)
        if (num) setFloorNumber(num[0])
      }
    }
  }

  // Handle Form Submission
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!unitNumber.trim()) {
      setError(
        unitCategory === 'plotted_developments'
          ? 'Plot number is required.'
          : unitCategory === 'villas_gated_communities'
          ? 'Villa number is required.'
          : 'Unit / Suite number is required.'
      )
      return
    }

    if (!areaValue || Number(areaValue) <= 0) {
      setError('Please provide a valid positive area measurement.')
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const custom_attributes: Record<string, unknown> = {
          ...existingAttrs,
        }
        if (unitCategory === 'commercial_sale' && frontageFt) {
          custom_attributes.frontage_ft = Number(frontageFt)
        }
        if (unitCategory === 'villas_gated_communities' && villaFloors) {
          custom_attributes.villa_floors = villaFloors
        }

        const payload = {
          project_id: projectId,
          category: unitCategory,
          hierarchy_node_id: hierarchyNodeId || null,
          unit_number: unitNumber.trim(),
          area_value: Number(areaValue),
          area_unit: areaUnit,
          carpet_area: carpetArea ? Number(carpetArea) : null,
          built_up_area:
            unitCategory === 'apartments' ||
            unitCategory === 'commercial_sale' ||
            unitCategory === 'villas_gated_communities'
              ? Number(areaValue)
              : null,
          super_built_up_area: superBuiltUpArea ? Number(superBuiltUpArea) : null,
          plot_area:
            unitCategory === 'plotted_developments'
              ? Number(areaValue)
              : plotArea
              ? Number(plotArea)
              : null,
          plot_dimensions:
            unitCategory === 'plotted_developments' ? plotDimensions.trim() || null : null,
          road_width_ft:
            unitCategory === 'plotted_developments' && roadWidthFt
              ? Number(roadWidthFt)
              : null,
          is_corner_plot: unitCategory === 'plotted_developments' ? isCornerPlot : false,
          facing: facing || null,
          bhk_config:
            unitCategory === 'apartments' || unitCategory === 'villas_gated_communities'
              ? bhkConfig
              : null,
          tower_name: towerName.trim() || null,
          floor_number: floorNumber !== '' ? Number(floorNumber) : null,
          commercial_asset_type:
            unitCategory === 'commercial_sale' ? commercialAssetType : null,
          bedrooms:
            unitCategory === 'apartments' || unitCategory === 'villas_gated_communities'
              ? Number(bedrooms)
              : null,
          bathrooms:
            unitCategory === 'apartments' || unitCategory === 'villas_gated_communities'
              ? Number(bathrooms)
              : null,
          balconies: unitCategory === 'apartments' ? Number(balconies) : null,
          parking_spaces: parkingSpaces ? Number(parkingSpaces) : 0,
          furnishing_status: furnishingStatus,
          base_rate: baseRate ? Number(baseRate) : null,
          total_price: totalPrice ? Number(totalPrice) : null,
          pricing_breakup: {},
          internal_notes: internalNotes.trim() || null,
          custom_attributes,
        }

        const endpoint = isEditing ? `/api/inventory/${initialItem!.id}` : '/api/inventory'
        const method = isEditing ? 'PUT' : 'POST'

        const res = await fetch(endpoint, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(data.error ?? (isEditing ? 'Failed to update unit' : 'Failed to add unit'))
          return
        }

        setSuccessNotice(
          isEditing
            ? `Unit "${unitNumber.trim()}" updated successfully!`
            : `Unit "${unitNumber.trim()}" created successfully!`
        )

        router.refresh()
        if (onSuccess) onSuccess()

        setTimeout(() => {
          onClose()
        }, 600)
      } catch {
        setError('Network error. Failed to save inventory unit.')
      }
    })
  }

  // Label helpers based on category
  const unitNumberLabel = useMemo(() => {
    switch (unitCategory) {
      case 'plotted_developments':
        return 'Plot / Survey Number'
      case 'villas_gated_communities':
        return 'Villa Number'
      case 'commercial_sale':
        return 'Commercial Unit / Suite No.'
      default:
        return 'Unit / Flat Number'
    }
  }, [unitCategory])

  const hierarchyLabel = useMemo(() => {
    switch (unitCategory) {
      case 'plotted_developments':
        return 'Block / Sector Location'
      case 'villas_gated_communities':
        return 'Cluster / Street Location'
      case 'commercial_sale':
        return 'Building / Wing / Floor Location'
      default:
        return 'Tower & Floor Location'
    }
  }, [unitCategory])

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-[var(--surface-muted)]">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-blue-50 text-[var(--brand)] border border-blue-100">
                <Building2 className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  {isEditing ? `Edit Inventory Unit: ${initialItem!.unit_number}` : 'Add Inventory Record'}
                </h2>
                <p className="text-xs text-[var(--foreground-muted)]">
                  {PROJECT_CATEGORY_LABELS[unitCategory]} specifications and location
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
            {error && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-600" />
                <span>{error}</span>
              </div>
            )}

            {successNotice && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                <span>{successNotice}</span>
              </div>
            )}

            {/* Mixed-Use Dynamic Component Selection */}
            {isMixedUseProject && (
              <div className="p-3.5 rounded-xl bg-blue-50/50 border border-blue-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--brand)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Mixed-Use Component Category
                  </span>
                  <span className="text-[11px] text-[var(--foreground-muted)]">
                    Adapts specifications to selected asset type
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {MIXED_USE_ALLOWED_CATEGORIES.map((cat) => {
                    const selected = unitCategory === cat.value
                    return (
                      <button
                        key={cat.value}
                        type="button"
                        onClick={() => switchCategory(cat.value)}
                        className={`px-3 py-1.5 rounded-lg border text-center font-medium transition-all ${
                          selected
                            ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                            : 'bg-[var(--surface)] text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
                        }`}
                      >
                        {cat.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* SECTION 1: Identity & Hierarchy Location */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-1 border-b border-[var(--border)]">
                <FolderTree className="w-3.5 h-3.5 text-[var(--brand)]" />
                1. Unit Identity & Hierarchy Node
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">
                    {unitNumberLabel} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    placeholder={
                      unitCategory === 'plotted_developments'
                        ? 'e.g. Plot 104'
                        : unitCategory === 'villas_gated_communities'
                        ? 'e.g. Villa 22'
                        : unitCategory === 'commercial_sale'
                        ? 'e.g. Suite 302'
                        : 'e.g. A-402'
                    }
                    className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)] font-semibold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">
                    {hierarchyLabel}
                  </label>
                  <HierarchyNodeSelector
                    projectId={projectId}
                    value={hierarchyNodeId}
                    onChange={handleHierarchyChange}
                  />
                </div>
              </div>

              {/* Text Fallbacks for Tower / Block / Floor */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">
                    {unitCategory === 'plotted_developments'
                      ? 'Block / Sector'
                      : unitCategory === 'villas_gated_communities'
                      ? 'Cluster / Street'
                      : 'Tower / Building'}
                  </label>
                  <input
                    type="text"
                    value={towerName}
                    onChange={(e) => setTowerName(e.target.value)}
                    placeholder={
                      unitCategory === 'plotted_developments'
                        ? 'e.g. Block C'
                        : unitCategory === 'villas_gated_communities'
                        ? 'e.g. Palm Street'
                        : 'e.g. Tower 1'
                    }
                    className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                  />
                </div>

                {unitCategory !== 'plotted_developments' && (
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground-muted)]">Floor Number</label>
                    <input
                      type="number"
                      value={floorNumber}
                      onChange={(e) => setFloorNumber(e.target.value)}
                      placeholder="e.g. 4"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground-muted)]">Facing</label>
                  <select
                    value={facing}
                    onChange={(e) => setFacing(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                  >
                    {FACING_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f} Facing
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* SECTION 2: Category Specific Specifications */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-1 border-b border-[var(--border)]">
                <Layers className="w-3.5 h-3.5 text-[var(--brand)]" />
                2. {PROJECT_CATEGORY_LABELS[unitCategory]} Specifications
              </h3>

              {/* 1. Apartments Specific */}
              {unitCategory === 'apartments' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">BHK Layout</label>
                    <select
                      value={bhkConfig}
                      onChange={(e) => setBhkConfig(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    >
                      {BHK_OPTIONS.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Bedrooms</label>
                    <input
                      type="number"
                      min="0"
                      value={bedrooms}
                      onChange={(e) => setBedrooms(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Bathrooms</label>
                    <input
                      type="number"
                      min="0"
                      value={bathrooms}
                      onChange={(e) => setBathrooms(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Balconies</label>
                    <input
                      type="number"
                      min="0"
                      value={balconies}
                      onChange={(e) => setBalconies(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                </div>
              )}

              {/* 2. Plotted Developments Specific */}
              {unitCategory === 'plotted_developments' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Plot Dimensions</label>
                    <input
                      type="text"
                      value={plotDimensions}
                      onChange={(e) => setPlotDimensions(e.target.value)}
                      placeholder="e.g. 33 ft x 50 ft"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Road Width (Feet)</label>
                    <input
                      type="number"
                      min="0"
                      value={roadWidthFt}
                      onChange={(e) => setRoadWidthFt(e.target.value)}
                      placeholder="e.g. 40"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      id="isCornerPlot"
                      checked={isCornerPlot}
                      onChange={(e) => setIsCornerPlot(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
                    />
                    <label htmlFor="isCornerPlot" className="font-medium text-[var(--foreground)] cursor-pointer">
                      Corner Plot (Premium)
                    </label>
                  </div>
                </div>
              )}

              {/* 3. Commercial Sale Specific */}
              {unitCategory === 'commercial_sale' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Commercial Asset Type</label>
                    <select
                      value={commercialAssetType}
                      onChange={(e) => setCommercialAssetType(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    >
                      {COMMERCIAL_ASSET_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Frontage / Display (Feet)</label>
                    <input
                      type="number"
                      min="0"
                      value={frontageFt}
                      onChange={(e) => setFrontageFt(e.target.value)}
                      placeholder="e.g. 35"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Fit-out / Handover State</label>
                    <select
                      value={furnishingStatus}
                      onChange={(e) => setFurnishingStatus(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    >
                      {FURNISHING_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 4. Villas Specific */}
              {unitCategory === 'villas_gated_communities' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Villa Typology</label>
                    <select
                      value={bhkConfig}
                      onChange={(e) => setBhkConfig(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    >
                      <option value="3BHK Villa">3BHK Villa</option>
                      <option value="4BHK Villa">4BHK Villa</option>
                      <option value="4BHK Triplex">4BHK Triplex</option>
                      <option value="5BHK Luxury">5BHK Luxury</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Number of Floors</label>
                    <input
                      type="text"
                      value={villaFloors}
                      onChange={(e) => setVillaFloors(e.target.value)}
                      placeholder="e.g. G+1 or Triplex"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Bathrooms</label>
                    <input
                      type="number"
                      min="0"
                      value={bathrooms}
                      onChange={(e) => setBathrooms(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground)]">Car Parking Slots</label>
                    <input
                      type="number"
                      min="0"
                      value={parkingSpaces}
                      onChange={(e) => setParkingSpaces(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* SECTION 3: Area & Measurements */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-1 border-b border-[var(--border)]">
                <MapPin className="w-3.5 h-3.5 text-[var(--brand)]" />
                3. Area & Measurements
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">
                    {unitCategory === 'plotted_developments' ? 'Plot Area' : 'Primary Saleable Area'}{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      required
                      min="0.1"
                      value={areaValue}
                      onChange={(e) => setAreaValue(e.target.value)}
                      placeholder={unitCategory === 'plotted_developments' ? 'e.g. 240' : 'e.g. 1850'}
                      className="flex-1 px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)] font-semibold"
                    />
                    <select
                      value={areaUnit}
                      onChange={(e) => setAreaUnit(e.target.value)}
                      className="w-24 px-2 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    >
                      <option value="sqft">Sq. Ft</option>
                      <option value="sqyd">Sq. Yd</option>
                      <option value="acres">Acres</option>
                      <option value="guntas">Guntas</option>
                      <option value="cents">Cents</option>
                    </select>
                  </div>
                </div>

                {unitCategory !== 'plotted_developments' && (
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground-muted)]">Carpet Area (Sq. Ft)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={carpetArea}
                      onChange={(e) => setCarpetArea(e.target.value)}
                      placeholder="e.g. 1350"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                )}

                {unitCategory === 'villas_gated_communities' && (
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground-muted)]">Plot Extent (Sq. Yd)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={plotArea}
                      onChange={(e) => setPlotArea(e.target.value)}
                      placeholder="e.g. 350"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                )}

                {unitCategory !== 'plotted_developments' && (
                  <div className="space-y-1">
                    <label className="font-medium text-[var(--foreground-muted)]">Super Built-up (Sq. Ft)</label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={superBuiltUpArea}
                      onChange={(e) => setSuperBuiltUpArea(e.target.value)}
                      placeholder="e.g. 1950"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 4: Modular Pricing */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-1 border-b border-[var(--border)]">
                <Tag className="w-3.5 h-3.5 text-[var(--brand)]" />
                4. Pricing & Commercials
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">
                    Base Rate ({areaUnit === 'sqyd' ? '₹ per sq.yd' : '₹ per sq.ft'})
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={baseRate}
                    onChange={(e) => {
                      setBaseRate(e.target.value)
                      // Auto-compute total price if not manually locked
                      if (e.target.value && areaValue) {
                        const calculated = Number(e.target.value) * Number(areaValue)
                        setTotalPrice(String(Math.round(calculated)))
                      }
                    }}
                    placeholder="e.g. 6500"
                    className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-medium text-[var(--foreground)]">Total Price (₹)</label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={totalPrice}
                    onChange={(e) => setTotalPrice(e.target.value)}
                    placeholder="e.g. 12025000"
                    className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)] font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 5: Internal Notes */}
            <div className="space-y-2">
              <label className="font-medium text-[var(--foreground)]">Internal Notes & Description</label>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Special attributes, park view premium, developer reserved, or custom payment plan terms..."
                className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-4 py-2 text-xs font-medium rounded-lg border border-[var(--border)] text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-5 py-2 text-xs font-semibold rounded-lg bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)] transition-colors shadow-2xs disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isEditing ? 'Save Changes' : 'Create Inventory Unit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
