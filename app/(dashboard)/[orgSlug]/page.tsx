// app/(dashboard)/[orgSlug]/page.tsx — Workspace home / overview
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { WorkspaceOverview } from '@/components/dashboard/WorkspaceOverview'

export const metadata: Metadata = { title: 'Overview' }

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function WorkspacePage({ params }: PageProps) {
  const { orgSlug } = await params

  return (
    <PageShell
      title="Overview"
      description="Your workspace at a glance"
    >
      <WorkspaceOverview orgSlug={orgSlug} />
    </PageShell>
  )
}
