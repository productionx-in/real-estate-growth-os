// components/sales/SalesOperationsView.tsx
'use client'

import React, { useState } from 'react'
import type { SiteVisit, Booking, ChannelPartner, Deal } from '@/lib/sales/types'

interface SalesOperationsViewProps {
  initialSiteVisits: SiteVisit[]
  initialBookings: Booking[]
  initialChannelPartners: ChannelPartner[]
  initialDeals: Deal[]
  orgName: string
}

export function SalesOperationsView({
  initialSiteVisits,
  initialBookings,
  initialChannelPartners,
  initialDeals,
  orgName,
}: SalesOperationsViewProps) {
  const [activeTab, setActiveTab] = useState<'visits' | 'bookings' | 'partners' | 'deals'>('deals')
  const [siteVisits] = useState<SiteVisit[]>(initialSiteVisits)
  const [bookings] = useState<Booking[]>(initialBookings)
  const [partners] = useState<ChannelPartner[]>(initialChannelPartners)
  const [deals] = useState<Deal[]>(initialDeals)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Sales & Channel Partner Operations
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage site visits, inventory blockings, confirmed bookings, broker partnerships, and sales pipelines for {orgName}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            Pipeline Active
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          {[
            { id: 'deals', label: 'Sales Deals Pipeline', count: deals.length },
            { id: 'visits', label: 'Site Visits', count: siteVisits.length },
            { id: 'bookings', label: 'Bookings & Holds', count: bookings.length },
            { id: 'partners', label: 'Channel Partners', count: partners.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`ml-1 py-0.5 px-2 rounded-full text-xs ${
                  activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Panels */}
      {activeTab === 'deals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {['enquiry', 'site_visit_scheduled', 'negotiation', 'booked'].map((stage) => {
              const stageDeals = deals.filter((d) => d.stage === stage)
              const totalVal = stageDeals.reduce((sum, d) => sum + (d.deal_value || 0), 0)
              return (
                <div key={stage} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-600">
                      {stage.replace(/_/g, ' ')}
                    </span>
                    <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium">
                      {stageDeals.length}
                    </span>
                  </div>
                  <div className="text-sm font-semibold text-gray-900 mb-3">
                    ₹{(totalVal / 100000).toFixed(1)} Lakhs
                  </div>
                  <div className="space-y-2">
                    {stageDeals.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No deals in this stage</p>
                    ) : (
                      stageDeals.map((deal) => (
                        <div
                          key={deal.id}
                          className="bg-white p-3 rounded shadow-xs border border-gray-100 text-xs space-y-1.5 hover:border-gray-300 transition-colors"
                        >
                          <div className="font-semibold text-gray-900 leading-tight">
                            {deal.lead?.name || `Lead #${deal.lead_id.slice(0, 8)}`}
                          </div>
                          {deal.lead?.phone && (
                            <div className="text-[11px] text-gray-500 font-mono">
                              {deal.lead.phone}
                            </div>
                          )}
                          {deal.project?.name && (
                            <div className="text-[11px] text-indigo-700 font-medium bg-indigo-50 px-1.5 py-0.5 rounded w-fit">
                              {deal.project.name}
                            </div>
                          )}
                          <div className="pt-1 border-t border-gray-100 flex justify-between items-center text-[11px]">
                            <span className="text-gray-500">
                              Val: <strong className="text-gray-800">₹{deal.deal_value ? deal.deal_value.toLocaleString('en-IN') : 'N/A'}</strong>
                            </span>
                            <span className="text-gray-400 font-medium">{deal.probability}%</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {activeTab === 'visits' && (
        <div className="bg-white shadow-xs rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-sm text-gray-700">
            Scheduled & Completed Site Visits
          </div>
          <div className="divide-y divide-gray-100">
            {siteVisits.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No site visits recorded yet. Schedule a visit from the Lead Detail page.
              </div>
            ) : (
              siteVisits.map((visit) => (
                <div key={visit.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      Scheduled: {new Date(visit.scheduled_at).toLocaleString()}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Visitors: {visit.visitor_count} | Cab Arranged: {visit.cab_required ? 'Yes' : 'No'}
                    </div>
                    {visit.notes && <div className="text-xs text-gray-600 mt-1 italic">&ldquo;{visit.notes}&rdquo;</div>}
                  </div>
                  <div className="flex items-center gap-3">
                    {visit.outcome && (
                      <span className="text-xs bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                        {visit.outcome}
                      </span>
                    )}
                    <span className="text-xs bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                      {visit.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'bookings' && (
        <div className="bg-white shadow-xs rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-sm text-gray-700">
            Confirmed Bookings & Active Holds
          </div>
          <div className="divide-y divide-gray-100">
            {bookings.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No bookings recorded yet. Convert an active hold or book directly from the inventory Explorer.
              </div>
            ) : (
              bookings.map((b) => (
                <div key={b.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">
                      Booking #{b.booking_number}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Plan: {b.payment_plan} | Date: {b.booking_date}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      ₹{b.total_amount.toLocaleString('en-IN')}
                    </div>
                    <div className="text-xs text-emerald-600">
                      Paid: ₹{b.booking_amount_received.toLocaleString('en-IN')}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'partners' && (
        <div className="bg-white shadow-xs rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 font-medium text-sm text-gray-700">
            Registered Channel Partners (Brokers & Agencies)
          </div>
          <div className="divide-y divide-gray-100">
            {partners.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No channel partners registered yet. Onboard brokers with their RERA credentials to track sourcing attribution.
              </div>
            ) : (
              partners.map((cp) => (
                <div key={cp.id} className="p-4 flex items-center justify-between hover:bg-gray-50">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{cp.firm_name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Contact: {cp.contact_person} ({cp.phone}) | RERA: {cp.rera_registration_number || 'N/A'}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded font-medium uppercase">
                      {cp.tier}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                      {cp.default_commission_rate}% Comm
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
