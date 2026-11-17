// app/(dashboard)/[orgSlug]/page.tsx
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { WorkspaceOverview } from '@/components/dashboard/WorkspaceOverview'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getSetupChecklist } from '@/lib/dal/onboarding'
import { SetupChecklist } from '@/components/onboarding/SetupChecklist'
import { ActionBoard } from '@/components/dashboard/ActionBoard'
import { getActionBoard, PERIODS, type Period } from '@/lib/dal/action-board'

export const metadata: Metadata = { title: 'Overview' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ period?: string }>
}

export default async function WorkspacePage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const { period: rawPeriod } = await searchParams
  const period: Period = rawPeriod && rawPeriod in PERIODS ? (rawPeriod as Period) : '7d'
  const { org, role, profile, isManager } = await getVerifiedWorkspace(orgSlug)

  const isSalesExec = role === 'sales_exec'
  // Sales executives see their own leads; everyone else sees the whole organisation.
  const mine = isSalesExec
  const board = await getActionBoard({ orgId: org.id, profileId: mine ? profile.id : null, period, includeTeam: isManager })
  const setup = isManager && org.type === 'developer' ? await getSetupChecklist(org.id, orgSlug, profile.id) : null

  return (
    <PageShell
      title={isSalesExec ? 'Sales Pipeline' : 'Overview'}
      description={
        isSalesExec
          ? `${profile.full_name.split(' ')[0]}'s active calling queue and assigned pipeline for ${org.name}`
          : `${org.name} · ${org.type === 'developer' ? 'Property Developer' : 'Channel Partner'} Workspace`
      }
    >
      {setup && <SetupChecklist orgId={org.id} steps={setup} />}
      <ActionBoard board={board} orgSlug={orgSlug} showTeam={isManager} mine={mine} />
      <h2 className="mb-3 mt-8 text-[13px] font-semibold text-muted">Workspace summary</h2>
      <WorkspaceOverview
        orgSlug={orgSlug}
        orgId={org.id}
        role={role}
        profileId={profile.id}
      />
    </PageShell>
  )
}
