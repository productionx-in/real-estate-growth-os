// app/platform/staff/page.tsx — staff accounts and roles (Platform Owner only). Adding someone gives an existing
// REGrow account a staff role; they must enrol an authenticator app before any console page opens.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, listStaff, ROLE_LABEL, type Db, type StaffRole } from '@/lib/platform/portal'
import { AddStaffForm, StaffControls } from '@/components/platform/PortalClient'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'

export const metadata: Metadata = { title: 'Staff' }
export const dynamic = 'force-dynamic'

export default async function StaffPage() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  const role = access.role as StaffRole
  if (!can(role, 'staff')) notFound()
  const r = await listStaff(createServiceClient() as unknown as Db, { userId: access.userId, role })
  const rows = r.success ? r.data : []
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[18px] font-semibold">Staff accounts</h1>
        <p className="text-[13px] text-muted">Staff roles are separate from customer workspaces: a staff role never gives access to a customer&apos;s records, and every change here is recorded in the platform audit log.</p>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead><tr className="border-b border-default text-left text-muted"><th className="px-4 py-2.5 font-medium">Email</th><th className="px-3 font-medium">Role</th><th className="px-3 font-medium">Authenticator</th><th className="px-3 font-medium">Status</th><th className="px-3 font-medium" /></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-b border-default last:border-0">
                <td className="px-4 py-2.5">{s.email}</td>
                <td className="px-3">{ROLE_LABEL[s.role as StaffRole] ?? s.role}</td>
                <td className="px-3">{s.mfa ? <Badge tone="success">Enrolled</Badge> : <Badge tone="warning">Not yet</Badge>}</td>
                <td className="px-3">{s.is_active ? 'Active' : 'Deactivated'}</td>
                <td className="px-3 py-2"><StaffControls id={s.id} role={s.role} active={s.is_active} self={s.user_id === access.userId} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card><CardHeader><CardTitle>Add a staff member</CardTitle></CardHeader><CardContent><AddStaffForm /></CardContent></Card>
    </div>
  )
}
