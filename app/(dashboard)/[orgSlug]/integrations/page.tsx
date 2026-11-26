// app/(dashboard)/[orgSlug]/integrations/page.tsx
import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { PageShell } from '@/components/layout/PageShell'
import { getVerifiedWorkspace } from '@/lib/dal/workspace'
import { getProjectsByOrg } from '@/lib/dal/projects'
import { getIntegrationConnections, getProjectMappings } from '@/lib/dal/integrations'
import { IntegrationCentreView } from '@/components/integrations/IntegrationCentreView'
import { integrationReadiness } from '@/lib/integrations/readiness'
import { listDomains } from '@/lib/dal/domains'

export const metadata: Metadata = { title: 'Integrations' }
export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgSlug: string }>
}

export default async function IntegrationsPage({ params }: PageProps) {
  const { orgSlug } = await params
  const { org, isManager, isAdmin } = await getVerifiedWorkspace(orgSlug)

  // Server-authoritative access control: Only managers and admins can access integrations
  if (!isManager && !isAdmin) {
    redirect(`/${orgSlug}`)
  }

  const [connectionsRes, mappingsRes, rawProjects, domains] = await Promise.all([
    getIntegrationConnections(org.id),
    getProjectMappings(org.id),
    getProjectsByOrg(org.id),
    listDomains(org.id).catch(() => []),
  ])
  // Yes/no only: never a setting's name or value reaches the page.
  const readiness = Object.fromEntries(integrationReadiness().map((r) => [r.key, r.ready]))
  const ready = { meta_lead_ads: !!readiness.meta_lead_ads, whatsapp_cloud: !!readiness.whatsapp_cloud, google_ads: !!readiness.google_ads }

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
      title="Integrations"
      description="Connect Facebook, WhatsApp, your website, e-mail and portals in a few clicks. New leads start arriving on their own."
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
        ready={ready}
        domains={domains}
      />
    </PageShell>
  )
}
