// components/analytics/ExecutiveBiDashboardView.tsx
'use client'

import React from 'react'
import type { ExecutiveBiSummary } from '@/lib/dal/analytics'

interface ExecutiveBiDashboardProps {
  analytics: ExecutiveBiSummary
  orgName: string
}

export function ExecutiveBiDashboardView({ analytics, orgName }: ExecutiveBiDashboardProps) {
  const { funnel, salesVelocityDays, channels, inventoryAbsorption } = analytics

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            Developer Analytics & Business Intelligence
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Executive performance metrics, marketing attribution, conversion velocity, and inventory absorption for {orgName}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            Real-Time Analytics
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Total Inventory Value
          </div>
          <div className="mt-2 text-2xl font-bold text-gray-900">
            ₹{(inventoryAbsorption.totalInventoryValue / 10000000).toFixed(2)} Cr
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Sold: ₹{(inventoryAbsorption.soldInventoryValue / 10000000).toFixed(2)} Cr
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Absorption Rate
          </div>
          <div className="mt-2 text-2xl font-bold text-indigo-600">
            {inventoryAbsorption.absorptionRate}%
          </div>
          <div className="mt-1 text-xs text-gray-400">
            {inventoryAbsorption.bookedUnits + inventoryAbsorption.soldUnits} / {inventoryAbsorption.totalUnits} Units Booked
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Sales Velocity
          </div>
          <div className="mt-2 text-2xl font-bold text-amber-600">
            {salesVelocityDays} Days
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Avg lead enquiry to booking
          </div>
        </div>

        <div className="bg-white p-5 rounded-lg border border-gray-200 shadow-xs">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Total Enquiries
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-600">
            {funnel[0]?.count || 0}
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Across Meta, Google, Portals & CPs
          </div>
        </div>
      </div>

      {/* Funnel & Absorption Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales Conversion Funnel */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            Sales Conversion Funnel
          </h2>
          <div className="space-y-3">
            {funnel.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-gray-700">
                  <span>{item.stage}</span>
                  <span>
                    {item.count} ({item.conversionRateFromPrevious}% step conv)
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-3 rounded-full transition-all"
                    style={{
                      width: `${Math.max(5, (item.count / (funnel[0]?.count || 1)) * 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Marketing Channel Breakdown */}
        <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-gray-900">
            Channel Sourcing & Attribution
          </h2>
          <div className="divide-y divide-gray-100 max-h-72 overflow-y-auto">
            {channels.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-4">No channel data recorded yet</p>
            ) : (
              channels.map((ch, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-gray-800 capitalize">{ch.channel.replace(/_/g, ' ')}</span>
                    <span className="text-gray-400 ml-2">{ch.leadCount} leads</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-gray-900">
                      ₹{(ch.bookingValue / 100000).toFixed(1)} L
                    </span>
                    <span className="text-emerald-600 ml-2 font-medium">
                      ({ch.bookingCount} bookings)
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
