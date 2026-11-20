// app/(dashboard)/[orgSlug]/layout.tsx
// Org-scoped workspace shell: validates org membership and wraps workspace with Sidebar + Header
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { BottomNav } from '@/components/layout/BottomNav'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { SupportBubble } from '@/components/support/SupportBubble'
import { WorkspaceStateBanner } from '@/components/layout/WorkspaceStateBanner'
import { BillingBanner } from '@/components/billing/BillingBanner'
import { billingHoldStatus } from '@/lib/billing/access'
import { SupportAccessBanner } from '@/components/support/SupportAccessBanner'
import { liveGrantsForOrg } from '@/lib/dal/support-access'
import { getModules } from '@/lib/auth/entitlements'
import { DemoBanner } from '@/components/layout/DemoBanner'

interface OrgLayoutProps {
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}

export default async function OrgLayout({ children, params }: OrgLayoutProps) {
  const { orgSlug } = await params
  const workspace = await getVerifiedWorkspace(orgSlug)
  const hold = workspace.org.lifecycle_state === 'suspended'
    ? await billingHoldStatus(workspace.org.id, workspace.profile.id) : { hold: false, canPay: false }
  const modules = await getModules(workspace.org.id)
  const disabledModules = Object.entries(modules).filter(([, on]) => !on).map(([m]) => m)
  const liveSupport = (await liveGrantsForOrg(workspace.org.id)).sort((a, b) => (b.expires_at ?? '').localeCompare(a.expires_at ?? ''))[0]

  return (
    <div className="flex h-dvh overflow-hidden bg-[var(--background)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-[13px] focus:font-medium focus:shadow-md">
        Skip to content
      </a>
      <Sidebar
        orgName={workspace.org.name}
        orgSlug={workspace.org.slug}
        orgType={workspace.org.type}
        role={workspace.role}
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
        {workspace.org.is_demo && <DemoBanner kind="workspace" />}
        <WorkspaceStateBanner state={workspace.org.lifecycle_state} billingHold={hold.hold} canPay={hold.canPay} orgSlug={workspace.org.slug} />
        {workspace.isAdmin && <BillingBanner orgId={workspace.org.id} orgSlug={workspace.org.slug} />}
        {liveSupport?.expires_at && (
          <SupportAccessBanner orgSlug={workspace.org.slug} until={liveSupport.expires_at} emergency={liveSupport.emergency} canManage={workspace.isAdmin} />
        )}
        {/* On phones, leave room for the tab bar (and the home indicator) below the content. */}
        <main id="main" className="flex-1 overflow-y-auto pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">{children}</main>
      </div>
      <BottomNav orgSlug={workspace.org.slug} role={workspace.role} orgType={workspace.org.type} disabledModules={disabledModules} />
      <SupportBubble variant="app" helpHref={`/${workspace.org.slug}/help`} orgName={workspace.org.name} />
      <CommandPalette orgId={workspace.org.id} orgSlug={workspace.org.slug} role={workspace.role} orgType={workspace.org.type} disabledModules={disabledModules} />
    </div>
  )
}
