'use client'
// components/inventory/InventoryForm.tsx
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, Loader2, AlertCircle } from 'lucide-react'
import {
  PROJECT_CATEGORY_LABELS,
  type ProjectCategory,
} from '@/types/inventory'

interface InventoryFormProps {
  projectId: string
  defaultCategory: ProjectCategory
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

export function InventoryForm({
  projectId,
  defaultCategory,
  onClose,
  onSuccess,
}: InventoryFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [category, setCategory] = useState<ProjectCategory>(defaultCategory)
  const [unitNumber, setUnitNumber] = useState('')
  const [towerName, setTowerName] = useState('')
  const [floorNumber, setFloorNumber] = useState<string>('')
  const [bhkConfig, setBhkConfig] = useState('3BHK')
  const [facing, setFacing] = useState('East')
  const [areaValue, setAreaValue] = useState('')
  const [areaUnit, setAreaUnit] = useState(
    category === 'plotted_developments' ? 'sqyd' : 'sqft'
  )
  const [carpetArea, setCarpetArea] = useState('')
  const [superBuiltUpArea, setSuperBuiltUpArea] = useState('')
  const [plotDimensions, setPlotDimensions] = useState('')
  const [roadWidthFt, setRoadWidthFt] = useState('')
  const [isCornerPlot, setIsCornerPlot] = useState(false)
  const [commercialAssetType, setCommercialAssetType] = useState('Office')
  const [baseRate, setBaseRate] = useState('')
  const [totalPrice, setTotalPrice] = useState('')
  const [internalNotes, setInternalNotes] = useState('')

  const isPlot = category === 'plotted_developments'
  const isCommercial = category === 'commercial_sale'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!unitNumber.trim()) {
      setError('Unit or Plot number is required.')
      return
    }
    if (!areaValue || Number(areaValue) <= 0) {
      setError('Please provide a valid area measurement.')
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const payload = {
          project_id: projectId,
          category,
          unit_number: unitNumber.trim(),
          area_value: Number(areaValue),
          area_unit: areaUnit,
          carpet_area: carpetArea ? Number(carpetArea) : null,
          super_built_up_area: superBuiltUpArea ? Number(superBuiltUpArea) : null,
          plot_dimensions: isPlot ? plotDimensions : null,
          road_width_ft: isPlot && roadWidthFt ? Number(roadWidthFt) : null,
          is_corner_plot: isPlot ? isCornerPlot : false,
          facing,
          bhk_config: !isPlot && !isCommercial ? bhkConfig : null,
          tower_name: towerName.trim() || (isPlot ? 'Block A' : 'Tower 1'),
          floor_number: floorNumber !== '' ? Number(floorNumber) : null,
          commercial_asset_type: isCommercial ? commercialAssetType : null,
          base_rate: baseRate ? Number(baseRate) : null,
          total_price: totalPrice ? Number(totalPrice) : null,
          internal_notes: internalNotes.trim() || null,
        }

        const res = await fetch('/api/inventory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })

        const data = await res.json()
        if (!res.ok) {
          setError(data.error ?? 'Failed to add inventory unit')
          return
        }

        router.refresh()
        if (onSuccess) onSuccess()
        onClose()
      } catch {
        setError('Network error. Failed to add unit.')
      }
    })
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-[1px] z-50"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)] bg-[var(--surface-hover)]">
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">
                Add Inventory Record
              </h2>
              <p className="text-xs text-[var(--foreground-muted)]">
                Create a single unit, plot, or commercial property
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-md flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface)]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Form fields */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-[var(--danger-bg)] border border-red-200 text-xs text-[var(--danger)] flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Category selection */}
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                Project Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ProjectCategory)}
                className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
              >
                {(Object.keys(PROJECT_CATEGORY_LABELS) as ProjectCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {PROJECT_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>

            {/* Unit Number & Tower / Block */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  {isPlot ? 'Plot Number' : 'Unit / Flat Number'} <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  placeholder={isPlot ? 'e.g. Plot 104' : 'e.g. A-402'}
                  className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  {isPlot ? 'Block / Sector' : 'Tower / Building'}
                </label>
                <input
                  type="text"
                  value={towerName}
                  onChange={(e) => setTowerName(e.target.value)}
                  placeholder={isPlot ? 'e.g. Block B' : 'e.g. Tower 1'}
                  className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                />
              </div>
            </div>

            {/* Configuration / Floor for vertical */}
            {!isPlot && (
              <div className="grid grid-cols-2 gap-3">
                {!isCommercial ? (
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                      BHK Configuration
                    </label>
                    <select
                      value={bhkConfig}
                      onChange={(e) => setBhkConfig(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    >
                      {BHK_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                      Commercial Asset Type
                    </label>
                    <select
                      value={commercialAssetType}
                      onChange={(e) => setCommercialAssetType(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                    >
                      <option value="Office">Office Space</option>
                      <option value="Retail">Retail Shop</option>
                      <option value="Showroom">Showroom</option>
                      <option value="Warehouse">Warehouse / Industrial</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                    Floor Number
                  </label>
                  <input
                    type="number"
                    value={floorNumber}
                    onChange={(e) => setFloorNumber(e.target.value)}
                    placeholder="e.g. 4"
                    className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                  />
                </div>
              </div>
            )}

            {/* Area and Dimensions */}
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  Primary Area <span className="text-[var(--danger)]">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    required
                    min="1"
                    value={areaValue}
                    onChange={(e) => setAreaValue(e.target.value)}
                    placeholder="e.g. 1650"
                    className="flex-1 px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                  />
                  <select
                    value={areaUnit}
                    onChange={(e) => setAreaUnit(e.target.value)}
                    className="w-24 px-2 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                  >
                    <option value="sqft">Sq. Ft</option>
                    <option value="sqyd">Sq. Yd</option>
                    <option value="acres">Acres</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  Facing
                </label>
                <select
                  value={facing}
                  onChange={(e) => setFacing(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                >
                  {FACING_OPTIONS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Plot Specific Fields */}
            {isPlot && (
              <div className="p-3.5 rounded-lg border border-[var(--border)] bg-amber-50/30 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                      Plot Dimensions
                    </label>
                    <input
                      type="text"
                      value={plotDimensions}
                      onChange={(e) => setPlotDimensions(e.target.value)}
                      placeholder="e.g. 30 x 50"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                      Road Width (Feet)
                    </label>
                    <input
                      type="number"
                      value={roadWidthFt}
                      onChange={(e) => setRoadWidthFt(e.target.value)}
                      placeholder="e.g. 40"
                      className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={isCornerPlot}
                    onChange={(e) => setIsCornerPlot(e.target.checked)}
                    className="rounded text-[var(--brand)]"
                  />
                  <span>Is Corner Plot</span>
                </label>
              </div>
            )}

            {/* Price inputs */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  Base Rate (₹ per unit area)
                </label>
                <input
                  type="number"
                  value={baseRate}
                  onChange={(e) => setBaseRate(e.target.value)}
                  placeholder="e.g. 6500"
                  className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                  Total Expected Price (₹)
                </label>
                <input
                  type="number"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  placeholder="e.g. 10500000"
                  className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)]"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-[var(--foreground)] mb-1">
                Internal Remarks (Optional)
              </label>
              <textarea
                rows={2}
                value={internalNotes}
                onChange={(e) => setInternalNotes(e.target.value)}
                placeholder="Key specifications, premium location, park facing..."
                className="w-full px-3 py-2 text-xs bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none resize-none"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-lg hover:bg-[var(--surface-hover)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[var(--brand)] rounded-lg hover:bg-[var(--brand-hover)] disabled:opacity-50"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {isPending ? 'Saving...' : 'Add Inventory Unit'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
