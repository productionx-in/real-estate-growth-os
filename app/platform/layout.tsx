// app/platform/layout.tsx — REGrow internal console. Platform staff only, MFA-verified session on every screen.
// Shows customer workspace metadata; customer business data only through a support grant.
import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getConsoleAccess, PLATFORM_AUDIT_READERS } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, consoleNavCounts, ROLE_LABEL, type Db, type StaffRole } from '@/lib/platform/portal'
import { MfaGate } from '@/components/platform/MfaGate'
import { ConsoleShell, type ConsoleNavGroup } from '@/components/platform/ConsoleShell'

export const metadata: Metadata = { title: { template: '%s | REGrow console', default: 'REGrow console' }, robots: { index: false } }
export const dynamic = 'force-dynamic'

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const access = await getConsoleAccess()
  if (access.state === 'signed_out') redirect('/login?redirectTo=/platform')
  // Not staff: behave as if the console does not exist.
  if (access.state === 'not_staff') notFound()

  const role = access.role as StaffRole
  const roleLabel = ROLE_LABEL[role] ?? access.role
  if (access.state === 'mfa_required') {
    return <ConsoleShell groups={[]} userLabel="REGrow staff" roleLabel={roleLabel}><MfaGate /></ConsoleShell>
  }

  const counts = await consoleNavCounts(createServiceClient() as unknown as Db, { userId: access.userId, role })
  const groups: ConsoleNavGroup[] = [
    { label: 'Overview', items: [{ href: '/platform', label: 'Dashboard', icon: 'dashboard' as const }] },
    {
      label: 'Customers',
      items: [
        ...(can(role, 'organisations') ? [{ href: '/platform/organisations', label: 'Organisations', icon: 'organisations' as const }] : []),
        ...(role === 'super_admin' ? [{ href: '/admin/provision', label: 'Provision customer', icon: 'provision' as const }] : []),
        ...(['super_admin', 'finance_admin', 'auditor'].includes(role) ? [{ href: '/platform/payments', label: 'Payments', icon: 'payments' as const }] : []),
      ],
    },
    {
      label: 'Work',
      items: [
        ...(can(role, 'salesRead') ? [counts.newRequests
          ? { href: '/platform/sales?stage=new', label: 'Sales pipeline', icon: 'sales' as const, badge: counts.newRequests, badgeTone: 'alert' as const }
          : { href: '/platform/sales', label: 'Sales pipeline', icon: 'sales' as const, badge: counts.followUps, badgeTone: 'info' as const }] : []),
        ...(can(role, 'supportRead') ? [{ href: '/platform/support', label: 'Support', icon: 'support' as const, badge: counts.support, badgeTone: 'alert' as const }] : []),
      ],
    },
    {
      label: 'Administration',
      items: [
        ...(can(role, 'email') ? [{ href: '/platform/email', label: 'E-mail', icon: 'email' as const, badge: counts.emailAttention, badgeTone: 'alert' as const }] : []),
        ...(can(role, 'people') ? [{ href: '/platform/people', label: 'People', icon: 'people' as const }] : []),
        ...(can(role, 'staff') ? [{ href: '/platform/staff', label: 'Staff', icon: 'staff' as const }] : []),
        ...(can(role, 'staff') ? [{ href: '/platform/assistant', label: 'Rio insights', icon: 'assistant' as const }] : []),
        ...(PLATFORM_AUDIT_READERS.includes(access.role) ? [{ href: '/platform/audit', label: 'Audit log', icon: 'audit' as const }] : []),
      ],
    },
  ].filter((g) => g.items.length > 0)

  return <ConsoleShell groups={groups} userLabel={access.label} roleLabel={roleLabel}>{children}</ConsoleShell>
}
