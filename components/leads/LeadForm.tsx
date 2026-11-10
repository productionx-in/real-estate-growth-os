'use client'
// components/leads/LeadForm.tsx
// Create / edit lead form. Used on /leads/new and /leads/[id]/edit.
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import type { LeadFormValues } from '@/lib/validations/lead'

interface Project {
  id: string
  name: string
}

interface LeadFormProps {
  orgSlug: string
  orgId: string
  projects: Project[]
  /** Pre-fill values when editing an existing lead */
  defaultValues?: Partial<LeadFormValues>
  leadId?: string // present when editing
}

const SOURCE_OPTIONS = [
  { value: 'website', label: 'Website' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: '99acres', label: '99acres' },
  { value: 'housing', label: 'Housing.com' },
  { value: 'magicbricks', label: 'Magicbricks' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'referral', label: 'Referral' },
  { value: 'walk_in', label: 'Walk-in' },
  { value: 'other', label: 'Other' },
] as const

const STATUS_OPTIONS = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'site_visit_scheduled', label: 'Site Visit Scheduled' },
  { value: 'site_visited', label: 'Site Visited' },
  { value: 'negotiation', label: 'Negotiation' },
  { value: 'booked', label: 'Booked' },
  { value: 'lost', label: 'Lost' },
  { value: 'junk', label: 'Junk' },
] as const

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { value: 'medium', label: 'Medium', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  { value: 'high', label: 'High', color: 'bg-red-50 text-red-700 border-red-200' },
] as const

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="mt-1 text-[12px] text-[var(--danger)]">{message}</p>
}

function Label({ htmlFor, children, required }: { htmlFor: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="block text-[13px] font-medium text-[var(--foreground)] mb-1.5">
      {children}
      {required && <span className="text-[var(--danger)] ml-0.5">*</span>}
    </label>
  )
}

const inputClass = "w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors placeholder:text-[var(--foreground-subtle)]"

