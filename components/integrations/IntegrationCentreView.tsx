// components/integrations/IntegrationCentreView.tsx
// Customer-facing Integrations: the dashboard (IntegrationHub) to connect each service, then connected accounts and
// form-to-project routing for what is already connected.
'use client'

import { MAX_WHATSAPP_NUMBERS } from '@/lib/integrations/whatsapp/numbers'
import { useState } from 'react'
import {
  Plug,
  Search,
  Globe,
  CheckCircle2,
  Sliders,
} from 'lucide-react'
import { FacebookIcon } from '@/components/icons/FacebookIcon'
import type {
  IntegrationConnectionRecord,
  IntegrationProjectMappingRecord,
  MetaPageAsset,
} from '@/lib/integrations/types'
import { MetaConnectWizardModal } from '@/components/integrations/MetaConnectWizardModal'
import { ConnectionDetailsModal } from '@/components/integrations/ConnectionDetailsModal'
import { WebsiteEnquiryWizardModal } from '@/components/integrations/WebsiteEnquiryWizardModal'
import { WhatsAppWizardModal } from '@/components/integrations/WhatsAppWizardModal'
import { IntegrationHub } from '@/components/integrations/IntegrationHub'
import type { DomainView } from '@/lib/dal/domains'
import { PortalIntegrationModal } from '@/components/integrations/PortalIntegrationModal'
import { DeveloperApiDocsModal } from '@/components/integrations/DeveloperApiDocsModal'

interface ProjectOption {
  id: string
  name: string
  category: string
}

interface IntegrationCentreViewProps {
  org: {
    id: string
    name: string
    slug: string
  }
  initialConnections: (IntegrationConnectionRecord & {
    mappingsCount?: number
    mappings?: IntegrationProjectMappingRecord[]
  })[]
  initialMappings: IntegrationProjectMappingRecord[]
  projects: ProjectOption[]
  canManage: boolean
  schemaAvailable?: boolean
  schemaError?: string | null
  /** Is RE by PX's side of each sign-in set up (yes/no only, lib/integrations/readiness.ts). */
  ready: { meta_lead_ads: boolean; whatsapp_cloud: boolean; google_ads: boolean }
  /** Website and e-mail domains (20260103). */
  domains: DomainView[]
}

