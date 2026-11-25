'use client'
// components/admin/PlatformProvisioningModal.tsx
import { useState } from 'react'
import { Input, Select } from '@/components/ui'
import { useRouter } from 'next/navigation'
import { Building2, Shield, Check, Copy, AlertCircle, Loader2 } from 'lucide-react'
import { PLAN_CONFIGS, type PlanTier } from '@/lib/subscriptions/config'

export interface ProvisionPrefill { prospectId: string; name: string; type: 'developer' | 'channel_partner'; adminEmail: string; adminName: string }

export function PlatformProvisioningModal({ prefill }: { prefill?: ProvisionPrefill } = {}) {
  const router = useRouter()
  const [name, setName] = useState(prefill?.name ?? '')
  const [slug, setSlug] = useState('')
  const [type, setType] = useState<'developer' | 'channel_partner'>(prefill?.type ?? 'developer')
  const [planTier, setPlanTier] = useState<PlanTier>('growth')
  const [includedSeats, setIncludedSeats] = useState<number>(PLAN_CONFIGS.growth.defaultIncludedSeats)
  const [adminEmail, setAdminEmail] = useState(prefill?.adminEmail ?? '')
  const [adminName, setAdminName] = useState(prefill?.adminName ?? '')
  const [copied, setCopied] = useState(false)
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [provisionResult, setProvisionResult] = useState<{
    adminEmail?: string
    emailDispatched?: boolean
    emailError?: string | null
    orgSlug?: string
    message?: string
    inviteUrl?: string | null
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
          prospectId: prefill?.prospectId,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to provision organisation')
        setLoading(false)
        return
      }

      setProvisionResult({
        adminEmail: data.invitation?.adminEmail ?? data.activation?.adminEmail ?? adminEmail.trim(),
        orgSlug: data.organisation?.slug,
        message: data.message,
        emailDispatched: data.emailDispatched !== false,
        emailError: data.emailError ?? null,
        inviteUrl: data.inviteUrl ?? null,
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
        <div className="w-10 h-10 rounded-xl bg-accent-bg border border-accent-border flex items-center justify-center text-accent mb-3">
          <Building2 className="w-5 h-5" />
        </div>
        <h1 className="text-lg font-bold text-[var(--foreground)]">
          Provision Customer Organisation
        </h1>
        <p className="text-xs text-[var(--foreground-muted)] mt-1">
          Set up a new verified customer workspace, authoritative subscription plan, and issue the initial administrator invitation.
        </p>
      </div>

      {prefill && !provisionResult && (
        <div className="mb-5 rounded-lg border border-brand/30 bg-brand-light p-3 text-[12px]">
          Activating a demo request. The company, type and contact are filled in from the request; check them, choose the plan, then provision.
          {!prefill.adminEmail && <strong> The request has no e-mail address: add the owner’s e-mail.</strong>}
        </div>
      )}

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
              Workspace <strong>/{provisionResult.orgSlug}</strong> created with {includedSeats} subscription seats.{' '}
              {provisionResult.emailDispatched
                ? <>An activation invitation email has been sent to <strong>{provisionResult.adminEmail}</strong>.</>
                : null}
            </p>
            {provisionResult.emailDispatched === false && (
              <p role="alert" className="rounded-lg border border-warning/30 bg-warning-bg p-2 text-[12px] text-warning">
                The invitation email to <strong>{provisionResult.adminEmail}</strong> was <strong>not sent</strong>: {provisionResult.emailError ?? 'e-mail delivery failed'}.
                Share the invitation link below instead (copy it or send it on WhatsApp).
              </p>
            )}
            {provisionResult.inviteUrl && (
              <div className="space-y-2 rounded-lg border border-default bg-surface p-3 text-foreground">
                <p className="text-[12px] font-semibold">Invitation link for {provisionResult.adminEmail}</p>
                <p className="text-[12px] text-muted">
                  {provisionResult.emailDispatched ? 'Also sent by e-mail. ' : 'Send it yourself — '}it works once, only for this e-mail address, and expires in 14 days. Don’t post it anywhere public.
                </p>
                <p className="break-all rounded-md bg-surface-hover p-2 font-mono text-[11px]">{provisionResult.inviteUrl}</p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(provisionResult.inviteUrl!); setCopied(true) } catch { setCopied(false) } }}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-default px-3 text-[12px] font-medium hover:bg-surface-hover">
                    {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? 'Copied' : 'Copy link'}
                  </button>
                  <a target="_blank" rel="noopener noreferrer"
                    href={`https://wa.me/?text=${encodeURIComponent(`Your REGrow workspace "${name}" is ready. Set up your account here: ${provisionResult.inviteUrl}`)}`}
                    className="inline-flex min-h-9 items-center rounded-md bg-success px-3 text-[12px] font-medium text-success-foreground hover:opacity-90">
                    Share on WhatsApp
                  </a>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3">
            <button
              type="button"
              onClick={handleReset}
              className="btn-primary w-full py-2.5 px-4 bg-[var(--brand)] text-brand-foreground text-[13px] font-medium rounded-md hover:bg-[var(--brand-hover)] transition-colors"
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
              <Input
                type="text"
                required
                value={name}
                disabled={loading}
                onChange={(e) => setName(e.target.value)}
                placeholder="Prestige Estates"
                className="focus:ring-brand-light"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Workspace Slug (Optional)
              </label>
              <Input
                type="text"
                value={slug}
                disabled={loading}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="prestige"
                className="focus:ring-brand-light"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Customer Type <span className="text-[var(--danger)]">*</span>
              </label>
              <Select
                value={type}
                disabled={loading}
                onChange={(e) => setType(e.target.value as 'developer' | 'channel_partner')}>
                <option value="developer">Property Developer / Builder</option>
                <option value="channel_partner">Channel Partner Organisation</option>
              </Select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Primary Administrator Email <span className="text-[var(--danger)]">*</span>
              </label>
              <Input
                type="email"
                required
                value={adminEmail}
                disabled={loading}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="admin@developer.com"
                className="focus:ring-brand-light"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Primary Administrator Name (Optional)
              </label>
              <Input
                type="text"
                value={adminName}
                disabled={loading}
                onChange={(e) => setAdminName(e.target.value)}
                placeholder="Vikram Sharma"
                className="focus:ring-brand-light"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Subscription Plan
              </label>
              <Select
                value={planTier}
                disabled={loading}
                onChange={(e) => handleTierChange(e.target.value as PlanTier)}>
                {Object.entries(PLAN_CONFIGS).map(([k, cfg]) => (
                  <option key={k} value={k}>
                    {cfg.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Included Seats
              </label>
              <Input
                type="number"
                min={1}
                max={500}
                value={includedSeats}
                disabled={loading}
                onChange={(e) => setIncludedSeats(Number(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Billing Cycle
              </label>
              <Select
                value={billingCycle}
                disabled={loading}
                onChange={(e) => setBillingCycle(e.target.value as 'monthly' | 'annual')}>
                <option value="annual">Annual Billing</option>
                <option value="monthly">Monthly Billing</option>
              </Select>
            </div>
          </div>

          <div className="pt-4">
            <button
              type="submit"
              disabled={loading || !name.trim() || !adminEmail.trim()}
              className="btn-primary w-full py-2.5 px-4 bg-[var(--brand)] text-brand-foreground text-[13px] font-semibold rounded-md hover:bg-[var(--brand-hover)] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
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
