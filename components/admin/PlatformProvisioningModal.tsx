'use client'
// components/admin/PlatformProvisioningModal.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Shield, Check, Copy, AlertCircle, Loader2 } from 'lucide-react'
import { PLAN_CONFIGS, type PlanTier } from '@/lib/subscriptions/config'

export function PlatformProvisioningModal() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [type, setType] = useState<'developer' | 'channel_partner'>('developer')
  const [planTier, setPlanTier] = useState<PlanTier>('growth')
  const [includedSeats, setIncludedSeats] = useState<number>(PLAN_CONFIGS.growth.defaultIncludedSeats)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminName, setAdminName] = useState('')
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provisionResult, setProvisionResult] = useState<{
    adminEmail?: string
    orgSlug?: string
    message?: string
  } | null>(null)

  function handleTierChange(tier: PlanTier) {
    setPlanTier(tier)
    setIncludedSeats(PLAN_CONFIGS[tier]?.defaultIncludedSeats ?? 10)
  }

  async function handleProvision(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !adminEmail.trim()) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/admin/organisations/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          slug: slug.trim() || undefined,
          type,
          planTier,
          includedSeats,
          adminEmail: adminEmail.trim(),
          adminName: adminName.trim() || undefined,
          billingCycle,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to provision organisation')
        setLoading(false)
        return
      }

      setProvisionResult({
        adminEmail: data.activation?.adminEmail,
        orgSlug: data.organisation?.slug,
        message: data.message,
      })
      router.refresh()
    } catch {
      setError('Network error. Failed to execute platform provisioning.')
    } finally {
      setLoading(false)
    }
  }

  function handleReset() {
    setName('')
    setSlug('')
    setType('developer')
    setPlanTier('growth')
    setIncludedSeats(PLAN_CONFIGS.growth.defaultIncludedSeats)
    setAdminEmail('')
    setAdminName('')
    setBillingCycle('annual')
    setError(null)
    setProvisionResult(null)
  }

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 sm:p-8 shadow-sm max-w-2xl mx-auto">
      <div className="mb-6">
        <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 mb-3">
          <Building2 className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-bold text-[var(--foreground)]">
          Provision Customer Organisation
        </h1>
        <p className="text-xs text-[var(--foreground-muted)] mt-1">
          Set up a new verified customer workspace, authoritative subscription plan, and issue the initial administrator invitation.
        </p>
      </div>

      {error && (
        <div className="mb-5 p-3 rounded-lg bg-[var(--danger-bg)] border border-danger/30 text-[12px] text-[var(--danger)] flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {provisionResult ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-success-bg border border-success/30 text-success text-[13px] space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <Check className="w-4 h-4 text-success" />
              <span>Customer Workspace Successfully Provisioned</span>
            </div>
            <p className="text-[12px] text-success leading-relaxed">
              Workspace <strong>/{provisionResult.orgSlug}</strong> created with {includedSeats} subscription seats. An activation invitation email has been securely dispatched to <strong>{provisionResult.adminEmail}</strong>.
            </p>
            <p className="text-[11px] text-success mt-1">
              For security, primary administrator tokens are never exposed in browser responses and are delivered directly via transactional email.
            </p>
          </div>

          <div className="pt-3">
            <button
              type="button"
              onClick={handleReset}
              className="w-full py-2.5 px-4 bg-[var(--brand)] text-white text-[13px] font-medium rounded-md hover:bg-[var(--brand-hover)] transition-colors"
            >
              Provision Another Organisation
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleProvision} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Organisation Name <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="text"
                required
                value={name}
                disabled={loading}
                onChange={(e) => setName(e.target.value)}
                placeholder="Prestige Estates"
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Workspace Slug (Optional)
              </label>
              <input
                type="text"
                value={slug}
                disabled={loading}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="prestige"
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Customer Type <span className="text-[var(--danger)]">*</span>
              </label>
              <select
                value={type}
                disabled={loading}
                onChange={(e) => setType(e.target.value as 'developer' | 'channel_partner')}
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none"
              >
                <option value="developer">Property Developer / Builder</option>
                <option value="channel_partner">Channel Partner Organisation</option>
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Primary Administrator Email <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                type="email"
                required
                value={adminEmail}
                disabled={loading}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@developer.com"
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Primary Administrator Name (Optional)
              </label>
              <input
                type="text"
                value={adminName}
                disabled={loading}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Vikram Sharma"
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Subscription Plan
              </label>
              <select
                value={planTier}
                disabled={loading}
                onChange={(e) => handleTierChange(e.target.value as PlanTier)}
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none"
              >
                {Object.entries(PLAN_CONFIGS).map(([k, cfg]) => (
                  <option key={k} value={k}>
                    {cfg.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Included Seats
              </label>
              <input
                type="number"
                min={1}
                max={500}
                value={includedSeats}
                disabled={loading}
                onChange={(e) => setIncludedSeats(Number(e.target.value))}
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Billing Cycle
              </label>
              <select
                value={billingCycle}
                disabled={loading}
                onChange={(e) => setBillingCycle(e.target.value as 'monthly' | 'annual')}
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none"
              >
                <option value="annual">Annual Billing</option>
                <option value="monthly">Monthly Billing</option>
              </select>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || !name.trim() || !adminEmail.trim()}
              className="w-full py-2.5 px-4 bg-[var(--brand)] text-white text-[13px] font-semibold rounded-md hover:bg-[var(--brand-hover)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-2xs"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
              <span>{loading ? 'Provisioning Workspace…' : 'Provision Customer Organisation & Send Invitation'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
