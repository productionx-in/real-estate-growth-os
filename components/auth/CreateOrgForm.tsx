'use client'
// components/auth/CreateOrgForm.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Users2, Check, Loader2, Sparkles } from 'lucide-react'
import { slugify } from '@/lib/utils/slugify'
import { cn } from '@/lib/utils/cn'

type OrgType = 'developer' | 'channel_partner'

const ORG_TYPES: { value: OrgType; label: string; description: string; icon: any }[] = [
  {
    value: 'developer',
    label: 'Property Developer / Builder',
    description: 'Build and sell residential apartments, plotted layouts, commercial properties, or gated villas.',
    icon: Building2,
  },
  {
    value: 'channel_partner',
    label: 'Channel Partner / Brokerage',
    description: 'Sell projects on behalf of builders, coordinate client site visits, and manage lead pipelines.',
    icon: Users2,
  },
]

export function CreateOrgForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [type, setType] = useState<OrgType>('developer')
  const [city, setCity] = useState('Hyderabad')
  const [seedDemoData, setSeedDemoData] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const slugPreview = slugify(name) || 'my-workspace'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || name.length < 2) {
      setError('Please enter an organisation or brand name (min 2 characters).')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slugify(name.trim()),
          type,
          city,
          seedDemoData,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error ?? 'Failed to create workspace.')
      }

      // Successfully created workspace — redirect into the new org dashboard!
      router.push(`/${data.org.slug}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Workspace Name */}
      <div>
        <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">
          Organisation or Brand Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Apex Developers, Skyline Realty"
          className="w-full px-3.5 py-2.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-[var(--foreground-subtle)]"
          required
        />
        <div className="mt-1.5 text-[11px] text-[var(--foreground-muted)] flex items-center gap-1 font-mono">
          <span>Workspace URL:</span>
          <span className="text-[var(--foreground)] font-semibold">/{slugPreview}</span>
        </div>
      </div>

      {/* Business Type */}
      <div>
        <label className="block text-xs font-semibold text-[var(--foreground)] mb-2">
          Select Your Business Model <span className="text-red-500">*</span>
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ORG_TYPES.map((t) => {
            const Icon = t.icon
            const isSelected = type === t.value

            return (
              <div
                key={t.value}
                onClick={() => setType(t.value)}
                className={cn(
                  'relative p-4 rounded-xl border-2 cursor-pointer transition-all flex flex-col justify-between',
                  isSelected
                    ? 'border-[var(--brand)] bg-blue-50/40 text-[var(--brand)] shadow-xs'
                    : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] text-[var(--foreground)]'
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-8 h-8 rounded-lg bg-[var(--surface-muted)] flex items-center justify-center flex-shrink-0">
                    <Icon className={cn('w-4 h-4', isSelected ? 'text-[var(--brand)]' : 'text-[var(--foreground-muted)]')} />
                  </div>
                  {isSelected && (
                    <div className="w-5 h-5 rounded-full bg-[var(--brand)] text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="text-xs font-bold leading-tight">{t.label}</h4>
                  <p className="text-[11px] text-[var(--foreground-muted)] mt-1 leading-normal">
                    {t.description}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Primary City */}
      <div>
        <label className="block text-xs font-semibold text-[var(--foreground)] mb-1.5">
          Primary Operating City
        </label>
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="e.g. Hyderabad"
          className="w-full px-3.5 py-2.5 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg outline-none focus:border-[var(--brand)] transition-all"
        />
      </div>

      {/* Starter Data Checkbox */}
      <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/50 flex items-start gap-3">
        <input
          type="checkbox"
          id="seedDemo"
          checked={seedDemoData}
          onChange={(e) => setSeedDemoData(e.target.checked)}
          className="mt-0.5 w-4 h-4 rounded text-[var(--brand)] focus:ring-blue-400"
        />
        <label htmlFor="seedDemo" className="cursor-pointer text-xs leading-relaxed text-[var(--foreground)]">
          <span className="font-semibold text-blue-900 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
            Populate with starter sample projects & inventory
          </span>
          <span className="block text-[11px] text-blue-700 mt-0.5">
            Includes sample apartments with tower matrices, plotted development layouts, and sample leads pipeline so you can test all features right away.
          </span>
        </label>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-[var(--brand)] hover:bg-[var(--brand-hover)] text-white text-xs font-semibold rounded-lg transition-colors shadow-xs disabled:opacity-50"
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Setting up your workspace...
          </>
        ) : (
          'Create Workspace & Open OS'
        )}
      </button>
    </form>
  )
}
