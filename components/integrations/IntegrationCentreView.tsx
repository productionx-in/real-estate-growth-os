// components/integrations/IntegrationCentreView.tsx
// Customer-facing Integration Centre view for managing marketing channels, Meta connections, and project mappings.
'use client'

import { useState } from 'react'
import {
  Plug,
  Search,
  Globe,
  MessageCircle,
  Building,
  CheckCircle2,
  ShieldCheck,
  Plus,
  RefreshCw,
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
}

export function IntegrationCentreView({
  org,
  initialConnections,
  initialMappings,
  projects,
  canManage,
}: IntegrationCentreViewProps) {
  const [connections, setConnections] = useState(initialConnections)
  const [mappings, setMappings] = useState(initialMappings)
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [selectedConnection, setSelectedConnection] = useState<
    (IntegrationConnectionRecord & { mappings?: IntegrationProjectMappingRecord[] }) | null
  >(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Filter connections by provider
  const metaConnections = connections.filter((c) => c.provider === 'meta_ads')
  const activeMetaConnections = metaConnections.filter((c) => c.status === 'connected')

  // Calculate connected pages and forms summary across all Meta connections
  let totalConnectedPages = 0
  let totalConnectedForms = 0
  for (const conn of activeMetaConnections) {
    const meta = (conn.metadata || {}) as Record<string, unknown>
    const pages = (meta.pages || []) as MetaPageAsset[]
    totalConnectedPages += pages.length
    for (const p of pages) {
      totalConnectedForms += p.forms?.length || 0
    }
  }

  // Refresh data from API
  const refreshData = async () => {
    setIsRefreshing(true)
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
    } finally {
      setIsRefreshing(false)
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
      {/* Top Banner: Central Meta App Architecture & Tenant Privacy Guarantee */}
      <div className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-blue-200/80 rounded-2xl p-6 relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-800 border border-blue-200">
                <ShieldCheck className="w-3.5 h-3.5" />
                Verified Multi-Tenant Lead Pipeline
              </span>
              <span className="text-[12px] text-gray-500">•</span>
              <span className="text-[12px] text-gray-600 font-medium">Single Central Meta App Architecture</span>
            </div>
            <h2 className="text-[18px] font-bold text-gray-900">
              Welcome to the Real Estate Integration Centre
            </h2>
            <p className="text-[13px] text-gray-600 leading-relaxed">
              Connect your advertising channels directly to your CRM. Production X operates one central,
              officially verified Meta application. Your business accounts, Facebook Pages, and customer
              leads remain completely private and isolated to <strong>{org.name}</strong>.
            </p>
          </div>

          {canManage && (
            <button
              onClick={() => setIsWizardOpen(true)}
              className="px-4 py-2.5 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-sm flex items-center gap-2 flex-shrink-0"
            >
              <FacebookIcon className="w-4 h-4" />
              Connect Meta Account
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: ALL 5 MARKETING CHANNELS */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-bold text-gray-900">Supported Inbound Channels</h3>
            <p className="text-[12px] text-gray-500">
              Overview of all marketing platforms and lead capture channels supported by Production X.
            </p>
          </div>
          <button
            onClick={refreshData}
            disabled={isRefreshing}
            className="px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:text-gray-900 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh Status
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. Meta Lead Ads */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 hover:border-blue-300 transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-2xs">
                  <FacebookIcon className="w-5 h-5" />
                </div>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                    activeMetaConnections.length > 0
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}
                >
                  {activeMetaConnections.length > 0
                    ? `${activeMetaConnections.length} Connected Account${
                        activeMetaConnections.length > 1 ? 's' : ''
                      }`
                    : 'Not Connected'}
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-gray-900">Meta Lead Ads</h4>
                <p className="text-[11px] text-gray-500">Facebook & Instagram Lead Generation</p>
              </div>

              <p className="text-[12px] text-gray-600 leading-relaxed">
                Stream buyer submissions instantly from Facebook & Instagram lead forms directly into
                your development projects.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                <div className="flex justify-between">
                  <span>Connected Assets:</span>
                  <span className="font-semibold text-gray-900">
                    {activeMetaConnections.length > 0
                      ? `${totalConnectedPages} Pages • ${totalConnectedForms} Forms`
                      : '0 Assets'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Last Sync:</span>
                  <span className="text-gray-700">
                    {activeMetaConnections[0]?.last_sync_at
                      ? formatDate(activeMetaConnections[0].last_sync_at)
                      : 'Never'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Health:</span>
                  <span className="text-emerald-700 font-medium">
                    {activeMetaConnections.length > 0 ? 'Active & Ready' : 'Ready to Connect'}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              {activeMetaConnections.length > 0 ? (
                <button
                  onClick={() => setSelectedConnection(activeMetaConnections[0])}
                  className="w-full py-2 px-3 text-[12px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-colors flex items-center justify-center gap-1.5"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  Manage Connection & Mappings
                </button>
              ) : canManage ? (
                <button
                  onClick={() => setIsWizardOpen(true)}
                  className="w-full py-2 px-3 text-[12px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Connect Meta Account
                </button>
              ) : (
                <div className="text-[11px] text-center text-gray-400 py-1.5">
                  Manager access required to connect
                </div>
              )}
            </div>
          </div>

          {/* 2. Google Ads */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 hover:border-gray-300 transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shadow-2xs">
                  <Search className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                  Coming Soon (Stage 4B)
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-gray-900">Google Ads</h4>
                <p className="text-[11px] text-gray-500">Search, Display & YouTube Lead Forms</p>
              </div>

              <p className="text-[12px] text-gray-600 leading-relaxed">
                Receive lead form submissions directly from Google Search campaigns, Display ads, and
                Performance Max extensions.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                <div className="flex justify-between">
                  <span>Connected Assets:</span>
                  <span className="text-gray-400">None</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Sync:</span>
                  <span className="text-gray-400">Never</span>
                </div>
                <div className="flex justify-between">
                  <span>Architecture:</span>
                  <span className="text-amber-700 font-medium">Readiness Validated</span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                disabled
                className="w-full py-2 px-3 text-[12px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-xl cursor-not-allowed text-center"
              >
                Available in Next Stage
              </button>
            </div>
          </div>

          {/* 3. Website Enquiry Webhooks */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 hover:border-gray-300 transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shadow-2xs">
                  <Globe className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  Readiness Mode
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-gray-900">Website Enquiries</h4>
                <p className="text-[11px] text-gray-500">Project Microsites & Interactive Floorplans</p>
              </div>

              <p className="text-[12px] text-gray-600 leading-relaxed">
                Connect official developer websites, project landing pages, and interactive floorplan
                widgets to receive enquiries.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                <div className="flex justify-between">
                  <span>Inbound Format:</span>
                  <span className="text-gray-900 font-medium">REST Lead API</span>
                </div>
                <div className="flex justify-between">
                  <span>Routing:</span>
                  <span className="text-gray-700">Project Slug / URL</span>
                </div>
                <div className="flex justify-between">
                  <span>Health:</span>
                  <span className="text-emerald-700 font-medium">Ready for Ingestion</span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                disabled
                className="w-full py-2 px-3 text-[12px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-xl cursor-not-allowed text-center"
              >
                Endpoint Ready in Stage 4B
              </button>
            </div>
          </div>

          {/* 4. WhatsApp Business */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 hover:border-gray-300 transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-2xs">
                  <MessageCircle className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                  Coming Soon
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-gray-900">WhatsApp Business</h4>
                <p className="text-[11px] text-gray-500">Click-to-WhatsApp Ads & Catalogues</p>
              </div>

              <p className="text-[12px] text-gray-600 leading-relaxed">
                Capture prospective home buyers who reach out via Click-to-WhatsApp ads or property
                brochure download chats.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                <div className="flex justify-between">
                  <span>Connected Numbers:</span>
                  <span className="text-gray-400">None</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Sync:</span>
                  <span className="text-gray-400">Never</span>
                </div>
                <div className="flex justify-between">
                  <span>Architecture:</span>
                  <span className="text-gray-700 font-medium">Cloud API Schema Ready</span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                disabled
                className="w-full py-2 px-3 text-[12px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-xl cursor-not-allowed text-center"
              >
                Available in Next Stage
              </button>
            </div>
          </div>

          {/* 5. Property Portals */}
          <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4 hover:border-gray-300 transition-all shadow-2xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shadow-2xs">
                  <Building className="w-5 h-5" />
                </div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600 border border-gray-200">
                  Enterprise Ready
                </span>
              </div>

              <div>
                <h4 className="text-[14px] font-bold text-gray-900">Property Portals</h4>
                <p className="text-[11px] text-gray-500">99acres, Magicbricks & Housing.com</p>
              </div>

              <p className="text-[12px] text-gray-600 leading-relaxed">
                Ingest buyer enquiries from prominent Indian real estate portals via official developer
                syndication agreements.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-gray-100 text-[11px] text-gray-500">
                <div className="flex justify-between">
                  <span>Feeds Supported:</span>
                  <span className="text-gray-700 font-medium">3 Portals</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Sync:</span>
                  <span className="text-gray-400">Never</span>
                </div>
                <div className="flex justify-between">
                  <span>Status:</span>
                  <span className="text-gray-700 font-medium">Enterprise Agreement Pending</span>
                </div>
              </div>
            </div>

            <div className="pt-3">
              <button
                disabled
                className="w-full py-2 px-3 text-[12px] font-medium text-gray-400 bg-gray-50 border border-gray-200 rounded-xl cursor-not-allowed text-center"
              >
                Subject to Portal API
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: CONNECTED ACCOUNTS & CONNECTION MANAGEMENT */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-[16px] font-bold text-gray-900">Connected Accounts & Assets</h3>
            <p className="text-[12px] text-gray-500">
              Active external connections authorized for {org.name}. Multiple advertising accounts and
              Pages are fully supported.
            </p>
          </div>
          {canManage && connections.length > 0 && (
            <button
              onClick={() => setIsWizardOpen(true)}
              className="px-3 py-1.5 text-[12px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Another Account
            </button>
          )}
        </div>

        {connections.length > 0 ? (
          <div className="grid grid-cols-1 gap-4">
            {connections.map((conn) => {
              const meta = (conn.metadata || {}) as Record<string, unknown>
              const pages = (meta.pages || []) as MetaPageAsset[]
              const isConnActive = conn.status === 'connected'
              const isConnError = conn.status === 'error'

              return (
                <div
                  key={conn.id}
                  className="bg-white border border-gray-200 rounded-2xl p-5 shadow-2xs hover:border-gray-300 transition-all space-y-4"
                >
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-2xs">
                        <FacebookIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-[15px] font-bold text-gray-900">{conn.name}</h4>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
                              isConnActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isConnError
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : 'bg-gray-100 text-gray-600 border-gray-200'
                            }`}
                          >
                            {isConnActive ? 'Active' : isConnError ? 'Attention Needed' : 'Disabled'}
                          </span>
                        </div>
                        <p className="text-[12px] text-gray-500">
                          External ID: {conn.external_account_id || 'Primary Profile'} • Last
                          Synchronized: {formatDate(conn.last_sync_at)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedConnection(conn)}
                        className="px-3 py-1.5 text-[12px] font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-2xs"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        Manage Mappings ({conn.mappingsCount || 0})
                      </button>
                    </div>
                  </div>

                  {/* Connected Pages Pills */}
                  {pages.length > 0 && (
                    <div className="pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Authorized Pages:
                      </span>
                      {pages.map((p) => (
                        <span
                          key={p.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] bg-blue-50/70 text-blue-900 border border-blue-200/60 font-medium"
                        >
                          <FacebookIcon className="w-3 h-3 text-blue-600" />
                          {p.name}
                          <span className="text-[10px] text-blue-600 font-mono">
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
          <div className="bg-white border border-dashed border-gray-300 rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 mx-auto flex items-center justify-center shadow-2xs">
              <Plug className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-[15px] font-bold text-gray-900">No External Accounts Connected Yet</h4>
              <p className="text-[12px] text-gray-500">
                Connect your business Meta accounts to receive Facebook and Instagram lead form
                submissions directly into your development projects.
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setIsWizardOpen(true)}
                className="px-4 py-2 text-[13px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-2xs inline-flex items-center gap-2"
              >
                <FacebookIcon className="w-4 h-4" />
                Start Meta Connection
              </button>
            )}
          </div>
        )}
      </div>

      {/* SECTION 3: LIVE FORM-TO-PROJECT ROUTING SUMMARY */}
      <div className="space-y-4">
        <div>
          <h3 className="text-[16px] font-bold text-gray-900">Active Form Routing Overview</h3>
          <p className="text-[12px] text-gray-500">
            How incoming marketing form submissions are routed into specific CRM projects.
          </p>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
          <table className="w-full text-left text-[12px]">
            <thead className="bg-gray-50/80 border-b border-gray-200 text-gray-600 font-semibold">
              <tr>
                <th className="py-3 px-5">Lead Form / Identifier</th>
                <th className="py-3 px-4">Routing Type</th>
                <th className="py-3 px-4">Destination Project</th>
                <th className="py-3 px-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mappings.length > 0 ? (
                mappings.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3 px-5">
                      <p className="font-semibold text-gray-900">
                        {m.description || m.external_identifier_value}
                      </p>
                      <p className="text-[11px] text-gray-400 font-mono">
                        ID: {m.external_identifier_value}
                      </p>
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-700 font-medium">
                        {m.external_identifier_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-semibold text-gray-900">
                      {m.project?.name || 'Project Mapped'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3" />
                        Active Routing
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-gray-500">
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
    </div>
  )
}
