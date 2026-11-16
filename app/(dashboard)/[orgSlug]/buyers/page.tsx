// app/(dashboard)/[orgSlug]/buyers/page.tsx
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { listBuyers } from '@/lib/dal/buyers'
import { BuyersListView } from '@/components/buyers/BuyersListView'

export const metadata: Metadata = { title: 'Buyer 360 & Customer Directory' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function BuyersPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org, isManager } = await getVerifiedWorkspace(orgSlug)

  const { buyers } = await listBuyers(org.id)

  return (
    <PageShell
      title="Buyer 360 Directory"
      description={`Customer portfolio, financial fulfillment, and KYC records for ${org.name}`}
    >
      <BuyersListView
        initialBuyers={buyers}
        orgSlug={orgSlug}
        orgId={org.id}
        isManager={isManager}
      />
    </PageShell>
  )
}
