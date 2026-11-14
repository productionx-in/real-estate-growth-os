// app/(dashboard)/[orgSlug]/analytics/page.tsx
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getExecutiveBiAnalytics } from '@/lib/dal/analytics'
import { ExecutiveBiDashboardView } from '@/components/analytics/ExecutiveBiDashboardView'

export const metadata: Metadata = { title: 'Developer Analytics & BI' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function AnalyticsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org } = await getVerifiedWorkspace(orgSlug)
  const analytics = await getExecutiveBiAnalytics(org.id)

  return (
    <PageShell
      title="Developer Analytics"
      description={`Executive analytics and business intelligence for ${org.name}`}
    >
      <ExecutiveBiDashboardView analytics={analytics} orgName={org.name} />
    </PageShell>
  )
}
