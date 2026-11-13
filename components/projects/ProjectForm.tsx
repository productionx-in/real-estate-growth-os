'use client'
// components/projects/ProjectForm.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
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
    desc: 'Towers, floors, and residential flats/apartments',
  },
  {
    value: 'plotted_developments',
    label: 'Plotted Developments',
    desc: 'Phases, sectors/blocks, and open residential/commercial plots',
  },
  {
    value: 'commercial_sale',
    label: 'Commercial Sale',
    desc: 'Retail shops, offices, and commercial corporate units',
  },
  {
    value: 'villas_gated_communities',
    label: 'Villas & Gated Communities',
    desc: 'Clusters, streets, independent villas and row houses',
  },
  {
    value: 'mixed_use',
    label: 'Mixed-Use Developments',
    desc: 'Integrated residential, commercial, and retail components',
  },
]

const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planning' },
  { value: 'pre_launch', label: 'Pre-launch' },
  { value: 'launched', label: 'Launched' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
] as const

export function ProjectForm({ orgSlug, orgId, defaultValues, projectId }: ProjectFormProps) {
  const router = useRouter()
  const isEditing = !!projectId

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
  })

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
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">
        <div className="lg:col-span-2 space-y-5">
          {/* Main Info */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">
              Project Details
            </h2>

            {serverError && (
              <div className="p-3 mb-4 rounded bg-red-50 border border-red-200 text-[13px] text-red-700">
                {serverError}
              </div>
            )}

            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Project name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Apex Heights, Cyber Residency"
                    className={cn(inputClass, errors.name && 'border-red-400')}
                  />
                  {errors.name && <p className="text-[11px] text-red-500 mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Project Code
                  </label>
                  <input
                    type="text"
                    value={form.code ?? ''}
                    onChange={(e) => set('code', e.target.value.toUpperCase())}
                    placeholder="e.g. APX-H"
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Category Selector */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1.5">
                  Project Category <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {CATEGORY_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex flex-col p-3 rounded-lg border cursor-pointer transition-all text-left',
                        form.category === opt.value
                          ? 'border-[var(--brand)] bg-blue-50/40 text-[var(--brand)] ring-1 ring-[var(--brand)]'
                          : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-muted)] text-[var(--foreground)]'
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-semibold">{opt.label}</span>
                        <input
                          type="radio"
                          name="category"
                          value={opt.value}
                          checked={form.category === opt.value}
                          onChange={() => set('category', opt.value)}
                          className="w-3.5 h-3.5 text-[var(--brand)]"
                        />
                      </div>
                      <span className="text-[11px] text-[var(--foreground-muted)] leading-tight">
                        {opt.desc}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    value={form.city ?? ''}
                    onChange={(e) => set('city', e.target.value)}
                    placeholder="e.g. Hyderabad"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Location / Micro-market
                  </label>
                  <input
                    type="text"
                    value={form.location ?? ''}
                    onChange={(e) => set('location', e.target.value)}
                    placeholder="e.g. Gachibowli, Kokapet, Financial District"
                    className={inputClass}
                  />
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                  Description
                </label>
                <textarea
                  value={form.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                  rows={3}
                  placeholder="Overview, highlights, key connectivity..."
                  className={cn(inputClass, 'resize-none')}
                />
              </div>
            </div>
          </div>

          {/* RERA and Approvals Section */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">
              Approvals & Timeline
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    RERA Number
                  </label>
                  <input
                    type="text"
                    value={form.rera_number ?? ''}
                    onChange={(e) => set('rera_number', e.target.value)}
                    placeholder="e.g. P02400005432"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Approval Authority
                  </label>
                  <input
                    type="text"
                    value={form.approval_authority ?? ''}
                    onChange={(e) => set('approval_authority', e.target.value)}
                    placeholder="e.g. HMDA, GHMC, DTCP"
                    className={inputClass}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Total Units / Plots Planned
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={form.total_units_count ?? 0}
                    onChange={(e) => set('total_units_count', parseInt(e.target.value) || 0)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Total Project Extent
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={form.total_area_value ?? ''}
                    onChange={(e) =>
                      set('total_area_value', e.target.value ? parseFloat(e.target.value) : null)
                    }
                    placeholder="e.g. 5.5"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Area Unit
                  </label>
                  <select
                    value={form.total_area_unit ?? 'acres'}
                    onChange={(e) => set('total_area_unit', e.target.value)}
                    className={inputClass}
                  >
                    <option value="acres">Acres</option>
                    <option value="guntas">Guntas</option>
                    <option value="sq_yards">Sq. Yards</option>
                    <option value="sq_ft">Sq. Ft.</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Launch Date
                  </label>
                  <input
                    type="date"
                    value={form.launch_date ?? ''}
                    onChange={(e) => set('launch_date', e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                    Expected Completion Date
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
          </div>
        </div>

        {/* Right Sidebar: Status & Actions */}
        <div className="space-y-5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h3 className="text-[13px] font-semibold text-[var(--foreground)] mb-3">
              Lifecycle Status
            </h3>
            <div className="space-y-2">
              {PROJECT_STATUSES.map((s) => (
                <label
                  key={s.value}
                  className={cn(
                    'flex items-center gap-2.5 p-2 rounded-md cursor-pointer transition-colors text-[13px]',
                    form.status === s.value
                      ? 'bg-blue-50 text-[var(--brand)] font-medium'
                      : 'hover:bg-[var(--surface-muted)] text-[var(--foreground-muted)]'
                  )}
                >
                  <input
                    type="radio"
                    name="status"
                    value={s.value}
                    checked={form.status === s.value}
                    onChange={() => set('status', s.value)}
                    className="w-3.5 h-3.5 text-[var(--brand)]"
                  />
                  {s.label}
                </label>
              ))}
            </div>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-3">
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-2 px-4 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-[13px] font-medium rounded-md transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {isEditing ? 'Save changes' : 'Create project'}
            </button>

            <button
              type="button"
              onClick={() => router.back()}
              className="w-full py-2 px-4 border border-[var(--border)] hover:bg-[var(--surface-muted)] text-[var(--foreground-muted)] text-[13px] font-medium rounded-md transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
