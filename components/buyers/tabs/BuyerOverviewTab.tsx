'use client'
// components/buyers/tabs/BuyerOverviewTab.tsx
import React from 'react'
import {
  User,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  ShieldCheck,
  Users,
  Clock,
  Building2,
  Calendar,
} from 'lucide-react'
import type { Buyer360Data } from '@/lib/buyers/types'
import { formatCurrency, formatDate } from '@/lib/utils/format'

interface BuyerOverviewTabProps {
  data: Buyer360Data
  onEditBuyer: () => void
}

export function BuyerOverviewTab({ data, onEditBuyer }: BuyerOverviewTabProps) {
  const { buyer, portfolioSummary, portfolio, timeline } = data

  return (
    <div className="space-y-6">
      {/* 1. Key Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
            Total Consideration
          </p>
          <p className="mt-1 text-xl font-bold text-[var(--foreground)]">
            ₹{portfolioSummary.totalConsideration.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">
            Across {portfolioSummary.totalBookingsCount} booked unit(s)
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-xs font-medium text-emerald-800 uppercase tracking-wider">
            Verified Collections
          </p>
          <p className="mt-1 text-xl font-bold text-emerald-700">
            ₹{portfolioSummary.totalPaidVerified.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[11px] text-emerald-600">
            {portfolioSummary.totalConsideration > 0
              ? `${Math.round((portfolioSummary.totalPaidVerified / portfolioSummary.totalConsideration) * 100)}% Realized`
              : 'No active consideration'}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <p className="text-xs font-medium text-amber-800 uppercase tracking-wider">
            Outstanding Receivables
          </p>
          <p className="mt-1 text-xl font-bold text-amber-700">
            ₹{portfolioSummary.totalOutstanding.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[11px] text-amber-600">
            Pending construction milestones
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <p className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
            KYC & Document Status
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                buyer.pan_number
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {buyer.pan_number ? 'PAN Documented' : 'PAN Missing'}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">
            {data.documents.filter((d) => d.status === 'verified').length} verified document(s)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 2. Customer Contact & Identification Profile */}
        <div className="md:col-span-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <User className="h-4 w-4 text-[var(--brand)]" />
              Primary Customer Identification & KYC
            </h3>
            <button
              onClick={onEditBuyer}
              className="text-xs font-semibold text-[var(--brand)] hover:underline"
            >
              Edit Details
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <p className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                Full Legal Name
              </p>
              <p className="mt-0.5 text-sm font-medium text-[var(--foreground)]">
                {buyer.full_name}
              </p>
            </div>

            <div>
              <p className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                Primary Phone Number
              </p>
              <p className="mt-0.5 text-sm font-medium text-[var(--foreground)] flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
                {buyer.phone}
              </p>
            </div>

            <div>
              <p className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                Email Address
              </p>
              <p className="mt-0.5 text-sm font-medium text-[var(--foreground)] flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 text-[var(--foreground-muted)]" />
                {buyer.email || 'Not provided'}
              </p>
            </div>

            <div>
              <p className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                Alternate Contact
              </p>
              <p className="mt-0.5 text-sm font-medium text-[var(--foreground)]">
                {buyer.alternate_phone || 'None'}
              </p>
            </div>

            <div>
              <p className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                PAN (Tax Identification)
              </p>
              <p className="mt-0.5 text-sm font-mono font-medium text-[var(--foreground)]">
                {buyer.pan_number || 'Pending Submission'}
              </p>
            </div>

            <div>
              <p className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                Aadhaar (UIDAI Masked)
              </p>
              <p className="mt-0.5 text-sm font-mono font-medium text-[var(--foreground)]">
                {buyer.aadhaar_number_masked || 'Pending Submission'}
              </p>
            </div>

            <div className="md:col-span-2">
              <p className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                Residential / Billing Address
              </p>
              <p className="mt-0.5 text-sm text-[var(--foreground)] flex items-start gap-1.5">
                <MapPin className="h-4 w-4 shrink-0 text-[var(--foreground-muted)] mt-0.5" />
                {buyer.address_line1 ? (
                  <span>
                    {buyer.address_line1}
                    {buyer.address_line2 ? `, ${buyer.address_line2}` : ''}
                    {buyer.city ? `, ${buyer.city}` : ''}
                    {buyer.state ? `, ${buyer.state}` : ''}
                    {buyer.pincode ? ` - ${buyer.pincode}` : ''}
                    {buyer.country ? `, ${buyer.country}` : ''}
                  </span>
                ) : (
                  <span className="italic text-[var(--foreground-muted)]">Address not on file</span>
                )}
              </p>
            </div>

            {buyer.notes && (
              <div className="md:col-span-2 border-t border-[var(--border)] pt-2">
                <p className="font-semibold text-[var(--foreground-muted)] uppercase tracking-wider text-[11px]">
                  Internal Notes
                </p>
                <p className="mt-0.5 text-xs text-[var(--foreground)] bg-[var(--surface-muted)] p-2 rounded-lg">
                  {buyer.notes}
                </p>
              </div>
            )}
          </div>

          {/* Co-Buyers */}
          <div className="border-t border-[var(--border)] pt-3">
            <h4 className="text-xs font-semibold text-[var(--foreground)] flex items-center gap-1.5 mb-2">
              <Users className="h-3.5 w-3.5 text-[var(--brand)]" />
              Co-Buyers & Authorised Representatives ({buyer.co_buyers?.length || 0})
            </h4>
            {buyer.co_buyers && buyer.co_buyers.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {buyer.co_buyers.map((cb, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] p-2.5 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[var(--foreground)]">{cb.name}</span>
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-[var(--surface)] text-[var(--foreground-muted)] border border-[var(--border)]">
                        {cb.relationship}
                      </span>
                    </div>
                    {cb.phone && <p className="text-[var(--foreground-muted)]">Phone: {cb.phone}</p>}
                    {cb.pan && <p className="font-mono text-[var(--foreground-muted)]">PAN: {cb.pan}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-[var(--foreground-muted)] italic">
                Sole ownership registration. No secondary buyers.
              </p>
            )}
          </div>
        </div>

        {/* 3. Recent Audit & Activity Timeline Preview */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 space-y-4 shadow-sm">
          <div className="border-b border-[var(--border)] pb-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
              <Clock className="h-4 w-4 text-[var(--brand)]" />
              Recent Account Activity
            </h3>
          </div>

          <div className="space-y-3">
            {timeline.slice(0, 5).map((t) => (
              <div key={t.id} className="relative pl-4 border-l-2 border-[var(--border)] text-xs space-y-0.5">
                <div className="absolute -left-[5px] top-1 h-2 w-2 rounded-full bg-[var(--brand)]" />
                <p className="font-semibold text-[var(--foreground)]">{t.title}</p>
                <p className="text-[11px] text-[var(--foreground-muted)]">{t.description}</p>
                <p className="text-[10px] text-[var(--foreground-muted)]">{formatDate(t.timestamp)}</p>
              </div>
            ))}
            {timeline.length === 0 && (
              <p className="text-xs text-[var(--foreground-muted)] italic">No recent activity recorded.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
