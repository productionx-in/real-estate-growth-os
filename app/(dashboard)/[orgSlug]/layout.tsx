// app/(dashboard)/[orgSlug]/layout.tsx
// Org-scoped workspace shell: validates org membership and wraps workspace with Sidebar + Header
import { canTakeLeads } from '@/lib/sales/structure'
import { getSalesStructure } from '@/lib/dal/sales-structure'
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
import { getWorkspaceSettings } from '@/lib/dal/workspace-settings'
import { WorkspacePrefsProvider } from '@/components/settings/WorkspacePrefs'
import { LiveAlerts } from '@/components/notifications/LiveAlerts'
import { Toaster } from '@/components/ui/toast'

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
  const [{ inventory: inv, alerts }, sales] = await Promise.all([getWorkspaceSettings(workspace.org.id), getSalesStructure(workspace.org.id)])
  // Team structure off → no Teams link (it is not a module; nav.ts MODULE_OF_SEGMENT).
  const navDisabled = sales.teamsEnabled ? disabledModules : [...disabledModules, 'teams']
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
        disabledModules={navDisabled}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          takesLeads={canTakeLeads(workspace.role, sales)}
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
        <main id="main" className="min-w-0 flex-1 overflow-x-clip overflow-y-auto pb-[calc(var(--bottom-nav-height)+env(safe-area-inset-bottom))] md:pb-0">
          <WorkspacePrefsProvider value={{ areaUnitBuilt: inv.areaUnitBuilt, areaUnitLand: inv.areaUnitLand, canDeleteInventory: workspace.isAdmin, statusLabels: inv.statusLabels, ownerSells: sales.ownerSells, teamsEnabled: sales.teamsEnabled }}>{children}</WorkspacePrefsProvider>
        </main>
      </div>
      <Toaster />
      <LiveAlerts orgId={workspace.org.id} orgSlug={workspace.org.slug} settings={alerts} />
      <BottomNav orgSlug={workspace.org.slug} role={workspace.role} orgType={workspace.org.type} disabledModules={navDisabled} />
      <SupportBubble context="workspace" orgSlug={workspace.org.slug} orgName={workspace.org.name} />
      <CommandPalette orgId={workspace.org.id} orgSlug={workspace.org.slug} role={workspace.role} orgType={workspace.org.type} disabledModules={navDisabled} />
    </div>
  )
}
