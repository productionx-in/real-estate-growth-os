'use client'
// components/buyers/BuyersListView.tsx
import React, { useState } from 'react'
import Link from 'next/link'
import {
  Users,
  Search,
  Plus,
  Building2,
  CreditCard,
  ExternalLink,
  Phone,
  Mail,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import type { BuyerProfile } from '@/lib/buyers/types'
import { UpsertBuyerModal } from './UpsertBuyerModal'
import { formatDate } from '@/lib/utils/format'

interface BuyerItem extends BuyerProfile {
  totalBookings: number
  totalConsideration: number
  totalPaid: number
}

interface BuyersListViewProps {
  initialBuyers: BuyerItem[]
  orgSlug: string
  orgId: string
  isManager: boolean
}

export function BuyersListView({
  initialBuyers,
  orgSlug,
  orgId,
  isManager,
}: BuyersListViewProps) {
  const [buyers, setBuyers] = useState<BuyerItem[]>(initialBuyers)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isNewBuyerModalOpen, setIsNewBuyerModalOpen] = useState(false)

  const filteredBuyers = buyers.filter((b) => {
    const matchesSearch =
      b.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      b.phone.includes(searchTerm) ||
      (b.pan_number && b.pan_number.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (b.email && b.email.toLowerCase().includes(searchTerm.toLowerCase()))

    const matchesStatus = statusFilter === 'all' || b.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Summary Metrics
  const totalRegistered = buyers.length
  const totalConsideration = buyers.reduce((acc, b) => acc + b.totalConsideration, 0)
  const totalPaid = buyers.reduce((acc, b) => acc + b.totalPaid, 0)
  const totalOutstanding = Math.max(0, totalConsideration - totalPaid)

  const handleBuyerCreated = (newBuyer: BuyerProfile) => {
    setBuyers((prev) => [
      {
        ...newBuyer,
        totalBookings: 0,
        totalConsideration: 0,
        totalPaid: 0,
      },
      ...prev,
    ])
  }

  return (
    <div className="space-y-6">
      {/* 1. Metric Overview Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
            Total Buyers
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">{totalRegistered}</p>
          <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">Registered Customer Profiles</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
            Total Consideration
          </p>
          <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">
            ₹{totalConsideration.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[11px] text-[var(--foreground-muted)]">Across Booked Units</p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider">
            Verified Collections
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">
            ₹{totalPaid.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[11px] text-emerald-600">
            {totalConsideration > 0 ? `${Math.round((totalPaid / totalConsideration) * 100)}% Realized` : '0%'}
          </p>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 shadow-sm">
          <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wider">
            Outstanding Balance
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-700">
            ₹{totalOutstanding.toLocaleString('en-IN')}
          </p>
          <p className="mt-1 text-[11px] text-amber-600">Pending Milestones</p>
        </div>
      </div>

      {/* 2. Controls & Search */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-1 items-center gap-3 min-w-[280px] max-w-md">
          <div className="relative w-full">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-[var(--foreground-muted)]" />
            <input
              type="text"
              placeholder="Search by customer name, phone, PAN, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] pl-9 pr-3 py-2 text-xs text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:border-[var(--brand)] focus:outline-none shadow-sm"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--foreground)] focus:border-[var(--brand)] focus:outline-none shadow-sm"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <button
          onClick={() => setIsNewBuyerModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--brand)] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-90 transition-opacity"
        >
          <Plus className="h-4 w-4" />
          Register New Buyer
        </button>
      </div>

      {/* 3. Buyers Directory Table */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm overflow-hidden">
        {filteredBuyers.length === 0 ? (
          <div className="p-8 text-center text-xs text-[var(--foreground-muted)] space-y-2">
            <Users className="mx-auto h-8 w-8 text-[var(--foreground-muted)]" />
            <p className="font-semibold text-[var(--foreground)]">No buyer records found</p>
            <p>Try adjusting your search criteria or register a new buyer profile.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[var(--border)] bg-[var(--surface-muted)] text-[11px] font-semibold text-[var(--foreground-muted)] uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Customer Name</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">PAN / Tax ID</th>
                  <th className="px-4 py-3">Bookings</th>
                  <th className="px-4 py-3">Total Consideration</th>
                  <th className="px-4 py-3">Verified Paid</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {filteredBuyers.map((b) => {
                  const balance = Math.max(0, b.totalConsideration - b.totalPaid)
                  return (
                    <tr key={b.id} className="hover:bg-[var(--surface-muted)] transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/${orgSlug}/buyers/${b.id}`}
                          className="font-bold text-[var(--foreground)] hover:text-[var(--brand)] transition-colors"
                        >
                          {b.full_name}
                        </Link>
                        {b.city && (
                          <div className="text-[11px] text-[var(--foreground-muted)]">{b.city}, {b.state || b.country}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-[var(--foreground)]">{b.phone}</div>
                        {b.email && (
                          <div className="text-[11px] text-[var(--foreground-muted)]">{b.email}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        {b.pan_number ? (
                          <span className="font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded text-[10px]">
                            {b.pan_number}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--foreground-muted)] italic">Missing</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-[var(--foreground)]">
                          {b.totalBookings} unit(s)
                        </span>
                      </td>
                      <td className="px-4 py-3 font-bold text-[var(--foreground)]">
                        ₹{b.totalConsideration.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-emerald-700">
                        ₹{b.totalPaid.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 font-semibold text-amber-700">
                        ₹{balance.toLocaleString('en-IN')}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/${orgSlug}/buyers/${b.id}`}
                          className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors"
                        >
                          View 360
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UpsertBuyerModal
        orgId={orgId}
        isOpen={isNewBuyerModalOpen}
        onClose={() => setIsNewBuyerModalOpen(false)}
        onSuccess={handleBuyerCreated}
      />
    </div>
  )
}
