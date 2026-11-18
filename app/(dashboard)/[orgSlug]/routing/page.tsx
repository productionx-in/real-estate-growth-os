// app/(dashboard)/[orgSlug]/routing/page.tsx
// Lead routing settings: teams, members (weight / daily cap / duty), routing rules and recent decisions.
// Owner, admin and manager only — the same roles the /api/routing write endpoints accept.
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { canManageRouting } from '@/lib/auth/permissions'
import { createServiceClient } from '@/lib/supabase/server'
import { listRecentRoutingDecisions, listRules, listTeams } from '@/lib/dal/routing'
import { RoutingSettingsClient, type RoutingPageData } from '@/components/routing/RoutingSettingsClient'
import { ResponseSettingsCard } from '@/components/routing/ResponseSettingsCard'
import { getResponseSettings } from '@/lib/dal/follow-ups'
import { ASSIGNABLE_ROLES } from '@/lib/auth/permissions'

export const metadata: Metadata = { title: 'Lead Routing' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function RoutingPage({ params }: PageProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)
  if (!canManageRouting(workspace.role)) redirect(`/${orgSlug}`)

  const orgId = workspace.org.id
  const service = createServiceClient()
  const [teams, rules, decisions, members, projects, responseSettings] = await Promise.all([
    listTeams(orgId),
    listRules(orgId),
    listRecentRoutingDecisions(orgId, 25),
    service.from('org_members').select('profile_id, role, profile:profiles!org_members_profile_id_fkey(id, full_name)')
      .eq('org_id', orgId).eq('status', 'active').in('role', [...ASSIGNABLE_ROLES]),
    service.from('projects').select('id, name').eq('org_id', orgId).order('name'),
    getResponseSettings(orgId),
  ])

  const loadError = [teams, rules, decisions].find((r) => !r.success)
  const data: RoutingPageData = {
    teams: teams.success ? teams.data : [],
    rules: rules.success ? rules.data : [],
    decisions: decisions.success ? decisions.data : [],
    members: (members.data ?? []).map((m) => ({
      profileId: m.profile_id,
      role: m.role,
      name: m.profile?.full_name ?? 'Unnamed member',
    })),
    projects: projects.data ?? [],
  }

  return (
    <PageShell title="Lead Routing" description="Decide who gets each new lead — instantly, fairly and around the clock">
      <div className="max-w-5xl mb-6"><ResponseSettingsCard orgId={orgId} initial={responseSettings} /></div>
      <RoutingSettingsClient
        orgId={orgId}
        orgSlug={orgSlug}
        data={data}
        loadError={loadError && !loadError.success ? loadError.error : (members.error || projects.error ? 'Failed to load members or projects' : null)}
      />
    </PageShell>
  )
}
