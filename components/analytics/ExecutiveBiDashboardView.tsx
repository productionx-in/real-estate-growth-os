// components/analytics/ExecutiveBiDashboardView.tsx — Reports → Overview: inventory, conversion and channels at a glance,
// all drawn with the shared chart kit (components/ui/chart.tsx), each chart switchable to a table of the same numbers.
'use client'

import type { ExecutiveBiSummary } from '@/lib/dal/analytics'
import { BarList, ChartFrame, StatTile } from '@/components/ui/chart'

interface ExecutiveBiDashboardProps {
  analytics: ExecutiveBiSummary
  orgName: string
}

const cr = (n: number) => (n >= 1e7 ? `₹${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `₹${(n / 1e5).toFixed(1)} L` : `₹${Math.round(n).toLocaleString('en-IN')}`)
const nice = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())

export function ExecutiveBiDashboardView({ analytics, orgName }: ExecutiveBiDashboardProps) {
  const { funnel, salesVelocityDays, channels, inventoryAbsorption: inv } = analytics
  const funnelRows = funnel.map((f, i) => ({ label: f.stage, value: f.count, hint: i ? `${f.conversionRateFromPrevious}% of the step before` : undefined, tone: 1 as const }))
  const channelRows = [...channels].sort((a, b) => b.leadCount - a.leadCount).map((c) => ({ label: nice(c.channel), value: c.leadCount, hint: `${c.bookingCount} booked · ${cr(c.bookingValue)}`, tone: 2 as const }))
  const unitRows = [
    { label: 'Available', value: inv.availableUnits, tone: 2 as const },
    { label: 'On hold', value: inv.blockedUnits, tone: 3 as const },
    { label: 'Booked', value: inv.bookedUnits, tone: 1 as const },
    { label: 'Sold', value: inv.soldUnits, tone: 4 as const },
  ]
  return (
    <div className="space-y-6">
      <p className="text-[13px] text-muted">📊 How {orgName} is doing, all time.</p>
      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Enquiries" value={(funnel[0]?.count ?? 0).toLocaleString('en-IN')} hint="From every source" />
        <StatTile label="Units booked or sold" value={`${inv.absorptionRate}%`} hint={`${inv.bookedUnits + inv.soldUnits} of ${inv.totalUnits} units`} tone={2} />
        <StatTile label="Days from enquiry to booking" value={salesVelocityDays === null ? '—' : salesVelocityDays} hint={salesVelocityDays === null ? 'Shows after the first booking' : 'Average'} />
        <StatTile label="Inventory value" value={cr(inv.totalInventoryValue)} hint={`${cr(inv.soldInventoryValue)} sold`} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <ChartFrame title="Conversion funnel" description="How many leads reach each step." rows={funnelRows} valueLabel="Leads">
          <BarList rows={funnelRows} max={funnel[0]?.count} empty="No leads yet." />
        </ChartFrame>
        <ChartFrame title="Where leads come from" description="Leads by source, with bookings and their value." rows={channelRows} valueLabel="Leads">
          <BarList rows={channelRows} empty="No sources recorded yet." />
        </ChartFrame>
        <ChartFrame title="Inventory" description="Units by status, across all projects." rows={unitRows} valueLabel="Units"
          legend={unitRows.map((r) => ({ label: r.label, tone: r.tone }))} className="lg:col-span-2">
          <BarList rows={unitRows} max={inv.totalUnits} empty="No units yet." />
        </ChartFrame>
      </div>
    </div>
  )
}
