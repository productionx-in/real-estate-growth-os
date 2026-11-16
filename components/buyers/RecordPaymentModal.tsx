'use client'
// components/buyers/RecordPaymentModal.tsx
import React, { useState } from 'react'
import { X, CreditCard, ShieldAlert } from 'lucide-react'
import type { BookingPaymentMilestone, BookingPayment, PaymentMethod } from '@/lib/buyers/types'

interface RecordPaymentModalProps {
  orgId: string
  bookingId: string
  milestones: BookingPaymentMilestone[]
  isOpen: boolean
  onClose: () => void
  onSuccess: (payment: BookingPayment) => void
}

export function RecordPaymentModal({
  orgId,
  bookingId,
  milestones,
  isOpen,
  onClose,
  onSuccess,
}: RecordPaymentModalProps) {
  const [milestoneId, setMilestoneId] = useState<string>('')
  const [amount, setAmount] = useState<string>('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('bank_transfer_neft_rtgs')
  const [referenceNumber, setReferenceNumber] = useState<string>('')
  const [paymentDate, setPaymentDate] = useState<string>(() => new Date().toISOString().split('T')[0])
  const [notes, setNotes] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const selectedMilestone = milestones.find((m) => m.id === milestoneId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid positive payment amount')
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch(`/api/sales/bookings/${bookingId}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          bookingId,
          milestoneId: milestoneId || null,
          amount: numAmount,
          paymentMethod,
          referenceNumber: referenceNumber.trim(),
          paymentDate,
          notes: notes.trim() || null,
        }),
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to record payment')
      }

      onSuccess(json.data)
      onClose()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-[var(--brand)]" />
            <h2 className="text-base font-semibold text-[var(--foreground)]">
              Record Customer Payment
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <strong>Commercial Integrity Notice:</strong> Payments recorded here enter an <em>unverified</em> state. Customer-provided UTR or Cheque details are not credited to the customer account balance until verified by an authorised Manager or Finance Administrator.
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold text-[var(--foreground)] mb-1">
              Apply to Payment Milestone (Optional)
            </label>
            <select
              value={milestoneId}
              onChange={(e) => {
                setMilestoneId(e.target.value)
                const m = milestones.find((x) => x.id === e.target.value)
                if (m) {
                  const remaining = Math.max(0, m.amount_due - m.amount_paid)
                  setAmount(remaining.toString())
                }
              }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
            >
              <option value="">General Booking Account / Advance</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  #{m.milestone_sequence} {m.milestone_name} (Due: ₹{m.amount_due.toLocaleString('en-IN')}, Paid: ₹{m.amount_paid.toLocaleString('en-IN')})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[var(--foreground)] mb-1">
                Amount Received (₹) *
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="e.g. 500000"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-[var(--foreground)] mb-1">
                Payment Date *
              </label>
              <input
                type="date"
                required
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-[var(--foreground)] mb-1">
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              >
                <option value="bank_transfer_neft_rtgs">NEFT / RTGS / IMPS</option>
                <option value="cheque">Bank Cheque</option>
                <option value="upi">UPI / Virtual Account</option>
                <option value="demand_draft">Demand Draft (DD)</option>
                <option value="credit_card">Debit / Credit Card</option>
                <option value="cash">Cash (Statutory limit compliant)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-[var(--foreground)] mb-1">
                Reference / UTR / Cheque No. *
              </label>
              <input
                type="text"
                required
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="e.g. UTR123456789 / CHQ-004521"
                className="w-full font-mono rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-[var(--foreground)] mb-1">
              Internal Remarks / Bank Details
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. HDFC Bank branch deposit, screenshot verified by sales exec"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-3 border-t border-[var(--border)] pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[var(--border)] px-4 py-2 font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[var(--brand)] px-5 py-2 font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-50"
            >
              {submitting ? 'Recording...' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
