// lib/dal/analytics.ts
// Business Intelligence & Developer Analytics DAL for Stage 6D.
// Strictly tenant-isolated via org_id.

import { createServiceClient } from '@/lib/supabase/server'

export interface FunnelStageMetric {
  stage: string
  count: number
  conversionRateFromPrevious: number // %
  conversionRateFromTop: number // %
}

export interface ChannelPerformanceMetric {
  channel: string
  leadCount: number
  siteVisitCount: number
  bookingCount: number
  bookingValue: number
  leadToBookingRate: number // %
}

export interface InventoryAbsorptionMetric {
  totalUnits: number
  availableUnits: number
  blockedUnits: number
  bookedUnits: number
  soldUnits: number
  absorptionRate: number // % (booked + sold) / total
  totalInventoryValue: number
  soldInventoryValue: number
}

export interface ExecutiveBiSummary {
  orgId: string
  period: string
  funnel: FunnelStageMetric[]
  /** Average days from enquiry to booking; null until there is a booking to measure. */
  salesVelocityDays: number | null
  channels: ChannelPerformanceMetric[]
  inventoryAbsorption: InventoryAbsorptionMetric
}

export async function getExecutiveBiAnalytics(
  orgId: string,
  projectId?: string
): Promise<ExecutiveBiSummary> {
  const service = createServiceClient()

  try {
    // 1. Fetch leads count
    let leadsQuery = service.from('leads').select('id, source, created_at').eq('org_id', orgId)
    if (projectId) leadsQuery = leadsQuery.eq('project_id', projectId)
    const { data: leads } = await leadsQuery

    // 2. Fetch site visits count
    let visitsQuery = service.from('site_visits').select('id, status, created_at, lead_id').eq('org_id', orgId)
    if (projectId) visitsQuery = visitsQuery.eq('project_id', projectId)
    const { data: visits } = await visitsQuery

    // 3. Fetch blockings count
    let blockingsQuery = service.from('inventory_blockings').select('id, status').eq('org_id', orgId)
    if (projectId) blockingsQuery = blockingsQuery.eq('project_id', projectId)
    const { data: blockings } = await blockingsQuery

    // 4. Fetch bookings
    let bookingsQuery = service.from('bookings').select('id, total_amount, created_at, lead_id').eq('org_id', orgId)
    if (projectId) bookingsQuery = bookingsQuery.eq('project_id', projectId)
    const { data: bookings } = await bookingsQuery

    // 5. Fetch inventory items
    let invQuery = service.from('inventory_items').select('id, status, base_rate, total_price').eq('org_id', orgId)
    if (projectId) invQuery = invQuery.eq('project_id', projectId)
    const { data: units } = await invQuery

    const totalLeads = leads?.length || 0
    const totalVisits = visits?.length || 0
    const totalBlockings = blockings?.length || 0
    const totalBookings = bookings?.length || 0

    // Funnel calculation
    const funnel: FunnelStageMetric[] = [
      {
        stage: 'Total Enquiries',
        count: totalLeads,
        conversionRateFromPrevious: 100,
        conversionRateFromTop: 100,
      },
      {
        stage: 'Site Visits',
        count: totalVisits,
        conversionRateFromPrevious: totalLeads > 0 ? Math.round((totalVisits / totalLeads) * 1000) / 10 : 0,
        conversionRateFromTop: totalLeads > 0 ? Math.round((totalVisits / totalLeads) * 1000) / 10 : 0,
      },
      {
        stage: 'Unit Holds / Blockings',
        count: totalBlockings,
        conversionRateFromPrevious: totalVisits > 0 ? Math.round((totalBlockings / totalVisits) * 1000) / 10 : 0,
        conversionRateFromTop: totalLeads > 0 ? Math.round((totalBlockings / totalLeads) * 1000) / 10 : 0,
      },
      {
        stage: 'Confirmed Bookings',
        count: totalBookings,
        conversionRateFromPrevious: totalBlockings > 0 ? Math.round((totalBookings / totalBlockings) * 1000) / 10 : 0,
        conversionRateFromTop: totalLeads > 0 ? Math.round((totalBookings / totalLeads) * 1000) / 10 : 0,
      },
    ]

    // Sales Velocity (days from lead creation to booking)
    let totalDays = 0
    let matchedCount = 0
    const leadMap = new Map((leads || []).map((l) => [l.id, new Date(l.created_at).getTime()]))

    for (const b of bookings || []) {
      const leadCreated = leadMap.get(b.lead_id)
      if (leadCreated) {
        const bookedAt = new Date(b.created_at).getTime()
        const diffDays = Math.max(1, Math.round((bookedAt - leadCreated) / (1000 * 3600 * 24)))
        totalDays += diffDays
        matchedCount++
      }
    }
    const salesVelocityDays = matchedCount > 0 ? Math.round(totalDays / matchedCount) : null

    // Channel performance: each visit and booking counted under the source of its own lead (recorded facts only).
    const sourceOf = new Map((leads || []).map((l) => [l.id, l.source || 'other']))
    const channelMap = new Map<string, { leads: number; visits: number; bookings: number; value: number }>()
    const bump = (src: string) => { if (!channelMap.has(src)) channelMap.set(src, { leads: 0, visits: 0, bookings: 0, value: 0 }); return channelMap.get(src)! }
    for (const l of leads || []) bump(l.source || 'other').leads++
    for (const v of visits || []) { const src = sourceOf.get(v.lead_id); if (src && v.status === 'completed') bump(src).visits++ }
    for (const b of bookings || []) { const src = sourceOf.get(b.lead_id); if (src) { const c = bump(src); c.bookings++; c.value += Number(b.total_amount || 0) } }

    const channels: ChannelPerformanceMetric[] = Array.from(channelMap.entries()).map(([channel, data]) => ({
      channel,
      leadCount: data.leads,
      siteVisitCount: data.visits,
      bookingCount: data.bookings,
      bookingValue: data.value,
      leadToBookingRate: data.leads > 0 ? Math.round((data.bookings / data.leads) * 1000) / 10 : 0,
    }))

    // Inventory Absorption
    const unitList = units || []
    const totalUnits = unitList.length
    const availableUnits = unitList.filter((u) => u.status === 'available').length
    const blockedUnits = unitList.filter((u) => u.status === 'blocked' || u.status === 'on_hold').length
    const bookedUnits = unitList.filter((u) => u.status === 'booked').length
    const soldUnits = unitList.filter((u) => u.status === 'sold').length

    const totalVal = unitList.reduce((sum, u) => sum + Number(u.total_price || u.base_rate || 0), 0)
    const soldVal = unitList
      .filter((u) => u.status === 'sold' || u.status === 'booked')
      .reduce((sum, u) => sum + Number(u.total_price || u.base_rate || 0), 0)

    const absorptionRate = totalUnits > 0 ? Math.round(((bookedUnits + soldUnits) / totalUnits) * 1000) / 10 : 0

    return {
      orgId,
      period: 'all_time',
      funnel,
      salesVelocityDays,
      channels,
      inventoryAbsorption: {
        totalUnits,
        availableUnits,
        blockedUnits,
        bookedUnits,
        soldUnits,
        absorptionRate,
        totalInventoryValue: totalVal,
        soldInventoryValue: soldVal,
      },
    }
  } catch {
    return {
      orgId,
      period: 'all_time',
      funnel: [],
      salesVelocityDays: 0,
      channels: [],
      inventoryAbsorption: {
        totalUnits: 0,
        availableUnits: 0,
        blockedUnits: 0,
        bookedUnits: 0,
        soldUnits: 0,
        absorptionRate: 0,
        totalInventoryValue: 0,
        soldInventoryValue: 0,
      },
    }
  }
}
