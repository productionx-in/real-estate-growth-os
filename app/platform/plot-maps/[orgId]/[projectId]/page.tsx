// app/platform/plot-maps/[orgId]/[projectId]/page.tsx — RE by PX staff: the map versions of a project whose workspace
// allows RE by PX to draw (option c, 20260085). Names, versions and plot counts only; drafts open in the drawing editor.
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { z } from 'zod'
import { getConsoleAccess } from '@/lib/auth/platform'
import { can, type StaffRole } from '@/lib/platform/portal'
import { staffVersions } from '@/lib/dal/plot-map-staff'
import { Alert, Badge } from '@/components/ui'
import { PageHeader, TableCard, Td, Th } from '@/components/platform/ConsoleUI'

export const metadata: Metadata = { title: 'Draw plot boundaries' }
export const dynamic = 'force-dynamic'

const day = (iso: string) => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'Asia/Kolkata' }).format(new Date(iso))

export default async function StaffProjectMapPage({ params }: { params: Promise<{ orgId: string; projectId: string }> }) {
  const access = await getConsoleAccess()
  if (access.state !== 'ok') return null
  if (!can(access.role as StaffRole, 'plotMapSetup')) return <Alert tone="warning">Only the Platform Owner, platform admins and support work on map set-ups.</Alert>
  const { orgId, projectId } = await params
  if (!z.string().uuid().safeParse(orgId).success || !z.string().uuid().safeParse(projectId).success) notFound()
  const data = await staffVersions(orgId, projectId)
  if (!data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Draw plot boundaries" />
        <Alert tone="info">This workspace has not allowed RE by PX to draw on this project, or the permission has ended. The customer can allow it on the project’s plot map page.</Alert>
        <Link href="/platform/plot-maps" className="text-[13px] font-medium text-brand hover:underline">Back to map set-ups</Link>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <PageHeader title={`${data.orgName} · ${data.projectName}`}
        description={`Allowed until ${day(data.access.expiresAt)}${data.access.grantedBy ? ` by ${data.access.grantedBy}` : ''}. Draw outlines and plot numbers on drafts; the customer links plots to units, approves and publishes.`} />
      {data.versions.length === 0 ? <p className="text-[13px] text-muted">The customer has not uploaded a layout yet.</p> : (
        <TableCard minWidth={640}>
          <thead><tr><Th>Layout</Th><Th>Version</Th><Th>Status</Th><Th>Plots</Th><Th /></tr></thead>
          <tbody>
            {data.versions.map((v) => {
              const draft = v.status === 'draft' || v.status === 'rejected'
              return (
                <tr key={v.id}>
                  <Td className="font-medium">{v.layoutName}</Td>
                  <Td>v{v.versionNo} · page {v.page}</Td>
                  <Td><Badge tone={draft ? 'brand' : 'neutral'}>{v.status.replace('_', ' ')}</Badge></Td>
                  <Td className="tabular-nums">{v.plots}</Td>
                  <Td>{draft && v.ready
                    ? <Link className="font-medium text-brand hover:underline" href={`/platform/plot-maps/${orgId}/${projectId}/${v.id}`}>Draw</Link>
                    : <span className="text-[12px] text-muted">{v.ready ? 'Locked (in review or later)' : 'Still processing'}</span>}</Td>
                </tr>
              )
            })}
          </tbody>
        </TableCard>
      )}
    </div>
  )
}
