// app/platform/layout.tsx — REGrow internal console. Platform staff only, MFA-verified session on every screen.
// Shows customer workspace metadata; customer business data only through a support grant.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getConsoleAccess, PLATFORM_AUDIT_READERS } from '@/lib/auth/platform'
import { can, ROLE_LABEL, type StaffRole } from '@/lib/platform/portal'
import { MfaGate } from '@/components/platform/MfaGate'
import { Badge } from '@/components/ui'

export const metadata: Metadata = { title: { template: '%s | REGrow console', default: 'REGrow console' }, robots: { index: false } }
export const dynamic = 'force-dynamic'


export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const access = await getConsoleAccess()
  if (access.state === 'signed_out') redirect('/login?redirectTo=/platform')
  // Not staff: behave as if the console does not exist.
  if (access.state === 'not_staff') notFound()

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-default bg-surface px-4 py-3 md:px-6">
        <div className="flex items-center gap-5">
          <Link href="/platform" className="text-[14px] font-semibold">REGrow console</Link>
          {access.state === 'ok' && (
            <nav aria-label="Console" className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
              <Link href="/platform" className="hover:text-foreground">Dashboard</Link>
              {can(access.role as StaffRole, 'organisations') && <Link href="/platform/organisations" className="hover:text-foreground">Organisations</Link>}
              {can(access.role as StaffRole, 'salesRead') && <Link href="/platform/sales" className="hover:text-foreground">Sales</Link>}
              {can(access.role as StaffRole, 'supportRead') && <Link href="/platform/support" className="hover:text-foreground">Support</Link>}
              {['super_admin', 'finance_admin', 'auditor'].includes(access.role) && <Link href="/platform/payments" className="hover:text-foreground">Payments</Link>}
              {PLATFORM_AUDIT_READERS.includes(access.role) && <Link href="/platform/audit" className="hover:text-foreground">Audit log</Link>}
              {can(access.role as StaffRole, 'staff') && <Link href="/platform/staff" className="hover:text-foreground">Staff</Link>}
              {access.role === 'super_admin' && <Link href="/admin/provision" className="hover:text-foreground">Provision customer</Link>}
            </nav>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted">
          {access.state === 'ok' && <span>{access.label}</span>}
          <Badge tone="brand">{ROLE_LABEL[access.role as StaffRole] ?? access.role}</Badge>
        </div>
      </header>
      {access.state === 'mfa_required' ? <MfaGate /> : <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">{children}</div>}
    </div>
  )
}
