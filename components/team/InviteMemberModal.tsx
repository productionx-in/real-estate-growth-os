'use client'
// components/team/InviteMemberModal.tsx
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X, Mail, Shield, Check, Copy, AlertCircle, Loader2 } from 'lucide-react'
import type { MemberRole } from '@/types/database'
import type { SeatUsage } from '@/lib/dal/subscriptions'

interface InviteMemberModalProps {
  isOpen: boolean
  onClose: () => void
  orgSlug: string
  seatUsage: SeatUsage
}

export function InviteMemberModal({ isOpen, onClose, orgSlug, seatUsage }: InviteMemberModalProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('sales_exec')
  const [expiresInDays, setExpiresInDays] = useState(7)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!isOpen) return null

  const isLimitReached = seatUsage.availableSeats <= 0

  async function handleSendInvite(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || isLimitReached) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgSlug,
          email: email.trim(),
          role,
          expiresInDays,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to send invitation')
        setLoading(false)
        return
      }

      setInviteUrl(data.inviteUrl)
      router.refresh()
    } catch {
      setError('Network error. Failed to send invitation.')
    } finally {
      setLoading(false)
    }
  }

  function handleCopy() {
    if (!inviteUrl) return
    navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function handleReset() {
    setEmail('')
    setRole('sales_exec')
    setError(null)
    setInviteUrl(null)
    setCopied(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-overlay backdrop-blur-xs">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl max-w-md w-full p-6 shadow-xl relative animate-in fade-in zoom-in-95 duration-150">
        <button
          type="button"
          onClick={handleReset}
          className="absolute top-5 right-5 text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-5">
          <div className="w-10 h-10 rounded-xl bg-brand-light border border-brand/30 flex items-center justify-center text-[var(--brand)] mb-3">
            <Mail className="w-5 h-5" />
          </div>
          <h2 className="text-[16px] font-bold text-[var(--foreground)]">Invite Team Member</h2>
          <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
            Add sales executives, managers, or auditors to your workspace.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-[var(--danger-bg)] border border-danger/30 text-[12px] text-[var(--danger)] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {isLimitReached && !inviteUrl && (
          <div className="mb-4 p-3 rounded-lg bg-warning-bg border border-warning/30 text-[12px] text-warning flex items-start gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Seat Quota Reached</p>
              <p className="mt-0.5 text-[11px] leading-relaxed">
                Your workspace has allocated all {seatUsage.totalSeats} seats ({seatUsage.occupiedSeats} active, {seatUsage.reservedSeats} reserved). Please upgrade plan or revoke pending invitations to invite more members.
              </p>
            </div>
          </div>
        )}

        {inviteUrl ? (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-success-bg border border-success/30 text-success text-[13px]">
              <div className="flex items-center gap-2 font-semibold">
                <Check className="w-4 h-4 text-success" />
                <span>Invitation Created & Seat Reserved</span>
              </div>
              <p className="text-[12px] text-success mt-1 leading-relaxed">
                Share this secure activation link with <strong>{email}</strong>. The employee will join your workspace directly without creating a new organisation.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-[11px] font-medium text-[var(--foreground-muted)] uppercase">
                Invitation Activation URL
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={inviteUrl}
                  className="w-full px-3 py-2 text-[12px] font-mono bg-surface-muted border border-[var(--border)] rounded-md text-[var(--foreground)]"
                />
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-3 py-2 bg-[var(--brand)] text-white text-[12px] font-medium rounded-md hover:bg-[var(--brand-hover)] transition-colors flex items-center gap-1.5 flex-shrink-0"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={handleReset}
              className="w-full py-2 px-4 border border-[var(--border)] text-[13px] font-medium text-[var(--foreground)] rounded-md hover:bg-[var(--surface-hover)] transition-colors mt-2"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSendInvite} className="space-y-4">
            <div>
              <label htmlFor="invite-email" className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Employee Work Email <span className="text-[var(--danger)]">*</span>
              </label>
              <input
                id="invite-email"
                type="email"
                required
                value={email}
                disabled={isLimitReached || loading}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@propertydeveloper.com"
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors disabled:opacity-60"
              />
            </div>

            <div>
              <label htmlFor="invite-role" className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Assigned Role <span className="text-[var(--danger)]">*</span>
              </label>
              <select
                id="invite-role"
                value={role}
                disabled={isLimitReached || loading}
                onChange={(e) => setRole(e.target.value as MemberRole)}
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors disabled:opacity-60"
              >
                <option value="sales_exec">Sales Executive (Manage assigned leads, pipeline, site visits)</option>
                <option value="manager">Sales Manager (Lead distribution, full pipeline, analytics)</option>
                <option value="admin">Administrator (Full team, settings, projects & integrations)</option>
                <option value="readonly">Read Only (Auditor / Executive Observer)</option>
              </select>
            </div>

            <div>
              <label htmlFor="invite-expiry" className="block text-[12px] font-medium text-[var(--foreground)] mb-1">
                Invitation Expiry
              </label>
              <select
                id="invite-expiry"
                value={expiresInDays}
                disabled={isLimitReached || loading}
                onChange={(e) => setExpiresInDays(Number(e.target.value))}
                className="w-full px-3 py-2 text-[13px] bg-[var(--surface)] border border-[var(--border)] rounded-md outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-blue-100 transition-colors disabled:opacity-60"
              >
                <option value={7}>7 days (Standard)</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
              </select>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="px-4 py-2 text-[13px] font-medium text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLimitReached || loading || !email.trim()}
                className="px-4 py-2 bg-[var(--brand)] text-white text-[13px] font-medium rounded-md hover:bg-[var(--brand-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                <span>{loading ? 'Creating Invitation…' : 'Issue Invitation'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
