// app/(dashboard)/[orgSlug]/inventory/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { PageShell } from '@/components/layout/PageShell'
import { OrgInventoryExplorer } from '@/components/inventory/OrgInventoryExplorer'
import type { MemberRole } from '@/types/database'
import type { ProjectCategory } from '@/types/inventory'

export const metadata: Metadata = { title: 'Inventory Explorer' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function OrgInventoryPage({ params }: PageProps) {
  const { orgSlug } = await params
  const supabase = await createClient()

  // Find org
  const { data: org } = await supabase
    .from('organisations')
    .select('id, name')
    .eq('slug', orgSlug)
    .single()

  if (!org) notFound()

  // Viewer role
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let viewerRole: MemberRole = 'readonly'

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (profile) {
      const { data: membership } = await supabase
        .from('org_members')
        .select('role')
        .eq('org_id', org.id)
        .eq('profile_id', profile.id)
        .single()

      viewerRole = (membership?.role ?? 'readonly') as MemberRole
    }
  }

  const isManager = ['owner', 'admin', 'manager'].includes(viewerRole)

  // Fetch all projects for this org
  const { data: projectsData } = await supabase
    .from('projects')
    .select('id, name, slug, code, category')
    .eq('org_id', org.id)
    .order('name', { ascending: true })

  const projects = (projectsData ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    code: p.code,
    category: (p.category as ProjectCategory) || 'apartments',
  }))

  // Fetch all inventory items across all projects in the org
  const { data: inventoryData, error } = await supabase
    .from('inventory_items')
    .select(`
      *,
      project:projects(id, name, slug, code, category),
      hierarchy_node:project_hierarchy_nodes(id, name, node_type)
    `)
    .eq('org_id', org.id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching org inventory:', error)
  }

  const inventoryItems = inventoryData ?? []

  return (
    <PageShell
      title="Inventory Explorer"
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
