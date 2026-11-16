'use client'
// components/buyers/tabs/BuyerPortfolioTab.tsx
import React from 'react'
import { Building2, Calendar, CheckCircle2, AlertCircle, FileText, UserCheck } from 'lucide-react'
import type { BuyerPortfolioItem } from '@/lib/buyers/types'
import { formatDate } from '@/lib/utils/format'

interface BuyerPortfolioTabProps {
  portfolio: BuyerPortfolioItem[]
  onSelectBookingForMilestones?: (bookingId: string) => void
}

export function BuyerPortfolioTab({
  portfolio,
  onSelectBookingForMilestones,
}: BuyerPortfolioTabProps) {
  if (portfolio.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center space-y-3 shadow-sm">
        <Building2 className="mx-auto h-8 w-8 text-[var(--foreground-muted)]" />
        <h3 className="text-sm font-semibold text-[var(--foreground)]">No Real Estate Bookings Found</h3>
        <p className="text-xs text-[var(--foreground-muted)] max-w-md mx-auto">
          This buyer has not booked any units yet. Once an inventory hold or direct booking is confirmed, it will appear here in their real estate portfolio.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {portfolio.map((item) => (
        <div
          key={item.booking_id}
          className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm space-y-4"
        >
          {/* Booking Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-[var(--brand)]">
                  #{item.booking_number}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase ${
                    item.status === 'confirmed' || item.status === 'registered' || item.status === 'agreement_signed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : item.status === 'cancelled'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {item.status.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                Booked on {formatDate(item.booking_date)} · Plan: {item.payment_plan.replace(/_/g, ' ')}
              </p>
            </div>

            <div className="text-right">
              <p className="text-xs text-[var(--foreground-muted)]">Agreed Consideration</p>
              <p className="text-lg font-bold text-[var(--foreground)]">
                ₹{item.agreed_total_amount.toLocaleString('en-IN')}
              </p>
            </div>
          </div>

          {/* Unit & Property Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <p className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                Project
              </p>
              <p className="mt-0.5 font-medium text-[var(--foreground)]">{item.project.name}</p>
              {item.project.code && (
                <span className="font-mono text-[10px] text-[var(--foreground-muted)]">
                  {item.project.code}
                </span>
              )}
            </div>

            <div>
              <p className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                Unit Number
              </p>
              <p className="mt-0.5 font-bold text-[var(--foreground)]">{item.unit.unit_number}</p>
              <p className="capitalize text-[11px] text-[var(--foreground-muted)]">
                {item.unit.category.replace(/_/g, ' ')}
              </p>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                Verified Collections
              </p>
              <p className="mt-0.5 font-bold text-emerald-700">
                ₹{item.amount_received_verified.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-emerald-600">{item.payment_progress_percent}% Realized</p>
            </div>

            <div>
              <p className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                Outstanding Balance
              </p>
              <p className="mt-0.5 font-bold text-amber-700">
                ₹{item.outstanding_balance.toLocaleString('en-IN')}
              </p>
              <p className="text-[11px] text-amber-600">Pending Milestones</p>
            </div>
          </div>

          {/* Progress Bar */}
          <div>
            <div className="flex justify-between text-[11px] text-[var(--foreground-muted)] mb-1">
              <span>Financial Fulfillment</span>
              <span>{item.payment_progress_percent}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-muted)]">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                style={{ width: `${item.payment_progress_percent}%` }}
              />
            </div>
          </div>

          {/* Sourcing Channel Partner Attribution */}
          {item.channel_partner && (
            <div className="rounded-lg bg-[var(--surface-muted)] p-2.5 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-[var(--brand)]" />
                <span>
                  Sourced via Channel Partner: <strong>{item.channel_partner.firm_name}</strong> ({item.channel_partner.contact_person})
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
