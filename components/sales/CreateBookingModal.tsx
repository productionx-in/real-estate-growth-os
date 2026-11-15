'use client'
// components/sales/CreateBookingModal.tsx
// Operational modal for executing a confirmed sales booking on an inventory unit.
// Supports direct booking or converting an active hold.
import { useState, useEffect, useTransition } from 'react'
import {
  X,
  Loader2,
  Building2,
  User,
  CreditCard,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  FileText,
  Briefcase,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils/format'
import type { InventoryItemWithRelations } from '@/types/inventory'
import type { InventoryBlocking, ChannelPartner, PaymentPlanType } from '@/lib/sales/types'

interface LeadOption {
  id: string
  name: string
  phone: string
  email: string | null
}

interface CreateBookingModalProps {
  item: InventoryItemWithRelations
  activeHold?: InventoryBlocking | null
  onClose: () => void
  onSuccess?: () => void
}

export function CreateBookingModal({
  item,
  activeHold,
  onClose,
  onSuccess,
}: CreateBookingModalProps) {
  const [isPending, startTransition] = useTransition()
  const [leads, setLeads] = useState<LeadOption[]>([])
  const [loadingLeads, setLoadingLeads] = useState(true)
  const [channelPartners, setChannelPartners] = useState<ChannelPartner[]>([])
  const [selectedLeadId, setSelectedLeadId] = useState<string>(activeHold?.lead_id || '')
  const [selectedCpId, setSelectedCpId] = useState<string>('')
  
  // Pricing state
  const defaultBase = item.total_price ? Number(item.total_price) : 5000000
  const [basePrice, setBasePrice] = useState<number>(defaultBase)
  const [additionalCharges, setAdditionalCharges] = useState<number>(250000)
  const defaultBookingAmt = activeHold ? Number(activeHold.token_amount) : 500000
  const [bookingAmountReceived, setBookingAmountReceived] = useState<number>(defaultBookingAmt)
  const [paymentPlan, setPaymentPlan] = useState<PaymentPlanType>('construction_linked')
  const [remarks, setRemarks] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const totalContractAmount = (Number(basePrice) || 0) + (Number(additionalCharges) || 0)

  // Fetch leads and channel partners
  useEffect(() => {
    let ignore = false
    setLoadingLeads(true)
    const orgId = item.org_id
    const projectId = item.project_id

    Promise.all([
      fetch(`/api/leads?orgId=${orgId}&projectId=${projectId}`).then((r) => r.json()),
      fetch(`/api/sales/channel-partners?orgId=${orgId}`).then((r) => r.json()).catch(() => ({ data: [] })),
    ])
      .then(([leadData, cpData]) => {
        if (!ignore) {
          if (leadData.leads && Array.isArray(leadData.leads)) {
            setLeads(leadData.leads)
            if (!activeHold?.lead_id && leadData.leads.length > 0) {
              setSelectedLeadId(leadData.leads[0].id)
            }
          }
          if (cpData.data && Array.isArray(cpData.data)) {
            setChannelPartners(cpData.data)
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
  }, [item.org_id, item.project_id, activeHold?.lead_id])

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedLeadId) {
      setError('Please select a buyer/lead for this booking.')
      return
    }
    if (!basePrice || basePrice <= 0) {
      setError('Base price must be greater than zero.')
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        const response = await fetch('/api/sales/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            orgId: item.org_id,
            projectId: item.project_id,
            inventoryId: item.id,
            leadId: selectedLeadId,
            blockingId: activeHold?.id || undefined,
            channelPartnerId: selectedCpId || undefined,
            basePrice,
            additionalCharges,
            bookingAmountReceived,
            paymentPlan,
            remarks: remarks.trim() || undefined,
          }),
        })

        const resData = await response.json()
        if (!response.ok) {
          setError(resData.error || 'Failed to create booking')
          return
        }

        setSuccess(true)
        setTimeout(() => {
          if (onSuccess) onSuccess()
          onClose()
        }, 800)
      } catch {
        setError('Network error while creating booking. Please try again.')
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
        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)] bg-blue-500/5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">
                  {activeHold ? 'Convert Hold to Confirmed Booking' : 'New Sales Booking'}
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
                <span className="font-medium">Booking confirmed successfully! Generating agreements...</span>
              </div>
            )}

            {/* Active Hold Credit Banner if converting */}
            {activeHold && (
              <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/70 text-xs text-amber-900 space-y-1">
                <div className="flex items-center justify-between font-semibold">
                  <span>Converting Active Hold</span>
                  <span>Credit: {formatCurrency(Number(activeHold.token_amount))}</span>
                </div>
                <p className="text-[11px] text-amber-800/80">
                  {activeHold.lead ? `Held by ${activeHold.lead.name}` : 'Hold deposit'} received on{' '}
                  {new Date(activeHold.created_at).toLocaleDateString('en-IN')}. Hold status will automatically transition to converted.
                </p>
              </div>
            )}

            {/* Buyer / Lead Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" /> Primary Buyer / Lead{' '}
                <span className="text-rose-500">*</span>
              </label>
              {loadingLeads ? (
                <div className="h-10 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] flex items-center px-3 text-xs text-[var(--foreground-muted)]">
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Loading leads...
                </div>
              ) : leads.length === 0 ? (
                <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-xs">
                  No leads found. Please create an enquiry first in the CRM tab.
                </div>
              ) : (
                <select
                  value={selectedLeadId}
                  onChange={(e) => setSelectedLeadId(e.target.value)}
                  disabled={isPending || success || Boolean(activeHold)}
                  required
                  className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  {leads.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name} ({l.phone || 'No phone'})
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Pricing Breakdown: Base Price & Additional Charges */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" /> Base Agreement Value (₹){' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  step="10000"
                  value={basePrice}
                  onChange={(e) => setBasePrice(Number(e.target.value))}
                  disabled={isPending || success}
                  required
                  className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--foreground)]">
                  Additional Charges / Parking / Amenities (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="5000"
                  value={additionalCharges}
                  onChange={(e) => setAdditionalCharges(Number(e.target.value))}
                  disabled={isPending || success}
                  className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>
            </div>

            {/* Total Contract Value Highlight */}
            <div className="p-3.5 rounded-xl border border-[var(--border)] bg-[var(--surface-hover)] flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider block">
                  Total Contract Consideration
                </span>
                <span className="text-lg font-bold text-emerald-700 font-mono">
                  {formatCurrency(totalContractAmount)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[var(--foreground-muted)] block">Unit Area</span>
                <span className="text-xs font-semibold text-[var(--foreground)]">
                  {item.super_built_up_area ? `${item.super_built_up_area} ${item.area_unit}` : 'Standard'}
                </span>
              </div>
            </div>

            {/* Booking Advance Received & Payment Plan */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5 text-blue-600" /> Booking Advance Received (₹){' '}
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="10000"
                  value={bookingAmountReceived}
                  onChange={(e) => setBookingAmountReceived(Number(e.target.value))}
                  disabled={isPending || success}
                  required
                  className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--foreground)]">Payment Plan</label>
                <select
                  value={paymentPlan}
                  onChange={(e) => setPaymentPlan(e.target.value as PaymentPlanType)}
                  disabled={isPending || success}
                  className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                >
                  <option value="construction_linked">Construction Linked (CLP)</option>
                  <option value="down_payment">Down Payment (DP)</option>
                  <option value="time_linked">Time Linked / Milestones</option>
                  <option value="custom">Custom Commercial Plan</option>
                </select>
              </div>
            </div>

            {/* Channel Partner Sourcing Attribution */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-amber-600" /> Channel Partner / Sourcing Broker (Optional)
              </label>
              <select
                value={selectedCpId}
                onChange={(e) => setSelectedCpId(e.target.value)}
                disabled={isPending || success}
                className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="">Direct Developer Sale (No Broker)</option>
                {channelPartners.map((cp) => (
                  <option key={cp.id} value={cp.id}>
                    {cp.firm_name} ({cp.contact_person} • {cp.default_commission_rate}%)
                  </option>
                ))}
              </select>
            </div>

            {/* Remarks */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--foreground)]">
                Remarks / Commercial Terms
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                disabled={isPending || success}
                placeholder="e.g. Agreement to be signed within 15 days; covered car parking slot #CP-42 included."
                className="w-full text-xs rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                disabled={isPending || success || !selectedLeadId || basePrice <= 0}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-xs"
              >
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Confirm Booking
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
