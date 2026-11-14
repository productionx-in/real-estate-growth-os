// app/(dashboard)/[orgSlug]/sales/page.tsx
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getSiteVisits, getBookings, getChannelPartners, getDeals } from '@/lib/dal/sales'
import { SalesOperationsView } from '@/components/sales/SalesOperationsView'

export const metadata: Metadata = { title: 'Sales & Channel Partner Operations' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function SalesPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org } = await getVerifiedWorkspace(orgSlug)

  const [siteVisits, bookings, partners, deals] = await Promise.all([
    getSiteVisits(org.id),
    getBookings(org.id),
    getChannelPartners(org.id),
    getDeals(org.id),
  ])

  return (
    <PageShell
      title="Sales Operations"
      description={`Manage site visits, bookings, channel partners, and pipeline for ${org.name}`}
    >
      <SalesOperationsView
        initialSiteVisits={siteVisits}
        initialBookings={bookings}
        initialChannelPartners={partners}
        initialDeals={deals}
        orgName={org.name}
      />
    </PageShell>
  )
}
