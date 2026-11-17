// app/(dashboard)/[orgSlug]/leads/page.tsx
// Leads as a list or a board, with filters in the URL and saved views as tabs.
import type { Metadata } from 'next'
import type { ComponentProps } from 'react'
import Link from 'next/link'
import { Plus, SearchX, Upload, Users } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LeadsBoard, type BoardLead } from '@/components/leads/LeadsBoard'
import { LeadFilterBar } from '@/components/leads/LeadFilterBar'
import { SavedViewsBar } from '@/components/leads/SavedViewsBar'
import { ExportLeadsButton } from '@/components/leads/ExportLeadsButton'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { listViews } from '@/lib/dal/saved-views'
import { STATUS_ORDER } from '@/lib/leads/transitions'
import {
  FOCI, applyLeadFilters, canShareViews, isEmpty, parseLeadSearch, sameFilters, toLeadSearch,
} from '@/lib/leads/view-filters'

export const metadata: Metadata = { title: 'Leads' }
export const dynamic = 'force-dynamic'

const LIST_LIMIT = 100
const BOARD_LIMIT = 500

interface PageProps {
  params: Promise<{ orgSlug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function LeadsPage({ params, searchParams }: PageProps) {
  const { orgSlug } = await params
  const { filters, layout, viewId } = parseLeadSearch(await searchParams)

  const { org, role, profile, isManager } = await getVerifiedWorkspace(orgSlug)
  const viewer = { role, profileId: profile.id }
  const service = createServiceClient()
  const now = new Date()

  const board = layout === 'board'
  const columns = board
    ? filters.status
      ? STATUS_ORDER.filter((s) => filters.status!.includes(s))
      : STATUS_ORDER.filter((s) => s !== 'junk')
    : []

  // Visibility is applied by applyLeadFilters: a sales executive only ever gets their own leads.
  let query = service
    .from('leads')
    .select(
      board
        ? 'id, name, phone, status, priority, next_follow_up_at, project:projects(name), assignee:profiles!leads_assigned_to_fkey(full_name)'
        : 'id, name, phone, email, status, priority, source, created_at, project:projects(id, name), assignee:profiles!leads_assigned_to_fkey(id, full_name)',
      { count: 'exact' }
    )
    .eq('org_id', org.id)
  query = applyLeadFilters(query, filters, viewer, now)
  if (board && !filters.status) query = query.neq('status', 'junk')

  const [{ data: leads, count }, views, { data: projects }, { data: members }] = await Promise.all([
    query.order('created_at', { ascending: false }).limit(board ? BOARD_LIMIT : LIST_LIMIT),
    listViews(org.id, viewer),
    service.from('projects').select('id, name').eq('org_id', org.id).order('name'),
    isManager
      ? service.from('org_members').select('profile:profiles(id, full_name)').eq('org_id', org.id).eq('status', 'active')
      : Promise.resolve({ data: [] as { profile: { id: string; full_name: string } | null }[] }),
  ])

  const active = viewId ? views.find((v) => v.id === viewId) ?? null : null
  const modified = active ? !sameFilters(active.filters, filters) || active.layout !== layout : false
  const total = count ?? leads?.length ?? 0
  const hasLeads = (leads?.length ?? 0) > 0
  const filtered = !isEmpty(filters)

  const memberOptions = ((members ?? []) as unknown as { profile: { id: string; full_name: string } | null }[])
    .flatMap((m) => (m.profile ? [{ id: m.profile.id, label: m.profile.full_name }] : []))
    .sort((a, b) => a.label.localeCompare(b.label))

  const actions = (
    <>
      {role !== 'readonly' && hasLeads && <ExportLeadsButton orgSlug={orgSlug} filterQuery={toLeadSearch(filters)} />}
      {isManager && (
        <Button asChild variant="secondary" size="sm">
          <Link href={`/${orgSlug}/leads/import`}><Upload aria-hidden /> Import CSV</Link>
        </Button>
      )}
      {role !== 'readonly' && (
        <Button asChild size="sm">
          <Link href={`/${orgSlug}/leads/new`}><Plus aria-hidden /> Add lead</Link>
        </Button>
      )}
    </>
  )

  const title = active?.name ?? (filters.focus ? FOCI[filters.focus] : role === 'sales_exec' ? 'My leads' : 'Leads')
  const description = [
    `${total} ${total === 1 ? 'lead' : 'leads'}${filtered ? ' match' : ''}`,
    !board && total > LIST_LIMIT ? `showing the latest ${LIST_LIMIT}` : null,
    role === 'sales_exec' ? 'assigned to you' : null,
  ].filter(Boolean).join(' · ')

  return (
    <PageShell title={title} description={description} actions={actions}>
      <SavedViewsBar
        orgSlug={orgSlug}
        orgId={org.id}
        views={views}
        activeId={active?.id ?? null}
        modified={modified}
        filters={filters}
        layout={layout}
        canShare={canShareViews(role)}
      />
      <LeadFilterBar
        orgSlug={orgSlug}
        filters={filters}
        layout={layout}
        viewId={active?.id ?? null}
        projects={(projects ?? []).map((p) => ({ id: p.id, label: p.name }))}
        members={memberOptions}
        canFilterAssignee={role !== 'sales_exec'}
      />

      {!hasLeads ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No leads match these filters"
            description="Try removing a filter or searching for something else."
            action={<Button asChild variant="secondary" size="sm"><Link href={`/${orgSlug}/leads${toLeadSearch({}, { layout })}`}>Clear filters</Link></Button>}
          />
        ) : (
          <EmptyState
            icon={Users}
            title={isManager ? 'No leads in pipeline yet' : 'No leads assigned to you'}
            description={
              isManager
                ? 'Add your first real estate lead manually or import a batch from a CSV file.'
                : 'Your sales manager will assign incoming leads to you.'
            }
            action={isManager ? <Button asChild size="sm"><Link href={`/${orgSlug}/leads/new`}><Plus aria-hidden /> Add first lead</Link></Button> : undefined}
          />
        )
      ) : board ? (
        <LeadsBoard
          leads={(leads ?? []) as unknown as BoardLead[]}
          columns={columns}
          orgSlug={orgSlug}
          canMove={role !== 'readonly'}
          truncated={total > BOARD_LIMIT}
        />
      ) : (
        <LeadsTable
          leads={(leads ?? []) as unknown as ComponentProps<typeof LeadsTable>['leads']}
          orgSlug={orgSlug}
          orgId={org.id}
          viewerRole={role}
        />
      )}
    </PageShell>
  )
}
