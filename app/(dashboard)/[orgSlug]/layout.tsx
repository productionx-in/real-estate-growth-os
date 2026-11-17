// app/(dashboard)/[orgSlug]/layout.tsx
// Org-scoped workspace shell: validates org membership and wraps workspace with Sidebar + Header
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { WorkspaceStateBanner } from '@/components/layout/WorkspaceStateBanner'

interface OrgLayoutProps {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)

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
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  )
}
