// app/(dashboard)/[orgSlug]/page.tsx
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { WorkspaceOverview } from '@/components/dashboard/WorkspaceOverview'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'

export const metadata: Metadata = { title: 'Overview' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function WorkspacePage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org } = await getVerifiedWorkspace(orgSlug)

  return (
    <PageShell
      title="Overview"
      description={`${org.name} · ${org.type === 'developer' ? 'Property Developer' : 'Channel Partner'} Workspace`}
    >
      <WorkspaceOverview orgSlug={orgSlug} orgId={org.id} />
    </PageShell>
  )
}