export function LeadForm({ orgSlug, orgId: _orgId, projects, defaultValues, leadId }: LeadFormProps) {
  const router = useRouter()
  const isEditing = !!leadId

  const [form, setForm] = useState<LeadFormValues>({
    name: defaultValues?.name ?? '',
    phone: defaultValues?.phone ?? '',
    email: defaultValues?.email ?? '',
    source: defaultValues?.source ?? 'other',
    status: defaultValues?.status ?? 'new',
    priority: defaultValues?.priority ?? 'medium',
    project_id: defaultValues?.project_id ?? '',
    budget_min: defaultValues?.budget_min ?? null,
    budget_max: defaultValues?.budget_max ?? null,
    notes: defaultValues?.notes ?? '',
  })

  const [errors, setErrors] = useState<Partial<Record<keyof LeadFormValues, string>>>({})
  const [loading, setLoading] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  function set<K extends keyof LeadFormValues>(key: K, value: LeadFormValues[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function validate(): boolean {
    const errs: Partial<Record<keyof LeadFormValues, string>> = {}
    if (!form.name.trim() || form.name.length < 2) errs.name = 'Name must be at least 2 characters'
    if (!form.phone.trim() || form.phone.length < 7) errs.phone = 'Enter a valid phone number'
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email address'
    if (form.budget_min && form.budget_max && form.budget_min > form.budget_max) {
      errs.budget_max = 'Max budget must be greater than min budget'
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
      const url = isEditing ? `/api/leads/${leadId}` : '/api/leads'
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
      const leadId_ = data.lead?.id ?? leadId
      router.push(`/${orgSlug}/leads/${leadId_}`)
      router.refresh()
    } catch {
      setServerError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ── Left column: core fields ── */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">
              Contact information
            </h2>

            {serverError && (
              <div className="mb-4 p-3 rounded-md bg-[var(--danger-bg)] border border-red-100 text-[13px] text-[var(--danger)]">
                {serverError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Name */}
              <div className="sm:col-span-2">
                <Label htmlFor="name" required>Full name</Label>
                <input
                  id="name"
                  type="text"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  className={cn(inputClass, errors.name && 'border-[var(--danger)] focus:ring-red-100')}
                  placeholder="Amit Patel"
                  autoFocus
                />
                <FieldError message={errors.name} />
              </div>

              {/* Phone */}
              <div>
                <Label htmlFor="phone" required>Phone</Label>
                <input
                  id="phone"
                  type="tel"
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  className={cn(inputClass, errors.phone && 'border-[var(--danger)] focus:ring-red-100')}
                  placeholder="+91 98765 43210"
                />
                <FieldError message={errors.phone} />
              </div>

              {/* Email */}
              <div>
                <Label htmlFor="email">Email</Label>
                <input
                  id="email"
                  type="email"
                  value={form.email ?? ''}
                  onChange={(e) => set('email', e.target.value)}
                  className={cn(inputClass, errors.email && 'border-[var(--danger)] focus:ring-red-100')}
                  placeholder="amit@example.com"
                />
                <FieldError message={errors.email} />
              </div>
            </div>
          </div>

          {/* Budget */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">
              Budget range
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="budgetMin">Min budget (₹)</Label>
                <input
                  id="budgetMin"
                  type="number"
                  min={0}
                  step={100000}
                  value={form.budget_min ?? ''}
                  onChange={(e) => set('budget_min', e.target.value ? Number(e.target.value) : null)}
                  className={inputClass}
                  placeholder="e.g. 5000000"
                />
              </div>
              <div>
                <Label htmlFor="budgetMax">Max budget (₹)</Label>
                <input
                  id="budgetMax"
                  type="number"
                  min={0}
                  step={100000}
                  value={form.budget_max ?? ''}
                  onChange={(e) => set('budget_max', e.target.value ? Number(e.target.value) : null)}
                  className={cn(inputClass, errors.budget_max && 'border-[var(--danger)] focus:ring-red-100')}
                  placeholder="e.g. 10000000"
                />
                <FieldError message={errors.budget_max} />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)] mb-4">Notes</h2>
            <textarea
              id="notes"
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
              rows={4}
              className={cn(inputClass, 'resize-none')}
              placeholder="Any additional context about this lead…"
            />
          </div>
        </div>

        {/* ── Right column: classification ── */}
        <div className="space-y-5">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-5 space-y-4">
            <h2 className="text-[13px] font-semibold text-[var(--foreground)]">
              Lead details
            </h2>

            {/* Source */}
            <div>
              <Label htmlFor="source" required>Source</Label>
              <select
                id="source"
                value={form.source}
                onChange={(e) => set('source', e.target.value as LeadFormValues['source'])}
                className={inputClass}
              >
                {SOURCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div>
              <Label htmlFor="status">Status</Label>
              <select
                id="status"
                value={form.status}
                onChange={(e) => set('status', e.target.value as LeadFormValues['status'])}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Priority */}
            <div>
              <Label htmlFor="priority">Priority</Label>
              <div className="flex gap-2">
                {PRIORITY_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => set('priority', p.value)}
                    className={cn(
                      'flex-1 py-1.5 text-[12px] font-medium rounded-md border transition-colors',
                      form.priority === p.value
                        ? p.color
                        : 'bg-[var(--surface-hover)] text-[var(--foreground-muted)] border-[var(--border)] hover:border-[var(--border-strong)]'
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Project */}
            <div>
              <Label htmlFor="project">Project</Label>
              <select
                id="project"
                value={form.project_id ?? ''}
                onChange={(e) => set('project_id', e.target.value)}
                className={inputClass}
              >
                <option value="">— No project —</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Actions */}
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
              {loading ? 'Saving…' : isEditing ? 'Save changes' : 'Create lead'}
            </button>
          </div>
        </div>
      </div>
    </form>
  )
}
