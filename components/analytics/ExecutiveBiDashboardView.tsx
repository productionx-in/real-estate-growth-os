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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-default pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Developer Analytics & Business Intelligence
          </h1>
          <p className="mt-1 text-sm text-subtle">
            Executive performance metrics, marketing attribution, conversion velocity, and inventory absorption for {orgName}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-accent-bg text-accent border border-accent-border">
            Real-Time Analytics
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface p-5 rounded-lg border border-default shadow-xs">
          <div className="text-xs font-medium text-subtle uppercase tracking-wider">
            Total Inventory Value
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            ₹{(inventoryAbsorption.totalInventoryValue / 10000000).toFixed(2)} Cr
          </div>
          <div className="mt-1 text-xs text-subtle">
            Sold: ₹{(inventoryAbsorption.soldInventoryValue / 10000000).toFixed(2)} Cr
          </div>
        </div>

        <div className="bg-surface p-5 rounded-lg border border-default shadow-xs">
          <div className="text-xs font-medium text-subtle uppercase tracking-wider">
            Absorption Rate
          </div>
          <div className="mt-2 text-2xl font-bold text-accent">
            {inventoryAbsorption.absorptionRate}%
          </div>
          <div className="mt-1 text-xs text-subtle">
            {inventoryAbsorption.bookedUnits + inventoryAbsorption.soldUnits} / {inventoryAbsorption.totalUnits} Units Booked
          </div>
        </div>

        <div className="bg-surface p-5 rounded-lg border border-default shadow-xs">
          <div className="text-xs font-medium text-subtle uppercase tracking-wider">
            Sales Velocity
          </div>
          <div className="mt-2 text-2xl font-bold text-warning">
            {salesVelocityDays} Days
          </div>
          <div className="mt-1 text-xs text-subtle">
            Avg lead enquiry to booking
          </div>
        </div>

        <div className="bg-surface p-5 rounded-lg border border-default shadow-xs">
          <div className="text-xs font-medium text-subtle uppercase tracking-wider">
            Total Enquiries
          </div>
          <div className="mt-2 text-2xl font-bold text-success">
            {funnel[0]?.count || 0}
          </div>
          <div className="mt-1 text-xs text-subtle">
            Across Meta, Google, Portals & CPs
          </div>
        </div>
      </div>

      {/* Funnel & Absorption Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Sales Conversion Funnel */}
        <div className="bg-surface p-6 rounded-lg border border-default shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-foreground">
            Sales Conversion Funnel
          </h2>
          <div className="space-y-3">
            {funnel.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs font-medium text-muted">
                  <span>{item.stage}</span>
                  <span>
                    {item.count} ({item.conversionRateFromPrevious}% step conv)
                  </span>
                </div>
                <div className="w-full bg-surface-hover rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-accent h-3 rounded-full transition-all"
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
        <div className="bg-surface p-6 rounded-lg border border-default shadow-xs space-y-4">
          <h2 className="text-base font-semibold text-foreground">
            Channel Sourcing & Attribution
          </h2>
          <div className="divide-y divide-default max-h-72 overflow-y-auto">
            {channels.length === 0 ? (
              <p className="text-xs text-subtle italic py-4">No channel data recorded yet</p>
            ) : (
              channels.map((ch, idx) => (
                <div key={idx} className="py-2.5 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-semibold text-foreground capitalize">{ch.channel.replace(/_/g, ' ')}</span>
                    <span className="text-subtle ml-2">{ch.leadCount} leads</span>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-foreground">
                      ₹{(ch.bookingValue / 100000).toFixed(1)} L
                    </span>
                    <span className="text-success ml-2 font-medium">
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
