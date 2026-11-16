'use client'
// components/buyers/tabs/BuyerPaymentScheduleTab.tsx
import React, { useState } from 'react'
import {
  CreditCard,
  Plus,
  CheckCircle2,
  AlertCircle,
  FileText,
  Clock,
  ShieldCheck,
  Building2,
  Calendar,
} from 'lucide-react'
import type { BookingPaymentMilestone, BookingPayment, BuyerPortfolioItem } from '@/lib/buyers/types'
import { formatDate } from '@/lib/utils/format'

interface BuyerPaymentScheduleTabProps {
  orgId: string
  portfolio: BuyerPortfolioItem[]
  milestones: BookingPaymentMilestone[]
  payments: BookingPayment[]
  isManager: boolean
  onOpenRecordPayment: (bookingId: string) => void
  onRefreshData: () => void
}

export function BuyerPaymentScheduleTab({
  orgId,
  portfolio,
  milestones,
  payments,
  isManager,
  onOpenRecordPayment,
  onRefreshData,
}: BuyerPaymentScheduleTabProps) {
  const [selectedBookingId, setSelectedBookingId] = useState<string>(
    portfolio[0]?.booking_id || ''
  )
  const [verifyingId, setVerifyingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const selectedBooking = portfolio.find((p) => p.booking_id === selectedBookingId)
  const bookingMilestones = milestones.filter((m) => m.booking_id === selectedBookingId)
  const bookingPayments = payments.filter((p) => p.booking_id === selectedBookingId)

  const handleVerifyPayment = async (paymentId: string) => {
    if (!isManager) {
      alert('Payment verification requires Sales Manager or Admin authority.')
      return
    }

    const confirm = window.confirm(
      'Verify this customer payment? This will update the official booking ledger and credit the milestone.'
    )
    if (!confirm) return

    setVerifyingId(paymentId)
    setError(null)
    try {
      const res = await fetch(`/api/sales/bookings/${selectedBookingId}/payments/${paymentId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId, paymentId }),
      })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to verify payment')
      }
      onRefreshData()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
    } finally {
      setVerifyingId(null)
    }
  }

  if (portfolio.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-xs text-[var(--foreground-muted)] shadow-sm">
        No active bookings found for this customer. Payment schedules are linked to confirmed unit bookings.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 1. Booking Selector (if multiple bookings) */}
      {portfolio.length > 1 && (
        <div className="flex items-center gap-3 bg-[var(--surface)] p-3 rounded-xl border border-[var(--border)]">
          <span className="text-xs font-semibold text-[var(--foreground-muted)]">Select Booking:</span>
          <div className="flex gap-2">
            {portfolio.map((p) => (
              <button
                key={p.booking_id}
                onClick={() => setSelectedBookingId(p.booking_id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  selectedBookingId === p.booking_id
                    ? 'bg-[var(--brand)] text-white shadow-sm'
                    : 'bg-[var(--surface-muted)] text-[var(--foreground)] hover:bg-[var(--border)]'
                }`}
              >
                #{p.booking_number} ({p.unit.unit_number} - {p.project.name})
              </button>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* 2. Commercial Summary Bar */}
      {selectedBooking && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
              Total Agreed Price
            </p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              ₹{selectedBooking.agreed_total_amount.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-[var(--foreground-muted)]">
              Unit {selectedBooking.unit.unit_number} · {selectedBooking.project.name}
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
              Verified Realized Amount
            </p>
            <p className="mt-1 text-lg font-bold text-emerald-700">
              ₹{selectedBooking.amount_received_verified.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-emerald-600">
              {selectedBooking.payment_progress_percent}% Realized
            </p>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
            <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
              Remaining Balance
            </p>
            <p className="mt-1 text-lg font-bold text-amber-700">
              ₹{selectedBooking.outstanding_balance.toLocaleString('en-IN')}
            </p>
            <p className="text-[10px] text-amber-600">Across Remaining Milestones</p>
          </div>

          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm flex flex-col justify-center items-start">
            <button
              onClick={() => onOpenRecordPayment(selectedBooking.booking_id)}
              className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Record Customer Payment
            </button>
          </div>
        </div>
      )}

      {/* 3. Payment Milestones Schedule */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[var(--brand)]" />
            Configured Milestone Schedule ({bookingMilestones.length} installments)
          </h3>
        </div>

        {bookingMilestones.length === 0 ? (
          <div className="text-center py-6 text-xs text-[var(--foreground-muted)] space-y-2">
            <p>No customized milestone schedule configured for this booking yet.</p>
            <p className="text-[11px]">Installments can be customized based on construction progress or standard payment plans.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider bg-[var(--surface-muted)]">
                <tr>
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-3 py-2.5">Milestone Name</th>
                  <th className="px-3 py-2.5">Due Date</th>
                  <th className="px-3 py-2.5">Amount Due</th>
                  <th className="px-3 py-2.5">Amount Paid</th>
                  <th className="px-3 py-2.5">Balance</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Demand Letter</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {bookingMilestones.map((m) => {
                  const balance = Math.max(0, m.amount_due - m.amount_paid)
                  return (
                    <tr key={m.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                      <td className="px-3 py-2.5 font-mono text-[var(--foreground-muted)]">{m.milestone_sequence}</td>
                      <td className="px-3 py-2.5 font-medium text-[var(--foreground)]">{m.milestone_name}</td>
                      <td className="px-3 py-2.5 text-[var(--foreground-muted)]">{formatDate(m.due_date)}</td>
                      <td className="px-3 py-2.5 font-semibold text-[var(--foreground)]">
                        ₹{m.amount_due.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-emerald-700">
                        ₹{m.amount_paid.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5 font-semibold text-amber-700">
                        ₹{balance.toLocaleString('en-IN')}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                            m.status === 'paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.status === 'partially_paid'
                              ? 'bg-blue-100 text-blue-800'
                              : m.status === 'overdue'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {m.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[11px]">
                        {m.demand_letter_issued ? (
                          <span className="text-emerald-700 font-medium">Issued</span>
                        ) : (
                          <span className="text-[var(--foreground-muted)]">Not issued</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Recorded Payments Ledger */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-[var(--brand)]" />
            Payment Receipts & Ledger ({bookingPayments.length})
          </h3>
        </div>

        {bookingPayments.length === 0 ? (
          <p className="text-xs text-[var(--foreground-muted)] italic py-4 text-center">
            No payments recorded for this booking yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider bg-[var(--surface-muted)]">
                <tr>
                  <th className="px-3 py-2.5">Receipt #</th>
                  <th className="px-3 py-2.5">Payment Date</th>
                  <th className="px-3 py-2.5">Amount</th>
                  <th className="px-3 py-2.5">Method</th>
                  <th className="px-3 py-2.5">UTR / Cheque Ref</th>
                  <th className="px-3 py-2.5">Milestone</th>
                  <th className="px-3 py-2.5">Verification</th>
                  <th className="px-3 py-2.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {bookingPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                    <td className="px-3 py-2.5 font-mono font-bold text-[var(--brand)]">{p.receipt_number}</td>
                    <td className="px-3 py-2.5 text-[var(--foreground-muted)]">{formatDate(p.payment_date)}</td>
                    <td className="px-3 py-2.5 font-bold text-[var(--foreground)]">
                      ₹{p.amount.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2.5 uppercase text-[10px] font-medium text-[var(--foreground)]">
                      {p.payment_method.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[var(--foreground)]">{p.reference_number}</td>
                    <td className="px-3 py-2.5 text-[var(--foreground-muted)]">
                      {p.milestone ? p.milestone.milestone_name : 'General Advance'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          p.status === 'verified'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.status === 'rejected' || p.status === 'bounced'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {p.status}
                      </span>
                      {p.verifier && (
                        <p className="text-[10px] text-[var(--foreground-muted)] mt-0.5">
                          Verified by {p.verifier.full_name}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {p.status === 'unverified' && isManager ? (
                        <button
                          disabled={verifyingId === p.id}
                          onClick={() => handleVerifyPayment(p.id)}
                          className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {verifyingId === p.id ? 'Verifying...' : 'Verify'}
                        </button>
                      ) : (
                        <span className="text-[10px] text-[var(--foreground-muted)]">
                          {p.status === 'verified' ? 'Settled' : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
