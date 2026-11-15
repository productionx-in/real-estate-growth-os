'use client'
// components/sales/HoldUnitModal.tsx
// Operational modal for placing a temporary customer hold (token deposit) on an inventory unit.
import { useState, useEffect, useTransition } from 'react'
import { X, Loader2, Clock, CreditCard, User, AlertCircle, CheckCircle2, DollarSign } from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { InventoryItemWithRelations } from '@/types/inventory'

interface LeadOption {
  id: string
  name: string
  phone: string
  email: string | null
}

interface HoldUnitModalProps {
  item: InventoryItemWithRelations
  onClose: () => void
  onSuccess?: () => void
}

export function HoldUnitModal({ item, onClose, onSuccess }: HoldUnitModalProps) {
  const [isPending, startTransition] = useTransition()
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [selectedLeadId, setSelectedLeadId] = useState<string>('')
  const [tokenAmount, setTokenAmount] = useState<string>('50000')
  const [holdDurationHours, setHoldDurationHours] = useState<number>(48)
  const [paymentReference, setPaymentReference] = useState<string>('')
  const [remarks, setRemarks] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  // Fetch active leads in this organization/project
  useEffect(() => {
    let ignore = false
    setLoadingLeads(true)
    const orgId = item.org_id
    const projectId = item.project_id

    fetch(`/api/leads?orgId=${orgId}&projectId=${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!ignore) {
          if (data.leads && Array.isArray(data.leads)) {
            setLeads(data.leads)
            if (data.leads.length > 0) {
              setSelectedLeadId(data.leads[0].id)
            }
          }
          setLoadingLeads(false)
        }
      })
      .catch(() => {
        if (!ignore) setLoadingLeads(false)
      })

    return () => {
      ignore = true
    }
  }, [item.org_id, item.project_id])

  // Calculate projected expiry date/time
  const calculatedExpiry = new Date(Date.now() + holdDurationHours * 3600 * 1000)

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLeadId) {
      setError('Please select a customer/lead for this hold.')
      return
    }
    const tokenVal = Number(tokenAmount)
    if (isNaN(tokenVal) || tokenVal < 0) {
      setError('Please enter a valid token deposit amount.')
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch('/api/sales/blockings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: item.org_id,
            projectId: item.project_id,
            inventoryId: item.id,
            leadId: selectedLeadId,
            tokenAmount: tokenVal,
            holdDurationHours,
            paymentReference: paymentReference.trim() || undefined,
            remarks: remarks.trim() || undefined,
          }),
        })

        const resData = await response.json()
        if (!response.ok) {
          setError(resData.error || 'Failed to place hold')
          return
        }

        setSuccess(true)
        setTimeout(() => {
          if (onSuccess) onSuccess()
          onClose()
        }, 800)
      } catch {
        setError('Network error while placing hold. Please try again.')
      }
    })
  }

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-50 transition-opacity"
        onClick={onClose}
      />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-amber-500/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  Place Customer Hold
                </h2>
                <p className="text-xs text-[var(--foreground-muted)]">
                  Unit: <span className="font-semibold text-[var(--foreground)]">{item.unit_number}</span>
                  {item.project && ` • ${item.project.name}`}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={isPending}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--foreground-muted)] hover:bg-[var(--surface-hover)] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleConfirm} className="p-6 space-y-4">
            {error && (
              <div className="p-3.5 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">Unit successfully placed on hold! Updating records...</span>
              </div>
            )}

            {/* Buyer / Lead Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" /> Buyer / Lead{' '}
                <span className="text-rose-500">*</span>
              </label>
              {loadingLeads ? (
                <div className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] flex items-center px-3 text-xs text-[var(--foreground-muted)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Loading leads...
                </div>
              ) : leads.length === 0 ? (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                  No active leads found for this project. Please create an enquiry first in the CRM tab.
                </div>
              ) : (
                <select
                  value={selectedLeadId}
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  disabled={isPending || success}
                  required
                  className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.phone || 'No phone'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Token Amount & Hold Duration Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Token Deposit (₹){' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={tokenAmount}
                  onChange={(e) => setTokenAmount(e.target.value)}
                  disabled={isPending || success}
                  required
                  placeholder="e.g. 50000"
                  className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-amber-600" /> Hold Duration
                </label>
                <select
                  value={holdDurationHours}
                  onChange={(e) => setHoldDurationHours(Number(e.target.value))}
                  disabled={isPending || success}
                  className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                >
                  <option value={24}>24 Hours (1 Day)</option>
                  <option value={48}>48 Hours (Standard 2 Days)</option>
                  <option value={72}>72 Hours (3 Days)</option>
                  <option value={168}>7 Days (1 Week)</option>
                </select>
              </div>
            </div>

            {/* Payment Reference */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Payment Reference / UTR / Cheque #
              </label>
              <input
                type="text"
                value={paymentReference}
                onChange={(e) => setPaymentReference(e.target.value)}
                disabled={isPending || success}
                placeholder="e.g. UPI / UTR 20261115001 or Cheque 58921"
                className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono"
              />
            </div>

            {/* Expiration Preview Notice */}
            <div className="p-3 rounded-xl border border-amber-200/80 bg-amber-50/60 text-xs text-amber-900 space-y-1">
              <div className="flex items-center justify-between font-semibold">
                <span>Hold Expiry Deadline:</span>
                <span>{calculatedExpiry.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
              </div>
              <p className="text-[11px] text-amber-800/80">
                Unit status will transition to <strong className="font-semibold">Blocked</strong>. If not converted to a booking before this deadline, the hold automatically expires back to Available.
              </p>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)]">
                Remarks / Special Instructions
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={isPending || success}
                placeholder="e.g. Token received via Cheque, buyer finalizing home loan with HDFC."
                className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
              />
            </div>

            {/* Footer Buttons */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[var(--border)]">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending || success}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || success || !selectedLeadId}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-xs"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Hold
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
