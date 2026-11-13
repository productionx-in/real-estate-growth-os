// app/(dashboard)/[orgSlug]/integrations/page.tsx
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getProjectsByOrg } from '@/lib/dal/projects'
import { getIntegrationConnections, getProjectMappings } from '@/lib/dal/integrations'
import { IntegrationCentreView } from '@/components/integrations/IntegrationCentreView'

export const metadata: Metadata = { title: 'Integration Centre' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function IntegrationsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org, isManager, isAdmin } = await getVerifiedWorkspace(orgSlug)

  const [connectionsRes, mappingsRes, rawProjects] = await Promise.all([
    getIntegrationConnections(org.id),
    getProjectMappings(org.id),
    getProjectsByOrg(org.id),
  ])

  const schemaAvailable = connectionsRes.schemaAvailable && mappingsRes.schemaAvailable
  const schemaError = connectionsRes.error || mappingsRes.error
  const rawConnections = connectionsRes.connections
  const rawMappings = mappingsRes.mappings

  // Enrich connections with their mappings
  const enrichedConnections = rawConnections.map((conn) => {
    const connMappings = rawMappings.filter((m) => m.connection_id === conn.id)
    return {
      ...conn,
      mappingsCount: connMappings.length,
      mappings: connMappings,
    }
  })

  const projects = rawProjects.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
  }))

  const canManage = isManager || isAdmin

  return (
    <PageShell
      title="Integration Centre"
      description="Connect your marketing channels, Meta Lead Ads accounts, and configure automated lead routing to projects."
    >
      <IntegrationCentreView
        org={{
          id: org.id,
          name: org.name,
          slug: org.slug,
        }}
        initialConnections={enrichedConnections}
        initialMappings={rawMappings}
        projects={projects}
        canManage={canManage}
        schemaAvailable={schemaAvailable}
        schemaError={schemaError}
      />
    </PageShell>
  )
}
