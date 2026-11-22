// app/platform/addons/page.tsx — every project with a paid add-on (Interactive Plot Map): pending requests first,
// then expired, suspended and active ones, with configuration/publishing status and usage counts. Counts and
// statuses only — no layouts, inventory or buyer data. Activation is done per project on the workspace page
// (Platform Owner, MFA, audited).
import type { Metadata } from 'next'
import Link from 'next/link'
import { getConsoleAccess } from '@/lib/auth/platform'
import { can, type StaffRole } from '@/lib/platform/portal'
import { listPlotMapUsage } from '@/lib/plots/addon-usage'
import { ADDONS, STATE_INFO } from '@/lib/plots/addons'
import { Alert, Badge } from '@/components/ui'
import { PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'

export const metadata: Metadata = { title: 'Add-ons' }
export const dynamic = 'force-dynamic'

const day = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso)) : '—'

export default async function PlatformAddonsPage() {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role as StaffRole, 'addons')) return <Alert tone="warning">Only the Platform Owner and platform admins see add-ons.</Alert>
  const rows = await listPlotMapUsage()
  // Activating, suspending and changing terms is the Platform Owner's (with MFA, audited) on the workspace page.
  const isOwner = access.role === 'super_admin'
  const active = rows.filter((r) => r.addon.state === 'active')
  return (
    <div className="space-y-5">
      <PageHeader title="Add-ons" description={`${ADDONS.plot_maps.name}: activated per project. ${active.length} active · ${rows.filter((r) => r.addon.state === 'pending').length} waiting for activation. ${isOwner ? 'Use Review & activate on a row' : 'The Platform Owner activates'}; suspend or change terms on the workspace page.`} />
      {rows.length === 0 ? <p className="text-[13px] text-muted">No project has the add-on or has asked for it yet.</p> : (
        <TableCard minWidth={900}>
          <thead><tr><Th>Workspace</Th><Th>Project</Th><Th>State</Th><Th>Until</Th><Th>Layouts</Th><Th>Published</Th><Th>Shared</Th><Th>Plots mapped</Th><Th>Monthly (₹)</Th><Th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.projectId}>
                <Td><Link className="font-medium text-brand hover:underline" href={`/platform/organisations/${r.orgId}`}>{r.orgName}</Link></Td>
                <Td>{r.projectName}</Td>
                <Td><Badge tone={STATE_INFO[r.addon.state].tone}>{STATE_INFO[r.addon.state].label}</Badge>{r.addon.state === 'pending' && r.addon.requestedAt && <span className="ml-1 text-[12px] text-muted">since {day(r.addon.requestedAt)}</span>}</Td>
                <Td>{day(r.addon.validUntil)}</Td>
                <Td>{r.layouts}</Td><Td>{r.published}</Td><Td>{r.shared}</Td><Td>{r.mappedPlots}</Td>
                <Td>{(r.addon.monthlyFeePaise / 100).toLocaleString('en-IN')}</Td>
                <Td>
                  <Link href={`/platform/organisations/${r.orgId}#plot-map-addon`}
                    className={r.addon.state === 'pending'
                      ? 'inline-flex min-h-9 items-center whitespace-nowrap rounded-md bg-brand px-3 text-[13px] font-medium text-brand-foreground hover:bg-brand-hover'
                      : 'whitespace-nowrap text-[13px] font-medium text-brand hover:underline'}>
                    {r.addon.state === 'pending' ? (isOwner ? 'Review & activate' : 'Review') : 'Manage'}
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
    </div>
  )
}
