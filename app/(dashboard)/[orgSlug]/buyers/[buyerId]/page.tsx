// app/(dashboard)/[orgSlug]/buyers/[buyerId]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getBuyer360 } from '@/lib/dal/buyers'
import { Buyer360View } from '@/components/buyers/Buyer360View'

export const metadata: Metadata = { title: 'Buyer 360 Detail' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string; buyerId: string }>
}

export default async function BuyerDetailPage({ params }: PageProps) {
  const { orgSlug, buyerId } = await params
  const { org, isManager } = await getVerifiedWorkspace(orgSlug)

  const result = await getBuyer360(buyerId, org.id)
  if (!result.success || !result.data) {
    notFound()
  }

  return (
    <PageShell
      title={`Buyer 360 · ${result.data.buyer.full_name}`}
      description={`Customer portfolio, financial fulfillment, and KYC management for ${result.data.buyer.full_name}`}
    >
      <Buyer360View
        initialData={result.data}
        orgSlug={orgSlug}
        orgId={org.id}
        isManager={isManager}
      />
    </PageShell>
  )
}
