// app/(dashboard)/[orgSlug]/leads/segments/[segmentId]/page.tsx — one segment: what it contains and its leads, as far
// as the reader's role allows (a sales executive sees only their own leads in it).
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ExternalLink, Users } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Badge, Button, Card } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'
import { LeadStatusBadge } from '@/components/leads/LeadStatusBadge'
import { RemoveFromListButton, SegmentActions } from '@/components/leads/SegmentControls'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { resolveLeadViewer } from '@/lib/dal/viewer'
import { getSegment, segmentLeads } from '@/lib/dal/segments'
import { createServiceClient } from '@/lib/supabase/server'
import { SOURCE_LABELS, toLeadSearch } from '@/lib/leads/view-filters'
import { canManageSegments, describeFilters } from '@/lib/segments/segments'
import { leadScopeOf } from '@/lib/auth/permissions'
import { formatDate } from '@/lib/utils/format'
import type { LeadSource, LeadStatus } from '@/types/database'

export const metadata: Metadata = { title: 'Segment' }
export const dynamic = 'force-dynamic'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIMIT = 200

export default async function SegmentPage({ params }: { params: Promise<{ orgSlug: string; segmentId: string }> }) {
  const { orgSlug, segmentId } = await params
  if (!UUID.test(segmentId)) notFound()
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  const segment = await getSegment(org.id, segmentId)
  if (!segment) notFound()
  const viewer = await resolveLeadViewer(org.id, role, profile.id)
  const manage = canManageSegments(role)
  const [{ leads, total }, { data: projects }] = await Promise.all([
    segmentLeads(org.id, segment, viewer, LIMIT),
    createServiceClient().from('projects').select('id, name').eq('org_id', org.id),
  ])
  const projectNames = Object.fromEntries((projects ?? []).map((p) => [p.id, p.name]))
  const dynamicSeg = segment.kind === 'dynamic'
  const scoped = leadScopeOf(role) !== 'all'

  return (
    <PageShell
      back={{ href: `/${orgSlug}/leads/segments`, label: 'Segments' }}
      title={<span className="flex flex-wrap items-center gap-2">{segment.name}<Badge tone={dynamicSeg ? 'info' : 'neutral'}>{dynamicSeg ? 'Dynamic' : 'Fixed list'}</Badge></span>}
      description={[
        `${total} ${total === 1 ? 'lead' : 'leads'}`,
        total > LIMIT ? `showing the latest ${LIMIT}` : null,
        scoped ? 'only the leads you can see' : null,
      ].filter(Boolean).join(' · ')}
      actions={dynamicSeg ? (
        <Button asChild size="sm" variant="secondary">
          <Link href={`/${orgSlug}/leads${toLeadSearch(segment.filters)}`}><ExternalLink aria-hidden /> Open in Leads</Link>
        </Button>
      ) : undefined}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          {segment.description && <p className="text-[13px]">{segment.description}</p>}
          {dynamicSeg ? (
            <ul aria-label="Who is in this segment" className="flex flex-wrap gap-1.5">
              {describeFilters(segment.filters, projectNames).map((c) => <li key={c} className="rounded-full border border-default bg-surface-muted px-2 py-0.5 text-[12px]">{c}</li>)}
            </ul>
          ) : (
            <p className="text-[12px] text-muted">Hand-picked. Add leads from a lead&apos;s page: More → Add to list.</p>
          )}
          {manage && <SegmentActions orgId={org.id} orgSlug={orgSlug} segment={segment} snapshot={dynamicSeg ? segment.filters : null} />}
        </div>

        {leads.length === 0 ? (
          <Card><EmptyState icon={Users} title="No leads here right now"
            description={dynamicSeg ? 'Leads join on their own as soon as they match.' : scoped ? 'None of the leads in this list are yours.' : 'Add leads from their pages.'} /></Card>
        ) : (
          <div className="surface-raised overflow-x-auto rounded-2xl border border-default bg-surface">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-surface-muted text-left text-[12px] text-muted">
                <tr><th className="px-3 py-2 font-medium">Lead</th><th className="px-3 py-2 font-medium">Stage</th><th className="px-3 py-2 font-medium">Source</th><th className="px-3 py-2 font-medium">Project</th><th className="px-3 py-2 font-medium">Owner</th><th className="px-3 py-2 font-medium">Added</th>{manage && !dynamicSeg && <th className="px-3 py-2"><span className="sr-only">Actions</span></th>}</tr>
              </thead>
              <tbody className="divide-y divide-default">
                {leads.map((l) => (
                  <tr key={l.id} className="hover:bg-surface-hover">
                    <td className="px-3 py-2"><Link href={`/${orgSlug}/leads/${l.id}`} className="font-medium hover:underline">{l.name}</Link><span className="block text-[12px] text-muted">{l.phone}</span></td>
                    <td className="px-3 py-2"><LeadStatusBadge status={l.status as LeadStatus} /></td>
                    <td className="px-3 py-2 text-muted">{l.source ? SOURCE_LABELS[l.source as LeadSource] ?? l.source : '—'}</td>
                    <td className="px-3 py-2 text-muted">{l.project?.name ?? '—'}</td>
                    <td className="px-3 py-2 text-muted">{l.assignee?.full_name ?? 'Unassigned'}</td>
                    <td className="px-3 py-2 tabular-nums text-muted">{formatDate(l.created_at)}</td>
                    {manage && !dynamicSeg && <td className="px-3 py-2 text-right"><RemoveFromListButton orgId={org.id} segmentId={segment.id} leadId={l.id} leadName={l.name} /></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </PageShell>
  )
}
