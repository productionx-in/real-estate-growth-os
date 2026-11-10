'use client'
// components/projects/ProjectForm.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { ProjectFormValues } from '@/lib/validations/project'

interface ProjectFormProps {
  orgSlug: string
  defaultValues?: Partial<ProjectFormValues>
  projectId?: string
}

const inputClass = "w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors placeholder:text-[var(--foreground-subtle)]"

const PROJECT_TYPES = [
  { value: 'residential', label: 'Residential' },
  { value: 'commercial', label: 'Commercial' },
  { value: 'mixed_use', label: 'Mixed Use' },
  { value: 'plots', label: 'Plots / Land' },
] as const

const PROJECT_STATUSES = [
  { value: 'planning', label: 'Planning' },
  { value: 'pre_launch', label: 'Pre-launch' },
  { value: 'launched', label: 'Launched' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
] as const

export function ProjectForm({ orgSlug, defaultValues, projectId }: ProjectFormProps) {
  const router = useRouter()
  const isEditing = !!projectId

  const [form, setForm] = useState<ProjectFormValues>({
    name: defaultValues?.name ?? '',
    type: defaultValues?.type ?? 'residential',
    status: defaultValues?.status ?? 'planning',
    city: defaultValues?.city ?? '',
    location: defaultValues?.location ?? '',
    description: defaultValues?.description ?? '',
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
    if (!form.name.trim() || form.name.length < 2) errs.name = 'Project name must be at least 2 characters'
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

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">Project details</h2>

            {serverError && (
              <div className="mb-4 p-3 rounded-md bg-[var(--danger-bg)] border border-red-100 text-[13px] text-[var(--danger)]">
                {serverError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="projName" className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">
                  Project name <span className="text-[var(--danger)]">*</span>
                </label>
                <input
                  id="projName"
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={cn(inputClass, errors.name && 'border-[var(--danger)]')}
                  placeholder="Prestige Heights Phase 2"
                  autoFocus
                />
                {errors.name && <p className="mt-1 text-[12px] text-[var(--danger)]">{errors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="projCity" className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">City</label>
                  <input
                    id="projCity"
                    type="text"
                    value={form.city ?? ''}
                    onChange={(e) => set('city', e.target.value)}
                    className={inputClass}
                    placeholder="Bangalore"
                  />
                </div>
                <div>
                  <label htmlFor="projLocation" className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">Location / Area</label>
                  <input
                    id="projLocation"
                    type="text"
                    value={form.location ?? ''}
                    onChange={(e) => set('location', e.target.value)}
                    className={inputClass}
                    placeholder="Whitefield, Bangalore"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="projDesc" className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">Description</label>
                <textarea
                  id="projDesc"
                  value={form.description ?? ''}
                  onChange={(e) => set('description', e.target.value)}
                  rows={4}
                  className={cn(inputClass, 'resize-none')}
                  placeholder="Luxury residential project with 2 and 3 BHK apartments…"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)]">Classification</h2>

            <div>
              <label htmlFor="projType" className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">Project type</label>
              <select
                id="projType"
                value={form.type}
                onChange={(e) => set('type', e.target.value as ProjectFormValues['type'])}
                className={inputClass}
              >
                {PROJECT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="projStatus" className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">Status</label>
              <select
                id="projStatus"
                value={form.status}
                onChange={(e) => set('status', e.target.value as ProjectFormValues['status'])}
                className={inputClass}
              >
                {PROJECT_STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 py-2.5 text-[13px] font-medium text-[var(--foreground)] bg-[var(--surface)] border border-[var(--border)] rounded-md hover:bg-[var(--surface-hover)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2.5 text-[13px] font-medium text-white bg-[var(--brand)] rounded-md hover:bg-[var(--brand-hover)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {loading ? 'Saving…' : isEditing ? 'Save changes' : 'Create project'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
