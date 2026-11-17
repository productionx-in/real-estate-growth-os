// app/(dashboard)/[orgSlug]/layout.tsx
// Org-scoped workspace shell: validates org membership and wraps workspace with Sidebar + Header
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { WorkspaceStateBanner } from '@/components/layout/WorkspaceStateBanner'
import { SupportAccessBanner } from '@/components/support/SupportAccessBanner'
import { liveGrantsForOrg } from '@/lib/dal/support-access'
import { getModules } from '@/lib/auth/entitlements'

interface OrgLayoutProps {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)
  const modules = await getModules(workspace.org.id)
  const disabledModules = Object.entries(modules).filter(([, on]) => !on).map(([m]) => m)
  const liveSupport = (await liveGrantsForOrg(workspace.org.id)).sort((a, b) => (b.expires_at ?? '').localeCompare(a.expires_at ?? ''))[0]

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <Sidebar
        orgName={workspace.org.name}
        orgSlug={workspace.org.slug}
        orgType={workspace.org.type}
        role={workspace.role}
        user={workspace.user}
        profile={workspace.profile}
        availableOrgs={workspace.availableOrgs}
        disabledModules={disabledModules}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          orgId={workspace.org.id}
          orgName={workspace.org.name}
          orgSlug={workspace.org.slug}
          orgType={workspace.org.type}
          role={workspace.role}
          user={workspace.user}
          profile={workspace.profile}
          availableOrgs={workspace.availableOrgs}
        />
        <WorkspaceStateBanner state={workspace.org.lifecycle_state} />
        {liveSupport?.expires_at && (
          <SupportAccessBanner orgSlug={workspace.org.slug} until={liveSupport.expires_at} emergency={liveSupport.emergency} canManage={workspace.isAdmin} />
        )}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
