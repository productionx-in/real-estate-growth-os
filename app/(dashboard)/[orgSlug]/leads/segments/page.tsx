// app/(dashboard)/[orgSlug]/leads/segments/page.tsx — the organisation's lead segments (20260087): dynamic segments
// (filters, always current) and fixed lists (hand-picked), with starter templates. Everyone can open them and sees
// only the leads their role allows; owners, admins and managers create and change them.
import type { Metadata } from 'next'
import Link from 'next/link'
import { ListFilter } from 'lucide-react'
import { PageShell } from '@/components/layout/PageShell'
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui'
import { EmptyState } from '@/components/shared/EmptyState'
import { NewSegmentForm, UseTemplateButton } from '@/components/leads/SegmentControls'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { resolveLeadViewer } from '@/lib/dal/viewer'
import { listSegments } from '@/lib/dal/segments'
import { createServiceClient } from '@/lib/supabase/server'
import { parseLeadSearch } from '@/lib/leads/view-filters'
import { SEGMENT_TEMPLATES, canManageSegments, describeFilters, segmentFilters } from '@/lib/segments/segments'

export const metadata: Metadata = { title: 'Segments' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SegmentsPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const sp = await searchParams
  const { org, role, profile } = await getVerifiedWorkspace(orgSlug)
  const viewer = await resolveLeadViewer(org.id, role, profile.id)
  const manage = canManageSegments(role)
  const [segments, { data: projects }] = await Promise.all([
    listSegments(org.id, viewer),
    createServiceClient().from('projects').select('id, name').eq('org_id', org.id),
  ])
  const projectNames = Object.fromEntries((projects ?? []).map((p) => [p.id, p.name]))
  // "Save as segment" on the Leads page arrives here with its filters in the URL.
  const fromLeads = sp.new ? segmentFilters(parseLeadSearch(sp).filters) : null
  const used = new Set(segments.map((s) => s.template).filter(Boolean))
  const templates = SEGMENT_TEMPLATES.filter((t) => !used.has(t.key))

  return (
    <PageShell
      title="Segments"
      description="Groups of leads to follow up together — and, soon, to send campaigns to. You only ever see the leads your role allows."
      back={{ href: `/${orgSlug}/leads`, label: 'Leads' }}
    >
      <div className="space-y-6">
        {manage && (sp.new || segments.length === 0) && (
          <Card id="new">
            <CardHeader>
              <CardTitle>{fromLeads ? 'Save these filters as a segment' : 'New list'}</CardTitle>
            </CardHeader>
            <CardContent>
              <NewSegmentForm orgId={org.id} orgSlug={orgSlug} filters={fromLeads} criteria={fromLeads ? describeFilters(fromLeads, projectNames) : []} />
            </CardContent>
          </Card>
        )}

        {segments.length === 0 ? (
          <Card>
            <EmptyState icon={ListFilter} title="No segments yet"
              description={manage ? 'Start from a template below, save the filters you use on the Leads page, or make a hand-picked list.' : 'Your managers have not created any segments yet.'} />
          </Card>
        ) : (
          <section aria-labelledby="your-segments" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h2 id="your-segments" className="text-[15px] font-semibold">Segments</h2>
              {manage && !sp.new && <Link href={`/${orgSlug}/leads/segments?new=1#new`} className="text-[13px] font-medium text-brand hover:underline">New list</Link>}
            </div>
            <ul className="divide-y divide-default overflow-hidden rounded-xl border border-default bg-surface">
              {segments.map((s) => (
                <li key={s.id}>
                  <Link href={`/${orgSlug}/leads/segments/${s.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-hover sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{s.name}</span>
                        <Badge tone={s.kind === 'dynamic' ? 'info' : 'neutral'}>{s.kind === 'dynamic' ? 'Dynamic' : 'Fixed list'}</Badge>
                      </span>
                      <span className="block truncate text-[12px] text-muted">
                        {s.kind === 'dynamic' ? describeFilters(s.filters, projectNames).join(' · ') : s.description ?? 'Hand-picked leads'}
                      </span>
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-muted">{s.count} {s.count === 1 ? 'lead' : 'leads'}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {manage && templates.length > 0 && (
          <section aria-labelledby="templates" className="space-y-2">
            <h2 id="templates" className="text-[15px] font-semibold">Starter templates</h2>
            <p className="text-[13px] text-muted">Each one is a dynamic segment you can rename or delete afterwards.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <Card key={t.key}>
                  <CardHeader className="flex-col gap-1 pb-2">
                    <CardTitle className="text-[14px]">{t.name}</CardTitle>
                    <CardDescription>{t.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <p className="text-[12px] text-muted">{describeFilters(t.filters).join(' · ')}</p>
                    <UseTemplateButton orgId={org.id} orgSlug={orgSlug} template={t.key} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
    </PageShell>
  )
}
