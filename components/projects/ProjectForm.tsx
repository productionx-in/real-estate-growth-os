'use client'
// components/projects/ProjectForm.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Building2,
  MapPin,
  Calendar,
  Layers,
  Sparkles,
  Link2,
  Loader2,
  Check,
  ArrowLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { ProjectFormValues } from '@/lib/validations/project'
import { PROJECT_CATEGORY_LABELS, type ProjectCategory } from '@/types/inventory'

interface ProjectFormProps {
  orgSlug: string
  orgId?: string
  defaultValues?: Partial<ProjectFormValues>
  projectId?: string
}

const inputClass =
  'w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors placeholder:text-[var(--foreground-subtle)]'

const CATEGORY_OPTIONS: { value: ProjectCategory; label: string; desc: string }[] = [
  {
    value: 'apartments',
    label: 'Apartments',
    desc: 'High-rise & mid-rise towers with residential units',
  },
  {
    value: 'plotted_developments',
    label: 'Plotted Developments',
    desc: 'Open plotted layouts, phases, blocks & residential plots',
  },
  {
    value: 'commercial_sale',
    label: 'Commercial Sale',
    desc: 'Office spaces, retail shops & commercial suites for outright sale',
  },
  {
    value: 'villas_gated_communities',
    label: 'Villas & Gated Communities',
    desc: 'Independent villas, row houses & gated luxury clusters',
  },
  {
    value: 'mixed_use',
    label: 'Mixed-Use Developments',
    desc: 'Integrated townships combining residential, commercial & retail',
  },
]

const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planning' },
  { value: 'pre_launch', label: 'Pre-launch' },
  { value: 'launched', label: 'Launched' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
] as const

const STANDARD_AMENITIES = [
  'Clubhouse',
  'Swimming Pool',
  'Gymnasium',
  '24/7 Security & CCTV',
  'Landscaped Gardens',
  'Children’s Play Area',
  'Jogging / Walking Track',
  '100% Power Backup',
  'Rainwater Harvesting',
  'Indoor Games Room',
  'Tennis / Badminton Court',
  'Solar Street Lighting',
]

