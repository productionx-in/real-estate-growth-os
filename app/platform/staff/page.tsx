// app/platform/staff/page.tsx — staff accounts and roles (Platform Owner only). Adding someone gives an existing
// RE account a staff role; they must enrol an authenticator app before any console page opens.
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getConsoleAccess } from '@/lib/auth/platform'
import { createServiceClient } from '@/lib/supabase/server'
import { can, listStaff, ROLE_LABEL, type Db, type StaffRole } from '@/lib/platform/portal'
import { AddStaffForm, StaffControls } from '@/components/platform/PortalClient'
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@/components/ui'
import { PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'

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
      <PageHeader title="Staff" description="Who works in the console and in which role. A staff role never opens a customer's records, and every change here goes into the audit log." />
      <Card className="rounded-2xl"><CardHeader className="px-5 pt-5"><CardTitle className="text-[15px]">Add a staff member</CardTitle></CardHeader><CardContent className="p-5 pt-3"><AddStaffForm /></CardContent></Card>
      <TableCard minWidth={760}>
        <thead><tr><Th>Person</Th><Th>Role</Th><Th>Authenticator</Th><Th>Status</Th><Th>Change</Th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <Td className="font-medium">{s.email}</Td>
              <Td>{ROLE_LABEL[s.role as StaffRole] ?? s.role}</Td>
              <Td>{s.mfa ? <Badge tone="success">Set up</Badge> : <Badge tone="warning">Not yet</Badge>}</Td>
              <Td className={s.is_active ? '' : 'text-muted'}>{s.is_active ? 'Active' : 'Deactivated'}</Td>
              <Td><StaffControls id={s.id} role={s.role} active={s.is_active} self={s.user_id === access.userId} founding={s.founding} /></Td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  )
}
