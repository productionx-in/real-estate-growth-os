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
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)

  const isSalesExec = role === 'sales_exec'

  return (
    <PageShell
      title={isSalesExec ? 'Sales Pipeline' : 'Overview'}
      description={
        isSalesExec
          ? `${profile.full_name.split(' ')[0]}'s active calling queue and assigned pipeline for ${org.name}`
          : `${org.name} · ${org.type === 'developer' ? 'Property Developer' : 'Channel Partner'} Workspace`
      }
    >
      <WorkspaceOverview
        orgSlug={orgSlug}
        orgId={org.id}
        role={role}
        profileId={profile.id}
      />
    </PageShell>
  )
}
