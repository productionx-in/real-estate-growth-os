// app/(dashboard)/[orgSlug]/inventory/page.tsx
import type { Metadata } from 'next'
import { allRows } from '@/lib/supabase/all-rows'
import { createServiceClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { OrgInventoryExplorer } from '@/components/inventory/OrgInventoryExplorer'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import type { ProjectCategory } from '@/types/inventory'

export const metadata: Metadata = { title: 'Inventory' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function OrgInventoryPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org, isManager } = await getVerifiedWorkspace(orgSlug)
  const service = createServiceClient()

  // Projects and every inventory item (paged past the API's 1,000-row limit), read in parallel.
  const [{ data: projectsData }, inventoryItems] = await Promise.all([
    service
      .from('projects')
      .select('id, name, slug, code, category')
      .eq('org_id', org.id)
      .order('name', { ascending: true }),
    allRows((from, to) => service
      .from('inventory_items')
      .select(`
        *,
        project:projects(id, name, slug, code, category),
        hierarchy_node:project_hierarchy_nodes(id, name, node_type)
      `)
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)).catch((error) => {
      console.error('Error fetching org inventory:', error)
      return []
    }),
  ])

  const projects = (projectsData ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    code: p.code,
    category: (p.category as ProjectCategory) || 'apartments',
  }))

  return (
    <PageShell
      title="Inventory"
      description="Centralised inventory visibility across all projects, towers, blocks, and plotted layouts."
    >
      <OrgInventoryExplorer
        projects={projects}
        initialItems={inventoryItems}
        orgSlug={orgSlug}
        isManager={isManager}
      />
    </PageShell>
  )
}