export function ProjectForm({ orgSlug, orgId, defaultValues, projectId }: ProjectFormProps) {
  const router = useRouter()
  const isEditing = !!projectId

  // Form State
  const [form, setForm] = useState<ProjectFormValues>({
    name: defaultValues?.name ?? '',
    code: defaultValues?.code ?? '',
    category: (defaultValues?.category as ProjectCategory) ?? 'apartments',
    type: defaultValues?.type ?? 'residential',
    status: defaultValues?.status ?? 'planning',
    city: defaultValues?.city ?? 'Hyderabad',
    location: defaultValues?.location ?? '',
    description: defaultValues?.description ?? '',
    rera_number: defaultValues?.rera_number ?? '',
    total_area_value: defaultValues?.total_area_value ?? undefined,
    total_area_unit: defaultValues?.total_area_unit ?? 'acres',
    total_units_count: defaultValues?.total_units_count ?? 0,
    approval_authority: defaultValues?.approval_authority ?? '',
    launch_date: defaultValues?.launch_date ?? '',
    completion_date: defaultValues?.completion_date ?? '',
    brochure_url: defaultValues?.brochure_url ?? '',
    amenities: (defaultValues?.amenities as string[]) ?? [],
    specifications: (defaultValues?.specifications as Record<string, unknown>) ?? {},
  })

  // Category specifications helpers
  type SpecValue = string | number | string[] | null | undefined
  const specs = (form.specifications ?? {}) as Record<string, SpecValue>
  function setSpec(key: string, value: SpecValue) {
    setForm((prev) => ({
      ...prev,
      specifications: {
        ...(prev.specifications ?? {}),
        [key]: value,
      },
    }))
  }

  const getStr = (key: string, fallback = ''): string => {
    const val = specs[key]
    if (val === undefined || val === null) return fallback
    if (Array.isArray(val)) return val.join(', ')
    return String(val)
  }
  const getNum = (key: string): number | '' => {
    const val = specs[key]
    return typeof val === 'number' ? val : ''
  }

  function toggleAmenity(amenity: string) {
    const current = (form.amenities ?? []) as string[]
    const next = current.includes(amenity)
      ? current.filter((a) => a !== amenity)
      : [...current, amenity]
    setForm((prev) => ({ ...prev, amenities: next }))
  }

  const [errors, setErrors] = useState<Partial<Record<keyof ProjectFormValues, string>>>({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function set<K extends keyof ProjectFormValues>(key: K, value: ProjectFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof ProjectFormValues, string>> = {}
    if (!form.name.trim() || form.name.length < 2) {
      errs.name = 'Project name must be at least 2 characters'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    setLoading(true)
    setServerError(null)

    try {
      const url = isEditing ? `/api/projects/${projectId}` : '/api/projects'
      const method = isEditing ? 'PUT' : 'POST'

      const payload = {
        ...form,
        ...(orgId ? { orgId, org_id: orgId } : {}),
        orgSlug,
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        const data = await response.json()
        setServerError(data.error ?? 'Something went wrong')
        return
      }

      const data = await response.json()
      router.push(`/${orgSlug}/projects/${data.project.id}`)
      router.refresh()
    } catch {
      setServerError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="max-w-5xl space-y-6">
      {serverError && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
          <span>{serverError}</span>
          <button
            type="button"
            onClick={() => setServerError(null)}
            className="text-red-500 hover:text-red-700 font-bold"
          >
            ✕
          </button>
        </div>
      )}

      {/* SECTION A: Basic Information */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-2xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-2 border-b border-[var(--border)]">
          <Building2 className="w-3.5 h-3.5 text-[var(--brand)]" />
          A. Basic Information
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              className={cn(inputClass, errors.name && 'border-red-400')}
              placeholder="e.g. Otho Greenview Heights, Palm County"
            />
            {errors.name && <p className="text-[11px] text-red-500">{errors.name}</p>}
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Project Code
            </label>
            <input
              type="text"
              value={form.code ?? ''}
              onChange={(e) => set('code', e.target.value.toUpperCase())}
              className={inputClass}
              placeholder="e.g. OTHO-01"
            />
            <p className="text-[11px] text-[var(--foreground-subtle)]">Short identifier for inventory & leads</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Lifecycle Status
            </label>
            <select
              value={form.status}
              onChange={(e) => set('status', e.target.value as ProjectFormValues['status'])}
              className={inputClass}
            >
              {PROJECT_STATUSES.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Total Planned Units / Plots
            </label>
            <input
              type="number"
              min="0"
              value={form.total_units_count ?? 0}
              onChange={(e) => set('total_units_count', Number(e.target.value))}
              className={inputClass}
              placeholder="e.g. 180"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Total Land Extent
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.total_area_value ?? ''}
                onChange={(e) => set('total_area_value', e.target.value ? Number(e.target.value) : null)}
                className={inputClass}
                placeholder="e.g. 12.5"
              />
              <select
                value={form.total_area_unit ?? 'acres'}
                onChange={(e) => set('total_area_unit', e.target.value)}
                className="w-28 px-2 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none"
              >
                <option value="acres">Acres</option>
                <option value="sqyd">Sq. Yds</option>
                <option value="sqft">Sq. Ft</option>
                <option value="cents">Cents</option>
                <option value="guntas">Guntas</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-1 pt-1">
          <label className="block text-[13px] font-medium text-[var(--foreground)]">
            Description
          </label>
          <textarea
            rows={3}
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
            className={inputClass}
            placeholder="Key selling points, project highlights, and positioning narrative..."
          />
        </div>
      </div>

      {/* SECTION B: Project Category & Category-Specific Specifications */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-5 shadow-2xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-2 border-b border-[var(--border)]">
          <Layers className="w-3.5 h-3.5 text-[var(--brand)]" />
          B. Project Category & Tailored Specifications
        </h2>

        {/* Category Selector Cards */}
        <div className="space-y-2">
          <label className="block text-[13px] font-medium text-[var(--foreground)]">
            Select Project Category
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {CATEGORY_OPTIONS.map((cat) => {
              const selected = form.category === cat.value
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => {
                    set('category', cat.value)
                    // Auto-sync type for legacy compatibility
                    if (cat.value === 'plotted_developments') set('type', 'plots')
                    else if (cat.value === 'commercial_sale') set('type', 'commercial')
                    else if (cat.value === 'mixed_use') set('type', 'mixed_use')
                    else set('type', 'residential')
                  }}
                  className={cn(
                    'text-left p-3 rounded-xl border transition-all flex flex-col justify-between',
                    selected
                      ? 'border-[var(--brand)] bg-blue-50/50 shadow-2xs'
                      : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)]'
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={cn(
                        'text-xs font-semibold',
                        selected ? 'text-[var(--brand)]' : 'text-[var(--foreground)]'
                      )}
                    >
                      {cat.label}
                    </span>
                    {selected && <Check className="w-3.5 h-3.5 text-[var(--brand)]" />}
                  </div>
                  <p className="text-[11px] text-[var(--foreground-muted)] leading-snug">
                    {cat.desc}
                  </p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Category-Specific Form Fields */}
        <div className="p-4 rounded-xl bg-[var(--surface-muted)] border border-[var(--border)] space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[var(--brand)]" />
            <h3 className="text-xs font-semibold text-[var(--foreground)]">
              {PROJECT_CATEGORY_LABELS[form.category]} Specifications
            </h3>
          </div>

          {/* 1. Apartments Dynamic Fields */}
          {form.category === 'apartments' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Total Towers Planned</label>
                <input
                  type="number"
                  min="1"
                  value={getNum('towers_count')}
                  onChange={(e) => setSpec('towers_count', e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                  placeholder="e.g. 4 Towers"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Typical Floors per Tower</label>
                <input
                  type="number"
                  min="1"
                  value={getNum('floors_count')}
                  onChange={(e) => setSpec('floors_count', e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                  placeholder="e.g. 14 Floors"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Clubhouse Area (Sq. Ft)</label>
                <input
                  type="number"
                  min="0"
                  value={getNum('clubhouse_sqft')}
                  onChange={(e) => setSpec('clubhouse_sqft', e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                  placeholder="e.g. 25000"
                />
              </div>
            </div>
          )}

          {/* 2. Plotted Developments Dynamic Fields */}
          {form.category === 'plotted_developments' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Plot Size Range</label>
                <input
                  type="text"
                  value={getStr('plot_size_range')}
                  onChange={(e) => setSpec('plot_size_range', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 165 sqyd – 450 sqyd"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Internal Road Widths</label>
                <input
                  type="text"
                  value={getStr('road_widths')}
                  onChange={(e) => setSpec('road_widths', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 40ft & 60ft BT Roads"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Open Space / Park Allocation</label>
                <input
                  type="text"
                  value={getStr('open_space_pct')}
                  onChange={(e) => setSpec('open_space_pct', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 10% Open Green Space"
                />
              </div>
            </div>
          )}

          {/* 3. Commercial Sale Dynamic Fields */}
          {form.category === 'commercial_sale' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Commercial Asset Type</label>
                <input
                  type="text"
                  value={getStr('asset_types')}
                  onChange={(e) => setSpec('asset_types', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. Grade A Offices, Retail Shops"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Typical Floor Plate (Sq. Ft)</label>
                <input
                  type="number"
                  min="0"
                  value={getNum('floor_plate_sqft')}
                  onChange={(e) => setSpec('floor_plate_sqft', e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                  placeholder="e.g. 18000"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Power Backup Infrastructure</label>
                <input
                  type="text"
                  value={getStr('power_backup', '100% DG Power Backup')}
                  onChange={(e) => setSpec('power_backup', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 100% DG Backup"
                />
              </div>
            </div>
          )}

          {/* 4. Villas Dynamic Fields */}
          {form.category === 'villas_gated_communities' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Villa Typologies</label>
                <input
                  type="text"
                  value={getStr('villa_types')}
                  onChange={(e) => setSpec('villa_types', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. East & West Facing 4BHKs"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Plot Size Range</label>
                <input
                  type="text"
                  value={getStr('plot_size_range')}
                  onChange={(e) => setSpec('plot_size_range', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 250 – 500 sqyd"
                />
              </div>

              <div className="space-y-1">
                <label className="font-medium text-[var(--foreground)]">Built-up Area Range</label>
                <input
                  type="text"
                  value={getStr('built_up_range')}
                  onChange={(e) => setSpec('built_up_range', e.target.value)}
                  className={inputClass}
                  placeholder="e.g. 3200 – 4800 sqft"
                />
              </div>
            </div>
          )}

          {/* 5. Mixed-Use Dynamic Fields */}
          {form.category === 'mixed_use' && (
            <div className="space-y-2 text-xs">
              <label className="font-medium text-[var(--foreground)]">Integrated Project Components</label>
              <input
                type="text"
                value={getStr('components')}
                onChange={(e) => setSpec('components', e.target.value)}
                className={inputClass}
                placeholder="e.g. Residential Towers, Retail Arcade, Commercial Office Block"
              />
              <p className="text-[11px] text-[var(--foreground-muted)]">
                Mixed-use projects support multiple inventory categories simultaneously.
              </p>
            </div>
          )}
        </div>

        {/* Project Amenities Tags */}
        <div className="space-y-2 pt-2">
          <label className="block text-[13px] font-medium text-[var(--foreground)]">
            Project Amenities & Features
          </label>
          <div className="flex flex-wrap gap-2">
            {STANDARD_AMENITIES.map((am) => {
              const active = ((form.amenities ?? []) as string[]).includes(am)
              return (
                <button
                  key={am}
                  type="button"
                  onClick={() => toggleAmenity(am)}
                  className={cn(
                    'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1.5',
                    active
                      ? 'bg-blue-50 text-[var(--brand)] border-blue-200 shadow-2xs'
                      : 'bg-[var(--surface)] text-[var(--foreground-muted)] border-[var(--border)] hover:bg-[var(--surface-hover)]'
                  )}
                >
                  <span className={cn('w-1.5 h-1.5 rounded-full', active ? 'bg-[var(--brand)]' : 'bg-gray-300')} />
                  {am}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* SECTION C: Location & Address */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-2xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-2 border-b border-[var(--border)]">
          <MapPin className="w-3.5 h-3.5 text-[var(--brand)]" />
          C. Location & Address
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">City</label>
            <input
              type="text"
              value={form.city ?? 'Hyderabad'}
              onChange={(e) => set('city', e.target.value)}
              className={inputClass}
              placeholder="Hyderabad"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Locality / Micro-market
            </label>
            <input
              type="text"
              value={form.location ?? ''}
              onChange={(e) => set('location', e.target.value)}
              className={inputClass}
              placeholder="e.g. Kokapet, Gachibowli, Mokila, Tellapur"
            />
          </div>
        </div>
      </div>

      {/* SECTION D: Project Media & Documents */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-2xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-2 border-b border-[var(--border)]">
          <Link2 className="w-3.5 h-3.5 text-[var(--brand)]" />
          D. Project Media & Digital Collateral
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Digital Brochure URL
            </label>
            <input
              type="url"
              value={form.brochure_url ?? ''}
              onChange={(e) => set('brochure_url', e.target.value)}
              className={inputClass}
              placeholder="https://example.com/brochure.pdf"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Video Walkthrough / Tour URL
            </label>
            <input
              type="url"
              value={getStr('video_url')}
              onChange={(e) => setSpec('video_url', e.target.value)}
              className={inputClass}
              placeholder="https://youtube.com/watch?v=..."
            />
          </div>
        </div>
      </div>

      {/* SECTION E: Regulatory, Compliance & Timeline */}
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 space-y-4 shadow-2xs">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--foreground-muted)] flex items-center gap-1.5 pb-2 border-b border-[var(--border)]">
          <Calendar className="w-3.5 h-3.5 text-[var(--brand)]" />
          E. Regulatory Approvals & Timeline
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              RERA Registration Number
            </label>
            <input
              type="text"
              value={form.rera_number ?? ''}
              onChange={(e) => set('rera_number', e.target.value)}
              className={inputClass}
              placeholder="e.g. P0240000XXXX"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Sanctioning / Approval Authority
            </label>
            <input
              type="text"
              value={form.approval_authority ?? ''}
              onChange={(e) => set('approval_authority', e.target.value)}
              className={inputClass}
              placeholder="e.g. HMDA, GHMC, DTCP"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">Launch Date</label>
            <input
              type="date"
              value={form.launch_date ?? ''}
              onChange={(e) => set('launch_date', e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              Target Completion Date
            </label>
            <input
              type="date"
              value={form.completion_date ?? ''}
              onChange={(e) => set('completion_date', e.target.value)}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* FORM ACTIONS */}
      <div className="flex items-center justify-between pt-3 pb-8">
        <Link
          href={isEditing ? `/${orgSlug}/projects/${projectId}` : `/${orgSlug}/projects`}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Cancel
        </Link>

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold text-white bg-[var(--brand)] hover:opacity-90 rounded-md shadow-xs transition-all disabled:opacity-50"
        >
          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Project'}
        </button>
      </div>
    </form>
  )
}
