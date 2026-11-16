'use client'
// components/buyers/Buyer360View.tsx
import React, { useState } from 'react'
import {
  User,
  Users,
  Building2,
  Calendar,
  CreditCard,
  FileText,
  Clock,
  ArrowLeft,
  Edit,
  ShieldCheck,
  Phone,
  Mail,
} from 'lucide-react'
import Link from 'next/link'
import type { Buyer360Data, BookingPayment } from '@/lib/buyers/types'
import { BuyerOverviewTab } from './tabs/BuyerOverviewTab'
import { BuyerEnquiriesTab } from './tabs/BuyerEnquiriesTab'
import { BuyerPortfolioTab } from './tabs/BuyerPortfolioTab'
import { BuyerPaymentScheduleTab } from './tabs/BuyerPaymentScheduleTab'
import { BuyerDocumentsTab } from './tabs/BuyerDocumentsTab'
import { UpsertBuyerModal } from './UpsertBuyerModal'
import { RecordPaymentModal } from './RecordPaymentModal'
import { UploadDocumentModal } from './UploadDocumentModal'

interface Buyer360ViewProps {
  initialData: Buyer360Data
  orgSlug: string
  orgId: string
  isManager: boolean
}

type TabKey = 'overview' | 'enquiries' | 'portfolio' | 'payments' | 'documents'

export function Buyer360View({
  initialData,
  orgSlug,
  orgId,
  isManager,
}: Buyer360ViewProps) {
  const [data, setData] = useState<Buyer360Data>(initialData)
  const [activeTab, setActiveTab] = useState<TabKey>('overview')

  // Modals state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState(false)
  const [isUploadDocOpen, setIsUploadDocOpen] = useState(false)
  const [selectedBookingForPayment, setSelectedBookingForPayment] = useState<string>('')

  const refreshData = async () => {
    try {
      const res = await fetch(`/api/buyers/${data.buyer.id}?orgId=${orgId}`)
      const json = await res.json()
      if (res.ok && json.data) {
        setData(json.data)
      }
    } catch {
      // Keep optimistic or existing state
    }
  }

  const { buyer, portfolioSummary } = data

  return (
    <div className="space-y-6">
      {/* 1. Top Navigation & Identity Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/${orgSlug}/buyers`}
            className="rounded-lg border border-[var(--border)] p-2 text-[var(--foreground-muted)] hover:bg-[var(--surface-muted)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="h-10 w-10 rounded-full bg-[var(--brand)] text-white flex items-center justify-center font-bold text-base shadow-sm">
            {buyer.full_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-[var(--foreground)]">{buyer.full_name}</h1>
              <span className="rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 text-[11px] font-semibold uppercase">
                {buyer.status}
              </span>
              {buyer.pan_number && (
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  PAN: {buyer.pan_number}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--foreground-muted)] mt-0.5">
              <span className="flex items-center gap-1">
                <Phone className="h-3 w-3" /> {buyer.phone}
              </span>
              {buyer.email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-3 w-3" /> {buyer.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsEditModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-muted)] transition-colors shadow-sm"
          >
            <Edit className="h-3.5 w-3.5" />
            Edit Profile
          </button>
        </div>
      </div>

      {/* 2. Navigation Tabs */}
      <div className="border-b border-[var(--border)]">
        <nav className="flex space-x-6">
          <button
            onClick={() => setActiveTab('overview')}
            className={`pb-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <User className="h-4 w-4" />
            Overview
          </button>

          <button
            onClick={() => setActiveTab('enquiries')}
            className={`pb-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'enquiries'
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Users className="h-4 w-4" />
            Enquiries & Activity ({data.leads.length})
          </button>

          <button
            onClick={() => setActiveTab('portfolio')}
            className={`pb-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'portfolio'
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <Building2 className="h-4 w-4" />
            Bookings & Portfolio ({data.portfolio.length})
          </button>

          <button
            onClick={() => setActiveTab('payments')}
            className={`pb-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'payments'
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <CreditCard className="h-4 w-4" />
            Payment Schedule & Ledger
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`pb-3 text-xs font-semibold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === 'documents'
                ? 'border-[var(--brand)] text-[var(--brand)]'
                : 'border-transparent text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
            }`}
          >
            <FileText className="h-4 w-4" />
            Documents & KYC ({data.documents.length})
          </button>
        </nav>
      </div>

      {/* 3. Active Tab Content */}
      {activeTab === 'overview' && (
        <BuyerOverviewTab
          data={data}
          onEditBuyer={() => setIsEditModalOpen(true)}
        />
      )}

      {activeTab === 'enquiries' && <BuyerEnquiriesTab data={data} />}

      {activeTab === 'portfolio' && (
        <BuyerPortfolioTab
          portfolio={data.portfolio}
          onSelectBookingForMilestones={(bookingId) => {
            setSelectedBookingForPayment(bookingId)
            setActiveTab('payments')
          }}
        />
      )}

      {activeTab === 'payments' && (
        <BuyerPaymentScheduleTab
          orgId={orgId}
          portfolio={data.portfolio}
          milestones={data.milestones}
          payments={data.payments}
          isManager={isManager}
          onOpenRecordPayment={(bId) => {
            setSelectedBookingForPayment(bId)
            setIsRecordPaymentOpen(true)
          }}
          onRefreshData={refreshData}
        />
      )}

      {activeTab === 'documents' && (
        <BuyerDocumentsTab
          orgId={orgId}
          buyerId={buyer.id}
          documents={data.documents}
          isManager={isManager}
          onOpenUpload={() => setIsUploadDocOpen(true)}
          onRefreshData={refreshData}
        />
      )}

      {/* 4. Modals */}
      <UpsertBuyerModal
        orgId={orgId}
        buyer={buyer}
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSuccess={() => refreshData()}
      />

      <RecordPaymentModal
        orgId={orgId}
        bookingId={selectedBookingForPayment || data.portfolio[0]?.booking_id || ''}
        milestones={data.milestones.filter(
          (m) => m.booking_id === (selectedBookingForPayment || data.portfolio[0]?.booking_id)
        )}
        isOpen={isRecordPaymentOpen}
        onClose={() => setIsRecordPaymentOpen(false)}
        onSuccess={() => refreshData()}
      />

      <UploadDocumentModal
        orgId={orgId}
        buyerId={buyer.id}
        bookingIds={data.portfolio.map((p) => ({
          id: p.booking_id,
          number: p.booking_number,
        }))}
        isOpen={isUploadDocOpen}
        onClose={() => setIsUploadDocOpen(false)}
        onSuccess={() => refreshData()}
      />
    </div>
  )
}
