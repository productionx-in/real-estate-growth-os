'use client'
// components/team/SubscriptionSeatMeter.tsx
import { Users, AlertTriangle, ArrowUpRight } from 'lucide-react'
import type { SeatUsage } from '@/lib/dal/subscriptions'

interface SubscriptionSeatMeterProps {
  seatUsage: SeatUsage
  orgSlug: string
  isAdmin: boolean
}

export function SubscriptionSeatMeter({ seatUsage, isAdmin }: SubscriptionSeatMeterProps) {
  const {
    planName,
    totalSeats,
    occupiedSeats,
    reservedSeats,
    availableSeats,
    isLimitReached,
  } = seatUsage

  const occupiedPercent = Math.min(100, Math.round((occupiedSeats / totalSeats) * 100))
  const reservedPercent = Math.min(100 - occupiedPercent, Math.round((reservedSeats / totalSeats) * 100))

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-2xs mb-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-brand-light border border-brand/30 flex items-center justify-center text-[var(--brand)]">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[14px] font-bold text-[var(--foreground)]">Subscription Seats</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-light text-[var(--brand)] border border-brand/30">
                {planName}
              </span>
            </div>
            <p className="text-[12px] text-[var(--foreground-muted)] mt-0.5">
              {occupiedSeats} active member{occupiedSeats === 1 ? '' : 's'} · {reservedSeats} reserved by invitation · {availableSeats} seat{availableSeats === 1 ? '' : 's'} available
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 text-right">
          <div>
            <p className="text-[20px] font-bold text-[var(--foreground)] tracking-tight">
              {occupiedSeats + reservedSeats} / {totalSeats}
            </p>
            <p className="text-[11px] text-[var(--foreground-muted)]">Total Allocated Seats</p>
          </div>
          {isAdmin && isLimitReached && (
            <button
              type="button"
              onClick={() => alert('Subscription Upgrade: Contact REGrow support or sales representative to expand seat allowances.')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[12px] font-medium text-white bg-[var(--brand)] hover:bg-[var(--brand-hover)] transition-colors shadow-2xs"
            >
              <span>Add Seats</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      <div className="pt-4">
        <div className="w-full h-2.5 rounded-full bg-surface-hover overflow-hidden flex">
          <div
            style={{ width: `${occupiedPercent}%` }}
            className="h-full bg-[var(--brand)] transition-all duration-300"
            title={`Active: ${occupiedSeats} seats (${occupiedPercent}%)`}
          />
          <div
            style={{ width: `${reservedPercent}%` }}
            className="h-full bg-amber-400 transition-all duration-300"
            title={`Reserved: ${reservedSeats} seats (${reservedPercent}%)`}
          />
        </div>

        <div className="flex items-center justify-between text-[11px] text-[var(--foreground-muted)] mt-2">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[var(--brand)]" />
              <span>Active ({occupiedSeats})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>Reserved Invites ({reservedSeats})</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-surface-hover" />
              <span>Available ({availableSeats})</span>
            </span>
          </div>

          {isLimitReached && (
            <span className="text-warning font-semibold flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Seat quota reached</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