export function IntegrationCentreView({
  org,
  initialConnections,
  initialMappings,
  projects,
  canManage,
  schemaAvailable = true,
  ready,
  domains,
}: IntegrationCentreViewProps) {
  const [connections, setConnections] = useState(initialConnections)
  const [mappings, setMappings] = useState(initialMappings)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [isWebsiteWizardOpen, setIsWebsiteWizardOpen] = useState(false)
  const [isWhatsAppWizardOpen, setIsWhatsAppWizardOpen] = useState(false)
  const [isPortalModalOpen, setIsPortalModalOpen] = useState(false)
  const [isDeveloperApiDocsOpen, setIsDeveloperApiDocsOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<
    (IntegrationConnectionRecord & { mappings?: IntegrationProjectMappingRecord[] }) | null
  >(null)

  // Filter connections by provider and active verified state
  const metaConnections = connections.filter((c) => c.provider === 'meta_ads')
  const activeMetaConnections = metaConnections.filter((c) => c.status === 'connected')
  const websiteConnection = connections.find((c) => c.provider === 'website_webhook')
  const whatsappConnection = connections.find((c) => c.provider === 'whatsapp_cloud')
  // A workspace can connect several WhatsApp numbers (lib/integrations/whatsapp/numbers.ts).
  const whatsappNumbers = connections.filter((c) => c.provider === 'whatsapp_cloud' && c.status === 'connected')
  const activeVerifiedConnections = connections.filter((c) => c.status === 'connected')

  // Refresh data from API
  const refreshData = async () => {
    try {
      const res = await fetch(`/api/integrations/connections?orgId=${org.id}`)
      if (res.ok) {
        const data = await res.json()
        setConnections(data.connections || [])
      }
      const mapRes = await fetch(`/api/integrations/mappings?orgId=${org.id}`)
      if (mapRes.ok) {
        const mapData = await mapRes.json()
        setMappings(mapData.mappings || [])
      }
    } catch (err) {
      console.error('Failed to refresh integrations data:', err)
    }
  }

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return 'Never'
    try {
      return new Date(isoString).toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return isoString
    }
  }

  return (
    <div className="max-w-6xl space-y-8 pb-12">
      {!schemaAvailable && (
        <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning-bg p-4 text-[13px] text-warning">
          <span aria-hidden>⚠️</span>
          <p><span className="font-semibold">Integrations aren’t switched on for this workspace yet.</span> RE by PX support can turn them on — tap the parrot to ask.</p>
        </div>
      )}

      {/* The dashboard: every service, its status, and one button to connect it. */}
      <IntegrationHub
        orgId={org.id}
        canManage={canManage}
        connections={connections.map((c) => ({ provider: c.provider, status: c.status }))}
        ready={ready}
        initialDomains={domains}
        whatsappFull={whatsappNumbers.length >= MAX_WHATSAPP_NUMBERS}
        onOpen={(k) => (k === 'website' ? setIsWebsiteWizardOpen(true) : k === 'portals' ? setIsPortalModalOpen(true) : activeMetaConnections[0] ? setSelectedConnection(activeMetaConnections[0]) : setIsWizardOpen(true))}
      />
      {canManage && (
        <p className="text-[12px] text-muted">
          Have a developer? <button type="button" onClick={() => setIsDeveloperApiDocsOpen(true)} className="font-medium text-brand hover:underline">Connect any other system with our API</button>.
        </p>
      )}

      {/* SECTION 2: CONNECTED ACCOUNTS & CONNECTION MANAGEMENT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-bold text-foreground">Connected accounts</h3>
            <p className="text-[12px] text-subtle">
              Active external connections authorized for {org.name}. Only real, verified connections are
              displayed here.
            </p>
          </div>
        </div>

        {activeVerifiedConnections.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {activeVerifiedConnections.map((conn) => {
              const meta = (conn.metadata || {}) as Record<string, unknown>
              const pages = (meta.pages || []) as MetaPageAsset[]

              const ProviderIcon =
                conn.provider === 'meta_ads'
                  ? FacebookIcon
                  : conn.provider === 'google_ads'
                  ? Search
                  : Globe

              const providerLabel =
                conn.provider === 'meta_ads'
                  ? 'Meta Lead Ads'
                  : conn.provider === 'google_ads'
                  ? 'Google Ads'
                  : 'Website Enquiry Form'

              return (
                <div
                  key={conn.id}
                  className="surface-raised bg-surface border border-default rounded-2xl p-5 hover:border-strong transition-all space-y-4"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center text-brand-foreground shadow-2xs">
                        <ProviderIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-[15px] font-bold text-foreground">{conn.name}</h4>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-success-bg text-success border border-success/30">
                            Active &amp; Verified
                          </span>
                        </div>
                        <p className="text-[12px] text-subtle">
                          {providerLabel} • External ID: {conn.external_account_id || 'Primary Account'} • Last
                          Synchronized: {formatDate(conn.last_sync_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedConnection(conn)}
                        className="surface-raised px-3 py-1.5 text-[12px] font-medium text-muted bg-surface border border-default rounded-2xl hover:bg-surface-muted transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        Manage Mappings ({conn.mappingsCount || 0})
                      </button>
                    </div>
                  </div>

                  {/* Connected Pages Pills */}
                  {pages.length > 0 && (
                    <div className="pt-2 border-t border-default flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-subtle uppercase tracking-wider">
                        Authorized Pages:
                      </span>
                      {pages.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] bg-brand-light/70 text-brand border border-brand/60 font-medium"
                        >
                          <FacebookIcon className="w-3 h-3 text-brand" />
                          {p.name}
                          <span className="text-[11px] text-brand font-mono">
                            ({p.forms?.length || 0} forms)
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-surface border border-dashed border-strong rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-surface-muted text-subtle mx-auto flex items-center justify-center shadow-2xs">
              <Plug className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-[15px] font-bold text-foreground">No Verified Accounts Connected Yet</h4>
              <p className="text-[12px] text-subtle">
                Live marketing accounts will appear here once external OAuth authorisation or form setup
                succeeds. Unconnected, draft, or mock integrations are never shown as active.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 3: LIVE FORM-TO-PROJECT ROUTING SUMMARY */}
      <div className="space-y-4">
        <div>
          <h3 className="text-[16px] font-bold text-foreground">Where new leads go</h3>
          <p className="text-[12px] text-subtle">
            How incoming marketing form submissions are routed into specific CRM projects.
          </p>
        </div>

        <div className="surface-raised bg-surface border border-default rounded-2xl overflow-hidden">
          <table className="data-table w-full text-left text-[12px]">
            <thead className="bg-surface-muted/80 border-b border-default text-muted font-semibold">
              <tr>
                <th className="py-3 px-5">Lead Form / Identifier</th>
                <th className="py-3 px-4">Routing Type</th>
                <th className="py-3 px-4">Destination Project</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-default">
              {mappings.length > 0 ? (
                mappings.map((m) => (
                  <tr key={m.id} className="hover:bg-surface-muted/60 transition-colors">
                    <td className="py-3 px-5">
                      <p className="font-semibold text-foreground">
                        {m.description || m.external_identifier_value}
                      </p>
                      <p className="text-[11px] text-subtle font-mono">
                        ID: {m.external_identifier_value}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize px-2 py-0.5 rounded-full text-[11px] bg-surface-hover text-muted font-medium">
                        {m.external_identifier_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-foreground">
                      {m.project?.name || 'Project Mapped'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success-bg px-2 py-0.5 rounded-full border border-success/30">
                        <CheckCircle2 className="w-3 h-3" />
                        Active Routing
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-subtle">
                    No active form mappings found. Connect a Meta account or add a form mapping to begin
                    automatic lead routing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* META CONNECT WIZARD MODAL */}
      <MetaConnectWizardModal
        isOpen={isWizardOpen}
        onClose={() => setIsWizardOpen(false)}
        orgId={org.id}
        orgSlug={org.slug}
        projects={projects}
        onConnectionCreated={refreshData}
      />

      {/* CONNECTION DETAILS MODAL */}
      <ConnectionDetailsModal
        isOpen={Boolean(selectedConnection)}
        onClose={() => setSelectedConnection(null)}
        connection={selectedConnection}
        projects={projects}
        onRefreshNeeded={refreshData}
      />

      {/* WEBSITE ENQUIRY WIZARD MODAL */}
      <WebsiteEnquiryWizardModal
        isOpen={isWebsiteWizardOpen}
        onClose={() => setIsWebsiteWizardOpen(false)}
        orgId={org.id}
        projects={projects}
        existingConnection={websiteConnection}
        onConnectionCreated={refreshData}
      />

      {/* WHATSAPP WIZARD MODAL */}
      <WhatsAppWizardModal
        isOpen={isWhatsAppWizardOpen}
        onClose={() => setIsWhatsAppWizardOpen(false)}
        orgId={org.id}
        projects={projects}
        existingConnection={whatsappConnection}
        onConnectionCreated={refreshData}
      />

      {/* PROPERTY PORTAL INTEGRATION MODAL */}
      <PortalIntegrationModal
        isOpen={isPortalModalOpen}
        onClose={() => setIsPortalModalOpen(false)}
        orgId={org.id}
        projects={projects}
        onConnectionCreated={refreshData}
      />

      {/* DEVELOPER API & WEBHOOK DOCS MODAL */}
      <DeveloperApiDocsModal
        isOpen={isDeveloperApiDocsOpen}
        onClose={() => setIsDeveloperApiDocsOpen(false)}
      />
    </div>
  )
}
