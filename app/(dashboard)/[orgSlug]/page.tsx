// app/(dashboard)/[orgSlug]/page.tsx — the workspace home: a greeting, the action board and the summary.
// Owners, admins and managers can preview it as any active team member (?as=<profile id>): the board and summary
// are computed exactly as for that person's role and queue. Read-only preview; the server checks membership.
import type { Metadata } from 'next'
import Link from 'next/link'
import { z } from 'zod'
import { PageShell } from '@/components/layout/PageShell'
import { WorkspaceOverview } from '@/components/dashboard/WorkspaceOverview'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getSetupChecklist } from '@/lib/dal/onboarding'
import { SetupChecklist } from '@/components/onboarding/SetupChecklist'
import { ActionBoard } from '@/components/dashboard/ActionBoard'
import { ViewAsPicker } from '@/components/dashboard/ViewAsPicker'
import { getActionBoard, PERIODS, type Period } from '@/lib/dal/action-board'
import { leadScopeOf, ROLE_LABELS } from '@/lib/auth/permissions'
import { createServiceClient } from '@/lib/supabase/server'
import { firstName, greeting } from '@/lib/dashboard/greeting'
import type { MemberRole } from '@/types/database'

export const metadata: Metadata = { title: 'Overview' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<{ period?: string; as?: string }>
}

type MemberRow = { profile_id: string; role: MemberRole; profile: { full_name: string | null } | { full_name: string | null }[] | null }

export default async function WorkspacePage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const { period: rawPeriod, as } = await searchParams
  const period: Period = rawPeriod && rawPeriod in PERIODS ? (rawPeriod as Period) : '7d'
  const { org, role, profile, isManager } = await getVerifiedWorkspace(orgSlug)

  // "View as": only owners, admins and managers, only active members of this workspace, never oneself.
  const members = isManager
    ? ((await createServiceClient().from('org_members').select('profile_id, role, profile:profiles!org_members_profile_id_fkey(full_name)')
        .eq('org_id', org.id).eq('status', 'active').neq('profile_id', profile.id)).data ?? []) as unknown as MemberRow[]
    : []
  const nameOf = (m: MemberRow) => (Array.isArray(m.profile) ? m.profile[0]?.full_name : m.profile?.full_name) || 'Team member'
  const target = isManager && as && z.string().uuid().safeParse(as).success ? members.find((m) => m.profile_id === as) ?? null : null

  const viewRole: MemberRole = target?.role ?? role
  const viewProfileId = target?.profile_id ?? profile.id
  const viewName = target ? nameOf(target) : profile.full_name
  const viewIsManager = ['owner', 'admin', 'manager'].includes(viewRole)

  // Whole-organisation roles see the organisation; everyone else their own queue (lib/auth/permissions.ts).
  const mine = leadScopeOf(viewRole) !== 'all'
  const board = await getActionBoard({ orgId: org.id, profileId: mine ? viewProfileId : null, period, includeTeam: viewIsManager })
  const setup = !target && isManager && org.type === 'developer' ? await getSetupChecklist(org.id, orgSlug, profile.id) : null
  const { hello, date } = greeting()

  return (
    <PageShell
      title={`${hello}, ${firstName(viewName)}`}
      description={`${date} · ${mine ? 'Your calls, follow-ups and visits' : org.name}`}
      actions={members.length > 0 ? (
        <ViewAsPicker current={target?.profile_id ?? null}
          members={members.map((m) => ({ id: m.profile_id, label: `${nameOf(m)} · ${ROLE_LABELS[m.role] ?? m.role}` })).sort((a, b) => a.label.localeCompare(b.label))} />
      ) : undefined}
    >
      {target && (
        <div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-default bg-info-bg px-4 py-3 text-[13px] text-info">
          <span>Viewing the home page as <strong>{nameOf(target)}</strong> ({ROLE_LABELS[target.role] ?? target.role}). A preview: actions you take still act as you.</span>
          <Link href={`/${orgSlug}${period !== '7d' ? `?period=${period}` : ''}`} className="font-medium underline">Back to my view</Link>
        </div>
      )}
      {setup && <SetupChecklist orgId={org.id} steps={setup} />}
      <ActionBoard board={board} orgSlug={orgSlug} showTeam={viewIsManager} mine={mine} keep={target ? `&as=${target.profile_id}` : ''} />
      <h2 className="mb-3 mt-8 text-[13px] font-semibold text-muted">Workspace summary</h2>
      <WorkspaceOverview
        orgSlug={orgSlug}
        orgId={org.id}
        role={viewRole}
        profileId={viewProfileId}
      />
    </PageShell>
  )
}
